"""
سيريالايزرات (Serializers) لواجهة نظام قطع الغيار.

منطق المخزون الحسّاس (خصم/إضافة الكميات) لا يوجد هنا إطلاقاً؛ يُفوَّض
بالكامل إلى api.services داخل معاملات ذرّية.
"""

from decimal import Decimal

from rest_framework import serializers, status
from rest_framework.exceptions import APIException
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction

from . import services
from .models import (
    BankAccount,
    Category,
    CarModel,
    DailyClose,
    ExchangeRate,
    Expense,
    Payment,
    SaleReturn,
    SaleReturnItem,
    SparePart,
    Invoice,
    InvoiceItem,
    SiteSetting,
    ContactMethod,
    ContactMessage,
    Customer,
    StockCount,
    StockCountLine,
    Supplier,
    SupplyDeal,
    PublicOrder,
    PublicOrderItem,
    Notification,
    StockMovement,
)

User = get_user_model()

PRIVILEGED_ROLES = ('manager', 'supervisor')


def request_role(serializer):
    request = serializer.context.get('request')
    return getattr(getattr(request, 'user', None), 'role', None)


class HidesCostFieldsMixin:
    """
    حقول التكلفة والربح للمدير والمشرف فقط.

    منع صفحة التقارير عن الموظف لا يكفي إن كانت الـ API نفسها تعيد سعر الشراء
    وربح كل بند. تُحذف الحقول من الاستجابة ما لم يكن المستخدم مديراً أو
    مشرفاً — بما فيه غياب الطلب من السياق (الأكثر أماناً).
    """

    cost_fields = ()

    def get_fields(self):
        fields = super().get_fields()
        if request_role(self) not in PRIVILEGED_ROLES:
            for name in self.cost_fields:
                fields.pop(name, None)
        return fields


class PrivilegedWriteFieldsMixin:
    """حقول يقرأها الجميع ويعدّلها المدير والمشرف فقط (حد الائتمان، الخصم...)."""

    privileged_write_fields = ()

    def get_fields(self):
        fields = super().get_fields()
        if request_role(self) not in PRIVILEGED_ROLES:
            for name in self.privileged_write_fields:
                if name in fields:
                    fields[name].read_only = True
        return fields


class IdempotencyKeyReused(APIException):
    """مفتاح Idempotency-Key مستخدم سابقاً لعملية بيع بمحتوى مختلف."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = 'مفتاح إعادة المحاولة استُخدم سابقاً لعملية بيع مختلفة.'
    default_code = 'idempotency_key_reused'


def business_error(exc):
    """تحويل أخطاء الخدمات إلى 400 بمفتاح يدل على مصدرها."""
    key = 'payment' if isinstance(exc, services.PaymentError) else 'detail'
    return serializers.ValidationError({key: str(exc)})


# ─────────────────────────────────────────────────────────────────────────────
# المستخدمون
# ─────────────────────────────────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    """Serializer for the CustomUser model."""

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role']
        read_only_fields = ['id']


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating users (manager only)."""

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'password']
        read_only_fields = ['id']

    def validate(self, attrs):
        """
        تطبيق AUTH_PASSWORD_VALIDATORS فعلياً على كلمة المرور الجديدة.

        الإعداد في settings.py سلبي: لا يعمل إلا عند استدعاء
        validate_password() صراحةً. بدون هذا كان يمكن إنشاء مستخدم بكلمة مرور
        مثل «12345678» رغم تعريف المدقّقات — بينما يظنّ المسؤول أن الحماية فعّالة.

        نمرّر مستخدماً مؤقتاً ببيانات النموذج حتى يعمل
        UserAttributeSimilarityValidator (لا يعمل بلا كائن مستخدم).
        """
        candidate = User(
            username=attrs.get('username', ''),
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
            email=attrs.get('email', ''),
        )
        validate_password(attrs.get('password', ''), candidate)
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


# ─────────────────────────────────────────────────────────────────────────────
# الفئات وموديلات السيارات
# ─────────────────────────────────────────────────────────────────────────────

class CategorySerializer(HidesCostFieldsMixin, serializers.ModelSerializer):
    """Serializer for Category model."""

    parts_count = serializers.SerializerMethodField()
    cost_fields = ('markup_percent',)

    class Meta:
        model = Category
        fields = ['id', 'name', 'parts_count', 'image', 'description', 'markup_percent', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_parts_count(self, obj):
        # العدد يأتي من annotate في الاستعلام؛ الاستعلام المنفرد احتياط فقط.
        annotated = getattr(obj, 'annotated_parts_count', None)
        return annotated if annotated is not None else obj.spare_parts.count()


class PublicCategorySerializer(serializers.ModelSerializer):
    """الفئة داخل بطاقة المنتج العامة: بلا عدد قطع (كان استعلاماً لكل منتج)."""

    class Meta:
        model = Category
        fields = ['id', 'name', 'image', 'description']


class CarModelSerializer(serializers.ModelSerializer):
    """Serializer for CarModel."""

    display_name = serializers.SerializerMethodField()

    class Meta:
        model = CarModel
        fields = ['id', 'brand', 'model_name', 'year_start', 'year_end', 'image', 'description', 'display_name']
        read_only_fields = ['id']

    def get_display_name(self, obj):
        end = obj.year_end or 'حتى الآن'
        return f"{obj.brand} {obj.model_name} ({obj.year_start}-{end})"

    def validate(self, attrs):
        year_start = attrs.get('year_start', getattr(self.instance, 'year_start', None))
        year_end = attrs.get('year_end', getattr(self.instance, 'year_end', None))
        if year_end is not None and year_start is not None and year_end < year_start:
            raise serializers.ValidationError(
                {'year_end': 'سنة النهاية يجب أن تكون أكبر من أو تساوي سنة البداية.'}
            )
        return attrs


# ─────────────────────────────────────────────────────────────────────────────
# قطع الغيار
# ─────────────────────────────────────────────────────────────────────────────

PART_COST_FIELDS = ('purchase_price', 'cost_currency', 'foreign_cost', 'markup_percent')


class SparePartSerializer(HidesCostFieldsMixin, serializers.ModelSerializer):
    """Serializer for SparePart model."""

    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.company_name', read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    quality_grade_display = serializers.CharField(source='get_quality_grade_display', read_only=True)
    compatible_cars_display = serializers.SerializerMethodField()
    compatible_cars = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=CarModel.objects.all(),
        required=False,
    )
    supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(),
        required=False,
        allow_null=True,
    )
    # الرصيد الافتتاحي عند الإنشاء فقط: يُسجَّل حركةً موثّقة عبر الخدمات.
    opening_quantity = serializers.IntegerField(write_only=True, required=False, min_value=0)
    cost_fields = PART_COST_FIELDS

    class Meta:
        model = SparePart
        fields = [
            'id', 'name', 'part_number', 'category', 'category_name',
            'supplier', 'supplier_name',
            'compatible_cars', 'compatible_cars_display',
            'brand', 'oem_number', 'quality_grade', 'quality_grade_display', 'aliases', 'barcode',
            'purchase_price', 'selling_price',
            'cost_currency', 'foreign_cost', 'markup_percent', 'price_updated_at',
            'stock_quantity', 'opening_quantity', 'min_stock_alert', 'shelf_location',
            'is_low_stock', 'is_featured', 'image', 'description', 'created_at', 'updated_at',
        ]
        # stock_quantity للقراءة فقط: تعديلها يجب أن يمرّ عبر خدمات المخزون
        # (توريد/تسوية) وليس عبر تحديث مباشر من الواجهة.
        read_only_fields = ['id', 'created_at', 'updated_at', 'stock_quantity', 'price_updated_at']

    def get_extra_kwargs(self):
        extra = super().get_extra_kwargs()
        if self.instance is not None:
            # عند التحديث فقط: purchase_price يحمل متوسط التكلفة المرجّح
            # المحسوب في services._apply_weighted_average_cost. تعديله يدوياً
            # يُفسد تكلفة المخزون الحالي ويجعل الفواتير القادمة تسجّل
            # cost_price خاطئاً — بلا أي أثر في سجل الحركات (فهو تعديل سعري
            # لا كمّي). تعديله يبقى ممكناً عند الإنشاء لأن حقل النموذج مطلوب
            # وبلا قيمة افتراضية.
            extra.setdefault('purchase_price', {})['read_only'] = True
        return extra

    def get_compatible_cars_display(self, obj):
        return [str(car) for car in obj.compatible_cars.all()]

    def validate_barcode(self, value):
        return (value or '').strip() or None

    def validate_cost_currency(self, value):
        value = (value or '').strip().upper()
        if value == settings.BASE_CURRENCY:
            return ''
        if value and value not in settings.PRICING_CURRENCIES:
            raise serializers.ValidationError(
                f"العملة غير مدعومة. المتاح: {', '.join(settings.PRICING_CURRENCIES)}."
            )
        return value

    def validate(self, attrs):
        currency = attrs.get('cost_currency', getattr(self.instance, 'cost_currency', ''))
        foreign_cost = attrs.get('foreign_cost', getattr(self.instance, 'foreign_cost', None))
        if currency and foreign_cost is None:
            raise serializers.ValidationError(
                {'foreign_cost': 'أدخل تكلفة الشراء بالعملة المختارة.'}
            )
        return attrs

    def create(self, validated_data):
        opening_quantity = validated_data.pop('opening_quantity', None)
        if opening_quantity is None:
            # الواجهات القديمة ترسل الكمية الافتتاحية في stock_quantity (حقل
            # للقراءة فقط)؛ كان يُتجاهل بصمت فتُنشأ القطعة برصيد صفر.
            legacy = self.initial_data.get('stock_quantity')
            opening_quantity = int(legacy) if str(legacy or '').isdigit() else 0

        user = self.context['request'].user
        with transaction.atomic():
            part = super().create(validated_data)
            if opening_quantity:
                services.set_opening_balance(part, opening_quantity, user=user)
                part.refresh_from_db(fields=['stock_quantity'])
        return part

    def update(self, instance, validated_data):
        validated_data.pop('opening_quantity', None)
        compatible_cars = validated_data.pop('compatible_cars', None)
        with transaction.atomic():
            for field, value in validated_data.items():
                setattr(instance, field, value)
            # الحقول المرسلة فقط: الحفظ الكامل كان يكتب الرصيد والتكلفة كما قرأهما
            # الطلب، فيمحو بيعاً أو توريداً تمّ أثناء فتح نموذج التعديل.
            instance.save(update_fields=[*validated_data, 'updated_at'])
            if compatible_cars is not None:
                instance.compatible_cars.set(compatible_cars)
        instance.refresh_from_db(fields=['stock_quantity', 'purchase_price'])
        return instance


class SparePartListSerializer(HidesCostFieldsMixin, serializers.ModelSerializer):
    """
    Lightweight serializer for listing / POS search.

    يتضمن معرّفات الفئة والسيارات وحد التنبيه: نموذج التعديل يحتاجها، وكان
    يفتح بفئة فارغة وسيارات غير محددة عند غيابها.
    """

    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.company_name', read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    quality_grade_display = serializers.CharField(source='get_quality_grade_display', read_only=True)
    compatible_cars = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    compatible_cars_display = serializers.SerializerMethodField()
    cost_fields = PART_COST_FIELDS

    class Meta:
        model = SparePart
        fields = [
            'id', 'name', 'part_number', 'category', 'category_name', 'purchase_price',
            'selling_price', 'stock_quantity', 'min_stock_alert', 'is_low_stock',
            'shelf_location', 'compatible_cars', 'compatible_cars_display', 'is_featured',
            'image', 'description', 'supplier', 'supplier_name',
            'brand', 'oem_number', 'quality_grade', 'quality_grade_display', 'aliases', 'barcode',
            'cost_currency', 'foreign_cost', 'markup_percent', 'price_updated_at',
        ]

    def get_compatible_cars_display(self, obj):
        return [str(car) for car in obj.compatible_cars.all()]


# ─────────────────────────────────────────────────────────────────────────────
# المدفوعات
# ─────────────────────────────────────────────────────────────────────────────

class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ['id', 'name', 'account_number', 'is_active']
        read_only_fields = ['id']


class PaymentSerializer(serializers.ModelSerializer):
    """دفعة (للقراءة): البيع والتحصيل والردّ، مع حالة مطابقة التحويل."""

    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True, default=None)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, default=None)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    verified_by_name = serializers.CharField(source='verified_by.username', read_only=True, default=None)
    # الصورة خاصة (خارج /media/): الرابط نقطة نهاية تتحقق من صلاحية القارئ.
    proof_image = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'id', 'kind', 'kind_display', 'method', 'method_display', 'amount',
            'invoice', 'customer', 'customer_name', 'sale_return',
            'bank_account', 'bank_account_name', 'bank_name', 'reference_id',
            'sender_account_number', 'proof_image', 'verified_at', 'verified_by_name',
            'note', 'created_by_name', 'created_at',
        ]
        read_only_fields = fields

    def get_proof_image(self, obj):
        return f'/api/payments/{obj.pk}/proof-image/' if obj.proof_image else None


class PaymentInputSerializer(serializers.Serializer):
    """دفعة واحدة ضمن البيع أو التحصيل."""

    method = serializers.ChoiceField(choices=Payment.Method.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=BankAccount.objects.filter(is_active=True), required=False, allow_null=True,
    )
    bank_name = serializers.CharField(required=False, allow_blank=True, default='')
    reference_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    sender_account_number = serializers.CharField(required=False, allow_blank=True, default='')


class CollectionSerializer(PaymentInputSerializer):
    """تحصيل دفعة من دين عميل."""

    note = serializers.CharField(required=False, allow_blank=True, default='', max_length=255)


# ─────────────────────────────────────────────────────────────────────────────
# الفواتير والمرتجعات
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceItemSerializer(HidesCostFieldsMixin, serializers.ModelSerializer):
    """Serializer for InvoiceItem."""

    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)
    part_number = serializers.CharField(source='spare_part.part_number', read_only=True)
    profit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    returned_quantity = serializers.SerializerMethodField()
    cost_fields = ('cost_price', 'profit')

    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'spare_part', 'spare_part_name', 'part_number',
            'quantity', 'returned_quantity', 'unit_price', 'cost_price', 'subtotal', 'profit',
        ]
        read_only_fields = ['id', 'subtotal', 'cost_price', 'profit']
        # السعر يُحدَّد من الخادم (سعر البيع الرسمي) ولا يُشترط إرساله من الواجهة.
        extra_kwargs = {'unit_price': {'required': False, 'allow_null': True}}

    def get_returned_quantity(self, obj):
        if not obj.pk:
            return 0
        return sum(item.quantity for item in obj.return_items.all())


class SaleReturnItemSerializer(serializers.ModelSerializer):
    spare_part_name = serializers.CharField(source='invoice_item.spare_part.name', read_only=True)

    class Meta:
        model = SaleReturnItem
        fields = ['id', 'invoice_item', 'spare_part_name', 'quantity', 'unit_price', 'subtotal']
        read_only_fields = fields


class SaleReturnSerializer(serializers.ModelSerializer):
    items = SaleReturnItemSerializer(many=True, read_only=True)
    refund_method_display = serializers.CharField(source='get_refund_method_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = SaleReturn
        fields = [
            'id', 'invoice', 'refund_method', 'refund_method_display', 'total_amount',
            'reason', 'items', 'created_by_name', 'created_at',
        ]
        read_only_fields = fields


class SaleReturnInputSerializer(serializers.Serializer):
    """طلب مرتجع: بنود الفاتورة وكمياتها وطريقة ردّ المبلغ."""

    class ItemSerializer(serializers.Serializer):
        invoice_item = serializers.IntegerField()
        quantity = serializers.IntegerField(min_value=1)

    items = ItemSerializer(many=True)
    refund_method = serializers.ChoiceField(choices=SaleReturn.RefundMethod.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default='', max_length=255)
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=BankAccount.objects.all(), required=False, allow_null=True,
    )
    bank_name = serializers.CharField(required=False, allow_blank=True, default='')
    reference_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class PriceChangedConflict(APIException):
    """الإجمالي في الخادم يختلف عمّا عرضته نقطة البيع: سعر تغيّر أثناء البيع."""

    status_code = status.HTTP_409_CONFLICT
    default_code = 'price_changed'

    def __init__(self, message, total):
        super().__init__({'detail': message, 'total': str(total)})


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer for Invoice with nested InvoiceItems."""

    items = InvoiceItemSerializer(many=True)
    cashier_name = serializers.CharField(source='cashier.username', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    # دفعات البيع (دفع مختلط أو جزئي). للقراءة تُعاد سجلات الدفعات كاملة.
    payments = PaymentInputSerializer(many=True, required=False, write_only=True)
    # الإجمالي الذي عرضته الواجهة: اختلافه عن تسعير الخادم يرفض البيع بـ 409.
    expected_total = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True, write_only=True,
    )

    class Meta:
        model = Invoice
        fields = [
            'id', 'cashier', 'cashier_name', 'customer', 'customer_name', 'created_at',
            'total_amount', 'paid_amount', 'credit_amount', 'items', 'payments', 'expected_total',
            'payment_method', 'payment_method_display', 'currency',
            'bank_name', 'reference_id', 'sender_account_number',
        ]
        read_only_fields = ['id', 'cashier', 'created_at', 'total_amount', 'paid_amount', 'credit_amount']

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('الفاتورة يجب أن تحتوي على بند واحد على الأقل.')
        return value

    def validate_currency(self, value):
        # عملة واحدة للمؤسسة إلى أن يُدعم سعر الصرف وتحويل التقارير.
        if value and value != settings.BASE_CURRENCY:
            raise serializers.ValidationError(
                f"العملة '{value}' غير مدعومة. عملة النظام: {settings.BASE_CURRENCY}."
            )
        return value or settings.BASE_CURRENCY

    def validate(self, attrs):
        payment_method = attrs.get('payment_method', Invoice.PaymentMethod.CASH)
        if payment_method == Invoice.PaymentMethod.CASH and 'payments' not in attrs:
            attrs['bank_name'] = None
            attrs['reference_id'] = None
            attrs['sender_account_number'] = None
        elif payment_method == Invoice.PaymentMethod.BANK and 'payments' not in attrs:
            errors = {}
            if not attrs.get('bank_name'):
                errors['bank_name'] = 'اسم البنك مطلوب للتحويل البنكي.'
            if not attrs.get('reference_id'):
                errors['reference_id'] = 'رقم الإشعار مطلوب للتحويل البنكي.'
            if not attrs.get('sender_account_number'):
                errors['sender_account_number'] = 'رقم حساب المرسل مطلوب للتحويل البنكي.'
            if errors:
                raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        user = self.context['request'].user

        # فقط المدير والمشرف يمكنهما تمرير سعر مختلف عن سعر البيع المعلن.
        allow_price_override = getattr(user, 'role', None) in PRIVILEGED_ROLES

        try:
            invoice = services.create_invoice(
                cashier=user,
                items=items_data,
                customer=validated_data.get('customer'),
                payment_method=validated_data.get('payment_method', Invoice.PaymentMethod.CASH),
                bank_name=validated_data.get('bank_name'),
                reference_id=validated_data.get('reference_id'),
                sender_account_number=validated_data.get('sender_account_number'),
                payments=validated_data.get('payments'),
                currency=validated_data.get('currency'),
                allow_price_override=allow_price_override,
                # يُمرَّر من InvoiceViewSet.create عبر serializer.save().
                idempotency_key=validated_data.get('idempotency_key'),
                expected_total=validated_data.get('expected_total'),
            )
        except services.IdempotencyConflict as exc:
            raise IdempotencyKeyReused(str(exc))
        except services.PriceChanged as exc:
            raise PriceChangedConflict(str(exc), exc.total)
        except services.PaymentError as exc:
            raise serializers.ValidationError({'payment': str(exc)})
        except services.InventoryError as exc:
            raise serializers.ValidationError({'items': str(exc)})

        return invoice

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['payments'] = PaymentSerializer(
            instance.payments.all(), many=True, context=self.context,
        ).data
        data['returns'] = SaleReturnSerializer(
            instance.returns.all(), many=True, context=self.context,
        ).data
        return data


class InvoiceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing invoices."""

    cashier_name = serializers.CharField(source='cashier.username', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    items_count = serializers.IntegerField(source='items.count', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'cashier_name', 'customer', 'customer_name', 'created_at', 'total_amount',
            'paid_amount', 'credit_amount', 'items_count',
            'payment_method', 'payment_method_display', 'currency',
            'bank_name', 'reference_id', 'sender_account_number',
        ]


# ─────────────────────────────────────────────────────────────────────────────
# العملاء والموردون والتوريد
# ─────────────────────────────────────────────────────────────────────────────

class CustomerSerializer(PrivilegedWriteFieldsMixin, serializers.ModelSerializer):
    """
    العميل مع نوعه وخصمه وحد ائتمانه ورصيده المدين.

    الموظف يضيف العملاء من نقطة البيع لكنه لا يحدد خصماً ولا حد ائتمان.
    """

    customer_type_display = serializers.CharField(source='get_customer_type_display', read_only=True)
    balance = serializers.SerializerMethodField()
    effective_discount_percent = serializers.SerializerMethodField()
    privileged_write_fields = ('customer_type', 'discount_percent', 'credit_limit')

    class Meta:
        model = Customer
        fields = [
            'id', 'name', 'location', 'email', 'phone', 'whatsapp_number',
            'customer_type', 'customer_type_display', 'discount_percent',
            'effective_discount_percent', 'credit_limit', 'balance',
        ]
        read_only_fields = ['id']

    def get_balance(self, obj):
        annotated = getattr(obj, 'annotated_balance', None)
        balance = annotated if annotated is not None else services.customer_balance(obj)
        return str(Decimal(balance).quantize(Decimal('0.01')))

    def _site(self):
        if '_site' not in self.context:
            self.context['_site'] = SiteSetting.load()
        return self.context['_site']

    def get_effective_discount_percent(self, obj):
        return str(services.customer_discount_percent(obj, self._site()))


class SupplierSerializer(serializers.ModelSerializer):
    """Serializer for Supplier model."""

    class Meta:
        model = Supplier
        fields = ['id', 'company_name', 'contact_person', 'phone_number', 'email', 'address', 'is_active']
        read_only_fields = ['id']


class SupplyDealSerializer(HidesCostFieldsMixin, serializers.ModelSerializer):
    """Serializer for SupplyDeal model — creation goes through services."""

    supplier_name = serializers.CharField(source='supplier.company_name', read_only=True)
    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)
    cost_fields = ('purchase_price', 'total_cost', 'foreign_unit_cost', 'exchange_rate')

    class Meta:
        model = SupplyDeal
        fields = [
            'id', 'supplier', 'supplier_name', 'spare_part', 'spare_part_name',
            'quantity_added', 'purchase_price', 'currency', 'foreign_unit_cost', 'exchange_rate',
            'total_cost', 'date_received', 'invoice_reference',
        ]
        read_only_fields = ['id', 'total_cost', 'date_received']
        extra_kwargs = {'purchase_price': {'required': False}}

    def create(self, validated_data):
        user = self.context['request'].user
        try:
            return services.create_supply_deal(
                supplier=validated_data['supplier'],
                spare_part=validated_data['spare_part'],
                quantity_added=validated_data['quantity_added'],
                purchase_price=validated_data.get('purchase_price'),
                invoice_reference=validated_data.get('invoice_reference'),
                currency=validated_data.get('currency'),
                foreign_unit_cost=validated_data.get('foreign_unit_cost'),
                exchange_rate=validated_data.get('exchange_rate'),
                user=user,
            )
        except services.InventoryError as exc:
            raise serializers.ValidationError({'detail': str(exc)})


class SupplierDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer returning supplier info along with supplied spare parts and deals history."""

    supplied_parts = SparePartSerializer(many=True, read_only=True)
    deals = SupplyDealSerializer(many=True, read_only=True)

    class Meta:
        model = Supplier
        fields = [
            'id', 'company_name', 'contact_person', 'phone_number', 'email', 'address',
            'is_active', 'supplied_parts', 'deals'
        ]
        read_only_fields = ['id']


# ─────────────────────────────────────────────────────────────────────────────
# إعدادات الموقع والتواصل والمتجر العام
# ─────────────────────────────────────────────────────────────────────────────

RECEIPT_FIELDS = [
    'site_name', 'logo', 'business_phone', 'business_address', 'tax_number',
    'receipt_footer', 'receipt_paper',
]


class SiteSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSetting
        fields = ['site_name', 'logo', 'hero_title', 'hero_subtitle', 'business_phone', 'business_address']


class ReceiptSettingsSerializer(serializers.ModelSerializer):
    """ما تحتاجه طباعة الإيصال: هوية البائع ومقاس الورق (لكل الموظفين)."""

    class Meta:
        model = SiteSetting
        fields = RECEIPT_FIELDS
        read_only_fields = RECEIPT_FIELDS


class BusinessSettingsSerializer(HidesCostFieldsMixin, serializers.ModelSerializer):
    """إعدادات المؤسسة كاملة لصفحة الإعدادات (التسعير للمدير والمشرف فقط)."""

    cost_fields = ('default_markup_percent', 'price_rounding')

    class Meta:
        model = SiteSetting
        fields = [
            'site_name', 'logo', 'hero_title', 'hero_subtitle',
            'business_phone', 'business_address', 'tax_number', 'receipt_footer', 'receipt_paper',
            'default_markup_percent', 'price_rounding',
            'workshop_discount_percent', 'wholesale_discount_percent',
        ]


class ContactMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMethod
        fields = ['id', 'platform_name', 'value', 'icon_name', 'is_active']
        read_only_fields = ['id']


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ['id', 'name', 'email', 'phone', 'message', 'created_at']
        read_only_fields = ['id', 'created_at']


class PublicSparePartSerializer(serializers.ModelSerializer):
    category = PublicCategorySerializer(read_only=True)
    compatible_cars = CarModelSerializer(many=True, read_only=True)
    quality_grade_display = serializers.CharField(source='get_quality_grade_display', read_only=True)

    class Meta:
        model = SparePart
        fields = [
            'id', 'name', 'part_number', 'category', 'compatible_cars', 'brand', 'quality_grade',
            'quality_grade_display', 'selling_price', 'stock_quantity', 'is_featured',
            'image', 'description',
        ]


# ─────────────────────────────────────────────────────────────────────────────
# الطلبات الخارجية
# ─────────────────────────────────────────────────────────────────────────────

class PublicOrderItemSerializer(serializers.ModelSerializer):
    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)
    part_number = serializers.CharField(source='spare_part.part_number', read_only=True)

    class Meta:
        model = PublicOrderItem
        # cost_price مُستبعَد عمداً: حقل تكلفة داخلي لا يجوز أن يصل إلى
        # الواجهة العامة (المتجر) ولا أن يُكشف للتاجر المنافس أو للعميل.
        fields = ['id', 'spare_part', 'spare_part_name', 'part_number', 'quantity', 'unit_price']
        read_only_fields = ['id', 'unit_price']


class PublicOrderSerializer(serializers.ModelSerializer):
    items = PublicOrderItemSerializer(many=True)

    class Meta:
        model = PublicOrder
        fields = [
            'id', 'customer_name', 'phone_number', 'email', 'location', 'status', 'created_at',
            'total_amount', 'items', 'invoice',
        ]
        read_only_fields = ['id', 'created_at', 'status', 'total_amount', 'invoice']

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('الطلب يجب أن يحتوي على منتج واحد على الأقل.')
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')

        # السعر يُحدَّد دائماً من الخادم (سعر البيع الرسمي) لا من مدخلات
        # العميل. ونحفظ لقطة تكلفة الوحدة أيضاً بنفس منطق
        # InvoiceItem.cost_price، حتى يُحسب ربح قناة المتجر الإلكتروني
        # وتبقى تقاريره التاريخية ثابتة عند تغيّر سعر الشراء لاحقاً.
        total = 0
        for item_data in items_data:
            part = item_data['spare_part']
            quantity = item_data['quantity']
            item_data['unit_price'] = part.selling_price
            item_data['cost_price'] = part.purchase_price
            total += part.selling_price * quantity

        # رأس الطلب وبنوده في معاملة واحدة: إشعار البريد (on_commit) لا يُرسل
        # إلا بعد اكتمالها، فلا يصل بريد بطلب بلا قطع ولا يبقى رأس بلا بنود.
        with transaction.atomic():
            order = PublicOrder.objects.create(total_amount=total, **validated_data)
            for item_data in items_data:
                PublicOrderItem.objects.create(order=order, **item_data)

        return order


class PublicOrderInvoiceSerializer(serializers.Serializer):
    """بيع طلب المتجر: دفعاته (نقد/تحويل)؛ ما لم يُدفع يصبح آجلاً على العميل."""

    payments = PaymentInputSerializer(many=True)


# ─────────────────────────────────────────────────────────────────────────────
# التنبيهات وسجل حركات المخزون
# ─────────────────────────────────────────────────────────────────────────────

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'message', 'is_read', 'created_at', 'notification_type']
        read_only_fields = ['id', 'created_at']


class StockMovementSerializer(HidesCostFieldsMixin, serializers.ModelSerializer):
    """سجل حركات المخزون (للقراءة فقط — يُنشأ تلقائياً عبر الخدمات)."""

    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    cost_fields = ('unit_cost',)

    class Meta:
        model = StockMovement
        fields = [
            'id', 'spare_part', 'spare_part_name', 'change', 'quantity_after',
            'reason', 'reason_display', 'reference', 'unit_cost', 'created_by',
            'created_by_name', 'created_at',
        ]
        read_only_fields = fields


# ─────────────────────────────────────────────────────────────────────────────
# الصندوق والتسعير والجرد
# ─────────────────────────────────────────────────────────────────────────────

class ExpenseSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, default=None)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id', 'date', 'category', 'amount', 'method', 'method_display',
            'bank_account', 'bank_account_name', 'description', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_by_name', 'created_at']

    def validate(self, attrs):
        method = attrs.get('method', getattr(self.instance, 'method', Expense.Method.CASH))
        if method == Expense.Method.BANK and not attrs.get('bank_account', getattr(self.instance, 'bank_account', None)):
            raise serializers.ValidationError({'bank_account': 'حدّد الحساب البنكي للمصروف.'})
        if method == Expense.Method.CASH:
            attrs['bank_account'] = None
        return attrs


class DailyCloseSerializer(serializers.ModelSerializer):
    closed_by_name = serializers.CharField(source='closed_by.username', read_only=True)

    class Meta:
        model = DailyClose
        fields = [
            'id', 'date', 'opening_cash', 'expected_cash', 'counted_cash', 'difference',
            'summary', 'notes', 'closed_by_name', 'closed_at',
        ]
        read_only_fields = fields


class ExchangeRateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ExchangeRate
        fields = ['id', 'currency', 'rate', 'created_by_name', 'created_at']
        read_only_fields = ['id', 'created_by_name', 'created_at']


class StockCountLineSerializer(serializers.ModelSerializer):
    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)
    part_number = serializers.CharField(source='spare_part.part_number', read_only=True)
    shelf_location = serializers.CharField(source='spare_part.shelf_location', read_only=True)
    current_quantity = serializers.IntegerField(source='spare_part.stock_quantity', read_only=True)

    class Meta:
        model = StockCountLine
        fields = [
            'id', 'spare_part', 'spare_part_name', 'part_number', 'shelf_location',
            'counted_quantity', 'quantity_at_count', 'system_quantity', 'current_quantity',
        ]
        read_only_fields = ['id', 'quantity_at_count', 'system_quantity']


class StockCountSerializer(serializers.ModelSerializer):
    lines = StockCountLineSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    applied_by_name = serializers.CharField(source='applied_by.username', read_only=True, default=None)

    class Meta:
        model = StockCount
        fields = [
            'id', 'title', 'status', 'status_display', 'notes', 'lines',
            'created_by_name', 'created_at', 'applied_by_name', 'applied_at',
        ]
        read_only_fields = ['id', 'status', 'created_at', 'applied_at']
