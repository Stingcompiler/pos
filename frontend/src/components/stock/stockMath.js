/**
 * حسابات الجرد — دوال نقية تُختبر بمعزل عن الشاشة.
 *
 * قبل التطبيق يُقارن المعدود برصيد النظام الحالي (current_quantity، يتغيّر مع
 * كل بيع)، وبعده بالرصيد المحفوظ لحظة التطبيق (system_quantity).
 */
import { normalizeDigits } from '../cash/cashMath';

/** رصيد النظام الذي يُقارن به السطر. */
export function baseQuantity(line, { applied = false } = {}) {
  const value = applied ? line.system_quantity : line.current_quantity;
  return value === null || value === undefined ? null : Number(value);
}

/** الفرق = المعدود − رصيد النظام (موجب زيادة، سالب نقص)، أو null إن لم يُعرف الرصيد. */
export function lineDifference(line, options) {
  const base = baseQuantity(line, options);
  if (base === null) return null;
  return Number(line.counted_quantity) - base;
}

/** ملخص الجرد لمربع التأكيد والبطاقات: عدد القطع ووحدات الزيادة والنقص. */
export function countSummary(lines = [], options) {
  const summary = {
    parts: lines.length,
    countedUnits: 0,
    increaseParts: 0,
    increaseUnits: 0,
    decreaseParts: 0,
    decreaseUnits: 0,
    unchangedParts: 0,
  };
  lines.forEach((line) => {
    summary.countedUnits += Number(line.counted_quantity) || 0;
    const difference = lineDifference(line, options);
    if (difference === null || difference === 0) {
      summary.unchangedParts += 1;
    } else if (difference > 0) {
      summary.increaseParts += 1;
      summary.increaseUnits += difference;
    } else {
      summary.decreaseParts += 1;
      summary.decreaseUnits += -difference;
    }
  });
  return summary;
}

// ترتيب طبيعي: الرف A2 قبل A10، والعربية مع اللاتينية.
const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

/**
 * ترتيب الأسطر حسب الرف ثم الاسم، كما يمشي العامل بين الرفوف؛ القطع بلا رف
 * في الآخر. لا يغيّر المصفوفة الأصلية.
 */
export function sortByShelf(lines = []) {
  return [...lines].sort((a, b) => {
    const shelfA = (a.shelf_location || '').trim();
    const shelfB = (b.shelf_location || '').trim();
    if (!shelfA !== !shelfB) return shelfA ? -1 : 1;
    return collator.compare(shelfA, shelfB) || collator.compare(a.spare_part_name || '', b.spare_part_name || '');
  });
}

/** كمية معدودة كتبها المستخدم → عدد صحيح غير سالب، أو null. يقبل الأرقام العربية. */
export function parseCountInput(text) {
  const cleaned = normalizeDigits(text).trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

/** رمز ممسوح (باركود أو رقم قطعة) جاهز للإرسال: أرقام لاتينية بلا فراغات طرفية. */
export function normalizeScanCode(text) {
  return normalizeDigits(text).trim();
}

/** إدراج سطر أو استبداله بنفس المعرّف (ردّ الخادم بعد المسح أو الضبط). */
export function upsertLine(lines = [], line) {
  const index = lines.findIndex((item) => item.id === line.id);
  if (index === -1) return [...lines, line];
  const next = [...lines];
  next[index] = line;
  return next;
}
