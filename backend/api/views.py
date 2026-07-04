"""
API Views for the Auto Spare Parts POS system.
Includes custom auth views (login/logout/refresh/me) and CRUD viewsets.
"""

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.db.models import Sum, Count, Q, F
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import Category, CarModel, SparePart, Invoice, InvoiceItem, SiteSetting, ContactMethod, ContactMessage, Customer, Supplier, SupplyDeal, PublicOrder, PublicOrderItem, Notification
from .serializers import (
    UserSerializer, UserCreateSerializer,
    CategorySerializer, CarModelSerializer,
    SparePartSerializer, SparePartListSerializer,
    InvoiceSerializer, InvoiceListSerializer,
    SiteSettingSerializer, ContactMethodSerializer, ContactMessageSerializer, PublicSparePartSerializer,
    CustomerSerializer, SupplierSerializer, SupplyDealSerializer, SupplierDetailSerializer,
    PublicOrderSerializer, PublicOrderItemSerializer, NotificationSerializer,
)
from .permissions import RoleBasedPermission, IsManager

User = get_user_model()


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

def _set_auth_cookies(response, access_token, refresh_token):
    """Helper to set HttpOnly auth cookies on a response."""
    response.set_cookie(
        key=settings.AUTH_COOKIE,
        value=str(access_token),
        httponly=settings.AUTH_COOKIE_HTTP_ONLY,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        secure=settings.AUTH_COOKIE_SECURE,
        path=settings.AUTH_COOKIE_PATH,
        max_age=settings.AUTH_COOKIE_MAX_AGE,
    )
    response.set_cookie(
        key=settings.AUTH_COOKIE_REFRESH,
        value=str(refresh_token),
        httponly=settings.AUTH_COOKIE_HTTP_ONLY,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        secure=settings.AUTH_COOKIE_SECURE,
        path=settings.AUTH_COOKIE_PATH,
        max_age=settings.AUTH_COOKIE_MAX_AGE,
    )
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Authenticate user, set HttpOnly cookies, and return user data.
    """
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'error': 'اسم المستخدم وكلمة المرور مطلوبان'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=username, password=password)

    if user is None:
        return Response(
            {'error': 'بيانات الدخول غير صحيحة'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {'error': 'هذا الحساب غير مفعل'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Generate tokens
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token

    # Build response with user data
    response = Response({
        'id': user.id,
        'username': user.username,
        'role': user.role,
        'first_name': user.first_name,
        'last_name': user.last_name,
    })

    # Set HttpOnly cookies
    _set_auth_cookies(response, access, refresh)

    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """Clear the HttpOnly auth cookies."""
    response = Response({'message': 'تم تسجيل الخروج بنجاح'})
    response.delete_cookie(settings.AUTH_COOKIE, path=settings.AUTH_COOKIE_PATH)
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH, path=settings.AUTH_COOKIE_PATH)
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_view(request):
    """Refresh the access token using the refresh token cookie."""
    refresh_token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)

    if not refresh_token:
        return Response(
            {'error': 'لا يوجد رمز تحديث'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        refresh = RefreshToken(refresh_token)
        new_access = refresh.access_token

        # Rotate refresh token
        new_refresh = RefreshToken.for_user(
            User.objects.get(id=refresh.payload.get('user_id'))
        )

        response = Response({'message': 'تم تحديث الرمز بنجاح'})
        _set_auth_cookies(response, new_access, new_refresh)
        return response

    except (TokenError, User.DoesNotExist):
        return Response(
            {'error': 'رمز التحديث غير صالح'},
            status=status.HTTP_401_UNAUTHORIZED,
        )


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
# DASHBOARD STATS VIEW
# ═══════════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Return dashboard statistics."""
    today = timezone.now().date()

    total_parts = SparePart.objects.count()
    low_stock_count = SparePart.objects.filter(
        stock_quantity__lte=F('min_stock_alert')
    ).count()
    today_invoices = Invoice.objects.filter(created_at__date=today)
    today_count = today_invoices.count()
    today_revenue = today_invoices.aggregate(
        total=Sum('total_amount')
    )['total'] or 0

    total_invoices = Invoice.objects.count()
    total_revenue = Invoice.objects.aggregate(
        total=Sum('total_amount')
    )['total'] or 0

    # Public e-commerce order stats
    total_public_orders = PublicOrder.objects.count()
    pending_public_orders = PublicOrder.objects.filter(status=PublicOrder.Status.PENDING).count()

    # Low stock items
    low_stock_items = SparePart.objects.filter(
        stock_quantity__lte=F('min_stock_alert')
    ).values('id', 'name', 'part_number', 'stock_quantity', 'min_stock_alert')[:10]

    return Response({
        'total_parts': total_parts,
        'low_stock_count': low_stock_count,
        'today_invoices': today_count,
        'today_revenue': float(today_revenue),
        'total_invoices': total_invoices,
        'total_revenue': float(total_revenue),
        'total_public_orders': total_public_orders,
        'pending_public_orders': pending_public_orders,
        'low_stock_items': list(low_stock_items),
    })


# ═══════════════════════════════════════════════════════════════════════════════
# CRUD VIEWSETS
# ═══════════════════════════════════════════════════════════════════════════════

class UserViewSet(viewsets.ModelViewSet):
    """CRUD for users — Manager only."""
    queryset = User.objects.all().order_by('-date_joined')
    permission_classes = [IsAuthenticated, IsManager]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    """CRUD for categories."""
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['name']


class CarModelViewSet(viewsets.ModelViewSet):
    """CRUD for car models."""
    queryset = CarModel.objects.all()
    serializer_class = CarModelSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['brand', 'model_name']
    filterset_fields = ['brand']


class SparePartViewSet(viewsets.ModelViewSet):
    """CRUD for spare parts with search and filtering."""
    queryset = SparePart.objects.select_related('category', 'supplier').prefetch_related('compatible_cars')
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    search_fields = ['name', 'part_number', 'shelf_location']
    filterset_fields = ['category', 'stock_quantity', 'compatible_cars', 'is_featured']
    ordering_fields = ['name', 'selling_price', 'stock_quantity', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return SparePartListSerializer
        return SparePartSerializer

    @action(detail=False, methods=['get'], url_path='search-pos')
    def search_pos(self, request):
        """Optimized search endpoint for POS screen."""
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response([])

        parts = SparePart.objects.filter(
            Q(name__icontains=query) |
            Q(part_number__icontains=query)
        ).filter(stock_quantity__gt=0).select_related('category')[:20]

        serializer = SparePartListSerializer(parts, many=True)
        return Response(serializer.data)


class InvoiceViewSet(viewsets.ModelViewSet):
    """CRUD for invoices with nested items."""
    queryset = Invoice.objects.select_related('cashier').prefetch_related('items__spare_part')
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    ordering_fields = ['created_at', 'total_amount']

    def get_serializer_class(self):
        if self.action == 'list':
            return InvoiceListSerializer
        return InvoiceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Employees can only see their own invoices
        if self.request.user.role == 'employee':
            qs = qs.filter(cashier=self.request.user)
        
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC APIS (AllowAny)
# ═══════════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([AllowAny])
def public_featured_parts(request):
    """Fetch featured spare parts with fully resolved Category and CarModels."""
    parts = SparePart.objects.filter(is_featured=True).select_related('category').prefetch_related('compatible_cars')
    serializer = PublicSparePartSerializer(parts, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_part_detail(request, pk):
    """Fetch details of a single spare part with fully resolved Category and CarModels."""
    try:
        part = SparePart.objects.select_related('category').prefetch_related('compatible_cars').get(pk=pk)
        serializer = PublicSparePartSerializer(part, context={'request': request})
        return Response(serializer.data)
    except SparePart.DoesNotExist:
        return Response({'detail': 'قطعة الغيار غير موجودة.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_parts_list(request):
    """Public list of spare parts with optional filtering by category_id and car_model_id."""
    qs = SparePart.objects.select_related('category').prefetch_related('compatible_cars').all().order_by('-created_at')
    
    category_id = request.query_params.get('category_id')
    if category_id:
        qs = qs.filter(category_id=category_id)
        
    car_model_id = request.query_params.get('car_model_id')
    if car_model_id:
        qs = qs.filter(compatible_cars__id=car_model_id)
        
    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(name__icontains=search) | 
            Q(part_number__icontains=search) | 
            Q(description__icontains=search)
        )
        
    serializer = PublicSparePartSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
def public_contact_submit(request):
    """Receive public landing page contact form message submissions."""
    serializer = ContactMessageSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_settings(request):
    """Dynamic branding configurations, active contact platforms, categories, and vehicle models."""
    settings_obj, _ = SiteSetting.objects.get_or_create(pk=1)
    settings_serializer = SiteSettingSerializer(settings_obj)

    contact_methods = ContactMethod.objects.filter(is_active=True)
    contact_serializer = ContactMethodSerializer(contact_methods, many=True)

    categories = Category.objects.all().order_by('name')
    categories_serializer = CategorySerializer(categories, many=True, context={'request': request})

    car_models = CarModel.objects.all().order_by('brand', 'model_name')
    car_models_serializer = CarModelSerializer(car_models, many=True, context={'request': request})

    return Response({
        'settings': settings_serializer.data,
        'contact_methods': contact_serializer.data,
        'categories': categories_serializer.data,
        'car_models': car_models_serializer.data,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN / MANAGER SETTINGS & CRUD VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated, RoleBasedPermission])
def admin_settings_view(request):
    """Manage dynamic site configuration (Manager or Supervisor only for updates)."""
    if request.method == 'PUT' and request.user.role not in ['manager', 'supervisor']:
        return Response({'detail': 'غير مصرح للقيام بهذا الإجراء.'}, status=status.HTTP_403_FORBIDDEN)

    settings_obj, _ = SiteSetting.objects.get_or_create(pk=1)
    if request.method == 'GET':
        serializer = SiteSettingSerializer(settings_obj)
        return Response(serializer.data)
    elif request.method == 'PUT':
        serializer = SiteSettingSerializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ContactMethodViewSet(viewsets.ModelViewSet):
    """CRUD platform contact methods for Admin Dashboard management."""
    queryset = ContactMethod.objects.all()
    serializer_class = ContactMethodSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]


class ContactMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """ReadOnly view of contact submission logs for dashboard review."""
    queryset = ContactMessage.objects.all().order_by('-created_at')
    serializer_class = ContactMessageSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]


class CustomerViewSet(viewsets.ModelViewSet):
    """CRUD for customers."""
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['name', 'phone', 'location']


class SupplierViewSet(viewsets.ModelViewSet):
    """CRUD for suppliers."""
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['company_name', 'contact_person', 'phone_number', 'address']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SupplierDetailSerializer
        return super().get_serializer_class()


class SupplyDealViewSet(viewsets.ModelViewSet):
    """CRUD for supply deals/restock entries."""
    queryset = SupplyDeal.objects.all()
    serializer_class = SupplyDealSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['invoice_reference', 'spare_part__name', 'supplier__company_name']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reports_sales(request):
    """API view to aggregate sales data by time period."""
    from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, TruncYear
    
    period = request.query_params.get('period', 'daily').lower()
    now = timezone.now()
    
    if period == 'daily':
        start_date = now - timezone.timedelta(days=30)
        trunc_func = TruncDay('created_at')
    elif period == 'weekly':
        start_date = now - timezone.timedelta(weeks=12)
        trunc_func = TruncWeek('created_at')
    elif period == 'monthly':
        start_date = now - timezone.timedelta(days=365)
        trunc_func = TruncMonth('created_at')
    elif period == 'yearly':
        start_date = now - timezone.timedelta(days=365 * 5)
        trunc_func = TruncYear('created_at')
    else:
        return Response({'error': 'الفترة المحددة غير صالحة. اختر: daily, weekly, monthly, yearly'}, status=status.HTTP_400_BAD_REQUEST)

    # Core stats
    invoices = Invoice.objects.filter(created_at__gte=start_date)
    
    overall = invoices.aggregate(
        total_revenue=Sum('total_amount'),
        total_orders=Count('id'),
        cash_sales=Sum('total_amount', filter=Q(payment_method='cash')),
        bank_sales=Sum('total_amount', filter=Q(payment_method='bank')),
        cash_count=Count('id', filter=Q(payment_method='cash')),
        bank_count=Count('id', filter=Q(payment_method='bank'))
    )

    # Periodic breakdown
    breakdown = invoices.annotate(
        period_label=trunc_func
    ).values('period_label').annotate(
        revenue=Sum('total_amount'),
        orders=Count('id'),
        cash_revenue=Sum('total_amount', filter=Q(payment_method='cash')),
        bank_revenue=Sum('total_amount', filter=Q(payment_method='bank')),
    ).order_by('-period_label')

    return Response({
        'overall': {
            'total_revenue': float(overall['total_revenue'] or 0),
            'total_orders': overall['total_orders'] or 0,
            'cash_sales': float(overall['cash_sales'] or 0),
            'bank_sales': float(overall['bank_sales'] or 0),
            'cash_count': overall['cash_count'] or 0,
            'bank_count': overall['bank_count'] or 0,
        },
        'breakdown': [
            {
                'period': item['period_label'].strftime('%Y-%m-%d') if item['period_label'] else None,
                'revenue': float(item['revenue'] or 0),
                'orders': item['orders'] or 0,
                'cash_revenue': float(item['cash_revenue'] or 0),
                'bank_revenue': float(item['bank_revenue'] or 0),
            } for item in breakdown
        ]
    })


class PublicOrderViewSet(viewsets.ModelViewSet):
    queryset = PublicOrder.objects.all().prefetch_related('items__spare_part')
    serializer_class = PublicOrderSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated()]


class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

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
