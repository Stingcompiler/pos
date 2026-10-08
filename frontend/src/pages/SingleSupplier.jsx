import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import { apiErrorMessage, fetchAllPages } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import {
  BASE_CURRENCY,
  buildSupplyDealPayload,
  currencyLabel,
  currencyName,
  foreignToBase,
  formatRate,
  parseAmount,
} from '../components/settings/pricingHelpers';
import {
  Truck, User, Phone, Mail, MapPin, Plus,
  Package, Clock, Loader2, AlertCircle, AlertTriangle,
  Edit2, CheckCircle2, ChevronLeft, Undo2, Search,
} from 'lucide-react';
import { DATE_LOCALE } from '../utils/dates';

const PRIVILEGED_ROLES = ['manager', 'supervisor'];

const dealDateFormat = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const INPUT_CLASS =
  'w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all';

function ErrorBox({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="p-3 bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs rounded-xl flex items-start gap-2 leading-relaxed">
      <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export default function SingleSupplier() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // الموظف يطّلع على المورد فقط: التوريد والتعديل وحقول التكلفة للمدير والمشرف.
  const isPrivileged = PRIVILEGED_ROLES.includes(user?.role);
  // الخادم يمنع المشرف من الحذف (DELETE)، فإلغاء التوريد للمدير وحده.
  const isManager = user?.role === 'manager';

  const [supplier, setSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pageMessage, setPageMessage] = useState('');

  // Tab State
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'deals'

  // Edit Profile Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Add Restock Deal Modal
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [parts, setParts] = useState([]); // كل القطع لقائمة الاختيار (تُجلب عند فتح النموذج)
  const [partsLoaded, setPartsLoaded] = useState(false);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsError, setPartsError] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [currency, setCurrency] = useState(''); // '' = الجنيه
  const [purchasePrice, setPurchasePrice] = useState('');
  const [foreignUnitCost, setForeignUnitCost] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [submittingDeal, setSubmittingDeal] = useState(false);
  const [dealError, setDealError] = useState('');
  const [latestRates, setLatestRates] = useState({ currencies: [], rates: {} });

  // Reverse (delete) deal dialog
  const [dealToReverse, setDealToReverse] = useState(null);
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState('');

  // silent: تحديث بعد عملية دون إخفاء الصفحة خلف مؤشر التحميل.
  const fetchSupplierData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const res = await api.get(`suppliers/${id}/`);
      setSupplier(res.data);
    } catch (err) {
      if (!silent) {
        setLoadError(apiErrorMessage(err, 'تعذر تحميل بيانات المورد. قد يكون المورد غير موجود.'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSupplierData();
  }, [fetchSupplierData]);

  const loadParts = useCallback(async () => {
    setPartsLoading(true);
    setPartsError('');
    try {
      // كل الصفحات: الصفحة الأولى وحدها كانت تُخفي بقية الكتالوج.
      setParts(await fetchAllPages('spare-parts/'));
      setPartsLoaded(true);
    } catch (err) {
      setPartsError(apiErrorMessage(err, 'تعذّر تحميل قائمة قطع الغيار.'));
    } finally {
      setPartsLoading(false);
    }
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const { data } = await api.get('exchange-rates/latest/');
      setLatestRates({ currencies: data.currencies || [], rates: data.rates || {} });
    } catch {
      // بلا أسعار يبقى الشراء بالجنيه متاحاً، والخادم يشرح أي نقص عند الحفظ.
    }
  }, []);

  const openEditModal = () => {
    setCompanyName(supplier.company_name);
    setContactPerson(supplier.contact_person || '');
    setPhoneNumber(supplier.phone_number);
    setEmail(supplier.email || '');
    setAddress(supplier.address || '');
    setIsActive(supplier.is_active);
    setProfileError('');
    setShowEditModal(true);
  };

  const openRestockModal = () => {
    setSelectedPartId('');
    setPartSearch('');
    setQuantity('');
    setCurrency('');
    setPurchasePrice('');
    setForeignUnitCost('');
    setExchangeRate('');
    setInvoiceRef('');
    setDealError('');
    setShowRestockModal(true);
    if (!partsLoaded) loadParts();
    loadRates();
  };

  const handleUpdateSupplier = async (e) => {
    e.preventDefault();
    try {
      setUpdatingProfile(true);
      setProfileError('');
      const payload = {
        company_name: companyName,
        contact_person: contactPerson || null,
        phone_number: phoneNumber,
        email: email || null,
        address: address || null,
        is_active: isActive
      };

      const res = await api.put(`suppliers/${id}/`, payload);

      // Update supplier object but keep deals and supplied_parts from nested object
      setSupplier((prev) => ({
        ...res.data,
        supplied_parts: prev.supplied_parts,
        deals: prev.deals
      }));
      setShowEditModal(false);
    } catch (err) {
      setProfileError(apiErrorMessage(err, 'فشل في تعديل بيانات المورد. الرجاء التأكد من صحة المدخلات.'));
    } finally {
      setUpdatingProfile(false);
    }
  };

  // ──── حسابات نموذج التوريد ────
  const selectedPart = useMemo(
    () => parts.find((part) => String(part.id) === String(selectedPartId)) || null,
    [parts, selectedPartId],
  );

  const filteredParts = useMemo(() => {
    const term = partSearch.trim().toLowerCase();
    if (!term) return parts;
    const matches = parts.filter((part) => (
      `${part.name} ${part.part_number || ''} ${part.brand || ''}`.toLowerCase().includes(term)
    ));
    // القطعة المختارة تبقى في القائمة حتى لا يفرغ الاختيار عند تغيير البحث.
    if (selectedPart && !matches.includes(selectedPart)) matches.unshift(selectedPart);
    return matches;
  }, [parts, partSearch, selectedPart]);

  const isForeign = Boolean(currency) && currency !== BASE_CURRENCY;
  const latestRate = isForeign ? parseAmount(latestRates.rates?.[currency]) : null;
  const effectiveRate = parseAmount(exchangeRate) ?? latestRate;
  const unitCostSdg = isForeign ? foreignToBase(foreignUnitCost, effectiveRate) : parseAmount(purchasePrice);
  const quantityNumber = parseInt(quantity, 10);
  const dealTotal = unitCostSdg !== null && quantityNumber > 0 ? unitCostSdg * quantityNumber : null;

  const handlePartChange = (value) => {
    setSelectedPartId(value);
    const part = parts.find((item) => String(item.id) === String(value));
    // القطعة المسعّرة بعملة أجنبية تُشترى غالباً بنفس العملة؛ نقترحها.
    const suggested = part?.cost_currency;
    setCurrency(suggested && latestRates.currencies.includes(suggested) ? suggested : '');
  };

  const handleCreateRestockDeal = async (e) => {
    e.preventDefault();
    if (!selectedPartId || !(quantityNumber > 0)) {
      setDealError('الرجاء اختيار القطعة وإدخال كمية أكبر من صفر.');
      return;
    }
    if (isForeign ? parseAmount(foreignUnitCost) === null : parseAmount(purchasePrice) === null) {
      setDealError(isForeign ? `أدخل تكلفة الوحدة بـ${currencyName(currency)}.` : 'أدخل سعر شراء الوحدة.');
      return;
    }

    try {
      setSubmittingDeal(true);
      setDealError('');
      const payload = buildSupplyDealPayload({
        supplier: id,
        sparePart: selectedPartId,
        quantity,
        currency,
        purchasePrice,
        foreignUnitCost,
        exchangeRate,
        invoiceReference: invoiceRef,
      });

      await api.post('supply-deals/', payload);

      setShowRestockModal(false);
      setPageMessage('تم تسجيل التوريد وزيادة المخزون.');
      // المخزون تغيّر: نعيد تحميل المورد، والقائمة عند فتح النموذج التالي.
      setPartsLoaded(false);
      await fetchSupplierData({ silent: true });
    } catch (err) {
      // مثل: لا يوجد سعر صرف مسجّل لهذه العملة.
      setDealError(apiErrorMessage(err, 'فشل في تسجيل عملية التوريد الجديدة.'));
    } finally {
      setSubmittingDeal(false);
    }
  };

  const openReverseDialog = (deal) => {
    setReverseError('');
    setDealToReverse(deal);
  };

  const handleReverseDeal = async () => {
    if (!dealToReverse) return;
    setReversing(true);
    setReverseError('');
    try {
      await api.delete(`supply-deals/${dealToReverse.id}/`);
      setPageMessage(`تم إلغاء التوريد #${dealToReverse.id} وخصم كميته من المخزون.`);
      setDealToReverse(null);
      setPartsLoaded(false);
      await fetchSupplierData({ silent: true });
    } catch (err) {
      // الخادم يشرح سبب الرفض (حركات لاحقة على القطعة، أو رصيد غير كافٍ).
      setReverseError(apiErrorMessage(err, 'تعذّر إلغاء التوريد.'));
    } finally {
      setReversing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-4" dir="rtl">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm text-surface-400">جاري تحميل ملف المورد الفني...</p>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="glass-card p-8 text-center max-w-md mx-auto space-y-4" dir="rtl">
        <AlertCircle className="w-12 h-12 text-danger-500 mx-auto animate-pulse" />
        <h3 className="text-white font-bold text-lg">خطأ في تحميل الملف</h3>
        <p className="text-sm text-surface-400">{loadError || 'تعذر تحميل بيانات المورد.'}</p>
        <div className="flex gap-2">
          <button
            onClick={() => fetchSupplierData()}
            className="flex-1 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition"
          >
            إعادة المحاولة
          </button>
          <button
            onClick={() => navigate('/dashboard/suppliers')}
            className="flex-1 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold transition"
          >
            العودة لقائمة الموردين
          </button>
        </div>
      </div>
    );
  }

  const deals = supplier.deals || [];
  // حقول التكلفة يحذفها الخادم لغير المدير والمشرف؛ نعرض أعمدتها فقط إن وصلت.
  const dealsHaveCosts = deals.some((deal) => 'purchase_price' in deal);
  const dealColumns = 5 + (dealsHaveCosts ? 2 : 0) + (isManager ? 1 : 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Breadcrumbs / Header Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/suppliers"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white transition"
            title="العودة للموردين"
            aria-label="العودة للموردين"
          >
            <ChevronLeft className="w-5 h-5 transform rotate-180" aria-hidden="true" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-400">الموردون</span>
              <span className="text-xs text-surface-600">/</span>
              <span className="text-xs text-primary-400 font-bold">{supplier.company_name}</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">{supplier.company_name}</h1>
          </div>
        </div>

        {isPrivileged && (
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={openRestockModal}
              className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-xs w-full sm:w-auto hover:shadow-lg hover:shadow-primary-600/20"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>تسجيل توريدة جديدة</span>
            </button>
          </div>
        )}
      </div>

      {pageMessage && (
        <div role="status" className="p-3.5 bg-success-500/10 border border-success-500/20 text-success-400 text-sm rounded-xl flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {pageMessage}
          </span>
          <button
            type="button"
            onClick={() => setPageMessage('')}
            aria-label="إخفاء الرسالة"
            className="text-success-400/70 hover:text-success-400 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Profile Info Card */}
      <div className="glass-card p-6 border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 blur-2xl rounded-full" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-600/10 border border-primary-500/20 flex items-center justify-center shrink-0">
              <Truck className="w-7 h-7 text-primary-400" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white leading-tight">
                  {supplier.company_name}
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${supplier.is_active ? 'bg-success-500/10 text-success-400 border border-success-500/20' : 'bg-surface-500/10 text-surface-400 border border-white/5'}`}>
                  {supplier.is_active ? 'نشط' : 'غير نشط'}
                </span>
              </div>

              {supplier.contact_person && (
                <p className="text-xs text-surface-400 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-surface-500" />
                  <span>الشخص المسؤول: <strong className="text-white font-medium">{supplier.contact_person}</strong></span>
                </p>
              )}
            </div>
          </div>

          {isPrivileged && (
            <button
              onClick={openEditModal}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-surface-200 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition border border-white/5 w-full md:w-auto justify-center"
            >
              <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تعديل بيانات الملف</span>
            </button>
          )}
        </div>

        <hr className="border-white/5 my-5" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-1.5">
            <span className="text-xs text-surface-500 block">رقم الهاتف</span>
            <div className="flex items-center gap-2 text-white">
              <Phone className="w-4 h-4 text-primary-400 shrink-0" />
              <a href={`tel:${supplier.phone_number}`} className="font-mono hover:text-primary-400 font-bold transition" dir="ltr">
                {supplier.phone_number}
              </a>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-surface-500 block">البريد الإلكتروني</span>
            <div className="flex items-center gap-2 text-white">
              <Mail className="w-4 h-4 text-primary-400 shrink-0" />
              {supplier.email ? (
                <a href={`mailto:${supplier.email}`} className="font-mono hover:text-primary-400 transition">
                  {supplier.email}
                </a>
              ) : (
                <span className="text-surface-500">غير متوفر</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-surface-500 block">عنوان المقر / المستودع</span>
            <div className="flex items-start gap-2 text-white">
              <MapPin className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{supplier.address || 'غير متوفر'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Control Section */}
      <div className="flex border-b border-white/5 gap-2" role="tablist" aria-label="أقسام ملف المورد">
        <button
          role="tab"
          aria-selected={activeTab === 'inventory'}
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'inventory' ? 'border-primary-500 text-primary-400 bg-primary-500/2' : 'border-transparent text-surface-400 hover:text-white'}`}
        >
          <Package className="w-4 h-4" aria-hidden="true" />
          <span>المنتجات الموردة ({supplier.supplied_parts?.length || 0})</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'deals'}
          onClick={() => setActiveTab('deals')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'deals' ? 'border-primary-500 text-primary-400 bg-primary-500/2' : 'border-transparent text-surface-400 hover:text-white'}`}
        >
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span>سجل التعاملات والتوريد ({deals.length})</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'inventory' ? (
        <div className="space-y-4">
          {(!supplier.supplied_parts || supplier.supplied_parts.length === 0) ? (
            <div className="glass-card p-10 text-center text-surface-500 max-w-md mx-auto space-y-2">
              <Package className="w-12 h-12 text-surface-700 mx-auto" />
              <h3 className="text-white font-bold text-sm">لا توجد قطع غيار مرتبطة</h3>
              <p className="text-xs text-surface-500 leading-relaxed">
                لم يتم إسناد قطع غيار في المخزون لهذا المورد بعد. عند تسجيل صفقات توريد جديدة، ستظهر القطع تلقائياً هنا.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {supplier.supplied_parts.map(part => (
                <div
                  key={part.id}
                  className="glass-card p-4 hover:scale-[1.01] transition-all duration-200 border-t border-white/5 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-sm font-bold text-white leading-tight">{part.name}</h4>
                      <span className="text-[10px] font-mono bg-white/5 text-surface-400 px-1.5 py-0.5 rounded" dir="ltr">
                        #{part.part_number}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-surface-400">
                      <span>الفئة: {part.category_name || '—'}</span>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  <div className="flex justify-between items-end text-xs gap-3">
                    <div className="space-y-0.5">
                      {'purchase_price' in part ? (
                        <>
                          <span className="text-surface-500 text-[10px] block">متوسط التكلفة</span>
                          <span className="text-white font-mono font-bold text-sm">{formatCurrency(part.purchase_price)} ج.س</span>
                          {part.cost_currency && part.foreign_cost != null && (
                            <span className="block text-[10px] text-surface-400 font-mono">
                              آخر شراء: {formatRate(part.foreign_cost)} {part.cost_currency}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-surface-500 text-[10px] block">سعر البيع</span>
                          <span className="text-white font-mono font-bold text-sm">{formatCurrency(part.selling_price)} ج.س</span>
                        </>
                      )}
                    </div>

                    <div className="text-left space-y-0.5">
                      <span className="text-surface-500 text-[10px] block">الكمية المتوفرة</span>
                      <span className={`font-mono font-bold text-sm ${part.is_low_stock ? 'text-danger-400 animate-pulse' : 'text-success-400'}`}>
                        {part.stock_quantity} قطعة
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Deals History Table */
        <div className="glass-card overflow-hidden">
          {deals.length === 0 ? (
            <div className="p-10 text-center text-surface-500 max-w-sm mx-auto space-y-2">
              <Clock className="w-12 h-12 text-surface-700 mx-auto" />
              <h3 className="text-white font-bold text-sm">سجل التعاملات فارغ</h3>
              <p className="text-xs text-surface-500 leading-relaxed">
                لم يتم تسجيل صفقات توريد مسبقة مع هذا المورد. سجل توريدة جديدة لتحديث الحسابات.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-white/2 border-b border-white/5 text-surface-400 font-bold">
                    <th scope="col" className="p-4">تاريخ الاستلام</th>
                    <th scope="col" className="p-4">اسم قطعة الغيار</th>
                    <th scope="col" className="p-4 text-center">الكمية المضافة</th>
                    <th scope="col" className="p-4 text-center">عملة الشراء</th>
                    {dealsHaveCosts && <th scope="col" className="p-4 text-left">تكلفة الوحدة (ج.س)</th>}
                    {dealsHaveCosts && <th scope="col" className="p-4 text-left font-bold text-primary-400">التكلفة الإجمالية (ج.س)</th>}
                    <th scope="col" className="p-4 text-center">مرجع الفاتورة</th>
                    {isManager && <th scope="col" className="p-4 text-center">إجراء</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/3">
                  {deals.map((deal) => (
                    <tr key={deal.id} className="hover:bg-white/1 transition duration-150 text-surface-300">
                      <td className="p-4 font-mono whitespace-nowrap">
                        {deal.date_received ? dealDateFormat.format(new Date(deal.date_received)) : '—'}
                      </td>
                      <td className="p-4 font-bold text-white">{deal.spare_part_name}</td>
                      <td className="p-4 text-center font-mono font-bold text-white">{deal.quantity_added}</td>
                      <td className="p-4 text-center">
                        {deal.currency ? (
                          <span className="font-mono bg-primary-600/10 text-primary-300 px-2 py-0.5 rounded-full" title={currencyName(deal.currency)}>
                            {deal.currency}
                          </span>
                        ) : (
                          <span className="text-surface-500">جنيه</span>
                        )}
                      </td>
                      {dealsHaveCosts && (
                        <td className="p-4 text-left font-mono whitespace-nowrap">
                          {formatCurrency(deal.purchase_price)}
                          {deal.currency && deal.foreign_unit_cost != null && (
                            <span className="block text-[10px] text-surface-500 mt-0.5" dir="ltr">
                              {formatRate(deal.foreign_unit_cost)} {deal.currency} × {formatRate(deal.exchange_rate)}
                            </span>
                          )}
                        </td>
                      )}
                      {dealsHaveCosts && (
                        <td className="p-4 text-left font-mono font-bold text-primary-400 whitespace-nowrap">
                          {formatCurrency(deal.total_cost)}
                        </td>
                      )}
                      <td className="p-4 text-center">
                        {deal.invoice_reference ? (
                          <span className="font-mono bg-white/5 text-surface-300 px-2 py-0.5 rounded-full border border-white/5">
                            {deal.invoice_reference}
                          </span>
                        ) : (
                          <span className="text-surface-500">-</span>
                        )}
                      </td>
                      {isManager && (
                        <td className="p-4 text-center">
                          <button
                            type="button"
                            onClick={() => openReverseDialog(deal)}
                            aria-label={`إلغاء التوريد رقم ${deal.id} (${deal.spare_part_name})`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-danger-400 hover:bg-danger-500/10 transition-colors font-semibold"
                          >
                            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>إلغاء</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {dealsHaveCosts && (
                  <tfoot>
                    <tr className="border-t border-white/10 text-surface-300">
                      <td colSpan={dealColumns} className="p-4 text-xs">
                        إجمالي قيمة التوريدات المسجّلة:{' '}
                        <strong className="text-primary-400 font-mono">
                          {formatCurrency(deals.reduce((sum, deal) => sum + (parseAmount(deal.total_cost) || 0), 0))} ج.س
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Supplier Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-supplier-title"
            className="glass-card w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/2">
              <h2 id="edit-supplier-title" className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary-400" aria-hidden="true" />
                <span>تعديل بيانات الملف الفني</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                aria-label="إغلاق"
                className="text-surface-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSupplier} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="supplier-company" className="text-xs text-surface-300 font-bold block">
                    اسم الشركة / المورد <span className="text-primary-400">*</span>
                  </label>
                  <input
                    id="supplier-company"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="supplier-contact" className="text-xs text-surface-300 font-bold block">
                    الشخص المسؤول
                  </label>
                  <input
                    id="supplier-contact"
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="supplier-phone" className="text-xs text-surface-300 font-bold block">
                    رقم الهاتف <span className="text-primary-400">*</span>
                  </label>
                  <input
                    id="supplier-phone"
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className={`${INPUT_CLASS} text-left font-mono`}
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="supplier-email" className="text-xs text-surface-300 font-bold block">
                    البريد الإلكتروني
                  </label>
                  <input
                    id="supplier-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${INPUT_CLASS} text-left font-mono`}
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="supplier-address" className="text-xs text-surface-300 font-bold block">
                  عنوان المستودع / المقر
                </label>
                <textarea
                  id="supplier-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex items-center gap-2.5 py-1">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded bg-surface-950 text-primary-500 focus:ring-0 border-white/10"
                />
                <label htmlFor="isActive" className="text-xs text-surface-300 cursor-pointer">
                  مورد نشط ويتم التعامل معه حالياً
                </label>
              </div>

              <ErrorBox>{profileError}</ErrorBox>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white rounded-xl text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={updatingProfile}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:bg-primary-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition"
                >
                  {updatingProfile ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>جاري حفظ التعديلات...</span>
                    </>
                  ) : (
                    <span>تأكيد التعديل</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Restock Deal Modal */}
      {showRestockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="restock-title"
            className="glass-card w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/2">
              <h2 id="restock-title" className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-400" aria-hidden="true" />
                <span>تسجيل توريدة جديدة / شراء مخزون</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowRestockModal(false)}
                aria-label="إغلاق"
                className="text-surface-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRestockDeal} className="p-5 space-y-4">
              <div className="space-y-1">
                <label htmlFor="restock-part" className="text-xs text-surface-300 font-bold block">
                  اختر قطعة الغيار المستلمة <span className="text-primary-400">*</span>
                </label>
                {partsError ? (
                  <div className="space-y-2">
                    <ErrorBox>{partsError}</ErrorBox>
                    <button type="button" onClick={loadParts} className="text-xs text-primary-400 font-bold">
                      إعادة المحاولة
                    </button>
                  </div>
                ) : partsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-surface-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>جاري تحميل كتالوج قطع الغيار...</span>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="w-4 h-4 text-surface-500 absolute right-3 top-2.5" aria-hidden="true" />
                      <input
                        type="search"
                        value={partSearch}
                        onChange={(e) => setPartSearch(e.target.value)}
                        placeholder="ابحث بالاسم أو الرقم أو الماركة لتضييق القائمة"
                        aria-label="تصفية قائمة قطع الغيار"
                        className={`${INPUT_CLASS} pr-9`}
                      />
                    </div>
                    <select
                      id="restock-part"
                      required
                      value={selectedPartId}
                      onChange={(e) => handlePartChange(e.target.value)}
                      className={`${INPUT_CLASS} py-2.5 mt-2`}
                    >
                      <option value="" className="bg-surface-950 text-surface-500">
                        -- اختر من كتالوج قطع الغيار ({filteredParts.length}) --
                      </option>
                      {filteredParts.map(p => (
                        <option key={p.id} value={p.id} className="bg-surface-950 text-white">
                          {p.name} (رقم: {p.part_number}) - المتوفر حالياً: {p.stock_quantity}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="restock-quantity" className="text-xs text-surface-300 font-bold block">
                    الكمية المستلمة <span className="text-primary-400">*</span>
                  </label>
                  <input
                    id="restock-quantity"
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="مثال: 50"
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="restock-currency" className="text-xs text-surface-300 font-bold block">
                    عملة الشراء
                  </label>
                  <select
                    id="restock-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={`${INPUT_CLASS} py-2.5`}
                  >
                    <option value="" className="bg-surface-950">{currencyLabel(BASE_CURRENCY)}</option>
                    {latestRates.currencies.map((code) => (
                      <option key={code} value={code} className="bg-surface-950">
                        {currencyLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isForeign ? (
                <div className="space-y-3 p-3.5 rounded-xl border border-white/5 bg-surface-950/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label htmlFor="restock-foreign-cost" className="text-xs text-surface-300 font-bold block">
                        تكلفة الوحدة بـ{currencyName(currency)} <span className="text-primary-400">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="restock-foreign-cost"
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={foreignUnitCost}
                          onChange={(e) => setForeignUnitCost(e.target.value)}
                          placeholder={
                            selectedPart?.cost_currency === currency && selectedPart?.foreign_cost
                              ? `آخر تكلفة: ${selectedPart.foreign_cost}`
                              : 'مثال: 12.50'
                          }
                          className={`${INPUT_CLASS} pl-12 font-mono text-left`}
                          dir="ltr"
                        />
                        <span className="absolute left-3 top-2 text-[10px] text-surface-500 font-bold" aria-hidden="true">{currency}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="restock-rate" className="text-xs text-surface-300 font-bold block">
                        سعر الصرف (اختياري)
                      </label>
                      <input
                        id="restock-rate"
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(e.target.value)}
                        placeholder={latestRate ? `آخر سعر: ${latestRate}` : 'لا يوجد سعر مسجّل'}
                        aria-describedby="restock-rate-hint"
                        className={`${INPUT_CLASS} font-mono text-left`}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <p id="restock-rate-hint" className="text-[11px] text-surface-400 leading-relaxed">
                    اتركه فارغاً لاستخدام آخر سعر مسجّل
                    {latestRate ? ` (${formatRate(latestRate)} جنيه لكل 1 ${currency})` : ''}.
                    تُحفظ التكلفة الأجنبية على القطعة لتُعاد منها أسعار البيع عند تغيّر سعر الصرف.
                  </p>
                  {!latestRate && parseAmount(exchangeRate) === null && (
                    <div className="p-2.5 rounded-lg bg-warning-500/10 border border-warning-500/20 text-warning-400 text-[11px] flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
                      <span>
                        لا يوجد سعر صرف مسجّل لـ{currencyName(currency)}. أدخل السعر هنا
                        {isManager ? (
                          <> أو <Link to="/dashboard/settings?tab=rates" className="underline font-bold">سجّله من الإعدادات</Link></>
                        ) : ' أو اطلب من المدير تسجيله'}.
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-surface-400">تكلفة الوحدة بالجنيه:</span>
                    <strong className="text-white font-mono">
                      {unitCostSdg !== null ? `${formatCurrency(unitCostSdg)} ج.س` : '—'}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label htmlFor="restock-price" className="text-xs text-surface-300 font-bold block">
                    سعر الشراء / تكلفة القطعة بالجنيه <span className="text-primary-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="restock-price"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="مثال: 4500"
                      className={`${INPUT_CLASS} pl-12 font-mono text-left`}
                      dir="ltr"
                    />
                    <span className="absolute left-3 top-2 text-[10px] text-surface-500 font-bold" aria-hidden="true">SDG</span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="restock-invoice" className="text-xs text-surface-300 font-bold block">
                  الرقم المرجعي للفاتورة الورقية (اختياري)
                </label>
                <input
                  id="restock-invoice"
                  type="text"
                  maxLength={100}
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="مثال: INV-2026-991"
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              {/* Total cost live calculation helper */}
              {dealTotal !== null && (
                <div className="p-3.5 bg-primary-500/5 border border-primary-500/15 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-surface-400 font-bold">المجموع الإجمالي للصفقة:</span>
                  <strong className="text-primary-400 font-mono text-sm">
                    {formatCurrency(dealTotal)} ج.س
                  </strong>
                </div>
              )}

              <ErrorBox>{dealError}</ErrorBox>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowRestockModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white rounded-xl text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingDeal || partsLoading}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:bg-primary-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition"
                >
                  {submittingDeal ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>جاري التسجيل...</span>
                    </>
                  ) : (
                    <span>تسجيل الصفقة وزيادة المخزون</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Deal Confirmation */}
      {dealToReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reverse-deal-title"
            aria-describedby="reverse-deal-desc"
            className="glass-card w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <h2 id="reverse-deal-title" className="text-lg font-bold text-white flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-danger-400" aria-hidden="true" />
              <span>إلغاء التوريد #{dealToReverse.id}</span>
            </h2>
            <div id="reverse-deal-desc" className="space-y-3 text-sm text-surface-300 leading-relaxed">
              <p>
                سيُخصم <strong className="text-white font-mono">{dealToReverse.quantity_added}</strong> من مخزون
                «<strong className="text-white">{dealToReverse.spare_part_name}</strong>»، ويعود متوسط تكلفتها كما كان
                قبل هذا التوريد، ويُحذف سجلّه (تبقى حركة الإلغاء في سجل حركات المخزون).
              </p>
              <p className="p-3 rounded-xl bg-warning-500/10 border border-warning-500/20 text-warning-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                <span>
                  يُسمح بالإلغاء فقط إذا لم تُسجَّل على القطعة أي حركة بعد هذا التوريد (بيع أو توريد آخر أو تسوية).
                  إن وُجدت، عالج الفرق بتسوية مخزون معتمدة بدل الإلغاء.
                </span>
              </p>
            </div>

            <ErrorBox>{reverseError}</ErrorBox>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => setDealToReverse(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white rounded-xl text-xs transition"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleReverseDeal}
                disabled={reversing}
                className="flex items-center gap-2 bg-danger-600 hover:bg-danger-500 disabled:opacity-60 text-white px-5 py-2 rounded-xl text-xs font-bold transition"
              >
                {reversing && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                <span>تأكيد إلغاء التوريد</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
