import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { FolderOpen, Plus, Edit3, Trash2, X, Loader2, Save, Image as ImageIcon } from 'lucide-react';

export default function Categories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canEdit = user?.role === 'manager' || user?.role === 'supervisor';
  const canDelete = user?.role === 'manager';

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await api.get('categories/');
      setCategories(res.data.results || res.data);
    } catch {} finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setImage(null);
    setImagePreview(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description || '');
    setImage(null);
    setImagePreview(cat.image || null);
    setError('');
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      if (image) {
        formData.append('image', image);
      }

      if (editing) {
        await api.put(`categories/${editing.id}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('categories/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setShowModal(false);
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.name?.[0] || 'حدث خطأ أثناء الحفظ');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذه الفئة؟')) return;
    try {
      await api.delete(`categories/${id}/`);
      loadCategories();
    } catch {
      alert('فشل حذف الفئة');
    }
  };

  return (
    <div className="animate-fade-in select-none">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-600 to-accent-400 flex items-center justify-center shadow-md shadow-accent-600/10">
            <FolderOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">الفئات</h1>
            <p className="text-sm text-surface-400">تصنيفات قطع الغيار</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-white font-medium
              text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary-600/20 cursor-pointer">
            <Plus className="w-4 h-4" /> إضافة فئة
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="col-span-full text-center py-20 text-surface-500">لا توجد فئات</div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="glass-card p-5 group hover:border-primary-500/20 transition-all duration-200">
              <div className="flex items-start gap-4">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="w-14 h-14 rounded-xl object-cover border border-white/5 flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-surface-900 border border-white/5 flex items-center justify-center flex-shrink-0">
                    <ImageIcon className="w-6 h-6 text-surface-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-0.5 truncate">{cat.name}</h3>
                  <p className="text-xs text-primary-400 font-semibold mb-2">{cat.parts_count || 0} قطعة</p>
                  {cat.description ? (
                    <p className="text-xs text-surface-450 line-clamp-2 leading-relaxed">{cat.description}</p>
                  ) : (
                    <p className="text-xs text-surface-600 italic">لا يوجد وصف...</p>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {canEdit && (
                    <button onClick={() => openEdit(cat)}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-all cursor-pointer">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => handleDelete(cat.id)}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-all cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md mx-4 glass-card p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? 'تعديل فئة' : 'فئة جديدة'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-surface-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="p-3 mb-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm animate-fade-in">{error}</div>}
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">اسم الفئة *</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} autoFocus
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">وصف القسم</label>
                <textarea rows="3" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف مختصر للفئة لتسهيل التصفح..."
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1.5">صورة الفئة التوضيحية</label>
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
