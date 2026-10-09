/**
 * منطق نموذج قطعة الغيار بلا واجهة: تعبئة النموذج من تفاصيل الخادم، بناء
 * جسم الإرسال، والسعر المقترح بسعر الصرف. مفصول هنا ليُختبر وحده.
 */

import { DATE_LOCALE } from '../../utils/dates';

export const PAGE_SIZE = 50;

/** القطع المسعّرة بعملة أجنبية يُعدّ سعرها قديماً بعد هذه المدة بلا مراجعة. */
export const STALE_PRICE_DAYS = 30;

export const QUALITY_GRADES = [
  { value: 'original', label: 'أصلي' },
  { value: 'commercial', label: 'تجاري' },
  { value: 'used', label: 'مستعمل' },
];

// لون شارة الجودة: الموظف يفرّق بين الأصلي والتجاري بنظرة قبل البيع.
export const QUALITY_BADGE_CLASSES = {
  original: 'bg-success-500/15 text-success-400 border-success-500/30',
  commercial: 'bg-primary-600/15 text-primary-300 border-primary-500/30',
  used: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
};

export const EMPTY_FORM = {
  name: '',
  part_number: '',
  category: '',
  supplier: '',
  compatible_cars: [],
  brand: '',
  oem_number: '',
  quality_grade: '',
  aliases: '',
  barcode: '',
  purchase_price: '',
  selling_price: '',
  cost_currency: '',
  foreign_cost: '',
  markup_percent: '',
  opening_quantity: '0',
  min_stock_alert: '5',
  shelf_location: '',
  is_featured: false,
  description: '',
};

const asText = (value) => (value === null || value === undefined ? '' : String(value));

/** رقم من قيمة الخادم أو حقل الإدخال؛ null للفارغ أو غير الصالح. */
export function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * تعبئة النموذج من GET spare-parts/{id}/ (لا من صف القائمة): الحفظ دون تغيير
 * يجب أن يعيد القيم نفسها بما فيها الفئة والسيارات المتوافقة.
 */
export function formFromPart(part) {
  return {
    ...EMPTY_FORM,
    name: asText(part.name),
    part_number: asText(part.part_number),
    category: asText(part.category),
    supplier: asText(part.supplier),
    compatible_cars: (part.compatible_cars || []).map(Number),
    brand: asText(part.brand),
    oem_number: asText(part.oem_number),
    quality_grade: asText(part.quality_grade),
    aliases: asText(part.aliases),
    barcode: asText(part.barcode),
    purchase_price: asText(part.purchase_price),
    selling_price: asText(part.selling_price),
    cost_currency: asText(part.cost_currency),
    foreign_cost: asText(part.foreign_cost),
    markup_percent: asText(part.markup_percent),
    min_stock_alert: asText(part.min_stock_alert ?? 5),
    shelf_location: asText(part.shelf_location),
    is_featured: Boolean(part.is_featured),
    description: asText(part.description),
  };
}

/** أخطاء يمكن كشفها قبل الإرسال (رسالة عربية) أو '' إن كان النموذج سليماً. */
export function validatePartForm(form, { isEdit }) {
  if (!form.category) return 'اختر فئة القطعة.';
  if (form.cost_currency && toNumberOrNull(form.foreign_cost) === null) {
    return 'أدخل تكلفة الشراء بالعملة المختارة.';
  }
  if (!isEdit) {
    const opening = form.opening_quantity === '' ? 0 : Number(form.opening_quantity);
    if (!Number.isInteger(opening) || opening < 0) {
      return 'الرصيد الافتتاحي يجب أن يكون عدداً صحيحاً لا يقل عن صفر.';
    }
  }
  return '';
}

/**
 * جسم الإرسال (multipart لأن الصورة اختيارية).
 *
 * - لا نرسل stock_quantity أبداً: الرصيد يتغيّر بحركات موثّقة فقط.
 * - الرصيد الافتتاحي وسعر الشراء عند الإنشاء فقط؛ الخادم يتجاهلهما عند
 *   التعديل، وإرسالهما يوحي بأن التعديل نجح.
 * - الحقول الفارغة تُرسل '' ليمسحها الخادم (المورد، الهامش، التكلفة الأجنبية).
 */
export function buildPartFormData(form, { isEdit, image = null }) {
  const data = new FormData();
  const text = (key) => data.append(key, asText(form[key]).trim());

  ['name', 'part_number', 'category', 'supplier', 'brand', 'oem_number', 'quality_grade',
    'barcode', 'selling_price', 'cost_currency', 'foreign_cost', 'markup_percent',
    'min_stock_alert', 'shelf_location'].forEach(text);
  // النصوص الطويلة: نحافظ على الأسطر الداخلية (كل اسم دارج في سطر).
  data.append('aliases', asText(form.aliases).trim());
  data.append('description', asText(form.description));
  data.append('is_featured', form.is_featured ? 'true' : 'false');
  (form.compatible_cars || []).forEach((carId) => data.append('compatible_cars', String(carId)));

  if (!isEdit) {
    text('purchase_price');
    data.append('opening_quantity', String(form.opening_quantity === '' ? 0 : Number(form.opening_quantity)));
  }
  if (image) data.append('image', image);
  return data;
}

/**
 * الهامش الفعلي بترتيب الخادم: هامش القطعة ← هامش الفئة ← هامش المؤسسة.
 * null إن لم يُعرف أي منها (مثلاً تعذّر تحميل إعدادات المؤسسة).
 */
export function resolveMarkup({ partMarkup, categoryMarkup, defaultMarkup }) {
  const candidates = [
    ['part', partMarkup],
    ['category', categoryMarkup],
    ['default', defaultMarkup],
  ];
  for (const [source, value] of candidates) {
    const number = toNumberOrNull(value);
    if (number !== null) return { value: number, source };
  }
  return null;
}

export const MARKUP_SOURCE_LABELS = {
  part: 'هامش القطعة',
  category: 'هامش الفئة',
  default: 'هامش المؤسسة',
};

/**
 * السعر المقترح = التكلفة الأجنبية × سعر الصرف × (1 + الهامش٪)، مقرّباً لأعلى
 * إلى خطوة التقريب كما يفعل الخادم. للاطلاع فقط — لا يُرسل.
 *
 * إن جُهل الهامش نعيد التكلفة × سعر الصرف دون تقريب (withMarkup = false).
 */
export function suggestedPrice({ foreignCost, rate, markupPercent = null, rounding = null }) {
  const cost = toNumberOrNull(foreignCost);
  const exchange = toNumberOrNull(rate);
  if (cost === null || exchange === null || cost < 0 || exchange <= 0) return null;

  const markup = toNumberOrNull(markupPercent);
  const base = cost * exchange;
  if (markup === null) {
    return { value: Math.round(base * 100) / 100, withMarkup: false };
  }
  const raw = (base * (100 + markup)) / 100;
  const step = toNumberOrNull(rounding);
  if (step && step > 0) {
    // هامش صغير يمتصّ أخطاء الفاصلة العائمة (1200.0000001 لا تصعد إلى الخطوة التالية).
    return { value: Math.ceil(raw / step - 1e-9) * step, withMarkup: true };
  }
  return { value: Math.round(raw * 100) / 100, withMarkup: true };
}

/** عمر آخر تحديث للسعر بالأيام، أو null إن لم يُحدَّث قط. */
export function priceAgeDays(updatedAt, now) {
  if (!updatedAt) return null;
  const time = new Date(updatedAt).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((now - time) / 86400000);
}

/**
 * سعر قديم: قطعة مسعّرة بعملة أجنبية لم يُراجَع سعرها منذ أكثر من 30 يوماً.
 * cost_currency لا يصل للموظف، فلا تظهر الشارة له.
 */
export function isPriceStale(part, now, days = STALE_PRICE_DAYS) {
  if (!part?.cost_currency) return false;
  const age = priceAgeDays(part.price_updated_at, now);
  return age !== null && age > days;
}

/** الرمز المطبوع على الملصق: الباركود إن وُجد وإلا رقم القطعة. */
export function labelCode(part) {
  return asText(part.barcode).trim() || asText(part.part_number).trim();
}

/** اسم موديل السيارة للعرض (الخادم يرسل display_name، والاحتياط يُبنى محلياً). */
export function carModelLabel(car) {
  if (car.display_name) return car.display_name;
  return `${car.brand} ${car.model_name} (${car.year_start}-${car.year_end || 'حتى الآن'})`;
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
