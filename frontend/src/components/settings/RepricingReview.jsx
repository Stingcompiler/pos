import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCheck, Info, ListChecks, Loader2, RefreshCw } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { formatRate, priceChange } from './pricingHelpers';
import { LoadingBlock, Notice, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, SectionCard } from './SettingsUi';

function ChangeCell({ oldPrice, newPrice }) {
  const { diff, percent, direction } = priceChange(oldPrice, newPrice);
  const up = direction === 'up';
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold font-mono ${
        up ? 'bg-warning-500/10 text-warning-400' : 'bg-primary-600/10 text-primary-300'
      }`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      <span className="sr-only">{up ? 'زيادة' : 'انخفاض'}</span>
      <span dir="ltr">{up ? '+' : '−'}{formatCurrency(Math.abs(diff))}</span>
      {percent !== null && <span className="opacity-75">({Math.abs(percent).toFixed(1)}%)</span>}
    </span>
  );
}

/**
 * مراجعة أسعار البيع بآخر أسعار الصرف: معاينة (GET pricing/) ثم تطبيق
 * (POST pricing/) على نفس القطع التي عُرضت، حتى لا يُطبَّق ما لم يره المستخدم.
 *
 * refreshKey يتغيّر عند تسجيل سعر صرف جديد فتُعاد المعاينة تلقائياً.
 */
export default function RepricingReview({ refreshKey = 0 }) {
  const [noDecrease, setNoDecrease] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const requestRef = useRef(0);

  const loadPreview = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('pricing/', { params: { allow_decrease: noDecrease ? 'false' : 'true' } });
      if (requestRef.current === requestId) setPreview(data);
    } catch (err) {
      if (requestRef.current === requestId) setError(apiErrorMessage(err, 'تعذّر تحميل معاينة الأسعار.'));
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [noDecrease]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview, refreshKey]);

  const changes = preview?.changes || [];
  const increases = changes.filter((change) => priceChange(change.old_price, change.new_price).direction === 'up').length;
  const decreases = changes.length - increases;

  const apply = async () => {
    if (!changes.length) return;
    const confirmed = window.confirm(
      `سيُحدَّث سعر بيع ${changes.length} قطعة كما في الجدول`
      + (noDecrease ? ' (دون خفض أي سعر)' : '')
      + '. يظهر السعر الجديد فوراً في نقطة البيع والمتجر. متابعة؟',
    );
    if (!confirmed) return;
    setApplying(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('pricing/', {
        allow_decrease: !noDecrease,
        // نطبّق على القطع المعروضة فقط: لو تغيّر شيء بعد المعاينة لا يُطبَّق دون مراجعة.
        part_ids: changes.map((change) => change.id),
      });
      setMessage(
        data.count
          ? `تم تحديث أسعار ${data.count} قطعة بنجاح.`
          : 'لم تتغيّر أي أسعار — ربما طُبّقت مسبقاً.',
      );
      await loadPreview();
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر تطبيق الأسعار الجديدة.'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <SectionCard
      icon={ListChecks}
      title="مراجعة الأسعار"
      description="معاينة أسعار البيع الجديدة بعد تغيّر سعر الصرف أو الهامش، ثم تطبيقها دفعة واحدة."
      actions={(
        <button
          type="button"
          onClick={loadPreview}
          disabled={loading}
          className={`${SECONDARY_BUTTON_CLASS} w-full sm:w-auto`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>تحديث المعاينة</span>
        </button>
      )}
    >
      <p className="flex items-start gap-2 text-xs text-surface-400 bg-surface-950/40 border border-white/5 rounded-xl p-3 leading-relaxed">
        <Info className="w-4 h-4 text-primary-400 flex-shrink-0 mt-px" aria-hidden="true" />
        <span>
          تُراجَع فقط القطع المسجّلة لها عملة شراء وتكلفة أجنبية (من التوريد بعملة أجنبية أو من ملف القطعة)؛ القطع المشتراة بالجنيه لا تتغيّر.
          السعر الجديد = التكلفة الأجنبية × آخر سعر صرف × (1 + الهامش)، مقرّباً لأعلى.
        </span>
      </p>

      <Notice type="success">{message}</Notice>
      <Notice>{error}</Notice>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            id="reprice-no-decrease"
            type="checkbox"
            checked={noDecrease}
            onChange={(event) => {
              setNoDecrease(event.target.checked);
              setMessage('');
            }}
            className="w-4 h-4 rounded border-white/10 accent-primary-500 cursor-pointer"
          />
          <label htmlFor="reprice-no-decrease" className="text-sm text-surface-300 cursor-pointer select-none">
            عدم خفض أي سعر (تطبيق الزيادات فقط)
          </label>
        </div>
        {preview && !loading && changes.length > 0 && (
          <p className="text-xs text-surface-400">
            {changes.length} قطعة: <span className="text-warning-400">{increases} زيادة</span>
            {decreases > 0 && <> · <span className="text-primary-300">{decreases} انخفاض</span></>}
          </p>
        )}
      </div>

      {loading && !preview ? (
        <LoadingBlock label="جاري حساب الأسعار الجديدة..." />
      ) : changes.length === 0 ? (
        !error && (
          <div className="py-10 text-center">
            <CheckCheck className="w-10 h-10 text-success-400 mx-auto mb-3" aria-hidden="true" />
            <p className="font-bold text-white">كل الأسعار مطابقة لآخر أسعار الصرف</p>
            <p className="text-xs text-surface-400 mt-1">لا توجد قطع يتغيّر سعرها حالياً.</p>
          </div>
        )
      ) : (
        <div className={`overflow-auto max-h-[480px] rounded-xl border border-white/5 ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-900 z-10">
              <tr className="border-b border-white/5 text-surface-400">
                <th scope="col" className="px-4 py-3 text-right font-medium">القطعة</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">الرقم</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">التكلفة</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">سعر الصرف</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">السعر الحالي ← الجديد</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">الفرق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {changes.map((change) => (
                <tr key={change.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-white font-medium">{change.name}</td>
                  <td className="px-4 py-2.5 text-surface-400 font-mono text-xs" dir="ltr">{change.part_number}</td>
                  <td className="px-4 py-2.5 text-left font-mono text-surface-300 whitespace-nowrap">
                    {formatRate(change.foreign_cost)} <span className="text-[10px] text-surface-500">{change.currency}</span>
                  </td>
                  <td className="px-4 py-2.5 text-left font-mono text-surface-300">{formatRate(change.rate)}</td>
                  <td className="px-4 py-2.5 text-left font-mono whitespace-nowrap">
                    <span className="text-surface-500 line-through">{formatCurrency(change.old_price)}</span>
                    <span className="text-surface-500 mx-1.5" aria-hidden="true">←</span>
                    <span className="text-white font-bold">{formatCurrency(change.new_price)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-left whitespace-nowrap">
                    <ChangeCell oldPrice={change.old_price} newPrice={change.new_price} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {changes.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={apply}
            disabled={applying || loading}
            className={`${PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}
          >
            {applying ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCheck className="w-4 h-4" aria-hidden="true" />
            )}
            <span>تطبيق التسعير الجديد ({changes.length})</span>
          </button>
        </div>
      )}
    </SectionCard>
  );
}
