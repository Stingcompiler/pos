"""
تهيئة لوحة إدارة Django لنظام قطع الغيار.

كانت الواجهة تسجّل 6 نماذج فقط من أصل 18؛ بقية الجداول (الموردون،
التوريد، الطلبات الخارجية، الرسائل، الإشعارات، سجل حركات المخزون) لم تكن
قابلة للإدارة أو المراجعة من اللوحة إطلاقاً.
"""

from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.db import transaction
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.html import format_html

from . import services
from .models import (
    BankAccount,
    DailyClose,
    ExchangeRate,
    Expense,
    Payment,
    SaleReturn,
    SaleReturnItem,
    StockCount,
    StockCountLine,
    CarModel,
    Category,
    ContactMessage,
    ContactMethod,
    CustomUser,
    Customer,
    Invoice,
    InvoiceItem,
    Notification,
    PublicOrder,
    PublicOrderItem,
    SiteSetting,
    SparePart,
    StockMovement,
    Supplier,
    SupplyDeal,
)


admin.site.site_header = 'اسبير — لوحة الإدارة'
admin.site.site_title = 'اسبير'
admin.site.index_title = 'إدارة البيانات'

# ─────────────────────────────────────────────────────────────────────────────
# المستخدمون
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'role', 'is_active', 'is_staff', 'date_joined']
    list_filter = ['role', 'is_active', 'is_staff']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    fieldsets = UserAdmin.fieldsets + (
        ('الدور الوظيفي', {'fields': ('role',)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('الدور الوظيفي', {'fields': ('role',)}),
    )


# ─────────────────────────────────────────────────────────────────────────────
# البيانات المرجعية
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_at']
    search_fields = ['name']
    ordering = ['name']


@admin.register(CarModel)
class CarModelAdmin(admin.ModelAdmin):
    list_display = ['brand', 'model_name', 'year_start', 'year_end']
    list_filter = ['brand']
    search_fields = ['brand', 'model_name']
    ordering = ['brand', 'model_name']


@admin.register(SparePart)
class SparePartAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'part_number', 'category', 'supplier', 'selling_price',
        'purchase_price', 'stock_quantity', 'min_stock_alert',
        'low_stock_indicator', 'is_featured', 'shelf_location',
    ]
    # stock_quantity فلتر غير مفيد كقيمة رقمية؛ استبدلناه بمرشّحات عملية.
    list_filter = ['category', 'is_featured', 'supplier']
    search_fields = [
        'name', 'part_number', 'shelf_location', 'description',
        'oem_number', 'barcode', 'aliases', 'brand',
    ]
    filter_horizontal = ['compatible_cars']
    list_select_related = ['category', 'supplier']
    autocomplete_fields = ['category', 'supplier']
    readonly_fields = ['created_at', 'updated_at']

    def get_readonly_fields(self, request, obj=None):
        # الرصيد يتغيّر بالتوريد والبيع والتسوية فقط، ومتوسط التكلفة تحسبه
        # خدمة التوريد. سعر الشراء يبقى قابلاً للإدخال عند الإنشاء لأنه مطلوب.
        fields = [*super().get_readonly_fields(request, obj), 'stock_quantity']
        if obj is not None:
            fields.append('purchase_price')
        return fields

    def save_model(self, request, obj, form, change):
        """
        حفظ بيانات القطعة دون كتابة الرصيد أو التكلفة مباشرةً.

        أي فرق في الرصيد يصل إلى هنا (رغم أن الحقل للقراءة فقط في النموذج)
        يمرّ عبر services.adjust_stock فيُسجَّل كحركة تسوية باسم المستخدم.
        """
        if not change:
            # الرصيد الافتتاحي تسوية مستقلة لها حركة، لا قيمة تُكتب مع القطعة.
            obj.stock_quantity = 0
            super().save_model(request, obj, form, change)
            return

        with transaction.atomic():
            current = SparePart.objects.select_for_update().get(pk=obj.pk)
            requested_quantity = obj.stock_quantity
            obj.stock_quantity = current.stock_quantity
            obj.purchase_price = current.purchase_price
            super().save_model(request, obj, form, change)

            if requested_quantity != current.stock_quantity:
                services.adjust_stock(
                    obj.pk, requested_quantity,
                    user=request.user, reference='تسوية من لوحة الإدارة',
                )
                obj.stock_quantity = requested_quantity

    @admin.display(description='مخزون منخفض', boolean=True)
    def low_stock_indicator(self, obj):
        return obj.is_low_stock


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['company_name', 'contact_person', 'phone_number', 'email', 'is_active']
    list_filter = ['is_active']
    search_fields = ['company_name', 'contact_person', 'phone_number', 'email']
    ordering = ['company_name']


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['name', 'phone', 'customer_type', 'credit_limit', 'whatsapp_number', 'location']
    list_filter = ['customer_type']
    search_fields = ['name', 'phone', 'location', 'email']
    ordering = ['name']


# ─────────────────────────────────────────────────────────────────────────────
# المبيعات
# ─────────────────────────────────────────────────────────────────────────────

class ReadOnlyInlineMixin:
    """بنود مستند مالي: تُعرض فقط، فإضافتها أو تعديلها لا يمرّ بخدمات المخزون."""

    extra = 0
    can_delete = False

    def get_readonly_fields(self, request, obj=None):
        return self.fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class InvoiceItemInline(ReadOnlyInlineMixin, admin.TabularInline):
    model = InvoiceItem
    fields = ['spare_part', 'quantity', 'unit_price', 'cost_price', 'subtotal']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'cashier', 'customer', 'total_amount', 'currency',
        'payment_method', 'created_at',
    ]
    list_filter = ['payment_method', 'currency', 'created_at', 'cashier']
    search_fields = ['id', 'customer__name', 'reference_id']
    date_hierarchy = 'created_at'
    list_select_related = ['cashier', 'customer']
    inlines = [InvoiceItemInline]
    # الفواتير غير قابلة للتعديل: الخصم يصبح غير متوازن مع المخزون.
    readonly_fields = [
        'cashier', 'customer', 'total_amount', 'currency', 'payment_method',
        'bank_name', 'reference_id', 'sender_account_number', 'created_at',
    ]

    def has_add_permission(self, request):
        # الفاتورة تُنشأ من نقطة البيع عبر services.create_invoice فقط؛ إنشاؤها
        # هنا يسجّل بيعاً بلا خصم مخزون.
        return False

    def has_change_permission(self, request, obj=None):
        # السماح بالعرض فقط للفواتير القائمة.
        return False if obj is not None else super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return False


# ─────────────────────────────────────────────────────────────────────────────
# التوريد والمخزون
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(SupplyDeal)
class SupplyDealAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'supplier', 'spare_part', 'quantity_added',
        'purchase_price', 'total_cost', 'date_received', 'invoice_reference',
    ]
    list_filter = ['supplier', 'date_received']
    search_fields = ['spare_part__name', 'spare_part__part_number', 'invoice_reference']
    date_hierarchy = 'date_received'
    list_select_related = ['supplier', 'spare_part']

    def has_add_permission(self, request):
        # التوريد يُسجَّل من صفحة المورد عبر services.create_supply_deal التي
        # تزيد الرصيد وتحدّث متوسط التكلفة؛ الإضافة من هنا تحفظ مستنداً بلا أثر.
        return False

    def has_change_permission(self, request, obj=None):
        # تعديل التوريد يفسد المخزون؛ الحذف يمرّ عبر خدمة تعكس الأثر.
        return False

    def get_actions(self, request):
        # الحذف الجماعي الافتراضي يحذف الصفوف مباشرةً دون عكس الرصيد والتكلفة.
        actions = super().get_actions(request)
        actions.pop('delete_selected', None)
        return actions

    def delete_model(self, request, obj):
        services.delete_supply_deal(obj, user=request.user)

    def delete_queryset(self, request, queryset):
        for deal in queryset:
            services.delete_supply_deal(deal, user=request.user)

    def delete_view(self, request, object_id, extra_context=None):
        # delete_view ينفّذ الحذف داخل معاملة؛ رفض الخدمة يُلغيها كاملة ونعرض
        # السبب بدل خطأ خادم.
        try:
            return super().delete_view(request, object_id, extra_context)
        except services.InventoryError as exc:
            self.message_user(request, str(exc), level=messages.ERROR)
            return HttpResponseRedirect(reverse('admin:api_supplydeal_changelist'))


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'spare_part', 'change', 'quantity_after',
        'reason', 'reference', 'created_by', 'created_at',
    ]
    list_filter = ['reason', 'created_at']
    search_fields = ['spare_part__name', 'spare_part__part_number', 'reference']
    date_hierarchy = 'created_at'
    list_select_related = ['spare_part', 'created_by']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        # السجل تدقيقي: لا يُحذف.
        return False


# ─────────────────────────────────────────────────────────────────────────────
# الطلبات الخارجية
# ─────────────────────────────────────────────────────────────────────────────

class PublicOrderItemInline(ReadOnlyInlineMixin, admin.TabularInline):
    model = PublicOrderItem
    fields = ['spare_part', 'quantity', 'unit_price']


@admin.register(PublicOrder)
class PublicOrderAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'customer_name', 'phone_number', 'status',
        'total_amount', 'location', 'created_at',
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['customer_name', 'phone_number', 'email', 'location']
    date_hierarchy = 'created_at'
    inlines = [PublicOrderItemInline]
    # الحالة تتغيّر بإجراءَي التأكيد والإلغاء فقط، لأنهما يخصمان المخزون
    # ويُرجعانه؛ تعديلها كحقل يغيّر الحالة دون أي أثر على الرصيد.
    readonly_fields = ['status', 'total_amount', 'created_at']
    actions = ['confirm_orders', 'cancel_orders']

    def has_add_permission(self, request):
        # الطلب يُنشأ من المتجر بأسعار ولقطات تكلفة يحددها الخادم.
        return False

    def has_delete_permission(self, request, obj=None):
        # حذف الطلب يخفي أثر حركات المخزون المرتبطة به.
        return False

    def _apply_to_orders(self, request, queryset, service, done_label):
        done = 0
        for order in queryset:
            try:
                service(order, user=request.user)
                done += 1
            except services.InventoryError as exc:
                self.message_user(request, f'طلب #{order.pk}: {exc}', level=messages.ERROR)
        if done:
            self.message_user(request, f'{done_label}: {done}', level=messages.SUCCESS)

    @admin.action(description='تأكيد الطلبات المحددة (خصم المخزون)', permissions=['change'])
    def confirm_orders(self, request, queryset):
        self._apply_to_orders(request, queryset, services.confirm_public_order, 'طلبات مؤكدة')

    @admin.action(description='إلغاء الطلبات المحددة (إرجاع مخزون المؤكد منها)', permissions=['change'])
    def cancel_orders(self, request, queryset):
        self._apply_to_orders(request, queryset, services.cancel_public_order, 'طلبات ملغاة')


# ─────────────────────────────────────────────────────────────────────────────
# الواجهة العامة والإشعارات
# ─────────────────────────────────────────────────────────────────────────────

@admin.register(SiteSetting)
class SiteSettingAdmin(admin.ModelAdmin):
    list_display = ['site_name', 'hero_title']

    def has_add_permission(self, request):
        # سجل مفرد (pk=1) — التعديل فقط.
        return not SiteSetting.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ContactMethod)
class ContactMethodAdmin(admin.ModelAdmin):
    list_display = ['platform_name', 'value', 'icon_name', 'is_active']
    list_filter = ['is_active']
    search_fields = ['platform_name', 'value']


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'phone', 'created_at']
    search_fields = ['name', 'email', 'phone', 'message']
    date_hierarchy = 'created_at'
    readonly_fields = ['name', 'email', 'phone', 'message', 'created_at']

    def has_add_permission(self, request):
        return False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['id', 'notification_type', 'short_message', 'is_read', 'created_at']
    list_filter = ['notification_type', 'is_read', 'created_at']
    search_fields = ['message']
    date_hierarchy = 'created_at'

    @admin.display(description='المحتوى')
    def short_message(self, obj):
        return format_html('{}', obj.message[:60])


# ─────────────────────────────────────────────────────────────────────────────
# المدفوعات والمرتجعات والصندوق والتسعير والجرد
# ─────────────────────────────────────────────────────────────────────────────

class ReadOnlyAdminMixin:
    """سجلات مالية تُنشأ عبر الخدمات فقط؛ اللوحة للعرض والمراجعة."""

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'account_number', 'is_active']
    list_filter = ['is_active']


@admin.register(Payment)
class PaymentAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'id', 'kind', 'method', 'amount', 'invoice', 'customer', 'bank_name',
        'reference_id', 'verified_at', 'created_by', 'created_at',
    ]
    list_filter = ['kind', 'method', 'bank_account', 'created_at']
    search_fields = ['reference_id', 'sender_account_number', 'customer__name']
    date_hierarchy = 'created_at'
    list_select_related = ['invoice', 'customer', 'created_by']


class SaleReturnItemInline(ReadOnlyInlineMixin, admin.TabularInline):
    model = SaleReturnItem
    fields = ['invoice_item', 'quantity', 'unit_price', 'cost_price', 'subtotal']


@admin.register(SaleReturn)
class SaleReturnAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['id', 'invoice', 'refund_method', 'total_amount', 'created_by', 'created_at']
    list_filter = ['refund_method', 'created_at']
    date_hierarchy = 'created_at'
    inlines = [SaleReturnItemInline]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['date', 'category', 'amount', 'method', 'bank_account', 'created_by']
    list_filter = ['method', 'category', 'date']
    date_hierarchy = 'date'
    readonly_fields = ['created_by', 'created_at']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(DailyClose)
class DailyCloseAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['date', 'expected_cash', 'counted_cash', 'difference', 'closed_by', 'closed_at']
    date_hierarchy = 'date'


@admin.register(ExchangeRate)
class ExchangeRateAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['currency', 'rate', 'created_by', 'created_at']
    list_filter = ['currency']


class StockCountLineInline(ReadOnlyInlineMixin, admin.TabularInline):
    model = StockCountLine
    fields = ['spare_part', 'counted_quantity', 'system_quantity']


@admin.register(StockCount)
class StockCountAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['id', 'title', 'status', 'created_by', 'created_at', 'applied_at']
    list_filter = ['status']
    inlines = [StockCountLineInline]
