/**
 * حسابات الصندوق والتحويلات — دوال نقية تُختبر بمعزل عن الشاشات.
 *
 * المبالغ تصل من الخادم سلاسلَ ("25.00"). نحسب بالقروش (أعداد صحيحة) حتى لا
 * يظهر فرق وهمي مثل 0.30000000000000004 بين النقد المعدود والمتوقع.
 */

// الأرقام الهندية (٠-٩) والفارسية (۰-۹): لوحة المفاتيح العربية تكتبها أحياناً.
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** تحويل الأرقام العربية/الفارسية إلى لاتينية مع إبقاء بقية النص. */
export function normalizeDigits(text) {
  return String(text ?? '').replace(EASTERN_DIGITS, (char) => {
    const code = char.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** أي قيمة مالية (سلسلة أو رقم) → قروش صحيحة؛ القيم الفارغة أو غير الرقمية = 0. */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/**
 * مبلغ كتبه المستخدم → سلسلة رقمية جاهزة للخادم ("1500.5")، أو null إن لم
 * يكن مبلغاً صالحاً غير سالب. يقبل الأرقام العربية والفاصلة العشرية «٫».
 */
export function parseMoneyInput(text) {
  const cleaned = normalizeDigits(text)
    .trim()
    .replace(/[\s,٬]/g, '')
    .replace('٫', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return String(Number(cleaned));
}

/** النقد المتوقع = بداية اليوم + الوارد نقداً − المردود نقداً − المصروف نقداً. */
export function expectedCash({ opening, cashIn, cashRefunds, cashExpenses }) {
  return (toCents(opening) + toCents(cashIn) - toCents(cashRefunds) - toCents(cashExpenses)) / 100;
}

/** الفرق = المعدود − المتوقع: موجب زيادة في الدرج، سالب عجز. */
export function cashDifference(counted, expected) {
  return (toCents(counted) - toCents(expected)) / 100;
}

/** وصف الفرق: مطابق / عجز / زيادة. */
export function differenceTone(difference) {
  const cents = toCents(difference);
  if (cents === 0) return 'balanced';
  return cents < 0 ? 'shortage' : 'overage';
}

export const DIFFERENCE_LABELS = {
  balanced: 'مطابق',
  shortage: 'عجز',
  overage: 'زيادة',
};

// ألوان الفرق: أخضر مطابق، أحمر عجز، كهرماني زيادة (الزيادة خطأ أيضاً يستحق المراجعة).
export const DIFFERENCE_TEXT = {
  balanced: 'text-success-400',
  shortage: 'text-danger-400',
  overage: 'text-warning-400',
};

export const DIFFERENCE_BOX = {
  balanced: 'bg-success-500/10 border-success-500/30',
  shortage: 'bg-danger-500/10 border-danger-500/30',
  overage: 'bg-warning-500/10 border-warning-500/30',
};

/** بنود المصروفات الشائعة (اقتراحات فقط؛ يمكن كتابة بند آخر). */
export const EXPENSE_CATEGORIES = ['إيجار', 'كهرباء', 'مياه', 'ترحيل', 'رواتب', 'وجبات', 'صيانة', 'أخرى'];

/**
 * إجماليات قائمة تحويلات بنكية:
 * - الوارد (بيع + تحصيل) والمطابق منه.
 * - المردود للعملاء تحويلاً (صادر من الحساب) منفصلاً حتى لا يُخصم من الوارد خفيةً.
 * - عدد غير المطابق من الكل (الصادر يُطابق بكشف الحساب أيضاً).
 */
export function transferTotals(payments = []) {
  let incoming = 0;
  let verified = 0;
  let refunds = 0;
  let unverifiedCount = 0;
  payments.forEach((payment) => {
    const cents = toCents(payment.amount);
    if (payment.kind === 'refund') {
      refunds += cents;
    } else {
      incoming += cents;
      if (payment.verified_at) verified += cents;
    }
    if (!payment.verified_at) unverifiedCount += 1;
  });
  return {
    count: payments.length,
    incoming: incoming / 100,
    verified: verified / 100,
    refunds: refunds / 100,
    unverifiedCount,
  };
}
