"""
Models for Auto Spare Parts POS & Inventory Management System.
"""

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError


class CustomUser(AbstractUser):
    """Extended user model with role-based access control."""

    class Role(models.TextChoices):
        MANAGER = 'manager', 'مدير'
        SUPERVISOR = 'supervisor', 'مشرف'
        EMPLOYEE = 'employee', 'موظف'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.EMPLOYEE,
        verbose_name='الدور',
    )

    class Meta:
        verbose_name = 'مستخدم'
        verbose_name_plural = 'المستخدمون'

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class Category(models.Model):
    """Spare part category."""

    name = models.CharField(max_length=255, unique=True, verbose_name='اسم الفئة')
    image = models.ImageField(upload_to='categories/', null=True, blank=True, verbose_name='الصورة')
    description = models.TextField(null=True, blank=True, verbose_name='الوصف')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'فئة'
        verbose_name_plural = 'الفئات'
        ordering = ['name']

    def __str__(self):
        return self.name


class CarModel(models.Model):
    """Car brand and model with production year range."""

    brand = models.CharField(max_length=100, verbose_name='الشركة المصنعة')
    model_name = models.CharField(max_length=100, verbose_name='الموديل')
    year_start = models.PositiveIntegerField(verbose_name='سنة البداية')
    year_end = models.PositiveIntegerField(
        null=True, blank=True, verbose_name='سنة النهاية'
    )
    image = models.ImageField(upload_to='car_models/', null=True, blank=True, verbose_name='الصورة')
    description = models.TextField(null=True, blank=True, verbose_name='الوصف')

    class Meta:
        verbose_name = 'موديل سيارة'
        verbose_name_plural = 'موديلات السيارات'
        ordering = ['brand', 'model_name', 'year_start']
        unique_together = ['brand', 'model_name', 'year_start']

    def __str__(self):
        end = self.year_end or 'حتى الآن'
        return f"{self.brand} {self.model_name} ({self.year_start}-{end})"


class Supplier(models.Model):
    """Supplier company information."""

    company_name = models.CharField(max_length=255, verbose_name='اسم الشركة')
    contact_person = models.CharField(max_length=255, null=True, blank=True, verbose_name='الشخص المسؤول')
    phone_number = models.CharField(max_length=50, verbose_name='رقم الهاتف')
    email = models.EmailField(null=True, blank=True, verbose_name='البريد الإلكتروني')
    address = models.TextField(null=True, blank=True, verbose_name='العنوان')
    is_active = models.BooleanField(default=True, verbose_name='نشط')

    class Meta:
        verbose_name = 'مورد'
        verbose_name_plural = 'الموردون'
        ordering = ['company_name']

    def __str__(self):
        return self.company_name


class SparePart(models.Model):
    """Auto spare part with inventory tracking."""

    name = models.CharField(max_length=255, verbose_name='اسم القطعة')
    part_number = models.CharField(
        max_length=100, unique=True, verbose_name='رقم القطعة'
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        null=False,
        blank=False,
        related_name='spare_parts',
        verbose_name='الفئة',
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supplied_parts',
        verbose_name='المورد',
    )
    compatible_cars = models.ManyToManyField(
        CarModel,
        blank=True,
        related_name='spare_parts',
        verbose_name='السيارات المتوافقة',
    )
    purchase_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name='سعر الشراء',
    )
    selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name='سعر البيع',
    )
    stock_quantity = models.PositiveIntegerField(
        default=0, verbose_name='الكمية المتوفرة'
    )
    min_stock_alert = models.PositiveIntegerField(
        default=5, verbose_name='حد التنبيه الأدنى'
    )
    shelf_location = models.CharField(
        max_length=50, blank=True, default='', verbose_name='موقع الرف'
    )
    is_featured = models.BooleanField(default=False, verbose_name='منتج مميز')
    image = models.ImageField(upload_to='parts/', null=True, blank=True, verbose_name='الصورة')
    description = models.TextField(null=True, blank=True, verbose_name='الوصف')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'قطعة غيار'
        verbose_name_plural = 'قطع الغيار'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.part_number})"

    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.min_stock_alert


class Customer(models.Model):
    """Customer information model."""

    name = models.CharField(max_length=255, verbose_name='الاسم')
    location = models.CharField(max_length=255, null=True, blank=True, verbose_name='الموقع')
    email = models.EmailField(null=True, blank=True, verbose_name='البريد الإلكتروني')
    phone = models.CharField(max_length=50, verbose_name='الهاتف')
    whatsapp_number = models.CharField(max_length=50, null=True, blank=True, verbose_name='رقم الواتساب')

    class Meta:
        verbose_name = 'عميل'
        verbose_name_plural = 'العملاء'
        ordering = ['name']

    def __str__(self):
        return self.name


class Invoice(models.Model):
    """Sales invoice."""

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'نقدي'
        BANK = 'bank', 'تحويل بنكي'

    cashier = models.ForeignKey(
        CustomUser,
        on_delete=models.PROTECT,
        related_name='invoices',
        verbose_name='الكاشير',
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
        verbose_name='العميل',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='تاريخ الإنشاء')
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='المبلغ الإجمالي',
    )
    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
        verbose_name='طريقة الدفع',
    )
    currency = models.CharField(
        max_length=10,
        default='SDG',
        verbose_name='العملة',
    )
    bank_name = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        verbose_name='اسم البنك',
    )
    reference_id = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name='رقم الإشعار',
    )
    sender_account_number = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name='رقم حساب المرسل',
    )

    class Meta:
        verbose_name = 'فاتورة'
        verbose_name_plural = 'الفواتير'
        ordering = ['-created_at']

    def __str__(self):
        return f"فاتورة #{self.pk} - {self.total_amount} {self.currency}"

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if self.payment_method == self.PaymentMethod.CASH:
            self.bank_name = None
            self.reference_id = None
            self.sender_account_number = None
        elif self.payment_method == self.PaymentMethod.BANK:
            errors = {}
            if not self.bank_name:
                errors['bank_name'] = 'اسم البنك مطلوب عند الدفع عن طريق البنك.'
            if not self.reference_id:
                errors['reference_id'] = 'رقم الإشعار مطلوب عند الدفع عن طريق البنك.'
            if not self.sender_account_number:
                errors['sender_account_number'] = 'رقم حساب المرسل مطلوب عند الدفع عن طريق البنك.'
            if errors:
                raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class InvoiceItem(models.Model):
    """Individual item within an invoice."""

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='الفاتورة',
    )
    spare_part = models.ForeignKey(
        SparePart,
        on_delete=models.PROTECT,
        related_name='invoice_items',
        verbose_name='قطعة الغيار',
    )
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        verbose_name='الكمية',
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='سعر الوحدة',
    )
    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='المجموع الفرعي',
    )

    class Meta:
        verbose_name = 'بند فاتورة'
        verbose_name_plural = 'بنود الفاتورة'

    def __str__(self):
        return f"{self.spare_part.name} x{self.quantity}"


class SiteSetting(models.Model):
    """Singleton site configuration for public branding."""
    site_name = models.CharField(max_length=255, default='محل قطع الغيار', verbose_name='اسم الموقع')
    logo = models.ImageField(upload_to='logos/', blank=True, null=True, verbose_name='الشعار')
    hero_title = models.CharField(max_length=255, default='أفضل قطع الغيار لسيارتك', verbose_name='عنوان الهيرو')
    hero_subtitle = models.TextField(default='نوفر أفضل قطع الغيار الأصلية والمضمونة لكافة أنواع السيارات بأسعار منافسة.', verbose_name='العنوان الفرعي للهيرو')

    class Meta:
        verbose_name = 'إعدادات الموقع'
        verbose_name_plural = 'إعدادات الموقع'

    def __str__(self):
        return self.site_name

    def save(self, *args, **kwargs):
        self.pk = 1
        if SiteSetting.objects.filter(pk=1).exists():
            kwargs.pop('force_insert', None)
        super().save(*args, **kwargs)


class ContactMethod(models.Model):
    """Dynamic platform contact methods displayed on landing page."""
    platform_name = models.CharField(max_length=100, verbose_name='اسم المنصة')
    value = models.CharField(max_length=255, verbose_name='القيمة (رقم/رابط)')
    icon_name = models.CharField(max_length=100, verbose_name='اسم الأيقونة (Lucide)')
    is_active = models.BooleanField(default=True, verbose_name='نشط')

    class Meta:
        verbose_name = 'وسيلة اتصال'
        verbose_name_plural = 'وسائل الاتصال'

    def __str__(self):
        return f"{self.platform_name}: {self.value}"


class ContactMessage(models.Model):
    """Public contact submission messages from landing page."""
    name = models.CharField(max_length=255, verbose_name='الاسم')
    email = models.EmailField(verbose_name='البريد الإلكتروني')
    phone = models.CharField(max_length=50, blank=True, default='', verbose_name='الهاتف')
    message = models.TextField(verbose_name='الرسالة')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='تاريخ الإرسال')

    class Meta:
        verbose_name = 'رسالة تواصل'
        verbose_name_plural = 'رسائل التواصل'
        ordering = ['-created_at']

    def __str__(self):
        return f"رسالة من {self.name} - {self.email}"


class SupplyDeal(models.Model):
    """Restocking deals from a supplier."""

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='deals',
        verbose_name='المورد',
    )
    spare_part = models.ForeignKey(
        SparePart,
        on_delete=models.CASCADE,
        related_name='deals',
        verbose_name='قطعة الغيار',
    )
    quantity_added = models.PositiveIntegerField(verbose_name='الكمية المضافة')
    purchase_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name='سعر الشراء (التكلفة)',
    )
    total_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='التكلفة الإجمالية',
    )
    date_received = models.DateTimeField(auto_now_add=True, verbose_name='تاريخ الاستلام')
    invoice_reference = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name='الرقم المرجعي للفاتورة',
    )

    class Meta:
        verbose_name = 'عملية توريد'
        verbose_name_plural = 'عمليات التوريد'
        ordering = ['-date_received']

    def __str__(self):
        return f"توريد #{self.pk} - {self.spare_part.name} x{self.quantity_added}"

    def save(self, *args, **kwargs):
        self.total_cost = self.quantity_added * self.purchase_price
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            # Dynamically increment stock quantity
            self.spare_part.stock_quantity += self.quantity_added
            # Update part purchase price to the latest supply price
            self.spare_part.purchase_price = self.purchase_price
            self.spare_part.save(update_fields=['stock_quantity', 'purchase_price'])


# ─── Public E-Commerce Orders ──────────────────────────────────────────

class PublicOrder(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'قيد الانتظار'
        CONFIRMED = 'confirmed', 'تم التأكيد'
        CANCELLED = 'cancelled', 'ملغي'

    customer_name = models.CharField(max_length=255, verbose_name='اسم الزبون')
    phone_number = models.CharField(max_length=50, verbose_name='رقم الهاتف')
    email = models.EmailField(null=True, blank=True, verbose_name='البريد الإلكتروني')
    location = models.CharField(max_length=255, null=True, blank=True, verbose_name='العنوان / المنطقة')
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='الحالة',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='تاريخ الطلب')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name='القيمة الإجمالية')

    class Meta:
        verbose_name = 'طلب خارجي'
        verbose_name_plural = 'طلبات خارجية'
        ordering = ['-created_at']

    def __str__(self):
        return f"طلب #{self.id} - {self.customer_name}"

    def save(self, *args, **kwargs):
        if self.pk:
            old_order = PublicOrder.objects.get(pk=self.pk)
            if old_order.status != self.status and self.status == PublicOrder.Status.CONFIRMED:
                # Deduct stock
                for item in self.items.all():
                    if item.spare_part.stock_quantity < item.quantity:
                        raise ValidationError(f"الكمية المتوفرة من '{item.spare_part.name}' غير كافية لعملية التأكيد.")
                    item.spare_part.stock_quantity -= item.quantity
                    item.spare_part.save(update_fields=['stock_quantity'])
        super().save(*args, **kwargs)


class PublicOrderItem(models.Model):
    order = models.ForeignKey(
        PublicOrder,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='الطلب',
    )
    spare_part = models.ForeignKey(
        SparePart,
        on_delete=models.PROTECT,
        related_name='public_order_items',
        verbose_name='قطعة الغيار',
    )
    quantity = models.PositiveIntegerField(verbose_name='الكمية')
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name='سعر الوحدة',
    )

    class Meta:
        verbose_name = 'عنصر طلب خارجي'
        verbose_name_plural = 'عناصر طلبات خارجية'

    def __str__(self):
        return f"{self.spare_part.name} x{self.quantity}"


# ─── Administrative Notification Alerts ────────────────────────────────

class Notification(models.Model):
    class NotificationType(models.TextChoices):
        ORDER = 'ORDER', 'طلب شراء'
        MESSAGE = 'MESSAGE', 'رسالة تواصل'

    message = models.CharField(max_length=500, verbose_name='محتوى التنبيه')
    is_read = models.BooleanField(default=False, verbose_name='مقروء')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='تاريخ التنبيه')
    notification_type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        verbose_name='نوع التنبيه'
    )

    class Meta:
        verbose_name = 'تنبيه'
        verbose_name_plural = 'تنبيهات'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.notification_type} - {self.message[:30]}"


# ─── Signals for Admin Notifications ──────────────────────────────────────────
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.db import transaction

@receiver(post_save, sender=PublicOrder)
def notify_admin_new_order(sender, instance, created, **kwargs):
    if created:
        try:
            Notification.objects.create(
                message=f"طلب شراء جديد من العميل {instance.customer_name} بقيمة {instance.total_amount} ج.س",
                notification_type=Notification.NotificationType.ORDER
            )
        except Exception:
            pass

        def send_email_notification():
            try:
                # Refresh from db to fetch related items populated during transaction
                instance.refresh_from_db()
                items = instance.items.all()
                items_list = []
                for item in items:
                    items_list.append(f"- {item.spare_part.name} (الكمية: {item.quantity}, السعر: {item.unit_price} ج.س)")
                items_str = "\n".join(items_list)
                
                subject = f"طلب جديد من الموقع الالكتروني: #{instance.id}"
                body = (
                    f"مرحباً أدمن،\n\n"
                    f"تم استلام طلب شراء جديد من الموقع الإلكتروني بانتظار التأكيد.\n\n"
                    f"تفاصيل العميل:\n"
                    f"- اسم الزبون: {instance.customer_name}\n"
                    f"- رقم الهاتف: {instance.phone_number}\n"
                    f"- البريد الإلكتروني: {instance.email or 'غير متوفر'}\n"
                    f"- العنوان / المنطقة: {instance.location or 'غير متوفر'}\n\n"
                    f"المنتجات المطلوبة:\n"
                    f"{items_str}\n\n"
                    f"إجمالي القيمة: {instance.total_amount} ج.س\n\n"
                    f"يمكنك مراجعة وتأكيد الطلب مباشرة عبر لوحة التحكم:\n"
                    f"http://localhost:5173/dashboard/orders"
                )
                send_mail(
                    subject=subject,
                    message=body,
                    from_email=None,
                    recipient_list=['musabsting277@gmail.com'],
                    fail_silently=True,
                )
            except Exception as e:
                # Fail silently to avoid breaking public order checkout flow
                pass

        # Defer email sending until the current transaction commits successfully
        transaction.on_commit(send_email_notification)


@receiver(post_save, sender=ContactMessage)
def notify_admin_new_contact_message(sender, instance, created, **kwargs):
    if created:
        try:
            Notification.objects.create(
                message=f"رسالة تواصل جديدة من {instance.name}",
                notification_type=Notification.NotificationType.MESSAGE
            )
        except Exception:
            pass

        try:
            subject = f"رسالة تواصل جديدة من الموقع: {instance.name}"
            body = (
                f"مرحباً أدمن،\n\n"
                f"تم استلام رسالة تواصل جديدة من الموقع الإلكتروني.\n\n"
                f"تفاصيل المرسل:\n"
                f"- الاسم الكريم: {instance.name}\n"
                f"- البريد الإلكتروني: {instance.email}\n"
                f"- رقم الهاتف: {instance.phone or 'غير متوفر'}\n\n"
                f"الرسالة:\n"
                f"{instance.message}\n\n"
                f"تاريخ الإرسال: {instance.created_at}"
            )
            send_mail(
                subject=subject,
                message=body,
                from_email=None,
                recipient_list=['musabsting277@gmail.com'],
                fail_silently=True,
            )
        except Exception:
            pass
