import { useEffect, useId, useRef, useState } from 'react';
import { Banknote, CalendarClock, ImagePlus, Landmark, Split, X } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { centsToAmount, fromCents, parseAmountInput } from './money';
import { creditStatus } from './payment';
import { PROOF_ACCEPT } from './proofImage';
import { inputClass, labelClass } from './ui';

const MODES = [
  { id: 'cash', label: 'نقدي', icon: Banknote },
  { id: 'bank', label: 'تحويل', icon: Landmark },
  { id: 'mixed', label: 'مختلط', icon: Split },
  { id: 'credit', label: 'آجل', icon: CalendarClock },
];

const money = (cents) => formatCurrency(fromCents(cents));

function AmountInput({ id, label, value, onChange, placeholder = '0.00' }) {
  const cents = parseAmountInput(value);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        value={value}
        placeholder={placeholder}
        aria-invalid={Number.isNaN(cents) || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`${Number.isNaN(cents) ? inputClass.replace('border-white/10', 'border-danger-500/60') : inputClass} text-left`}
      />
    </div>
  );
}

/** المبلغ المستلم والباقي للعميل — للعرض فقط، المبلغ المسجّل هو الإجمالي. */
function CashTendered({ id, totalCents, tendered, onTenderedChange }) {
  const tenderedCents = parseAmountInput(tendered);
  const hasChange = tenderedCents > 0 && tenderedCents >= totalCents;
  return (
    <div className="space-y-1.5">
      {/* الحقل والباقي جنباً إلى جنب: الباقي يظهر بجوار المبلغ فور كتابته. */}
      <div className="grid grid-cols-2 gap-2 items-end">
        <AmountInput id={id} label="المبلغ المستلم (اختياري)" value={tendered} onChange={onTenderedChange} />
        <div aria-live="polite">
          {hasChange && (
            <p>
              <span className={labelClass}>الباقي للعميل</span>
              <strong className="h-10 px-3 rounded-xl bg-success-500/10 border border-success-500/20 flex items-center text-base text-success-400 tabular-nums">
                {money(tenderedCents - totalCents)}
              </strong>
            </p>
          )}
        </div>
      </div>
      {Number.isNaN(tenderedCents) && <p className="text-xs text-danger-400">مبلغ غير صالح.</p>}
      {tenderedCents > 0 && tenderedCents < totalCents && (
        <p className="text-xs text-warning-400">
          المبلغ المستلم أقل من الإجمالي بـ {money(totalCents - tenderedCents)}.
        </p>
      )}
    </div>
  );
}

function BankFields({ ids, payment, onChange, bankAccounts, bankAccountsFailed, proofFile, onProofChange }) {
  const [proofError, setProofError] = useState('');

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    // تفريغ الحقل يسمح باختيار الملف نفسه مرة أخرى بعد إزالته.
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProofError('الملف يجب أن يكون صورة (JPG أو PNG أو WEBP).');
      return;
    }
    setProofError('');
    onProofChange(file);
  };

  return (
    <div className="space-y-2 pt-2.5 border-t border-white/5 animate-fade-in">
      {bankAccounts.length > 0 ? (
        <div>
          <label htmlFor={`${ids}-account`} className={labelClass}>الحساب المحوَّل إليه *</label>
          <select
            id={`${ids}-account`}
            value={payment.bankAccount}
            onChange={(event) => onChange({ bankAccount: event.target.value })}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">— اختر الحساب —</option>
            {bankAccounts.map((account) => (
              <option key={account.id} value={String(account.id)}>
                {account.name}{account.account_number ? ` — ${account.account_number}` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label htmlFor={`${ids}-bank-name`} className={labelClass}>اسم البنك *</label>
          <input
            id={`${ids}-bank-name`}
            type="text"
            placeholder="مثال: بنك الخرطوم"
            value={payment.bankName}
            onChange={(event) => onChange({ bankName: event.target.value })}
            className={inputClass}
          />
          {bankAccountsFailed && (
            <p className="text-[11px] text-surface-500 mt-1">تعذّر تحميل حسابات المحل البنكية؛ اكتب اسم البنك.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${ids}-reference`} className={labelClass}>رقم الإشعار *</label>
          <input
            id={`${ids}-reference`}
            type="text"
            dir="ltr"
            autoComplete="off"
            placeholder="رقم العملية"
            value={payment.referenceId}
            onChange={(event) => onChange({ referenceId: event.target.value })}
            className={`${inputClass} text-left`}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-sender`} className={labelClass}>رقم حساب المرسل *</label>
          <input
            id={`${ids}-sender`}
            type="text"
            dir="ltr"
            autoComplete="off"
            placeholder="رقم الحساب"
            value={payment.senderAccountNumber}
            onChange={(event) => onChange({ senderAccountNumber: event.target.value })}
            className={`${inputClass} text-left`}
          />
        </div>
      </div>

      {proofFile ? (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-900/50 border border-white/10 text-xs text-surface-300">
          <ImagePlus className="w-4 h-4 text-primary-400 shrink-0" />
          <span className="flex-1 truncate" dir="ltr">{proofFile.name}</span>
          <button
            type="button"
            onClick={() => onProofChange(null)}
            aria-label="إزالة صورة الإشعار"
            className="p-1 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div>
          <label
            htmlFor={`${ids}-proof`}
            className="flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-white/15 text-xs text-surface-400
              hover:border-primary-500/40 hover:text-primary-300 cursor-pointer transition-colors
              focus-within:border-primary-500"
          >
            <ImagePlus className="w-4 h-4" />
            إرفاق صورة الإشعار (اختياري)
            <input id={`${ids}-proof`} type="file" accept={PROOF_ACCEPT} onChange={handleFile} className="sr-only" />
          </label>
          {proofError && <p className="text-xs text-danger-400 mt-1">{proofError}</p>}
        </div>
      )}
    </div>
  );
}

function CreditSummary({ ids, customer, payment, onChange, totalCents }) {
  if (!customer) {
    return (
      <p className="text-xs text-warning-400 p-2.5 rounded-xl bg-warning-500/10 border border-warning-500/20">
        اختر العميل أولاً؛ البيع الآجل يُسجَّل على حسابه.
      </p>
    );
  }
  const credit = creditStatus(customer);
  const upfrontCents = parseAmountInput(payment.upfrontAmount) || 0;
  const creditCents = Math.max(totalCents - upfrontCents, 0);
  const newBalanceCents = credit.balanceCents + creditCents;
  const exceeds = !credit.allowed || newBalanceCents > credit.limitCents;

  return (
    <div className="space-y-2 animate-fade-in">
      <dl className="grid grid-cols-3 gap-1.5 text-center">
        {[
          ['الرصيد الحالي', credit.balanceCents, 'text-white'],
          ['حد الائتمان', credit.limitCents, 'text-white'],
          ['المتاح', credit.availableCents, credit.allowed ? 'text-success-400' : 'text-danger-400'],
        ].map(([label, cents, color]) => (
          <div key={label} className="px-1.5 py-1.5 rounded-xl bg-surface-900/50 border border-white/5 min-w-0">
            <dt className="text-[11px] text-surface-400 truncate">{label}</dt>
            <dd className={`text-xs font-bold mt-0.5 tabular-nums truncate ${color}`}>{money(cents)}</dd>
          </div>
        ))}
      </dl>

      <AmountInput
        id={`${ids}-upfront`}
        label="دفعة مقدَّمة نقداً (اختياري)"
        value={payment.upfrontAmount}
        onChange={(value) => onChange({ upfrontAmount: value })}
      />

      <div className="text-xs space-y-1">
        <p className="flex justify-between text-surface-300">
          <span>يُسجَّل آجلاً</span>
          <strong className="text-warning-400">{money(creditCents)}</strong>
        </p>
        <p className="flex justify-between text-surface-300">
          <span>رصيد العميل بعد البيع</span>
          <strong className={exceeds ? 'text-danger-400' : 'text-white'}>{money(newBalanceCents)}</strong>
        </p>
      </div>
    </div>
  );
}

/**
 * قسم الدفع: نقدي، تحويل، مختلط (نقد + تحويل)، آجل (مع دفعة مقدَّمة اختيارية).
 * القيم المرسلة للخادم في `payment`، والمبلغ المستلم وصورة الإشعار منفصلة لأنها
 * لا تغيّر محتوى البيع (ولا يجوز أن تولّد مفتاح Idempotency جديداً).
 */
export default function PaymentPanel({
  payment, onChange, totalCents, customer,
  bankAccounts, bankAccountsFailed, tendered, onTenderedChange, proofFile, onProofChange,
}) {
  const ids = useId();
  const rootRef = useRef(null);
  const mode = payment.mode;
  const bankProps = { ids, payment, onChange, bankAccounts, bankAccountsFailed, proofFile, onProofChange };

  const cashCents = parseAmountInput(payment.cashAmount);
  const canFillTransfer = mode === 'mixed' && cashCents > 0 && cashCents < totalCents;

  // حقول الطريقة الجديدة تظهر أسفل القسم: عند تغيير الطريقة يُمرَّر القسم ليظهر كاملاً
  // إن أمكن بدل أن يبحث الكاشير عنها. scroll-margin دون lg يُبقيه فوق شريط الإتمام اللاصق.
  const shownModeRef = useRef(mode);
  useEffect(() => {
    if (shownModeRef.current === mode) return;
    shownModeRef.current = mode;
    rootRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [mode]);

  return (
    <div ref={rootRef} className="space-y-3 max-lg:scroll-mt-24 max-lg:scroll-mb-56">
      <div>
        <p id={`${ids}-mode`} className="block text-xs font-semibold text-surface-400 mb-1.5">طريقة الدفع</p>
        {/* شريط مقسّم واحد: الأيقونة بجوار الاسم، فيتسع للأربعة على شاشة 360px. */}
        <div
          role="group"
          aria-labelledby={`${ids}-mode`}
          className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-surface-900/60 border border-white/10"
        >
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ mode: item.id })}
                className={`h-9 min-w-0 px-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/40'
                    : 'text-surface-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'cash' && (
        <CashTendered id={`${ids}-tendered`} totalCents={totalCents} tendered={tendered} onTenderedChange={onTenderedChange} />
      )}

      {mode === 'mixed' && (
        <div className="space-y-1.5 animate-fade-in">
          <div className="grid grid-cols-2 gap-2">
            <AmountInput
              id={`${ids}-cash`}
              label="نقداً *"
              value={payment.cashAmount}
              onChange={(value) => onChange({ cashAmount: value })}
            />
            <AmountInput
              id={`${ids}-transfer`}
              label="تحويلاً *"
              value={payment.transferAmount}
              onChange={(value) => onChange({ transferAmount: value })}
            />
          </div>
          {canFillTransfer && (
            <button
              type="button"
              onClick={() => onChange({ transferAmount: centsToAmount(totalCents - cashCents) })}
              className="text-xs text-primary-400 hover:text-primary-300 underline-offset-2 hover:underline"
            >
              الباقي تحويلاً ({money(totalCents - cashCents)})
            </button>
          )}
        </div>
      )}

      {(mode === 'bank' || mode === 'mixed') && <BankFields {...bankProps} />}

      {mode === 'credit' && (
        <CreditSummary
          ids={ids}
          customer={customer}
          payment={payment}
          onChange={onChange}
          totalCents={totalCents}
        />
      )}
    </div>
  );
}
