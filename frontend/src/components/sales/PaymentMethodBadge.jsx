import { formatCurrency } from '../../utils/currency';
import { PAYMENT_METHOD_OPTIONS, PAYMENT_METHOD_STYLES, toCents } from './salesUtils';

const FALLBACK_LABELS = Object.fromEntries(PAYMENT_METHOD_OPTIONS.map((option) => [option.value, option.label]));

/**
 * شارة طريقة الدفع (نقدي/تحويل/مختلط/آجل) ومعها المتبقي آجلاً إن وُجد:
 * الفاتورة الآجلة قد تكون مدفوعة جزئياً، فالمبلغ المتبقي أهم من نوعها.
 */
export default function PaymentMethodBadge({ method, label, creditAmount }) {
  const style = PAYMENT_METHOD_STYLES[method] || PAYMENT_METHOD_STYLES.cash;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${style}`}>
        {label || FALLBACK_LABELS[method] || method}
      </span>
      {toCents(creditAmount) > 0 && (
        <span className="text-[10px] font-semibold text-danger-400">آجل: {formatCurrency(creditAmount)}</span>
      )}
    </span>
  );
}
