"""
Admin configuration for the Auto Spare Parts POS system.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, Category, CarModel, SparePart, Invoice, InvoiceItem


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'role', 'is_active', 'date_joined']
    list_filter = ['role', 'is_active']
    fieldsets = UserAdmin.fieldsets + (
        ('الدور', {'fields': ('role',)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('الدور', {'fields': ('role',)}),
    )


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_at']
    search_fields = ['name']


@admin.register(CarModel)
class CarModelAdmin(admin.ModelAdmin):
    list_display = ['brand', 'model_name', 'year_start', 'year_end']
    list_filter = ['brand']
    search_fields = ['brand', 'model_name']


@admin.register(SparePart)
class SparePartAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'part_number', 'category', 'selling_price',
        'stock_quantity', 'is_low_stock', 'shelf_location',
    ]
    list_filter = ['category', 'stock_quantity']
    search_fields = ['name', 'part_number']
    filter_horizontal = ['compatible_cars']


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0
    readonly_fields = ['subtotal']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['id', 'cashier', 'total_amount', 'created_at']
    list_filter = ['created_at', 'cashier']
    inlines = [InvoiceItemInline]
    readonly_fields = ['total_amount', 'created_at']
