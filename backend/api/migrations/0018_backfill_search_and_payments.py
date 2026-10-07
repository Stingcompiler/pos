"""
ترحيل بيانات قائمة إلى البنية الجديدة:

- نص البحث الموحّد لكل قطعة موجودة.
- الفواتير القديمة كانت تُدفع كاملة عند البيع: paid_amount = الإجمالي.
- دفعة (Payment) لكل فاتورة قديمة حتى تشملها مطابقة التحويلات وإقفال اليومية.
  رقم الإشعار المكرر في البيانات القديمة يُحفظ كما هو، لكن بلا مفتاح فرادة
  إلا لأول ظهور له (القيد الجديد لا يكسر الترحيل).
"""

from django.db import migrations
from django.db.models import F

LEGACY_NOTE = 'مرحّلة من فاتورة سابقة لنظام المدفوعات'


def forwards(apps, schema_editor):
    from api.search import build_part_search_text, compact

    SparePart = apps.get_model('api', 'SparePart')
    Invoice = apps.get_model('api', 'Invoice')
    Payment = apps.get_model('api', 'Payment')

    for part in SparePart.objects.select_related('category').iterator():
        SparePart.objects.filter(pk=part.pk).update(search_text=build_part_search_text(part))

    Invoice.objects.update(paid_amount=F('total_amount'), credit_amount=0)

    used_keys = set()
    for invoice in Invoice.objects.order_by('pk').iterator():
        is_bank = invoice.payment_method == 'bank'
        reference_key = None
        if is_bank and invoice.reference_id:
            key = compact(invoice.reference_id).upper()
            if key and key not in used_keys:
                reference_key = key
                used_keys.add(key)
        payment = Payment.objects.create(
            kind='sale',
            method='bank' if is_bank else 'cash',
            amount=invoice.total_amount,
            invoice_id=invoice.pk,
            customer_id=invoice.customer_id,
            bank_name=(invoice.bank_name or '') if is_bank else '',
            reference_id=invoice.reference_id if is_bank else None,
            reference_key=reference_key,
            sender_account_number=(invoice.sender_account_number or '') if is_bank else '',
            note=LEGACY_NOTE,
            created_by_id=invoice.cashier_id,
        )
        # auto_now_add يفرض وقت الترحيل؛ تاريخ الدفعة هو تاريخ الفاتورة.
        Payment.objects.filter(pk=payment.pk).update(created_at=invoice.created_at)


def backwards(apps, schema_editor):
    apps.get_model('api', 'Payment').objects.filter(note=LEGACY_NOTE).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_sudan_market_features'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
