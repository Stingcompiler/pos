import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import { apiErrorMessage } from '../utils/api';
import { formatCurrencyCompact as formatCurrency } from '../utils/currency';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// حركة المال اليوم: تُعرض كقائمة هادئة لا كبطاقة لكل رقم.
const todayLines = [
  { key: 'today_collections', label: 'تحصيل ديون' },
  { key: 'today_credit_sales', label: 'مبيعات آجلة اليوم' },
  { key: 'today_returns', label: 'مرتجعات' },
  { key: 'today_expenses', label: 'مصروفات' },
];

const formatCount = (value) => (Number(value) || 0).toLocaleString('ar-SA');

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('dashboard/stats/');
      setStats(res.data);
    } catch (err) {
      // لا نعرض أصفاراً كأنها أرقام حقيقية؛ نعرض الخطأ مع إعادة المحاولة.
      setError(apiErrorMessage(err, 'تعذّر تحميل إحصائيات لوحة التحكم.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-96" role="status" aria-label="جاري تحميل الإحصائيات">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="animate-fade-in">
        <div className="glass-card p-8 text-center max-w-md mx-auto mt-12 space-y-4" role="alert">
          <AlertCircle className="w-10 h-10 text-danger-400 mx-auto" aria-hidden="true" />
          <h1 className="text-lg font-bold text-white">تعذّر تحميل لوحة التحكم</h1>
          <p className="text-sm text-surface-400">{error}</p>
          <button
            type="button"
            onClick={loadStats}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl gradient-primary text-white text-sm font-semibold"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const outstanding = Number(stats.outstanding_credit) || 0;
  const lowStock = Number(stats.low_stock_count) || 0;
  const pendingOrders = Number(stats.pending_public_orders) || 0;

  // ما يحتاج تدخل المدير الآن؛ لا يظهر البند إلا إذا كان له معنى.
  const actions = [
    lowStock > 0 && {
      key: 'stock', to: '/spare-parts', cta: 'راجع المخزون', tone: 'text-warning-400',
      title: 'قطع عند حد التنبيه أو أقل', value: formatCount(lowStock),
    },
    pendingOrders > 0 && {
      key: 'orders', to: '/dashboard/orders', cta: 'فتح الطلبات', tone: 'text-white',
      title: 'طلبات خارجية بانتظار البيع', value: formatCount(pendingOrders),
    },
    outstanding > 0 && {
      key: 'debts', to: '/customers?filter=debtors', cta: 'العملاء المدينون', tone: 'text-warning-400',
      title: 'ديون العملاء المستحقة', value: `${formatCurrency(outstanding)} ج.س`,
    },
  ].filter(Boolean);

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white mb-1">
          مرحباً، {user?.first_name || user?.username}
        </h1>
        <p className="text-surface-400">ملخص اليوم</p>
      </header>

      {/* الإيراد: الرقم الوحيد المضخّم، وتفصيل حركته بجانبه */}
      <section aria-labelledby="revenue-heading" className="glass-card grid lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="p-6">
          <h2 id="revenue-heading" className="text-sm text-surface-400">إيرادات اليوم (صافية)</h2>
          <p className="text-4xl sm:text-5xl font-extrabold text-white nums mt-2">
            {formatCurrency(stats.today_revenue)} <span className="text-lg font-medium text-surface-400">ج.س</span>
          </p>
          <p className="text-sm text-surface-400 mt-3">
            من {formatCount(stats.today_invoices)} فاتورة
          </p>
        </div>
        <dl className="p-6 border-t lg:border-t-0 lg:border-s border-surface-700 divide-y divide-surface-700">
          {todayLines.map((line) => (
            <div key={line.key} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <dt className="text-sm text-surface-400">{line.label}</dt>
              <dd className="text-sm font-bold text-white nums">{formatCurrency(stats[line.key])}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ما يحتاج تدخلك الآن */}
      <section aria-labelledby="actions-heading" className="glass-card">
        <h2 id="actions-heading" className="text-base font-bold text-white p-5 pb-3">ما يحتاج تدخلك الآن</h2>
        {actions.length > 0 ? (
          <ul className="divide-y divide-surface-700 border-t border-surface-700">
            {actions.map((a) => (
              <li key={a.key} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                <span className={`text-2xl font-extrabold nums sm:w-44 shrink-0 ${a.tone}`}>{a.value}</span>
                <span className="flex-1 text-sm text-surface-200">{a.title}</span>
                <Link
                  to={a.to}
                  className="inline-flex items-center justify-center h-11 px-5 rounded-xl border border-surface-700 text-sm font-semibold text-white hover:bg-surface-700/50 transition-colors"
                >
                  {a.cta}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-surface-400 px-5 pb-5">لا شيء يحتاج تدخلك الآن.</p>
        )}
      </section>

      {/* المخزون المنخفض */}
      <section aria-labelledby="low-stock-heading" className="glass-card">
        <h2 id="low-stock-heading" className="text-base font-bold text-white p-5 pb-3">المخزون المنخفض</h2>
        {stats.low_stock_items?.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-surface-400 text-xs border-y border-surface-700">
                <th scope="col" className="text-start font-medium px-5 py-2">القطعة</th>
                <th scope="col" className="text-end font-medium px-5 py-2">الرصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {stats.low_stock_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3">
                    <span className="block text-white">{item.name}</span>
                    <span dir="ltr" className="block text-xs text-surface-400 text-end">{item.part_number}</span>
                  </td>
                  <td className="px-5 py-3 text-end whitespace-nowrap">
                    <span className="font-bold text-warning-400 nums">{formatCount(item.stock_quantity)}</span>
                    <span className="text-xs text-surface-400"> من {formatCount(item.min_stock_alert)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-surface-400 px-5 pb-5">كل القطع فوق حد التنبيه.</p>
        )}
      </section>

      <p className="text-xs text-surface-500 text-center nums">
        {formatCount(stats.total_invoices)} فاتورة · {formatCount(stats.total_parts)} قطعة · إجمالي الإيرادات {formatCurrency(stats.total_revenue)} ج.س
      </p>
    </div>
  );
}
