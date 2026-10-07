import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  Users, Search, Plus, Phone, MapPin, Mail, MessageSquare,
  Edit2, Trash2, Loader2, AlertCircle, UserCheck, RefreshCw, X, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import Pagination from '../components/sales/Pagination';
import ModalShell from '../components/sales/ModalShell';
import useDebouncedValue from '../components/sales/useDebouncedValue';
import {
  CUSTOMER_TYPE_OPTIONS, CUSTOMER_TYPE_STYLES, cleanParams, isPrivilegedRole, normalizeList, toCents,
} from '../components/sales/salesUtils';

const PAGE_SIZE = 24;

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'debtors', label: 'المدينون' },
  ...CUSTOMER_TYPE_OPTIONS.map((type) => ({ key: type.value, label: type.label })),
];

const EMPTY_FORM = {
  name: '', phone: '', location: '', email: '', whatsapp: '',
  customer_type: 'retail', discount_percent: '', credit_limit: '0',
};

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10';

function filterParams(filter) {
  if (filter === 'debtors') return { has_balance: 1 };
  if (filter === 'all') return {};
  return { customer_type: filter };
}

function balanceTone(balance) {
  const cents = toCents(balance);
  if (cents > 0) return 'text-danger-400';
  if (cents < 0) return 'text-success-400';
  return 'text-surface-300';
}

export default function Customers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const privileged = isPrivilegedRole(user?.role);
  const isManager = user?.role === 'manager';

  // ─── البحث والفلاتر (من الخادم) ───
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const [filter, setFilter] = useState('all');
  const filterKey = JSON.stringify([debouncedSearch, filter]);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;

  const [list, setList] = useState({ count: 0, results: [] });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const requestId = useRef(0);

  const fetchCustomers = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('customers/', {
        params: cleanParams({ page, page_size: PAGE_SIZE, search: debouncedSearch, ...filterParams(filter) }),
      });
      if (current !== requestId.current) return;
      setList(normalizeList(res.data));
      setLoaded(true);
    } catch (err) {
      if (current !== requestId.current) return;
      // حذف آخر عميل في الصفحة الأخيرة يجعلها غير موجودة: نعود للأولى.
      if (err.response?.status === 404 && page > 1) {
        setPageState({ key: filterKey, page: 1 });
        return;
      }
      setError(apiErrorMessage(err, 'فشل في تحميل سجلات العملاء. يرجى المحاولة مرة أخرى.'));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [page, debouncedSearch, filter, filterKey]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // ─── نافذة الإضافة/التعديل ───
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add'); // 'add' | 'edit'
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const closeModal = useCallback(() => setShowModal(false), []);

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleOpenAddModal = () => {
    setModalType('add');
    setSelectedCustomer(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (cust) => {
    setModalType('edit');
    setSelectedCustomer(cust);
    setForm({
      name: cust.name,
      phone: cust.phone,
      location: cust.location || '',
      email: cust.email || '',
      whatsapp: cust.whatsapp_number || '',
      customer_type: cust.customer_type || 'retail',
      discount_percent: cust.discount_percent ?? '',
      credit_limit: cust.credit_limit ?? '0',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      phone: form.phone,
      location: form.location || '',
      email: form.email || '',
      whatsapp_number: form.whatsapp || '',
    };
    // الخصم وحد الائتمان للمدير والمشرف فقط (الخادم يتجاهلها للموظف أصلاً).
    if (privileged) {
      payload.customer_type = form.customer_type;
      payload.discount_percent = form.discount_percent === '' ? null : form.discount_percent;
      payload.credit_limit = form.credit_limit === '' ? '0' : form.credit_limit;
    }

    setSaving(true);
    setFormError('');
    try {
      if (modalType === 'add') {
        const res = await api.post('customers/', payload);
        setNotice({ type: 'success', text: `تمت إضافة العميل ${res.data.name}.` });
        // القائمة مرتبة ومقسّمة من الخادم: نعيد جلبها بدل إلحاق العميل بآخر الصفحة.
        fetchCustomers();
      } else {
        const res = await api.put(`customers/${selectedCustomer.id}/`, payload);
        setList((prev) => ({
          ...prev,
          results: prev.results.map((c) => (c.id === selectedCustomer.id ? res.data : c)),
        }));
      }
      setShowModal(false);
    } catch (err) {
      setFormError(apiErrorMessage(err, 'حدث خطأ أثناء حفظ بيانات العميل. يرجى مراجعة الحقول.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cust) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف العميل "${cust.name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
      await api.delete(`customers/${cust.id}/`);
      setNotice({ type: 'success', text: `تم حذف العميل ${cust.name}.` });
      fetchCustomers();
    } catch (err) {
      setNotice({ type: 'error', text: apiErrorMessage(err, 'فشل في حذف العميل. قد يكون مرتبطاً بفواتير مبيعات حالية.') });
    }
  };

  const hasFilters = Boolean(searchQuery.trim()) || filter !== 'all';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-500" aria-hidden="true" />
            إدارة العملاء
          </h1>
          <p className="text-sm text-surface-400 flex items-center gap-2">
            سجل وملفات عملاء شركة دال موتورز{loaded ? ` · ${list.count} عميل` : ''}
            {loading && loaded && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-400" aria-label="جارٍ التحديث" />}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="px-4 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition flex items-center gap-2 justify-center shadow-lg shadow-primary-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          إضافة عميل جديد
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative w-full max-w-md">
          <label htmlFor="customer-search" className="sr-only">بحث في العملاء</label>
          <input
            id="customer-search"
            type="search"
            placeholder="ابحث بالاسم، رقم الهاتف، الواتساب أو الموقع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 transition placeholder-surface-500 h-11"
          />
          <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-surface-400" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية العملاء">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filter === option.key
                  ? option.key === 'debtors' ? 'bg-danger-600 text-white' : 'bg-primary-600 text-white'
                  : 'bg-white/5 text-surface-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {notice.text && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-xl text-sm flex items-center justify-between gap-3 border ${
            notice.type === 'error'
              ? 'bg-danger-500/10 border-danger-500/20 text-danger-400'
              : 'bg-success-600/10 border-success-500/20 text-success-400'
          }`}
        >
          <span className="flex items-center gap-2">
            {notice.type === 'error'
              ? <AlertCircle className="w-4 h-4" aria-hidden="true" />
              : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
            {notice.text}
          </span>
          <button
            type="button"
            onClick={() => setNotice({ type: '', text: '' })}
            aria-label="إخفاء الرسالة"
            className="p-1 rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {error ? (
        <div role="alert" className="glass-card p-6 text-center max-w-lg mx-auto space-y-3">
          <p className="text-danger-400 font-semibold">{error}</p>
          <button
            type="button"
            onClick={fetchCustomers}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-200 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      ) : !loaded ? (
        <div className="flex justify-center py-24" role="status" aria-label="جارٍ تحميل العملاء">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : list.results.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-surface-500 max-w-md mx-auto text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-surface-600" aria-hidden="true" />
          <p className="text-sm">
            {hasFilters
              ? filter === 'debtors' && !searchQuery.trim()
                ? 'لا يوجد عملاء عليهم أرصدة مستحقة.'
                : 'لا يوجد عملاء مطابقون لبحثك حالياً.'
              : 'لا يوجد عملاء مسجّلون بعد.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {list.results.map((cust) => {
              const discount = Number(cust.effective_discount_percent || 0);
              const hasLimit = toCents(cust.credit_limit) > 0;
              return (
                <div
                  key={cust.id}
                  className="glass-card p-5 hover:scale-[1.01] transition-all duration-200 flex flex-col justify-between space-y-4 border-t border-white/5"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/customers/${cust.id}`)}
                        className="flex items-center gap-3 cursor-pointer group text-right min-w-0"
                      >
                        <div className="w-10 h-10 shrink-0 rounded-full bg-primary-600/10 border border-primary-500/20 flex items-center justify-center group-hover:bg-primary-600/20 transition-all duration-200">
                          <UserCheck className="w-5 h-5 text-primary-400 group-hover:text-primary-300 transition-colors" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-white leading-tight group-hover:text-primary-400 transition-colors truncate">
                            {cust.name}
                          </h3>
                          <span className="text-[10px] text-surface-500">معرف العميل #{cust.id}</span>
                        </div>
                      </button>

                      {/* التعديل للمدير والمشرف والحذف للمدير فقط (سياسة الأدوار في الخادم). */}
                      {privileged && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(cust)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white transition cursor-pointer"
                            title="تعديل"
                            aria-label={`تعديل بيانات ${cust.name}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => handleDelete(cust)}
                              className="p-1.5 rounded-lg bg-danger-600/10 hover:bg-danger-600/20 text-danger-400 hover:text-danger-300 transition cursor-pointer"
                              title="حذف"
                              aria-label={`حذف العميل ${cust.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${CUSTOMER_TYPE_STYLES[cust.customer_type] || CUSTOMER_TYPE_STYLES.retail}`}>
                        {cust.customer_type_display}
                      </span>
                      {discount > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-surface-300">
                          خصم {discount}%
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-surface-900/50 border border-white/5">
                        <span className="block text-[10px] text-surface-500">الرصيد</span>
                        <span className={`text-sm font-bold ${balanceTone(cust.balance)}`}>
                          {formatCurrency(cust.balance)}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-surface-900/50 border border-white/5">
                        <span className="block text-[10px] text-surface-500">حد الائتمان</span>
                        <span className={`text-sm font-bold ${hasLimit ? 'text-white' : 'text-surface-500'}`}>
                          {hasLimit ? formatCurrency(cust.credit_limit) : 'لا آجل'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-surface-300 pt-2 border-t border-white/3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-surface-500" aria-hidden="true" />
                        <a href={`tel:${cust.phone}`} className="hover:text-primary-400 font-mono" dir="ltr">
                          {cust.phone}
                        </a>
                      </div>

                      {cust.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-surface-500" aria-hidden="true" />
                          <span>{cust.location}</span>
                        </div>
                      )}

                      {cust.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-surface-500" aria-hidden="true" />
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
                        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                        واتساب
                      </a>
                    )}
                    <a
                      href={`tel:${cust.phone}`}
                      className="px-3 py-1.5 rounded-lg bg-primary-600/15 hover:bg-primary-600/25 text-primary-400 text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      اتصال مباشر
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            count={list.count}
            onPageChange={(next) => setPageState({ key: filterKey, page: next })}
            disabled={loading}
            noun="عميل"
          />
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {showModal && (
        <ModalShell
          title={modalType === 'add' ? 'إضافة عميل جديد' : 'تعديل بيانات العميل'}
          icon={Users}
          onClose={closeModal}
          busy={saving}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="customer-name" className="block text-xs font-semibold text-surface-300 mb-1">اسم العميل *</label>
              <input
                id="customer-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                className={inputClass}
                placeholder="الاسم الكامل"
              />
            </div>
            <div>
              <label htmlFor="customer-phone" className="block text-xs font-semibold text-surface-300 mb-1">رقم الهاتف *</label>
              <input
                id="customer-phone"
                type="text"
                required
                value={form.phone}
                onChange={(e) => updateForm({ phone: e.target.value })}
                className={inputClass}
                placeholder="رقم الهاتف الأساسي"
              />
            </div>
            <div>
              <label htmlFor="customer-location" className="block text-xs font-semibold text-surface-300 mb-1">الموقع (العنوان)</label>
              <input
                id="customer-location"
                type="text"
                value={form.location}
                onChange={(e) => updateForm({ location: e.target.value })}
                className={inputClass}
                placeholder="العنوان أو المدينة"
              />
            </div>
            <div>
              <label htmlFor="customer-email" className="block text-xs font-semibold text-surface-300 mb-1">البريد الإلكتروني</label>
              <input
                id="customer-email"
                type="email"
                value={form.email}
                onChange={(e) => updateForm({ email: e.target.value })}
                className={inputClass}
                placeholder="example@domain.com"
              />
            </div>
            <div>
              <label htmlFor="customer-whatsapp" className="block text-xs font-semibold text-surface-300 mb-1">رقم الواتساب</label>
              <input
                id="customer-whatsapp"
                type="text"
                value={form.whatsapp}
                onChange={(e) => updateForm({ whatsapp: e.target.value })}
                className={inputClass}
                placeholder="رقم الواتساب الكامل"
              />
            </div>

            {privileged && (
              <div className="space-y-4 pt-3 border-t border-white/5">
                <p className="text-[11px] text-surface-500">التسعير والبيع الآجل (للمدير والمشرف)</p>
                <div>
                  <label htmlFor="customer-type" className="block text-xs font-semibold text-surface-300 mb-1">نوع العميل</label>
                  <select
                    id="customer-type"
                    value={form.customer_type}
                    onChange={(e) => updateForm({ customer_type: e.target.value })}
                    className={inputClass}
                  >
                    {CUSTOMER_TYPE_OPTIONS.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="customer-discount" className="block text-xs font-semibold text-surface-300 mb-1">نسبة الخصم %</label>
                    <input
                      id="customer-discount"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.discount_percent}
                      onChange={(e) => updateForm({ discount_percent: e.target.value })}
                      className={inputClass}
                      placeholder="خصم النوع"
                      aria-describedby="customer-discount-hint"
                      dir="ltr"
                    />
                    <p id="customer-discount-hint" className="mt-1 text-[10px] text-surface-500">فارغ = خصم نوعه الافتراضي</p>
                  </div>
                  <div>
                    <label htmlFor="customer-credit-limit" className="block text-xs font-semibold text-surface-300 mb-1">حد الائتمان</label>
                    <input
                      id="customer-credit-limit"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={form.credit_limit}
                      onChange={(e) => updateForm({ credit_limit: e.target.value })}
                      className={inputClass}
                      aria-describedby="customer-credit-hint"
                      dir="ltr"
                    />
                    <p id="customer-credit-hint" className="mt-1 text-[10px] text-surface-500">0 = لا يُسمح بالبيع الآجل</p>
                  </div>
                </div>
              </div>
            )}

            {formError && (
              <div role="alert" className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
                {formError}
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-white/5 justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-semibold transition disabled:opacity-40"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition shadow-lg shadow-primary-600/20 disabled:opacity-40 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                حفظ البيانات
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
