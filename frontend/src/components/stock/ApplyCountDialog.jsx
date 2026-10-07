import { useEffect } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { InlineAlert } from '../cash/PageStates';

/**
 * تأكيد تطبيق الجرد: ملخص ما سيتغيّر قبل ضبط الأرصدة، لأن التطبيق لا يُلغى
 * بزر (يحتاج جرداً جديداً لتصحيحه).
 */
export default function ApplyCountDialog({ summary, title, busy, error, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-count-title"
        aria-describedby="apply-count-desc"
        className="w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl p-6 shadow-xl space-y-4"
      >
        <h3 id="apply-count-title" className="text-lg font-bold text-white flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary-400" aria-hidden="true" />
          تطبيق الجرد{title ? ` «${title}»` : ''}
        </h3>

        <div id="apply-count-desc" className="space-y-3 text-sm text-surface-300">
          <p>
            سيُضبط رصيد <strong className="text-white">{summary.parts}</strong> قطعة على العدد المعدود
            ({summary.countedUnits} وحدة):
          </p>
          <ul className="space-y-1.5">
            <li className="flex items-center justify-between p-2 rounded-lg bg-success-500/10 border border-success-500/20">
              <span>زيادة في {summary.increaseParts} قطعة</span>
              <strong className="text-success-400 tabular-nums" dir="ltr">+{summary.increaseUnits} وحدة</strong>
            </li>
            <li className="flex items-center justify-between p-2 rounded-lg bg-danger-500/10 border border-danger-500/20">
              <span>نقص في {summary.decreaseParts} قطعة</span>
              <strong className="text-danger-400 tabular-nums" dir="ltr">−{summary.decreaseUnits} وحدة</strong>
            </li>
            <li className="flex items-center justify-between p-2 rounded-lg bg-surface-800 border border-white/5">
              <span>بلا تغيير</span>
              <strong className="text-surface-200 tabular-nums">{summary.unchangedParts} قطعة</strong>
            </li>
          </ul>
          <p className="text-xs text-surface-400">
            الفروق تُحسب على الرصيد لحظة التطبيق (إن بيعت قطع أثناء الجرد تتغير الأرقام قليلاً)،
            وتُسجَّل حركة «جرد» لكل قطعة تغيّر رصيدها. القطع غير المعدودة لا تتغير.
          </p>
        </div>

        {error && <InlineAlert>{error}</InlineAlert>}

        <div className="flex gap-3 pt-2 border-t border-white/5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            رجوع
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className="px-5 py-2 rounded-xl gradient-primary text-white text-sm font-bold transition flex items-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ClipboardCheck className="w-4 h-4" aria-hidden="true" />}
            تطبيق وضبط الأرصدة
          </button>
        </div>
      </div>
    </div>
  );
}
