import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  Users, Search, Plus, Phone, MapPin, Mail, MessageSquare,
  Edit2, Trash2, Loader2, AlertCircle, UserCheck
} from 'lucide-react';

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add'); // 'add' | 'edit'
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('customers/');
      setCustomers(res.data.results || res.data);
    } catch (err) {
      setError('فشل في تحميل سجلات العملاء. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setModalType('add');
    setSelectedCustomer(null);
    setName('');
    setPhone('');
    setLocation('');
    setEmail('');
    setWhatsapp('');
    setShowModal(true);
  };

  const handleOpenEditModal = (cust) => {
    setModalType('edit');
    setSelectedCustomer(cust);
    setName(cust.name);
    setPhone(cust.phone);
    setLocation(cust.location || '');
    setEmail(cust.email || '');
    setWhatsapp(cust.whatsapp_number || '');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name,
      phone,
      location: location || '',
      email: email || '',
      whatsapp_number: whatsapp || '',
    };

    try {
      if (modalType === 'add') {
        const res = await api.post('customers/', payload);
        setCustomers((prev) => [...prev, res.data]);
      } else {
        const res = await api.put(`customers/${selectedCustomer.id}/`, payload);
        setCustomers((prev) =>
          prev.map((c) => (c.id === selectedCustomer.id ? res.data : c))
        );
      }
      setShowModal(false);
    } catch (err) {
      alert('حدث خطأ أثناء حفظ بيانات العميل. يرجى مراجعة الحقول.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      await api.delete(`customers/${id}/`);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert('فشل في حذف العميل. قد يكون مرتبطاً بفواتير مبيعات حالية.');
    }
  };

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery) ||
    (c.location && c.location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-500" />
            إدارة العملاء
          </h1>
          <p className="text-sm text-surface-400">سجل وملفات عملاء شركة دال موتورز</p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition flex items-center gap-2 justify-center shadow-lg shadow-primary-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          إضافة عميل جديد
        </button>
      </div>

      {/* Filter and Search */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="ابحث بالاسم، رقم الهاتف أو الموقع..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 transition placeholder-surface-500 h-11"
        />
        <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-surface-400" />
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center text-danger-400 font-semibold max-w-lg mx-auto">
          {error}
        </div>
      ) : (
        <>
          {filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-surface-500 max-w-md mx-auto text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-surface-600 animate-pulse" />
              <p className="text-sm">لا يوجد عملاء مطابقون لبحثك حالياً.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCustomers.map((cust) => (
                <div
                  key={cust.id}
                  className="glass-card p-5 hover:scale-[1.01] transition-all duration-200 flex flex-col justify-between space-y-4 border-t border-white/5"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div
                        onClick={() => navigate(`/customers/${cust.id}`)}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-full bg-primary-600/10 border border-primary-500/20 flex items-center justify-center group-hover:bg-primary-600/20 transition-all duration-200 animate-pulse-subtle">
                          <UserCheck className="w-5 h-5 text-primary-400 group-hover:text-primary-300 transition-colors" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight group-hover:text-primary-400 transition-colors">
                            {cust.name}
                          </h3>
                          <span className="text-[10px] text-surface-500">معرف العميل #{cust.id}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(cust)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white transition"
                          title="تعديل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cust.id)}
                          className="p-1.5 rounded-lg bg-danger-600/10 hover:bg-danger-600/20 text-danger-400 hover:text-danger-300 transition"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-surface-300 pt-2 border-t border-white/3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-surface-500" />
                        <a href={`tel:${cust.phone}`} className="hover:text-primary-400 font-mono">
                          {cust.phone}
                        </a>
                      </div>

                      {cust.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-surface-500" />
                          <span>{cust.location}</span>
                        </div>
                      )}

                      {cust.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-surface-500" />
                          <a href={`mailto:${cust.email}`} className="hover:text-primary-400">
                            {cust.email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contact Links */}
                  <div className="pt-3 border-t border-white/5 flex gap-2 justify-end">
                    {cust.whatsapp_number && (
                      <a
                        href={`https://wa.me/${cust.whatsapp_number.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        واتساب
                      </a>
                    )}
                    <a
                      href={`tel:${cust.phone}`}
                      className="px-3 py-1.5 rounded-lg bg-primary-600/15 hover:bg-primary-600/25 text-primary-400 text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      اتصال مباشر
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add / Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-400" />
                {modalType === 'add' ? 'إضافة عميل جديد' : 'تعديل بيانات العميل'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-surface-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="الاسم الكامل"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">رقم الهاتف *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="رقم الهاتف الأساسي"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">الموقع (العنوان)</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="العنوان أو المدينة"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="example@domain.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">رقم الواتساب</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="رقم الواتساب الكامل"
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-white/5 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-semibold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition shadow-lg shadow-primary-600/20"
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
