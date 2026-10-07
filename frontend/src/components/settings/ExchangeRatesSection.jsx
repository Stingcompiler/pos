import { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, History, Loader2, Plus } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { currencyLabel, currencyName, formatRate, parseAmount } from './pricingHelpers';
import {
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LoadingBlock,
  Notice,
  PRIMARY_BUTTON_CLASS,
  SectionCard,
} from './SettingsUi';

const HISTORY_SIZE = 10;

const dateTimeFormat = new Intl.DateTimeFormat('ar-SD', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTime(value) {
  return value ? dateTimeFormat.format(new Date(value)) : '—';
}

/**
 * أسعار الصرف: آخر سعر لكل عملة، تسجيل سعر جديد، وسجل قصير للعملة المختارة.
 * السعر = كم جنيهاً تساوي وحدة واحدة من العملة. لا يغيّر أسعار البيع بنفسه؛
 * المراجعة والتطبيق في قسم «مراجعة الأسعار» أسفله.
 */
export default function ExchangeRatesSection({ onRateRecorded }) {
  const [latest, setLatest] = useState({ base_currency: 'SDG', currencies: [], rates: {} });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [currency, setCurrency] = useState('');
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const historyRequest = useRef(0);

  // silent: تحديث بعد التسجيل دون إخفاء القسم خلف مؤشر التحميل.
  const loadLatest = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('exchange-rates/latest/');
      setLatest(data);
      // أول عملة مختارة افتراضياً حتى يكون النموذج جاهزاً.
      setCurrency((current) => current || data.currencies?.[0] || '');
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'تعذّر تحميل أسعار الصرف.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (code) => {
    if (!code) return;
    // تبديل العملة بسرعة قد يعيد ردوداً بترتيب مختلف؛ نعتمد آخر طلب فقط.
    const requestId = historyRequest.current + 1;
    historyRequest.current = requestId;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const { data } = await api.get('exchange-rates/', {
        params: { currency: code, page_size: HISTORY_SIZE },
      });
      if (historyRequest.current !== requestId) return;
      setHistory((Array.isArray(data) ? data : data.results || []).slice(0, HISTORY_SIZE));
    } catch (err) {
      if (historyRequest.current !== requestId) return;
      setHistoryError(apiErrorMessage(err, 'تعذّر تحميل سجل الأسعار.'));
    } finally {
      if (historyRequest.current === requestId) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    loadHistory(currency);
  }, [currency, loadHistory]);

  const currentRate = parseAmount(latest.rates?.[currency]);
  const enteredRate = parseAmount(rate);
  const changePercent = currentRate && enteredRate ? ((enteredRate - currentRate) / currentRate) * 100 : null;

  const submit = async (event) => {
    event.preventDefault();
    if (!enteredRate || enteredRate <= 0) {
      setFormError('أدخل سعر صرف أكبر من صفر.');
      return;
    }
    setSaving(true);
    setFormError('');
    setMessage('');
    try {
      await api.post('exchange-rates/', { currency, rate: rate.trim() });
      setRate('');
      setMessage(`تم تسجيل سعر ${currencyName(currency)}. راجع أسعار البيع أدناه قبل تطبيقها.`);
      await Promise.all([loadLatest({ silent: true }), loadHistory(currency)]);
      onRateRecorded?.();
    } catch (err) {
      setFormError(apiErrorMessage(err, 'تعذّر تسجيل سعر الصرف.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      icon={Coins}
      title="أسعار الصرف"
      description="سعر كل عملة شراء بالجنيه السوداني. يُستخدم لتحويل تكلفة التوريد الأجنبية ولحساب أسعار البيع الجديدة."
    >
      {loading ? (
        <LoadingBlock label="جاري تحميل أسعار الصرف..." />
      ) : loadError ? (
        <div className="space-y-3">
          <Notice>{loadError}</Notice>
          <button type="button" onClick={() => loadLatest()} className="text-sm text-primary-400 hover:text-primary-300 font-semibold">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          {/* آخر سعر لكل عملة؛ الضغط يختار العملة للنموذج والسجل */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {latest.currencies.map((code) => {
              const value = latest.rates?.[code];
              const selected = code === currency;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCurrency(code)}
                  aria-pressed={selected}
                  className={`text-right p-3.5 rounded-xl border transition-colors ${
                    selected
                      ? 'border-primary-500 bg-primary-600/10'
                      : 'border-white/10 bg-surface-950/40 hover:border-white/20'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs text-surface-400">{currencyName(code)}</span>
                    <span className="text-[10px] font-mono text-surface-500" dir="ltr">{code}</span>
                  </span>
                  {value ? (
                    <span className="block text-lg font-bold text-white mt-1 font-mono">{formatRate(value)}</span>
                  ) : (
                    <span className="block text-sm text-warning-400 mt-1.5">لم يُسجَّل بعد</span>
                  )}
                  <span className="block text-[10px] text-surface-500 mt-0.5">جنيه لكل 1 {code}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="space-y-3 border-t border-white/5 pt-5">
            <h3 className="text-sm font-bold text-white">تسجيل سعر جديد</h3>
            <Notice type="success">{message}</Notice>
            <Notice>{formError}</Notice>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label htmlFor="rate-currency" className={LABEL_CLASS}>العملة</label>
                <select
                  id="rate-currency"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className={`${INPUT_CLASS} cursor-pointer`}
                >
                  {latest.currencies.map((code) => (
                    <option key={code} value={code}>{currencyLabel(code)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rate-value" className={LABEL_CLASS}>السعر بالجنيه لكل 1 {currency}</label>
                <input
                  id="rate-value"
                  type="number"
                  required
                  min="0.0001"
                  step="0.0001"
                  dir="ltr"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder={currentRate ? String(currentRate) : 'مثال: 2100'}
                  aria-describedby="rate-value-hint"
                  className={`${INPUT_CLASS} text-left font-mono`}
                />
              </div>
              <button type="submit" disabled={saving || !currency} className={PRIMARY_BUTTON_CLASS}>
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="w-4 h-4" aria-hidden="true" />
                )}
                <span>تسجيل السعر</span>
              </button>
            </div>
            <p id="rate-value-hint" className={HINT_CLASS}>
              أدخل سعر السوق الذي تشتري به العملة فعلاً.
              {changePercent !== null && Math.abs(changePercent) >= 0.01 && (
                <span className={changePercent > 0 ? 'text-warning-400' : 'text-primary-300'}>
                  {' '}({changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}% عن السعر الحالي {formatRate(currentRate)})
                </span>
              )}
            </p>
          </form>

          {currency && (
            <div className="border-t border-white/5 pt-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-primary-400" aria-hidden="true" />
                آخر {HISTORY_SIZE} أسعار مسجّلة — {currencyName(currency)}
              </h3>
              {historyError ? (
                <Notice>{historyError}</Notice>
              ) : historyLoading && history.length === 0 ? (
                <LoadingBlock label="جاري تحميل السجل..." />
              ) : history.length === 0 ? (
                <p className="text-sm text-surface-400 py-4">لم يُسجَّل أي سعر لهذه العملة بعد.</p>
              ) : (
                <div className={`overflow-x-auto rounded-xl border border-white/5 ${historyLoading ? 'opacity-60' : ''}`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 bg-surface-900/30 text-surface-400">
                        <th scope="col" className="px-4 py-3 text-right font-medium">التاريخ</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium">السعر (جنيه)</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">سجّله</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {history.map((entry, index) => (
                        <tr key={entry.id} className={index === 0 ? 'bg-primary-600/5' : ''}>
                          <td className="px-4 py-2.5 text-surface-300">
                            {formatDateTime(entry.created_at)}
                            {index === 0 && <span className="text-[10px] text-primary-400 font-semibold mr-2">الحالي</span>}
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono text-white">{formatRate(entry.rate)}</td>
                          <td className="px-4 py-2.5 text-surface-400">{entry.created_by_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
