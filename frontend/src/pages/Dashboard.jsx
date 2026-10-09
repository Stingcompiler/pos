import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import { apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import {
  Package, TrendingUp, ShoppingCart, AlertTriangle,
  ArrowUpRight, Loader2, RotateCcw, HandCoins, Receipt,
  CreditCard, Users, ArrowLeft, AlertCircle, RefreshCw,
} from 'lucide-react';

const statCards = [
  {
    key: 'total_parts',
    label: 'إجمالي القطع',
    icon: Package,
    color: 'from-primary-600 to-primary-500',
    shadow: 'shadow-primary-600/20',
  },
  {
    key: 'low_stock_count',
    label: 'تنبيهات المخزون',
    icon: AlertTriangle,
    color: 'from-warning-500 to-warning-400',
    shadow: 'shadow-warning-500/20',
  },
  {
    key: 'today_invoices',
    label: 'فواتير اليوم',
    icon: ShoppingCart,
    color: 'from-accent-600 to-accent-400',
    shadow: 'shadow-accent-500/20',
  },
  {
    key: 'today_revenue',
    label: 'إيرادات اليوم (صافية)',
    icon: TrendingUp,
    color: 'from-success-500 to-success-400',
    shadow: 'shadow-success-500/20',
    isCurrency: true,
  },
];

// حركة المال اليوم: ما يحتاج المدير متابعته قبل إقفال اليومية.
const todayCards = [
  {
    key: 'today_collections',
    label: 'تحصيل ديون اليوم',
    hint: 'دفعات استلمتها من العملاء على حساباتهم',
    icon: HandCoins,
    tone: 'text-success-400 bg-success-500/10',
  },
  {
    key: 'today_credit_sales',
    label: 'مبيعات آجلة اليوم',
    hint: 'ما بيع اليوم ولم يُدفع بعد',
    icon: CreditCard,
    tone: 'text-warning-400 bg-warning-500/10',
  },
  {
    key: 'today_returns',
    label: 'مرتجعات اليوم',
    hint: 'قيمة ما أُرجع من فواتير',
    icon: RotateCcw,
    tone: 'text-danger-400 bg-danger-500/10',
  },
  {
    key: 'today_expenses',
    label: 'مصروفات اليوم',
    hint: 'المصروفات المسجّلة بتاريخ اليوم',
    icon: Receipt,
    tone: 'text-primary-400 bg-primary-600/10',
  },
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

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">
          مرحباً، {user?.first_name || user?.username} 👋
        </h1>
        <p className="text-surface-400">
          إليك ملخص الأعمال لهذا اليوم
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {statCards.map((card, i) => (
          <div
            key={card.key}
            className={`glass-card p-5 group hover:scale-[1.02] transition-all duration-300 ${card.shadow}`}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-surface-500 group-hover:text-white transition-colors" />
            </div>
            <p className="text-2xl font-bold text-white mb-1">
              {card.isCurrency
                ? formatCurrency(stats[card.key])
                : formatCount(stats[card.key])
              }
            </p>
            <p className="text-sm text-surface-400">{card.label}</p>
          </div>
        ))}
      </div>

      {/* حركة اليوم المالية */}
      <section aria-labelledby="today-money-heading" className="mb-8 space-y-4">
        <h2 id="today-money-heading" className="text-sm font-bold text-surface-300">حركة اليوم المالية</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {todayCards.map((card) => (
            <div key={card.key} className="glass-card p-4 flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.tone}`}>
                <card.icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-surface-400">{card.label}</p>
                <p className="text-xl font-bold text-white nums">{formatCurrency(stats[card.key])}</p>
                <p className="text-[11px] text-surface-500 mt-0.5">{card.hint}</p>
              </div>
            </div>
          ))}
        </div>

        {/* إجمالي ديون العملاء: يفتح قائمة العملاء لمتابعة المدينين */}
        <Link
          to="/customers"
          className="glass-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:border-warning-500/30 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-warning-500/10 text-warning-400 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-surface-400">إجمالي ديون العملاء المستحقة</p>
              <p className={`text-2xl font-bold nums ${outstanding > 0 ? 'text-warning-400' : 'text-white'}`}>
                {formatCurrency(outstanding)} <span className="text-xs font-medium text-surface-400">ج.س</span>
              </p>
              <p className="text-[11px] text-surface-500">مجموع أرصدة العملاء المدينين (البيع الآجل ناقص ما حُصّل)</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-primary-400 group-hover:text-primary-300">
            عرض العملاء المدينين
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </span>
        </Link>
      </section>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning-400" />
            تنبيهات المخزون المنخفض
          </h2>
          {stats.low_stock_items?.length > 0 ? (
            <div className="space-y-3">
              {stats.low_stock_items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface-900/50 border border-white/5
                    hover:border-warning-500/20 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{item.name}</p>
                    <p className="text-xs text-surface-400">{item.part_number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-warning-400">
                      {item.stock_quantity}
                    </span>
                    <span className="text-xs text-surface-500">/ {item.min_stock_alert}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-surface-500 text-sm text-center py-8">
              لا توجد تنبيهات حالياً 🎉
            </p>
          )}
        </div>

        {/* Quick Stats */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent-400" />
            الإحصائيات العامة
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">إجمالي الفواتير</span>
              <span className="text-xl font-bold text-white">
                {formatCount(stats.total_invoices)}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">إجمالي الإيرادات</span>
              <span className="text-xl font-bold text-accent-400">
                {formatCurrency(stats.total_revenue)}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">إجمالي القطع</span>
              <span className="text-xl font-bold text-white">
                {formatCount(stats.total_parts)}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">الطلبات الخارجية قيد الانتظار</span>
              <span className="text-xl font-bold text-warning-400">
                {formatCount(stats.pending_public_orders)}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">إجمالي الطلبات الخارجية</span>
              <span className="text-xl font-bold text-white">
                {formatCount(stats.total_public_orders)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
