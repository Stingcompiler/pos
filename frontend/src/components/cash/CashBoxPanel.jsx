import { Loader2, Wallet } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { cashDifference, expectedCash, toCents } from './cashMath';

/**
 * حساب الدرج: بداية اليوم + الوارد نقداً − المردود − المصروف = المتوقع.
 *
 * نقد بداية اليوم قابل للتعديل قبل الإقفال (الافتراضي ما عُدّ في آخر إقفال)؛
 * بعد الإقفال يُعرض كما حُفظ في سجل الإقفال.
 */
export default function CashBoxPanel({
  summary, openingInput, onOpeningChange, openingInvalid, pending,
}) {
  const close = summary.close;
  const closed = Boolean(summary.closed && close);
  const opening = closed ? close.opening_cash : summary.opening_cash;

  // بعد الإقفال نحسب المتوقع من حركة اليوم الحالية بنقد بداية الإقفال: إن اختلف
  // عن لقطة الإقفال فقد سُجّلت حركة نقدية بعده وتستحق المراجعة.
  const liveExpected = expectedCash({
    opening,
    cashIn: summary.cash_in,
    cashRefunds: summary.cash_refunds,
    cashExpenses: summary.cash_expenses,
  });
  const expected = closed ? liveExpected : summary.expected_cash;
  const drift = closed ? cashDifference(liveExpected, close.expected_cash) : 0;

  const rows = [
    { sign: '+', label: 'نقد وارد (مبيعات وتحصيلات)', value: summary.cash_in, tone: 'text-success-400' },
    { sign: '−', label: 'ردّ نقدي للمرتجعات', value: summary.cash_refunds, tone: 'text-danger-400' },
    { sign: '−', label: 'مصروفات نقدية', value: summary.cash_expenses, tone: 'text-danger-400' },
  ];

  return (
    <section className="glass-card p-5 space-y-4" aria-labelledby="cash-box-title">
      <h2 id="cash-box-title" className="text-sm font-bold text-white flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary-400" aria-hidden="true" />
        الصندوق (الدرج)
      </h2>

      <div className="space-y-2 text-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-surface-900/50 border border-white/5">
          {closed ? (
            <span className="text-surface-300">نقد بداية اليوم</span>
          ) : (
            <label htmlFor="opening-cash" className="text-surface-300">
              نقد بداية اليوم
              <span className="block text-[11px] text-surface-500">
                الافتراضي: النقد المعدود في آخر إقفال سابق. عدّله إن تغيّر الدرج.
              </span>
            </label>
          )}
          {closed ? (
            <span className="font-bold text-white tabular-nums">{formatCurrency(opening)}</span>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <input
                id="opening-cash"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={openingInput}
                onChange={(event) => onOpeningChange(event.target.value)}
                aria-invalid={openingInvalid || undefined}
                aria-describedby={openingInvalid ? 'opening-cash-error' : undefined}
                className={`w-40 px-3 py-2 rounded-xl bg-surface-800 border text-white text-sm text-left tabular-nums h-10 ${
                  openingInvalid ? 'border-danger-500' : 'border-white/10 focus:border-primary-500'
                }`}
                dir="ltr"
                placeholder="0.00"
              />
              {openingInvalid && (
                <span id="opening-cash-error" className="text-[11px] text-danger-400">أدخل مبلغاً صحيحاً (0 أو أكثر).</span>
              )}
            </div>
          )}
        </div>

        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-surface-300 flex items-center gap-2">
              <span className={`w-5 text-center font-bold ${row.tone}`} aria-hidden="true">{row.sign}</span>
              {row.label}
            </span>
            <span className="font-semibold text-surface-100 tabular-nums">{formatCurrency(row.value)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-primary-600/10 border border-primary-500/25">
        <span className="text-sm font-semibold text-surface-200 flex items-center gap-2">
          <span className="w-5 text-center font-bold text-primary-400" aria-hidden="true">=</span>
          النقد المتوقع في الدرج
          {pending && (
            <span className="flex items-center gap-1 text-[11px] text-surface-400 font-normal" role="status">
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              جارٍ إعادة الحساب
            </span>
          )}
        </span>
        <span className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${pending ? 'text-surface-400' : 'text-primary-300'}`}>
          {formatCurrency(expected)}
          <span className="text-xs font-semibold text-surface-400 mr-1">{summary.currency}</span>
        </span>
      </div>

      {closed && toCents(drift) !== 0 && (
        <p className="text-xs text-warning-400 bg-warning-500/10 border border-warning-500/20 rounded-xl p-3" role="status">
          عند الإقفال كان المتوقع {formatCurrency(close.expected_cash)}، وتغيّر بعده بمقدار {formatCurrency(drift)}:
          سُجّلت حركة نقدية لهذا اليوم بعد إقفاله. راجعها، وأعد فتح اليوم وإقفاله إن لزم.
        </p>
      )}
    </section>
  );
}
