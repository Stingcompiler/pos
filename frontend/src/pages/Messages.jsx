import { useState, useEffect } from 'react';
import api from '../api/axios';
import { Mail, Calendar, Phone, User, Loader2, AlertCircle, Eye, RefreshCw } from 'lucide-react';

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMsg, setSelectedMsg] = useState(null);

  const fetchMessages = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('contact-messages/');
      setMessages(res.data.results || res.data);
    } catch (err) {
      setError('حدث خطأ أثناء تحميل الرسائل الواردة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">رسائل التواصل</h1>
          <p className="text-sm text-surface-400 mt-1">عرض ومتابعة الرسائل الواردة من الصفحة الرئيسية</p>
        </div>
        <button
          onClick={fetchMessages}
          disabled={loading}
          className="flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-surface-900 border border-white/10 text-white text-sm hover:bg-surface-800 transition-colors w-full sm:w-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="glass-card py-20 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
          <p className="text-surface-400 text-sm">جاري تحميل رسائل التواصل...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="glass-card py-20 flex flex-col items-center justify-center text-center">
          <Mail className="w-12 h-12 text-surface-600 opacity-30 mb-4 animate-bounce" />
          <h3 className="text-lg font-bold text-white">لا توجد رسائل جديدة</h3>
          <p className="text-sm text-surface-400 mt-1">ستظهر هنا أي رسائل يرسلها العملاء من النموذج العام.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View (md and above) */}
          <div className="hidden md:block glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-surface-900/30">
                    <th className="px-6 py-4 text-right text-surface-400 font-medium">المرسل</th>
                    <th className="px-6 py-4 text-right text-surface-400 font-medium">البريد الإلكتروني</th>
                    <th className="px-6 py-4 text-right text-surface-400 font-medium">الهاتف</th>
                    <th className="px-6 py-4 text-right text-surface-400 font-medium">محتوى الرسالة</th>
                    <th className="px-6 py-4 text-right text-surface-400 font-medium">تاريخ الإرسال</th>
                    <th className="px-6 py-4 text-center text-surface-400 font-medium">عرض</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr key={msg.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                      <td className="px-6 py-4 text-white font-medium">{msg.name}</td>
                      <td className="px-6 py-4 text-surface-300 select-all">{msg.email}</td>
                      <td className="px-6 py-4 text-surface-300" dir="ltr">{msg.phone || '-'}</td>
                      <td className="px-6 py-4 text-surface-400 max-w-xs truncate">{msg.message}</td>
                      <td className="px-6 py-4 text-surface-400 text-xs">{formatDate(msg.created_at)}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedMsg(msg)}
                          className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Stacked Card View (hidden md) */}
          <div className="md:hidden space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="glass-card p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary-400" />
                    <span className="font-semibold text-white text-sm">{msg.name}</span>
                  </div>
                  <span className="text-[10px] text-surface-500">{formatDate(msg.created_at)}</span>
                </div>
                <div className="space-y-1.5 text-xs text-surface-300">
                  <p className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-surface-400" />
                    <span className="truncate select-all">{msg.email}</span>
                  </p>
                  {msg.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-surface-400" />
                      <span dir="ltr">{msg.phone}</span>
                    </p>
                  )}
                </div>
                <p className="text-xs text-surface-400 line-clamp-3 bg-surface-950/40 p-2.5 rounded-lg border border-white/3">
                  {msg.message}
                </p>
                <button
                  onClick={() => setSelectedMsg(msg)}
                  className="w-full flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary-600/10 text-primary-400 text-xs font-semibold hover:bg-primary-600/20 transition-colors border border-primary-500/10"
                >
                  <Eye className="w-4 h-4" />
                  <span>عرض تفاصيل الرسالة</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Message Modal Detail View */}
      {selectedMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg glass-card p-6 space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <div className="w-10 h-10 rounded-xl bg-primary-600/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">تفاصيل رسالة التواصل</h3>
                <p className="text-xs text-surface-400 mt-0.5">{formatDate(selectedMsg.created_at)}</p>
              </div>
            </div>

            {/* Sender Meta Card */}
            <div className="p-4 rounded-xl bg-surface-950/60 border border-white/5 space-y-2 text-sm text-surface-300">
              <div className="flex items-center gap-2">
                <span className="text-surface-400 font-semibold w-24">المرسل:</span>
                <span className="text-white font-medium">{selectedMsg.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-surface-400 font-semibold w-24">البريد:</span>
                <span className="select-all text-primary-400">{selectedMsg.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-surface-400 font-semibold w-24">الهاتف:</span>
                <span dir="ltr">{selectedMsg.phone || '-'}</span>
              </div>
            </div>

            {/* Message Body */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-surface-400">محتوى الرسالة:</span>
              <p className="p-4 rounded-xl bg-surface-950/80 border border-white/5 text-sm text-surface-200 leading-relaxed whitespace-pre-wrap select-text">
                {selectedMsg.message}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedMsg(null)}
                className="w-full sm:w-auto h-10 px-6 rounded-xl bg-surface-800 text-surface-300 text-sm hover:bg-surface-700 transition-colors font-medium"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
