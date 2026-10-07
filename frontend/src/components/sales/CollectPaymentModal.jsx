import { useId, useState } from 'react';
import { HandCoins, Loader2 } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import ModalShell from './ModalShell';
import BankTransferFields from './BankTransferFields';
import {
  EMPTY_BANK, buildCollectionPayload, centsToAmount, toCents, validateCollection,
} from './salesUtils';

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10';

const METHODS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'bank', label: 'تحويل بنكي' },
];

/**
 * تحصيل دفعة من دين العميل (لكل الأدوار). المبلغ الافتراضي = كامل الرصيد،
 * ولا يتجاوزه (الخادم يرفض ذلك أيضاً).
 */
export default function CollectPaymentModal({ customer, onClose, onSuccess }) {
  const ids = useId();
  const balanceCents = toCents(customer.balance);
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState(() => centsToAmount(balanceCents));
  const [bank, setBank] = useState(EMPTY_BANK);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validateCollection({ method, amount, balance: customer.balance, bank });
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(
        `customers/${customer.id}/payments/`,
        buildCollectionPayload({ method, amount, note, bank }),
      );
      onSuccess(data);
    } catch (err) {
      // مثل: المبلغ أكبر من الرصيد، أو رقم إشعار مستخدم مسبقاً.
      setError(apiErrorMessage(err, 'تعذّر تسجيل الدفعة.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title={`تسجيل دفعة من ${customer.name}`} icon={HandCoins} onClose={onClose} busy={submitting}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="flex items-center justify-between p-3 rounded-xl bg-danger-600/10 border border-danger-500/20">
          <span className="text-xs text-surface-300">الرصيد المستحق</span>
          <span className="text-base font-bold text-danger-400">{formatCurrency(customer.balance)}</span>
        </div>

        <fieldset>
          <legend className="block text-xs font-semibold text-surface-300 mb-1.5">طريقة الدفع</legend>
          <div className="flex gap-2">
            {METHODS.map((option) => (
              <label
                key={option.value}
                className={`flex-1 text-center px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                  method === option.value
                    ? 'bg-primary-600/20 border-primary-500/40 text-primary-200'
                    : 'bg-surface-800 border-white/10 text-surface-300 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name={`${ids}-method`}
                  value={option.value}
                  checked={method === option.value}
                  onChange={() => setMethod(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${ids}-amount`} className="block text-xs font-semibold text-surface-300 mb-1">المبلغ *</label>
          <input
            id={`${ids}-amount`}
            type="number"
            inputMode="decimal"
            min="0.01"
            max={centsToAmount(balanceCents)}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            dir="ltr"
          />
          <p className="mt-1 text-[11px] text-surface-500">الحد الأقصى: {formatCurrency(customer.balance)}</p>
        </div>

        {method === 'bank' && (
          <BankTransferFields
            value={bank}
            onChange={(patch) => setBank((prev) => ({ ...prev, ...patch }))}
            requireSender
            accountLabel="الحساب المستلِم *"
          />
        )}

        <div>
          <label htmlFor={`${ids}-note`} className="block text-xs font-semibold text-surface-300 mb-1">ملاحظة</label>
          <input
            id={`${ids}-note`}
            type="text"
            maxLength={255}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-white/5 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-semibold transition disabled:opacity-40"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition shadow-lg shadow-primary-600/20 disabled:opacity-40 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            تسجيل الدفعة
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
