/**
 * أرقام واتساب: صيغة دولية بلا + (wa.me/<رقم>). الأرقام السودانية المحلية
 * (0999000222) تُحوَّل إلى 249999000222؛ أرقام الدول الأخرى تبقى كما هي.
 */
const SUDAN_CODE = '249';
const SUDAN_NATIONAL_LENGTH = 9;

/** رقم دولي بلا + أو null إن كان المدخل غير صالح. */
export function toWhatsAppNumber(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const digits = text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
  if (!digits) return null;

  const hasInternationalMark = text.startsWith('+') || digits.startsWith('00');
  let international;
  if (digits.startsWith('00')) international = digits.slice(2);
  else if (hasInternationalMark) international = digits;
  else if (digits.startsWith(SUDAN_CODE) && digits.length === SUDAN_CODE.length + SUDAN_NATIONAL_LENGTH) international = digits;
  else if (digits.startsWith('0') && digits.length === SUDAN_NATIONAL_LENGTH + 1) international = SUDAN_CODE + digits.slice(1);
  else if (digits.length === SUDAN_NATIONAL_LENGTH && /^[19]/.test(digits)) international = SUDAN_CODE + digits;
  else international = digits;

  if (international.startsWith(SUDAN_CODE) && international.length !== SUDAN_CODE.length + SUDAN_NATIONAL_LENGTH) return null;
  if (international.length < 8 || international.length > 15) return null;
  return international;
}

/** رابط wa.me أو null؛ `text` اختياري. */
export function whatsAppLink(raw, text) {
  const number = toWhatsAppNumber(raw);
  if (!number) return null;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
