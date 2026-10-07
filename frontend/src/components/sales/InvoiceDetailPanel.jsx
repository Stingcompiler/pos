import { Link } from 'react-router-dom';
import {
  AlertCircle, BadgeCheck, CreditCard, ExternalLink, FileText, Loader2, Printer, RefreshCw, RotateCcw, Undo2, User,
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { mediaUrl } from '../../api/media';
import {
  formatDateTime, hasReturnableItems, quantityLabel, returnedTotalCents, centsToAmount, toCents,
} from './salesUtils';

const KIND_STYLES = {
  sale: 'bg-success-600/15 text-success-400',
  collection: 'bg-primary-600/20 text-primary-300',
  refund: 'bg-danger-600/15 text-danger-400',
};

function SummaryTile({ label, value, tone = 'text-white' }) {
  return (
    <div className="p-3 rounded-xl bg-surface-900/50 border border-white/5">
      <span className="block text-[11px] text-surface-400 mb-0.5">{label}</span>
      <span className={`text-sm font-bold ${tone}`}>{value}</span>
    </div>
  );
}

function SectionTitle({ icon, children }) {
  const Icon = icon;
  return (
    <h4 className="text-xs font-semibold text-surface-300 flex items-center gap-1.5 mb-2">
      <Icon className="w-3.5 h-3.5 text-primary-400" aria-hidden="true" />
      {children}
    </h4>
  );
}

function PaymentRow({ payment }) {
  const isRefund = payment.kind === 'refund';
  const bank = payment.bank_account_name || payment.bank_name;
  return (
    <li className="p-3 rounded-xl bg-surface-900/50 border border-white/5 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${KIND_STYLES[payment.kind] || KIND_STYLES.sale}`}>
            {payment.kind_display}
          </span>
          <span className="text-surface-300">{payment.method_display}</span>
        </div>
        <span className={`font-bold ${isRefund ? 'text-danger-400' : 'text-white'}`}>
          {isRefund ? '−' : ''}{formatCurrency(payment.amount)}
        </span>
      </div>
      {payment.method === 'bank' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-surface-400">
          {bank && <span>البنك: <span className="text-surface-200">{bank}</span></span>}
          {payment.reference_id && (
            <span>الإشعار: <span className="font-mono text-accent-400" dir="ltr">{payment.reference_id}</span></span>
          )}
          {payment.sender_account_number && (
            <span>المرسل: <span className="font-mono text-surface-200" dir="ltr">{payment.sender_account_number}</span></span>
          )}
          {payment.verified_at ? (
            <span className="text-success-400 flex items-center gap-1">
              <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
              تم التحقق{payment.verified_by_name ? ` (${payment.verified_by_name})` : ''}
            </span>
          ) : (
            <span className="text-warning-400">لم يُتحقق بعد</span>
          )}
          {payment.proof_image && (
            <a
              href={mediaUrl(payment.proof_image)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              صورة الإشعار
            </a>
          )}
        </div>
      )}
      <p className="text-[11px] text-surface-500">
        {formatDateTime(payment.created_at)}{payment.created_by_name ? ` · ${payment.created_by_name}` : ''}
      </p>
    </li>
  );
}

function ReturnRow({ saleReturn }) {
  return (
    <li className="p-3 rounded-xl bg-danger-600/5 border border-danger-500/15 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold text-white">
          مرتجع #{saleReturn.id} · <span className="text-surface-400 font-normal">{formatDateTime(saleReturn.created_at)}</span>
        </span>
        <span className="font-bold text-danger-400">−{formatCurrency(saleReturn.total_amount)}</span>
      </div>
      <p className="text-surface-400">
        طريقة الردّ: <span className="text-surface-200">{saleReturn.refund_method_display}</span>
        {saleReturn.created_by_name ? ` · بواسطة ${saleReturn.created_by_name}` : ''}
      </p>
      <ul className="text-surface-300 space-y-0.5">
        {saleReturn.items.map((item) => (
          <li key={item.id}>
            {item.spare_part_name} × {item.quantity} = {formatCurrency(item.subtotal)}
          </li>
        ))}
      </ul>
      {saleReturn.reason && <p className="text-surface-400">السبب: <span className="text-surface-200">{saleReturn.reason}</span></p>}
    </li>
  );
}

/**
 * تفاصيل فاتورة موسّعة: الملخص المالي، البنود مع المرتجع منها، الدفعات،
 * المرتجعات، وأزرار الطباعة والمرتجع.
 */
export default function InvoiceDetailPanel({
  detail, error, onRetry, privileged, receiptPaper = '80mm', onPrint, onReturn, showCustomerLink = true,
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-sm text-danger-400" role="alert">
        <p className="flex items-center gap-2"><AlertCircle className="w-4 h-4" aria-hidden="true" />{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex justify-center py-4" role="status" aria-label="جارٍ تحميل التفاصيل">
        <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
      </div>
    );
  }

  const items = detail.items || [];
  const payments = detail.payments || [];
  const returns = detail.returns || [];
  const showCost = privileged && items.some((item) => item.cost_price !== undefined);
  const creditCents = toCents(detail.credit_amount);
  const returnedCents = returnedTotalCents(detail);
  const canReturn = privileged && onReturn && hasReturnableItems(detail);
  const thermal = receiptPaper !== 'a4';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile label="الإجمالي" value={`${formatCurrency(detail.total_amount)} ${detail.currency || ''}`} tone="text-accent-400" />
        <SummaryTile label="المدفوع" value={formatCurrency(detail.paid_amount)} tone="text-success-400" />
        <SummaryTile
          label="المتبقي آجلاً"
          value={formatCurrency(detail.credit_amount)}
          tone={creditCents > 0 ? 'text-danger-400' : 'text-surface-300'}
        />
        <SummaryTile
          label="المرتجعات"
          value={returnedCents > 0 ? `−${formatCurrency(centsToAmount(returnedCents))}` : formatCurrency(0)}
          tone={returnedCents > 0 ? 'text-danger-400' : 'text-surface-300'}
        />
      </div>

      {detail.customer_name && (
        <p className="text-xs text-surface-400 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" aria-hidden="true" />
          العميل:{' '}
          {showCustomerLink && detail.customer ? (
            <Link to={`/customers/${detail.customer}`} className="text-primary-400 hover:text-primary-300 font-semibold">
              {detail.customer_name}
            </Link>
          ) : (
            <span className="text-white font-semibold">{detail.customer_name}</span>
          )}
        </p>
      )}

      <div>
        <SectionTitle icon={FileText}>البنود</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-surface-400 text-xs">
                <th scope="col" className="py-2 text-right font-medium">القطعة</th>
                <th scope="col" className="py-2 text-center font-medium">الكمية</th>
                <th scope="col" className="py-2 text-left font-medium">السعر</th>
                <th scope="col" className="py-2 text-left font-medium">المجموع</th>
                {showCost && <th scope="col" className="py-2 text-left font-medium">التكلفة</th>}
                {showCost && <th scope="col" className="py-2 text-left font-medium">الربح</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-white/5">
                  <td className="py-2.5 text-white">
                    {item.spare_part_name}
                    {item.part_number && <span className="block text-[11px] text-surface-500 font-mono" dir="ltr">{item.part_number}</span>}
                  </td>
                  <td className={`py-2.5 text-center ${Number(item.returned_quantity) > 0 ? 'text-warning-400' : 'text-surface-300'}`}>
                    {quantityLabel(item)}
                  </td>
                  <td className="py-2.5 text-left text-surface-300">{formatCurrency(item.unit_price)}</td>
                  <td className="py-2.5 text-left text-accent-400 font-semibold">{formatCurrency(item.subtotal)}</td>
                  {showCost && <td className="py-2.5 text-left text-surface-400">{formatCurrency(item.cost_price)}</td>}
                  {showCost && (
                    <td className={`py-2.5 text-left font-semibold ${toCents(item.profit) < 0 ? 'text-danger-400' : 'text-success-400'}`}>
                      {formatCurrency(item.profit)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionTitle icon={CreditCard}>الدفعات</SectionTitle>
        {payments.length > 0 ? (
          <ul className="space-y-2">
            {payments.map((payment) => <PaymentRow key={payment.id} payment={payment} />)}
          </ul>
        ) : detail.payment_method === 'bank' && (detail.bank_name || detail.reference_id) ? (
          // فواتير قديمة سُجّل تحويلها في حقول الفاتورة نفسها قبل سجل الدفعات.
          <div className="p-3 rounded-xl bg-primary-600/10 border border-primary-500/20 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div><span className="block text-surface-400">البنك</span><span className="text-primary-300 font-semibold">{detail.bank_name || '-'}</span></div>
            <div><span className="block text-surface-400">رقم الإشعار</span><span className="font-mono text-accent-400" dir="ltr">{detail.reference_id || '-'}</span></div>
            <div><span className="block text-surface-400">حساب المرسل</span><span className="font-mono text-surface-300" dir="ltr">{detail.sender_account_number || '-'}</span></div>
          </div>
        ) : (
          <p className="text-xs text-surface-500">
            {creditCents > 0 && toCents(detail.paid_amount) === 0 ? 'فاتورة آجلة بالكامل — لا دفعات.' : 'لا توجد دفعات مسجّلة.'}
          </p>
        )}
      </div>

      {returns.length > 0 && (
        <div>
          <SectionTitle icon={Undo2}>المرتجعات</SectionTitle>
          <ul className="space-y-2">
            {returns.map((saleReturn) => <ReturnRow key={saleReturn.id} saleReturn={saleReturn} />)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {canReturn && (
          <button
            type="button"
            onClick={onReturn}
            className="px-4 py-2 rounded-xl bg-danger-600/15 hover:bg-danger-600/25 text-danger-400 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            مرتجع
          </button>
        )}
        {thermal && (
          <button
            type="button"
            onClick={() => onPrint('a4')}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-200 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            طباعة A4
          </button>
        )}
        <button
          type="button"
          onClick={() => onPrint(receiptPaper)}
          className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          {thermal ? `طباعة الإيصال (${receiptPaper})` : 'طباعة الفاتورة (A4)'}
        </button>
      </div>
    </div>
  );
}
