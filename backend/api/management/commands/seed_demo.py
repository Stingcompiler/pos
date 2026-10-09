"""
بيانات عرض تجريبي لمحل قطع غيار سوداني (للتسويق، لا لمحل حقيقي).

    python manage.py seed_demo            # قاعدة فارغة فقط
    python manage.py seed_demo --reset    # يمسح كل شيء ثم يعيد التعبئة

--reset يتطلب DJANGO_DEMO_MODE=True حتى لا يمسح قاعدة محل حقيقي بالخطأ.
كل الحركات تمر عبر الخدمات (أرصدة افتتاحية، توريد، بيع، تحصيل) فتبدو
التقارير وكشوف الحساب وإقفال اليومية كما في محل يعمل منذ أسبوعين.
"""

import io
import random
import shutil
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from api import services
from api.models import (
    BankAccount, CarModel, Category, ContactMethod, Customer, CustomUser, Expense, Invoice,
    Payment, PublicOrder, PublicOrderItem, SiteSetting, SparePart, StockMovement, Supplier,
)

DEMO_PASSWORD = 'aspir-demo'
SALES_PHONE = '0902929451'
DEMO_USERS = [
    # (اسم المستخدم، الاسم، الدور)
    ('demo', 'مدير المحل', 'manager'),
    ('cashier', 'كاشير', 'employee'),
]

# (الفئة، الاسم، رقم القطعة، الرقم الأصلي، العلامة، الجودة، أسماء دارجة، الرف، الشراء، البيع، الكمية، موديلات)
PARTS = [
    ('فلاتر', 'فلتر زيت تويوتا', 'OF-1001', '90915-YZZE1', 'Toyota', 'original', 'فلتر زيت', 'A1', 9000, 14000, 40, ['Hilux', 'Corolla', 'Camry']),
    ('فلاتر', 'فلتر زيت تجاري', 'OF-1002', '90915-YZZE1', 'Sakura', 'commercial', 'فلتر زيت', 'A1', 4500, 8000, 60, ['Hilux', 'Corolla', 'Camry']),
    ('فلاتر', 'فلتر هواء هايلوكس', 'AF-2001', '17801-0C010', 'Toyota', 'original', 'فلتر هوا', 'A2', 15000, 24000, 18, ['Hilux']),
    ('فلاتر', 'فلتر جاز لاندكروزر', 'FF-3001', '23390-51070', 'Toyota', 'original', 'فلتر ديزل، فلتر جاز', 'A2', 22000, 35000, 12, ['Land Cruiser 70', 'Land Cruiser 200']),
    ('فلاتر', 'فلتر مكيف أكسنت', 'CF-4001', '97133-1R000', 'Hyundai', 'commercial', 'فلتر كابينة', 'A3', 6000, 11000, 25, ['Accent', 'Elantra']),
    ('فرامل', 'فحمات فرامل أمامية هايلوكس', 'BP-1101', '04465-0K290', 'Toyota', 'original', 'تيل فرامل، فحمات', 'B1', 38000, 58000, 15, ['Hilux']),
    ('فرامل', 'فحمات فرامل أمامية تجارية', 'BP-1102', '04465-0K290', 'Brembo', 'commercial', 'تيل فرامل، فحمات', 'B1', 20000, 33000, 22, ['Hilux']),
    ('فرامل', 'هوبات فرامل كورولا', 'BD-1201', '43512-02190', 'Toyota', 'original', 'ديسك، هوب', 'B2', 55000, 82000, 6, ['Corolla']),
    ('فرامل', 'زيت فرامل DOT4', 'BF-1301', '', 'Bosch', 'commercial', 'زيت فرامل', 'B3', 5000, 9000, 48, []),
    ('محرك', 'بوجي إريديوم', 'SP-2101', '90919-01253', 'Denso', 'original', 'بوجي، شمعة', 'C1', 9500, 16000, 64, ['Corolla', 'Camry', 'Yaris']),
    ('محرك', 'سير مكينة كامري', 'TB-2201', '90916-02679', 'Gates', 'commercial', 'سير، قشاط', 'C2', 18000, 30000, 10, ['Camry']),
    ('محرك', 'طرمبة ماء هايلوكس', 'WP-2301', '16100-09460', 'Aisin', 'original', 'طرمبة موية، مضخة ماء', 'C3', 75000, 115000, 5, ['Hilux']),
    ('محرك', 'طرمبة بنزين أكسنت', 'FP-2401', '31110-1R000', 'Hyundai', 'original', 'طرمبة بنزين، مضخة وقود', 'C3', 60000, 95000, 4, ['Accent']),
    ('محرك', 'رديتر لاندكروزر', 'RD-2501', '16400-66110', 'Denso', 'original', 'رديتر، مبرد', 'C4', 260000, 380000, 2, ['Land Cruiser 70']),
    ('كهرباء', 'بطارية 70 أمبير', 'BT-3101', '', 'Varta', 'commercial', 'بطارية، بطاريه', 'D1', 95000, 140000, 9, []),
    ('كهرباء', 'دينمو هايلوكس', 'AL-3201', '27060-0L020', 'Denso', 'used', 'دينمو، الترنيتر', 'D2', 120000, 175000, 3, ['Hilux']),
    ('كهرباء', 'سلف كورولا', 'ST-3301', '28100-0D110', 'Denso', 'used', 'سلف، مارش', 'D2', 90000, 140000, 2, ['Corolla']),
    ('كهرباء', 'لمبة أمامية H4', 'HL-3401', '', 'Philips', 'commercial', 'لمبة، نور قدام', 'D3', 3000, 6000, 80, []),
    ('تعليق', 'مساعد أمامي هايلوكس', 'SH-4101', '48510-09P50', 'KYB', 'commercial', 'مساعد، شكمان', 'E1', 45000, 70000, 8, ['Hilux']),
    ('تعليق', 'جلبة مقص أكسنت', 'BU-4201', '54584-1G000', 'Hyundai', 'commercial', 'جلبة، بوشة', 'E2', 4000, 8000, 30, ['Accent', 'Elantra']),
    ('تعليق', 'رمانة ميزان سنتر', 'BJ-4301', '43330-09510', 'CTR', 'commercial', 'رمانة، بول جوينت', 'E2', 14000, 24000, 14, ['Hilux', 'Navara']),
    ('زيوت', 'زيت مكينة 5W-30 (4 لتر)', 'OL-5101', '', 'Total', 'commercial', 'زيت، زيت محرك', 'F1', 28000, 42000, 36, []),
    ('زيوت', 'زيت قير أوتوماتيك ATF', 'OL-5201', '', 'Toyota', 'original', 'زيت قير، زيت جير', 'F1', 16000, 26000, 20, []),
    ('زيوت', 'ماء رديتر (كولانت)', 'CL-5301', '', 'Prestone', 'commercial', 'موية رديتر، كولانت', 'F2', 7000, 12000, 3, []),
]

# أوصاف القطع في المتجر التجريبي: ما يحتاجه الزبون ليختار (المقاس، الاستخدام، متى تُغيّر).
DESCRIPTIONS = {
    'OF-1001': 'فلتر زيت أصلي لمحركات تويوتا البنزين 1.6–2.5 لتر. يُغيّر مع كل تغيير زيت (كل 5,000 كم تقريباً).',
    'OF-1002': 'بديل تجاري لفلتر الزيت بالمقاس نفسه (90915-YZZE1). خيار اقتصادي لتغيير الزيت الدوري.',
    'AF-2001': 'فلتر هواء المحرك لهايلوكس. يُفحص كل تغيير زيت ويُغيّر أسرع في الطرق الترابية.',
    'FF-3001': 'فلتر جاز (ديزل) أصلي يحمي البخاخات من الشوائب والماء. يُغيّر كل 20,000 كم تقريباً.',
    'CF-4001': 'فلتر مكيف الكابينة. يحسّن تبريد المكيف ويقلل الغبار داخل السيارة.',
    'BP-1101': 'طقم فحمات فرامل أمامية (4 قطع) أصلي لهايلوكس.',
    'BP-1102': 'طقم فحمات فرامل أمامية تجاري بالمقاس نفسه، مناسب للاستخدام اليومي داخل المدينة.',
    'BD-1201': 'هوب (ديسك) فرامل أمامي، يُباع بالقطعة. يُنصح بتغييره زوجاً مع الفحمات.',
    'BF-1301': 'زيت فرامل DOT4 عبوة 500 مل، يناسب أغلب السيارات. تحقق من الغطاء: DOT3 أو DOT4.',
    'SP-2101': 'بوجي إريديوم طويل العمر (حتى 60,000 كم). تحتاج 4 قطع لمحرك بأربع أسطوانات.',
    'TB-2201': 'سير المكينة (الدينمو والمكيف) لكامري. يُغيّر عند ظهور تشققات أو صوت صرير.',
    'WP-2301': 'طرمبة ماء (مضخة تبريد) لهايلوكس مع الجوان. يُفضّل تغيير الكولانت معها.',
    'FP-2401': 'طرمبة بنزين داخل التنك لأكسنت، كاملة مع الحساس.',
    'RD-2501': 'رديتر نحاس للاندكروزر 70، تبريد عالٍ للحرارة والطرق الطويلة.',
    'BT-3101': 'بطارية 70 أمبير جافة، ضمان سنة. تناسب أغلب السيارات الصغيرة والمتوسطة — تحقق من المقاس واتجاه الأقطاب.',
    'AL-3201': 'دينمو مستعمل مفحوص لهايلوكس، ضمان أسبوعين للتركيب.',
    'ST-3301': 'سلف مستعمل مفحوص لكورولا، ضمان أسبوعين للتركيب.',
    'HL-3401': 'لمبة أمامية H4 هالوجين 60/55 واط، نور عالٍ ومنخفض.',
    'SH-4101': 'مساعد أمامي غازي لهايلوكس، يُباع بالقطعة. يُنصح بتغييره زوجاً.',
    'BU-4201': 'جلبة مقص سفلي لأكسنت وإلنترا.',
    'BJ-4301': 'رمانة ميزان سفلية لهايلوكس ونافارا.',
    'OL-5101': 'زيت محرك صناعي 5W-30، عبوة 4 لتر. يناسب أغلب محركات البنزين الحديثة.',
    'OL-5201': 'زيت قير أوتوماتيك ATF، عبوة 1 لتر. راجع دليل سيارتك لنوع الزيت.',
    'CL-5301': 'سائل تبريد (كولانت) جاهز، عبوة 1 جالون. لا يُخلط بأنواع مختلفة.',
}

SUPPLIERS = [
    ('شركة النيل لقطع الغيار', 'عبدالرحمن', '0912345001', 'المنطقة الصناعية، الخرطوم بحري'),
    ('مؤسسة الخليج للاستيراد', 'حاتم', '0912345002', 'السوق العربي، الخرطوم'),
]

CUSTOMERS = [
    # (الاسم، الهاتف، النوع، حد الائتمان، الموقع)
    ('ورشة الأمين للميكانيكا', '0911100200', 'workshop', 1500000, 'المنطقة الصناعية بحري'),
    ('ورشة النور', '0911100201', 'workshop', 800000, 'أم درمان - سوق ليبيا'),
    ('شركة الريان للنقل', '0911100202', 'wholesale', 3000000, 'الخرطوم - الامتداد'),
    ('عثمان محمد', '0911100203', 'retail', 0, 'الخرطوم 2'),
    ('مصطفى علي', '0911100204', 'retail', 0, 'بحري - شمبات'),
]


class Command(BaseCommand):
    help = 'تعبئة بيانات عرض تجريبي (محل قطع غيار) للتسويق.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='مسح القاعدة والصور ثم إعادة التعبئة.')

    def handle(self, *args, **options):
        if options['reset']:
            if not getattr(settings, 'DEMO_MODE', False):
                raise CommandError('--reset يمسح القاعدة كلها؛ مسموح فقط مع DJANGO_DEMO_MODE=True.')
            call_command('flush', interactive=False, verbosity=0)
            for root in (settings.MEDIA_ROOT, settings.PRIVATE_MEDIA_ROOT):
                if not Path(root).exists():
                    continue
                for child in Path(root).glob('*'):
                    shutil.rmtree(child) if child.is_dir() else child.unlink()
        elif SparePart.objects.exists() or Invoice.objects.exists():
            raise CommandError('القاعدة فيها بيانات بالفعل. استخدم --reset (في وضع العرض فقط).')

        random.seed(2026)
        with transaction.atomic():
            self._seed()
        self.stdout.write(self.style.SUCCESS(
            f'بيانات العرض جاهزة: {SparePart.objects.count()} قطعة، {Invoice.objects.count()} فاتورة، '
            f'{Customer.objects.count()} عملاء. الدخول: '
            + '، '.join(f'{username}/{DEMO_PASSWORD}' for username, _, _ in DEMO_USERS)
        ))

    def _seed(self):
        users = {}
        for username, first_name, role in DEMO_USERS:
            users[role] = CustomUser.objects.create_user(
                username=username, password=DEMO_PASSWORD, role=role, first_name=first_name,
            )
        manager, cashier = users['manager'], users['employee']

        site = SiteSetting.load()
        site.site_name = 'اسبير'
        # رقم البائع الحقيقي (لا رقم وهمي قد يخص شخصاً آخر): من يتواصل مع المحل
        # التجريبي يصل إلى من يبيع النظام.
        site.business_phone = SALES_PHONE
        site.business_address = 'المنطقة الصناعية، الخرطوم بحري'
        site.receipt_footer = 'شكراً لتعاملكم معنا — القطع الكهربائية لا تُرجع بعد التركيب.'
        site.save()

        ContactMethod.objects.create(platform_name='واتساب', value='https://wa.me/249902929451',
                                     icon_name='MessageCircle')
        ContactMethod.objects.create(platform_name='اتصال هاتفي', value=SALES_PHONE, icon_name='Phone')

        call_command('seed_vehicles', stdout=io.StringIO())
        cars = {car.model_name: car for car in CarModel.objects.all()}
        bank = BankAccount.objects.create(name='بنكك - بنك الخرطوم', account_number='1234567')
        BankAccount.objects.create(name='فوري - بنك فيصل', account_number='7654321')

        suppliers = [
            Supplier.objects.create(company_name=name, contact_person=person, phone_number=phone, address=address)
            for name, person, phone, address in SUPPLIERS
        ]
        services.record_exchange_rate(currency='USD', rate=Decimal('2450'), user=manager)
        services.record_exchange_rate(currency='AED', rate=Decimal('667'), user=manager)

        categories, parts = {}, []
        for (category, name, number, oem, brand, grade, aliases, shelf,
             cost, price, quantity, models) in PARTS:
            if category not in categories:
                categories[category] = Category.objects.create(name=category)
            part = SparePart.objects.create(
                name=name, part_number=number, oem_number=oem, brand=brand, quality_grade=grade,
                aliases=aliases, shelf_location=shelf, category=categories[category],
                supplier=random.choice(suppliers), purchase_price=Decimal(cost),
                selling_price=Decimal(price), min_stock_alert=4, is_featured=price >= 30000,
                description=DESCRIPTIONS.get(number),
            )
            part.compatible_cars.set([cars[model] for model in models if model in cars])
            services.set_opening_balance(part, quantity, user=manager)
            parts.append(part)

        # توريد بالدولار يحدّث متوسط التكلفة والتكلفة الأجنبية لقطعتين.
        for part, qty, usd in ((parts[0], 24, Decimal('4')), (parts[9], 40, Decimal('4.2'))):
            services.create_supply_deal(
                supplier=suppliers[1], spare_part=part, quantity_added=qty,
                currency='USD', foreign_unit_cost=usd, exchange_rate=Decimal('2450'),
                invoice_reference=f'INV-{part.part_number}', user=manager,
            )

        customers = [
            Customer.objects.create(
                name=name, phone=phone, customer_type=kind, credit_limit=Decimal(limit), location=location,
            )
            for name, phone, kind, limit, location in CUSTOMERS
        ]

        self._sales_history(parts, customers, bank, cashier, manager)

        Expense.objects.create(date=timezone.localdate(), category='ترحيل', amount=Decimal('15000'),
                               method='cash', description='ترحيل بضاعة من السوق العربي', created_by=manager)
        Expense.objects.create(date=timezone.localdate() - timedelta(days=1), category='كهرباء',
                               amount=Decimal('40000'), method='cash', description='', created_by=manager)

        for name, phone, location, lines in (
            ('ياسر عبدالله', '0999000111', 'كسلا', [(parts[5], 1), (parts[9], 4)]),
            ('أحمد إبراهيم', '0999000222', 'مدني', [(parts[21], 2)]),
        ):
            order = PublicOrder.objects.create(
                customer_name=name, phone_number=phone, location=location,
                total_amount=sum(part.selling_price * qty for part, qty in lines),
            )
            for part, qty in lines:
                PublicOrderItem.objects.create(order=order, spare_part=part, quantity=qty,
                                               unit_price=part.selling_price, cost_price=part.purchase_price)

    def _sales_history(self, parts, customers, bank, cashier, manager):
        """فواتير الأسبوعين الماضيين: نقد وتحويل ومختلط وآجل لورش."""
        now = timezone.now()
        reference = 1000
        for days_ago in range(13, -1, -1):
            # اليوم الحالي أنشط حتى تظهر لوحة اليوم وإقفاله بأرقام.
            for _ in range(random.randint(4, 6) if days_ago == 0 else random.randint(2, 5)):
                # القطع القليلة (رديتر، دينمو) تبقى في المخزون ليجدها من يجرّب البيع.
                in_stock = list(SparePart.objects.filter(stock_quantity__gte=8))
                lines = random.sample(in_stock, random.randint(1, 3))
                items = [{'spare_part': part.pk, 'quantity': random.randint(1, 2)} for part in lines]
                customer = random.choice([None, None, *customers])
                kind = random.choice(['cash', 'cash', 'bank', 'mixed', 'credit'])
                if kind == 'credit' and (customer is None or customer.credit_limit == 0):
                    kind = 'cash'
                total = self._quote(items, customer)
                reference += 1
                transfer = {'method': 'bank', 'bank_account': bank, 'reference_id': f'BK{reference}',
                            'sender_account_number': f'9{reference}'}
                payments = {
                    'cash': [{'method': 'cash', 'amount': total}],
                    'bank': [{**transfer, 'amount': total}],
                    'mixed': [{'method': 'cash', 'amount': (total / 2).quantize(Decimal('1'))},
                              {**transfer, 'amount': total - (total / 2).quantize(Decimal('1'))}],
                    'credit': [],
                }[kind]
                try:
                    invoice = services.create_invoice(
                        cashier=random.choice([cashier, manager]), items=items,
                        customer=customer, payments=payments,
                    )
                except services.InventoryError:
                    continue
                if days_ago == 0:
                    # مبيعات اليوم تبقى في اليوم نفسه مهما كانت ساعة إعادة التعيين.
                    since_midnight = int((now - timezone.localtime(now).replace(
                        hour=0, minute=0, second=0, microsecond=0)).total_seconds() // 60)
                    moment = now - timedelta(minutes=random.randint(0, max(since_midnight - 1, 0)))
                else:
                    moment = now - timedelta(days=days_ago, hours=random.randint(0, 8),
                                             minutes=random.randint(0, 59))
                Invoice.objects.filter(pk=invoice.pk).update(created_at=moment)
                Payment.objects.filter(invoice=invoice).update(created_at=moment)
                StockMovement.objects.filter(reference=f'Invoice #{invoice.pk}').update(created_at=moment)

        # تحصيل جزء من دين ورشة الأمين.
        workshop = customers[0]
        balance = services.customer_balance(workshop)
        if balance > 0:
            services.record_collection(customer=workshop, method='cash',
                                       amount=(balance / 2).quantize(Decimal('1')), user=manager)
        # بعض التحويلات مطابقة وبعضها ينتظر، لتظهر شاشة المطابقة كما في العمل.
        transfers = list(Payment.objects.filter(kind=Payment.Kind.SALE, method=Payment.Method.BANK)
                         .values_list('pk', flat=True))
        Payment.objects.filter(pk__in=transfers[: len(transfers) * 2 // 3]).update(
            verified_at=now, verified_by=manager,
        )

    @staticmethod
    def _quote(items, customer):
        discount = services.customer_discount_percent(customer)
        total = Decimal('0')
        for item in items:
            price = SparePart.objects.get(pk=item['spare_part']).selling_price
            total += services._discounted(price, discount) * item['quantity']
        return total
