import { useId, useState } from 'react';
import { Loader2, ReceiptText } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import ModalShell from '../sales/ModalShell';
import BankTransferFields from '../sales/BankTransferFields';
import { EMPTY_BANK, bankFieldsError, buildOrderSalePayload } from '../sales/salesUtils';

const METHODS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'bank', label: 'تحويل بنكي' },
  { value: 'credit', label: 'آجل' },
];

/**
 * بيع طلب المتجر عند استلام المبلغ: فاتورة بأسعار الطلب على عميله (يُنشأ من
 * رقم الهاتف إن لم يكن مسجلاً). بها يدخل الطلب الإيراد وإقفال اليومية.
 */
export default function SellOrderModal({ order, onClose, onSuccess }) {
  const ids = useId();
  const [method, setMethod] = useState('cash');
  const [bank, setBank] = useState(EMPTY_BANK);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = method === 'bank' ? bankFieldsError(bank, { requireSender: true }) : '';
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(
        `public-orders/${order.id}/invoice/`,
        buildOrderSalePayload({ method, total: order.total_amount, bank }),
      );
      onSuccess(data);
    } catch (err) {
      // مثل: يوم مُقفل، رقم إشعار مستخدم، أو آجل يتجاوز حد العميل.
      setError(apiErrorMessage(err, 'تعذّر بيع الطلب.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title={`بيع الطلب #${order.id}`} icon={ReceiptText} onClose={onClose} busy={submitting}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary-600/10 border border-primary-500/20">
          <span className="text-xs text-surface-300">{order.customer_name} — {order.phone_number}</span>
          <span className="text-base font-bold text-accent-400">{formatCurrency(order.total_amount)}</span>
        </div>
        <p className="text-[11px] text-surface-400">
          تُنشأ فاتورة بأسعار الطلب. {order.status === 'confirmed'
            ? 'المخزون محجوز منذ التأكيد ولن يُخصم مرتين.'
            : 'يُخصم المخزون الآن.'}
        </p>

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

        {method === 'bank' && (
          <BankTransferFields
            value={bank}
            onChange={(patch) => setBank((prev) => ({ ...prev, ...patch }))}
            requireSender
            accountLabel="الحساب المستلِم *"
          />
        )}
        {method === 'credit' && (
          <p className="text-[11px] text-warning-400">
            الآجل يتطلب حد ائتمان للعميل (من صفحة العملاء)؛ العميل الجديد حده صفر.
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
            disabled={submitting}
            className="px-5 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition shadow-lg shadow-primary-600/20 disabled:opacity-40 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            إنشاء الفاتورة
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
