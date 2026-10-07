"""
نماذج (Models) نظام إدارة قطع غيار السيارات ونقطة البيع.

ملاحظة معمارية: لا تحتوي هذه النماذج على أي تعديل مباشر للمخزون أو إرسال
بريد. تُدار كل العمليات الحسّاسة عبر طبقة الخدمات api.services داخل معاملات
ذرّية، وتُدار الإشعارات عبر api.signals.
"""

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError

from .storage import private_storage
from .validators import validate_image_upload


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
    image = models.ImageField(
        upload_to='categories/',
        null=True,
        blank=True,
        validators=[validate_image_upload],
        verbose_name='الصورة',
    )
    description = models.TextField(null=True, blank=True, verbose_name='الوصف')
    # هامش الربح الافتراضي لقطع الفئة عند التسعير بسعر الصرف (نسبة مئوية).
    # فارغ = هامش المؤسسة العام في SiteSetting.
    markup_percent = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        verbose_name='هامش الربح %',
    )
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
    image = models.ImageField(
        upload_to='car_models/',
        null=True,
        blank=True,
        validators=[validate_image_upload],
        verbose_name='الصورة',
    )
    description = models.TextField(null=True, blank=True, verbose_name='الوصف')

    class Meta:
        verbose_name = 'موديل سيارة'
        verbose_name_plural = 'موديلات السيارات'
        ordering = ['brand', 'model_name', 'year_start']
        unique_together = ['brand', 'model_name', 'year_start']

    def __str__(self):
        end = self.year_end or 'حتى الآن'
        return f"{self.brand} {self.model_name} ({self.year_start}-{end})"

    def clean(self):
        super().clean()
        if self.year_end is not None and self.year_end < self.year_start:
            raise ValidationError({
                'year_end': 'سنة النهاية يجب أن تكون أكبر من أو تساوي سنة البداية.'
            })

    def save(self, *args, **kwargs):
        # clean() لا يُستدعى تلقائياً عند objects.create/save، لذا نتحقق هنا
        # أيضاً لمنع إدخال نطاق سنوات مقلوب عبر أي مسار.
        if self.year_end is not None and self.year_end < self.year_start:
            raise ValidationError({
                'year_end': 'سنة النهاية يجب أن تكون أكبر من أو تساوي سنة البداية.'
            })
        super().save(*args, **kwargs)


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

    class QualityGrade(models.TextChoices):
        # القطعة نفسها تُباع بدرجات مختلفة وأسعار مختلفة؛ الموظف يحتاج أن
        # يرى الدرجة قبل البيع حتى لا يبيع التجاري بسعر الأصلي أو العكس.
        ORIGINAL = 'original', 'أصلي'
        COMMERCIAL = 'commercial', 'تجاري'
        USED = 'used', 'مستعمل'

    name = models.CharField(max_length=255, verbose_name='اسم القطعة')
    part_number = models.CharField(
        max_length=100, unique=True, verbose_name='رقم القطعة'
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
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
    image = models.ImageField(
        upload_to='parts/',
        null=True,
        blank=True,
        validators=[validate_image_upload],
        verbose_name='الصورة',
    )
    description = models.TextField(null=True, blank=True, verbose_name='الوصف')

    # ── هوية القطعة في السوق ──
    brand = models.CharField(max_length=100, blank=True, default='', verbose_name='العلامة / المصنّع')
    oem_number = models.CharField(max_length=100, blank=True, default='', verbose_name='الرقم الأصلي (OEM)')
    quality_grade = models.CharField(
        max_length=20, choices=QualityGrade.choices, blank=True, default='',
        verbose_name='درجة الجودة',
    )
    aliases = models.TextField(
        blank=True, default='', verbose_name='أسماء أخرى',
        help_text='التسميات الدارجة للقطعة، كل اسم في سطر أو مفصولة بفواصل.',
    )
    barcode = models.CharField(
        max_length=64, null=True, blank=True, unique=True, verbose_name='الباركود',
    )
    # نص البحث الموحّد (حروف عربية موحّدة + أرقام بلا فواصل). يُحدَّث تلقائياً
    # عبر api.search؛ لا يُكتب يدوياً.
    search_text = models.TextField(blank=True, default='', editable=False)

    # ── التسعير بسعر الصرف ──
    # تكلفة الاستبدال بعملة الشراء: سعر البيع = التكلفة × سعر الصرف × (1 + الهامش).
    # purchase_price يبقى متوسط التكلفة التاريخية بالجنيه لحساب الربح الفعلي.
    cost_currency = models.CharField(
        max_length=3, blank=True, default='', verbose_name='عملة الشراء',
        help_text='فارغة = عملة المؤسسة (لا تسعير بسعر الصرف).',
    )
    foreign_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        verbose_name='تكلفة الشراء بعملة الشراء',
    )
    markup_percent = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        verbose_name='هامش الربح %',
        help_text='فارغ = هامش الفئة ثم هامش المؤسسة.',
    )
    price_updated_at = models.DateTimeField(null=True, blank=True, verbose_name='آخر تحديث للسعر')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'قطعة غيار'
        verbose_name_plural = 'قطع الغيار'
        ordering = ['name']
        indexes = [
            # نقطة النهاية العامة `public_featured_parts` تُصفّي بهذا الحقل
            # على كل زيارة للمتجر، وهي بلا مصادقة — فالفهرس ضروري هناك.
            models.Index(fields=['is_featured']),
        ]

    def __str__(self):
        return f"{self.name} ({self.part_number})"

    SEARCH_INPUT_FIELDS = frozenset({
        'name', 'part_number', 'aliases', 'brand', 'oem_number', 'barcode',
        'shelf_location', 'category', 'quality_grade',
    })

    def save(self, *args, **kwargs):
        # نص البحث يُبنى مع حفظ القطعة حتى لا يتأخر عن الاسم أو الرقم؛ حفظ
        # الرصيد وحده (كل عملية بيع) لا يعيد بناءه. السيارات المتوافقة (M2M)
        # تُضاف إليه عبر api.signals بعد ربطها.
        update_fields = kwargs.get('update_fields')
        if update_fields is None or self.SEARCH_INPUT_FIELDS & set(update_fields):
            from .search import build_part_search_text
            self.search_text = build_part_search_text(self)
            if update_fields is not None:
                kwargs['update_fields'] = {*update_fields, 'search_text'}
        super().save(*args, **kwargs)

    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.min_stock_alert


class Customer(models.Model):
    """Customer information model."""

    class CustomerType(models.TextChoices):
        RETAIL = 'retail', 'مستهلك'
        WORKSHOP = 'workshop', 'ورشة'
        WHOLESALE = 'wholesale', 'تاجر جملة'

    name = models.CharField(max_length=255, verbose_name='الاسم')
    location = models.CharField(max_length=255, null=True, blank=True, verbose_name='الموقع')
    email = models.EmailField(null=True, blank=True, verbose_name='البريد الإلكتروني')
    phone = models.CharField(max_length=50, verbose_name='الهاتف')
    whatsapp_number = models.CharField(max_length=50, null=True, blank=True, verbose_name='رقم الواتساب')
    customer_type = models.CharField(
        max_length=20, choices=CustomerType.choices, default=CustomerType.RETAIL,
        verbose_name='نوع العميل',
    )
    # خصم خاص بهذا العميل؛ فارغ = خصم نوعه من إعدادات المؤسسة.
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        verbose_name='نسبة الخصم %',
    )
    # البيع الآجل مسموح فقط لعميل حدّه أكبر من صفر، وبما لا يتجاوز الحد.
    credit_limit = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
        verbose_name='حد الائتمان',
    )

    class Meta:
        verbose_name = 'عميل'
        verbose_name_plural = 'العملاء'
        ordering = ['name']

    def __str__(self):
        return self.name


class BankAccount(models.Model):
    """حساب بنكي للمحل تُستقبل عليه التحويلات (مثل بنكك)."""

    name = models.CharField(max_length=100, unique=True, verbose_name='اسم الحساب / البنك')
    account_number = models.CharField(max_length=100, blank=True, default='', verbose_name='رقم الحساب')
    is_active = models.BooleanField(default=True, verbose_name='نشط')

    class Meta:
        verbose_name = 'حساب بنكي'
        verbose_name_plural = 'الحسابات البنكية'
        ordering = ['name']

    def __str__(self):
        return self.name


class Invoice(models.Model):
    """Sales invoice."""

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'نقدي'
        BANK = 'bank', 'تحويل بنكي'
        MIXED = 'mixed', 'مختلط'
        CREDIT = 'credit', 'آجل'

    cashier = models.ForeignKey(
        CustomUser,
        on_delete=models.PROTECT,
        related_name='invoices',
        verbose_name='الكاشير',
    )
    # PROTECT: فاتورة العميل (وخاصة الآجلة) جزء من حسابه؛ حذف العميل كان يمحو
    # هوية المدين من فواتيره.
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
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
    # المدفوع عند البيع (مجموع دفعات البيع) والمتبقي ديناً على العميل.
    paid_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0, verbose_name='المدفوع عند البيع',
    )
    credit_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0, verbose_name='المبلغ الآجل',
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
    # مفتاح إعادة المحاولة (Idempotency-Key) الذي تولّده الواجهة لكل عملية
    # بيع. إعادة إرسال الطلب نفسه بعد انقطاع الرد تُعيد هذه الفاتورة بدل
    # إنشاء فاتورة ثانية وخصم المخزون مرتين. البصمة تكشف إعادة استخدام
    # المفتاح نفسه بمحتوى مختلف.
    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        editable=False,
        verbose_name='مفتاح إعادة المحاولة',
    )
    request_fingerprint = models.CharField(
        max_length=64,
        blank=True,
        default='',
        editable=False,
        verbose_name='بصمة الطلب',
    )

    class Meta:
        verbose_name = 'فاتورة'
        verbose_name_plural = 'الفواتير'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['cashier', 'idempotency_key'],
                condition=models.Q(idempotency_key__isnull=False),
                name='unique_invoice_idempotency_key_per_cashier',
            ),
        ]

    def __str__(self):
        return f"فاتورة #{self.pk} - {self.total_amount} {self.currency}"

    def clean(self):
        super().clean()
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
    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='تكلفة الوحدة وقت البيع',
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

    @property
    def profit(self):
        """هامش الربح لبند الفاتورة."""
        return (self.unit_price - self.cost_price) * self.quantity


class SiteSetting(models.Model):
    """Singleton site configuration for public branding."""
    site_name = models.CharField(max_length=255, default='اسبير', verbose_name='اسم الموقع')
    logo = models.ImageField(
        upload_to='logos/',
        blank=True,
        null=True,
        validators=[validate_image_upload],
        verbose_name='الشعار',
    )
    hero_title = models.CharField(max_length=255, default='أفضل قطع الغيار لسيارتك', verbose_name='عنوان الهيرو')
    hero_subtitle = models.TextField(default='نوفر أفضل قطع الغيار الأصلية والمضمونة لكافة أنواع السيارات بأسعار منافسة.', verbose_name='العنوان الفرعي للهيرو')

    class ReceiptPaper(models.TextChoices):
        THERMAL_80 = '80mm', 'إيصال حراري 80 مم'
        THERMAL_58 = '58mm', 'إيصال حراري 58 مم'
        A4 = 'a4', 'ورق A4'

    # ── هوية البائع على الإيصال ──
    business_phone = models.CharField(max_length=100, blank=True, default='', verbose_name='هاتف المحل')
    business_address = models.CharField(max_length=255, blank=True, default='', verbose_name='عنوان المحل')
    tax_number = models.CharField(max_length=50, blank=True, default='', verbose_name='الرقم الضريبي')
    receipt_footer = models.CharField(
        max_length=255, blank=True, default='شكراً لتعاملكم معنا', verbose_name='تذييل الإيصال',
    )
    receipt_paper = models.CharField(
        max_length=10, choices=ReceiptPaper.choices, default=ReceiptPaper.THERMAL_80,
        verbose_name='مقاس الإيصال',
    )

    # ── التسعير ──
    default_markup_percent = models.DecimalField(
        max_digits=6, decimal_places=2, default=25, validators=[MinValueValidator(0)],
        verbose_name='هامش الربح الافتراضي %',
    )
    price_rounding = models.PositiveIntegerField(
        default=0, verbose_name='تقريب الأسعار',
        help_text='تقريب سعر البيع لأعلى إلى أقرب مضاعف لهذا الرقم (0 = بلا تقريب).',
    )
    workshop_discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)],
        verbose_name='خصم الورش %',
    )
    wholesale_discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)],
        verbose_name='خصم الجملة %',
    )

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

    @classmethod
    def load(cls) -> 'SiteSetting':
        """السجل المفرد بإعداداته الافتراضية إن لم يُنشأ بعد."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


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

    # PROTECT لا CASCADE: مستند التوريد يفسّر مصدر الرصيد وتكلفته، فحذف
    # المورد أو القطعة لا يجوز أن يمحوه. المورد المنتهي يُعطَّل بدل حذفه.
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='deals',
        verbose_name='المورد',
    )
    spare_part = models.ForeignKey(
        SparePart,
        on_delete=models.PROTECT,
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
    # الشراء بعملة أجنبية: purchase_price (بالجنيه) = التكلفة الأجنبية × سعر
    # الصرف المسجّل هنا وقت التوريد.
    currency = models.CharField(max_length=3, blank=True, default='', verbose_name='عملة الشراء')
    foreign_unit_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, verbose_name='التكلفة بعملة الشراء',
    )
    exchange_rate = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True, verbose_name='سعر الصرف',
    )
    # لقطة متوسط التكلفة قبل التوريد وحركة الإضافة الخاصة به: إلغاء التوريد
    # يعيد القيمة إلى ما كانت عليه بالضبط، ويُسمح به فقط إن بقيت حركته آخر
    # حركة على القطعة (services.delete_supply_deal). فارغتان للتوريدات
    # المسجّلة قبل إضافتهما.
    previous_purchase_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        verbose_name='متوسط التكلفة قبل التوريد',
    )
    # وكذلك تكلفة الاستبدال الأجنبية قبل التوريد: إلغاء توريد بتكلفة مكتوبة
    # خطأ يجب أن يعيدها، وإلا سُعّرت القطعة لاحقاً من الرقم الخاطئ.
    previous_cost_currency = models.CharField(max_length=3, blank=True, default='', editable=False)
    previous_foreign_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, editable=False,
    )
    restock_movement = models.OneToOneField(
        'StockMovement',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        editable=False,
        related_name='supply_deal',
        verbose_name='حركة الإضافة',
    )

    class Meta:
        verbose_name = 'عملية توريد'
        verbose_name_plural = 'عمليات التوريد'
        ordering = ['-date_received']

    def __str__(self):
        return f"توريد #{self.pk} - {self.spare_part.name} x{self.quantity_added}"

    def save(self, *args, **kwargs):
        # حساب التكلفة الإجمالية فقط. تعديل المخزون يتم عبر طبقة الخدمات
        # (api.services) داخل معاملة ذرّية مقفلة — وليس داخل save().
        self.total_cost = self.quantity_added * self.purchase_price
        super().save(*args, **kwargs)
# ─── Public E-Commerce Orders ──────────────────────────────────────────


class PublicOrder(models.Model):
    """طلب شراء وارد من الواجهة العامة (المتجر الإلكتروني)."""

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
    total_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, verbose_name='القيمة الإجمالية'
    )

    class Meta:
        verbose_name = 'طلب خارجي'
        verbose_name_plural = 'طلبات خارجية'
        ordering = ['-created_at']
        indexes = [
            # تُستخدم في إحصاءات اللوحة (عدّ الطلبات قيد الانتظار) وفي
            # فلترة قائمة الطلبات بحسب الحالة.
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"طلب #{self.id} - {self.customer_name}"

    # ملاحظة: لا تعديل للمخزون داخل save(). يُدار ذلك فقط عبر
    # api.services.confirm_public_order / cancel_public_order
    # داخل معاملة ذرّية مع أقفال صفوف، لمنع الخصم المزدوج وسباقات التزامن.


class PublicOrderItem(models.Model):
    """بند داخل طلب خارجي."""

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
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        verbose_name='الكمية',
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name='سعر الوحدة',
    )
    # لقطة تكلفة الوحدة وقت الطلب — بنفس منطق InvoiceItem.cost_price، حتى
    # يُحسب ربح قناة المتجر الإلكتروني وتبقى تقاريره التاريخية ثابتة.
    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='تكلفة الوحدة وقت الطلب',
    )

    class Meta:
        verbose_name = 'عنصر طلب خارجي'
        verbose_name_plural = 'عناصر طلبات خارجية'

    def __str__(self):
        return f"{self.spare_part.name} x{self.quantity}"

    @property
    def subtotal(self):
        return self.unit_price * self.quantity


# ─── Stock Ledger (سجل حركات المخزون) ─────────────────────────────────


class StockMovement(models.Model):
    """
    سجل غير قابل للتعديل لكل حركة على المخزون.

    المخزون مصدر حقيقة واحد (SparePart.stock_quantity) وهذا الجدول يوثّق
    كيف وصل إلى قيمته: بيع، توريد، تأكيد طلب خارجي، إلغاء، مرتجع أو تسوية.
    يُمكّن التدقيق وحساب التقارير ورصد الأخطاء.
    """

    class Reason(models.TextChoices):
        SALE = 'sale', 'بيع'
        PUBLIC_ORDER_CONFIRMED = 'public_order_confirmed', 'تأكيد طلب خارجي'
        PUBLIC_ORDER_CANCELLED = 'public_order_cancelled', 'إلغاء طلب خارجي'
        RESTOCK = 'restock', 'توريد'
        RESTOCK_REVERSAL = 'restock_reversal', 'إلغاء توريد'
        RETURN = 'return', 'مرتجع'
        ADJUSTMENT = 'adjustment', 'تسوية يدوية'
        OPENING = 'opening', 'رصيد افتتاحي'
        STOCK_COUNT = 'stock_count', 'جرد'

    spare_part = models.ForeignKey(
        SparePart,
        # PROTECT لا CASCADE: حذف قطعة لا يجوز أن يمحو سجلّها التدقيقي
        # (تاريخ التوريد والبيع والتسويات). PROTECT يعطي رسالة واضحة بدل
        # فقدان صامت للبيانات التي وُجد الجدول من أجلها.
        on_delete=models.PROTECT,
        related_name='stock_movements',
        verbose_name='قطعة الغيار',
    )
    change = models.IntegerField(
        verbose_name='التغيير',
        help_text='موجب للزيادة وسالب للنقصان.',
    )
    quantity_after = models.PositiveIntegerField(verbose_name='الكمية بعد الحركة')
    reason = models.CharField(
        max_length=32, choices=Reason.choices, verbose_name='السبب'
    )
    reference = models.CharField(
        max_length=100, blank=True, default='', verbose_name='المرجع'
    )
    unit_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        verbose_name='تكلفة الوحدة',
    )
    created_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_movements',
        verbose_name='بواسطة',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='تاريخ الحركة')

    class Meta:
        verbose_name = 'حركة مخزون'
        verbose_name_plural = 'حركات المخزون'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['spare_part', '-created_at']),
            models.Index(fields=['reason']),
        ]

    def __str__(self):
        sign = '+' if self.change >= 0 else ''
        return f"{self.spare_part.name}: {sign}{self.change} ({self.get_reason_display()})"


# ─── Administrative Notification Alerts ────────────────────────────────


class Notification(models.Model):
    """تنبيه إداري داخلي يظهر في جرس الإشعارات بلوحة التحكم."""

    class NotificationType(models.TextChoices):
        ORDER = 'ORDER', 'طلب شراء'
        MESSAGE = 'MESSAGE', 'رسالة تواصل'

    message = models.CharField(max_length=500, verbose_name='محتوى التنبيه')
    is_read = models.BooleanField(default=False, verbose_name='مقروء')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='تاريخ التنبيه')
    notification_type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        verbose_name='نوع التنبيه',
    )

    class Meta:
        verbose_name = 'تنبيه'
        verbose_name_plural = 'تنبيهات'
        ordering = ['-created_at']
        indexes = [
            # عدّاد غير المقروء يُستقصى دورياً (كل 30 ثانية لكل مستخدم)،
            # فهو أكثر حقل يُصفّى في النظام بعدد مرات لا يُستهان به.
            models.Index(fields=['is_read']),
        ]

    def __str__(self):
        return f"{self.notification_type} - {self.message[:30]}"


# ─── المدفوعات والمرتجعات والصندوق ────────────────────────────────────


class Payment(models.Model):
    """
    حركة مال واحدة: دفعة عند البيع، أو تحصيل دين من عميل، أو ردّ مبلغ مرتجع.

    فاتورة واحدة قد تُدفع بعدة دفعات (نقداً وتحويلاً)، والمتبقي يصبح ديناً
    على العميل (Invoice.credit_amount). رقم إشعار التحويل فريد عبر النظام
    كله: إعادة استخدام صورة إشعار قديمة أسلوب احتيال معروف.
    """

    class Kind(models.TextChoices):
        SALE = 'sale', 'دفعة بيع'
        COLLECTION = 'collection', 'تحصيل دين'
        REFUND = 'refund', 'ردّ مبلغ مرتجع'

    class Method(models.TextChoices):
        CASH = 'cash', 'نقدي'
        BANK = 'bank', 'تحويل بنكي'

    kind = models.CharField(max_length=20, choices=Kind.choices, verbose_name='النوع')
    method = models.CharField(max_length=10, choices=Method.choices, verbose_name='الطريقة')
    amount = models.DecimalField(
        max_digits=14, decimal_places=2, validators=[MinValueValidator(0)], verbose_name='المبلغ',
    )
    invoice = models.ForeignKey(
        Invoice, on_delete=models.PROTECT, null=True, blank=True,
        related_name='payments', verbose_name='الفاتورة',
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, null=True, blank=True,
        related_name='payments', verbose_name='العميل',
    )
    sale_return = models.ForeignKey(
        'SaleReturn', on_delete=models.PROTECT, null=True, blank=True,
        related_name='payments', verbose_name='المرتجع',
    )
    bank_account = models.ForeignKey(
        BankAccount, on_delete=models.PROTECT, null=True, blank=True,
        related_name='payments', verbose_name='الحساب البنكي',
    )
    bank_name = models.CharField(max_length=255, blank=True, default='', verbose_name='البنك')
    reference_id = models.CharField(max_length=100, null=True, blank=True, verbose_name='رقم الإشعار')
    # الصيغة الموحّدة لرقم الإشعار (بلا مسافات أو رموز) — عليها قيد الفرادة.
    reference_key = models.CharField(max_length=100, null=True, blank=True, editable=False)
    sender_account_number = models.CharField(
        max_length=100, blank=True, default='', verbose_name='رقم حساب المرسل',
    )
    # خارج /media/ العامة: تُقرأ عبر payments/{id}/proof-image/ فقط.
    proof_image = models.ImageField(
        upload_to='payment_proofs/', storage=private_storage, null=True, blank=True,
        validators=[validate_image_upload], verbose_name='صورة الإشعار',
    )
    verified_at = models.DateTimeField(null=True, blank=True, verbose_name='تاريخ المطابقة')
    verified_by = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='verified_payments', verbose_name='طابقها',
    )
    note = models.CharField(max_length=255, blank=True, default='', verbose_name='ملاحظة')
    created_by = models.ForeignKey(
        CustomUser, on_delete=models.PROTECT, related_name='payments', verbose_name='بواسطة',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='التاريخ')

    class Meta:
        verbose_name = 'دفعة'
        verbose_name_plural = 'المدفوعات'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['reference_key'],
                condition=models.Q(reference_key__isnull=False),
                name='unique_payment_transfer_reference',
            ),
        ]
        indexes = [
            models.Index(fields=['created_at']),
            models.Index(fields=['method', 'kind']),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} {self.amount} ({self.get_method_display()})"


class SaleReturn(models.Model):
    """مرتجع بيع (جزئي أو كامل) من فاتورة قائمة."""

    class RefundMethod(models.TextChoices):
        CASH = 'cash', 'نقدي'
        BANK = 'bank', 'تحويل بنكي'
        ACCOUNT = 'account', 'خصم من حساب العميل'

    invoice = models.ForeignKey(
        Invoice, on_delete=models.PROTECT, related_name='returns', verbose_name='الفاتورة',
    )
    refund_method = models.CharField(
        max_length=10, choices=RefundMethod.choices, verbose_name='طريقة ردّ المبلغ',
    )
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='قيمة المرتجع')
    reason = models.CharField(max_length=255, blank=True, default='', verbose_name='السبب')
    created_by = models.ForeignKey(
        CustomUser, on_delete=models.PROTECT, related_name='sale_returns', verbose_name='بواسطة',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='التاريخ')

    class Meta:
        verbose_name = 'مرتجع بيع'
        verbose_name_plural = 'مرتجعات البيع'
        ordering = ['-created_at']

    def __str__(self):
        return f"مرتجع #{self.pk} من فاتورة #{self.invoice_id}"


class SaleReturnItem(models.Model):
    """بند مرتجع: كمية من بند فاتورة، بسعر البيع وتكلفته الأصليين."""

    sale_return = models.ForeignKey(
        SaleReturn, on_delete=models.CASCADE, related_name='items', verbose_name='المرتجع',
    )
    invoice_item = models.ForeignKey(
        InvoiceItem, on_delete=models.PROTECT, related_name='return_items', verbose_name='بند الفاتورة',
    )
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)], verbose_name='الكمية')
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, verbose_name='سعر الوحدة')
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, verbose_name='تكلفة الوحدة')
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='المجموع')

    class Meta:
        verbose_name = 'بند مرتجع'
        verbose_name_plural = 'بنود المرتجعات'


class Expense(models.Model):
    """مصروف يومي من الصندوق أو الحساب البنكي (إيجار، كهرباء، ترحيل...)."""

    class Method(models.TextChoices):
        CASH = 'cash', 'نقدي'
        BANK = 'bank', 'تحويل بنكي'

    date = models.DateField(verbose_name='التاريخ')
    category = models.CharField(max_length=100, verbose_name='البند')
    amount = models.DecimalField(
        max_digits=14, decimal_places=2, validators=[MinValueValidator(0)], verbose_name='المبلغ',
    )
    method = models.CharField(
        max_length=10, choices=Method.choices, default=Method.CASH, verbose_name='الطريقة',
    )
    bank_account = models.ForeignKey(
        BankAccount, on_delete=models.PROTECT, null=True, blank=True,
        related_name='expenses', verbose_name='الحساب البنكي',
    )
    description = models.CharField(max_length=255, blank=True, default='', verbose_name='الوصف')
    created_by = models.ForeignKey(
        CustomUser, on_delete=models.PROTECT, related_name='expenses', verbose_name='بواسطة',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'مصروف'
        verbose_name_plural = 'المصروفات'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.category} - {self.amount}"


class DailyClose(models.Model):
    """إقفال يومية: لقطة الصندوق المتوقع مقابل النقد المعدود فعلاً."""

    date = models.DateField(unique=True, verbose_name='اليوم')
    opening_cash = models.DecimalField(max_digits=14, decimal_places=2, default=0, verbose_name='نقد بداية اليوم')
    expected_cash = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='النقد المتوقع')
    counted_cash = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='النقد المعدود')
    difference = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='الفرق')
    summary = models.JSONField(default=dict, verbose_name='ملخص اليوم')
    notes = models.TextField(blank=True, default='', verbose_name='ملاحظات')
    closed_by = models.ForeignKey(
        CustomUser, on_delete=models.PROTECT, related_name='daily_closes', verbose_name='أقفلها',
    )
    closed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'إقفال يومية'
        verbose_name_plural = 'إقفالات اليومية'
        ordering = ['-date']

    def __str__(self):
        return f"إقفال {self.date}"


class ExchangeRate(models.Model):
    """سعر صرف عملة أجنبية مقابل عملة المؤسسة (كم جنيهاً للوحدة)."""

    currency = models.CharField(max_length=3, verbose_name='العملة')
    rate = models.DecimalField(
        max_digits=14, decimal_places=4, validators=[MinValueValidator(0)], verbose_name='السعر',
    )
    created_by = models.ForeignKey(
        CustomUser, on_delete=models.PROTECT, related_name='exchange_rates', verbose_name='بواسطة',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='التاريخ')

    class Meta:
        verbose_name = 'سعر صرف'
        verbose_name_plural = 'أسعار الصرف'
        ordering = ['-created_at', '-pk']
        indexes = [models.Index(fields=['currency', '-created_at'])]

    def __str__(self):
        return f"{self.currency} = {self.rate}"


class StockCount(models.Model):
    """جلسة جرد: كميات معدودة تُطبَّق تسويةً واحدة على الرصيد."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'قيد العدّ'
        APPLIED = 'applied', 'مطبّق'
        CANCELLED = 'cancelled', 'ملغي'

    title = models.CharField(max_length=255, blank=True, default='', verbose_name='العنوان')
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, verbose_name='الحالة',
    )
    notes = models.TextField(blank=True, default='', verbose_name='ملاحظات')
    created_by = models.ForeignKey(
        CustomUser, on_delete=models.PROTECT, related_name='stock_counts', verbose_name='أنشأه',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    applied_by = models.ForeignKey(
        CustomUser, on_delete=models.PROTECT, null=True, blank=True,
        related_name='applied_stock_counts', verbose_name='طبّقه',
    )
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'جرد'
        verbose_name_plural = 'عمليات الجرد'
        ordering = ['-created_at']

    def __str__(self):
        return f"جرد #{self.pk}"


class StockCountLine(models.Model):
    """كمية معدودة لقطعة داخل جلسة جرد."""

    stock_count = models.ForeignKey(
        StockCount, on_delete=models.CASCADE, related_name='lines', verbose_name='الجرد',
    )
    spare_part = models.ForeignKey(
        SparePart, on_delete=models.PROTECT, related_name='count_lines', verbose_name='القطعة',
    )
    counted_quantity = models.PositiveIntegerField(verbose_name='الكمية المعدودة')
    # رصيد النظام لحظة العدّ: التطبيق يضيف الفرق (المعدود − هذا الرصيد) إلى
    # الرصيد الحالي، فلا تُمحى مبيعات أو مرتجعات حدثت بين العدّ والتطبيق.
    quantity_at_count = models.PositiveIntegerField(null=True, blank=True, verbose_name='الرصيد عند العدّ')
    # الرصيد في النظام لحظة التطبيق (يُحفظ للتدقيق).
    system_quantity = models.PositiveIntegerField(null=True, blank=True, verbose_name='رصيد النظام')

    class Meta:
        verbose_name = 'سطر جرد'
        verbose_name_plural = 'أسطر الجرد'
        constraints = [
            models.UniqueConstraint(fields=['stock_count', 'spare_part'], name='unique_part_per_stock_count'),
        ]
