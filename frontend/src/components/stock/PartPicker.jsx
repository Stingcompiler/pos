import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, PackageSearch, Search, X } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { parseCountInput } from './stockMath';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * إضافة قطعة بالبحث وكتابة عددها مباشرة (mode=set) — للقطع بلا باركود أو
 * لعدّ كمية كبيرة دفعةً واحدة بدل مسح كل حبة.
 */
export default function PartPicker({ countedByPart, onSet, disabled }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);
  const seq = useRef(0);
  const quantityRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const runSearch = async (term) => {
    seq.current += 1;
    const current = seq.current;
    try {
      const { data } = await api.get('spare-parts/', { params: { search: term, page_size: 8 } });
      if (current !== seq.current) return;
      setResults(data.results || data);
      setStatus('ready');
    } catch (err) {
      if (current !== seq.current) return;
      setError(apiErrorMessage(err, 'تعذّر البحث عن القطع.'));
      setStatus('error');
    }
  };

  const handleQuery = (value) => {
    setQuery(value);
    window.clearTimeout(timer.current);
    const term = value.trim();
    if (!term) {
      seq.current += 1;
      setResults([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    timer.current = window.setTimeout(() => runSearch(term), SEARCH_DEBOUNCE_MS);
  };

  const pick = (part) => {
    setSelected(part);
    const existing = countedByPart.get(part.id);
    setQuantity(existing === undefined ? '' : String(existing));
    setError('');
    // ننقل التركيز لحقل العدد مباشرة بعد ظهوره.
    window.setTimeout(() => quantityRef.current?.focus(), 0);
  };

  const clearSelection = () => {
    setSelected(null);
    setQuantity('');
  };

  const save = async (event) => {
    event.preventDefault();
    const value = parseCountInput(quantity);
    if (value === null) {
      setError('أدخل عدداً صحيحاً (0 أو أكثر).');
      return;
    }
    setSaving(true);
    setError('');
    const ok = await onSet(selected, value);
    setSaving(false);
    if (ok) {
      clearSelection();
      setQuery('');
      setResults([]);
      setStatus('idle');
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="count-part-search" className="block text-xs font-semibold text-surface-300 mb-1">
          إضافة بالبحث وكتابة العدد
        </label>
        <div className="relative">
          <input
            id="count-part-search"
            type="search"
            value={query}
            onChange={(event) => handleQuery(event.target.value)}
            disabled={disabled}
            autoComplete="off"
            placeholder="اسم القطعة، رقمها، أو السيارة…"
            className="w-full px-3 py-2 pr-9 rounded-xl bg-surface-900 border border-white/10 text-white text-sm h-10 focus:border-primary-500 placeholder-surface-500 disabled:opacity-50"
          />
          <Search className="absolute right-3 top-3 w-4 h-4 text-surface-400" aria-hidden="true" />
        </div>
      </div>

      {selected ? (
        <form onSubmit={save} className="p-3 rounded-xl bg-primary-600/10 border border-primary-500/25 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{selected.name}</p>
              <p className="text-[11px] text-surface-400">
                <span className="font-mono" dir="ltr">{selected.part_number}</span>
                {selected.shelf_location ? ` · الرف ${selected.shelf_location}` : ''}
                {` · رصيد النظام ${selected.stock_quantity}`}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              aria-label="إلغاء اختيار القطعة"
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-surface-300 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="count-part-quantity" className="block text-[11px] font-semibold text-surface-300 mb-1">
                العدد الفعلي على الرف
              </label>
              <input
                id="count-part-quantity"
                ref={quantityRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm h-10 text-left tabular-nums focus:border-primary-500"
                placeholder="0"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 h-10 rounded-xl gradient-primary text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
              حفظ العدد
            </button>
          </div>
          {error && <p className="text-xs text-danger-400" role="alert">{error}</p>}
        </form>
      ) : (
        query.trim() !== '' && (
          <div className="rounded-xl border border-white/5 bg-surface-900/50 max-h-72 overflow-y-auto" aria-live="polite">
            {status === 'loading' ? (
              <p className="p-3 text-xs text-surface-400 flex items-center gap-2" role="status">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> جارٍ البحث…
              </p>
            ) : status === 'error' ? (
              <div className="p-3 text-xs text-danger-400 flex items-center justify-between gap-2" role="alert">
                {error}
                <button type="button" onClick={() => runSearch(query.trim())} className="underline cursor-pointer">إعادة المحاولة</button>
              </div>
            ) : results.length === 0 ? (
              <p className="p-3 text-xs text-surface-500 flex items-center gap-2">
                <PackageSearch className="w-4 h-4" aria-hidden="true" /> لا توجد قطع مطابقة.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {results.map((part) => {
                  const counted = countedByPart.get(part.id);
                  return (
                    <li key={part.id}>
                      <button
                        type="button"
                        onClick={() => pick(part)}
                        className="w-full p-3 text-right hover:bg-white/[0.04] flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-white font-semibold truncate">{part.name}</span>
                          <span className="block text-[11px] text-surface-400">
                            <span className="font-mono" dir="ltr">{part.part_number}</span>
                            {part.shelf_location ? ` · الرف ${part.shelf_location}` : ''}
                          </span>
                        </span>
                        <span className="text-[11px] text-surface-400 shrink-0 text-left">
                          النظام {part.stock_quantity}
                          {counted !== undefined && <span className="block text-primary-300">معدود {counted}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
      )}
    </div>
  );
}
