import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import {
  Truck, Plus, Search, Phone, Mail, MapPin, User,
  Loader2, AlertCircle, Eye, RefreshCw
} from 'lucide-react';

export default function SuppliersList() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/suppliers/');
      setSuppliers(res.data.results || res.data);
    } catch (err) {
      console.error(err);
      setError('فشل في تحميل قائمة الموردين. الرجاء المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!companyName || !phoneNumber) {
      setError('اسم الشركة ورقم الهاتف مطلوبان.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const payload = {
        company_name: companyName,
        contact_person: contactPerson || null,
        phone_number: phoneNumber,
        email: email || null,
        address: address || null,
        is_active: true
      };

      const res = await api.post('/suppliers/', payload);
      setSuppliers([res.data, ...suppliers]);
      
      // Reset Form & Close Modal
      setCompanyName('');
      setContactPerson('');
      setPhoneNumber('');
      setEmail('');
      setAddress('');
      setShowModal(false);
    } catch (err) {
      console.error(err);
      setError('فشل تسجيل المورد الجديد. الرجاء التحقق من البيانات.');
    } finally {
      setSubmitting(false);
    }
  };

  // Live filter
  const filteredSuppliers = suppliers.filter(sup => {
    const q = searchQuery.toLowerCase();
    return (
      sup.company_name.toLowerCase().includes(q) ||
      (sup.contact_person && sup.contact_person.toLowerCase().includes(q)) ||
      sup.phone_number.includes(q)
    );
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white font-cairo flex items-center gap-2">
            <Truck className="w-7 h-7 text-primary-400" />
            <span>إدارة الموردين</span>
          </h1>
          <p className="text-xs text-surface-400 mt-1">
            إدارة شركات التوريد، تسجيل صفقات الشراء، ومتابعة المخزون المستلم.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={fetchSuppliers}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white transition"
            title="تحديث البيانات"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all hover:shadow-lg hover:shadow-primary-600/20 text-sm w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مورد جديد</span>
          </button>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute right-3.5 top-3 w-4 h-4 text-surface-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث باسم الشركة، الشخص المسؤول، أو رقم الهاتف..."
            className="w-full pl-4 pr-10 py-2.5 bg-surface-950/40 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none transition-all"
          />
        </div>
        <div className="text-xs text-surface-400 font-mono">
          إجمالي المسجلين: {filteredSuppliers.length} مورد
        </div>
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
          <p className="text-sm text-surface-400">جاري تحميل سجلات الموردين...</p>
        </div>
      ) : error ? (
        <div className="glass-card p-6 border-danger-500/10 flex flex-col items-center justify-center text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-danger-500 animate-pulse" />
          <h3 className="text-white font-bold">حدث خطأ أثناء تحميل البيانات</h3>
          <p className="text-sm text-surface-400 max-w-md">{error}</p>
          <button
            onClick={fetchSuppliers}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs transition"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Truck className="w-16 h-16 text-surface-700 animate-bounce" />
          <h3 className="text-white font-bold">لا يوجد موردون مسجلون</h3>
          <p className="text-sm text-surface-500 max-w-sm">
            قم بإضافة المورد الأول للبدء بتسجيل صفقات توريد قطع الغيار.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSuppliers.map((sup) => (
            <div
              key={sup.id}
              className="glass-card p-5 hover:scale-[1.01] hover:border-primary-500/20 transition-all duration-200 flex flex-col justify-between space-y-4 border-t border-white/5"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-600/10 border border-primary-500/20 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-primary-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">
                        {sup.company_name}
                      </h3>
                      {sup.contact_person && (
                        <span className="text-xs text-surface-400 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-surface-500" />
                          <span>الشخص المسؤول: {sup.contact_person}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${sup.is_active ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-surface-500/10 text-surface-400 border border-white/5'}`}>
                    {sup.is_active ? 'نشط' : 'غير نشط'}
                  </span>
                </div>

                <hr className="border-white/5" />

                <div className="space-y-2 text-xs text-surface-300">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-surface-500" />
                    <a href={`tel:${sup.phone_number}`} className="hover:text-primary-400 font-mono">
                      {sup.phone_number}
                    </a>
                  </div>
                  {sup.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-surface-500" />
                      <a href={`mailto:${sup.email}`} className="hover:text-primary-400 font-mono">
                        {sup.email}
                      </a>
                    </div>
                  )}
                  {sup.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-surface-500 mt-0.5 shrink-0" />
                      <span className="leading-relaxed">{sup.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <Link
                  to={`/dashboard/suppliers/${sup.id}`}
                  className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 hover:text-primary-400 text-surface-200 py-2 rounded-xl text-xs font-bold transition-all border border-white/5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>عرض التفاصيل والتعاملات</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add New Supplier Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-400" />
                <span>إضافة مورد جديد</span>
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-surface-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    اسم الشركة / المورد <span className="text-primary-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="مثال: شركة المحركات المحدودة"
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    الشخص المسؤول (اختياري)
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="مثال: أ. محمد أحمد"
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    رقم الهاتف <span className="text-primary-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="مثال: 0912345678"
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all text-left font-mono"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    البريد الإلكتروني (اختياري)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@domain.com"
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all text-left font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-surface-300 font-bold block">
                  عنوان المستودع / المقر (اختياري)
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="مثال: الخرطوم، السوق المحلي، عمارة المحرك"
                  rows={2}
                  className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all"
                />
              </div>

              {error && (
                <div className="p-3 bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white rounded-xl text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:bg-primary-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>جاري التسجيل...</span>
                    </>
                  ) : (
                    <span>تأكيد الإضافة</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
