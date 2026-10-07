import { History } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { DIFFERENCE_LABELS, DIFFERENCE_TEXT, differenceTone } from './cashMath';
import { formatShortDay } from './format';
import { EmptyState, ErrorState, LoadingState } from './PageStates';

/** آخر الإقفالات وفروقها؛ النقر على يوم يفتحه في الصفحة. */
export default function RecentCloses({ closes, status, error, onRetry, onSelect, selectedDate }) {
  return (
    <section className="glass-card overflow-hidden" aria-labelledby="recent-closes-title">
      <h2 id="recent-closes-title" className="p-4 border-b border-white/5 text-sm font-bold text-white flex items-center gap-2">
        <History className="w-4 h-4 text-primary-400" aria-hidden="true" />
        آخر الإقفالات
      </h2>
      {status === 'loading' ? (
        <LoadingState compact />
      ) : status === 'error' ? (
        <ErrorState compact message={error} onRetry={onRetry} />
      ) : closes.length === 0 ? (
        <EmptyState compact icon={History} title="لم يُقفل أي يوم بعد" />
      ) : (
        <ul className="divide-y divide-white/5">
          {closes.map((close) => {
            const tone = differenceTone(close.difference);
            const selected = close.date === selectedDate;
            return (
              <li key={close.id}>
                <button
                  type="button"
                  onClick={() => onSelect(close.date)}
                  aria-current={selected ? 'date' : undefined}
                  className={`w-full p-3 flex items-center justify-between gap-3 text-right transition cursor-pointer ${
                    selected ? 'bg-primary-600/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white tabular-nums">{formatShortDay(close.date)}</span>
                    <span className="block text-[11px] text-surface-500 truncate">
                      معدود {formatCurrency(close.counted_cash)} · {close.closed_by_name}
                    </span>
                  </span>
                  <span className={`text-xs font-bold tabular-nums shrink-0 ${DIFFERENCE_TEXT[tone]}`}>
                    {tone === 'balanced' ? DIFFERENCE_LABELS.balanced : `${DIFFERENCE_LABELS[tone]} ${formatCurrency(Math.abs(Number(close.difference)))}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
