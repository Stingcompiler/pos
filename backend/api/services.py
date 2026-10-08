"""
طبقة الخدمات (Services) لعمليات المخزون والمبيعات.

كل دالة هنا تُعدّ نقطة الحقيقة الوحيدة لتعديل المخزون. تُنفَّذ داخل معاملة
ذرّية (`transaction.atomic`) مع أقفال صفوف (`select_for_update`) لمنع:

- الخصم/الإضافة الجزئية عند حدوث خطأ في منتصف العملية.
- سباقات التزامن (بيع نفس القطعة مرتين بشكل متزامن).
- الخصم المزدوج عند تأكيد طلب خارجي أكثر من مرة.

لا تستدعِ أي دالة هنا خارج معاملة ذرّية أو من داخل `save()`.
"""

import hashlib
import json
from collections import Counter
from datetime import datetime, time, timedelta
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.exceptions import ValidationError as ModelValidationError
from django.db import IntegrityError, transaction
from django.db.models import DecimalField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import (
    BankAccount,
    Customer,
    DailyClose,
    ExchangeRate,
    Expense,
    Invoice,
    InvoiceItem,
    Payment,
    PublicOrder,
    SaleReturn,
    SaleReturnItem,
    SiteSetting,
    SparePart,
    StockCount,
    StockMovement,
    SupplyDeal,
)
from .search import compact


class InventoryError(Exception):
    """خطأ منطقي في المخزون (كمية غير كافية، طلب ملغى، بيانات غير صحيحة)."""


class PaymentError(InventoryError):
    """خطأ في بيانات الدفع (رقم إشعار مكرر، تجاوز حد الائتمان، مبلغ غير صالح)."""


class IdempotencyConflict(Exception):
    """مفتاح إعادة المحاولة استُخدم سابقاً لعملية بيع بمحتوى مختلف."""


class PriceChanged(PaymentError):
    """الإجمالي في الخادم يختلف عمّا عرضته الواجهة (تغيّر سعر أثناء البيع)."""

    def __init__(self, message, total):
        super().__init__(message)
        self.total = total


def ensure_day_open(day=None) -> None:
    """
    لا حركة نقد على يوم مُقفل: بيع أو تحصيل أو مرتجع بعد الإقفال لا يدخل أي
    صندوق متوقع (اليوم التالي يبدأ بالنقد المعدود)، فيضيع أثره بصمت.
    """
    day = day or timezone.localdate()
    if DailyClose.objects.filter(date=day).exists():
        raise PaymentError(
            f'يومية {day} مُقفلة. اطلب من المدير إعادة فتحها لتسجيل عمليات نقدية جديدة اليوم.'
        )


# ─────────────────────────────────────────────────────────────────────────────
# العمليات الأساسية على المخزون
# ─────────────────────────────────────────────────────────────────────────────

def _lock_part(part_id: int) -> SparePart:
    """إرجاع قطعة الغيار مع قفل صفّها — يجب استدعاؤها داخل معاملة ذرّية."""
    return SparePart.objects.select_for_update().get(pk=part_id)


def _lock_parts(part_ids) -> dict:
    """
    قفل عدة قطع بترتيب ثابت (تصاعدي حسب المعرّف) وإرجاعها كقاموس.

    نسخة واحدة لكل قطعة: تكرار الصنف في الطلب نفسه كان يقرأ نسختين مستقلتين
    من الرصيد نفسه، فتكتب كل منهما خصمها فوق الأخرى. والترتيب الثابت يمنع
    الجمود (deadlock) بين عمليتين تقفلان القطع نفسها بترتيب مختلف.
    """
    ids = sorted(set(part_ids))
    parts = {
        part.pk: part
        for part in SparePart.objects.select_for_update().filter(pk__in=ids).order_by('pk')
    }
    missing = [part_id for part_id in ids if part_id not in parts]
    if missing:
        raise InventoryError(f"قطع غيار غير موجودة: {missing}.")
    return parts


def _check_total_demand(parts: dict, demand: Counter, message: str) -> None:
    """التحقق من كفاية الرصيد لمجموع الكمية المطلوبة من كل قطعة قبل أي خصم."""
    for part_id, quantity in demand.items():
        part = parts[part_id]
        if part.stock_quantity < quantity:
            raise InventoryError(
                f"الكمية المتوفرة من '{part.name}' غير كافية{message}. "
                f"المتوفر: {part.stock_quantity} والمطلوب: {quantity}."
            )


def _record_movement(
    part: SparePart,
    change: int,
    reason: str,
    *,
    reference: str = '',
    unit_cost=None,
    user=None,
) -> StockMovement:
    """تسجيل حركة مخزون بعد تعديل الكمية مباشرة."""
    return StockMovement.objects.create(
        spare_part=part,
        change=change,
        quantity_after=part.stock_quantity,
        reason=reason,
        reference=reference or '',
        unit_cost=unit_cost,
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )


def decrease_stock(
    part: SparePart,
    quantity: int,
    reason: str,
    *,
    reference: str = '',
    unit_cost=None,
    user=None,
) -> SparePart:
    """إنقاص كمية المخزون بشكل ذرّي مع التحقق من التوفر وتسجيل الحركة."""
    if quantity <= 0:
        raise InventoryError('الكمية يجب أن تكون أكبر من صفر.')

    if part.stock_quantity < quantity:
        raise InventoryError(
            f"الكمية المتوفرة من '{part.name}' غير كافية. "
            f"المتوفر: {part.stock_quantity} والمطلوب: {quantity}."
        )

    part.stock_quantity -= quantity
    part.save(update_fields=['stock_quantity'])
    _record_movement(part, -quantity, reason, reference=reference, unit_cost=unit_cost, user=user)
    return part


def increase_stock(
    part: SparePart,
    quantity: int,
    reason: str,
    *,
    reference: str = '',
    unit_cost=None,
    user=None,
) -> SparePart:
    """زيادة كمية المخزون بشكل ذرّي مع تسجيل الحركة."""
    _add_stock(part, quantity, reason, reference=reference, unit_cost=unit_cost, user=user)
    return part


def _add_stock(part, quantity, reason, *, reference='', unit_cost=None, user=None) -> StockMovement:
    """زيادة الكمية وإرجاع الحركة المسجّلة (يحتاجها التوريد لربطها بمستنده)."""
    if quantity <= 0:
        raise InventoryError('الكمية يجب أن تكون أكبر من صفر.')

    part.stock_quantity += quantity
    part.save(update_fields=['stock_quantity'])
    return _record_movement(part, quantity, reason, reference=reference, unit_cost=unit_cost, user=user)


def _apply_weighted_average_cost(part: SparePart, quantity: int, unit_cost: Decimal) -> None:
    """
    تحديث متوسط تكلفة القطعة بطريقة المتوسط المرجّح.

    الاعتماد على آخر سعر شراء فقط (السلوك القديم) يُفسد تقارير الربح؛
    المتوسط المرجّح يعكس التكلفة الحقيقية للمخزون الحالي.
    """
    previous_qty = part.stock_quantity
    previous_cost = part.purchase_price or Decimal('0')
    total_qty = previous_qty + quantity
    if total_qty <= 0:
        return
    new_cost = ((previous_qty * previous_cost) + (quantity * unit_cost)) / total_qty
    part.purchase_price = new_cost.quantize(Decimal('0.01'))
    part.save(update_fields=['purchase_price'])


# ─────────────────────────────────────────────────────────────────────────────
# إنشاء فاتورة بيع (نقطة البيع)
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# المدفوعات والحسابات الآجلة
# ─────────────────────────────────────────────────────────────────────────────

def normalize_reference(reference) -> str:
    """الصيغة الموحّدة لرقم إشعار التحويل: بلا مسافات أو رموز، وبحروف كبيرة."""
    return compact(reference).upper()


def _ensure_reference_unused(reference_key: str) -> None:
    """رقم الإشعار لا يُقبل مرتين؛ إعادة استخدام صورة إشعار قديمة احتيال معروف."""
    if not reference_key:
        return
    used = (
        Payment.objects.filter(reference_key=reference_key)
        .select_related('invoice', 'customer')
        .first()
    )
    if used is not None:
        where = f"فاتورة #{used.invoice_id}" if used.invoice_id else f"دفعة #{used.pk}"
        raise PaymentError(
            f"رقم الإشعار '{used.reference_id}' مستخدم مسبقاً في {where} "
            f"بتاريخ {timezone.localtime(used.created_at):%Y-%m-%d}. تحقّق من الإشعار."
        )


def _prepare_transfer(spec: dict, *, require_sender: bool = True) -> dict:
    """
    التحقق من بيانات تحويل بنكي وتجهيزها (اسم البنك ورقم الإشعار الموحّد).

    `require_sender=False` للتحويلات الصادرة من المحل (ردّ مبلغ مرتجع).
    """
    bank_account = spec.get('bank_account')
    if bank_account is not None and not isinstance(bank_account, BankAccount):
        bank_account = BankAccount.objects.filter(pk=bank_account).first()
        if bank_account is None:
            raise PaymentError('الحساب البنكي غير موجود.')
    bank_name = (spec.get('bank_name') or '').strip() or (bank_account.name if bank_account else '')
    reference_id = (spec.get('reference_id') or '').strip()
    sender = (spec.get('sender_account_number') or '').strip()
    required = [(bank_name, 'اسم البنك'), (reference_id, 'رقم الإشعار')]
    if require_sender:
        required.append((sender, 'رقم حساب المرسل'))
    missing = [label for value, label in required if not value]
    if missing:
        raise PaymentError('حقول الدفع البنكي التالية مطلوبة: ' + '، '.join(missing))
    return {
        'bank_account': bank_account,
        'bank_name': bank_name,
        'reference_id': reference_id,
        'reference_key': normalize_reference(reference_id),
        'sender_account_number': sender,
    }


def customer_balance(customer) -> Decimal:
    """
    رصيد العميل المدين: مجموع الآجل على فواتيره، ناقص ما حُصّل منه، ناقص
    المرتجعات التي خُصمت من حسابه. سالب = رصيد لصالح العميل.
    """
    credit = Invoice.objects.filter(customer=customer).aggregate(v=Sum('credit_amount'))['v']
    collected = Payment.objects.filter(
        customer=customer, kind=Payment.Kind.COLLECTION,
    ).aggregate(v=Sum('amount'))['v']
    returned = SaleReturn.objects.filter(
        invoice__customer=customer, refund_method=SaleReturn.RefundMethod.ACCOUNT,
    ).aggregate(v=Sum('total_amount'))['v']
    return (credit or Decimal('0')) - (collected or Decimal('0')) - (returned or Decimal('0'))


def annotate_customer_balances(queryset):
    """رصيد كل عميل كحقل annotated_balance في استعلام واحد (لقوائم العملاء)."""
    zero = Value(Decimal('0'), output_field=DecimalField(max_digits=14, decimal_places=2))
    credit = Invoice.objects.filter(customer=OuterRef('pk')).values('customer').annotate(
        v=Sum('credit_amount')).values('v')
    collected = Payment.objects.filter(
        customer=OuterRef('pk'), kind=Payment.Kind.COLLECTION,
    ).values('customer').annotate(v=Sum('amount')).values('v')
    returned = SaleReturn.objects.filter(
        invoice__customer=OuterRef('pk'), refund_method=SaleReturn.RefundMethod.ACCOUNT,
    ).values('invoice__customer').annotate(v=Sum('total_amount')).values('v')
    return queryset.annotate(
        annotated_balance=(
            Coalesce(Subquery(credit), zero)
            - Coalesce(Subquery(collected), zero)
            - Coalesce(Subquery(returned), zero)
        ),
    )


def total_outstanding_credit() -> Decimal:
    """
    مجموع ديون العملاء القائمة على المحل: الأرصدة المدينة وحدها. رصيد دائن
    لعميل (مرتجع لحسابه) لا يُطرح من دين عميل آخر.
    """
    total = annotate_customer_balances(Customer.objects.all()).filter(
        annotated_balance__gt=0,
    ).aggregate(v=Sum('annotated_balance'))['v']
    return total or Decimal('0')


def customer_statement(customer) -> list:
    """كشف حساب العميل: الآجل عليه، والتحصيل والمرتجعات له، مع الرصيد الجاري."""
    entries = []
    for invoice in Invoice.objects.filter(customer=customer, credit_amount__gt=0):
        entries.append({
            'date': invoice.created_at, 'type': 'invoice', 'reference': f'فاتورة #{invoice.pk}',
            'invoice': invoice.pk, 'debit': invoice.credit_amount, 'credit': Decimal('0'),
        })
    for payment in Payment.objects.filter(customer=customer, kind=Payment.Kind.COLLECTION):
        label = 'تحصيل نقدي' if payment.method == Payment.Method.CASH else f'تحويل {payment.reference_id or ""}'
        entries.append({
            'date': payment.created_at, 'type': 'collection', 'reference': label.strip(),
            'invoice': None, 'debit': Decimal('0'), 'credit': payment.amount,
        })
    for sale_return in SaleReturn.objects.filter(
        invoice__customer=customer, refund_method=SaleReturn.RefundMethod.ACCOUNT,
    ):
        entries.append({
            'date': sale_return.created_at, 'type': 'return',
            'reference': f'مرتجع #{sale_return.pk} من فاتورة #{sale_return.invoice_id}',
            'invoice': sale_return.invoice_id, 'debit': Decimal('0'), 'credit': sale_return.total_amount,
        })
    entries.sort(key=lambda entry: entry['date'])
    balance = Decimal('0')
    for entry in entries:
        balance += entry['debit'] - entry['credit']
        entry['balance'] = balance
    return entries


def customer_discount_percent(customer, site=None) -> Decimal:
    """خصم العميل: الخاص به إن وُجد، وإلا خصم نوعه (ورشة/جملة) من الإعدادات."""
    if customer is None:
        return Decimal('0')
    if customer.discount_percent is not None:
        return min(customer.discount_percent, Decimal('100'))
    site = site or SiteSetting.load()
    by_type = {
        Customer.CustomerType.WORKSHOP: site.workshop_discount_percent,
        Customer.CustomerType.WHOLESALE: site.wholesale_discount_percent,
    }
    return min(by_type.get(customer.customer_type, Decimal('0')), Decimal('100'))


def _discounted(price: Decimal, discount: Decimal) -> Decimal:
    if not discount:
        return price
    return (price * (Decimal('100') - discount) / Decimal('100')).quantize(Decimal('0.01'))


def _check_credit_limit(customer, extra_credit: Decimal) -> None:
    """البيع الآجل لعميل مسموح له، دون تجاوز حدّه (يُستدعى والعميل مقفل)."""
    if extra_credit <= 0:
        return
    if customer is None:
        raise PaymentError('البيع الآجل يتطلب اختيار العميل.')
    balance = customer_balance(customer)
    if balance + extra_credit <= 0:
        # رصيد دائن للعميل (من مرتجع خُصم لحسابه) يغطي المبلغ: يُستخدم دون حد ائتمان.
        return
    if customer.credit_limit <= 0:
        raise PaymentError(
            f"العميل '{customer.name}' غير مسموح له بالبيع الآجل. حدّد له حد ائتمان أولاً."
        )
    if balance + extra_credit > customer.credit_limit:
        raise PaymentError(
            f"تجاوز حد الائتمان للعميل '{customer.name}': الرصيد الحالي {balance}، "
            f"والآجل الجديد {extra_credit}، والحد {customer.credit_limit}."
        )


def record_collection(
    *, customer, method, amount, user, bank_account=None, bank_name='',
    reference_id=None, sender_account_number='', note='',
) -> Payment:
    """تحصيل دفعة من دين عميل (نقداً أو تحويلاً)."""
    amount = Decimal(str(amount))
    if not amount.is_finite() or amount <= 0:
        raise PaymentError('مبلغ التحصيل يجب أن يكون أكبر من صفر.')
    ensure_day_open()
    transfer = {}
    if method == Payment.Method.BANK:
        transfer = _prepare_transfer({
            'bank_account': bank_account, 'bank_name': bank_name,
            'reference_id': reference_id, 'sender_account_number': sender_account_number,
        })
    elif method != Payment.Method.CASH:
        raise PaymentError('طريقة الدفع غير صالحة.')

    try:
        with transaction.atomic():
            customer = Customer.objects.select_for_update().get(pk=customer.pk)
            balance = customer_balance(customer)
            if amount > balance:
                raise PaymentError(
                    f"المبلغ ({amount}) أكبر من رصيد العميل المستحق ({balance})."
                )
            _ensure_reference_unused(transfer.get('reference_key'))
            return Payment.objects.create(
                kind=Payment.Kind.COLLECTION, method=method, amount=amount,
                customer=customer, created_by=user, note=note or '', **transfer,
            )
    except IntegrityError:
        # الإشعار نفسه سُجّل في عملية متزامنة بين الفحص والحفظ.
        _ensure_reference_unused(transfer.get('reference_key'))
        raise


# ─────────────────────────────────────────────────────────────────────────────
# إنشاء فاتورة بيع (نقطة البيع)
# ─────────────────────────────────────────────────────────────────────────────

def _invoice_fingerprint(*, cashier, lines, customer, payments, currency) -> str:
    """بصمة محتوى عملية البيع، لمقارنة إعادة المحاولة بالطلب الأصلي."""
    payload = {
        'cashier': cashier.pk,
        'customer': getattr(customer, 'pk', customer),
        'currency': currency,
        'lines': [
            [part_id, quantity, None if price is None else str(price.quantize(Decimal('0.01')))]
            for part_id, quantity, price in lines
        ],
        'payments': [
            [
                spec['method'],
                None if spec['amount'] is None else str(spec['amount'].quantize(Decimal('0.01'))),
                getattr(spec.get('bank_account'), 'pk', None),
                spec.get('bank_name', ''),
                spec.get('reference_key', ''),
                spec.get('sender_account_number', ''),
            ]
            for spec in payments
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def _replayed_invoice(cashier, idempotency_key: str, fingerprint: str):
    """الفاتورة التي أنشأها المفتاح نفسه سابقاً، أو None إن لم يُستخدم بعد."""
    invoice = Invoice.objects.filter(cashier=cashier, idempotency_key=idempotency_key).first()
    if invoice is None:
        return None
    if invoice.request_fingerprint != fingerprint:
        raise IdempotencyConflict(
            'مفتاح إعادة المحاولة استُخدم سابقاً لعملية بيع مختلفة.'
        )
    invoice.idempotent_replay = True
    return invoice


def _prepare_payment_specs(payment_method, payments, legacy_bank) -> list:
    """
    توحيد طريقة الدفع إلى قائمة دفعات: {'method', 'amount' (None = كامل الباقي), ...}.

    الواجهات القديمة ترسل payment_method وحقول البنك فقط؛ الجديدة ترسل قائمة
    payments لدفع مختلط أو جزئي. قائمة فارغة = البيع كله آجل.
    """
    if payments is None:
        if payment_method == Invoice.PaymentMethod.CASH:
            return [{'method': Payment.Method.CASH, 'amount': None}]
        if payment_method == Invoice.PaymentMethod.BANK:
            return [{'method': Payment.Method.BANK, 'amount': None, **_prepare_transfer(legacy_bank)}]
        if payment_method == Invoice.PaymentMethod.CREDIT:
            return []
        raise PaymentError('الدفع المختلط يتطلب تفاصيل الدفعات.')

    specs = []
    for raw in payments:
        method = raw.get('method')
        amount = Decimal(str(raw.get('amount') or '0'))
        if amount <= 0:
            raise PaymentError('مبلغ كل دفعة يجب أن يكون أكبر من صفر.')
        if method == Payment.Method.CASH:
            specs.append({'method': method, 'amount': amount})
        elif method == Payment.Method.BANK:
            specs.append({'method': method, 'amount': amount, **_prepare_transfer(raw)})
        else:
            raise PaymentError('طريقة الدفع غير صالحة.')

    keys = [spec['reference_key'] for spec in specs if spec.get('reference_key')]
    if len(keys) != len(set(keys)):
        raise PaymentError('رقم الإشعار نفسه مكرر في أكثر من دفعة.')
    return specs


def _summary_payment_method(specs, credit_amount) -> str:
    if credit_amount > 0:
        return Invoice.PaymentMethod.CREDIT
    methods = {spec['method'] for spec in specs}
    # «تحويل بنكي» لتحويل واحد فقط: حقول البنك على الفاتورة تخص تحويلاً واحداً،
    # والدفع بعدة تحويلات (حدود التحويل الواحد في التطبيقات البنكية) مختلط.
    if methods == {Payment.Method.BANK} and len(specs) == 1:
        return Invoice.PaymentMethod.BANK
    if methods == {Payment.Method.CASH}:
        return Invoice.PaymentMethod.CASH
    return Invoice.PaymentMethod.MIXED


def create_invoice(
    *,
    cashier,
    items,
    customer=None,
    payment_method: str = Invoice.PaymentMethod.CASH,
    bank_name=None,
    reference_id=None,
    sender_account_number=None,
    payments=None,
    currency=None,
    allow_price_override: bool = False,
    idempotency_key=None,
    expected_total=None,
) -> Invoice:
    """
    إنشاء فاتورة بيع مع خصم المخزون وتسجيل الدفعات بشكل ذرّي.

    `items`: قائمة قواميس بالشكل {'spare_part': <SparePart|id>, 'quantity': int,
    'unit_price': Decimal اختياري}. يُستخدم سعر البيع من الخادم افتراضياً،
    مخصوماً منه خصم العميل (ورشة/جملة/خاص)؛ لا يُسمح بتجاوز السعر إلا عند
    تمرير `allow_price_override=True` من طبقة الصلاحيات (مدير/مشرف).

    `payments`: دفعات البيع [{'method': 'cash'|'bank', 'amount', ...بيانات
    التحويل}]. ما لم يُدفع يصبح ديناً على العميل ضمن حد ائتمانه. بدونها تُستخدم
    `payment_method` (cash/bank/credit) لكامل المبلغ كما في الواجهات القديمة.

    `idempotency_key`: عند تمريره، تُعاد الفاتورة الأصلية لأي تكرار للطلب
    نفسه (متتابع أو متزامن) دون خصم جديد، وتُعلَّم بـ `idempotent_replay`.
    إعادة استخدامه بمحتوى مختلف ترفع IdempotencyConflict.

    `expected_total`: الإجمالي الذي عرضته الواجهة وقبض الكاشير على أساسه. إن
    تغيّر سعر بين البحث والبيع يُرفض البيع (PriceChanged) بدل أن يصبح الفرق
    ديناً صامتاً على العميل أو رفضاً غامضاً.
    """
    if not items:
        raise InventoryError('لا يمكن إنشاء فاتورة بدون بنود.')

    # النظام يعمل بعملة المؤسسة وحدها إلى أن يُدعم سعر الصرف؛ جمع فواتير
    # بعملات مختلفة في رقم واحد يُفسد التقارير.
    currency = currency or settings.BASE_CURRENCY
    if currency != settings.BASE_CURRENCY:
        raise InventoryError(
            f"العملة '{currency}' غير مدعومة. عملة النظام: {settings.BASE_CURRENCY}."
        )

    # التحقق من تفاصيل الدفع قبل فتح أي قفل.
    specs = _prepare_payment_specs(payment_method, payments, {
        'bank_name': bank_name, 'reference_id': reference_id,
        'sender_account_number': sender_account_number,
    })

    # (معرّف القطعة، الكمية، السعر المطلوب إن كان التجاوز مسموحاً).
    lines = []
    for raw_item in items:
        part = raw_item['spare_part']
        quantity = int(raw_item['quantity'])
        if quantity <= 0:
            raise InventoryError('كمية البند يجب أن تكون أكبر من صفر.')
        requested_price = raw_item.get('unit_price')
        if not allow_price_override or requested_price in (None, ''):
            requested_price = None
        else:
            requested_price = Decimal(str(requested_price))
        lines.append((part.pk if isinstance(part, SparePart) else int(part), quantity, requested_price))

    fingerprint = ''
    if idempotency_key:
        # الإعادة لا تمر بفحص اليوم المُقفل: البيع نفسه سُجّل قبل الإقفال.
        fingerprint = _invoice_fingerprint(
            cashier=cashier, lines=lines, customer=customer, payments=specs, currency=currency,
        )
        replayed = _replayed_invoice(cashier, idempotency_key, fingerprint)
        if replayed is not None:
            return replayed

    ensure_day_open()
    try:
        with transaction.atomic():
            parts = _lock_parts(part_id for part_id, _, _ in lines)

            # إعادة الفحص بعد القفل: نسخة متزامنة من الطلب نفسه تنتظر هنا حتى
            # تلتزم الأولى، فترى فاتورتها بدل أن ترفض البيع لنفاد الرصيد.
            if idempotency_key:
                replayed = _replayed_invoice(cashier, idempotency_key, fingerprint)
                if replayed is not None:
                    return replayed

            demand = Counter()
            for part_id, quantity, _ in lines:
                demand[part_id] += quantity
            _check_total_demand(parts, demand, '')

            if customer is not None:
                customer = Customer.objects.select_for_update().get(pk=getattr(customer, 'pk', customer))
            discount = customer_discount_percent(customer)

            prepared = []
            for part_id, quantity, requested_price in lines:
                part = parts[part_id]
                if requested_price is not None and requested_price > 0:
                    unit_price = requested_price
                else:
                    unit_price = _discounted(part.selling_price, discount)

                prepared.append({
                    'part': part,
                    'quantity': quantity,
                    'unit_price': unit_price,
                    'cost_price': part.purchase_price or Decimal('0'),
                    'subtotal': unit_price * quantity,
                })

            total_amount = sum((row['subtotal'] for row in prepared), Decimal('0'))
            if expected_total is not None and abs(Decimal(str(expected_total)) - total_amount) > Decimal('0.01') * len(lines):
                raise PriceChanged(
                    f"تغيّر سعر في السلة: الإجمالي الآن {total_amount} بدل {expected_total}. "
                    "راجع الأسعار ثم أكمل البيع.",
                    total_amount,
                )

            for spec in specs:
                if spec['amount'] is None:
                    spec['amount'] = total_amount
            paid_amount = sum((spec['amount'] for spec in specs), Decimal('0'))
            if paid_amount > total_amount:
                raise PaymentError(
                    f"مجموع الدفعات ({paid_amount}) أكبر من قيمة الفاتورة ({total_amount})."
                )
            credit_amount = total_amount - paid_amount
            _check_credit_limit(customer, credit_amount)
            for spec in specs:
                _ensure_reference_unused(spec.get('reference_key'))

            # حقول البنك على الفاتورة نفسها تُملأ عند تحويل واحد (للعرض والتوافق).
            bank_specs = [spec for spec in specs if spec['method'] == Payment.Method.BANK]
            single_bank = bank_specs[0] if len(bank_specs) == 1 else {}

            invoice = Invoice.objects.create(
                cashier=cashier,
                customer=customer,
                total_amount=total_amount,
                paid_amount=paid_amount,
                credit_amount=credit_amount,
                payment_method=_summary_payment_method(specs, credit_amount),
                currency=currency,
                bank_name=single_bank.get('bank_name'),
                reference_id=single_bank.get('reference_id'),
                sender_account_number=single_bank.get('sender_account_number'),
                idempotency_key=idempotency_key or None,
                request_fingerprint=fingerprint,
            )

            for row in prepared:
                # النسخة المقفلة نفسها لكل تكرار للصنف: الخصم الثاني يبدأ من
                # الرصيد الذي تركه الأول.
                part = row['part']
                decrease_stock(
                    part,
                    row['quantity'],
                    StockMovement.Reason.SALE,
                    reference=f"Invoice #{invoice.pk}",
                    unit_cost=row['cost_price'],
                    user=cashier,
                )
                InvoiceItem.objects.create(
                    invoice=invoice,
                    spare_part=part,
                    quantity=row['quantity'],
                    unit_price=row['unit_price'],
                    cost_price=row['cost_price'],
                    subtotal=row['subtotal'],
                )

            for spec in specs:
                Payment.objects.create(
                    kind=Payment.Kind.SALE,
                    method=spec['method'],
                    amount=spec['amount'],
                    invoice=invoice,
                    customer=customer,
                    bank_account=spec.get('bank_account'),
                    bank_name=spec.get('bank_name', ''),
                    reference_id=spec.get('reference_id'),
                    reference_key=spec.get('reference_key') or None,
                    sender_account_number=spec.get('sender_account_number', ''),
                    created_by=cashier,
                )
    except ModelValidationError as exc:
        # تحقق النموذج (حقول البنك مثلاً) خطأ إدخال لا خطأ خادم.
        raise PaymentError(' '.join(exc.messages)) from exc
    except IntegrityError:
        # القيد الفريد على المفتاح هو خط الدفاع الأخير أمام سباق التكرار،
        # وقيد رقم الإشعار أمام تحويل واحد سُجّل في عمليتين متزامنتين.
        replayed = (
            _replayed_invoice(cashier, idempotency_key, fingerprint)
            if idempotency_key else None
        )
        if replayed is not None:
            return replayed
        for spec in specs:
            _ensure_reference_unused(spec.get('reference_key'))
        raise

    invoice.idempotent_replay = False
    return invoice


# ─────────────────────────────────────────────────────────────────────────────
# الطلبات الخارجية (المتجر الإلكتروني)
# ─────────────────────────────────────────────────────────────────────────────

def confirm_public_order(order: PublicOrder, *, user=None) -> PublicOrder:
    """
    تأكيد طلب خارجي وخصم مخزونه بشكل ذرّي.

    العملية آمنة ضد التكرار: إذا كان الطلب مؤكداً مسبقاً فلا يُخصم مرة أخرى.
    """
    with transaction.atomic():
        order = PublicOrder.objects.select_for_update().get(pk=order.pk)

        # المبيع تجاوز التأكيد (خُصم مخزونه بفاتورته)؛ إعادة تأكيده خصم مزدوج.
        if order.status in (PublicOrder.Status.CONFIRMED, PublicOrder.Status.COMPLETED):
            return order
        if order.status == PublicOrder.Status.CANCELLED:
            raise InventoryError('لا يمكن تأكيد طلب ملغي.')

        rows = list(order.items.select_related('spare_part').all())
        if not rows:
            raise InventoryError('لا يمكن تأكيد طلب بدون بنود.')

        # التحقق من توفر مجموع كل صنف قبل أي خصم (يمنع الخصم الجزئي).
        locked_parts = _lock_parts(row.spare_part_id for row in rows)
        demand = Counter()
        for row in rows:
            demand[row.spare_part_id] += row.quantity
        _check_total_demand(locked_parts, demand, ' لعملية التأكيد')

        for row in rows:
            decrease_stock(
                locked_parts[row.spare_part_id],
                row.quantity,
                StockMovement.Reason.PUBLIC_ORDER_CONFIRMED,
                reference=f"Order #{order.pk}",
                user=user,
            )

        order.status = PublicOrder.Status.CONFIRMED
        order.save(update_fields=['status'])

    return order


def cancel_public_order(order: PublicOrder, *, user=None) -> PublicOrder:
    """
    إلغاء طلب خارجي، وإرجاع الكميات للمخزون إن كان قد تأكّد مسبقاً.

    هذا يمنع «فقدان» المخزون عند إلغاء طلب مؤكد (خلل في السلوك القديم).
    """
    with transaction.atomic():
        order = PublicOrder.objects.select_for_update().get(pk=order.pk)

        if order.status == PublicOrder.Status.CANCELLED:
            return order
        if order.status == PublicOrder.Status.COMPLETED:
            raise InventoryError(
                f'الطلب بِيع بالفاتورة #{order.invoice_id}؛ لإرجاعه سجّل مرتجعاً على الفاتورة.'
            )

        was_confirmed = order.status == PublicOrder.Status.CONFIRMED

        if was_confirmed:
            rows = list(order.items.select_related('spare_part').all())
            locked_parts = _lock_parts(row.spare_part_id for row in rows)
            for row in rows:
                increase_stock(
                    locked_parts[row.spare_part_id],
                    row.quantity,
                    StockMovement.Reason.PUBLIC_ORDER_CANCELLED,
                    reference=f"Order #{order.pk}",
                    user=user,
                )

        order.status = PublicOrder.Status.CANCELLED
        order.save(update_fields=['status'])

    return order


def _customer_for_order(order: PublicOrder) -> Customer:
    """عميل الطلب برقم هاتفه، أو عميل جديد ببيانات الطلب (لكشف الحساب والآجل)."""
    phone = order.phone_number.strip()
    customer = Customer.objects.filter(phone=phone).order_by('pk').first()
    if customer is None:
        customer = Customer.objects.create(
            name=order.customer_name, phone=phone,
            email=order.email or None, location=order.location or None,
        )
    return customer


def invoice_public_order(order: PublicOrder, *, cashier, payments=None) -> Invoice:
    """
    بيع طلب المتجر عند استلام المبلغ: فاتورة بأسعار الطلب على عميله، وتُغلق الطلب.

    الطلب المؤكد حجز مخزونه عند التأكيد؛ يُحرَّر الحجز ثم تخصمه الفاتورة في
    المعاملة نفسها، فيظهر في سجل الحركات «تحرير حجز» ثم «بيع» بلا خصم مزدوج.
    تكرار الطلب (ضغطتان) يعيد الفاتورة نفسها ولا يبيع مرتين.
    """
    with transaction.atomic():
        order = PublicOrder.objects.select_for_update().get(pk=order.pk)
        if order.status == PublicOrder.Status.COMPLETED:
            invoice = order.invoice
            invoice.idempotent_replay = True
            return invoice
        if order.status == PublicOrder.Status.CANCELLED:
            raise InventoryError('لا يمكن بيع طلب ملغي.')

        rows = list(order.items.all())
        if not rows:
            raise InventoryError('لا يمكن بيع طلب بدون بنود.')

        if order.status == PublicOrder.Status.CONFIRMED:
            locked_parts = _lock_parts(row.spare_part_id for row in rows)
            for row in rows:
                increase_stock(
                    locked_parts[row.spare_part_id], row.quantity,
                    StockMovement.Reason.PUBLIC_ORDER_INVOICED,
                    reference=f"Order #{order.pk}", user=cashier,
                )

        # السعر الذي وُعد به الزبون عند الطلب، لا سعر اليوم.
        invoice = create_invoice(
            cashier=cashier,
            customer=_customer_for_order(order),
            items=[
                {'spare_part': row.spare_part_id, 'quantity': row.quantity, 'unit_price': row.unit_price}
                for row in rows
            ],
            payments=payments,
            allow_price_override=True,
        )
        order.invoice = invoice
        order.status = PublicOrder.Status.COMPLETED
        order.save(update_fields=['invoice', 'status'])
    return invoice


# ─────────────────────────────────────────────────────────────────────────────
# عمليات التوريد (Supply Deals)
# ─────────────────────────────────────────────────────────────────────────────

def create_supply_deal(
    *,
    supplier,
    spare_part,
    quantity_added: int,
    purchase_price=None,
    invoice_reference=None,
    user=None,
    currency=None,
    foreign_unit_cost=None,
    exchange_rate=None,
) -> SupplyDeal:
    """
    تسجيل عملية توريد: زيادة المخزون + تحديث متوسط التكلفة، بشكل ذرّي.

    الشراء بعملة أجنبية (`currency` + `foreign_unit_cost`) يُحوَّل إلى الجنيه
    بسعر الصرف الممرّر أو آخر سعر مسجّل، ويصبح تكلفة الاستبدال الجديدة للقطعة
    التي يُحسب منها سعر البيع عند تحديث الأسعار.
    """
    quantity_added = int(quantity_added)
    currency = (currency or '').strip().upper()
    if currency == settings.BASE_CURRENCY:
        currency = ''

    if currency:
        if foreign_unit_cost in (None, ''):
            raise InventoryError(f"أدخل تكلفة الوحدة بعملة الشراء ({currency}).")
        foreign_unit_cost = Decimal(str(foreign_unit_cost))
        if exchange_rate in (None, ''):
            exchange_rate = latest_exchange_rates().get(currency)
            if exchange_rate is None:
                raise InventoryError(
                    f"لا يوجد سعر صرف مسجّل للعملة {currency}. سجّله من الإعدادات أولاً."
                )
        exchange_rate = Decimal(str(exchange_rate))
        # تكلفة أجنبية صفرية تجعل إعادة التسعير تضع سعر البيع صفراً.
        if not (foreign_unit_cost.is_finite() and exchange_rate.is_finite()) \
                or foreign_unit_cost <= 0 or exchange_rate <= 0:
            raise InventoryError('التكلفة بعملة الشراء وسعر الصرف يجب أن يكونا أكبر من صفر.')
        purchase_price = (foreign_unit_cost * exchange_rate).quantize(Decimal('0.01'))
    else:
        foreign_unit_cost = exchange_rate = None
        if purchase_price in (None, ''):
            raise InventoryError('سعر الشراء مطلوب.')
        purchase_price = Decimal(str(purchase_price))

    if quantity_added <= 0:
        raise InventoryError('الكمية المضافة يجب أن تكون أكبر من صفر.')
    if purchase_price < 0:
        raise InventoryError('سعر الشراء لا يمكن أن يكون سالباً.')

    with transaction.atomic():
        part = _lock_part(spare_part.pk)
        deal = SupplyDeal.objects.create(
            supplier=supplier,
            spare_part=part,
            quantity_added=quantity_added,
            purchase_price=purchase_price,
            invoice_reference=invoice_reference,
            currency=currency,
            foreign_unit_cost=foreign_unit_cost,
            exchange_rate=exchange_rate,
            previous_purchase_price=part.purchase_price,
            previous_cost_currency=part.cost_currency,
            previous_foreign_cost=part.foreign_cost,
        )

        # يجب حساب متوسط التكلفة قبل زيادة الكمية (الوزن يعتمد على الكمية السابقة).
        _apply_weighted_average_cost(part, quantity_added, purchase_price)
        deal.restock_movement = _add_stock(
            part,
            quantity_added,
            StockMovement.Reason.RESTOCK,
            reference=invoice_reference or f"SupplyDeal #{deal.pk}",
            unit_cost=purchase_price,
            user=user,
        )
        deal.save(update_fields=['restock_movement'])

        if currency:
            part.cost_currency = currency
            part.foreign_cost = foreign_unit_cost
            part.save(update_fields=['cost_currency', 'foreign_cost'])

    return deal


def _supply_is_latest_movement(part: SparePart, deal: SupplyDeal) -> bool:
    """هل حركة إضافة التوريد ما زالت آخر حركة على القطعة؟"""
    latest = part.stock_movements.order_by('-pk').first()
    if latest is None:
        return False
    if deal.restock_movement_id is not None:
        return latest.pk == deal.restock_movement_id
    # توريد قديم بلا ربط بحركته: نتعرّف عليها بمرجعها وكميتها.
    return (
        latest.reason == StockMovement.Reason.RESTOCK
        and latest.change == deal.quantity_added
        and latest.reference == (deal.invoice_reference or f"SupplyDeal #{deal.pk}")
    )


def _cost_before_supply(part: SparePart, deal: SupplyDeal) -> Decimal:
    """متوسط التكلفة كما كان قبل التوريد."""
    if deal.previous_purchase_price is not None:
        return deal.previous_purchase_price
    # توريد قديم بلا لقطة: نطرح قيمة التوريد من قيمة الرصيد الحالي.
    remaining = part.stock_quantity - deal.quantity_added
    if remaining <= 0:
        return part.purchase_price
    current_value = part.stock_quantity * (part.purchase_price or Decimal('0'))
    value = current_value - deal.quantity_added * deal.purchase_price
    return max(value / remaining, Decimal('0')).quantize(Decimal('0.01'))


def delete_supply_deal(deal: SupplyDeal, *, user=None) -> None:
    """
    إلغاء عملية توريد: عكس الكمية والقيمة معاً، ثم حذف سجلّها.

    السياسة المحاسبية: الإلغاء مسموح فقط إن كانت حركة إضافة التوريد آخر حركة
    على القطعة، فيعود الرصيد ومتوسط التكلفة إلى ما كانا عليه قبله تماماً.
    بعد أي بيع أو توريد أو تسوية لاحقة دخلت الكمية في متوسط مرجّح استُخدم
    فعلاً في تكلفة المبيعات، فلا يوجد عكس صحيح بطرح بسيط؛ تُعالج تلك الحالة
    بتسوية معتمدة من المحاسب. حركة الإضافة الأصلية تبقى في السجل، وتُضاف
    حركة إلغاء تحمل تكلفة التوريد.
    """
    with transaction.atomic():
        deal = SupplyDeal.objects.select_for_update().get(pk=deal.pk)
        part = _lock_part(deal.spare_part_id)

        if not _supply_is_latest_movement(part, deal):
            raise InventoryError(
                f"لا يمكن إلغاء التوريد #{deal.pk}: سُجّلت على '{part.name}' "
                "حركات بعده (بيع أو توريد أو تسوية)، فإلغاؤه الآن يُفسد متوسط "
                "التكلفة. عالج الفرق بتسوية معتمدة."
            )

        if part.stock_quantity < deal.quantity_added:
            raise InventoryError(
                f"لا يمكن التراجع عن التوريد: الكمية المتوفرة من '{part.name}' "
                f"({part.stock_quantity}) أقل من كمية التوريد ({deal.quantity_added})."
            )

        restored_cost = _cost_before_supply(part, deal)
        decrease_stock(
            part,
            deal.quantity_added,
            StockMovement.Reason.RESTOCK_REVERSAL,
            reference=f"إلغاء توريد #{deal.pk}",
            unit_cost=deal.purchase_price,
            user=user,
        )
        part.purchase_price = restored_cost
        restored = ['purchase_price']
        if deal.currency:
            part.cost_currency = deal.previous_cost_currency
            part.foreign_cost = deal.previous_foreign_cost
            restored += ['cost_currency', 'foreign_cost']
        part.save(update_fields=restored)
        deal.delete()


# ─────────────────────────────────────────────────────────────────────────────
# التسويات اليدوية
# ─────────────────────────────────────────────────────────────────────────────

def adjust_stock(
    part_id: int,
    new_quantity: int,
    *,
    user=None,
    reference: str = 'تسوية يدوية',
) -> SparePart:
    """ضبط كمية المخزون يدوياً إلى قيمة محددة مع تسجيل الفرق."""
    new_quantity = int(new_quantity)
    if new_quantity < 0:
        raise InventoryError('الكمية لا يمكن أن تكون سالبة.')

    with transaction.atomic():
        part = _lock_part(part_id)
        delta = new_quantity - part.stock_quantity
        if delta == 0:
            return part

        part.stock_quantity = new_quantity
        part.save(update_fields=['stock_quantity'])
        _record_movement(
            part,
            delta,
            StockMovement.Reason.ADJUSTMENT,
            reference=reference,
            user=user,
        )

    return part


def set_opening_balance(part: SparePart, quantity: int, *, user=None) -> SparePart:
    """رصيد افتتاحي لقطعة جديدة: حركة موثّقة بتكلفة القطعة بدل كتابة الرقم مباشرة."""
    quantity = int(quantity)
    if quantity < 0:
        raise InventoryError('الرصيد الافتتاحي لا يمكن أن يكون سالباً.')
    if quantity == 0:
        return part
    with transaction.atomic():
        part = _lock_part(part.pk)
        _add_stock(
            part, quantity, StockMovement.Reason.OPENING,
            reference='رصيد افتتاحي', unit_cost=part.purchase_price, user=user,
        )
    return part


# ─────────────────────────────────────────────────────────────────────────────
# مرتجعات البيع
# ─────────────────────────────────────────────────────────────────────────────

def create_sale_return(
    *, invoice, items, refund_method, user, reason='',
    bank_account=None, bank_name='', reference_id=None, sender_account_number='',
) -> SaleReturn:
    """
    مرتجع جزئي أو كامل من فاتورة: يعيد الكمية للمخزون بتكلفتها الأصلية ويردّ
    المبلغ نقداً أو تحويلاً، أو يخصمه من حساب العميل.

    `items`: [{'invoice_item': <InvoiceItem|id>, 'quantity': int}]. لا يُرجع
    أكثر مما بيع ناقص ما أُرجع سابقاً. الردّ النقدي أو البنكي لا يتجاوز ما
    دُفع فعلاً من الفاتورة؛ الجزء الآجل يُعالج بالخصم من حساب العميل.
    """
    if not items:
        raise InventoryError('حدّد بنداً واحداً على الأقل للإرجاع.')
    if refund_method not in SaleReturn.RefundMethod.values:
        raise PaymentError('طريقة ردّ المبلغ غير صالحة.')
    ensure_day_open()

    transfer = {}
    if refund_method == SaleReturn.RefundMethod.BANK:
        transfer = _prepare_transfer({
            'bank_account': bank_account, 'bank_name': bank_name,
            'reference_id': reference_id, 'sender_account_number': sender_account_number,
        }, require_sender=False)

    try:
        return _create_sale_return(
            invoice=invoice, items=items, refund_method=refund_method, user=user,
            reason=reason, transfer=transfer,
        )
    except IntegrityError:
        # إشعار التحويل نفسه سُجّل في عملية متزامنة بين الفحص والحفظ.
        _ensure_reference_unused(transfer.get('reference_key'))
        raise


def _create_sale_return(*, invoice, items, refund_method, user, reason, transfer) -> SaleReturn:
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=getattr(invoice, 'pk', invoice))
        if invoice.customer_id is not None:
            # المرتجع إلى الحساب يغيّر رصيد العميل: يُقفل كما في التحصيل والبيع الآجل.
            Customer.objects.select_for_update().get(pk=invoice.customer_id)
        invoice_items = {item.pk: item for item in invoice.items.all()}

        requested = Counter()
        for raw in items:
            item_id = getattr(raw['invoice_item'], 'pk', raw['invoice_item'])
            quantity = int(raw['quantity'])
            if item_id not in invoice_items:
                raise InventoryError('بند المرتجع لا يتبع هذه الفاتورة.')
            if quantity <= 0:
                raise InventoryError('كمية المرتجع يجب أن تكون أكبر من صفر.')
            requested[item_id] += quantity

        already = Counter()
        for item_id, quantity in SaleReturnItem.objects.filter(
            invoice_item__invoice=invoice,
        ).values_list('invoice_item_id', 'quantity'):
            already[item_id] += quantity
        for item_id, quantity in requested.items():
            available = invoice_items[item_id].quantity - already[item_id]
            if quantity > available:
                item = invoice_items[item_id]
                raise InventoryError(
                    f"لا يمكن إرجاع {quantity} من '{item.spare_part.name}': "
                    f"المتاح للإرجاع {available}."
                )

        total = sum(
            (invoice_items[item_id].unit_price * quantity for item_id, quantity in requested.items()),
            Decimal('0'),
        )

        if refund_method == SaleReturn.RefundMethod.ACCOUNT:
            if invoice.customer_id is None:
                raise PaymentError('الخصم من الحساب يتطلب فاتورة باسم عميل.')
        else:
            refunded = invoice.returns.exclude(
                refund_method=SaleReturn.RefundMethod.ACCOUNT,
            ).aggregate(v=Sum('total_amount'))['v'] or Decimal('0')
            # تحويل لم يُطابق بكشف البنك لا يُرد نقداً: شراء بإشعار مزيف ثم
            # إرجاع البضاعة نقداً احتيال معروف.
            unverified = invoice.payments.filter(
                kind=Payment.Kind.SALE, method=Payment.Method.BANK, verified_at__isnull=True,
            ).aggregate(v=Sum('amount'))['v'] or Decimal('0')
            refundable = invoice.paid_amount - unverified - refunded
            if total > refundable:
                if unverified:
                    raise PaymentError(
                        f"المبلغ المردود ({total}) يتجاوز المدفوع المؤكد ({refundable}): الفاتورة "
                        f"مدفوعة بتحويل غير مطابق ({unverified}). طابق التحويل مع كشف البنك أولاً، "
                        "أو اخصم المبلغ من حساب العميل."
                    )
                raise PaymentError(
                    f"المبلغ المردود ({total}) أكبر مما دُفع من الفاتورة ولم يُرد بعد "
                    f"({refundable}). اخصم الباقي من حساب العميل."
                )
            _ensure_reference_unused(transfer.get('reference_key'))

        sale_return = SaleReturn.objects.create(
            invoice=invoice, refund_method=refund_method, total_amount=total,
            reason=reason or '', created_by=user,
        )
        parts = _lock_parts(invoice_items[item_id].spare_part_id for item_id in requested)
        for item_id, quantity in requested.items():
            item = invoice_items[item_id]
            part = parts[item.spare_part_id]
            SaleReturnItem.objects.create(
                sale_return=sale_return, invoice_item=item, quantity=quantity,
                unit_price=item.unit_price, cost_price=item.cost_price,
                subtotal=item.unit_price * quantity,
            )
            # الكمية تعود بتكلفتها الأصلية، فتدخل متوسط التكلفة بوزنها الصحيح.
            _apply_weighted_average_cost(part, quantity, item.cost_price)
            _add_stock(
                part, quantity, StockMovement.Reason.RETURN,
                reference=f"مرتجع #{sale_return.pk} / فاتورة #{invoice.pk}",
                unit_cost=item.cost_price, user=user,
            )

        if refund_method != SaleReturn.RefundMethod.ACCOUNT:
            Payment.objects.create(
                kind=Payment.Kind.REFUND, method=refund_method, amount=total,
                invoice=invoice, customer=invoice.customer, sale_return=sale_return,
                created_by=user, **transfer,
            )

    return sale_return


# ─────────────────────────────────────────────────────────────────────────────
# الصندوق وإقفال اليومية
# ─────────────────────────────────────────────────────────────────────────────

def day_bounds(day):
    """بداية اليوم ونهايته بتوقيت المؤسسة."""
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start, start + timedelta(days=1)


def default_opening_cash(day) -> Decimal:
    """نقد بداية اليوم = النقد المعدود في آخر إقفال سابق (يبقى في الدرج)."""
    previous = DailyClose.objects.filter(date__lt=day).order_by('-date').first()
    return previous.counted_cash if previous else Decimal('0')


def daily_summary(day, opening_cash=None) -> dict:
    """ملخص يوم: المبيعات، النقد المتوقع في الدرج، والتحويلات لكل حساب."""
    start, end = day_bounds(day)
    if opening_cash is None:
        opening_cash = default_opening_cash(day)
    opening_cash = Decimal(str(opening_cash))

    def total(qs, field='amount'):
        return qs.aggregate(v=Sum(field))['v'] or Decimal('0')

    invoices = Invoice.objects.filter(created_at__gte=start, created_at__lt=end)
    payments = Payment.objects.filter(created_at__gte=start, created_at__lt=end)
    expenses = Expense.objects.filter(date=day)
    returns = SaleReturn.objects.filter(created_at__gte=start, created_at__lt=end)

    money_in = payments.filter(kind__in=[Payment.Kind.SALE, Payment.Kind.COLLECTION])
    refunds = payments.filter(kind=Payment.Kind.REFUND)

    cash_in = total(money_in.filter(method=Payment.Method.CASH))
    cash_refunds = total(refunds.filter(method=Payment.Method.CASH))
    cash_expenses = total(expenses.filter(method=Expense.Method.CASH))

    banks = {}
    for payment in payments.filter(method=Payment.Method.BANK).select_related('bank_account'):
        name = payment.bank_account.name if payment.bank_account else (payment.bank_name or 'غير محدد')
        row = banks.setdefault(name, {'bank': name, 'in': Decimal('0'), 'out': Decimal('0'),
                                      'count': 0, 'unverified': 0})
        if payment.kind == Payment.Kind.REFUND:
            row['out'] += payment.amount
        else:
            row['in'] += payment.amount
            row['count'] += 1
            if payment.verified_at is None:
                row['unverified'] += 1
    for expense in expenses.filter(method=Expense.Method.BANK).select_related('bank_account'):
        name = expense.bank_account.name if expense.bank_account else 'غير محدد'
        row = banks.setdefault(name, {'bank': name, 'in': Decimal('0'), 'out': Decimal('0'),
                                      'count': 0, 'unverified': 0})
        row['out'] += expense.amount

    return {
        'date': day.isoformat(),
        'currency': settings.BASE_CURRENCY,
        'sales_count': invoices.count(),
        'sales_total': total(invoices, 'total_amount'),
        'credit_sales': total(invoices, 'credit_amount'),
        'collections': total(payments.filter(kind=Payment.Kind.COLLECTION)),
        'returns_count': returns.count(),
        'returns_total': total(returns, 'total_amount'),
        'expenses_total': total(expenses),
        'opening_cash': opening_cash,
        'cash_in': cash_in,
        'cash_refunds': cash_refunds,
        'cash_expenses': cash_expenses,
        'expected_cash': opening_cash + cash_in - cash_refunds - cash_expenses,
        'banks': sorted(banks.values(), key=lambda row: row['bank']),
        'closed': DailyClose.objects.filter(date=day).exists(),
    }


def close_day(*, day, counted_cash, user, opening_cash=None, notes='') -> DailyClose:
    """إقفال يوم: حفظ لقطة الملخص والفرق بين النقد المتوقع والمعدود."""
    counted_cash = Decimal(str(counted_cash))
    if not counted_cash.is_finite() or counted_cash < 0:
        raise InventoryError('النقد المعدود لا يمكن أن يكون سالباً.')
    if day > timezone.localdate():
        raise InventoryError('لا يمكن إقفال يوم لم يأتِ بعد.')
    try:
        return _close_day(day=day, counted_cash=counted_cash, user=user,
                          opening_cash=opening_cash, notes=notes)
    except IntegrityError:
        # إقفال متزامن لليوم نفسه من جهازين.
        raise InventoryError(f'يوم {day} مُقفل مسبقاً.')


def _close_day(*, day, counted_cash, user, opening_cash, notes) -> DailyClose:
    with transaction.atomic():
        if DailyClose.objects.filter(date=day).exists():
            raise InventoryError(f'يوم {day} مُقفل مسبقاً.')
        summary = daily_summary(day, opening_cash)
        return DailyClose.objects.create(
            date=day,
            opening_cash=summary['opening_cash'],
            expected_cash=summary['expected_cash'],
            counted_cash=counted_cash,
            difference=counted_cash - summary['expected_cash'],
            summary=json.loads(json.dumps(summary, default=str)),
            notes=notes or '',
            closed_by=user,
        )


# ─────────────────────────────────────────────────────────────────────────────
# أسعار الصرف والتسعير
# ─────────────────────────────────────────────────────────────────────────────

def latest_exchange_rates() -> dict:
    """آخر سعر مسجّل لكل عملة: {'USD': Decimal(...)}."""
    rates = {}
    for currency, rate in ExchangeRate.objects.order_by('currency', '-created_at', '-pk').values_list(
        'currency', 'rate',
    ):
        rates.setdefault(currency, rate)
    return rates


def record_exchange_rate(*, currency, rate, user) -> ExchangeRate:
    currency = (currency or '').strip().upper()
    if currency not in settings.PRICING_CURRENCIES:
        raise InventoryError(
            f"العملة '{currency}' غير مدعومة للتسعير. المتاح: {', '.join(settings.PRICING_CURRENCIES)}."
        )
    rate = Decimal(str(rate))
    if rate <= 0:
        raise InventoryError('سعر الصرف يجب أن يكون أكبر من صفر.')
    return ExchangeRate.objects.create(currency=currency, rate=rate, created_by=user)


def effective_markup(part: SparePart, site) -> Decimal:
    if part.markup_percent is not None:
        return part.markup_percent
    if part.category_id and part.category.markup_percent is not None:
        return part.category.markup_percent
    return site.default_markup_percent


def suggested_selling_price(part: SparePart, rates: dict, site) -> Decimal | None:
    """
    سعر البيع المقترح = تكلفة الشراء الأجنبية × سعر الصرف × (1 + الهامش)،
    مقرّباً لأعلى حسب إعداد التقريب. None للقطع غير المسعّرة بعملة أجنبية.
    """
    if not part.cost_currency or part.foreign_cost is None or part.foreign_cost <= 0:
        return None
    rate = rates.get(part.cost_currency)
    if rate is None:
        return None
    raw = part.foreign_cost * rate * (Decimal('100') + effective_markup(part, site)) / Decimal('100')
    step = site.price_rounding
    if step:
        return (raw / step).to_integral_value(rounding=ROUND_CEILING) * step
    return raw.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def reprice_parts(*, user=None, apply=False, part_ids=None, allow_decrease=True) -> list:
    """
    مراجعة أسعار البيع بآخر أسعار الصرف: يعيد قائمة التغييرات، ويطبّقها عند
    apply=True. allow_decrease=False يُبقي الأسعار التي ستنخفض كما هي.
    """
    rates = latest_exchange_rates()
    site = SiteSetting.load()
    parts = SparePart.objects.select_related('category').exclude(cost_currency='').filter(
        foreign_cost__gt=0,
    )
    if part_ids is not None:
        parts = parts.filter(pk__in=part_ids)

    changes = []
    for part in parts.order_by('name'):
        new_price = suggested_selling_price(part, rates, site)
        if new_price is None or new_price == part.selling_price:
            continue
        if new_price < part.selling_price and not allow_decrease:
            continue
        changes.append({
            'id': part.pk,
            'name': part.name,
            'part_number': part.part_number,
            'currency': part.cost_currency,
            'foreign_cost': part.foreign_cost,
            'rate': rates[part.cost_currency],
            'old_price': part.selling_price,
            'new_price': new_price,
        })

    if apply and changes:
        now = timezone.now()
        with transaction.atomic():
            for change in changes:
                SparePart.objects.filter(pk=change['id']).update(
                    selling_price=change['new_price'], price_updated_at=now,
                )
    return changes


# ─────────────────────────────────────────────────────────────────────────────
# الجرد
# ─────────────────────────────────────────────────────────────────────────────

def apply_stock_count(count: StockCount, *, user) -> StockCount:
    """
    تطبيق جرد: يُضاف لكل قطعة معدودة فرقُ العدّ (المعدود − رصيدها لحظة العدّ)
    بحركة «جرد». مبيعات ومرتجعات وتوريدات حدثت بين العدّ والتطبيق تبقى كما هي؛
    جعل الرصيد مساوياً للمعدود مباشرة كان يمحوها. الأصناف غير المعدودة لا تتغير.
    """
    with transaction.atomic():
        count = StockCount.objects.select_for_update().get(pk=count.pk)
        if count.status != StockCount.Status.DRAFT:
            raise InventoryError('هذا الجرد مطبّق أو ملغي مسبقاً.')
        lines = list(count.lines.all())
        if not lines:
            raise InventoryError('لا توجد أصناف معدودة في هذا الجرد.')

        parts = _lock_parts(line.spare_part_id for line in lines)
        for line in lines:
            part = parts[line.spare_part_id]
            line.system_quantity = part.stock_quantity
            line.save(update_fields=['system_quantity'])
            baseline = line.quantity_at_count
            if baseline is None:
                baseline = part.stock_quantity
            target = max(part.stock_quantity + line.counted_quantity - baseline, 0)
            delta = target - part.stock_quantity
            if delta:
                part.stock_quantity = target
                part.save(update_fields=['stock_quantity'])
                _record_movement(
                    part, delta, StockMovement.Reason.STOCK_COUNT,
                    reference=f"جرد #{count.pk}", user=user,
                )

        count.status = StockCount.Status.APPLIED
        count.applied_by = user
        count.applied_at = timezone.now()
        count.save(update_fields=['status', 'applied_by', 'applied_at'])
    return count
