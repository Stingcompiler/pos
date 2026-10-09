/**
 * تجهيز صورة إشعار التحويل قبل رفعها.
 *
 * الخادم يرفض صورة أطول ضلع فيها فوق 2048 بكسل أو حجمها فوق 5 ميغابايت
 * (backend/api/validators.py)، ولقطة شاشة الهاتف العادية (1170×2532 مثلاً)
 * تتجاوز الحد. نصغّرها في المتصفح بدل أن يفشل الرفع بعد إتمام البيع.
 */

export const MAX_PROOF_SIDE = 2048;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/** أبعاد تتسع داخل الحد مع الحفاظ على النسبة. */
export function fitWithin(width, height, maxSide = MAX_PROOF_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * الصورة كما هي إن كانت ضمن الحدود، وإلا نسخة JPEG مصغّرة. عند أي تعذّر
 * (متصفح قديم، صورة تالفة) تُعاد الأصلية ويتولى الخادم الرد برسالة واضحة.
 */
export async function prepareProofImage(file) {
  if (typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (width === bitmap.width && height === bitmap.height && file.size <= MAX_PROOF_BYTES) {
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    // خلفية بيضاء: الأجزاء الشفافة في PNG تصبح سوداء في JPEG.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) return file;
    const baseName = (file.name || 'proof').replace(/\.[^.]+$/, '') || 'proof';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
