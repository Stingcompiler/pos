"""
قراءة معاملات الطلب (الاستعلام أو الجسم) بأنواعها.

القيمة غير الصالحة ترفع ValidationError (خطأ 400 باسم الحقل) بدل أن تصل إلى
الاستعلام فتصبح خطأ 500: معرّف غير رقمي، تاريخ بصيغة أخرى، مبلغ NaN.
"""

from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework.exceptions import ValidationError

# أكبر مبلغ تتسعه حقول المبالغ (12 خانة منها 2 عشرية).
MAX_AMOUNT = Decimal('9999999999.99')
# أكبر معرّف في عمود integer بـ PostgreSQL.
MAX_ID = 2_147_483_647
# حد معقول لكمية قطعة واحدة (رقم أكبر خطأ إدخال لا رصيد).
MAX_QUANTITY = 1_000_000


def parse_day(value, default=None, field='date'):
    """تاريخ بصيغة YYYY-MM-DD، أو default، أو اليوم المحلي."""
    if not value:
        return default or timezone.localdate()
    try:
        return date_cls.fromisoformat(str(value))
    except ValueError:
        raise ValidationError({field: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD.'})


def parse_amount(value, field) -> Decimal:
    """مبلغ رقمي محدود (لا NaN ولا لانهاية ولا أكبر مما يتسعه الحقل)."""
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise ValidationError({field: 'أدخل مبلغاً رقمياً صحيحاً.'})
    if not amount.is_finite() or abs(amount) > MAX_AMOUNT:
        raise ValidationError({field: 'أدخل مبلغاً رقمياً صحيحاً.'})
    return amount


def parse_id(value, field) -> int:
    """معرّف سجل (عدد صحيح موجب)."""
    text = str(value).strip()
    if not text.isdecimal() or not 0 < int(text) <= MAX_ID:
        raise ValidationError({field: 'معرّف غير صالح.'})
    return int(text)


def parse_id_list(value, field) -> list:
    """قائمة معرّفات (من JSON أو نص مفصول بفواصل)."""
    if isinstance(value, str):
        value = [item for item in value.split(',') if item.strip()]
    if not isinstance(value, (list, tuple)):
        raise ValidationError({field: 'أرسل قائمة معرّفات.'})
    return [parse_id(item, field) for item in value]


def parse_quantity(value, field) -> int:
    """كمية صحيحة بين 0 و MAX_QUANTITY."""
    try:
        quantity = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValidationError({field: 'أدخل عدداً صحيحاً.'})
    if not 0 <= quantity <= MAX_QUANTITY:
        raise ValidationError({field: f'الكمية بين 0 و{MAX_QUANTITY}.'})
    return quantity
