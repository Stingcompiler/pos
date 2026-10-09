import { Link } from 'react-router-dom';
import { CheckCircle2, ImageOff, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { mediaUrl } from '../../api/media';
import { formatCurrency } from '../../utils/currency';
import { formatDateTime, formatTime } from './format';

const KIND_BADGES = {
  sale: 'bg-primary-500/10 text-primary-300 border-primary-500/20',
  collection: 'bg-success-500/10 text-success-400 border-success-500/20',
  refund: 'bg-danger-500/10 text-danger-400 border-danger-500/20',
};

/**
 * سطر تحويل بنكي واحد في شاشة المطابقة. المردود للعميل (صادر) يُعرض بالسالب
 * حتى لا يُخلط بالوارد عند المقارنة بكشف الحساب.
 */
export default function TransferRow({ payment, showDate, busy, onToggle }) {
  const refund = payment.kind === 'refund';
  const verified = Boolean(payment.verified_at);
  const proof = mediaUrl(payment.proof_image);
  const bank = payment.bank_account_name || payment.bank_name || '—';

  return (
    <tr className={verified ? 'bg-success-500/[0.03]' : undefined}>
      <td className="p-3 text-xs text-surface-400 whitespace-nowrap tabular-nums">
        {showDate ? formatDateTime(payment.created_at) : formatTime(payment.created_at)}
      </td>
      <td className="p-3">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${KIND_BADGES[payment.kind] || KIND_BADGES.sale}`}>
          {payment.kind_display}
        </span>
      </td>
      <td className={`p-3 font-bold tabular-nums whitespace-nowrap ${refund ? 'text-danger-400' : 'text-white'}`}>
        {refund ? '− ' : ''}{formatCurrency(payment.amount)}
      </td>
      <td className="p-3 text-xs text-surface-200">{bank}</td>
      <td className="p-3 font-mono text-xs text-accent-400" dir="ltr">{payment.reference_id || '—'}</td>
      <td className="p-3 font-mono text-xs text-surface-300" dir="ltr">{payment.sender_account_number || '—'}</td>
      <td className="p-3 text-xs">
        {payment.customer ? (
          <Link to={`/customers/${payment.customer}`} className="text-primary-400 hover:text-primary-300">
            {payment.customer_name}
          </Link>
        ) : <span className="text-surface-500">—</span>}
      </td>
      <td className="p-3 text-xs">
        {payment.invoice ? (
          <Link to="/invoices" className="font-mono text-primary-400 hover:text-primary-300" title="سجل الفواتير">
            #{payment.invoice}
          </Link>
        ) : <span className="text-surface-500">—</span>}
      </td>
      <td className="p-3">
        {proof ? (
          <a
            href={proof}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`فتح صورة إشعار التحويل ${payment.reference_id || ''} كاملة في نافذة جديدة`}
            className="block w-12 h-12 rounded-lg overflow-hidden border border-white/10 hover:border-primary-500 transition"
          >
            <img src={proof} alt="" loading="lazy" className="w-full h-full object-cover" />
          </a>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-surface-500 whitespace-nowrap">
            <ImageOff className="w-3.5 h-3.5" aria-hidden="true" />
            لا توجد صورة
          </span>
        )}
      </td>
      <td className="p-3">
        {verified ? (
          <span className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success-400 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              مطابق
            </span>
            <span className="text-[10px] text-surface-500 whitespace-nowrap">
              {payment.verified_by_name || '—'} · {formatDateTime(payment.verified_at)}
            </span>
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-warning-500/10 text-warning-400 border border-warning-500/20 whitespace-nowrap">
            غير مطابق
          </span>
        )}
      </td>
      <td className="p-3 text-left">
        <button
          type="button"
          onClick={() => onToggle(payment)}
          disabled={busy}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 cursor-pointer ${
            verified
              ? 'bg-surface-700/60 hover:bg-surface-700 text-surface-300'
              : 'bg-success-500/15 hover:bg-success-500/25 text-success-400 border border-success-500/25'
          }`}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : verified ? (
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {verified ? 'إلغاء المطابقة' : 'مطابقة'}
        </button>
      </td>
    </tr>
  );
}
