/**
 * مفتاح إعادة المحاولة (Idempotency-Key) لعمليات البيع.
 *
 * يُولَّد مرة لكل عملية بيع ويُعاد إرساله مع أي محاولة لاحقة للعملية نفسها،
 * فإن نجح البيع في الخادم وانقطع الرد قبل وصوله، تُعيد المحاولة الفاتورة
 * الأصلية بدل فاتورة ثانية وخصم مخزون مكرر.
 *
 * `crypto.randomUUID` متاحة في السياقات الآمنة فقط (HTTPS أو localhost)، بينما
 * قد يعمل النظام داخل المحل عبر HTTP على الشبكة المحلية؛ لذلك نبني UUID v4
 * من `crypto.getRandomValues` المتاحة في كل السياقات.
 */
export function createIdempotencyKey() {
  const { crypto } = globalThis;
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // الإصدار 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // المتغيّر RFC 4122
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
