import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Lock, LockOpen } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import {
  DIFFERENCE_BOX, DIFFERENCE_LABELS, DIFFERENCE_TEXT, cashDifference, differenceTone, parseMoneyInput,
} from './cashMath';
import { formatDateTime, formatDay } from './format';
import { InlineAlert } from './PageStates';

/** سطر «عنوان: قيمة» في سجل الإقفال. */
function RecordRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-surface-400 text-xs">{label}</dt>
      <dd className="text-white text-sm font-semibold tabular-nums text-left">{children}</dd>
    </div>
  );
}

/**
 * إقفال اليوم: عدّ النقد الفعلي ومقارنته بالمتوقع لحظياً، ثم حفظ لقطة الإقفال.
 * بعد الإقفال يُعرض السجل، وللمدير وحده إعادة فتح اليوم (حذف الإقفال).
 *
 * يُركَّب بمفتاح التاريخ في الصفحة، فيبدأ كل يوم بحقول فارغة.
 */
export default function CloseDayPanel({ date, summary, pending, openingInvalid, isManager, onChanged }) {
  const [countedInput, setCountedInput] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = summary.closed ? summary.close : null;
  const unverified = (summary.banks || []).reduce((sum, row) => sum + (row.unverified || 0), 0);

  const counted = parseMoneyInput(countedInput);
  const difference = counted === null ? null : cashDifference(counted, summary.expected_cash);
  const tone = difference === null ? null : differenceTone(difference);

  const handleClose = async (event) => {
    event.preventDefault();
    setError('');
    if (counted === null) {
      setError('أدخل النقد المعدود فعلياً في الدرج.');
      return;
    }
    const verdict = tone === 'balanced'
      ? 'الصندوق مطابق.'
      : `${DIFFERENCE_LABELS[tone]} بمقدار ${formatCurrency(Math.abs(difference))}.`;
    const ok = window.confirm(
      `إقفال يومية ${formatDay(date)}؟\nالنقد المعدود ${formatCurrency(counted)} — ${verdict}\n`
      + 'بعد الإقفال لا تُضاف مصروفات لهذا اليوم'
      + (isManager ? '.' : '، وإعادة فتحه من صلاحية المدير وحده.'),
    );
    if (!ok) return;

    setBusy(true);
    try {
      await api.post('daily-closes/', {
        date,
        counted_cash: counted,
        // نرسل نقد البداية الذي حُسب به المتوقع المعروض، فتطابق اللقطة ما رآه المستخدم.
        opening_cash: summary.opening_cash,
        notes: notes.trim(),
      });
      await onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر إقفال اليوم.'));
    }
    setBusy(false);
  };

  const handleReopen = async () => {
    const ok = window.confirm(
      `إعادة فتح يومية ${formatDay(date)}؟ سيُحذف سجل الإقفال (المعدود ${formatCurrency(close.counted_cash)})، `
      + 'ويمكن بعدها تعديل المصروفات وإقفال اليوم من جديد.',
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`daily-closes/${close.id}/`);
      await onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر إعادة فتح اليوم.'));
    }
    setBusy(false);
  };

  if (close) {
    const closedTone = differenceTone(close.difference);
    return (
      <section className="glass-card p-5 space-y-4 border border-success-500/20" aria-labelledby="close-title">
        <h2 id="close-title" className="text-sm font-bold text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-success-400" aria-hidden="true" />
          اليوم مُقفل
        </h2>
        <dl className="divide-y divide-white/5">
          <RecordRow label="نقد بداية اليوم">{formatCurrency(close.opening_cash)}</RecordRow>
          <RecordRow label="النقد المتوقع">{formatCurrency(close.expected_cash)}</RecordRow>
          <RecordRow label="النقد المعدود">{formatCurrency(close.counted_cash)}</RecordRow>
          <RecordRow label="الفرق">
            <span className={DIFFERENCE_TEXT[closedTone]}>
              {formatCurrency(close.difference)} ({DIFFERENCE_LABELS[closedTone]})
            </span>
          </RecordRow>
          <RecordRow label="أقفله">{close.closed_by_name}</RecordRow>
          <RecordRow label="وقت الإقفال">{formatDateTime(close.closed_at)}</RecordRow>
        </dl>
        {close.notes && (
          <p className="text-xs text-surface-300 bg-surface-900/50 border border-white/5 rounded-xl p-3 whitespace-pre-line">
            <span className="block text-surface-500 mb-1">ملاحظات</span>
            {close.notes}
          </p>
        )}
        {error && <InlineAlert>{error}</InlineAlert>}
        {isManager ? (
          <button
            type="button"
            onClick={handleReopen}
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-xl bg-warning-500/10 hover:bg-warning-500/20 border border-warning-500/30 text-warning-400 text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LockOpen className="w-4 h-4" aria-hidden="true" />}
            إعادة فتح اليوم
          </button>
        ) : (
          <p className="text-[11px] text-surface-500">إعادة فتح يوم مُقفل من صلاحية المدير.</p>
        )}
      </section>
    );
  }

  return (
    <section className="glass-card p-5 space-y-4" aria-labelledby="close-title">
      <h2 id="close-title" className="text-sm font-bold text-white flex items-center gap-2">
        <Lock className="w-4 h-4 text-primary-400" aria-hidden="true" />
        إقفال اليوم
      </h2>

      {unverified > 0 && (
        <InlineAlert tone="warning">
          يوجد {unverified} تحويل غير مطابق لهذا اليوم. يُفضّل مطابقتها بكشف الحساب قبل الإقفال.{' '}
          <Link to={`/dashboard/transfers?date=${encodeURIComponent(date)}`} className="underline font-semibold">
            افتح المطابقة
          </Link>
        </InlineAlert>
      )}

      <form onSubmit={handleClose} className="space-y-3" noValidate>
        <div>
          <label htmlFor="counted-cash" className="block text-xs font-semibold text-surface-300 mb-1">
            النقد المعدود فعلياً في الدرج *
          </label>
          <input
            id="counted-cash"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            dir="ltr"
            value={countedInput}
            onChange={(event) => setCountedInput(event.target.value)}
            aria-describedby="counted-cash-diff"
            className="w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-lg font-bold text-left tabular-nums h-12 focus:border-primary-500"
            placeholder="0.00"
          />
        </div>

        <div
          id="counted-cash-diff"
          aria-live="polite"
          className={`p-3 rounded-xl border text-sm ${tone ? DIFFERENCE_BOX[tone] : 'bg-surface-900/50 border-white/5'}`}
        >
          {countedInput.trim() === '' ? (
            <span className="text-surface-400 text-xs">اكتب المبلغ بعد عدّ الدرج لترى الفرق عن المتوقع.</span>
          ) : tone === null ? (
            <span className="text-danger-400 text-xs">أدخل مبلغاً صحيحاً (أرقام فقط، حتى خانتين عشريتين).</span>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className={`font-bold flex items-center gap-1.5 ${DIFFERENCE_TEXT[tone]}`}>
                {tone === 'balanced' && <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
                {DIFFERENCE_LABELS[tone]}
              </span>
              <span className={`font-extrabold tabular-nums ${DIFFERENCE_TEXT[tone]}`}>
                {formatCurrency(difference)}
              </span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="close-notes" className="block text-xs font-semibold text-surface-300 mb-1">ملاحظات</label>
          <textarea
            id="close-notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500"
            placeholder={tone && tone !== 'balanced' ? 'اذكر سبب الفرق (مهم للمراجعة)…' : 'اختياري'}
          />
        </div>

        {openingInvalid && <InlineAlert>صحّح نقد بداية اليوم أولاً.</InlineAlert>}
        {error && <InlineAlert>{error}</InlineAlert>}

        <button
          type="submit"
          disabled={busy || pending || openingInvalid || counted === null}
          className="w-full px-4 py-2.5 rounded-xl gradient-primary text-white text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Lock className="w-4 h-4" aria-hidden="true" />}
          إقفال اليوم
        </button>
      </form>
    </section>
  );
}
