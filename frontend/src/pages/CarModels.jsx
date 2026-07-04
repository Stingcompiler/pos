import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Car, Plus, Edit3, Trash2, X, Loader2, Save, Search, Image as ImageIcon } from 'lucide-react';

export default function CarModels() {
  const { user } = useAuth();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const canEdit = user?.role === 'manager' || user?.role === 'supervisor';
  const canDelete = user?.role === 'manager';

  const emptyForm = { brand: '', model_name: '', year_start: '', year_end: '', description: '' };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadModels(); }, [searchQuery]);

  const loadModels = async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      const res = await api.get('car-models/', { params });
      setModels(res.data.results || res.data);
    } catch {} finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setImage(null);
    setImagePreview(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (model) => {
    setEditing(model);
    setForm({
      brand: model.brand,
      model_name: model.model_name,
      year_start: model.year_start,
      year_end: model.year_end || '',
      description: model.description || '',
    });
    setImage(null);
    setImagePreview(model.image || null);
    setError('');
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('brand', form.brand);
      formData.append('model_name', form.model_name);
      formData.append('year_start', form.year_start);
      if (form.year_end) {
        formData.append('year_end', form.year_end);
      } else {
        formData.append('year_end', '');
      }
      formData.append('description', form.description);
      if (image) {
        formData.append('image', image);
      }

      if (editing) {
        await api.put(`car-models/${editing.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('car-models/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setShowModal(false);
      loadModels();
    } catch (err) {
      const errData = err.response?.data;
      setError(typeof errData === 'object' ? Object.values(errData).flat().join(' ') : 'حدث خطأ أثناء الحفظ');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا الموديل؟')) return;
    try {
      await api.delete(`car-models/${id}/`);
      loadModels();
    } catch {
      alert('فشل حذف الموديل');
    }
  };

  return (
    <div className="animate-fade-in select-none">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning-500 to-warning-400 flex items-center justify-center shadow-md shadow-warning-600/10">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">موديلات السيارات</h1>
            <p className="text-sm text-surface-400">إدارة الماركات والموديلات والسيارات المدعومة</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-white font-medium
              text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary-600/20 cursor-pointer">
            <Plus className="w-4 h-4" /> إضافة موديل
          </button>
        )}
      </div>

      <div className="relative mb-5">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
        <input type="text" value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pr-12 pl-4 py-3 rounded-xl bg-surface-900/50 border border-white/10 text-white
            placeholder-surface-500 focus:border-primary-500 transition-colors text-sm"
          placeholder="ابحث بالماركة أو الموديل..." />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-4 text-right text-surface-400 font-medium w-16">الصورة</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">الشركة المصنعة</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">الموديل</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium max-w-xs">الوصف التوضيحي</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">سنة البداية</th>
                <th className="px-5 py-4 text-right text-surface-400 font-medium">سنة النهاية</th>
                {(canEdit || canDelete) && (
                  <th className="px-5 py-4 text-center text-surface-400 font-medium w-28">إجراءات</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="py-12 text-center"><Loader2 className="w-6 h-6 text-primary-500 animate-spin mx-auto" /></td></tr>
              ) : models.length === 0 ? (
                <tr><td colSpan="7" className="py-12 text-center text-surface-500">لا توجد موديلات مضافة</td></tr>
              ) : (
                models.map((model) => (
                  <tr key={model.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                    <td className="px-5 py-2.5">
                      {model.image ? (
                        <img src={model.image} alt={model.brand} className="w-10 h-10 rounded-lg object-cover border border-white/5" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center">
                          <Car className="w-5 h-5 text-surface-650" />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-white font-bold">{model.brand}</td>
                    <td className="px-5 py-3.5 text-surface-200 font-semibold">{model.model_name}</td>
                    <td className="px-5 py-3.5 text-xs text-surface-450 truncate max-w-xs leading-relaxed">
                      {model.description ? model.description : <span className="text-surface-600 italic">لا يوجد وصف...</span>}
                    </td>
                    <td className="px-5 py-3.5 text-surface-300 font-mono">{model.year_start}</td>
                    <td className="px-5 py-3.5 text-surface-400 font-mono">{model.year_end || 'حتى الآن'}</td>
                    {(canEdit || canDelete) && (
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button onClick={() => openEdit(model)}
                              className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-all cursor-pointer">
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => handleDelete(model.id)}
                              className="p-2 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-all cursor-pointer">
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
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md mx-4 glass-card p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? 'تعديل موديل سيارة' : 'إضافة موديل جديد'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-surface-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="p-3 mb-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm animate-fade-in">{error}</div>}
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">الشركة المصنعة *</label>
                <input type="text" required value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} autoFocus
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10"
                  placeholder="مثال: Toyota, Hyundai" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">اسم الموديل *</label>
                <input type="text" required value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10"
                  placeholder="مثال: Hilux, Accent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">الوصف التوضيحي للسيارة</label>
                <textarea rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="تحدث باختصار عن السيارة أو فئاتها المدعومة..."
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">سنة البداية *</label>
                  <input type="number" required min="1900" max="2099" value={form.year_start}
                    onChange={(e) => setForm({ ...form, year_start: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-300 mb-1.5">سنة النهاية</label>
                  <input type="number" min="1900" max="2099" value={form.year_end}
                    onChange={(e) => setForm({ ...form, year_end: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" dir="ltr"
                    placeholder="حتى الآن" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">شعار أو صورة السيارة</label>
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

              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-xl bg-surface-800 text-surface-300 text-sm hover:bg-surface-700 transition-colors cursor-pointer">إلغاء</button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? 'تحديث' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
