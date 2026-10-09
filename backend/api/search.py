"""
البحث الموحّد عن قطع الغيار بالعربية وأرقام القطع.

الموظف يكتب «اطار» والقطعة مسجّلة «إطار»، أو «04152 YZZA1» والرقم مسجّل
«04152-YZZA1». المطابقة الحرفية (icontains) تفشل في الحالتين. لذلك نخزّن لكل
قطعة نصاً موحّداً (search_text) يجمع اسمها وأسماءها الدارجة وأرقامها والعلامة
والفئة والسيارات المتوافقة، ونوحّد نص البحث بالقواعد نفسها قبل المقارنة.
"""

import re
import unicodedata

from django.db.models import Q

# التشكيل وعلامة المد والتطويل.
_DIACRITICS = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
_LETTER_MAP = str.maketrans({
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
    'ة': 'ه',
    'ى': 'ي', 'ئ': 'ي',
    'ؤ': 'و',
    # الأرقام العربية الهندية والفارسية إلى أرقام لاتينية.
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
})
_NON_WORD = re.compile(r'[^\w]+', re.UNICODE)


def normalize_text(value) -> str:
    """
    توحيد النص للبحث: حروف صغيرة، بلا تشكيل، وأشكال الحروف موحّدة.

    NFKC أولاً: يحوّل الحروف والأرقام عريضة العرض (من لوحات مفاتيح آسيوية أو
    نسخ من ملفات) وأشكال العرض العربية المتصلة إلى صيغها العادية.
    """
    if not value:
        return ''
    text = unicodedata.normalize('NFKC', str(value))
    text = _DIACRITICS.sub('', text).translate(_LETTER_MAP).lower()
    return ' '.join(_NON_WORD.sub(' ', text).split())


def compact(value) -> str:
    """الصيغة المضغوطة لرقم قطعة أو إشعار: بلا مسافات أو شرطات أو رموز أو _."""
    return normalize_text(value).replace(' ', '').replace('_', '')


def split_aliases(value) -> list:
    """الأسماء الأخرى تُكتب سطراً لكل اسم أو مفصولة بفواصل عربية/لاتينية."""
    return [alias.strip() for alias in re.split(r'[\n,،;؛]+', value or '') if alias.strip()]


def build_part_search_text(part) -> str:
    """بناء نص البحث الموحّد لقطعة (يُستدعى من SparePart.save وإشارة السيارات)."""
    pieces = [part.name, part.brand, part.shelf_location, part.get_quality_grade_display()]
    pieces += split_aliases(part.aliases)
    for code in (part.part_number, part.oem_number, part.barcode):
        if code:
            pieces += [code, compact(code)]
    if part.category_id:
        pieces.append(part.category.name)
    if part.pk:
        pieces += [
            f'{car.brand} {car.model_name}'
            for car in part.compatible_cars.all()
        ]
    return ' | '.join(normalize_text(piece) for piece in pieces if piece)


def search_parts(queryset, query: str):
    """
    تصفية القطع بكل كلمات البحث (AND) بعد توحيدها.

    وعند تعدد الكلمات تُقبل أيضاً صيغتها المضغوطة كقطعة واحدة: «04152 YZZA1»
    يطابق الرقم المسجّل «04152-YZZA1».
    """
    terms = normalize_text(query).split()
    if not terms:
        return queryset
    condition = Q()
    for term in terms:
        condition &= Q(search_text__contains=term)
    joined = compact(query)
    if len(terms) > 1 and joined:
        condition |= Q(search_text__contains=joined)
    return queryset.filter(condition)


def refresh_search_text(parts) -> None:
    """إعادة بناء نص البحث لقطع موجودة دون لمس updated_at (بعد تغيّر علاقاتها)."""
    for part in parts:
        text = build_part_search_text(part)
        if text != part.search_text:
            type(part).objects.filter(pk=part.pk).update(search_text=text)
