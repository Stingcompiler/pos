import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as Icons from 'lucide-react';
import { motion } from 'framer-motion';
import { useCart } from '../context/CartContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';
  const backendBase = apiBase.replace(/\/api\/?$/, '');
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, cartTotal } = useCart();

  // ──── Cart & Checkout Drawer States ────
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ customer_name: '', phone_number: '', email: '', location: '' });
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);



  // ──── States ────
  const [settings, setSettings] = useState({
    site_name: 'محل قطع الغيار',
    logo: '',
    hero_title: 'أفضل قطع الغيار لسيارتك',
    hero_subtitle: 'نوفر أفضل قطع الغيار الأصلية والمضمونة لكافة أنواع السيارات بأسعار منافسة.',
  });
  const [contacts, setContacts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [carModels, setCarModels] = useState([]);
  const [featuredParts, setFeaturedParts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ──── Mobile Menu State ────
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ──── Contact Form States ────
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [formError, setFormError] = useState('');

  // ──── Fetch Branding & Featured Products ────
  const fetchData = async () => {
    try {
      // Fetch settings & contact methods & lists
      const settingsRes = await axios.get(`${API_BASE_URL}public/settings/`);
      if (settingsRes.data.settings) {
        setSettings(settingsRes.data.settings);
      }
      if (settingsRes.data.contact_methods) {
        setContacts(settingsRes.data.contact_methods);
      }
      if (settingsRes.data.categories) {
        setCategories(settingsRes.data.categories);
      }
      if (settingsRes.data.car_models) {
        setCarModels(settingsRes.data.car_models);
      }

      // Fetch featured products
      const partsRes = await axios.get(`${API_BASE_URL}public/featured-parts/`);
      setFeaturedParts(partsRes.data);
    } catch (err) {
      console.error('Error fetching public landing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ──── Form Submission ────
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormMsg('');
    setFormError('');

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setFormError('الرجاء تعبئة جميع الحقول المطلوبة (*)');
      setFormLoading(false);
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}public/contact/`, form);
      setFormMsg('تم إرسال رسالتك بنجاح! سنتواصل معك في أقرب وقت ممكن.');
      setForm({ name: '', email: '', phone: '', message: '' });
    } catch {
      setFormError('فشل إرسال الرسالة، الرجاء التحقق من المدخلات والمحاولة لاحقاً.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!checkoutForm.customer_name.trim() || !checkoutForm.phone_number.trim()) {
      alert('الرجاء تعبئة الاسم ورقم الهاتف لإكمال الطلب.');
      return;
    }
    setCheckoutLoading(true);
    try {
      const payload = {
        customer_name: checkoutForm.customer_name,
        phone_number: checkoutForm.phone_number,
        email: checkoutForm.email || null,
        location: checkoutForm.location || null,
        items: cart.map(item => ({
          spare_part: item.part.id,
          quantity: item.quantity
        }))
      };

      await axios.post(`${API_BASE_URL}public-orders/`, payload);
      setCheckoutSuccess(true);
      clearCart();
      setCheckoutForm({ customer_name: '', phone_number: '', email: '', location: '' });
      setTimeout(() => {
        setCheckoutSuccess(false);
        setCheckoutOpen(false);
        setCartOpen(false);
      }, 3000);
    } catch (err) {
      console.error('Checkout failed:', err);
      alert('فشل إرسال الطلب، يرجى المحاولة مرة أخرى.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ──── Icon Mapper ────
  const getIconComponent = (iconName) => {
    const Icon = Icons[iconName] || Icons.Phone;
    return <Icon className="w-5 h-5 text-primary-400 group-hover:scale-110 transition-transform duration-200" />;
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ج.س';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-950">
        <Icons.Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
        <p className="text-surface-400 text-sm font-semibold">جاري تحميل المعرض المميز...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 relative overflow-hidden select-none font-sans" dir="rtl">
      {/* Background Gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-1/4 w-80 h-80 rounded-full bg-dal-sky/5 blur-[120px] md:w-[600px] md:h-[600px]" />
        <div className="absolute top-1/3 left-0 w-72 h-72 rounded-full bg-dal-silver/5 blur-[100px] md:w-[500px] md:h-[500px]" />
      </div>

      {/* ──── HEADER / NAVIGATION ──── */}
      <header className="sticky top-0 z-40 bg-dal-dark/95 backdrop-blur-md border-b border-dal-dark py-4 w-full shadow-lg">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            {settings.logo ? (
              <img src={getImageUrl(settings.logo)} alt={settings.site_name} className="w-9 h-9 rounded-xl object-contain border border-white/10" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-dal-red flex items-center justify-center shadow-md shadow-red-600/20">
                <Icons.Wrench className="w-5 h-5 text-white" />
              </div>
            )}
            <span className="font-bold text-white text-lg tracking-tight select-none">{settings.site_name}</span>
          </div>

          {/* Desktop Nav Links (Visible on tablet/desktop) */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-semibold text-dal-silver">
            <a href="#hero" className="hover:text-white transition-colors duration-200">الرئيسية</a>
            <a href="/shop" onClick={(e) => { e.preventDefault(); navigate('/shop'); }} className="text-dal-sky hover:text-white font-bold transition-colors duration-200">تصفح المخزون</a>
            <a href="#categories" className="hover:text-white transition-colors duration-200">الأقسام</a>
            <a href="#vehicles" className="hover:text-white transition-colors duration-200">السيارات المدعومة</a>
            <a href="#featured" className="hover:text-white transition-colors duration-200">القطع المميزة</a>
            <a href="#contact" className="hover:text-white transition-colors duration-200">تواصل معنا</a>
            <button
              onClick={() => navigate('/admin')}
              className="py-2 px-5 rounded-xl bg-dal-red text-white text-xs lg:text-sm font-bold hover:bg-red-700 hover:shadow-lg transition-all shadow-md cursor-pointer leading-normal"
            >
              تسجيل دخول الموظفين
            </button>
          </nav>

          {/* Mobile Menu & PWA Install Controls */}
          <div className="flex items-center gap-3">


            {/* Mobile Menu Toggle Button (Hidden on tablet/desktop) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all h-10 w-10 flex items-center justify-center cursor-pointer"
            >
              {mobileMenuOpen ? <Icons.X className="w-5 h-5" /> : <Icons.Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mx-4 mt-3 p-4 bg-dal-dark/95 backdrop-blur-md rounded-2xl border border-white/5 flex flex-col gap-4 text-sm font-medium animate-scale-in text-dal-silver">
            <a href="#hero" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">الرئيسية</a>
            <a href="/shop" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); navigate('/shop'); }} className="px-3 py-2 rounded-xl text-dal-sky font-bold hover:text-white hover:bg-white/5 transition-colors">تصفح المخزون</a>
            <a href="#categories" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">الأقسام</a>
            <a href="#vehicles" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">السيارات المدعومة</a>
            <a href="#featured" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">القطع المميزة</a>
            <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">تواصل معنا</a>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/admin');
              }}
              className="w-full flex items-center justify-center py-2.5 rounded-xl bg-dal-red text-white font-bold shadow-lg hover:bg-red-700 transition-colors cursor-pointer leading-normal"
            >
              تسجيل دخول الموظفين
            </button>
          </div>
        )}
      </header>

      {/* ──── SECTION 1: HERO SECTION ──── */}
      <section id="hero" className="relative w-full z-10 py-12 md:py-24 px-4 md:px-8 bg-gradient-to-b from-dal-dark to-slate-900 text-white border-b border-slate-950/20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 flex flex-col items-center md:items-start text-center md:text-right space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-dal-sky/10 border border-dal-sky/25 text-dal-sky text-xs font-semibold animate-pulse">
              <Icons.CheckCircle className="w-3.5 h-3.5" />
              قطع غيار أصلية ومكفولة 100%
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight md:leading-normal">
              {settings.hero_title}
            </h1>
            <p className="text-xs md:text-base text-slate-350 max-w-xl leading-relaxed">
              {settings.hero_subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-md pt-2">
              <a
                href="/shop"
                onClick={(e) => { e.preventDefault(); navigate('/shop'); }}
                className="flex-1 flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl bg-dal-red text-white text-xs md:text-sm font-bold hover:bg-red-700 hover:shadow-lg transition-all shadow-lg shadow-red-600/25 leading-normal"
              >
                <Icons.Package className="w-4 h-4" />
                تصفح الأقسام والمنتجات
              </a>
              <a
                href="#contact"
                className="flex-1 flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl bg-slate-800/80 border border-dal-silver/30 text-white text-xs md:text-sm font-bold hover:bg-slate-700 transition-colors leading-normal"
              >
                <Icons.MessageSquare className="w-4 h-4" />
                تواصل معنا
              </a>
            </div>
          </motion.div>

          {/* Large decorative display for desktop (RTL brand identity layout) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex-1 hidden md:flex items-center justify-center relative"
          >
            <div className="w-72 h-72 rounded-full bg-dal-sky/10 absolute blur-3xl animate-pulse-soft" />
            <div className="glass-card p-8 border border-white/5 relative z-10 flex flex-col items-center gap-4 text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-dal-red flex items-center justify-center shadow-lg shadow-red-600/30">
                <Icons.Wrench className="w-8 h-8 text-white animate-bounce" />
              </div>
              <h3 className="text-lg font-black text-white">{settings.site_name}</h3>
              <p className="text-xs text-slate-350 leading-relaxed">تجد معنا كافة قطع غيار المحركات، الفرامل، الكهرباء والهيكل الخارجي بأعلى جودة مع كفالة شاملة.</p>
              <div className="flex items-center gap-2 text-xs text-dal-sky font-bold">
                <Icons.ShieldCheck className="w-4 h-4" />
                معتمدة ومضمونة 100%
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──── SECTION 2: BROWSE BY CATEGORY ("تسوق حسب القسم") ──── */}
      <section id="categories" className="w-full z-10 py-16 lg:py-24 border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-12 space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold text-dal-dark">تسوق حسب القسم</h2>
            <p className="text-xs md:text-sm text-gray-500">تصفح الفئات المختلفة لقطع غيار السيارات لتصل إلى ما تريد</p>
          </div>

          {categories.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">لا توجد أقسام متوفرة حالياً</div>
          ) : (
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-4 pb-4 md:grid md:grid-cols-3 lg:grid-cols-4 md:gap-6 md:pb-0 md:overflow-visible">
              {categories.map((cat) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden group hover:border-dal-sky/40 transition-all duration-300 cursor-pointer flex flex-col min-w-full md:min-w-0 snap-center"
                  onClick={() => navigate(`/shop?category_id=${cat.id}`)}
                >
                  <div className="h-32 md:h-40 bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative overflow-hidden border-b border-gray-100">
                    {cat.image ? (
                      <img src={getImageUrl(cat.image)} alt={cat.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <Icons.FolderOpen className="w-10 h-10 text-dal-sky opacity-60 group-hover:scale-110 transition-transform duration-300" />
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                    <div>
                      <h3 className="text-xs md:text-sm font-bold text-dal-dark group-hover:text-dal-sky transition-colors">{cat.name}</h3>
                      {cat.description && (
                        <p className="text-[10px] text-gray-500 line-clamp-1 mt-1 leading-normal">{cat.description}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-dal-sky block mt-2">{cat.parts_count || 0} منتج متوفر</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ──── SECTION 3: SUPPORTED VEHICLES ("سيارات ندعمها") ──── */}
      <section id="vehicles" className="w-full z-10 py-16 lg:py-24 border-t border-gray-150 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-12 space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold text-dal-dark">سيارات ندعمها ونوفر قطعها</h2>
            <p className="text-xs md:text-sm text-gray-500">ندعم مجموعة واسعة من السيارات بمختلف الموديلات والسنوات</p>
          </div>

          {carModels.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">لا توجد موديلات سيارات حالياً</div>
          ) : (
            /* Mobile: horizontal scroll | Desktop: responsive grid */
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-4 pb-4 md:grid md:grid-cols-3 lg:grid-cols-4 md:gap-6 md:pb-0 md:overflow-visible">
              {carModels.map((car) => (
                <motion.div
                  key={car.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden flex flex-col group hover:border-dal-sky/40 transition-all duration-300 cursor-pointer min-w-full md:min-w-0 snap-center"
                  onClick={() => navigate(`/shop?car_model_id=${car.id}`)}
                >
                  <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative overflow-hidden border-b border-gray-100">
                    {car.image ? (
                      <img src={getImageUrl(car.image)} alt={car.brand} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <Icons.Car className="w-12 h-12 text-dal-sky opacity-60 group-hover:scale-110 transition-transform duration-300" />
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                    <div>
                      <h3 className="text-xs md:text-sm font-extrabold text-dal-dark group-hover:text-dal-sky transition-colors">{car.brand} {car.model_name}</h3>
                      <p className="text-[10px] text-gray-500 font-mono mt-1">الموديلات المدعومة: {car.year_start} - {car.year_end || 'الآن'}</p>
                      {car.description && (
                        <p className="text-[10px] text-gray-600 line-clamp-2 mt-2 leading-relaxed">{car.description}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ──── SECTION 4: FEATURED PARTS ("قطع غيار مميزة") ──── */}
      <section id="featured" className="w-full z-10 py-16 lg:py-24 border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-12 space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold text-dal-dark">القطع والمنتجات المميزة</h2>
            <p className="text-xs md:text-sm text-gray-500">مجموعة من أفضل قطع الغيار المضمونة المتوفرة حالياً</p>
          </div>

          {featuredParts.length === 0 ? (
            <div className="bg-white border border-gray-100 shadow-md rounded-2xl py-20 flex flex-col items-center justify-center text-center">
              <Icons.Layers className="w-12 h-12 text-gray-400 opacity-50 mb-3" />
              <h4 className="text-base font-bold text-dal-dark">لا توجد منتجات مميزة معروضة حالياً</h4>
              <p className="text-xs text-gray-500 mt-1">تفضل بزيارتنا في المعرض أو تواصل معنا للاستفسار عن أي قطعة غيار.</p>
            </div>
          ) : (
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-4 pb-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-8 md:pb-0 md:overflow-visible">
              {featuredParts.map((part) => (
                <motion.div
                  key={part.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className="bg-white border border-gray-100 shadow-md rounded-2xl flex flex-col group overflow-hidden hover:border-dal-sky/40 transition-all duration-300 min-w-full md:min-w-0 snap-center"
                >
                  {/* Part Image display */}
                  <div className="h-48 w-full bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative border-b border-gray-100 overflow-hidden">
                    {part.image ? (
                      <img src={getImageUrl(part.image)} alt={part.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <Icons.Wrench className="w-12 h-12 text-dal-sky opacity-60 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300" />
                    )}
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-dal-sky/10 border border-dal-sky/20 text-dal-sky text-[10px] font-semibold">
                      {part.category?.name || 'غير مصنف'}
                    </span>
                    {part.stock_quantity === 0 && (
                      <span className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center text-dal-red font-black text-sm">
                        غير متوفر حالياً
                      </span>
                    )}
                  </div>

                  {/* Part Metadata */}
                  <div className="p-5 flex-1 flex flex-col space-y-4 justify-between bg-white">
                    <div className="space-y-2">
                      <div>
                        <h3 className="text-sm md:text-base font-bold text-dal-dark group-hover:text-dal-sky transition-colors">{part.name}</h3>
                      </div>

                      {/* Truncated Description */}
                      {part.description ? (
                        <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{part.description}</p>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">لا يوجد تفاصيل إضافية...</p>
                      )}

                      {/* Compatible Car Badges */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-gray-500 block">السيارات المتوافقة:</span>
                        <div className="flex flex-wrap gap-1 max-h-[64px] overflow-hidden">
                          {part.compatible_cars && part.compatible_cars.length > 0 ? (
                            part.compatible_cars.map((car) => (
                              <span key={car.id} className="px-1.5 py-0.5 rounded bg-gray-100 text-dal-dark text-[9px] font-medium border border-gray-200/50">
                                {car.brand} {car.model_name}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400 text-[10px]">-</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pricing and view details button */}
                    <div className="pt-3 border-t border-gray-100 flex flex-col gap-3 mt-auto">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-500 font-semibold">سعر البيع</span>
                          <span className="text-sm md:text-base font-extrabold text-dal-red">{formatCurrency(part.selling_price)}</span>
                        </div>
                      </div>

                      {/* Add to Cart Button */}
                      <button
                        disabled={part.stock_quantity === 0}
                        onClick={() => {
                          addToCart(part);
                          setCartOpen(true);
                        }}
                        className={`w-full py-2 rounded-xl bg-dal-sky hover:bg-dal-sky/90 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer leading-normal ${part.stock_quantity === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Icons.ShoppingCart className="w-3.5 h-3.5 text-white" />
                        أضف إلى السلة
                      </button>

                      {/* View Details Button */}
                      <button
                        onClick={() => navigate(`/product/${part.id}`)}
                        className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer leading-normal"
                      >
                        <Icons.Info className="w-3.5 h-3.5 text-white" />
                        عرض التفاصيل
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ──── SECTION 5: CONTACT & CHANNELS SECTION ──── */}
      <section id="contact" className="w-full z-10 py-16 lg:py-24 border-t border-gray-150 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-12 space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold text-dal-dark">تواصل معنا الآن</h2>
            <p className="text-xs md:text-sm text-gray-500">تواصل مباشر مع فريق الدعم أو اترك لنا رسالة</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Dynamic Contact Methods list */}
            <div className="md:col-span-1 space-y-4">
              <h3 className="text-base font-bold text-dal-dark mb-2">قنوات الدعم والاتصال</h3>
              {contacts.length === 0 ? (
                <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100 text-center text-xs text-gray-400">
                  لا توجد وسائل تواصل مسجلة حالياً
                </div>
              ) : (
                contacts.map((c) => (
                  <a
                    key={c.id}
                    href={c.value.startsWith('http') ? c.value : `tel:${c.value}`}
                    target={c.value.startsWith('http') ? '_blank' : '_self'}
                    rel="noreferrer"
                    className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-dal-sky/40 hover:bg-gray-100 group transition-all duration-300"
                  >
                    <div className="w-10 h-10 rounded-xl bg-dal-sky/10 border border-dal-sky/20 text-dal-sky flex items-center justify-center group-hover:bg-dal-sky/20 transition-all flex-shrink-0">
                      {getIconComponent(c.icon_name)}
                    </div>
                    <div className="overflow-hidden">
                      <span className="font-bold text-dal-dark text-xs block">{c.platform_name}</span>
                      <span className="text-[11px] text-gray-500 truncate block mt-0.5" dir="ltr">
                        {c.value}
                      </span>
                    </div>
                  </a>
                ))
              )}
            </div>

            {/* Contact messages form */}
            <div className="md:col-span-2 bg-white border border-gray-100 shadow-md rounded-2xl p-6">
              <h3 className="text-base font-bold text-dal-dark mb-5 flex items-center gap-2">
                <Icons.Mail className="w-5 h-5 text-dal-sky" />
                أرسل لنا استفسارك مباشرة
              </h3>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {formMsg && (
                  <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 border border-green-150 text-green-700 text-sm animate-fade-in">
                    <Icons.CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{formMsg}</span>
                  </div>
                )}
                {formError && (
                  <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-150 text-red-700 text-sm animate-fade-in">
                    <Icons.AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">الاسم الكريم *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-dal-dark text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky transition-colors h-10 outline-none"
                      placeholder="اسمك الكامل"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">البريد الإلكتروني *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-dal-dark text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky transition-colors h-10 outline-none"
                      placeholder="name@example.com"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">رقم الهاتف (اختياري)</label>
                  <input
                     type="text"
                     value={form.phone}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })}
                     className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-dal-dark text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky transition-colors h-10 outline-none"
                     placeholder="رقم الجوال أو الواتساب"
                     dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">الرسالة أو استفسار القطعة *</label>
                  <textarea
                    rows="4"
                    required
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-dal-dark text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky transition-colors outline-none"
                    placeholder="اكتب نوع وموديل سيارتك والقطعة المطلوبة وسنرد عليك فوراً..."
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-dal-red text-white text-xs font-bold hover:bg-red-700 hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer leading-normal"
                  >
                    {formLoading ? (
                      <>
                        <Icons.Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري الإرسال...</span>
                      </>
                    ) : (
                      <>
                        <Icons.Send className="w-4 h-4" />
                        <span>إرسال الرسالة الآن</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ──── FOOTER ──── */}
      <footer className="bg-dal-dark border-t border-dal-dark py-10 relative z-10 text-center animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-4">
          <div className="flex justify-center items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-dal-red flex items-center justify-center shadow-md">
              <Icons.Wrench className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">{settings.site_name}</span>
          </div>
          <p className="text-xs text-dal-silver">
            جميع الحقوق محفوظة © {new Date().getFullYear()} {settings.site_name}
          </p>
          <p className="text-xs text-slate-500 font-semibold pt-1">
            Developed by Musab / Stingdev
          </p>
        </div>
      </footer>

      {/* ──── Floating Cart Icon ──── */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all animate-bounce cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' }}
        >
          <div className="relative">
            <Icons.ShoppingCart className="w-6 h-6" />
            <span className="absolute -top-3.5 -right-3.5 px-2 py-0.5 rounded-full bg-dal-red text-white text-[10px] font-black border border-white">
              {cartCount}
            </span>
          </div>
        </button>
      )}

      {/* ──── Cart Drawer ──── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          
          <div className="absolute inset-y-0 left-0 max-w-full flex">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col animate-slide-left text-slate-800">
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-dal-dark text-white">
                <div className="flex items-center gap-2">
                  <Icons.ShoppingCart className="w-5 h-5 text-dal-sky" />
                  <h3 className="font-extrabold text-sm md:text-base">سلة التسوق ({cartCount})</h3>
                </div>
                <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              {/* Cart Items list */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {cart.length === 0 ? (
                  <div className="text-center py-20 text-gray-400 space-y-3">
                    <Icons.ShoppingBag className="w-12 h-12 mx-auto opacity-30 animate-pulse" />
                    <p className="text-xs font-semibold">سلة التسوق فارغة حالياً</p>
                    <a href="/shop" onClick={(e) => { e.preventDefault(); setCartOpen(false); navigate('/shop'); }} className="text-dal-sky text-xs font-bold block underline">تصفح المنتجات الآن</a>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.part.id} className="flex gap-4 p-3 rounded-2xl bg-gray-50 border border-gray-100 relative group overflow-hidden">
                      <div className="w-16 h-16 rounded-xl bg-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {item.part.image ? (
                          <img src={getImageUrl(item.part.image)} alt={item.part.name} className="w-full h-full object-cover" />
                        ) : (
                          <Icons.Wrench className="w-6 h-6 text-gray-450" />
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-between overflow-hidden">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 truncate">{item.part.name}</h4>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">{item.part.part_number}</p>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-0.5 bg-white">
                            <button onClick={() => updateQuantity(item.part.id, item.quantity - 1)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-550 font-bold cursor-pointer">-</button>
                            <span className="text-xs font-mono w-6 text-center text-slate-800 font-bold">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.part.id, item.quantity + 1)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-550 font-bold cursor-pointer">+</button>
                          </div>
                          <span className="text-xs font-extrabold text-dal-red font-mono">{formatCurrency(item.part.selling_price * item.quantity)}</span>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item.part.id)} className="absolute top-2 left-2 text-gray-400 hover:text-dal-red cursor-pointer">
                        <Icons.Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Total & Checkout button */}
              {cart.length > 0 && (
                <div className="p-6 border-t border-gray-100 space-y-4 bg-gray-50/50">
                  <div className="flex items-center justify-between text-slate-800">
                    <span className="text-xs font-semibold">إجمالي القيمة:</span>
                    <span className="text-base font-black text-dal-red font-mono">{formatCurrency(cartTotal)}</span>
                  </div>
                  
                  <button
                    onClick={() => setCheckoutOpen(true)}
                    className="w-full py-3 rounded-xl bg-dal-red hover:bg-red-700 hover:shadow-lg text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer leading-normal"
                  >
                    <Icons.CheckSquare className="w-4 h-4" />
                    إتمام الطلب الآن
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──── Checkout Modal ──── */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-800 relative animate-scale-in">
            <button onClick={() => setCheckoutOpen(false)} className="absolute top-4 left-4 text-gray-400 hover:text-slate-800 cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
            
            <div className="text-center space-y-2 mb-6">
              <div className="w-12 h-12 rounded-full bg-dal-sky/10 border border-dal-sky/20 text-dal-sky flex items-center justify-center mx-auto">
                <Icons.ShoppingBag className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">إتمام طلب الشراء</h3>
              <p className="text-[11px] text-gray-500">الرجاء إدخال معلوماتك لتأكيد حجز قطع الغيار وتسهيل التواصل معك.</p>
            </div>

            {checkoutSuccess ? (
              <div className="p-6 text-center space-y-3 bg-green-50 border border-green-150 rounded-2xl animate-fade-in text-green-700">
                <Icons.CheckCircle className="w-12 h-12 mx-auto animate-bounce text-green-500" />
                <h4 className="text-sm font-bold">تم إرسال طلبك بنجاح!</h4>
                <p className="text-xs">شكراً لك، تم استلام طلبك وسيتم إشعار الإدارة فوراً والتواصل معك قريباً.</p>
              </div>
            ) : (
              <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">الاسم الكامل *</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.customer_name}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky outline-none h-10 transition-colors"
                    placeholder="اسمك الكامل"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">رقم الهاتف الجوال *</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.phone_number}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, phone_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky outline-none h-10 transition-colors"
                    placeholder="رقم الهاتف للتواصل أو الواتساب"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    value={checkoutForm.email}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky outline-none h-10 transition-colors"
                    placeholder="name@example.com"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">العنوان / المنطقة *</label>
                  <input
                    type="text"
                    required
                    value={checkoutForm.location}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-dal-sky focus:ring-1 focus:ring-dal-sky outline-none h-10 transition-colors"
                    placeholder="مثال: الرياض، الخرطوم، بحري..."
                  />
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-3 border-t border-gray-100 pt-3">
                    <span>المجموع النهائي:</span>
                    <span className="text-dal-red text-sm font-black font-mono">{formatCurrency(cartTotal)}</span>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={checkoutLoading}
                    className="w-full py-3 rounded-xl bg-dal-red hover:bg-red-700 hover:shadow-lg text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer leading-normal disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <>
                        <Icons.Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري معالجة الطلب...</span>
                      </>
                    ) : (
                      <>
                        <Icons.Send className="w-4 h-4" />
                        <span>إرسال وتأكيد الطلب الآن</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
