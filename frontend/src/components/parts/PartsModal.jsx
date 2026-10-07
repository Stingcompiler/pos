import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * إطار نافذة حوار لصفحة قطع الغيار.
 *
 * يُرسم في body عبر portal: النافذة المتداخلة (تسوية الرصيد فوق نموذج
 * التعديل) كانت ستُحصر داخل النافذة الأم لأن backdrop-blur والتحريك
 * يجعلان الأب مرجعاً لـ position: fixed.
 * Escape يغلق النافذة العليا فقط، والتركيز يعود لزر الفتح بعد الإغلاق.
 */
export default function PartsModal({
  title,
  onClose,
  children,
  maxWidth = 'max-w-xl',
  layer = 'z-50',
  busy = false,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  // أثناء عملية جارية (رفع ملف، حفظ) لا نغلق حتى لا يضيع الرد.
  const requestClose = () => {
    if (!busy) onClose();
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${layer} flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in`}
      onClick={(e) => {
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        dir="rtl"
        className={`w-full ${maxWidth} mx-4 glass-card p-6 animate-scale-in max-h-[90vh] overflow-y-auto outline-none select-text`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            requestClose();
          }
        }}
      >
        <div className="flex items-center justify-between mb-5 gap-3">
          <h2 id={titleId} className="text-lg font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="إغلاق"
            title="إغلاق"
            className="p-2 rounded-lg text-surface-400 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
