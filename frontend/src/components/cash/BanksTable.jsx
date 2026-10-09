import { Link } from 'react-router-dom';
import { CheckCircle2, Landmark } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from './PageStates';

/**
 * حركة كل حساب بنكي في اليوم. التحويل غير المطابق لم يُراجع بكشف الحساب بعد،
 * فنربطه مباشرة بشاشة المطابقة لنفس اليوم.
 */
export default function BanksTable({ banks, date }) {
  const transfersLink = `/dashboard/transfers?date=${encodeURIComponent(date)}`;

  return (
    <section className="glass-card overflow-hidden" aria-labelledby="banks-title">
      <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
        <h2 id="banks-title" className="text-sm font-bold text-white flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary-400" aria-hidden="true" />
          التحويلات البنكية حسب الحساب
        </h2>
        <Link to={transfersLink} className="text-xs text-primary-400 hover:text-primary-300 font-semibold">
          شاشة المطابقة
        </Link>
      </div>

      {banks.length === 0 ? (
        <EmptyState compact icon={Landmark} title="لا توجد تحويلات بنكية في هذا اليوم" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-white/5 text-surface-400 text-xs">
                <th scope="col" className="p-3 font-semibold">الحساب / البنك</th>
                <th scope="col" className="p-3 font-semibold">وارد</th>
                <th scope="col" className="p-3 font-semibold">صادر</th>
                <th scope="col" className="p-3 font-semibold text-center">عدد التحويلات</th>
                <th scope="col" className="p-3 font-semibold">المطابقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-surface-200">
              {banks.map((row) => (
                <tr key={row.bank}>
                  <th scope="row" className="p-3 font-semibold text-white">{row.bank}</th>
                  <td className="p-3 tabular-nums text-success-400">{formatCurrency(row.in)}</td>
                  <td className="p-3 tabular-nums text-danger-400">{formatCurrency(row.out)}</td>
                  <td className="p-3 text-center tabular-nums">{row.count}</td>
                  <td className="p-3">
                    {row.unverified > 0 ? (
                      <Link
                        to={transfersLink}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-warning-500/10 text-warning-400 border border-warning-500/20 hover:bg-warning-500/20"
                      >
                        {row.unverified} غير مطابق — راجِعها
                      </Link>
                    ) : row.count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success-400">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        مطابقة بالكامل
                      </span>
                    ) : (
                      <span className="text-surface-500 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
