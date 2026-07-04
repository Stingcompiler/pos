import { useState, useEffect } from 'react';
import api from '../api/axios';
import { FileText, ChevronDown, ChevronUp, Loader2, Receipt, Printer } from 'lucide-react';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const [printTargetId, setPrintTargetId] = useState(null);

  useEffect(() => { loadInvoices(); }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.get('invoices/');
      setInvoices(res.data.results || res.data);
    } catch {} finally { setLoading(false); }
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!details[id]) {
      try {
        const res = await api.get(`invoices/${id}/`);
        setDetails((prev) => ({ ...prev, [id]: res.data }));
      } catch {}
    }
  };

  const handlePrint = (id) => {
    setPrintTargetId(id);
    setTimeout(() => {
      window.print();
      setPrintTargetId(null);
    }, 150);
  };

  const fmt = (v) => new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2 }).format(v);
  const fmtDate = (d) => new Intl.DateTimeFormat('ar-SA', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(d));

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success-500 to-success-400 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">الفواتير</h1>
          <p className="text-sm text-surface-400">سجل المبيعات</p>
        </div>
      </div>
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-surface-500">
            <Receipt className="w-12 h-12 mb-3 opacity-30" /><p>لا توجد فواتير</p>
          </div>
        ) : invoices.map((inv) => (
          <div key={inv.id} className={`glass-card overflow-hidden invoice-card ${printTargetId === inv.id ? 'printing-target' : ''}`}>
            <button onClick={() => toggleExpand(inv.id)} className="w-full p-5 flex items-center justify-between text-right hover:bg-white/2 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-600/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-400">#{inv.id}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">فاتورة #{inv.id}</p>
                  <p className="text-xs text-surface-400">
                    {fmtDate(inv.created_at)} · {inv.cashier_name}
                    {inv.customer_name ? ` · العميل: ${inv.customer_name}` : ''} · {' '}
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${inv.payment_method === 'bank' ? 'bg-primary-600/20 text-primary-300' : 'bg-surface-800 text-surface-400'}`}>
                      {inv.payment_method === 'bank' ? 'تحويل بنكي' : 'نقدي'}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-lg font-bold text-accent-400">{fmt(inv.total_amount)}</p>
                {expandedId === inv.id ? <ChevronUp className="w-5 h-5 text-surface-400" /> : <ChevronDown className="w-5 h-5 text-surface-400" />}
              </div>
            </button>
            {expandedId === inv.id && (
              <div className="border-t border-white/5 p-5 animate-fade-in">
                {details[inv.id] ? (
                  <>
                    {details[inv.id].customer_name && (
                      <div className="mb-4 p-4 rounded-xl bg-surface-900/50 border border-white/5 text-sm animate-slide-up flex gap-6">
                        <div>
                          <span className="block text-xs text-surface-400 mb-0.5">اسم العميل</span>
                          <span className="font-semibold text-white">{details[inv.id].customer_name}</span>
                        </div>
                      </div>
                    )}
                    {details[inv.id].payment_method === 'bank' && (
                      <div className="mb-4 p-4 rounded-xl bg-primary-600/10 border border-primary-500/20 grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm animate-slide-up">
                        <div>
                          <span className="block text-xs text-surface-400 mb-0.5">طريقة الدفع</span>
                          <span className="font-semibold text-white">تحويل بنكي ({details[inv.id].currency || 'SDG'})</span>
                        </div>
                        <div>
                          <span className="block text-xs text-surface-400 mb-0.5">اسم البنك</span>
                          <span className="font-semibold text-primary-300">{details[inv.id].bank_name || '-'}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-surface-400 mb-0.5">رقم الإشعار</span>
                          <span className="font-mono text-accent-400 font-semibold">{details[inv.id].reference_id || '-'}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-surface-400 mb-0.5">رقم حساب المرسل</span>
                          <span className="font-mono text-surface-300">{details[inv.id].sender_account_number || '-'}</span>
                        </div>
                      </div>
                    )}
                    {details[inv.id].items ? (
                      <>
                        <table className="w-full text-sm">
                          <thead><tr className="text-surface-400"><th className="py-2 text-right font-medium">القطعة</th><th className="py-2 text-center font-medium">الكمية</th><th className="py-2 text-left font-medium">السعر</th><th className="py-2 text-left font-medium">المجموع</th></tr></thead>
                          <tbody>{details[inv.id].items.map((item, i) => (
                            <tr key={i} className="border-t border-white/3"><td className="py-2.5 text-white">{item.spare_part_name}</td><td className="py-2.5 text-center text-surface-300">{item.quantity}</td><td className="py-2.5 text-left text-surface-300">{fmt(item.unit_price)}</td><td className="py-2.5 text-left text-accent-400 font-semibold">{fmt(item.subtotal)}</td></tr>
                          ))}</tbody>
                        </table>
                        <div className="flex justify-end mt-4">
                          <button
                            onClick={() => handlePrint(inv.id)}
                            className="no-print px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                            طباعة الفاتورة
                          </button>
                        </div>
                      </>
                    ) : <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-primary-500 animate-spin" /></div>}
                  </>
                ) : <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-primary-500 animate-spin" /></div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
