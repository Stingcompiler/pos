/**
 * أدوات المسح: تنبيه صوتي واهتزاز عند نجاح/فشل المسح، ودعم الكاميرا.
 *
 * الصوت مولَّد بـ Web Audio (بلا ملفات صوت خارجية) لأن العامل ينظر إلى الرف
 * لا إلى الشاشة؛ النغمة تخبره هل احتُسبت القطعة.
 */

export const BARCODE_FORMATS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'qr_code'];

let audioContext = null;

function getAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  // المتصفح يوقف الصوت حتى تفاعل المستخدم؛ المسح يأتي بعد ضغطة مفتاح أو نقرة.
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(context, { frequency, start, duration, type }) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** نغمة قصيرة حادة للنجاح، ونغمتان منخفضتان للفشل، مع اهتزاز على الجوال. */
export function playScanFeedback(ok) {
  try {
    navigator.vibrate?.(ok ? 40 : [90, 60, 90]);
  } catch {
    // الاهتزاز تحسين اختياري.
  }
  try {
    const context = getAudioContext();
    if (!context) return;
    const now = context.currentTime;
    if (ok) {
      tone(context, { frequency: 1320, start: now, duration: 0.09, type: 'sine' });
    } else {
      tone(context, { frequency: 220, start: now, duration: 0.14, type: 'square' });
      tone(context, { frequency: 180, start: now + 0.18, duration: 0.16, type: 'square' });
    }
  } catch {
    // الصوت تحسين اختياري؛ الوميض المرئي يكفي إن فشل.
  }
}

/** هل يدعم المتصفح قراءة الباركود من الكاميرا (BarcodeDetector + getUserMedia)؟ */
export function isCameraScanSupported() {
  return typeof window !== 'undefined'
    && 'BarcodeDetector' in window
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** رسالة عربية لخطأ فتح الكاميرا. */
export function cameraErrorMessage(error) {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'الكاميرا تتطلب فتح النظام عبر اتصال آمن (HTTPS).';
  }
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'لم يُسمح باستخدام الكاميرا. اسمح بالوصول من إعدادات المتصفح ثم أعد المحاولة.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'لم يُعثر على كاميرا في هذا الجهاز.';
    case 'NotReadableError':
      return 'الكاميرا مستخدمة في تطبيق آخر. أغلقه ثم أعد المحاولة.';
    default:
      return 'تعذّر تشغيل الكاميرا أو قارئ الباركود في هذا المتصفح.';
  }
}
