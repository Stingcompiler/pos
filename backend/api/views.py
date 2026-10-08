"""
واجهات الـ API لنظام قطع الغيار.

منطق المخزون الحسّاس مفوَّض بالكامل إلى api.services. المصادقة تعتمد
توكنات JWT داخل كوكيز HttpOnly قابلة للإبطال (blacklist) عند الخروج
أو التدوير.
"""

import logging
import re
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.db import IntegrityError
from django.db.models import (
    Sum,
    Count,
    Q,
    F,
    ProtectedError,
)
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek, TruncYear
from django.http import HttpResponse
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from . import importers, reports, services
from .authentication import enforce_csrf
from .params import parse_day, parse_id, parse_quantity
from .search import compact, search_parts
from .models import (
    Category,
    CarModel,
    SparePart,
    Invoice,
    SiteSetting,
    ContactMethod,
    ContactMessage,
    Customer,
    Payment,
    Supplier,
    SupplyDeal,
    PublicOrder,
    Notification,
    StockMovement,
)
from .serializers import (
    UserSerializer, UserCreateSerializer,
    CategorySerializer, CarModelSerializer,
    SparePartSerializer, SparePartListSerializer,
    InvoiceSerializer, InvoiceListSerializer,
    SiteSettingSerializer, BusinessSettingsSerializer, ReceiptSettingsSerializer,
    ContactMethodSerializer, ContactMessageSerializer, PublicSparePartSerializer,
    CustomerSerializer, CollectionSerializer, PaymentSerializer,
    SaleReturnInputSerializer, SaleReturnSerializer,
    SupplierSerializer, SupplyDealSerializer, SupplierDetailSerializer,
    PublicOrderSerializer, PublicOrderInvoiceSerializer, NotificationSerializer, StockMovementSerializer,
    business_error, PRIVILEGED_ROLES,
)
from .permissions import RoleBasedPermission, IsManager, IsManagerOrSupervisor

User = get_user_model()
logger = logging.getLogger('api')


# ═══════════════════════════════════════════════════════════════════════════════
# Throttling scopes
# ═══════════════════════════════════════════════════════════════════════════════

class LoginRateThrottle(AnonRateThrottle):
    """حد أقصى لمحاولات تسجيل الدخول — يحمي من هجمات التخمين."""
    scope = 'login'


class PublicWriteThrottle(AnonRateThrottle):
    """حد أقصى لعمليات الكتابة العامة (طلبات/رسائل) — يمنع الإغراق."""
    scope = 'public_write'


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

def _set_auth_cookies(response, access_token, refresh_token):
    """Helper to set HttpOnly auth cookies on a response."""
    common = {
        'httponly': settings.AUTH_COOKIE_HTTP_ONLY,
        'samesite': settings.AUTH_COOKIE_SAMESITE,
        'secure': settings.AUTH_COOKIE_SECURE,
        'path': settings.AUTH_COOKIE_PATH,
        # None يعني «الدومين الحالي» — وهو الصحيح للتنصيب على أصل واحد.
        'domain': settings.AUTH_COOKIE_DOMAIN,
    }
    # عمر كل كوكي يطابق عمر الرمز الذي يحمله: رمز الوصول 30 دقيقة، ورمز
    # التحديث 7 أيام ليصمد عبر جلسات المتصفح.
    response.set_cookie(
        key=settings.AUTH_COOKIE,
        value=str(access_token),
        max_age=settings.AUTH_COOKIE_ACCESS_MAX_AGE,
        **common,
    )
    response.set_cookie(
        key=settings.AUTH_COOKIE_REFRESH,
        value=str(refresh_token),
        max_age=settings.AUTH_COOKIE_MAX_AGE,
        **common,
    )
    return response


def _clear_auth_cookies(response):
    # delete_cookie تقبل path وdomain وsamesite فقط (لا max_age/httponly).
    # تمرير domain مطلوب وإلا بقيت الكوكي عالقة عند النشر على دومين محدّد.
    response.delete_cookie(
        settings.AUTH_COOKIE,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.AUTH_COOKIE_REFRESH,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    return response


@ensure_csrf_cookie
@api_view(['GET'])
@permission_classes([AllowAny])
def csrf_view(request):
    """
    ضبط كوكي csrftoken وإرجاع الرمز.

    الواجهة تستدعيها قبل أول طلب كتابة إن لم تجد الكوكي، ثم ترسل الرمز في
    ترويسة X-CSRFToken مع كل طلب غير آمن (انظر api.authentication.enforce_csrf).
    """
    return Response({'csrfToken': get_token(request)})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login_view(request):
    """Authenticate user, set HttpOnly cookies, and return user data."""
    # الدخول والتحديث والخروج تكتب كوكيز المصادقة، فتخضع لـ CSRF مثل بقية
    # طلبات الكتابة حتى لا يستطيع موقع آخر تنفيذها باسم المتصفح.
    enforce_csrf(request)
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'error': 'اسم المستخدم وكلمة المرور مطلوبان'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=username, password=password)

    if user is None:
        # تحذير مهم: ModelBackend.authenticate يشترط is_active فيعيد None
        # للحساب المعطّل أيضاً. لذلك فحص `not user.is_active` الذي كان هنا
        # كوداً ميتاً لا يُنفَّذ أبداً، والموظف المعطّل كان يرى «بيانات
        # الدخول غير صحيحة» فيظنّ أنه نسي كلمة المرور ويعيد المحاولات حتى
        # يُقفل بحدّ المعدّل.
        #
        # نميّز الحالتين هنا، لكن بلا كشف وجود الحساب لغريب: التمييز يحدث
        # فقط لمن أثبت معرفته بكلمة المرور الصحيحة.
        inactive_user = User.objects.filter(username=username).first()
        if (
            inactive_user is not None
            and not inactive_user.is_active
            and inactive_user.check_password(password)
        ):
            return Response(
                {'error': 'هذا الحساب غير مفعل، تواصل مع المدير.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            {'error': 'بيانات الدخول غير صحيحة'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    refresh = RefreshToken.for_user(user)
    access = refresh.access_token

    response = Response({
        'id': user.id,
        'username': user.username,
        'role': user.role,
        'first_name': user.first_name,
        'last_name': user.last_name,
    })
    _set_auth_cookies(response, access, refresh)
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """إبطال رمز التحديث فعلياً (blacklist) ثم مسح الكوكيز."""
    enforce_csrf(request)
    refresh_token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
    if refresh_token:
        try:
            RefreshToken(refresh_token).blacklist()
        except (TokenError, AttributeError):
            logger.info('محاولة خروج برمز تحديث غير صالح.')

    response = Response({'message': 'تم تسجيل الخروج بنجاح'})
    return _clear_auth_cookies(response)


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_view(request):
    """Refresh the access token using the refresh token cookie (with rotation)."""
    enforce_csrf(request)
    refresh_token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)

    if not refresh_token:
        return Response(
            {'error': 'لا يوجد رمز تحديث'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        refresh = RefreshToken(refresh_token)
        user = User.objects.get(id=refresh.payload.get('user_id'))
    except (TokenError, User.DoesNotExist):
        return Response(
            {'error': 'رمز التحديث غير صالح'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        try:
            refresh.blacklist()
        except (TokenError, AttributeError):
            pass
        response = Response({'error': 'هذا الحساب غير مفعل'}, status=status.HTTP_403_FORBIDDEN)
        return _clear_auth_cookies(response)

    # تدوير: إبطال الرمز القديم وإصدار رمز جديد.
    try:
        refresh.blacklist()
    except (TokenError, AttributeError):
        pass

    new_refresh = RefreshToken.for_user(user)
    response = Response({'message': 'تم تحديث الرمز بنجاح'})
    _set_auth_cookies(response, new_refresh.access_token, new_refresh)
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Return the current authenticated user's data."""
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'role': user.role,
        'first_name': user.first_name,
        'last_name': user.last_name,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS
# ═══════════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrSupervisor])
def dashboard_stats(request):
    """إحصائيات لوحة التحكم: مبيعات صافية من المرتجعات، مخزون، طلبات، وديون."""
    # اليوم بتوقيت المؤسسة: عند 01:30 في الخرطوم يكون تاريخ UTC هو أمس.
    today = timezone.localdate()
    today_start, today_end = services.day_bounds(today)

    low_stock_qs = SparePart.objects.filter(stock_quantity__lte=F('min_stock_alert'))
    today_figures = reports.period_figures(today_start, today_end)
    total_figures = reports.period_figures()

    low_stock_items = low_stock_qs.values(
        'id', 'name', 'part_number', 'stock_quantity', 'min_stock_alert'
    ).order_by('stock_quantity')[:10]

    today_collections = Payment.objects.filter(
        kind=Payment.Kind.COLLECTION, created_at__gte=today_start, created_at__lt=today_end,
    ).aggregate(v=Sum('amount'))['v'] or 0

    return Response({
        'currency': settings.BASE_CURRENCY,
        'total_parts': SparePart.objects.count(),
        'low_stock_count': low_stock_qs.count(),
        'today_invoices': today_figures['orders'],
        'today_revenue': float(today_figures['revenue']),
        'today_profit': float(today_figures['profit']),
        'today_returns': float(today_figures['returns_total']),
        'today_credit_sales': float(today_figures['credit_sales']),
        'today_collections': float(today_collections),
        'today_expenses': float(reports.expenses_total(today, today + timedelta(days=1))),
        'total_invoices': total_figures['orders'],
        'total_revenue': float(total_figures['revenue']),
        'total_profit': float(total_figures['profit']),
        'outstanding_credit': float(services.total_outstanding_credit()),
        'total_public_orders': PublicOrder.objects.count(),
        'pending_public_orders': PublicOrder.objects.filter(
            status=PublicOrder.Status.PENDING
        ).count(),
        'low_stock_items': list(low_stock_items),
    })


# ═══════════════════════════════════════════════════════════════════════════════
# CRUD VIEWSETS
# ═══════════════════════════════════════════════════════════════════════════════

class ProtectedDeleteMixin:
    """
    تحويل ProtectedError إلى 400 برسالة عربية بدل خطأ 500.

    النماذج تستخدم `on_delete=models.PROTECT` في مواضع مقصودة (فئة لها قطع،
    قطعة لها فواتير أو طلبات أو حركات مخزون، كاشير له فواتير). بدون هذا
    المعالج يرى المستخدم «خطأ في الخادم» بدل رسالة تشرح سبب المنع.
    """

    protected_delete_message = 'لا يمكن حذف هذا السجل لوجود بيانات مرتبطة به.'

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': self.protected_delete_message},
                status=status.HTTP_400_BAD_REQUEST,
            )


class UserViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """CRUD for users — Manager only."""
    queryset = User.objects.all().order_by('-date_joined')
    permission_classes = [IsAuthenticated, IsManager]
    protected_delete_message = (
        'لا يمكن حذف هذا المستخدم لأنه أنشأ فواتير أو حركات مخزون مسجّلة. '
        'السجل المحاسبي يحتاج معرف منشئها — عطّل الحساب بدل حذفه.'
    )

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer


class CategoryViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """CRUD for categories."""
    queryset = Category.objects.annotate(annotated_parts_count=Count('spare_parts'))
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['name']
    protected_delete_message = (
        'لا يمكن حذف هذه الفئة لاحتوائها على قطع غيار. انقل قطعها إلى فئة '
        'أخرى أو احذفها أولاً.'
    )


class CarModelViewSet(viewsets.ModelViewSet):
    """CRUD for car models."""
    queryset = CarModel.objects.all()
    serializer_class = CarModelSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['brand', 'model_name']
    filterset_fields = ['brand']


class AmbiguousPartCode(Exception):
    """رمز يطابق أكثر من قطعة: رقم أصلي (OEM) مشترك بين الأصلي والتجاري مثلاً."""

    def __init__(self, code, parts):
        self.code = code
        self.parts = parts
        names = '، '.join(f'{part.name} ({part.part_number})' for part in parts[:5])
        super().__init__(f'الرمز «{code}» يطابق {len(parts)} قطع: {names}. اختر القطعة الصحيحة من البحث.')

    def response(self, context):
        return Response(
            {'detail': str(self),
             'candidates': SparePartListSerializer(self.parts, many=True, context=context).data},
            status=status.HTTP_409_CONFLICT,
        )


def _only_match(code, parts):
    if len(parts) > 1:
        raise AmbiguousPartCode(code, parts)
    return parts[0]


def find_part_by_code(code: str):
    """
    قطعة بمطابقة تامة لرمز ممسوح أو مكتوب، بالأولوية: الباركود، ثم رقم القطعة،
    ثم الرقم بلا مسافات أو شرطات، ثم الرقم الأصلي. قارئ الباركود يكتب الرمز ثم Enter.

    أول مستوى فيه مطابقة يحسم. أكثر من قطعة فيه يرفع AmbiguousPartCode بدل
    اختيار إحداها، فلا يُباع أو يُعدّ صنف غير الممسوح.
    """
    code = (code or '').strip()
    if not code:
        return None
    part = SparePart.objects.filter(barcode=code).first()
    if part is not None:
        return part
    same_number = list(SparePart.objects.filter(part_number__iexact=code).order_by('pk'))
    if same_number:
        return _only_match(code, same_number)
    key = compact(code)
    if not key:
        return None
    candidates = list(search_parts(SparePart.objects.all(), code).order_by('pk')[:200])
    for fields in (('part_number', 'barcode'), ('oem_number',)):
        matches = [
            candidate for candidate in candidates
            if key in (compact(getattr(candidate, field)) for field in fields)
        ]
        if matches:
            return _only_match(code, matches)
    return None


class SparePartViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """CRUD for spare parts with search and filtering."""
    queryset = SparePart.objects.select_related('category', 'supplier').prefetch_related('compatible_cars')
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    protected_delete_message = (
        'لا يمكن حذف قطعة الغيار لأن لها فواتير أو طلبات أو حركات مخزون '
        'مسجّلة. هذه البيانات محميّة لسلامة السجل المحاسبي والتدقيقي.'
    )
    filterset_fields = ['category', 'compatible_cars', 'is_featured', 'supplier', 'quality_grade']
    ordering_fields = ['name', 'selling_price', 'stock_quantity', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        # البحث الموحّد (حروف عربية موحّدة، أسماء دارجة، أرقام بلا فواصل) بدل
        # SearchFilter الذي يطابق النص حرفياً.
        query = self.request.query_params.get('search', '').strip()
        if query:
            qs = search_parts(qs, query)
        if self.request.query_params.get('low_stock') in ('1', 'true'):
            qs = qs.filter(stock_quantity__lte=F('min_stock_alert'))
        return qs.distinct() if self.request.query_params.get('compatible_cars') else qs

    def get_serializer_class(self):
        if self.action == 'list':
            return SparePartListSerializer
        return SparePartSerializer

    @action(detail=False, methods=['get'], url_path='search-pos')
    def search_pos(self, request):
        """
        بحث نقطة البيع: المطابقة التامة للرمز (باركود/رقم) أولاً، ثم البحث الموحّد.
        """
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response([])

        base = SparePart.objects.select_related('category', 'supplier').prefetch_related('compatible_cars')
        try:
            exact = find_part_by_code(query)
        except AmbiguousPartCode:
            # القطع المطابقة كلها في نتائج البحث؛ يختار الكاشير منها.
            exact = None
        parts = list(search_parts(base.filter(stock_quantity__gt=0), query)[:20])
        if exact is not None and exact.stock_quantity > 0:
            parts = [exact] + [part for part in parts if part.pk != exact.pk][:19]

        serializer = SparePartListSerializer(parts, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='lookup')
    def lookup(self, request):
        """قطعة بمطابقة تامة لرمز ممسوح (للجرد وقارئ الباركود)."""
        try:
            part = find_part_by_code(request.query_params.get('code', ''))
        except AmbiguousPartCode as exc:
            return exc.response(self.get_serializer_context())
        if part is None:
            return Response({'detail': 'لا توجد قطعة بهذا الرمز.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SparePartListSerializer(part, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['get'], url_path='movements')
    def movements(self, request, pk=None):
        """سجل حركات المخزون لقطعة معيّنة."""
        part = self.get_object()
        movements = part.stock_movements.select_related('created_by')[:100]
        return Response(
            StockMovementSerializer(movements, many=True, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=['post'], url_path='adjust-stock')
    def adjust_stock(self, request, pk=None):
        """تسوية يدوية لكمية المخزون — للمدير/المشرف فقط."""
        if request.user.role not in PRIVILEGED_ROLES:
            return Response(
                {'detail': 'غير مصرح بتسوية المخزون.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        part = self.get_object()
        new_quantity = request.data.get('stock_quantity')
        if new_quantity in (None, ''):
            return Response(
                {'detail': 'يجب تمرير stock_quantity.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_quantity = parse_quantity(new_quantity, 'stock_quantity')

        reason = (request.data.get('reason') or '').strip()
        try:
            part = services.adjust_stock(
                part.pk, new_quantity, user=request.user,
                reference=f'تسوية يدوية: {reason}'[:100] if reason else 'تسوية يدوية',
            )
        except (services.InventoryError, ValueError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(SparePartSerializer(part, context=self.get_serializer_context()).data)

    # ── الاستيراد والتصدير ─────────────────────────────────────────────

    @action(detail=False, methods=['post'], url_path='import')
    def import_parts(self, request):
        """
        استيراد من Excel/CSV. dry_run=1 (الافتراضي) يعيد معاينة بالأخطاء دون
        حفظ؛ dry_run=0 يطبّق الملف كاملاً، ويُرفض إن بقيت أخطاء.
        """
        if request.user.role not in PRIVILEGED_ROLES:
            return Response({'detail': 'غير مصرح بالاستيراد.'}, status=status.HTTP_403_FORBIDDEN)
        uploaded = request.FILES.get('file')
        if uploaded is None:
            return Response({'detail': 'أرفق ملف Excel أو CSV.'}, status=status.HTTP_400_BAD_REQUEST)

        dry_run = str(request.data.get('dry_run', '1')).lower() not in ('0', 'false')
        update_existing = str(request.data.get('update_existing', '0')).lower() in ('1', 'true')
        try:
            records = importers.parse_rows(importers.read_rows(uploaded))
        except importers.ImportFileError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        plan = importers.plan_import(records, update_existing=update_existing)
        summary = importers.summarize(plan)
        if dry_run:
            return Response({**summary, 'applied': False})
        if plan['errors']:
            return Response(
                {**summary, 'applied': False,
                 'detail': 'صحّح الأخطاء في الملف ثم أعد رفعه؛ لم يُحفظ أي صف.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            importers.apply_import(plan, user=request.user)
        except IntegrityError:
            # قطعة أو باركود أُضيف من شاشة أخرى بين المعاينة والتطبيق.
            return Response(
                {**summary, 'applied': False,
                 'detail': 'تغيّرت القطع أثناء الاستيراد (رقم أو باركود أُضيف للتو). أعد رفع الملف للمعاينة؛ لم يُحفظ أي صف.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({**summary, 'applied': True})

    @action(detail=False, methods=['get'], url_path='export')
    def export_parts(self, request):
        """تصدير القطع (بعد تطبيق البحث والتصفية) إلى ملف Excel."""
        parts = self.filter_queryset(self.get_queryset()).order_by('name')
        rows = importers.export_rows(parts, include_costs=request.user.role in PRIVILEGED_ROLES)
        return excel_response(importers.rows_to_xlsx(rows), 'spare-parts.xlsx')

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """قالب الاستيراد: عناوين الأعمدة العربية وصف مثال."""
        header = [label for _, label in importers.EXPORT_COLUMNS]
        example = ['04152-YZZA1', 'فلتر زيت', 'فلاتر', 'Toyota', '04152-YZZA1', 'أصلي',
                   'فلتر زيت هايلوكس', '', 1200, 1800, 10, 3, 'A-3', '']
        return excel_response(importers.rows_to_xlsx([header, example], 'قالب'), 'parts-template.xlsx')


def excel_response(content: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(
        content,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


IDEMPOTENCY_KEY_PATTERN = re.compile(r'[A-Za-z0-9_.:\-]{1,64}')


class InvoiceViewSet(viewsets.ModelViewSet):
    """
    إنشاء وقراءة الفواتير.

    الفواتير غير قابلة للتعديل أو الحذف بعد إنشائها لأن ذلك يفسد المخزون
    والسجل المحاسبي؛ يمكن فقط الإنشاء والقراءة، والتصحيح بالمرتجع.
    """
    queryset = Invoice.objects.select_related('cashier', 'customer').prefetch_related(
        'items__spare_part', 'items__return_items', 'payments__bank_account',
        'payments__created_by', 'payments__verified_by',
        'returns__items__invoice_item__spare_part', 'returns__created_by',
    )
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    ordering_fields = ['created_at', 'total_amount']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return InvoiceListSerializer
        return InvoiceSerializer

    def create(self, request, *args, **kwargs):
        """
        إنشاء فاتورة مع دعم ترويسة Idempotency-Key.

        الواجهة تولّد مفتاحاً ثابتاً لكل عملية بيع؛ إن نجح البيع وانقطع الرد
        ثم أُعيد الطلب بالمفتاح نفسه، تُعاد الفاتورة الأصلية بحالة 200 دون
        خصم جديد. المفتاح نفسه بمحتوى مختلف يُرفض بحالة 422.
        """
        idempotency_key = request.META.get('HTTP_IDEMPOTENCY_KEY', '').strip() or None
        if idempotency_key is not None and not IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
            return Response(
                {'detail': 'ترويسة Idempotency-Key غير صالحة (حتى 64 حرفاً من الأحرف '
                           'والأرقام و - _ . :).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save(idempotency_key=idempotency_key)

        replayed = getattr(invoice, 'idempotent_replay', False)
        response = Response(
            self.get_serializer(self.get_queryset().get(pk=invoice.pk)).data,
            status=status.HTTP_200_OK if replayed else status.HTTP_201_CREATED,
        )
        if replayed:
            response['Idempotent-Replayed'] = 'true'
        return response

    def get_queryset(self):
        qs = super().get_queryset()
        # Employees can only see their own invoices
        if self.request.user.role == 'employee':
            qs = qs.filter(cashier=self.request.user)

        params = self.request.query_params
        if params.get('customer'):
            qs = qs.filter(customer_id=parse_id(params['customer'], 'customer'))
        if params.get('payment_method'):
            qs = qs.filter(payment_method=params['payment_method'])
        if params.get('date_from'):
            qs = qs.filter(created_at__date__gte=parse_day(params['date_from'], field='date_from'))
        if params.get('date_to'):
            qs = qs.filter(created_at__date__lte=parse_day(params['date_to'], field='date_to'))
        if params.get('search'):
            term = params['search'].strip().lstrip('#')
            condition = Q(customer__name__icontains=term) | Q(customer__phone__icontains=term) | Q(
                payments__reference_id__icontains=term)
            if term.isdigit():
                condition |= Q(pk=int(term))
            qs = qs.filter(condition).distinct()
        return qs

    @action(detail=True, methods=['post'], url_path='returns')
    def create_return(self, request, pk=None):
        """مرتجع جزئي أو كامل — للمدير والمشرف (المرتجع يُخرج مالاً من الصندوق)."""
        if request.user.role not in PRIVILEGED_ROLES:
            return Response({'detail': 'المرتجع يتطلب صلاحية مدير أو مشرف.'},
                            status=status.HTTP_403_FORBIDDEN)
        invoice = self.get_object()
        serializer = SaleReturnInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            sale_return = services.create_sale_return(
                invoice=invoice,
                items=data['items'],
                refund_method=data['refund_method'],
                reason=data.get('reason', ''),
                bank_account=data.get('bank_account'),
                bank_name=data.get('bank_name', ''),
                reference_id=data.get('reference_id'),
                user=request.user,
            )
        except services.InventoryError as exc:
            raise business_error(exc)
        return Response(SaleReturnSerializer(sale_return).data, status=status.HTTP_201_CREATED)


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC APIS (AllowAny)
# ═══════════════════════════════════════════════════════════════════════════════

class PublicCatalogPagination(PageNumberPagination):
    """صفحات المتجر العام: عدد إجمالي ورابط التالي بدل قصّ الكتالوج عند 500."""

    page_size = 24
    page_size_query_param = 'page_size'
    max_page_size = 60


PUBLIC_PARTS_QUERYSET = SparePart.objects.select_related('category').prefetch_related('compatible_cars')


@api_view(['GET'])
@permission_classes([AllowAny])
def public_featured_parts(request):
    """Fetch featured spare parts with fully resolved Category and CarModels."""
    parts = PUBLIC_PARTS_QUERYSET.filter(is_featured=True)[:60]
    serializer = PublicSparePartSerializer(parts, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_part_detail(request, pk):
    """Fetch details of a single spare part with fully resolved Category and CarModels."""
    try:
        part = PUBLIC_PARTS_QUERYSET.get(pk=pk)
    except SparePart.DoesNotExist:
        return Response({'detail': 'قطعة الغيار غير موجودة.'}, status=status.HTTP_404_NOT_FOUND)

    return Response(PublicSparePartSerializer(part, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_parts_list(request):
    """
    كتالوج المتجر العام مقسّماً إلى صفحات، مع تصفية بالفئة والسيارة والبحث.

    يعيد {count, next, previous, results}؛ التصفح يصل إلى كامل الكتالوج.
    """
    qs = PUBLIC_PARTS_QUERYSET.order_by('-created_at', '-pk')

    category_id = request.query_params.get('category_id')
    if category_id:
        qs = qs.filter(category_id=parse_id(category_id, 'category_id'))

    car_model_id = request.query_params.get('car_model_id')
    if car_model_id:
        qs = qs.filter(compatible_cars__id=parse_id(car_model_id, 'car_model_id')).distinct()

    search = request.query_params.get('search')
    if search:
        qs = search_parts(qs, search)

    if request.query_params.get('in_stock') in ('1', 'true'):
        qs = qs.filter(stock_quantity__gt=0)

    paginator = PublicCatalogPagination()
    page = paginator.paginate_queryset(qs, request)
    data = PublicSparePartSerializer(page, many=True, context={'request': request}).data
    return paginator.get_paginated_response(data)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PublicWriteThrottle])
def public_contact_submit(request):
    """Receive public landing page contact form message submissions."""
    serializer = ContactMessageSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def demo_accounts():
    from api.management.commands.seed_demo import DEMO_PASSWORD, DEMO_USERS
    labels = {'manager': 'مدير', 'employee': 'كاشير'}
    return [
        {'username': username, 'password': DEMO_PASSWORD, 'role': labels.get(role, role)}
        for username, _, role in DEMO_USERS
    ]


@api_view(['GET'])
@permission_classes([AllowAny])
def public_settings(request):
    """Dynamic branding configurations, active contact platforms, categories, and vehicle models."""
    settings_obj = SiteSetting.load()

    return Response({
        'settings': SiteSettingSerializer(settings_obj, context={'request': request}).data,
        'contact_methods': ContactMethodSerializer(
            ContactMethod.objects.filter(is_active=True), many=True, context={'request': request}
        ).data,
        'categories': CategorySerializer(
            Category.objects.annotate(annotated_parts_count=Count('spare_parts')).order_by('name'),
            many=True,
            context={'request': request},
        ).data,
        'car_models': CarModelSerializer(
            CarModel.objects.all().order_by('brand', 'model_name'),
            many=True,
            context={'request': request},
        ).data,
        # نسخة العرض فقط: حسابات التجربة المنشورة أصلاً في صفحة الدخول.
        'demo_accounts': demo_accounts() if settings.DEMO_MODE else [],
    })


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN / MANAGER SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated, RoleBasedPermission])
def admin_settings_view(request):
    """إعدادات المؤسسة: الهوية والإيصال والتسعير والخصومات (التعديل للمدير والمشرف)."""
    if request.method == 'PUT' and request.user.role not in PRIVILEGED_ROLES:
        return Response({'detail': 'غير مصرح للقيام بهذا الإجراء.'}, status=status.HTTP_403_FORBIDDEN)

    settings_obj = SiteSetting.load()
    if request.method == 'GET':
        return Response(BusinessSettingsSerializer(settings_obj, context={'request': request}).data)

    serializer = BusinessSettingsSerializer(
        settings_obj, data=request.data, partial=True, context={'request': request}
    )
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def receipt_settings_view(request):
    """هوية البائع ومقاس الورق لطباعة الإيصال (لكل الموظفين)."""
    return Response(ReceiptSettingsSerializer(SiteSetting.load(), context={'request': request}).data)


class ContactMethodViewSet(viewsets.ModelViewSet):
    """CRUD platform contact methods for Admin Dashboard management."""
    queryset = ContactMethod.objects.all()
    serializer_class = ContactMethodSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]


class ContactMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """سجل رسائل التواصل — للمدير والمشرف فقط (يحتوي بيانات عملاء)."""
    queryset = ContactMessage.objects.all().order_by('-created_at')
    serializer_class = ContactMessageSerializer
    permission_classes = [IsAuthenticated, IsManagerOrSupervisor]


# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMERS / SUPPLIERS / SUPPLY DEALS
# ═══════════════════════════════════════════════════════════════════════════════

class CustomerViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """
    العملاء مع أرصدتهم. الموظف يضيف العميل من نقطة البيع ويحصّل منه، ولا
    يعدّل خصمه أو حد ائتمانه ولا يحذفه (سياسة الأدوار).
    """
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['name', 'phone', 'location', 'whatsapp_number']
    filterset_fields = ['customer_type']
    protected_delete_message = (
        'لا يمكن حذف هذا العميل لأن له فواتير أو دفعات مسجّلة في حسابه.'
    )

    def get_queryset(self):
        qs = services.annotate_customer_balances(Customer.objects.all())
        if self.request.query_params.get('has_balance') in ('1', 'true'):
            qs = qs.filter(annotated_balance__gt=0).order_by('-annotated_balance')
        return qs

    @action(detail=True, methods=['get'], url_path='statement')
    def statement(self, request, pk=None):
        """كشف حساب العميل بالرصيد الجاري."""
        customer = self.get_object()
        entries = services.customer_statement(customer)
        return Response({
            'customer': CustomerSerializer(customer, context=self.get_serializer_context()).data,
            'entries': [
                {**entry, 'debit': str(entry['debit']), 'credit': str(entry['credit']),
                 'balance': str(entry['balance'])}
                for entry in entries
            ],
        })

    @action(detail=True, methods=['post'], url_path='payments')
    def collect(self, request, pk=None):
        """تحصيل دفعة من دين العميل (نقداً أو تحويلاً)."""
        customer = self.get_object()
        serializer = CollectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payment = services.record_collection(customer=customer, user=request.user, **serializer.validated_data)
        except services.InventoryError as exc:
            raise business_error(exc)
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class SupplierViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    """CRUD for suppliers."""
    queryset = Supplier.objects.all().prefetch_related('supplied_parts', 'deals')
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['company_name', 'contact_person', 'phone_number', 'address']
    protected_delete_message = (
        'لا يمكن حذف هذا المورد لأن له عمليات توريد مسجّلة تفسّر مصدر المخزون '
        'وتكلفته. عطّل المورد بدل حذفه.'
    )

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SupplierDetailSerializer
        return super().get_serializer_class()


class SupplyDealViewSet(viewsets.ModelViewSet):
    """CRUD for supply deals/restock entries — stock changes go through services."""
    queryset = SupplyDeal.objects.select_related('supplier', 'spare_part')
    serializer_class = SupplyDealSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['invoice_reference', 'spare_part__name', 'supplier__company_name']
    filterset_fields = ['supplier', 'spare_part']
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def destroy(self, request, *args, **kwargs):
        deal = self.get_object()
        try:
            services.delete_supply_deal(deal, user=request.user)
        except services.InventoryError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ═══════════════════════════════════════════════════════════════════════════════
# STOCK MOVEMENTS (سجل حركات المخزون)
# ═══════════════════════════════════════════════════════════════════════════════

class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """سجل حركات المخزون للقراءة فقط."""
    queryset = StockMovement.objects.select_related('spare_part', 'created_by')
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    filterset_fields = ['spare_part', 'reason']
    ordering_fields = ['created_at', 'change']


# ═══════════════════════════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

REPORT_PERIODS = {
    'daily': (timedelta(days=30), TruncDay),
    'weekly': (timedelta(weeks=12), TruncWeek),
    'monthly': (timedelta(days=365), TruncMonth),
    'yearly': (timedelta(days=365 * 5), TruncYear),
}


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrSupervisor])
def reports_sales(request):
    """
    تقارير المبيعات والأرباح مجمّعة حسب الفترة الزمنية.

    الإيراد والربح صافيان من المرتجعات؛ النقدي والبنكي من الدفعات الفعلية
    (لا من طريقة دفع الفاتورة، فالفاتورة قد تُدفع بعدة طرق أو آجلاً).
    """
    period = request.query_params.get('period', 'daily').lower()
    if period not in REPORT_PERIODS:
        return Response(
            {'error': 'الفترة المحددة غير صالحة. اختر: daily, weekly, monthly, yearly'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    span, trunc = REPORT_PERIODS[period]
    start_date = timezone.now() - span
    scoped = reports.scoped(start_date)
    figures = reports.period_figures(start_date)
    expenses = reports.expenses_total(timezone.localtime(start_date).date())

    sale_payments = scoped['sale_payments']
    cash_payments = sale_payments.filter(method=Payment.Method.CASH)
    bank_payments = sale_payments.filter(method=Payment.Method.BANK)
    other_currency_orders = Invoice.objects.filter(created_at__gte=start_date).exclude(
        currency=settings.BASE_CURRENCY,
    ).count()

    breakdown = {}

    def bucket(label):
        return breakdown.setdefault(label, {
            'revenue': reports.ZERO, 'orders': 0, 'returns': reports.ZERO,
            'cash_revenue': reports.ZERO, 'bank_revenue': reports.ZERO,
        })

    for row in scoped['invoices'].annotate(p=trunc('created_at')).values('p').annotate(
        revenue=Sum('total_amount'), orders=Count('id'),
    ):
        entry = bucket(row['p'])
        entry['revenue'] += row['revenue'] or 0
        entry['orders'] += row['orders']
    for row in scoped['returns'].annotate(p=trunc('created_at')).values('p').annotate(v=Sum('total_amount')):
        bucket(row['p'])['returns'] += row['v'] or 0
    for row in sale_payments.annotate(p=trunc('created_at')).values('p', 'method').annotate(v=Sum('amount')):
        key = 'cash_revenue' if row['method'] == Payment.Method.CASH else 'bank_revenue'
        bucket(row['p'])[key] += row['v'] or 0

    revenue = figures['revenue']
    return Response({
        'period': period,
        'currency': settings.BASE_CURRENCY,
        'overall': {
            'currency': settings.BASE_CURRENCY,
            'other_currency_orders': other_currency_orders,
            'gross_revenue': float(figures['gross_revenue']),
            'returns_total': float(figures['returns_total']),
            'returns_count': figures['returns_count'],
            'total_revenue': float(revenue),
            'total_orders': figures['orders'],
            'cash_sales': float(cash_payments.aggregate(v=Sum('amount'))['v'] or 0),
            'bank_sales': float(bank_payments.aggregate(v=Sum('amount'))['v'] or 0),
            'credit_sales': float(figures['credit_sales']),
            'cash_count': cash_payments.values('invoice').distinct().count(),
            'bank_count': bank_payments.values('invoice').distinct().count(),
            'total_profit': float(figures['profit']),
            'expenses_total': float(expenses),
            'net_profit': float(figures['profit'] - expenses),
            'gross_margin_percent': round(
                float(figures['profit']) / float(revenue) * 100, 2
            ) if revenue else 0.0,
        },
        'breakdown': [
            {
                'period': timezone.localtime(label).strftime('%Y-%m-%d') if label else None,
                'revenue': float(entry['revenue'] - entry['returns']),
                'returns': float(entry['returns']),
                'orders': entry['orders'],
                'cash_revenue': float(entry['cash_revenue']),
                'bank_revenue': float(entry['bank_revenue']),
            }
            for label, entry in sorted(
                breakdown.items(), key=lambda item: item[0] or timezone.now(), reverse=True,
            )
        ],
        'top_products': [
            {
                'id': entry['id'],
                'name': entry['name'],
                'quantity_sold': entry['quantity_sold'],
                'revenue': float(entry['revenue']),
                'profit': float(entry['profit']),
            }
            for entry in reports.top_products(start_date)
        ],
    })


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ORDERS
# ═══════════════════════════════════════════════════════════════════════════════

class PublicOrderViewSet(viewsets.ModelViewSet):
    """طلبات المتجر الإلكتروني: إنشاء عام + إدارة داخلية مع تحديث المخزون."""
    queryset = PublicOrder.objects.prefetch_related('items__spare_part')
    serializer_class = PublicOrderSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    filterset_fields = ['status']
    ordering_fields = ['created_at', 'total_amount']

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated(), RoleBasedPermission()]

    def get_throttles(self):
        if self.action == 'create':
            return [PublicWriteThrottle()]
        return super().get_throttles()

    def create(self, request, *args, **kwargs):
        """
        إنشاء طلب عام — مع تحذير مبكر عن البنود التي قد لا تتوفر عند التأكيد.

        الطلب يُنشأ دائماً بحالة pending وبلا خصم مخزون (التحقق النهائي يحدث
        في services.confirm_public_order) — وهذا قرار تصميمي مقصود ومحفوظ.
        لكن ترك العميل يرى «تم استلام طلبك بنجاح» ثم يتّصل المشرف ليقول
        «الكمية غير متوفرة» تجربة سيئة. لذلك نُرفق قائمة تحذيرية بالبنود غير
        الكافية، بلا منع الطلب (المنع الكامل يرفض طلب قطعة قليلة المخزون مع
        قطعة متوفرة، وهو أسوأ تجارياً).
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        stock_warnings = [
            {
                'part': item.spare_part.name,
                'requested': item.quantity,
                'available': item.spare_part.stock_quantity,
            }
            for item in order.items.select_related('spare_part')
            if item.spare_part.stock_quantity < item.quantity
        ]

        data = self.get_serializer(order).data
        if stock_warnings:
            data['stock_warnings'] = stock_warnings
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """تغيير حالة الطلب مع ضبط المخزون عبر خدمات ذرّية."""
        order = self.get_object()
        new_status = request.data.get('status')

        if new_status and new_status != order.status:
            try:
                if new_status == PublicOrder.Status.CONFIRMED:
                    order = services.confirm_public_order(order, user=request.user)
                elif new_status == PublicOrder.Status.CANCELLED:
                    order = services.cancel_public_order(order, user=request.user)
                elif new_status == PublicOrder.Status.PENDING:
                    # إرجاع طلب مؤكد إلى قيد الانتظار لا يُرجع المخزون (بخلاف
                    # الإلغاء) فيصبح تأكيده لاحقاً خصماً مزدوجاً لنفس البنود.
                    # نمنعه صراحةً ونوجّه المستخدم إلى الإلغاء الذي يُرجع الكميات.
                    if order.status in (PublicOrder.Status.CONFIRMED, PublicOrder.Status.COMPLETED):
                        return Response(
                            {'detail': 'لا يمكن إرجاع طلب مؤكد إلى قيد الانتظار '
                                       'لأن مخزونه خُصم بالفعل. ألغِ الطلب '
                                       '(فيُرجع المخزون) ثم أنشئ طلباً جديداً.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    order.status = PublicOrder.Status.PENDING
                    order.save(update_fields=['status'])
                else:
                    return Response(
                        {'detail': 'حالة غير صالحة.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            except services.InventoryError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(self.get_serializer(order).data)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='invoice')
    def sell(self, request, pk=None):
        """
        بيع الطلب عند استلام المبلغ: فاتورة بأسعار الطلب على عميله (يُنشأ من
        هاتفه إن لم يوجد). تعيد الفاتورة؛ وضغطة ثانية تعيد الفاتورة نفسها.
        """
        order = self.get_object()
        serializer = PublicOrderInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice = services.invoice_public_order(
                order, cashier=request.user, payments=serializer.validated_data['payments'],
            )
        except services.InventoryError as exc:  # PaymentError منه أيضاً
            raise business_error(exc)
        data = InvoiceSerializer(invoice, context=self.get_serializer_context()).data
        replay = getattr(invoice, 'idempotent_replay', False)
        return Response(data, status=status.HTTP_200_OK if replay else status.HTTP_201_CREATED)


# ═══════════════════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════════

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """الإشعارات للقراءة فقط + إجراءات تعليم كمقروء (لا حذف/تعديل مباشر)."""
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated, IsManagerOrSupervisor]

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = Notification.objects.filter(is_read=False).count()
        return Response({'unread_count': count})

    @action(detail=True, methods=['patch', 'post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=['patch', 'post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        Notification.objects.filter(is_read=False).update(is_read=True)
        return Response({'status': 'all notifications marked as read'})
