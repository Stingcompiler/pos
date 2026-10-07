/**
 * حساب المبالغ في نقطة البيع بالقروش (أعداد صحيحة) لا بالكسور العشرية.
 *
 * الخادم يحسب بـ Decimal؛ جمع الأسعار كأعداد عشرية في JavaScript يُنتج فروقاً
 * مثل 0.1 + 0.2، فيختلف ما تراه الكاشير عمّا يسجّله الخادم بقرش.
 */

/** مبلغ من الـ API ("25.00") أو رقم إلى قروش صحيحة؛ القيمة غير الصالحة صفر. */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/** قروش إلى رقم عادي (لـ formatCurrency). */
export function fromCents(cents) {
  return cents / 100;
}

/** قروش إلى نص عشري بخانتين كما يقبله DecimalField في الخادم ("1500.50"). */
export function centsToAmount(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * مبلغ يكتبه الكاشير إلى قروش.
 *
 * لوحة المفاتيح العربية تكتب الأرقام الهندية (١٢٣) والفاصلة العشرية (٫)؛
 * نقبلها بدل رفض المبلغ. الفاصلة العادية تُعامل كفاصل آلاف ("1,500").
 * يعيد null للحقل الفارغ، وNaN لمدخل غير صالح أو بأكثر من خانتين عشريتين
 * (الخادم يرفضه).
 */
export function parseAmountInput(text) {
  const normalized = String(text ?? '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/[,٬\s]/g, '');
  if (!normalized) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return NaN;
  const [whole, fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** نسبة مئوية ("12.50") إلى أجزاء من عشرة آلاف (1250)، محصورة بين 0 و100%. */
export function percentToBasisPoints(value) {
  const points = toCents(value);
  return Math.min(Math.max(points, 0), 10000);
}

/**
 * سعر الوحدة بعد خصم العميل، مطابقاً لـ services._discounted في الخادم:
 * السعر × (100 − الخصم) / 100 مقرّباً لقرشين بتقريب المصرفيين (ROUND_HALF_EVEN،
 * الافتراضي في Decimal). التقريب "العادي" يختلف عنه بقرش عند النصف تماماً.
 */
export function discountedUnitCents(priceCents, discountBasisPoints) {
  if (!discountBasisPoints) return priceCents;
  const numerator = priceCents * (10000 - discountBasisPoints);
  const remainder = numerator % 10000;
  let cents = (numerator - remainder) / 10000;
  if (remainder * 2 > 10000 || (remainder * 2 === 10000 && cents % 2 !== 0)) {
    cents += 1;
  }
  return cents;
}

/**
 * أسعار السلة كما سيحسبها الخادم: سعر كل بند بعد الخصم، والمجموع قبله وبعده.
 * `lines` مفهرسة بمعرّف القطعة.
 */
export function priceCart(cart, discountPercent) {
  const discount = percentToBasisPoints(discountPercent);
  const lines = {};
  let subtotalCents = 0;
  let totalCents = 0;
  cart.forEach((item) => {
    const originalUnitCents = toCents(item.selling_price);
    const unitCents = discountedUnitCents(originalUnitCents, discount);
    lines[item.id] = {
      originalUnitCents,
      unitCents,
      lineCents: unitCents * item.quantity,
    };
    subtotalCents += originalUnitCents * item.quantity;
    totalCents += unitCents * item.quantity;
  });
  return {
    lines,
    discountBasisPoints: discount,
    subtotalCents,
    totalCents,
    discountCents: subtotalCents - totalCents,
  };
}

/** نسبة الخصم للعرض (١٠ أو ٧٫٥) بأرقام الواجهة نفسها. */
export function formatPercent(value) {
  return new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}
