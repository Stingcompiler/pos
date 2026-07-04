import { useState, useEffect } from 'react';
import api from '../api/axios';
import {
  LayoutDashboard, TrendingUp, ShoppingBag, CreditCard,
  Printer, Loader2, Calendar, DollarSign, Wallet
} from 'lucide-react';

export default function Reports() {
  const [period, setPeriod] = useState('daily');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const fetchReportData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`reports/sales/?period=${period}`);
      setData(res.data);
    } catch (err) {
      setError('فشل في تحميل بيانات التقارير. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const fmt = (v) => new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SDG', minimumFractionDigits: 0 }).format(v);
  const fmtNum = (v) => new Intl.NumberFormat('ar-SA').format(v);

  const getPeriodLabel = (p) => {
    switch (p) {
      case 'daily': return 'يومي (آخر 30 يوم)';
      case 'weekly': return 'أسبوعي (آخر 12 أسبوع)';
      case 'monthly': return 'شهري (آخر 12 شهر)';
      case 'yearly': return 'سنوي (آخر 5 سنوات)';
      default: return '';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Controls */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary-500" />
            تقارير المبيعات
          </h1>
          <p className="text-sm text-surface-400">مراقبة وتحليل أداء مبيعات المتجر</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Tabs */}
          <div className="bg-surface-900/60 p-1 border border-white/5 rounded-xl flex gap-1">
            {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p
                    ? 'bg-primary-600 text-white shadow'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                {p === 'daily' && 'يومي'}
                {p === 'weekly' && 'أسبوعي'}
                {p === 'monthly' && 'شهري'}
                {p === 'yearly' && 'سنوي'}
              </button>
            ))}
          </div>

          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-surface-900 border border-white/10 hover:border-primary-500/30 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-primary-400" />
            طباعة التقرير
          </button>
        </div>
      </div>

      {/* Print-Only Header */}
      <div className="hidden print:block text-right mb-6 border-b border-gray-300 pb-4">
        <h1 className="text-2xl font-bold text-black">DAL Motors - تقرير المبيعات</h1>
        <p className="text-sm text-gray-600 mt-1">
          نوع التقرير: {getPeriodLabel(period)} · تاريخ الطباعة: {new Date().toLocaleDateString('ar-SA')}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center text-danger-400 font-semibold max-w-lg mx-auto">
          {error}
        </div>
      ) : data ? (
        <>
          {/* KPI Dashboard Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue */}
            <div className="glass-card p-5 space-y-2 border-r-4 border-r-primary-500">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-surface-400">إجمالي المبيعات</span>
                <TrendingUp className="w-4 h-4 text-primary-400" />
              </div>
              <p className="text-xl font-bold text-white tracking-wide">
                {fmt(data.overall.total_revenue)}
              </p>
              <div className="text-[10px] text-surface-400">
                مجموع الإيرادات المحصلة بالفترة
              </div>
            </div>

            {/* Orders */}
            <div className="glass-card p-5 space-y-2 border-r-4 border-r-accent-500">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-surface-400">عدد الفواتير</span>
                <ShoppingBag className="w-4 h-4 text-accent-400" />
              </div>
              <p className="text-xl font-bold text-white tracking-wide">
                {fmtNum(data.overall.total_orders)} فاتورة
              </p>
              <div className="text-[10px] text-surface-400">
                حجم العمليات الإجمالي
              </div>
            </div>

            {/* Cash Payments */}
            <div className="glass-card p-5 space-y-2 border-r-4 border-r-success-500">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-surface-400">المبيعات النقدية</span>
                <Wallet className="w-4 h-4 text-success-400" />
              </div>
              <p className="text-xl font-bold text-white tracking-wide">
                {fmt(data.overall.cash_sales)}
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-surface-400">
                  <span>نسبة النقدي</span>
                  <span>
                    {data.overall.total_revenue > 0
                      ? Math.round((data.overall.cash_sales / data.overall.total_revenue) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success-500 transition-all duration-500"
                    style={{
                      width: `${
                        data.overall.total_revenue > 0
                          ? (data.overall.cash_sales / data.overall.total_revenue) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Bank Transfers */}
            <div className="glass-card p-5 space-y-2 border-r-4 border-r-primary-400">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-surface-400">التحويل البنكي</span>
                <CreditCard className="w-4 h-4 text-primary-300" />
              </div>
              <p className="text-xl font-bold text-white tracking-wide">
                {fmt(data.overall.bank_sales)}
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-surface-400">
                  <span>نسبة التحويل</span>
                  <span>
                    {data.overall.total_revenue > 0
                      ? Math.round((data.overall.bank_sales / data.overall.total_revenue) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all duration-500"
                    style={{
                      width: `${
                        data.overall.total_revenue > 0
                          ? (data.overall.bank_sales / data.overall.total_revenue) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Periodic breakdown table */}
          <div className="glass-card overflow-hidden">
            <div className="no-print p-5 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary-400" />
                تفاصيل المبيعات حسب الفترة
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-surface-400 border-b border-white/5">
                    <th className="p-4 font-semibold text-right">الفترة الزمنية</th>
                    <th className="p-4 font-semibold text-center">عدد العمليات</th>
                    <th className="p-4 font-semibold text-left">مبيعات الكاش</th>
                    <th className="p-4 font-semibold text-left">مبيعات البنك</th>
                    <th className="p-4 font-semibold text-left">إجمالي المبيعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.breakdown.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-surface-500">
                        لا توجد بيانات متاحة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    data.breakdown.map((item, i) => (
                      <tr key={i} className="hover:bg-white/2 transition-colors">
                        <td className="p-4 text-white font-medium">{item.period || '-'}</td>
                        <td className="p-4 text-center text-surface-300">{fmtNum(item.orders)}</td>
                        <td className="p-4 text-left text-success-400">{fmt(item.cash_revenue)}</td>
                        <td className="p-4 text-left text-primary-300">{fmt(item.bank_revenue)}</td>
                        <td className="p-4 text-left text-accent-400 font-bold">{fmt(item.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
