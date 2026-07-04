import { useState, useEffect } from 'react';
import api from '../api/axios';
import {
  Settings,
  Link2,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Save,
} from 'lucide-react';

export default function SettingsView() {
  // ──── Tab State ────
  const [activeTab, setActiveTab] = useState('branding'); // 'branding' | 'contacts'

  // ──── Site Branding States ────
  const [brandingForm, setBrandingForm] = useState({
    site_name: '',
    logo: '',
    hero_title: '',
    hero_subtitle: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMsg, setBrandingMsg] = useState('');
  const [brandingError, setBrandingError] = useState('');

  // ──── Contact Methods States ────
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactForm, setContactForm] = useState({
    platform_name: '',
    value: '',
    icon_name: 'Phone',
    is_active: true,
  });

  // ──── Icon List helper for Dropdown select ────
  const availableIcons = [
    { label: 'هاتف (Phone)', value: 'Phone' },
    { label: 'بريد الكتروني (Mail)', value: 'Mail' },
    { label: 'واتساب (MessageCircle)', value: 'MessageCircle' },
    { label: 'خريطة/موقع (MapPin)', value: 'MapPin' },
    { label: 'فيسبوك (Facebook)', value: 'Facebook' },
    { label: 'تويتر (Twitter)', value: 'Twitter' },
    { label: 'انستغرام (Instagram)', value: 'Instagram' },
    { label: 'موقع ويب (Globe)', value: 'Globe' },
  ];

  // ──── Fetch Site Settings ────
  const fetchBranding = async () => {
    setBrandingLoading(true);
    setBrandingError('');
    try {
      const res = await api.get('admin/settings/');
      setBrandingForm({
        site_name: res.data.site_name || '',
        logo: res.data.logo || '',
        hero_title: res.data.hero_title || '',
        hero_subtitle: res.data.hero_subtitle || '',
      });
    } catch {
      setBrandingError('فشل تحميل إعدادات الموقع');
    } finally {
      setBrandingLoading(false);
    }
  };

  // ──── Save Site Settings ────
  const saveBranding = async (e) => {
    e.preventDefault();
    setBrandingSaving(true);
    setBrandingError('');
    setBrandingMsg('');
    try {
      const formData = new FormData();
      formData.append('site_name', brandingForm.site_name);
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      formData.append('hero_title', brandingForm.hero_title);
      formData.append('hero_subtitle', brandingForm.hero_subtitle);

      const res = await api.put('admin/settings/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setBrandingForm({
        site_name: res.data.site_name || '',
        logo: res.data.logo || '',
        hero_title: res.data.hero_title || '',
        hero_subtitle: res.data.hero_subtitle || '',
      });
      setLogoFile(null);
      setBrandingMsg('تم حفظ إعدادات الموقع بنجاح');
      setTimeout(() => setBrandingMsg(''), 3000);
    } catch {
      setBrandingError('فشل حفظ التعديلات على إعدادات الموقع');
    } finally {
      setBrandingSaving(false);
    }
  };

  // ──── Fetch Contact Platforms ────
  const fetchContacts = async () => {
    setContactsLoading(true);
    setContactsError('');
    try {
      const res = await api.get('contact-methods/');
      setContacts(res.data.results || res.data);
    } catch {
      setContactsError('فشل تحميل وسائل الاتصال');
    } finally {
      setContactsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
    fetchContacts();
  }, []);

  // ──── Contact Actions ────
  const openCreateContact = () => {
    setEditingContact(null);
    setContactForm({
      platform_name: '',
      value: '',
      icon_name: 'Phone',
      is_active: true,
    });
    setShowContactModal(true);
  };

  const openEditContact = (c) => {
    setEditingContact(c);
    setContactForm({
      platform_name: c.platform_name,
      value: c.value,
      icon_name: c.icon_name || 'Phone',
      is_active: c.is_active,
    });
    setShowContactModal(true);
  };

  const saveContact = async (e) => {
    e.preventDefault();
    setContactSaving(true);
    try {
      if (editingContact) {
        await api.put(`contact-methods/${editingContact.id}/`, contactForm);
      } else {
        await api.post('contact-methods/', contactForm);
      }
      setShowContactModal(false);
      fetchContacts();
    } catch {
      alert('فشل حفظ وسيلة الاتصال');
    } finally {
      setContactSaving(false);
    }
  };

  const deleteContact = async (id) => {
    if (!confirm('هل أنت متأكد من حذف وسيلة الاتصال هذه؟')) return;
    try {
      await api.delete(`contact-methods/${id}/`);
      fetchContacts();
    } catch {
      alert('فشل حذف وسيلة الاتصال');
    }
  };

  const toggleContactStatus = async (c) => {
    try {
      await api.put(`contact-methods/${c.id}/`, {
        ...c,
        is_active: !c.is_active,
      });
      fetchContacts();
    } catch {
      alert('فشل تغيير حالة وسيلة الاتصال');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-white">إعدادات الموقع العام</h1>
        <p className="text-sm text-surface-400 mt-1">تخصيص الهوية والبراند ووسائل الاتصال للعملاء</p>
      </div>

      {/* Tabs Selector */}
      <div className="flex gap-2 p-1.5 bg-surface-900 rounded-xl max-w-md border border-white/5">
        <button
          onClick={() => setActiveTab('branding')}
          className={`flex-1 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-lg transition-all leading-normal ${
            activeTab === 'branding'
              ? 'gradient-primary text-white shadow-lg'
              : 'text-surface-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
            <Sliders className="w-4 h-4 flex-shrink-0" />
            <span>هوية الموقع (Branding)</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-lg transition-all leading-normal ${
            activeTab === 'contacts'
              ? 'gradient-primary text-white shadow-lg'
              : 'text-surface-400 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
            <Link2 className="w-4 h-4 flex-shrink-0" />
            <span>وسائل الاتصال (Contacts)</span>
          </div>
        </button>
      </div>

      {/* ──── TAB 1: Site Branding Form ──── */}
      {activeTab === 'branding' && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-400" />
            تعديل معلومات وتصميم الواجهة
          </h2>

          {brandingLoading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-2" />
              <p className="text-surface-400 text-sm">جاري تحميل إعدادات الموقع العام...</p>
            </div>
          ) : (
            <form onSubmit={saveBranding} className="space-y-5 max-w-2xl">
              {brandingMsg && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-success-500/10 border border-success-500/20 text-success-400 text-sm animate-fade-in">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{brandingMsg}</span>
                </div>
              )}
              {brandingError && (
                <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm animate-fade-in">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{brandingError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm text-surface-300 mb-2 font-medium">اسم الموقع العام *</label>
                  <input
                    type="text"
                    required
                    value={brandingForm.site_name}
                    onChange={(e) => setBrandingForm({ ...brandingForm, site_name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-surface-950/60 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10"
                    placeholder="مثال: قطع غيار التميز"
                  />
                </div>
                <div>
                  <label className="block text-sm text-surface-300 mb-2 font-medium">شعار الموقع (صورة الشعار)</label>
                  <div className="flex items-center gap-3">
                    {brandingForm.logo && (
                      <img
                        src={
                          brandingForm.logo.startsWith('data:') || brandingForm.logo.startsWith('blob:') || brandingForm.logo.startsWith('http')
                            ? brandingForm.logo
                            : brandingForm.logo.startsWith('/')
                              ? brandingForm.logo
                              : `/media/${brandingForm.logo}`
                        }
                        alt="الشعار الحالي"
                        className="w-10 h-10 rounded-xl object-contain bg-surface-950/80 border border-white/10 p-1 flex-shrink-0"
                        onError={(e) => {
                          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';
                          const backendBase = apiBase.replace(/\/api\/?$/, '');
                          e.target.src = `${backendBase}${brandingForm.logo.startsWith('/') ? '' : '/'}${brandingForm.logo}`;
                        }}
                      />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setLogoFile(file);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setBrandingForm({ ...brandingForm, logo: reader.result });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs text-surface-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-600/10 file:text-primary-400 hover:file:bg-primary-600/20 file:cursor-pointer cursor-pointer bg-surface-950/60 border border-white/10 rounded-xl px-3 py-1.5 h-10 flex items-center"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-surface-300 mb-2 font-medium">عنوان قسم الترحيب (Hero Title) *</label>
                <input
                  type="text"
                  required
                  value={brandingForm.hero_title}
                  onChange={(e) => setBrandingForm({ ...brandingForm, hero_title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-950/60 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10"
                  placeholder="مثال: نضمن قطع غيار أصلية تدوم طويلاً لسيارتك"
                />
              </div>

              <div>
                <label className="block text-sm text-surface-300 mb-2 font-medium">الوصف الترحيبي (Hero Subtitle) *</label>
                <textarea
                  rows="4"
                  required
                  value={brandingForm.hero_subtitle}
                  onChange={(e) => setBrandingForm({ ...brandingForm, hero_subtitle: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-surface-950/60 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors"
                  placeholder="اكتب نبذة أو وصفاً مختصراً يظهر تحت العنوان الرئيسي في صفحة الهبوط"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={brandingSaving}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 h-10 px-6 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  {brandingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>حفظ التعديلات الهوية</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ──── TAB 2: Contact Methods List & CRUD ──── */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary-400" />
              وسائل اتصال العملاء على الصفحة العامة
            </h2>
            <button
              onClick={openCreateContact}
              className="flex items-center justify-center gap-2 h-10 px-4 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all w-full sm:w-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة وسيلة اتصال</span>
            </button>
          </div>

          {contactsLoading ? (
            <div className="glass-card py-20 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-2" />
              <p className="text-surface-400 text-sm">جاري تحميل وسائل الاتصال...</p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="glass-card py-16 flex flex-col items-center justify-center text-center">
              <HelpCircle className="w-10 h-10 text-surface-600 opacity-30 mb-3" />
              <h3 className="font-bold text-white text-base">لا توجد وسائل اتصال مسجلة</h3>
              <p className="text-xs text-surface-400 mt-1">أضف أرقام هواتف، روابط فيسبوك، أو واتساب لتظهر للجمهور.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table view */}
              <div className="hidden md:block glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 bg-surface-900/30">
                        <th className="px-5 py-4 text-right text-surface-400 font-medium">المنصة</th>
                        <th className="px-5 py-4 text-right text-surface-400 font-medium">القيمة / الرابط</th>
                        <th className="px-5 py-4 text-right text-surface-400 font-medium">أيقونة Lucide</th>
                        <th className="px-5 py-4 text-center text-surface-400 font-medium">الحالة</th>
                        <th className="px-5 py-4 text-center text-surface-400 font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => (
                        <tr key={c.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                          <td className="px-5 py-3.5 text-white font-medium">{c.platform_name}</td>
                          <td className="px-5 py-3.5 text-surface-300 font-mono select-all">{c.value}</td>
                          <td className="px-5 py-3.5 text-surface-400 text-xs">{c.icon_name}</td>
                          <td className="px-5 py-3.5 text-center">
                            <button
                              onClick={() => toggleContactStatus(c)}
                              className="text-surface-400 hover:text-white transition-colors"
                            >
                              {c.is_active ? (
                                <span className="px-2 py-0.5 rounded bg-success-500/10 text-success-400 text-[10px] font-semibold">نشط</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-surface-800 text-surface-400 text-[10px] font-semibold">غير نشط</span>
                              )}
                            </button>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openEditContact(c)}
                                className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteContact(c.id)}
                                className="p-2 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden space-y-3">
                {contacts.map((c) => (
                  <div key={c.id} className="glass-card p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="font-semibold text-white text-sm">{c.platform_name}</span>
                      <button
                        onClick={() => toggleContactStatus(c)}
                        className="flex items-center"
                      >
                        {c.is_active ? (
                          <ToggleRight className="w-8 h-8 text-primary-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-surface-600" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-surface-300 font-mono truncate select-all">{c.value}</p>
                    <div className="flex items-center gap-2 pt-1.5">
                      <button
                        onClick={() => openEditContact(c)}
                        className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary-600/10 text-primary-400 text-xs font-semibold hover:bg-primary-600/20 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => deleteContact(c.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-danger-500/10 text-danger-400 text-xs font-semibold hover:bg-danger-500/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ──── CRUD Contact Modal Dialog ──── */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md glass-card p-6 space-y-5 animate-scale-in">
            {/* Modal Title */}
            <div className="border-b border-white/5 pb-3">
              <h3 className="text-lg font-bold text-white">
                {editingContact ? 'تعديل وسيلة الاتصال' : 'إضافة وسيلة اتصال جديدة'}
              </h3>
            </div>

            {/* Modal Form */}
            <form onSubmit={saveContact} className="space-y-4">
              <div>
                <label className="block text-sm text-surface-300 mb-1.5">اسم المنصة *</label>
                <input
                  type="text"
                  required
                  value={contactForm.platform_name}
                  onChange={(e) => setContactForm({ ...contactForm, platform_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10"
                  placeholder="مثال: رقم الهاتف، بريد المبيعات، فيسبوك..."
                />
              </div>

              <div>
                <label className="block text-sm text-surface-300 mb-1.5">القيمة / الرابط *</label>
                <input
                  type="text"
                  required
                  value={contactForm.value}
                  onChange={(e) => setContactForm({ ...contactForm, value: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10"
                  placeholder="مثال: +249123456789 أو الرابط الإلكتروني للمنصة"
                />
              </div>

              <div>
                <label className="block text-sm text-surface-300 mb-1.5">أيقونة المنصة *</label>
                <select
                  value={contactForm.icon_name}
                  onChange={(e) => setContactForm({ ...contactForm, icon_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10 cursor-pointer"
                >
                  {availableIcons.map((ico) => (
                    <option key={ico.value} value={ico.value}>
                      {ico.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1 pb-2">
                <input
                  type="checkbox"
                  id="contact-active"
                  checked={contactForm.is_active}
                  onChange={(e) => setContactForm({ ...contactForm, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-white/10 text-primary-600 focus:ring-0 bg-surface-900 cursor-pointer"
                />
                <label htmlFor="contact-active" className="text-sm text-surface-300 cursor-pointer select-none">
                  عرض وسيلة الاتصال هذه على الصفحة للجمهور
                </label>
              </div>

              {/* Modal buttons */}
              <div className="flex gap-3 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="flex-1 h-10 rounded-xl bg-surface-800 text-surface-300 text-sm hover:bg-surface-700 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={contactSaving}
                  className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  {contactSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>حفظ البيانات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
