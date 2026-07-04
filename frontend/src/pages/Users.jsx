import { useState, useEffect } from 'react';
import api from '../api/axios';
import { Users as UsersIcon, Plus, Trash2, X, Loader2, Save } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const emptyForm = { username:'', password:'', first_name:'', last_name:'', email:'', role:'employee' };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); try { const r = await api.get('users/'); setUsers(r.data.results||r.data); } catch{} finally { setLoading(false); } };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.post('users/', form); setShowModal(false); load(); }
    catch(err) { const d=err.response?.data; setError(typeof d==='object'?Object.values(d).flat().join(' '):'خطأ'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('حذف المستخدم؟')) return;
    try { await api.delete(`users/${id}/`); load(); } catch { alert('فشل'); }
  };

  const roleLabels = { manager:'مدير', supervisor:'مشرف', employee:'موظف' };
  const roleColors = { manager:'bg-primary-600/20 text-primary-300', supervisor:'bg-warning-500/20 text-warning-400', employee:'bg-accent-500/20 text-accent-400' };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-accent-500 flex items-center justify-center"><UsersIcon className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-xl font-bold text-white">المستخدمون</h1><p className="text-sm text-surface-400">إدارة الحسابات</p></div>
        </div>
        <button onClick={()=>{setForm(emptyForm);setError('');setShowModal(true);}} className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-white font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary-600/20"><Plus className="w-4 h-4" /> إضافة مستخدم</button>
      </div>

      <div className="glass-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-white/5">
        <th className="px-5 py-4 text-right text-surface-400 font-medium">المستخدم</th>
        <th className="px-5 py-4 text-right text-surface-400 font-medium">الاسم</th>
        <th className="px-5 py-4 text-right text-surface-400 font-medium">الدور</th>
        <th className="px-5 py-4 text-center text-surface-400 font-medium">إجراءات</th>
      </tr></thead><tbody>
        {loading ? <tr><td colSpan="4" className="py-12 text-center"><Loader2 className="w-6 h-6 text-primary-500 animate-spin mx-auto" /></td></tr>
        : users.length===0 ? <tr><td colSpan="4" className="py-12 text-center text-surface-500">لا يوجد مستخدمون</td></tr>
        : users.map(u=>(
          <tr key={u.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
            <td className="px-5 py-3.5 text-white font-medium">{u.username}</td>
            <td className="px-5 py-3.5 text-surface-300">{u.first_name} {u.last_name}</td>
            <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${roleColors[u.role]}`}>{roleLabels[u.role]}</span></td>
            <td className="px-5 py-3.5 text-center"><button onClick={()=>handleDelete(u.id)} className="p-2 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-all"><Trash2 className="w-4 h-4" /></button></td>
          </tr>
        ))}
      </tbody></table></div></div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={()=>setShowModal(false)}>
          <div className="w-full max-w-md mx-4 glass-card p-6 animate-scale-in" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-bold text-white">مستخدم جديد</h2><button onClick={()=>setShowModal(false)} className="p-2 rounded-lg text-surface-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            {error && <div className="p-3 mb-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <div><label className="block text-sm text-surface-300 mb-1.5">اسم المستخدم *</label><input type="text" required value={form.username} onChange={e=>setForm({...form,username:e.target.value})} autoFocus className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors" dir="ltr" /></div>
              <div><label className="block text-sm text-surface-300 mb-1.5">كلمة المرور *</label><input type="password" required minLength={8} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors" dir="ltr" /></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm text-surface-300 mb-1.5">الاسم الأول</label><input type="text" value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors" /></div><div><label className="block text-sm text-surface-300 mb-1.5">الاسم الأخير</label><input type="text" value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors" /></div></div>
              <div><label className="block text-sm text-surface-300 mb-1.5">الدور *</label><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-surface-900/50 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors"><option value="employee">موظف</option><option value="supervisor">مشرف</option><option value="manager">مدير</option></select></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={()=>setShowModal(false)} className="px-4 py-2.5 rounded-xl bg-surface-800 text-surface-300 text-sm hover:bg-surface-700 transition-colors">إلغاء</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all">{saving?<Loader2 className="w-4 h-4 animate-spin" />:<Save className="w-4 h-4" />} حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
