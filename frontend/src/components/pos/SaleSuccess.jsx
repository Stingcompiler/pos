import { CircleCheck, Loader2, Printer, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { fromCents, toCents } from './money';

function ProofStatus({ proof, onRetry }) {
  if (!proof) return null;
  if (proof.status === 'uploading') {
    return (
      <p className="text-xs text-surface-300 flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        جاري رفع صورة الإشعار...
      </p>
    );
  }
  if (proof.status === 'done') {
    return <p className="text-xs text-success-400">أُرفقت صورة الإشعار بالتحويل.</p>;
  }
  return (
    <div role="alert" className="text-xs text-warning-400 p-2 rounded-lg bg-warning-500/10 border border-warning-500/20 space-y-1.5">
      <p className="flex items-start gap-1.5">
        <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>تم البيع، لكن تعذّر رفع صورة الإشعار: {proof.error}</span>
      </p>
      <button type="button" onClick={onRetry} className="font-semibold text-warning-400 hover:underline">
        إعادة رفع الصورة
      </button>
    </div>
  );
}

/**
 * نتيجة آخر عملية بيع: رقم الفاتورة وملخصها وزر طباعة الإيصال.
 *
 * يُعرض كاملاً والسلة فارغة، ومختصراً فوق السلة إذا بدأ الكاشير بيعاً جديداً،
 * فيبقى الإيصال قابلاً للطباعة وتحذير صورة الإشعار ظاهراً.
 */
export default function SaleSuccess({ sale, compact, canPrint, onPrint, onNewSale, onDismiss, onRetryProof }) {
  const { invoice } = sale;
  const totalCents = toCents(invoice.total_amount);
  const creditCents = toCents(invoice.credit_amount);
  const priceChanged = totalCents !== sale.expectedTotalCents;

  const printButton = (className, label) => (
    <button
      type="button"
      onClick={onPrint}
      disabled={!canPrint}
      aria-label={compact ? `طباعة إيصال الفاتورة #${invoice.id}` : undefined}
      className={className}
    >
      {canPrint ? <Printer className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );

  if (compact) {
    return (
      <div className="p-2.5 rounded-xl bg-success-500/10 border border-success-500/20 space-y-2 animate-fade-in">
        <div className="flex items-center gap-2 text-xs text-success-400">
          <CircleCheck className="w-4 h-4 shrink-0" />
          <span className="flex-1">آخر فاتورة #{invoice.id} — {formatCurrency(invoice.total_amount)}</span>
          {printButton('p-1.5 rounded-lg text-success-400 hover:bg-success-500/15 disabled:opacity-50 transition-colors')}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="إخفاء ملخص الفاتورة السابقة"
            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {sale.proof && sale.proof.status !== 'done' && <ProofStatus proof={sale.proof} onRetry={onRetryProof} />}
      </div>
    );
  }

  const rows = [
    ['الإجمالي', formatCurrency(invoice.total_amount)],
    ['طريقة الدفع', invoice.payment_method_display],
    invoice.customer_name && ['العميل', invoice.customer_name],
    creditCents > 0 && ['المدفوع', formatCurrency(invoice.paid_amount)],
    creditCents > 0 && ['آجل على العميل', formatCurrency(invoice.credit_amount), 'text-warning-400'],
    sale.changeCents > 0 && ['الباقي للعميل', formatCurrency(fromCents(sale.changeCents)), 'text-success-400 text-base'],
  ].filter(Boolean);

  return (
    <div role="status" className="p-4 rounded-2xl bg-success-500/10 border border-success-500/20 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-success-400">
        <CircleCheck className="w-5 h-5 shrink-0" />
        <p className="font-bold">تمت عملية البيع بنجاح — فاتورة رقم #{invoice.id}</p>
      </div>
      {sale.replayed && (
        <p className="text-xs text-surface-300">
          هذه العملية سُجّلت سابقاً؛ أُعيدت الفاتورة نفسها دون بيع أو خصم مخزون مكرر.
        </p>
      )}

      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value, valueClass]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-surface-400">{label}</dt>
            <dd className={`font-semibold ${valueClass || 'text-white'}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {priceChanged && (
        <p role="alert" className="text-xs text-warning-400 flex items-start gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            إجمالي الفاتورة المسجّل يختلف عن إجمالي السلة ({formatCurrency(fromCents(sale.expectedTotalCents))})؛
            تغيّر سعر صنف أثناء البيع. راجع الإيصال مع العميل.
          </span>
        </p>
      )}

      <ProofStatus proof={sale.proof} onRetry={onRetryProof} />

      <div className="grid grid-cols-2 gap-2 pt-1">
        {printButton(
          'py-3 rounded-xl gradient-primary text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all',
          'طباعة الإيصال',
        )}
        <button
          type="button"
          onClick={onNewSale}
          className="py-3 rounded-xl bg-surface-800 border border-white/10 text-surface-200 text-sm font-bold flex items-center justify-center gap-2 hover:text-white hover:border-primary-500/30 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          عملية جديدة
        </button>
      </div>
    </div>
  );
}
