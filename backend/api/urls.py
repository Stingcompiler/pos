"""
URL configuration for the API app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

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

urlpatterns = [
    # Auth endpoints
    path('auth/login/', views.login_view, name='login'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/refresh/', views.refresh_view, name='token_refresh'),
    path('auth/me/', views.me_view, name='me'),

    # Dashboard
    path('dashboard/stats/', views.dashboard_stats, name='dashboard-stats'),

    # Reports
    path('reports/sales/', views.reports_sales, name='reports-sales'),

    # Public Landing Page Endpoints
    path('public/featured-parts/', views.public_featured_parts, name='public-featured-parts'),
    path('public/parts/<int:pk>/', views.public_part_detail, name='public-part-detail'),
    path('public/parts/', views.public_parts_list, name='public-parts-list'),
    path('public/contact/', views.public_contact_submit, name='public-contact-submit'),
    path('public/settings/', views.public_settings, name='public-settings'),

    # Admin Settings
    path('admin/settings/', views.admin_settings_view, name='admin-settings'),

    # Router URLs
    path('', include(router.urls)),
]
