"""
DRF Serializers for the Auto Spare Parts POS system.
"""

from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Category, CarModel, SparePart, Invoice, InvoiceItem, SiteSetting, ContactMethod, ContactMessage, Customer, Supplier, SupplyDeal, PublicOrder, PublicOrderItem, Notification

User = get_user_model()


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

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category model."""

    parts_count = serializers.IntegerField(source='spare_parts.count', read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'parts_count', 'image', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


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


class SparePartSerializer(serializers.ModelSerializer):
    """Serializer for SparePart model."""

    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.company_name', read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
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

    class Meta:
        model = SparePart
        fields = [
            'id', 'name', 'part_number', 'category', 'category_name',
            'supplier', 'supplier_name',
            'compatible_cars', 'compatible_cars_display',
            'purchase_price', 'selling_price',
            'stock_quantity', 'min_stock_alert', 'shelf_location',
            'is_low_stock', 'is_featured', 'image', 'description', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_compatible_cars_display(self, obj):
        return [str(car) for car in obj.compatible_cars.all()]


class SparePartListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing / POS search."""

    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.company_name', read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    compatible_cars_display = serializers.SerializerMethodField()

    class Meta:
        model = SparePart
        fields = [
            'id', 'name', 'part_number', 'category_name', 'purchase_price',
            'selling_price', 'stock_quantity', 'is_low_stock',
            'shelf_location', 'compatible_cars_display', 'is_featured', 'image', 'description',
            'supplier', 'supplier_name',
        ]

    def get_compatible_cars_display(self, obj):
        return [str(car) for car in obj.compatible_cars.all()]


class InvoiceItemSerializer(serializers.ModelSerializer):
    """Serializer for InvoiceItem."""

    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)
    part_number = serializers.CharField(source='spare_part.part_number', read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'spare_part', 'spare_part_name', 'part_number',
            'quantity', 'unit_price', 'subtotal',
        ]
        read_only_fields = ['id', 'subtotal']


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer for Invoice with nested InvoiceItems."""

    items = InvoiceItemSerializer(many=True)
    cashier_name = serializers.CharField(source='cashier.username', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'cashier', 'cashier_name', 'customer', 'customer_name', 'created_at',
            'total_amount', 'items', 'payment_method', 'currency',
            'bank_name', 'reference_id', 'sender_account_number',
        ]
        read_only_fields = ['id', 'cashier', 'created_at', 'total_amount']

    def validate(self, attrs):
        payment_method = attrs.get('payment_method', 'cash')
        if payment_method == 'cash':
            attrs['bank_name'] = None
            attrs['reference_id'] = None
            attrs['sender_account_number'] = None
        elif payment_method == 'bank':
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

        # Calculate total
        total = 0
        for item_data in items_data:
            spare_part = item_data['spare_part']
            quantity = item_data['quantity']
            unit_price = item_data.get('unit_price', spare_part.selling_price)
            subtotal = unit_price * quantity
            item_data['unit_price'] = unit_price
            item_data['subtotal'] = subtotal
            total += subtotal

        # Create invoice
        invoice = Invoice.objects.create(
            cashier=user,
            total_amount=total,
            **validated_data
        )

        # Create items and deduct stock
        for item_data in items_data:
            spare_part = item_data['spare_part']
            quantity = item_data['quantity']

            if spare_part.stock_quantity < quantity:
                raise serializers.ValidationError(
                    f"الكمية المتوفرة من '{spare_part.name}' غير كافية. "
                    f"المتوفر: {spare_part.stock_quantity}"
                )

            InvoiceItem.objects.create(invoice=invoice, **item_data)

            # Deduct stock
            spare_part.stock_quantity -= quantity
            spare_part.save(update_fields=['stock_quantity'])

        return invoice


class InvoiceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing invoices."""

    cashier_name = serializers.CharField(source='cashier.username', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    items_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'cashier_name', 'customer', 'customer_name', 'created_at', 'total_amount', 'items_count',
            'payment_method', 'currency', 'bank_name', 'reference_id', 'sender_account_number',
        ]


class SiteSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSetting
        fields = ['site_name', 'logo', 'hero_title', 'hero_subtitle']


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
    category = CategorySerializer(read_only=True)
    compatible_cars = CarModelSerializer(many=True, read_only=True)

    class Meta:
        model = SparePart
        fields = [
            'id', 'name', 'category', 'compatible_cars',
            'selling_price', 'stock_quantity', 'is_featured', 'image', 'description'
        ]


class CustomerSerializer(serializers.ModelSerializer):
    """Serializer for Customer model."""

    class Meta:
        model = Customer
        fields = ['id', 'name', 'location', 'email', 'phone', 'whatsapp_number']
        read_only_fields = ['id']


class SupplierSerializer(serializers.ModelSerializer):
    """Serializer for Supplier model."""

    class Meta:
        model = Supplier
        fields = ['id', 'company_name', 'contact_person', 'phone_number', 'email', 'address', 'is_active']
        read_only_fields = ['id']


class SupplyDealSerializer(serializers.ModelSerializer):
    """Serializer for SupplyDeal model."""

    supplier_name = serializers.CharField(source='supplier.company_name', read_only=True)
    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)

    class Meta:
        model = SupplyDeal
        fields = [
            'id', 'supplier', 'supplier_name', 'spare_part', 'spare_part_name',
            'quantity_added', 'purchase_price', 'total_cost', 'date_received', 'invoice_reference'
        ]
        read_only_fields = ['id', 'total_cost', 'date_received']


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


class PublicOrderItemSerializer(serializers.ModelSerializer):
    spare_part_name = serializers.CharField(source='spare_part.name', read_only=True)
    part_number = serializers.CharField(source='spare_part.part_number', read_only=True)

    class Meta:
        model = PublicOrderItem
        fields = ['id', 'spare_part', 'spare_part_name', 'part_number', 'quantity', 'unit_price']
        read_only_fields = ['id', 'unit_price']


class PublicOrderSerializer(serializers.ModelSerializer):
    items = PublicOrderItemSerializer(many=True)

    class Meta:
        model = PublicOrder
        fields = ['id', 'customer_name', 'phone_number', 'email', 'location', 'status', 'created_at', 'total_amount', 'items']
        read_only_fields = ['id', 'created_at', 'status', 'total_amount']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        
        # Calculate total
        total = 0
        for item_data in items_data:
            part = item_data['spare_part']
            qty = item_data['quantity']
            
            # Use part's selling_price
            price = part.selling_price
            item_data['unit_price'] = price
            total += price * qty

        # Create public order
        order = PublicOrder.objects.create(total_amount=total, **validated_data)

        # Create order items
        for item_data in items_data:
            PublicOrderItem.objects.create(order=order, **item_data)

        return order


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'message', 'is_read', 'created_at', 'notification_type']
        read_only_fields = ['id', 'created_at']
