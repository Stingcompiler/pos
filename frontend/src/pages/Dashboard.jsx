import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  Package, TrendingUp, ShoppingCart, AlertTriangle,
  ArrowUpRight, Loader2,
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
    label: 'إيرادات اليوم',
    icon: TrendingUp,
    color: 'from-success-500 to-success-400',
    shadow: 'shadow-success-500/20',
    isCurrency: true,
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await api.get('dashboard/stats/');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ar-SA', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
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
                ? formatCurrency(stats?.[card.key] || 0)
                : (stats?.[card.key] || 0).toLocaleString('ar-SA')
              }
            </p>
            <p className="text-sm text-surface-400">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning-400" />
            تنبيهات المخزون المنخفض
          </h2>
          {stats?.low_stock_items?.length > 0 ? (
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
                {(stats?.total_invoices || 0).toLocaleString('ar-SA')}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">إجمالي الإيرادات</span>
              <span className="text-xl font-bold text-accent-400">
                {formatCurrency(stats?.total_revenue || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">إجمالي القطع</span>
              <span className="text-xl font-bold text-white">
                {(stats?.total_parts || 0).toLocaleString('ar-SA')}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">الطلبات الخارجية قيد الانتظار</span>
              <span className="text-xl font-bold text-warning-400">
                {(stats?.pending_public_orders || 0).toLocaleString('ar-SA')}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900/50 border border-white/5">
              <span className="text-surface-300">إجمالي الطلبات الخارجية</span>
              <span className="text-xl font-bold text-white">
                {(stats?.total_public_orders || 0).toLocaleString('ar-SA')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
