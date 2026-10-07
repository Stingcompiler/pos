/**
 * أدوات صرفة للتسعير وأسعار الصرف (بلا React ولا نداءات API).
 *
 * تستخدمها أقسام صفحة الإعدادات وصفحة المورد (نموذج التوريد بعملة أجنبية)،
 * لذلك هي في ملف مستقل قابل للاختبار. الخادم هو مصدر الأرقام النهائية؛ ما
 * يُحسب هنا للعرض والمعاينة فقط.
 */

export const BASE_CURRENCY = 'SDG';

/** أسماء العملات بالعربية؛ أي رمز غير معروف يُعرض كما هو. */
export const CURRENCY_NAMES = {
  SDG: 'جنيه سوداني',
  USD: 'دولار أمريكي',
  AED: 'درهم إماراتي',
  SAR: 'ريال سعودي',
  CNY: 'يوان صيني',
  EGP: 'جنيه مصري',
};

export function currencyName(code) {
  if (!code) return CURRENCY_NAMES[BASE_CURRENCY];
  return CURRENCY_NAMES[code] || code;
}

export function currencyLabel(code) {
  const value = code || BASE_CURRENCY;
  const name = CURRENCY_NAMES[value];
  return name ? `${name} (${value})` : value;
}

/**
 * رقم من مدخل نصي أو قيمة DRF ("25.00")، أو null إن كان فارغاً/غير رقمي.
 * null لا 0: الحقل الفارغ يختلف عن الصفر (سعر صرف فارغ = استخدم آخر سعر).
 */
export function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** خطوات التقريب المعروضة للمستخدم (0 = بلا تقريب). */
export const ROUNDING_STEPS = [0, 1, 5, 10, 50, 100];

export function roundingLabel(step) {
  const value = Number(step) || 0;
  return value ? `لأقرب ${value} جنيه` : 'بلا تقريب';
}

/**
 * خيارات التقريب مع القيمة الحالية إن كانت خارج القائمة (مثلاً 25 من لوحة
 * الإدارة)، حتى لا يمسحها الحفظ دون أن يلاحظ المستخدم.
 */
export function roundingOptions(current) {
  const steps = [...ROUNDING_STEPS];
  const value = Number(current);
  if (Number.isInteger(value) && value > 0 && !steps.includes(value)) {
    steps.push(value);
    steps.sort((a, b) => a - b);
  }
  return steps;
}

/**
 * التقريب لأعلى إلى أقرب مضاعف للخطوة، كما يفعل الخادم (ROUND_CEILING).
 * بلا خطوة: رقمان عشريان.
 */
export function roundUpPrice(value, step) {
  const amount = parseAmount(value);
  if (amount === null) return null;
  const size = Number(step) || 0;
  if (size > 0) {
    // toFixed يزيل ضجيج الفاصلة العائمة (1000/5 = 200.00000000000003 مثلاً).
    return Math.ceil(Number((amount / size).toFixed(9))) * size;
  }
  return Math.round(amount * 100) / 100;
}

/**
 * تكلفة الوحدة بالجنيه = التكلفة الأجنبية × سعر الصرف، مقرّبة لقرشين كما
 * يحفظها الخادم. null إن نقص أحدهما أو كان غير صالح.
 */
export function foreignToBase(foreignCost, rate) {
  const cost = parseAmount(foreignCost);
  const exchange = parseAmount(rate);
  if (cost === null || exchange === null || cost < 0 || exchange <= 0) return null;
  return Math.round(cost * exchange * 100) / 100;
}

/** الفرق بين السعر القديم والجديد واتجاهه، والنسبة المئوية إن أمكن. */
export function priceChange(oldPrice, newPrice) {
  const before = parseAmount(oldPrice) ?? 0;
  const after = parseAmount(newPrice) ?? 0;
  const diff = Math.round((after - before) * 100) / 100;
  let direction = 'same';
  if (diff > 0) direction = 'up';
  else if (diff < 0) direction = 'down';
  return {
    diff,
    percent: before > 0 ? (diff / before) * 100 : null,
    direction,
  };
}

/** سعر الصرف يُحفظ بأربع خانات عشرية؛ نعرض حتى أربع دون أصفار زائدة. */
export function formatRate(value, { locale = 'ar-SA' } = {}) {
  const amount = parseAmount(value);
  if (amount === null) return '—';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * بيانات طلب التوريد كما يتوقعها الخادم (POST supply-deals/):
 * - بالجنيه: purchase_price.
 * - بعملة أجنبية: currency + foreign_unit_cost، وexchange_rate فقط إن أُدخل
 *   (وإلا يأخذ الخادم آخر سعر مسجّل، ويرفض إن لم يوجد).
 * الأرقام تُرسل نصوصاً حتى لا تُفسدها الفاصلة العائمة.
 */
export function buildSupplyDealPayload({
  supplier,
  sparePart,
  quantity,
  currency,
  purchasePrice,
  foreignUnitCost,
  exchangeRate,
  invoiceReference,
}) {
  const payload = {
    supplier: Number(supplier),
    spare_part: Number(sparePart),
    quantity_added: parseInt(quantity, 10),
    invoice_reference: String(invoiceReference ?? '').trim() || null,
  };
  if (currency && currency !== BASE_CURRENCY) {
    payload.currency = currency;
    payload.foreign_unit_cost = String(foreignUnitCost ?? '').trim();
    const rate = String(exchangeRate ?? '').trim();
    if (rate) payload.exchange_rate = rate;
  } else {
    payload.purchase_price = String(purchasePrice ?? '').trim();
  }
  return payload;
}
