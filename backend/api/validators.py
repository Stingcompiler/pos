"""
مدقّقات مشتركة لحقول رفع الصور.

تُربط بحقول النموذج (`models.ImageField`) لا بالسيريالايزر وحده، لأن مسار
لوحة إدارة Django لا يمرّ بالسيريالايزر — فالتحقق على النموذج يحمي المسارين.
"""

from django.core.exceptions import ValidationError

# حدّ أقصى لحجم الصورة المرفوعة — يمنع إشباع القرص برفع واحد.
MAX_IMAGE_BYTES = 5 * 1024 * 1024
# حدّ أقصى لأطول ضلع بالبكسل — يمنع صورة 20000×20000 من استهلاك مئات
# الميجابايتات في الذاكرة عند فتحها أو توليد مصغّراتها.
MAX_IMAGE_SIDE = 2048
# الصيغ المقبولة فعلياً (بحسب ما يكتشفه Pillow لا بحسب الامتداد).
ALLOWED_IMAGE_FORMATS = frozenset({'JPEG', 'PNG', 'WEBP', 'GIF'})

ALLOWED_FORMATS_LABEL = '، '.join(sorted(ALLOWED_IMAGE_FORMATS))


def _rewind(value) -> None:
    """
    إعادة مؤشّر الملف إلى البداية.

    إلزامي بعد `Image.open`/`verify` — لو بقي المؤشّر عند النهاية لحُفظ
    ملف فارغ أو ناقص بصمت، وهو أسوأ من رفض الرفع صراحةً.
    """
    try:
        value.seek(0)
    except (AttributeError, ValueError):
        pass


def validate_image_upload(value):
    """
    التحقق من حجم الصورة وأبعادها وصيغتها الفعلية.

    يعتمد على Pillow لكشف الصيغة الحقيقية لأن امتداد الملف قابل للتزوير.
    """
    size = getattr(value, 'size', None)
    if size is not None and size > MAX_IMAGE_BYTES:
        raise ValidationError(
            'حجم الصورة يجب ألا يتجاوز '
            f'{MAX_IMAGE_BYTES // (1024 * 1024)} ميغابايت.'
        )

    # قيمة نصية (صورة قائمة لم تُرفع من جديد) — لا شيء لنتحقّق منه.
    if not hasattr(value, 'seek'):
        return

    from PIL import Image, UnidentifiedImageError

    try:
        _rewind(value)
        with Image.open(value) as image:
            # نقرأ النوع والأبعاد قبل verify() لأنها تُنهي صلاحية الكائن.
            image_format = (image.format or '').upper()
            width, height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValidationError('الملف المرفوع ليس صورة صالحة.')
    finally:
        _rewind(value)

    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise ValidationError(
            f'صيغة الصورة «{image_format or "غير معروفة"}» غير مدعومة. '
            f'المسموح: {ALLOWED_FORMATS_LABEL}.'
        )

    if max(width, height) > MAX_IMAGE_SIDE:
        raise ValidationError(
            f'أبعاد الصورة يجب ألا تتجاوز {MAX_IMAGE_SIDE} بكسل في أطول ضلع '
            f'(المرفوعة: {width}×{height}).'
        )
