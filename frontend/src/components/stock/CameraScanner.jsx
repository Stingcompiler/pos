import { useEffect, useRef, useState } from 'react';
import { CameraOff, Loader2, ScanLine, X } from 'lucide-react';
import { BARCODE_FORMATS, cameraErrorMessage } from './scanTools';

// نفس الرمز أمام الكاميرا يُقرأ عشرات المرات في الثانية؛ لا يُحتسب ثانيةً إلا
// بعد غيابه عن الإطار هذه المدة.
const DUPLICATE_WINDOW_MS = 1500;

/**
 * مسح الباركود بكاميرا الجوال الخلفية (BarcodeDetector). كل قراءة جديدة تساوي
 * مسحة واحدة (+1). الكاميرا تُغلق عند الإغلاق أو مغادرة الصفحة.
 */
export default function CameraScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [attempt, setAttempt] = useState(0);

  // نُبقي أحدث معالج دون إعادة تشغيل الكاميرا مع كل تصيير للصفحة.
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let frame = 0;
    let detecting = false;
    const lastSeen = new Map();

    const stop = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    async function start() {
      try {
        let formats = BARCODE_FORMATS;
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats?.();
          const usable = BARCODE_FORMATS.filter((format) => supported?.includes(format));
          if (usable.length) formats = usable;
        } catch {
          // نجرّب القائمة الكاملة إن تعذّر الاستعلام.
        }
        const detector = new window.BarcodeDetector({ formats });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        const video = videoRef.current;
        if (cancelled || !video) {
          stop();
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setStatus('scanning');

        const tick = async () => {
          if (cancelled) return;
          if (!detecting && video.readyState >= 2) {
            detecting = true;
            try {
              const codes = await detector.detect(video);
              const now = Date.now();
              codes.forEach((code) => {
                const value = (code.rawValue || '').trim();
                if (!value) return;
                const seen = lastSeen.get(value);
                lastSeen.set(value, now);
                if (seen && now - seen < DUPLICATE_WINDOW_MS) return;
                setLastCode(value);
                onDetectedRef.current?.(value);
              });
            } catch {
              // إطار لم يُقرأ؛ نكمل مع الإطار التالي.
            }
            detecting = false;
          }
          if (!cancelled) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (err) {
        stop();
        if (cancelled) return;
        setError(cameraErrorMessage(err));
        setStatus('error');
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt]);

  // Escape يغلق الكاميرا كما يتوقع مستخدم لوحة المفاتيح.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const retry = () => {
    setError('');
    setStatus('starting');
    setAttempt((value) => value + 1);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-950 overflow-hidden max-w-md" role="region" aria-label="المسح بالكاميرا">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-white/5">
        <span className="text-xs font-semibold text-surface-200 flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-primary-400" aria-hidden="true" />
          وجّه الكاميرا إلى الباركود
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الكاميرا"
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-surface-300 flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="relative aspect-[4/3] bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline aria-hidden="true" />
        {status === 'scanning' && (
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-primary-400/80 rounded-xl pointer-events-none" aria-hidden="true" />
        )}
        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-surface-300 text-xs" role="status">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
            جارٍ تشغيل الكاميرا…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center" role="alert">
            <CameraOff className="w-8 h-8 text-danger-400" aria-hidden="true" />
            <p className="text-xs text-danger-400 font-semibold">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-650 text-white text-xs font-semibold cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>

      <p className="p-3 text-[11px] text-surface-400" aria-live="polite">
        {lastCode ? <>آخر رمز مقروء: <span className="font-mono text-surface-200" dir="ltr">{lastCode}</span></> : 'كل قراءة = قطعة واحدة.'}
        {' '}لعدّ قطع متطابقة متجاورة أبعد الكاميرا لحظة بين كل قطعة، أو اضبط العدد من البحث.
      </p>
    </div>
  );
}
