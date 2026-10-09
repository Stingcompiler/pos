"""
إعادة حساب نص البحث ومفاتيح أرقام الإشعارات بالتوحيد الحالي.

قواعد قديمة رُحّلت (0018) قبل اكتمال التوحيد (NFKC، حذف _) فبقي فيها نص بحث
ومفاتيح بالصيغة السابقة: بحث لا يجد قطعة، أو إشعار مكرر لا يُكتشف. الترحيل
آمن للتكرار: إعادته لا تغيّر شيئاً.

المفاتيح تُفرَّغ أولاً ثم تُعاد بالترتيب، فإشعاران صارا متطابقين بالتوحيد
الجديد يحتفظ أقدمهما بالمفتاح والأحدث يبقى بلا مفتاح (كما في 0018) ولا
يكسر قيد الفرادة.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    from api.search import build_part_search_text, compact

    SparePart = apps.get_model('api', 'SparePart')
    Payment = apps.get_model('api', 'Payment')

    for part in SparePart.objects.select_related('category').iterator():
        text = build_part_search_text(part)
        if text != part.search_text:
            SparePart.objects.filter(pk=part.pk).update(search_text=text)

    transfers = Payment.objects.filter(method='bank').exclude(reference_id__isnull=True)
    current = dict(transfers.values_list('pk', 'reference_key'))
    wanted, used = {}, set()
    for pk, reference_id in transfers.order_by('pk').values_list('pk', 'reference_id'):
        key = compact(reference_id).upper() or None
        if key in used:
            key = None
        if key:
            used.add(key)
        wanted[pk] = key
    changed = [pk for pk, key in wanted.items() if current.get(pk) != key]
    Payment.objects.filter(pk__in=changed).update(reference_key=None)
    for pk in changed:
        if wanted[pk]:
            Payment.objects.filter(pk=pk).update(reference_key=wanted[pk])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_site_name_aspir'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
