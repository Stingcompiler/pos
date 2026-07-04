import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowRight, MessageSquare, Wrench, Shield, CheckCircle,
  AlertTriangle, Layers, MapPin, Hash, Loader2
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';
  const backendBase = apiBase.replace(/\/api\/?$/, '');
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ──── States ────
  const [part, setPart] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [siteName, setSiteName] = useState('نظام قطع الغيار');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProductDetails();
  }, [id]);

  const fetchProductDetails = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch part detail
      const partRes = await axios.get(`${API_BASE_URL}public/parts/${id}/`);
      setPart(partRes.data);

      // 2. Fetch site settings for contact numbers
      const settingsRes = await axios.get(`${API_BASE_URL}public/settings/`);
      if (settingsRes.data.settings) {
        setSiteName(settingsRes.data.settings.site_name);
      }
      if (settingsRes.data.contact_methods) {
        setContacts(settingsRes.data.contact_methods);
      }
    } catch (err) {
      console.error(err);
      setError('عذراً، لم نتمكن من العثور على قطعة الغيار المطلوبة أو حدث خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ج.س';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-950 text-surface-200">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
        <p className="text-sm font-semibold text-surface-400">جاري تحميل تفاصيل قطعة الغيار...</p>
      </div>
    );
  }

  if (error || !part) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-950 text-surface-200 px-4">
        <div className="glass-card p-8 max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-warning-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">خطأ في التحميل</h2>
          <p className="text-xs text-surface-400 leading-relaxed">{error || 'حدث خطأ غير متوقع'}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full h-10 rounded-xl gradient-primary text-white font-semibold hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    );
  }

  // ──── Smart WhatsApp Number Extraction & Message Prefilling ────
  const whatsappContact = contacts.find(c =>
    c.platform_name.toLowerCase().includes('whatsapp') ||
    c.icon_name.toLowerCase().includes('whatsapp')
  );
  // Extracted plain digits. Fallback to common country code if not defined
  const rawNumber = whatsappContact ? whatsappContact.value.replace(/[^0-9]/g, '') : '249912345678';
  const partUrl = window.location.href;
  const messageText = `مرحباً ${siteName}، أود الاستفسار عن قطعة الغيار المعروضة في موقعكم:
الاسم: ${part.name}
السعر: ${formatCurrency(part.selling_price)}
الرابط: ${partUrl}`;
  const whatsappUrl = `https://wa.me/${rawNumber}?text=${encodeURIComponent(messageText)}`;

  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 select-none pb-24 lg:pb-12 relative overflow-hidden font-sans" dir="rtl">
      {/* Background radial overlays */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-primary-600/5 blur-[120px]" />
        <div className="absolute bottom-10 left-10 w-96 h-96 rounded-full bg-accent-500/4 blur-[140px]" />
      </div>

      {/* ──── Header bar ──── */}
      <header className="sticky top-0 z-40 bg-surface-950/80 backdrop-blur-md border-b border-white/5 py-4 w-full">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-all cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            العودة للمعرض
          </button>
          <span className="font-bold text-white text-sm tracking-tight">{siteName}</span>
        </div>
      </header>

      {/* ──── Main Content Layout ──── */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columns 1 & 2: Large image + Info + Specs + Compatibility */}
          <div className="lg:col-span-2 space-y-6">
            {/* Part Image container */}
            <div className="glass-card overflow-hidden bg-gradient-to-br from-surface-900 to-surface-950 border border-white/5 h-[320px] md:h-[420px] w-full flex items-center justify-center relative">
              {part.image ? (
                <img src={getImageUrl(part.image)} alt={part.name} className="w-full h-full object-contain p-4" />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Wrench className="w-16 h-16 text-surface-800 opacity-30 animate-pulse" />
                  <span className="text-xs text-surface-550 italic">لا تتوفر صورة لهذه القطعة حالياً</span>
                </div>
              )}
              {part.is_featured && (
                <span className="absolute top-4 right-4 px-3 py-1 rounded-xl bg-accent-500/20 text-accent-400 text-xs font-bold border border-accent-500/30">
                  منتج مميز
                </span>
              )}
            </div>

            {/* General Info block */}
            <div className="glass-card p-6 md:p-8 space-y-4">
              <div>
                <h1 className="text-xl md:text-2xl font-black text-white">{part.name}</h1>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-2xl font-black text-accent-400">{formatCurrency(part.selling_price)}</span>
                {part.stock_quantity > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success-500/10 border border-success-500/20 text-success-400 text-xs font-semibold">
                    <CheckCircle className="w-3.5 h-3.5" />
                    متوفر في المخزن
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs font-semibold animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    غير متوفر حالياً
                  </span>
                )}
              </div>

              {part.description ? (
                <div className="pt-2">
                  <h3 className="text-sm font-bold text-white mb-2">الوصف والمواصفات:</h3>
                  <p className="text-xs md:text-sm text-surface-400 leading-relaxed whitespace-pre-line bg-surface-950/30 p-4 rounded-xl border border-white/3">
                    {part.description}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-surface-550 italic">لا توجد تفاصيل إضافية مسجلة لهذه القطعة.</p>
              )}
            </div>

            {/* Specifications Box */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-white/5 pb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary-400" />
                المواصفات الفنية
              </h3>

              <div className="grid grid-cols-1 gap-4 text-xs">
                {part.category && (
                  <div className="col-span-full flex items-center gap-4 p-4 rounded-xl bg-surface-950/30 border border-white/3">
                    {part.category.image ? (
                      <img src={getImageUrl(part.category.image)} alt={part.category.name} className="w-12 h-12 rounded-lg object-cover border border-white/5" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-surface-900 flex items-center justify-center border border-white/5">
                        <Layers className="w-6 h-6 text-surface-600" />
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] text-surface-500 block">فئة قطعة الغيار</span>
                      <span className="text-white font-bold text-sm block mt-0.5">{part.category.name}</span>
                      {part.category.description && (
                        <p className="text-[10px] text-surface-450 leading-relaxed mt-1">{part.category.description}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Compatibility Section ("السيارات المتوافقة") */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-sm font-bold text-white border-b border-white/5 pb-3">سيارات متوافقة مع القطعة</h3>

              {part.compatible_cars && part.compatible_cars.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {part.compatible_cars.map((car) => (
                    <div key={car.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-950/30 border border-white/3 hover:border-warning-500/10 transition-all">
                      {car.image ? (
                        <img src={getImageUrl(car.image)} alt={car.brand} className="w-12 h-12 rounded-lg object-cover border border-white/5 flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center flex-shrink-0">
                          <Wrench className="w-5 h-5 text-surface-700" />
                        </div>
                      )}
                      <div className="overflow-hidden">
                        <span className="font-extrabold text-white text-xs block truncate">{car.brand} {car.model_name}</span>
                        <span className="text-[10px] text-surface-450 font-mono block mt-0.5">سنوات الموديل: {car.year_start} - {car.year_end || 'الآن'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-surface-550 italic">لا توجد سيارات متوافقة مسجلة لهذه القطعة حالياً.</p>
              )}
            </div>
          </div>

          {/* Column 3: Sticky details sidebar (desktop) */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="glass-card p-6 sticky top-24 space-y-6">
              <div className="space-y-2">
                <span className="text-xs text-surface-500 block">سعر البيع النهائي</span>
                <span className="text-3xl font-black text-accent-400 block">{formatCurrency(part.selling_price)}</span>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5 text-xs text-surface-400">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-success-500 flex-shrink-0" />
                  <span>قطعة أصلية مضمونة ومعتمدة</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-400 flex-shrink-0" />
                  <span>دعم فني واستشارة ملائمة قبل الشراء</span>
                </div>
              </div>

              {/* Giant CTA Button */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-600/25 cursor-pointer text-sm"
              >
                <MessageSquare className="w-5 h-5" />
                اطلب عبر الواتساب الآن
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* ──── Fixed-Bottom CTA Panel for Mobile screens ──── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-950/90 backdrop-blur-md border-t border-white/5 px-4 py-3 flex items-center justify-between gap-4 animate-slide-up">
        <div className="flex-shrink-0">
          <span className="text-[10px] text-surface-500 block">سعر البيع</span>
          <span className="text-base font-black text-accent-400">{formatCurrency(part.selling_price)}</span>
        </div>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all text-xs cursor-pointer shadow-md"
        >
          <MessageSquare className="w-4 h-4" />
          اطلب بالواتساب
        </a>
      </div>
    </div>
  );
}
