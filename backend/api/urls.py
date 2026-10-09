"""
توجيهات الـ API.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views, views_finance

router = DefaultRouter()
router.register(r'users', views.UserViewSet, basename='user')
router.register(r'categories', views.CategoryViewSet, basename='category')
router.register(r'car-models', views.CarModelViewSet, basename='carmodel')
router.register(r'spare-parts', views.SparePartViewSet, basename='sparepart')
router.register(r'invoices', views.InvoiceViewSet, basename='invoice')
router.register(r'contact-methods', views.ContactMethodViewSet, basename='contactmethod')
router.register(r'contact-messages', views.ContactMessageViewSet, basename='contactmessage')
router.register(r'customers', views.CustomerViewSet, basename='customer')
router.register(r'suppliers', views.SupplierViewSet, basename='supplier')
router.register(r'supply-deals', views.SupplyDealViewSet, basename='supplydeal')
router.register(r'public-orders', views.PublicOrderViewSet, basename='publicorder')
router.register(r'notifications', views.NotificationViewSet, basename='notification')
router.register(r'stock-movements', views.StockMovementViewSet, basename='stockmovement')
router.register(r'bank-accounts', views_finance.BankAccountViewSet, basename='bankaccount')
router.register(r'payments', views_finance.PaymentViewSet, basename='payment')
router.register(r'sale-returns', views_finance.SaleReturnViewSet, basename='salereturn')
router.register(r'expenses', views_finance.ExpenseViewSet, basename='expense')
router.register(r'daily-closes', views_finance.DailyCloseViewSet, basename='dailyclose')
router.register(r'exchange-rates', views_finance.ExchangeRateViewSet, basename='exchangerate')
router.register(r'stock-counts', views_finance.StockCountViewSet, basename='stockcount')

urlpatterns = [
    # Auth endpoints
    path('auth/csrf/', views.csrf_view, name='csrf'),
    path('auth/login/', views.login_view, name='login'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/refresh/', views.refresh_view, name='token_refresh'),
    path('auth/me/', views.me_view, name='me'),

    # Dashboard
    path('dashboard/stats/', views.dashboard_stats, name='dashboard-stats'),

    # Reports
    path('reports/sales/', views.reports_sales, name='reports-sales'),

    # الصندوق والتسعير
    path('daily-summary/', views_finance.daily_summary_view, name='daily-summary'),
    path('pricing/', views_finance.pricing_view, name='pricing'),

    # Public Landing Page Endpoints
    path('public/featured-parts/', views.public_featured_parts, name='public-featured-parts'),
    path('public/parts/<int:pk>/', views.public_part_detail, name='public-part-detail'),
    path('public/parts/', views.public_parts_list, name='public-parts-list'),
    path('public/contact/', views.public_contact_submit, name='public-contact-submit'),
    path('public/settings/', views.public_settings, name='public-settings'),

    # Admin Settings
    path('admin/settings/', views.admin_settings_view, name='admin-settings'),
    path('receipt-settings/', views.receipt_settings_view, name='receipt-settings'),

    # Router URLs
    path('', include(router.urls)),
]
