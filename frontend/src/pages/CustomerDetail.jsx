import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  Users, ChevronRight, Phone, Mail, MapPin, MessageSquare,
  TrendingUp, ShoppingBag, Receipt, Printer, Loader2,
  AlertCircle, ChevronDown, ChevronUp, DollarSign
} from 'lucide-react';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Invoice Details Expand
  const [expandedId, setExpandedId] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState({});
  const [printTargetId, setPrintTargetId] = useState(null);

  useEffect(() => {
    fetchCustomerAndHistory();
  }, [id]);

  const fetchCustomerAndHistory = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch customer details
      const customerRes = await api.get(`customers/${id}/`);
      setCustomer(customerRes.data);

      // 2. Fetch customer invoices
      const invoicesRes = await api.get(`invoices/?customer=${id}`);
      setInvoices(invoicesRes.data.results || invoicesRes.data);
    } catch (err) {
      setError('فشل في تحميل تفاصيل العميل وسجل المشتريات.');
    } finally {
      setLoading(false);
    }
  };

  const toggleInvoiceExpand = async (invId) => {
    if (expandedId === invId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(invId);
    if (!invoiceDetails[invId]) {
      try {
        const res = await api.get(`invoices/${invId}/`);
        setInvoiceDetails((prev) => ({ ...prev, [invId]: res.data }));
      } catch {}
    }
  };

  const handlePrint = (invId) => {
    setPrintTargetId(invId);
    setTimeout(() => {
      window.print();
      setPrintTargetId(null);
    }, 150);
  };

  const fmt = (v) => new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SDG', minimumFractionDigits: 0 }).format(v);
  const fmtDate = (d) => new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4 max-w-lg mx-auto text-center py-20">
        <AlertCircle className="w-12 h-12 text-danger-500 mx-auto animate-bounce" />
        <p className="text-white font-semibold">{error || 'العميل المطلوبة تفاصيله غير موجود.'}</p>
        <button
          onClick={() => navigate('/customers')}
          className="px-4 py-2 bg-surface-900 border border-white/10 hover:border-white/20 text-white rounded-xl text-xs font-bold transition"
        >
          العودة لسجل العملاء
        </button>
      </div>
    );
  }

  // Compute Metrics
  const totalSpent = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
  const invoiceCount = invoices.length;
  const avgInvoice = invoiceCount > 0 ? totalSpent / invoiceCount : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs / Header */}
      <div className="no-print flex items-center gap-2 text-xs text-surface-400">
        <button onClick={() => navigate('/customers')} className="hover:text-white transition">
          إدارة العملاء
        </button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-white font-semibold">ملف العميل: {customer.name}</span>
      </div>

      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/customers')}
            className="w-10 h-10 rounded-xl bg-surface-900 border border-white/10 hover:border-white/20 flex items-center justify-center text-white transition cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{customer.name}</h1>
            <p className="text-sm text-surface-400">ملف العميل المالي وسجل المبيعات</p>
          </div>
        </div>
      </div>

      {/* Customer summary layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1 glass-card p-6 space-y-6 self-start border-t border-white/5">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary-600/10 border border-primary-500/20 flex items-center justify-center mx-auto">
              <Users className="w-8 h-8 text-primary-400" />
            </div>
            <h2 className="text-base font-bold text-white">{customer.name}</h2>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-surface-400">
              معرف العميل #{customer.id}
            </span>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/5 text-sm text-surface-300">
            <div className="flex justify-between items-center py-1">
              <span className="text-surface-400 text-xs flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-surface-500" />
                رقم الهاتف:
              </span>
              <a href={`tel:${customer.phone}`} className="font-semibold text-white font-mono hover:underline">
                {customer.phone}
              </a>
            </div>

            {customer.location && (
              <div className="flex justify-between items-start py-1">
                <span className="text-surface-400 text-xs flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-surface-500" />
                  العنوان:
                </span>
                <span className="font-semibold text-white text-left">{customer.location}</span>
              </div>
            )}

            {customer.email && (
              <div className="flex justify-between items-center py-1">
                <span className="text-surface-400 text-xs flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-surface-500" />
                  البريد الإلكتروني:
                </span>
                <a href={`mailto:${customer.email}`} className="font-semibold text-white hover:underline truncate max-w-[150px]">
                  {customer.email}
                </a>
              </div>
            )}
          </div>

          {/* Social Quick Launch Actions */}
          <div className="no-print pt-4 border-t border-white/5 grid grid-cols-2 gap-2">
            {customer.whatsapp_number && (
              <a
                href={`https://wa.me/${customer.whatsapp_number.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                واتساب
              </a>
            )}
            <a
              href={`tel:${customer.phone}`}
              className="py-2.5 rounded-xl bg-primary-600/15 hover:bg-primary-600/25 text-primary-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Phone className="w-4 h-4" />
              اتصال هاتفي
            </a>
          </div>
        </div>

        {/* Dashboard and Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Purchase Metrics Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-5 space-y-2 border-r-4 border-r-primary-500">
              <span className="text-xs font-semibold text-surface-400 block">إجمالي المشتريات</span>
              <p className="text-xl font-bold text-white tracking-wide">{fmt(totalSpent)}</p>
              <TrendingUp className="w-4 h-4 text-primary-400 mt-1" />
            </div>

            <div className="glass-card p-5 space-y-2 border-r-4 border-r-accent-500">
              <span className="text-xs font-semibold text-surface-400 block">عدد الزيارات (الفواتير)</span>
              <p className="text-xl font-bold text-white tracking-wide">{invoiceCount} فواتير</p>
              <ShoppingBag className="w-4 h-4 text-accent-400 mt-1" />
            </div>

            <div className="glass-card p-5 space-y-2 border-r-4 border-r-success-500">
              <span className="text-xs font-semibold text-surface-400 block">متوسط قيمة الفاتورة</span>
              <p className="text-xl font-bold text-white tracking-wide">{fmt(avgInvoice)}</p>
              <Receipt className="w-4 h-4 text-success-400 mt-1" />
            </div>
          </div>

          {/* Invoices List / Timeline */}
          <div className="glass-card overflow-hidden">
            <div className="no-print p-5 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary-400" />
                سجل الفواتير والمشتريات
              </h3>
            </div>

            <div className="divide-y divide-white/5">
              {invoices.length === 0 ? (
                <p className="p-8 text-center text-sm text-surface-500">
                  لا توجد مبيعات سابقة مسجلة لهذا العميل.
                </p>
              ) : (
                invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className={`invoice-card ${printTargetId === inv.id ? 'printing-target' : ''}`}
                  >
                    <button
                      onClick={() => toggleInvoiceExpand(inv.id)}
                      className="w-full p-5 flex items-center justify-between text-right hover:bg-white/2 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-2">
                          <span>فاتورة #{inv.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                            inv.payment_method === 'bank'
                              ? 'bg-primary-600/20 text-primary-300'
                              : 'bg-surface-800 text-surface-400'
                          }`}>
                            {inv.payment_method === 'bank' ? 'تحويل بنكي' : 'نقدي'}
                          </span>
                        </p>
                        <p className="text-xs text-surface-400 mt-1">
                          {fmtDate(inv.created_at)} · البائع: {inv.cashier_name}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-base font-bold text-accent-400">{fmt(inv.total_amount)}</span>
                        {expandedId === inv.id ? (
                          <ChevronUp className="w-5 h-5 text-surface-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-surface-500" />
                        )}
                      </div>
                    </button>

                    {expandedId === inv.id && (
                      <div className="p-5 border-t border-white/5 bg-surface-900/30 animate-fade-in">
                        {invoiceDetails[inv.id] ? (
                          <>
                            {invoiceDetails[inv.id].items ? (
                              <>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-surface-400 border-b border-white/5">
                                      <th className="py-2 text-right font-medium">القطعة</th>
                                      <th className="py-2 text-center font-medium">الكمية</th>
                                      <th className="py-2 text-left font-medium">السعر</th>
                                      <th className="py-2 text-left font-medium">المجموع</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {invoiceDetails[inv.id].items.map((item, i) => (
                                      <tr key={i} className="border-b border-white/3">
                                        <td className="py-2.5 text-white">{item.spare_part_name}</td>
                                        <td className="py-2.5 text-center text-surface-300">{item.quantity}</td>
                                        <td className="py-2.5 text-left text-surface-300">{fmt(item.unit_price)}</td>
                                        <td className="py-2.5 text-left text-accent-400 font-semibold">{fmt(item.subtotal)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>

                                <div className="flex justify-end mt-4">
                                  <button
                                    onClick={() => handlePrint(inv.id)}
                                    className="no-print px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    طباعة الإيصال
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="flex justify-center py-4">
                                <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
