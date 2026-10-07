import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Loader2, Plus, UserRound, X } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import QuickAddCustomerModal from './QuickAddCustomerModal';
import { formatPercent, toCents } from './money';
import { CUSTOMER_TYPE_BADGE, inputClass } from './ui';

function TypeBadge({ customer }) {
  if (!customer.customer_type_display) return null;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${CUSTOMER_TYPE_BADGE[customer.customer_type] || CUSTOMER_TYPE_BADGE.retail}`}>
      {customer.customer_type_display}
    </span>
  );
}

/**
 * اختيار عميل البيع بالبحث في الخادم (الاسم أو الهاتف).
 *
 * كانت الصفحة تحمّل الصفحة الأولى من العملاء فقط وتبحث فيها محلياً، فالعميل
 * رقم 51 لا يظهر أبداً. يُعاد كائن العميل كاملاً لأن الأسعار والآجل تعتمد على
 * خصمه وحدّه ورصيده.
 */
export default function CustomerPicker({ customer, onChange }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  // رقم آخر طلب: ردّ بحث أقدم يصل متأخراً لا يطغى على نتائج ما يكتبه الآن.
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const seq = ++requestSeqRef.current;
    const term = query.trim();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('customers/', {
          params: { search: term || undefined, page_size: 20 },
        });
        if (seq !== requestSeqRef.current) return;
        setResults(data.results || data);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setResults([]);
        setError(apiErrorMessage(err, 'تعذّر تحميل العملاء.'));
      } finally {
        if (seq === requestSeqRef.current) setLoading(false);
      }
    }, term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, open]);

  const select = (selected) => {
    onChange(selected);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    // التركيز يعود للبحث حتى يختار الكاشير غيره مباشرة.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closeQuickAdd = useCallback(() => setShowQuickAdd(false), []);
  const handleCreated = useCallback((created) => {
    setShowQuickAdd(false);
    onChange(created);
    setQuery('');
    setOpen(false);
  }, [onChange]);

  const discount = customer ? Number(customer.effective_discount_percent) || 0 : 0;
  const balanceCents = customer ? toCents(customer.balance) : 0;

  return (
    <div ref={containerRef} className="space-y-1.5">
      {customer ? (
        <p className="block text-xs font-semibold text-surface-400">العميل</p>
      ) : (
        <label htmlFor={`${ids}-search`} className="block text-xs font-semibold text-surface-400">العميل</label>
      )}

      {customer ? (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary-600/10 border border-primary-500/20">
          <UserRound className="w-4 h-4 text-primary-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">{customer.name}</span>
              <TypeBadge customer={customer} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-surface-400 mt-0.5">
              <span dir="ltr">{customer.phone}</span>
              {discount > 0 && <span className="text-success-400">خصم {formatPercent(discount)}%</span>}
              {balanceCents > 0 && <span className="text-warning-400">عليه {formatCurrency(customer.balance)}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label="إزالة العميل والبيع لعميل عام"
            className="p-1.5 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              id={`${ids}-search`}
              type="text"
              placeholder="عميل عام — ابحث بالاسم أو الهاتف..."
              value={query}
              autoComplete="off"
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
              }}
              className={inputClass}
            />
            {open && (
              <div
                className="absolute z-30 w-full mt-1 max-h-60 overflow-y-auto rounded-xl bg-surface-900 border border-white/10 shadow-xl divide-y divide-white/5 scrollbar-none"
              >
                {loading && (
                  <div className="p-2.5 text-xs text-surface-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    جاري البحث...
                  </div>
                )}
                {error && (
                  <div className="p-2.5 text-xs text-danger-400 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {error}
                  </div>
                )}
                {!loading && !error && results.length === 0 && (
                  <div className="p-2.5 text-xs text-surface-400">
                    لا يوجد عميل مطابق. أضفه بزر «+».
                  </div>
                )}
                {results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select(item)}
                    className="w-full text-right p-2.5 hover:bg-primary-600/20 focus:bg-primary-600/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white truncate">{item.name}</span>
                      <span className="text-xs text-surface-400" dir="ltr">{item.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px]">
                      <TypeBadge customer={item} />
                      {toCents(item.balance) > 0 && (
                        <span className="text-warning-400">عليه {formatCurrency(item.balance)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowQuickAdd(true);
            }}
            aria-label="إضافة عميل جديد"
            title="إضافة عميل جديد"
            className="w-10 h-10 shrink-0 rounded-xl bg-primary-600/20 border border-primary-500/30 text-primary-400 hover:bg-primary-600 hover:text-white transition-all flex items-center justify-center cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      )}

      {showQuickAdd && (
        <QuickAddCustomerModal initialText={query} onClose={closeQuickAdd} onCreated={handleCreated} />
      )}
    </div>
  );
}
