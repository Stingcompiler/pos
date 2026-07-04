import { useState, useEffect } from 'react';
import api from '../api/axios';
import {
  ShoppingCart, Clock, CheckCircle, XCircle, Phone, MessageSquare,
  ChevronDown, ChevronUp, Loader2, Calendar, User, DollarSign, ExternalLink
} from 'lucide-react';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('public-orders/');
      // Django returns order records
      setOrders(res.data.results || res.data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    setErrorMessage('');
    try {
      const res = await api.patch(`public-orders/${orderId}/`, { status: newStatus });
      
      // Update local state
      setOrders((prev) =>
        prev.map((ord) => (ord.id === orderId ? { ...ord, status: newStatus } : ord))
      );
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      const errMsg = err.response?.data?.non_field_errors?.[0] || 
                     err.response?.data?.status?.[0] || 
                     'عذراً، فشل تحديث حالة الطلب. قد يكون السبب نقص كميات المخزون المتوفرة.';
      setErrorMessage(errMsg);
      alert(errMsg);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ar-SA', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val) + ' ج.س';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-500/10 text-success-400 border border-success-500/20">
            <CheckCircle className="w-3.5 h-3.5" />
            تم التأكيد
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger-500/10 text-danger-400 border border-danger-500/20">
            <XCircle className="w-3.5 h-3.5" />
            ملغي
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning-500/10 text-warning-400 border border-warning-500/20">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            قيد الانتظار
          </span>
        );
    }
  };

  // WhatsApp contact helper
  const getWhatsAppLink = (phone, orderId, name) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      `السلام عليكم يا ${name}، بخصوص طلبك رقم #${orderId} من موقعنا الالكتروني لقطع الغيار...`
    );
    return `https://wa.me/${cleanPhone}?text=${message}`;
  };

  // Stats
  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const confirmedOrders = orders.filter((o) => o.status === 'confirmed');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');
  const totalRevenue = confirmedOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8 text-right font-sans pb-12" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">إدارة الطلبات الخارجية</h1>
          <p className="text-surface-400 text-xs md:text-sm">
            مراجعة وتأكيد طلبات الشراء الواردة من العملاء عبر الموقع الإلكتروني
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-card p-5 flex items-center justify-between border border-white/5">
          <div>
            <p className="text-2xl font-bold text-white mb-1">{pendingOrders.length}</p>
            <p className="text-xs text-surface-400">طلبات قيد الانتظار</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-warning-500/10 border border-warning-500/20 flex items-center justify-center text-warning-400">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="glass-card p-5 flex items-center justify-between border border-white/5">
          <div>
            <p className="text-2xl font-bold text-white mb-1">{confirmedOrders.length}</p>
            <p className="text-xs text-surface-400">طلبات مؤكدة</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success-500/10 border border-success-500/20 flex items-center justify-center text-success-400">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-5 flex items-center justify-between border border-white/5">
          <div>
            <p className="text-2xl font-bold text-white mb-1">{cancelledOrders.length}</p>
            <p className="text-xs text-surface-400">طلبات ملغاة</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-danger-500/10 border border-danger-500/20 flex items-center justify-center text-danger-400">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-5 flex items-center justify-between border border-white/5">
          <div>
            <p className="text-lg font-bold text-accent-400 truncate mb-1">
              {formatCurrency(totalRevenue)}
            </p>
            <p className="text-xs text-surface-400">إجمالي إيرادات المؤكدة</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center text-accent-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Table card */}
      <div className="glass-card border border-white/5 overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-surface-900/40">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary-400" />
            سجل طلبات الزبائن
          </h2>
          <span className="text-[10px] text-surface-450 font-mono">العدد الإجمالي: {orders.length}</span>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-16 text-surface-500 text-sm">
            لا توجد طلبات خارجية واردة حالياً 📥
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-surface-900/20 text-surface-400 text-xs font-semibold">
                  <th className="p-4">رقم الطلب</th>
                  <th className="p-4">اسم الزبون</th>
                  <th className="p-4">العنوان / المنطقة</th>
                  <th className="p-4">رقم الهاتف</th>
                  <th className="p-4">تاريخ الطلب</th>
                  <th className="p-4">إجمالي القيمة</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-surface-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-mono font-bold text-primary-400">#{order.id}</td>
                    <td className="p-4 font-bold text-white">{order.customer_name}</td>
                    <td className="p-4 text-xs text-surface-300">{order.location || 'غير محدد'}</td>
                    <td className="p-4 font-mono">{order.phone_number}</td>
                    <td className="p-4 text-xs text-surface-400">
                      {new Date(order.created_at).toLocaleString('ar-SA')}
                    </td>
                    <td className="p-4 font-bold text-accent-400">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="p-4">{getStatusBadge(order.status)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        {/* Details Toggle */}
                        <button
                          onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                          className="px-3 py-1.5 rounded-lg bg-surface-800 text-white text-xs font-semibold hover:bg-surface-700 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          تفاصيل المنتجات
                          {selectedOrder?.id === order.id ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Status Quick Action Dropdown */}
                        <select
                          disabled={updatingId === order.id}
                          value={order.status}
                          onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                          className="px-2 py-1.5 rounded-lg bg-surface-800 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-primary-500 cursor-pointer disabled:opacity-50"
                        >
                          <option value="pending">قيد الانتظار</option>
                          <option value="confirmed">تأكيد الطلب</option>
                          <option value="cancelled">إلغاء الطلب</option>
                        </select>

                        {/* WhatsApp CTA */}
                        <a
                          href={getWhatsAppLink(order.phone_number, order.id, order.customer_name)}
                          target="_blank"
                          rel="noreferrer"
                          className="w-8 h-8 rounded-lg bg-success-500/10 border border-success-500/20 text-success-400 flex items-center justify-center hover:bg-success-500 hover:text-white transition-all shadow-sm"
                          title="تواصل واتساب"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Accordion / Details display */}
      {selectedOrder && (
        <div className="glass-card p-6 border border-primary-500/20 bg-surface-900/50 animate-slide-up space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary-400" />
              تفاصيل طلب الشراء رقم #{selectedOrder.id} للعميل {selectedOrder.customer_name}
            </h3>
            <button
              onClick={() => setSelectedOrder(null)}
              className="text-xs text-surface-400 hover:text-white cursor-pointer"
            >
              إغلاق التفاصيل
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-surface-300">
            <div className="space-y-1 bg-surface-950/40 p-4 rounded-xl border border-white/5">
              <span className="text-[10px] text-surface-500 font-bold block">معلومات العميل</span>
              <p className="font-bold text-white">{selectedOrder.customer_name}</p>
              <p className="font-mono text-xs">{selectedOrder.phone_number}</p>
              <p className="text-xs text-surface-400">{selectedOrder.email || 'بلا بريد الكتروني'}</p>
              <p className="text-xs text-surface-400">المنطقة: {selectedOrder.location || 'غير محدد'}</p>
            </div>
            
            <div className="space-y-1 bg-surface-950/40 p-4 rounded-xl border border-white/5">
              <span className="text-[10px] text-surface-500 font-bold block">تاريخ الإرسال والقيمة</span>
              <p className="text-xs">{new Date(selectedOrder.created_at).toLocaleString('ar-SA')}</p>
              <p className="font-extrabold text-accent-400 text-base mt-1">
                {formatCurrency(selectedOrder.total_amount)}
              </p>
            </div>

            <div className="space-y-1 bg-surface-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-surface-500 font-bold block">حالة الطلب الحالية</span>
                <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-surface-400">تغيير سريع:</span>
                <select
                  disabled={updatingId === selectedOrder.id}
                  value={selectedOrder.status}
                  onChange={(e) => handleUpdateStatus(selectedOrder.id, e.target.value)}
                  className="px-2 py-1 bg-surface-900 border border-white/10 text-white text-xs rounded outline-none cursor-pointer"
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="confirmed">تأكيد الطلب</option>
                  <option value="cancelled">إلغاء الطلب</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items Sub-table */}
          <div className="border border-white/5 rounded-xl overflow-hidden mt-4">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-surface-950/60 border-b border-white/5 text-[11px] text-surface-450 font-bold">
                  <th className="p-3">اسم قطعة الغيار</th>
                  <th className="p-3">رقم القطعة</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3">سعر الوحدة</th>
                  <th className="p-3">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-surface-200 bg-surface-950/10">
                {selectedOrder.items.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.01]">
                    <td className="p-3 font-bold text-white">{item.spare_part_name}</td>
                    <td className="p-3 font-mono text-surface-400">{item.part_number}</td>
                    <td className="p-3 text-center font-bold text-white">{item.quantity}</td>
                    <td className="p-3 font-mono">{formatCurrency(item.unit_price)}</td>
                    <td className="p-3 font-bold text-accent-400 font-mono">
                      {formatCurrency(Number(item.unit_price) * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
