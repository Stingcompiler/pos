import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * إطار نافذة حوار موحّد: عنوان مربوط بـ aria-labelledby، زر إغلاق بوصف،
 * وإغلاق بزر Escape (إلا أثناء الإرسال حتى لا تضيع نتيجة العملية).
 */
export default function ModalShell({ title, icon: Icon, onClose, busy = false, maxWidth = 'max-w-lg', children }) {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    // نقل التركيز إلى النافذة حتى يبدأ مستخدم لوحة المفاتيح منها.
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto bg-surface-900 border border-white/10 rounded-2xl p-6 shadow-xl space-y-4 outline-none`}
      >
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 id={titleId} className="text-lg font-bold text-white flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-primary-400" aria-hidden="true" />}
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-40 transition cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
