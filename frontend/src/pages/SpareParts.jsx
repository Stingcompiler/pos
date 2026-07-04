import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  Package, Plus, Search, Edit3, Trash2, X,
  Loader2, AlertTriangle, ChevronLeft, ChevronRight, Save, Image as ImageIcon
} from 'lucide-react';

export default function SpareParts() {
  const { user } = useAuth();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState([]);
  const [carModels, setCarModels] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCarModel, setSelectedCarModel] = useState('');

  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const canEdit = user?.role === 'manager' || user?.role === 'supervisor';
  const canDelete = user?.role === 'manager';

  useEffect(() => {
    loadParts();
  }, [page, searchQuery, selectedCarModel]);

  useEffect(() => {
    loadCategories();
    loadCarModels();
    loadSuppliers();
  }, []);

  const loadParts = async () => {
    setLoading(true);
    try {
      const params = { page };
      if (searchQuery) params.search = searchQuery;
      if (selectedCarModel) params.compatible_cars = selectedCarModel;
      const res = await api.get('spare-parts/', { params });
      setParts(res.data.results || res.data);
      if (res.data.count) {
        setTotalPages(Math.ceil(res.data.count / 50));
      } else {
        setTotalPages(1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('categories/?page_size=100');
      setCategories(res.data.results || res.data);
    } catch { }
  };

  const loadCarModels = async () => {
    try {
      const res = await api.get('car-models/?page_size=100');
      setCarModels(res.data.results || res.data);
    } catch { }
  };

  const loadSuppliers = async () => {
    try {
      const res = await api.get('suppliers/?page_size=100');
      setSuppliers(res.data.results || res.data);
    } catch { }
  };

  const emptyForm = {
    name: '', part_number: '', category: '', compatible_cars: [],
    supplier: '',
    purchase_price: '', selling_price: '',
    stock_quantity: 0, min_stock_alert: 5, shelf_location: '',
    is_featured: false, description: '',
  };

  const [form, setForm] = useState(emptyForm);

  const openCreate = () => {
    setEditingPart(null);
    setForm(emptyForm);
    setImage(null);
    setImagePreview(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (part) => {
    setEditingPart(part);
    setForm({
      name: part.name,
      part_number: part.part_number,
      category: part.category || '',
      compatible_cars: part.compatible_cars || [],
      supplier: part.supplier || '',
      purchase_price: part.purchase_price,
      selling_price: part.selling_price,
      stock_quantity: part.stock_quantity,
      min_stock_alert: part.min_stock_alert,
      shelf_location: part.shelf_location || '',
      is_featured: part.is_featured || false,
      description: part.description || '',
    });
    setImage(null);
    setImagePreview(part.image || null);
    setError('');
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('part_number', form.part_number);
      if (form.category) {
        formData.append('category', form.category);
      }
      if (form.supplier) {
        formData.append('supplier', form.supplier);
      } else {
        formData.append('supplier', '');
      }
      formData.append('purchase_price', form.purchase_price);
      formData.append('selling_price', form.selling_price);
      formData.append('stock_quantity', form.stock_quantity);
      formData.append('min_stock_alert', form.min_stock_alert);
      formData.append('shelf_location', form.shelf_location);
      formData.append('is_featured', form.is_featured);
      formData.append('description', form.description);

      form.compatible_cars.forEach(carId => {
        formData.append('compatible_cars', carId);
      });

      if (image) {
        formData.append('image', image);
      }

      if (editingPart) {
        await api.put(`spare-parts/${editingPart.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('spare-parts/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setShowModal(false);
      loadParts();
    } catch (err) {
      const errData = err.response?.data;
      if (typeof errData === 'object') {
        setError(Object.values(errData).flat().join(' '));
      } else {
        setError('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذه القطعة؟')) return;
    try {
      await api.delete(`spare-parts/${id}/`);
      loadParts();
    } catch {
      alert('فشل حذف القطعة');
    }
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2 }).format(val);

  return (
    <div className="animate-fade-in select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-500 flex items-center justify-center shadow-md shadow-primary-600/10">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">قطع الغيار</h1>
            <p className="text-sm text-surface-400">إدارة المخزون والقطع المتوفرة</p>
          </div>
        </div>
        {canEdit && (
          <button
            id="spare-parts-add-btn"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-white font-medium
              text-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200
              shadow-lg shadow-primary-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            إضافة قطعة
          </button>
        )}
      </div>

      {/* Search & Filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="md:col-span-2 relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
          <input
            id="spare-parts-search"
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pr-12 pl-4 py-3 rounded-xl bg-surface-900/50 border border-white/10 text-white
              placeholder-surface-500 focus:border-primary-500 transition-colors text-sm"
            placeholder="ابحث بالاسم أو رقم القطعة..."
          />
        </div>
        <div>
          <select
            id="spare-parts-car-model-filter"
            value={selectedCarModel}
            onChange={(e) => { setSelectedCarModel(e.target.value); setPage(1); }}
            className="w-full px-4 py-3 rounded-xl bg-surface-900/50 border border-white/10 text-white
              focus:border-primary-500 transition-colors text-sm h-[46px]"
          >
            <option value="">-- تصفية بالسيارة المتوافقة --</option>
            {carModels.map((car) => (
              <option key={car.id} value={car.id}>
                {car.brand} {car.model_name} ({car.year_start}-{car.year_end || 'حتى الآن'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-4 text-right text-surface-400 font-medium w-16">الصورة</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">القطعة</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">رقم القطعة</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">الفئة</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">المورد</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium max-w-[220px]">السيارات المتوافقة</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">سعر الشراء</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">سعر البيع</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">المخزون</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">الرف</th>
                {(canEdit || canDelete) && (
                  <th className="px-5 py-4 text-center text-surface-400 font-medium w-28">إجراءات</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" className="py-12 text-center">
                    <Loader2 className="w-6 h-6 text-primary-500 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : parts.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-12 text-center text-surface-500">
                    لا توجد قطع غيار متوفرة في المخزون
                  </td>
                </tr>
              ) : (
                parts.map((part) => (
                  <tr key={part.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                    <td className="px-5 py-2.5">
                      {part.image ? (
                        <img src={part.image} alt={part.name} className="w-10 h-10 rounded-lg object-cover border border-white/5" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-surface-650" />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-white font-bold">
                      <div className="flex items-center gap-2">
                        <span>{part.name}</span>
                        {part.is_featured && (
                          <span className="px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-400 text-[10px] font-semibold border border-accent-500/30">
                            مميز
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-surface-300 font-mono" dir="ltr">{part.part_number}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-1 rounded-lg bg-primary-600/15 text-primary-300 text-xs font-semibold">
                        {part.category_name || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {part.supplier_name ? (
                        <span className="px-2 py-1 rounded-lg bg-accent-600/15 text-accent-300 text-xs font-semibold">
                          {part.supplier_name}
                        </span>
                      ) : (
                        <span className="text-surface-500 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {part.compatible_cars_display && part.compatible_cars_display.length > 0 ? (
                          part.compatible_cars_display.map((car, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-surface-800 text-surface-300 text-[10px] whitespace-nowrap border border-white/3 font-medium">
                              {car}
                            </span>
                          ))
                        ) : (
                          <span className="text-surface-500 text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-surface-300 font-mono">{formatCurrency(part.purchase_price || 0)}</td>
                    <td className="px-5 py-3.5 text-accent-400 font-extrabold font-mono">{formatCurrency(part.selling_price)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`flex items-center gap-1 font-bold ${part.is_low_stock ? 'text-warning-400' : 'text-surface-300'}`}>
                        {part.is_low_stock && <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />}
                        {part.stock_quantity}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-surface-400 font-medium">{part.shelf_location || '-'}</td>
                    {(canEdit || canDelete) && (
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(part)}
                              className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-all cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(part.id)}
                              className="p-2 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 p-4 border-t border-white/5 select-none">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-xs text-surface-400 font-semibold font-mono">
              صفحة {page} من {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ──── Modal ──── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowModal(false)}>
          <div className="w-full max-w-xl mx-4 glass-card p-6 animate-scale-in max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">
                {editingPart ? 'تعديل قطعة غيار' : 'إضافة قطعة جديدة'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-surface-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 mb-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm animate-fade-in">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">اسم القطعة *</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">رقم القطعة *</label>
                  <input type="text" required value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" dir="ltr" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">الوصف التفصيلي للقطعة</label>
                <textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="اكتب تفاصيل ومواصفات قطعة الغيار..."
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors resize-none" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-surface-300 mb-1.5">الفئة</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10">
                      <option value="">-- اختر فئة --</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-surface-300 mb-1.5">المورد (مصدر القطعة)</label>
                    <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10">
                      <option value="">-- اختر المورد --</option>
                      {suppliers.map((sup) => (
                        <option key={sup.id} value={sup.id}>{sup.company_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">السيارات المتوافقة</label>
                  <div className="w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs max-h-[120px] overflow-y-auto space-y-1.5">
                    {carModels.map((car) => {
                      const isChecked = form.compatible_cars.includes(car.id);
                      return (
                        <label key={car.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const updated = isChecked
                                ? form.compatible_cars.filter(id => id !== car.id)
                                : [...form.compatible_cars, car.id];
                              setForm({ ...form, compatible_cars: updated });
                            }}
                            className="rounded border-white/10 text-primary-600 focus:ring-primary-500/30 bg-surface-950 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs text-surface-300 truncate">
                            {car.brand} {car.model_name} ({car.year_start})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">سعر الشراء *</label>
                  <input type="number" step="0.01" min="0" required value={form.purchase_price}
                    onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">سعر البيع *</label>
                  <input type="number" step="0.01" min="0" required value={form.selling_price}
                    onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" dir="ltr" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">الكمية *</label>
                  <input type="number" min="0" required value={form.stock_quantity}
                    onChange={(e) => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">حد التنبيه</label>
                  <input type="number" min="0" value={form.min_stock_alert}
                    onChange={(e) => setForm({ ...form, min_stock_alert: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">الرف</label>
                  <input type="text" value={form.shelf_location}
                    onChange={(e) => setForm({ ...form, shelf_location: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">صورة القطعة</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setImage(file);
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                      className="w-full text-xs text-surface-400 file:mr-0 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-600/10 file:text-primary-400 hover:file:bg-primary-600/20 file:cursor-pointer" />
                  </div>
                  {imagePreview && (
                    <div className="w-12 h-12 rounded-xl border border-white/10 overflow-hidden flex-shrink-0 bg-surface-900">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface-950/40 border border-white/5 animate-scale-in">
                <input
                  type="checkbox"
                  id="form-is-featured"
                  checked={form.is_featured}
                  onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                  className="w-4 h-4 rounded border-white/10 text-primary-600 focus:ring-0 focus:ring-offset-0 bg-surface-900 cursor-pointer"
                />
                <label htmlFor="form-is-featured" className="text-xs font-semibold text-surface-200 cursor-pointer select-none">
                  تمييز هذا المنتج في الصفحة الرئيسية (Featured Product)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface-800 text-surface-300 text-sm hover:bg-surface-700 transition-colors cursor-pointer">
                  إلغاء
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-semibold
                    hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingPart ? 'تحديث' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
