import { useId, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import ModalShell from './ModalShell';
import BankTransferFields from './BankTransferFields';
import {
  EMPTY_BANK, REFUND_METHOD_LABELS, buildReturnPayload, centsToAmount, clampQuantity, defaultRefundMethod,
  refundableCents, returnTotalCents, returnableQuantity, selectedReturnItems, validateReturn,
} from './salesUtils';

const qtyInputClass =
  'w-20 px-2 py-1.5 rounded-lg bg-surface-800 border border-white/10 text-white text-sm text-center focus:border-primary-500 disabled:opacity-40';

/**
 * مرتجع جزئي أو كامل (للمدير والمشرف): الكمية لكل بند ضمن المتبقي، وطريقة
 * ردّ المبلغ. الخادم هو الحكم النهائي (حدود الكمية والمبلغ المدفوع)، والواجهة
 * تنبّه مبكراً فقط.
 */
export default function ReturnModal({ invoice, onClose, onSuccess }) {
  const ids = useId();
  const [quantities, setQuantities] = useState({});
  const [refundMethod, setRefundMethod] = useState(() => defaultRefundMethod(invoice));
  const [bank, setBank] = useState(EMPTY_BANK);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const items = invoice.items || [];
  const totalCents = returnTotalCents(items, quantities);
  const refundable = refundableCents(invoice);
  const exceedsPaid = refundMethod !== 'account' && totalCents > refundable;
  const hasSelection = selectedReturnItems(items, quantities).length > 0;
  const methods = ['cash', 'bank', ...(invoice.customer ? ['account'] : [])];

  const setQuantity = (item, raw) => {
    setQuantities((prev) => ({ ...prev, [item.id]: clampQuantity(raw, returnableQuantity(item)) }));
  };

  const returnAll = () => {
    setQuantities(Object.fromEntries(items.map((item) => [item.id, String(returnableQuantity(item))])));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validateReturn({ invoice, quantities, refundMethod, bank });
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = buildReturnPayload({ invoice, quantities, refundMethod, reason, bank });
      const { data } = await api.post(`invoices/${invoice.id}/returns/`, payload);
      onSuccess(data);
    } catch (err) {
      // مثل: المبلغ المردود أكبر مما دُفع → الخادم يقترح الخصم من حساب العميل.
      setError(apiErrorMessage(err, 'تعذّر تسجيل المرتجع.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title={`مرتجع من فاتورة #${invoice.id}`} icon={RotateCcw} onClose={onClose} busy={submitting} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-surface-400">حدّد الكمية المرتجعة لكل بند (حتى المتبقي غير المُرجَع).</p>
          <button
            type="button"
            onClick={returnAll}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-200 text-[11px] font-semibold cursor-pointer"
          >
            إرجاع الكل
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[460px]">
            <thead>
              <tr className="text-surface-400 text-xs">
                <th scope="col" className="py-2 text-right font-medium">القطعة</th>
                <th scope="col" className="py-2 text-center font-medium">المباع</th>
                <th scope="col" className="py-2 text-center font-medium">المتاح للإرجاع</th>
                <th scope="col" className="py-2 text-left font-medium">السعر</th>
                <th scope="col" className="py-2 text-center font-medium">كمية المرتجع</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const max = returnableQuantity(item);
                const inputId = `${ids}-qty-${item.id}`;
                return (
                  <tr key={item.id} className="border-t border-white/5">
                    <td className="py-2 text-white">
                      <label htmlFor={inputId} className="cursor-pointer">{item.spare_part_name}</label>
                    </td>
                    <td className="py-2 text-center text-surface-300">{item.quantity}</td>
                    <td className={`py-2 text-center ${max === 0 ? 'text-surface-500' : 'text-surface-200'}`}>
                      {max === 0 ? 'أُرجع بالكامل' : max}
                    </td>
                    <td className="py-2 text-left text-surface-300">{formatCurrency(item.unit_price)}</td>
                    <td className="py-2 text-center">
                      <input
                        id={inputId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={max}
                        step={1}
                        disabled={max === 0 || submitting}
                        value={quantities[item.id] ?? ''}
                        placeholder="0"
                        onChange={(e) => setQuantity(item, e.target.value)}
                        className={qtyInputClass}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <fieldset className="space-y-2">
          <legend className="block text-xs font-semibold text-surface-300 mb-1">طريقة ردّ المبلغ</legend>
          <div className="flex flex-wrap gap-2">
            {methods.map((method) => (
              <label
                key={method}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                  refundMethod === method
                    ? 'bg-primary-600/20 border-primary-500/40 text-primary-200'
                    : 'bg-surface-800 border-white/10 text-surface-300 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name={`${ids}-refund`}
                  value={method}
                  checked={refundMethod === method}
                  onChange={() => setRefundMethod(method)}
                  className="sr-only"
                />
                {REFUND_METHOD_LABELS[method]}
              </label>
            ))}
          </div>
          {refundMethod === 'account' ? (
            <p className="text-[11px] text-surface-400">
              يُخصم المبلغ من دين العميل <span className="text-white">{invoice.customer_name}</span> (لا يخرج نقد من الصندوق).
            </p>
          ) : (
            <p className="text-[11px] text-surface-400">
              الحد الأقصى للردّ نقداً أو تحويلاً من هذه الفاتورة: {formatCurrency(centsToAmount(refundable))}
            </p>
          )}
        </fieldset>

        {refundMethod === 'bank' && (
          <BankTransferFields
            value={bank}
            onChange={(patch) => setBank((prev) => ({ ...prev, ...patch }))}
            accountLabel="الحساب الذي حُوّل منه المبلغ *"
          />
        )}

        <div>
          <label htmlFor={`${ids}-reason`} className="block text-xs font-semibold text-surface-300 mb-1">سبب المرتجع</label>
          <input
            id={`${ids}-reason`}
            type="text"
            maxLength={255}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
            placeholder="مثال: قطعة غير مطابقة"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-950/60 border border-white/5" aria-live="polite">
          <span className="text-sm text-surface-300">إجمالي المرتجع</span>
          <span className="text-lg font-bold text-danger-400">{formatCurrency(centsToAmount(totalCents))}</span>
        </div>

        {exceedsPaid && (
          <p className="flex items-start gap-2 text-xs text-warning-400">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            المبلغ أكبر مما دُفع من الفاتورة ولم يُردّ بعد
            {invoice.customer ? '؛ اختر «خصم من حساب العميل» للجزء الآجل.' : '.'}
          </p>
        )}

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
            disabled={submitting || !hasSelection}
            className="px-5 py-2 rounded-xl bg-danger-600 hover:bg-danger-500 text-white text-sm font-semibold transition disabled:opacity-40 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            تأكيد المرتجع
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
