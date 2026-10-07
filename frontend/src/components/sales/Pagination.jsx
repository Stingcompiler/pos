import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageInfo } from './salesUtils';

/**
 * أزرار التنقل بين صفحات قائمة مقسّمة من الخادم مع "عرض 21–40 من 95".
 * الاتجاه RTL: "السابق" يشير يميناً و"التالي" يساراً.
 */
export default function Pagination({ page, pageSize, count, onPageChange, disabled = false, noun = 'سجل' }) {
  const { totalPages, from, to } = pageInfo(page, pageSize, count);
  if (!count) return null;

  const buttonClass =
    'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 text-surface-300 bg-white/5 ' +
    'hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer';

  return (
    <nav aria-label="التنقل بين الصفحات" className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
      <p className="text-xs text-surface-400" aria-live="polite">
        عرض {from}–{to} من {count} {noun}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 select-none">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
            className={buttonClass}
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
            السابق
          </button>
          <span className="text-xs text-surface-400 font-semibold">
            صفحة {page} من {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= totalPages}
            className={buttonClass}
            aria-label="الصفحة التالية"
          >
            التالي
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
