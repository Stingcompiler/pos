"""
واجهات المال والمخزون التشغيلية: الحسابات البنكية، مطابقة التحويلات،
المرتجعات، المصروفات، إقفال اليومية، أسعار الصرف والتسعير، والجرد.

كل تغيير على المال أو الرصيد يمر عبر api.services.
"""

import mimetypes
from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db.models import F, Q
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import services
from .models import BankAccount, DailyClose, ExchangeRate, Expense, Payment, SaleReturn, StockCount, StockCountLine, SparePart
from .permissions import IsManagerOrSupervisor, RoleBasedPermission
from .serializers import (
    PRIVILEGED_ROLES,
    BankAccountSerializer,
    DailyCloseSerializer,
    ExchangeRateSerializer,
    ExpenseSerializer,
    PaymentSerializer,
    SaleReturnSerializer,
    StockCountLineSerializer,
    StockCountSerializer,
    business_error,
)
from .validators import validate_image_upload
from .views import find_part_by_code


def parse_day(value, default=None):
    """تاريخ من معامل الاستعلام بصيغة YYYY-MM-DD، أو اليوم المحلي."""
    if not value:
        return default or timezone.localdate()
    try:
        return date_cls.fromisoformat(value)
    except ValueError:
        raise ValidationError({'date': 'صيغة التاريخ يجب أن تكون YYYY-MM-DD.'})


def parse_amount(value, field) -> Decimal:
    """مبلغ رقمي من الطلب، أو خطأ 400 باسم الحقل."""
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise ValidationError({field: 'أدخل مبلغاً رقمياً صحيحاً.'})


# ═══════════════════════════════════════════════════════════════════════════════
# الحسابات البنكية والمدفوعات
# ═══════════════════════════════════════════════════════════════════════════════

class BankAccountViewSet(viewsets.ModelViewSet):
    """حسابات المحل البنكية: يقرأها الجميع (لنقطة البيع) ويديرها المدير والمشرف."""

    serializer_class = BankAccountSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]

    def get_queryset(self):
        qs = BankAccount.objects.all()
        if self.request.query_params.get('active') in ('1', 'true'):
            qs = qs.filter(is_active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if account.payments.exists() or account.expenses.exists():
            return Response(
                {'detail': 'للحساب دفعات مسجّلة؛ عطّله بدل حذفه.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    سجل المدفوعات ومطابقة التحويلات.

    المدير والمشرف يرون الكل ويطابقون التحويل بكشف الحساب؛ الموظف يرى ما
    سجّله هو فقط ويرفق صورة الإشعار لدفعاته.
    """

    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Payment.objects.select_related(
            'customer', 'bank_account', 'created_by', 'verified_by',
        )
        if self.request.user.role not in PRIVILEGED_ROLES:
            qs = qs.filter(created_by=self.request.user)

        params = self.request.query_params
        if params.get('date'):
            start, end = services.day_bounds(parse_day(params['date']))
            qs = qs.filter(created_at__gte=start, created_at__lt=end)
        for field in ('method', 'kind', 'bank_account', 'invoice', 'customer'):
            if params.get(field):
                qs = qs.filter(**{field: params[field]})
        if params.get('verified') in ('0', 'false'):
            qs = qs.filter(verified_at__isnull=True)
        elif params.get('verified') in ('1', 'true'):
            qs = qs.filter(verified_at__isnull=False)
        if params.get('search'):
            term = params['search'].strip()
            qs = qs.filter(
                Q(reference_id__icontains=term) | Q(sender_account_number__icontains=term)
                | Q(customer__name__icontains=term)
            )
        return qs

    def _require_privileged(self, request):
        if request.user.role not in PRIVILEGED_ROLES:
            raise PermissionDenied('مطابقة التحويلات للمدير والمشرف.')

    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request, pk=None):
        """تعليم التحويل مطابقاً لكشف الحساب البنكي."""
        self._require_privileged(request)
        payment = self.get_object()
        if payment.method != Payment.Method.BANK:
            return Response({'detail': 'المطابقة للتحويلات البنكية فقط.'}, status=status.HTTP_400_BAD_REQUEST)
        payment.verified_at = timezone.now()
        payment.verified_by = request.user
        payment.save(update_fields=['verified_at', 'verified_by'])
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['post'], url_path='unverify')
    def unverify(self, request, pk=None):
        self._require_privileged(request)
        payment = self.get_object()
        payment.verified_at = None
        payment.verified_by = None
        payment.save(update_fields=['verified_at', 'verified_by'])
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['get'], url_path='proof-image')
    def proof_image(self, request, pk=None):
        """صورة الإشعار لمن يحق له رؤية الدفعة فقط (الموظف: دفعاته)."""
        payment = self.get_object()
        if not payment.proof_image:
            raise Http404('لا توجد صورة لهذه الدفعة.')
        try:
            handle = payment.proof_image.open('rb')
        except FileNotFoundError:
            raise Http404('ملف الصورة غير موجود.')
        content_type = mimetypes.guess_type(payment.proof_image.name)[0] or 'application/octet-stream'
        response = FileResponse(handle, content_type=content_type)
        response['Cache-Control'] = 'private, no-store'
        return response

    @action(detail=True, methods=['post'], url_path='proof')
    def upload_proof(self, request, pk=None):
        """إرفاق صورة إشعار التحويل (لمن سجّل الدفعة أو المدير والمشرف)."""
        payment = self.get_object()
        image = request.FILES.get('proof_image')
        if image is None:
            return Response({'detail': 'أرفق صورة الإشعار.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_image_upload(image)
        except Exception as exc:
            messages = getattr(exc, 'messages', [str(exc)])
            return Response({'detail': ' '.join(messages)}, status=status.HTTP_400_BAD_REQUEST)
        payment.proof_image = image
        payment.save(update_fields=['proof_image'])
        return Response(self.get_serializer(payment).data)


class SaleReturnViewSet(viewsets.ReadOnlyModelViewSet):
    """سجل المرتجعات (الإنشاء من الفاتورة: POST invoices/{id}/returns/)."""

    serializer_class = SaleReturnSerializer
    permission_classes = [IsAuthenticated, IsManagerOrSupervisor]
    queryset = SaleReturn.objects.select_related('created_by').prefetch_related(
        'items__invoice_item__spare_part',
    )
    filterset_fields = ['invoice', 'refund_method']


# ═══════════════════════════════════════════════════════════════════════════════
# المصروفات وإقفال اليومية
# ═══════════════════════════════════════════════════════════════════════════════

class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, IsManagerOrSupervisor, RoleBasedPermission]

    def get_queryset(self):
        qs = Expense.objects.select_related('bank_account', 'created_by')
        params = self.request.query_params
        if params.get('date'):
            qs = qs.filter(date=parse_day(params['date']))
        if params.get('date_from'):
            qs = qs.filter(date__gte=parse_day(params['date_from']))
        if params.get('date_to'):
            qs = qs.filter(date__lte=parse_day(params['date_to']))
        return qs

    def _ensure_open(self, day):
        if DailyClose.objects.filter(date=day).exists():
            raise ValidationError({'date': f'يوم {day} مُقفل؛ لا تُضاف أو تُعدّل مصروفاته.'})

    def perform_create(self, serializer):
        self._ensure_open(serializer.validated_data['date'])
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._ensure_open(serializer.instance.date)
        self._ensure_open(serializer.validated_data.get('date', serializer.instance.date))
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_open(instance.date)
        instance.delete()


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrSupervisor])
def daily_summary_view(request):
    """ملخص يوم (date=YYYY-MM-DD، الافتراضي اليوم) قبل الإقفال أو بعده."""
    day = parse_day(request.query_params.get('date'))
    opening = request.query_params.get('opening_cash')
    summary = services.daily_summary(
        day, parse_amount(opening, 'opening_cash') if opening not in (None, '') else None,
    )
    close = DailyClose.objects.filter(date=day).select_related('closed_by').first()
    return Response({
        **summary,
        'close': DailyCloseSerializer(close).data if close else None,
    })


class DailyCloseViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        mixins.CreateModelMixin, mixins.DestroyModelMixin,
                        viewsets.GenericViewSet):
    """
    إقفالات اليومية. الإنشاء يحفظ لقطة الملخص والفرق؛ الحذف (إعادة فتح اليوم)
    للمدير فقط.
    """

    serializer_class = DailyCloseSerializer
    permission_classes = [IsAuthenticated, IsManagerOrSupervisor, RoleBasedPermission]
    queryset = DailyClose.objects.select_related('closed_by')

    def create(self, request, *args, **kwargs):
        counted = parse_amount(request.data.get('counted_cash'), 'counted_cash')
        opening = request.data.get('opening_cash')
        try:
            close = services.close_day(
                day=parse_day(request.data.get('date')),
                counted_cash=counted,
                opening_cash=parse_amount(opening, 'opening_cash') if opening not in (None, '') else None,
                notes=request.data.get('notes', ''),
                user=request.user,
            )
        except services.InventoryError as exc:
            raise business_error(exc)
        return Response(self.get_serializer(close).data, status=status.HTTP_201_CREATED)


# ═══════════════════════════════════════════════════════════════════════════════
# أسعار الصرف والتسعير
# ═══════════════════════════════════════════════════════════════════════════════

class ExchangeRateViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """سجل أسعار الصرف: يقرأه الجميع، ويسجّله المدير والمشرف."""

    serializer_class = ExchangeRateSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]

    def get_queryset(self):
        qs = ExchangeRate.objects.select_related('created_by')
        if self.request.query_params.get('currency'):
            qs = qs.filter(currency=self.request.query_params['currency'].upper())
        return qs

    def create(self, request, *args, **kwargs):
        try:
            rate = services.record_exchange_rate(
                currency=request.data.get('currency'),
                rate=parse_amount(request.data.get('rate'), 'rate'),
                user=request.user,
            )
        except services.InventoryError as exc:
            raise business_error(exc)
        return Response(self.get_serializer(rate).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='latest')
    def latest(self, request):
        rates = services.latest_exchange_rates()
        return Response({
            'base_currency': settings.BASE_CURRENCY,
            'currencies': settings.PRICING_CURRENCIES,
            'rates': {currency: str(rate) for currency, rate in rates.items()},
        })


def _serialize_changes(changes):
    return [
        {**change, **{key: str(change[key]) for key in ('foreign_cost', 'rate', 'old_price', 'new_price')}}
        for change in changes
    ]


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsManagerOrSupervisor])
def pricing_view(request):
    """
    مراجعة أسعار البيع بآخر أسعار الصرف.

    GET: معاينة التغييرات دون حفظ. POST: تطبيقها (allow_decrease=false يُبقي
    الأسعار التي ستنخفض، part_ids لتطبيقها على قطع محددة).
    """
    source = request.query_params if request.method == 'GET' else request.data
    allow_decrease = str(source.get('allow_decrease', 'true')).lower() not in ('0', 'false')
    part_ids = source.get('part_ids') if request.method == 'POST' else None
    changes = services.reprice_parts(
        user=request.user, apply=request.method == 'POST',
        allow_decrease=allow_decrease, part_ids=part_ids,
    )
    return Response({'applied': request.method == 'POST', 'count': len(changes),
                     'changes': _serialize_changes(changes)})


# ═══════════════════════════════════════════════════════════════════════════════
# الجرد
# ═══════════════════════════════════════════════════════════════════════════════

class StockCountViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    جلسات الجرد: إضافة الكميات المعدودة بالمسح أو البحث، ثم تطبيقها تسويةً
    واحدة. التطبيق والإلغاء للمدير والمشرف.
    """

    serializer_class = StockCountSerializer
    permission_classes = [IsAuthenticated, IsManagerOrSupervisor]
    queryset = StockCount.objects.select_related('created_by', 'applied_by').prefetch_related(
        'lines__spare_part',
    )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _draft(self):
        count = self.get_object()
        if count.status != StockCount.Status.DRAFT:
            raise ValidationError({'detail': 'هذا الجرد مطبّق أو ملغي؛ لا يمكن تعديله.'})
        return count

    @action(detail=True, methods=['post'], url_path='lines')
    def add_line(self, request, pk=None):
        """
        إضافة قطعة معدودة: spare_part أو code (باركود/رقم)، و counted_quantity.
        mode=add يزيد العدد (كل مسح = +الكمية)، وmode=set يضبطه.
        """
        count = self._draft()
        part = None
        if request.data.get('spare_part'):
            part = SparePart.objects.filter(pk=request.data['spare_part']).first()
        elif request.data.get('code'):
            part = find_part_by_code(request.data['code'])
        if part is None:
            return Response({'detail': 'لم يُعثر على القطعة.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            quantity = int(request.data.get('counted_quantity', 1))
        except (TypeError, ValueError):
            return Response({'counted_quantity': 'أدخل عدداً صحيحاً.'}, status=status.HTTP_400_BAD_REQUEST)
        if quantity < 0:
            return Response({'counted_quantity': 'الكمية لا تكون سالبة.'}, status=status.HTTP_400_BAD_REQUEST)

        # الرصيد لحظة العدّ يُحفظ مع السطر: التطبيق يضيف الفرق عنه فقط.
        line, created = StockCountLine.objects.get_or_create(
            stock_count=count, spare_part=part,
            defaults={'counted_quantity': quantity, 'quantity_at_count': part.stock_quantity},
        )
        if not created:
            if request.data.get('mode') == 'add':
                # زيادة ذرّية: مسح متزامن من جهازين لا يضيع أياً منهما.
                StockCountLine.objects.filter(pk=line.pk).update(
                    counted_quantity=F('counted_quantity') + quantity,
                )
            else:
                StockCountLine.objects.filter(pk=line.pk).update(
                    counted_quantity=quantity, quantity_at_count=part.stock_quantity,
                )
            line.refresh_from_db()
        return Response(StockCountLineSerializer(line).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path=r'lines/(?P<line_id>\d+)')
    def remove_line(self, request, pk=None, line_id=None):
        count = self._draft()
        deleted, _ = count.lines.filter(pk=line_id).delete()
        if not deleted:
            return Response({'detail': 'السطر غير موجود.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='apply')
    def apply(self, request, pk=None):
        count = self.get_object()
        try:
            count = services.apply_stock_count(count, user=request.user)
        except services.InventoryError as exc:
            raise business_error(exc)
        return Response(self.get_serializer(self.get_queryset().get(pk=count.pk)).data)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        count = self._draft()
        count.status = StockCount.Status.CANCELLED
        count.save(update_fields=['status'])
        return Response(self.get_serializer(count).data)
