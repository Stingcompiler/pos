/**
 * تنسيق العملة — مصدر واحد لكل شاشات النظام.
 *
 * كان هذا التنسيق مكرّراً في سبع صفحات، وبنسخ غير متطابقة: إحداها تسمح
 * بثلاثة أرقام عشرية (لأنها ضبطت `minimumFractionDigits` وحدها، وعندها
 * يجعل Intl الحدّ الأقصى 3)، وأخرى تضيف لاحقة العملة وأخرى لا. النتيجة أسعار
 * تُعرض بعدد خانات مختلف حسب الصفحة.
 */

/** لاحقة العملة تُعرض للعميل في واجهات المتجر والطلبات، لا في الشاشات الداخلية. */
export const CURRENCY_SUFFIX = ' ج.س';

export const DEFAULT_LOCALE = 'ar-SA';

/**
 * تحويل أي مدخل إلى رقم صالح.
 *
 * DRF يُرجع الحقول العشرية كسلاسل نصّية ("25.50")، وقد تصل قيم فارغة أو
 * غير رقمية. نحوّلها إلى 0 بدل إظهار "NaN" في الواجهة.
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * تنسيق رقم بمال العملة: رقمين عشريين بالضبط دائماً.
 *
 * `maximumFractionDigits: 2` مُلزَم لا اختياري — إغفاله يُفعّل الحدّ
 * الافتراضي (3) فتظهر أسعار بثلاث خانات عشرية.
 */
export function formatCurrency(value, { locale = DEFAULT_LOCALE } = {}) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

/** تنسيق السعر مع لاحقة العملة — لواجهات المتجر والطلبات التي يراها العميل. */
export function formatPrice(value, { locale = DEFAULT_LOCALE } = {}) {
  return `${formatCurrency(value, { locale })}${CURRENCY_SUFFIX}`;
}
