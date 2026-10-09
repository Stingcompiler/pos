"""
قائمة بداية لموديلات السيارات الشائعة في السوق السوداني.

    python manage.py seed_vehicles

تُضاف الموديلات غير الموجودة فقط (آمن لإعادة التشغيل). السنوات تقريبية
كنقطة بداية لربط القطع بالسيارات؛ راجعها وعدّلها من صفحة موديلات السيارات
بحسب الأجيال التي يتعامل معها المحل فعلاً.
"""

from django.core.management.base import BaseCommand

from api.models import CarModel

# (الشركة، الموديل، سنة البداية، سنة النهاية أو None)
VEHICLES = [
    ('Toyota', 'Hilux', 2005, None),
    ('Toyota', 'Land Cruiser 70', 1985, None),
    ('Toyota', 'Land Cruiser 200', 2008, 2021),
    ('Toyota', 'Land Cruiser Prado', 2003, None),
    ('Toyota', 'Corolla', 2002, None),
    ('Toyota', 'Camry', 2002, None),
    ('Toyota', 'Hiace', 2005, None),
    ('Toyota', 'Yaris', 2006, None),
    ('Hyundai', 'Accent', 2006, None),
    ('Hyundai', 'Elantra', 2007, None),
    ('Hyundai', 'Sonata', 2005, None),
    ('Hyundai', 'Tucson', 2005, None),
    ('Hyundai', 'H100', 1996, None),
    ('Hyundai', 'H1', 2008, None),
    ('Kia', 'Picanto', 2004, None),
    ('Kia', 'Rio', 2005, None),
    ('Kia', 'Cerato', 2004, None),
    ('Kia', 'Sportage', 2005, None),
    ('Nissan', 'Sunny', 2004, None),
    ('Nissan', 'Patrol', 1997, None),
    ('Nissan', 'Navara', 2005, None),
    ('Mitsubishi', 'L200', 2006, None),
    ('Mitsubishi', 'Pajero', 2000, None),
    ('Isuzu', 'D-Max', 2002, None),
    ('Isuzu', 'NPR', 1995, None),
    ('Suzuki', 'Swift', 2005, None),
    ('Chevrolet', 'Optra', 2003, None),
    ('Bajaj', 'RE (ركشة)', 2000, None),
]


class Command(BaseCommand):
    help = 'إضافة موديلات السيارات الشائعة في السوق السوداني (نقطة بداية قابلة للتعديل).'

    def handle(self, *args, **options):
        created = 0
        for brand, model_name, year_start, year_end in VEHICLES:
            if CarModel.objects.filter(brand__iexact=brand, model_name__iexact=model_name).exists():
                continue
            CarModel.objects.create(
                brand=brand, model_name=model_name, year_start=year_start, year_end=year_end,
            )
            created += 1
        self.stdout.write(self.style.SUCCESS(
            f'أُضيف {created} موديلاً (الموجود مسبقاً لم يتغيّر). راجع السنوات من صفحة الموديلات.'
        ))
