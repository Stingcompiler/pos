import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import {
  Truck, ArrowRight, User, Phone, Mail, MapPin, Plus,
  Package, Clock, Calendar, Hash, DollarSign, Loader2,
  AlertCircle, Edit2, CheckCircle2, ChevronLeft
} from 'lucide-react';

export default function SingleSupplier() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState(null);
  const [parts, setParts] = useState([]); // All system parts for restock select dropdown
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
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

  // Add Restock Deal Modal
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [submittingDeal, setSubmittingDeal] = useState(false);

  const fetchSupplierData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/suppliers/${id}/`);
      setSupplier(res.data);
      
      // Seed edit form values
      setCompanyName(res.data.company_name);
      setContactPerson(res.data.contact_person || '');
      setPhoneNumber(res.data.phone_number);
      setEmail(res.data.email || '');
      setAddress(res.data.address || '');
      setIsActive(res.data.is_active);
    } catch (err) {
      console.error(err);
      setError('تعذر تحميل بيانات المورد. قد يكون المورد غير موجود.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllParts = async () => {
    try {
      const res = await api.get('/spare-parts/');
      setParts(res.data.results || res.data);
    } catch (err) {
      console.error('Error fetching spare parts', err);
    }
  };

  useEffect(() => {
    fetchSupplierData();
    fetchAllParts();
  }, [id]);

  const handleUpdateSupplier = async (e) => {
    e.preventDefault();
    try {
      setUpdatingProfile(true);
      setError('');
      const payload = {
        company_name: companyName,
        contact_person: contactPerson || null,
        phone_number: phoneNumber,
        email: email || null,
        address: address || null,
        is_active: isActive
      };

      const res = await api.put(`/suppliers/${id}/`, payload);
      
      // Update supplier object but keep deals and supplied_parts from nested object
      setSupplier({
        ...res.data,
        supplied_parts: supplier.supplied_parts,
        deals: supplier.deals
      });
      setShowEditModal(false);
    } catch (err) {
      console.error(err);
      setError('فشل في تعديل بيانات المورد. الرجاء التأكد من صحة المدخلات.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleCreateRestockDeal = async (e) => {
    e.preventDefault();
    if (!selectedPartId || !quantity || !purchasePrice) {
      setError('الرجاء اختيار القطعة وإدخال الكمية وسعر الشراء.');
      return;
    }

    try {
      setSubmittingDeal(true);
      setError('');
      const payload = {
        supplier: parseInt(id),
        spare_part: parseInt(selectedPartId),
        quantity_added: parseInt(quantity),
        purchase_price: parseFloat(purchasePrice),
        invoice_reference: invoiceRef || null
      };

      const res = await api.post('/supply-deals/', payload);
      
      // Re-fetch supplier details to perfectly reload inventory stock and deal history timeline
      const freshSup = await api.get(`/suppliers/${id}/`);
      setSupplier(freshSup.data);

      // Reset restock modal form state
      setSelectedPartId('');
      setQuantity('');
      setPurchasePrice('');
      setInvoiceRef('');
      setShowRestockModal(false);
    } catch (err) {
      console.error(err);
      setError('فشل في تسجيل عملية التوريد الجديدة.');
    } finally {
      setSubmittingDeal(false);
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

  if (error && !supplier) {
    return (
      <div className="glass-card p-8 text-center max-w-md mx-auto space-y-4" dir="rtl">
        <AlertCircle className="w-12 h-12 text-danger-500 mx-auto animate-pulse" />
        <h3 className="text-white font-bold text-lg">خطأ في تحميل الملف</h3>
        <p className="text-sm text-surface-400">{error}</p>
        <button
          onClick={() => navigate('/dashboard/suppliers')}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold transition w-full"
        >
          العودة لقائمة الموردين
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Breadcrumbs / Header Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/suppliers"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white transition"
            title="العودة للموردين"
          >
            <ChevronLeft className="w-5 h-5 transform rotate-180" />
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

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => setShowRestockModal(true)}
            className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-xs w-full sm:w-auto hover:shadow-lg hover:shadow-primary-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل توريدة جديدة</span>
          </button>
        </div>
      </div>

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

          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-surface-200 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition border border-white/5 w-full md:w-auto justify-center"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>تعديل بيانات الملف</span>
          </button>
        </div>

        <hr className="border-white/5 my-5" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-1.5">
            <span className="text-xs text-surface-500 block">رقم الهاتف</span>
            <div className="flex items-center gap-2 text-white">
              <Phone className="w-4 h-4 text-primary-400 shrink-0" />
              <a href={`tel:${supplier.phone_number}`} className="font-mono hover:text-primary-400 font-bold transition">
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
      <div className="flex border-b border-white/5 gap-2">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'inventory' ? 'border-primary-500 text-primary-400 bg-primary-500/2' : 'border-transparent text-surface-400 hover:text-white'}`}
        >
          <Package className="w-4 h-4" />
          <span>المنتجات الموردة ({supplier.supplied_parts?.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('deals')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'deals' ? 'border-primary-500 text-primary-400 bg-primary-500/2' : 'border-transparent text-surface-400 hover:text-white'}`}
        >
          <Clock className="w-4 h-4" />
          <span>سجل التعاملات والتوريد ({supplier.deals?.length || 0})</span>
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
                      <span className="text-[10px] font-mono bg-white/5 text-surface-400 px-1.5 py-0.5 rounded">
                        #{part.part_number}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-surface-400">
                      <span>الفئة: {part.category_name}</span>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  <div className="flex justify-between items-center text-xs">
                    <div className="space-y-0.5">
                      <span className="text-surface-500 text-[10px] block">سعر التكلفة الأخير</span>
                      <span className="text-white font-mono font-bold text-sm">{part.purchase_price} SDG</span>
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
          {(!supplier.deals || supplier.deals.length === 0) ? (
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
                    <th className="p-4">تاريخ الاستلام</th>
                    <th className="p-4">اسم قطعة الغيار</th>
                    <th className="p-4 text-center">الكمية المضافة</th>
                    <th className="p-4 text-left">سعر شراء الوحدة</th>
                    <th className="p-4 text-left font-bold text-primary-400">التكلفة الإجمالية</th>
                    <th className="p-4 text-center">مرجع الفاتورة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/3">
                  {supplier.deals.map((deal) => (
                    <tr key={deal.id} className="hover:bg-white/1 transition duration-150 text-surface-300">
                      <td className="p-4 font-mono">
                        {new Date(deal.date_received).toLocaleDateString('ar-SD', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="p-4 font-bold text-white">{deal.spare_part_name}</td>
                      <td className="p-4 text-center font-mono font-bold text-white">{deal.quantity_added}</td>
                      <td className="p-4 text-left font-mono">{deal.purchase_price} SDG</td>
                      <td className="p-4 text-left font-mono font-bold text-primary-400">{deal.total_cost} SDG</td>
                      <td className="p-4 text-center">
                        {deal.invoice_reference ? (
                          <span className="font-mono bg-white/5 text-surface-300 px-2 py-0.5 rounded-full border border-white/5">
                            {deal.invoice_reference}
                          </span>
                        ) : (
                          <span className="text-surface-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Supplier Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary-400" />
                <span>تعديل بيانات الملف الفني</span>
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-surface-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSupplier} className="p-5 space-y-4">
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
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    الشخص المسؤول
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white focus:outline-none transition-all"
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
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white focus:outline-none transition-all text-left font-mono"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white focus:outline-none transition-all text-left font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-surface-300 font-bold block">
                  عنوان المستودع / المقر
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white focus:outline-none transition-all"
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

              {error && (
                <div className="p-3 bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

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
          <div className="glass-card w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-400" />
                <span>تسجيل توريدة جديدة / شراء مخزون</span>
              </h2>
              <button
                onClick={() => setShowRestockModal(false)}
                className="text-surface-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRestockDeal} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-surface-300 font-bold block">
                  اختر قطعة الغيار المستلمة <span className="text-primary-400">*</span>
                </label>
                <select
                  required
                  value={selectedPartId}
                  onChange={(e) => setSelectedPartId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white focus:outline-none transition-all"
                >
                  <option value="" className="bg-surface-950 text-surface-500">-- اختر من كتالوج قطع الغيار --</option>
                  {parts.map(p => (
                    <option key={p.id} value={p.id} className="bg-surface-950 text-white">
                      {p.name} (رقم: {p.part_number}) - المتوفر حالياً: {p.stock_quantity}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    الكمية المستلمة <span className="text-primary-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="مثال: 50"
                    className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-surface-300 font-bold block">
                    سعر الشراء / تكلفة القطعة <span className="text-primary-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="مثال: 4500"
                      className="w-full pl-12 pr-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all font-mono text-left"
                      dir="ltr"
                    />
                    <span className="absolute left-3 top-2 text-[10px] text-surface-500 font-bold">SDG</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-surface-300 font-bold block">
                  الرقم المرجعي للفاتورة الورقية (اختياري)
                </label>
                <input
                  type="text"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="مثال: INV-2026-991"
                  className="w-full px-3 py-2 bg-surface-950/60 border border-white/5 focus:border-primary-500/50 rounded-xl text-sm text-white placeholder-surface-600 focus:outline-none transition-all font-mono"
                />
              </div>

              {/* Total cost live calculation helper */}
              {quantity && purchasePrice && (
                <div className="p-3.5 bg-primary-500/5 border border-primary-500/15 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-surface-400 font-bold">المجموع الإجمالي للصفقة:</span>
                  <strong className="text-primary-400 font-mono text-sm">
                    {(parseInt(quantity) * parseFloat(purchasePrice)).toLocaleString('ar-SD')} SDG
                  </strong>
                </div>
              )}

              {error && (
                <div className="p-3 bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

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
                  disabled={submittingDeal}
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
    </div>
  );
}
