import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Wrench, Layers, Car, Search, Trash2, ArrowRight,
  Loader2, Info, Grid, SlidersHorizontal, ChevronDown, ChevronUp,
  ShoppingCart, ShoppingBag, X, CheckSquare, Send, CheckCircle, Download,
  Smartphone, Share2, PlusSquare, MoreVertical
} from 'lucide-react';
import { useCart } from '../context/CartContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';
  const backendBase = apiBase.replace(/\/api\/?$/, '');
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default function FilterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, cartTotal } = useCart();

  // ──── Cart & Checkout Drawer States ────
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ customer_name: '', phone_number: '', email: '', location: '' });
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);



  // ──── States ────
  const [categories, setCategories] = useState([]);
  const [carModels, setCarModels] = useState([]);
  const [parts, setParts] = useState([]);
  
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCarModel, setSelectedCarModel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [partsLoading, setPartsLoading] = useState(false);
  const [siteName, setSiteName] = useState('محل قطع الغيار');

  // Mobile filters collapse toggle
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // ──── Initial Load: Settings, Categories & CarModels ────
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}public/settings/`);
        if (res.data.settings) {
          setSiteName(res.data.settings.site_name);
        }
        if (res.data.categories) {
          setCategories(res.data.categories);
        }
        if (res.data.car_models) {
          setCarModels(res.data.car_models);
        }

        // Prefill filters from URL if present
        const catUrl = searchParams.get('category_id');
        const carUrl = searchParams.get('car_model_id');
        if (catUrl) setSelectedCategory(catUrl);
        if (carUrl) setSelectedCarModel(carUrl);
      } catch (err) {
        console.error('Error fetching search metadata:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMetadata();
  }, []);

  // ──── Fetch Parts on Filter / Search Change ────
  useEffect(() => {
    const fetchFilteredParts = async () => {
      setPartsLoading(true);
      try {
        const params = {};
        if (selectedCategory) params.category_id = selectedCategory;
        if (selectedCarModel) params.car_model_id = selectedCarModel;
        if (searchQuery) params.search = searchQuery;

        const res = await axios.get(`${API_BASE_URL}public/parts/`, { params });
        setParts(res.data);

        // Keep URL Search Params synced
        const nextParams = {};
        if (selectedCategory) nextParams.category_id = selectedCategory;
        if (selectedCarModel) nextParams.car_model_id = selectedCarModel;
        setSearchParams(nextParams);
      } catch (err) {
        console.error('Error fetching filtered parts:', err);
      } finally {
        setPartsLoading(false);
      }
    };

    // Debounce/Timeout search queries slightly to avoid excessive backend hitting
    const delayDebounce = setTimeout(() => {
      fetchFilteredParts();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [selectedCategory, selectedCarModel, searchQuery]);

  const handleClearFilters = () => {
    setSelectedCategory('');
    setSelectedCarModel('');
    setSearchQuery('');
    setSearchParams({});
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

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ج.س';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-950 text-surface-200">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
        <p className="text-sm font-semibold text-surface-400">جاري تحميل دليل قطع الغيار...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 select-none relative overflow-hidden font-sans pb-12" dir="rtl">
      {/* Dynamic Glow effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-1/3 w-[500px] h-[500px] rounded-full bg-primary-600/5 blur-[130px]" />
        <div className="absolute bottom-10 left-10 w-[400px] h-[400px] rounded-full bg-accent-500/3 blur-[120px]" />
      </div>

      {/* ──── HEADER BAR ──── */}
      <header className="sticky top-0 z-40 bg-surface-950/80 backdrop-blur-md border-b border-white/5 py-4 w-full">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-all cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              العودة للرئيسية
            </button>

          </div>
          <span className="font-extrabold text-white text-base tracking-tight">{siteName} | المتجر</span>
        </div>
      </header>

      {/* ──── MAIN CATALOG WRAPPER ──── */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 relative z-10 space-y-8">
        
        {/* Title segment */}
        <div className="text-right space-y-2">
          <h1 className="text-2xl md:text-3xl font-black text-white">البحث الذكي ودليل قطع الغيار</h1>
          <p className="text-xs md:text-sm text-surface-400">ابحث بذكاء عن طريق تحديد القسم أو موديل السيارة والنوع المطلوب</p>
        </div>

        {/* ──── RESPONSIVE SEARCH & FILTERS LAYOUT ──── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Mobile filter Toggle trigger button */}
          <div className="lg:hidden w-full">
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className="w-full flex items-center justify-between h-12 px-4 rounded-xl bg-surface-900 border border-white/10 text-white font-bold text-xs cursor-pointer shadow-md"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary-400" />
                خيارات وفلاتر البحث
              </span>
              {mobileFiltersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* ──── FILTER SIDEBAR PANEL (Collapsible on mobile) ──── */}
          <div className={`${mobileFiltersOpen ? 'block' : 'hidden'} lg:block lg:col-span-1 glass-card p-6 space-y-6 animate-fade-in`}>
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary-400" />
                تصفية النتائج
              </h2>
              {(selectedCategory || selectedCarModel || searchQuery) && (
                <button
                  onClick={handleClearFilters}
                  className="text-[10px] text-danger-400 hover:text-danger-300 flex items-center gap-1 cursor-pointer font-semibold"
                >
                  <Trash2 className="w-3 h-3" />
                  مسح الفلاتر
                </button>
              )}
            </div>

            {/* Keyword Search text input */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-surface-300">بحث بالكلمات المفتاحية</label>
              <div className="relative">
                <Search className="absolute right-3 top-3 w-4 h-4 text-surface-550" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-surface-950/60 border border-white/10 text-white rounded-xl text-xs focus:border-primary-500 transition-colors h-10"
                  placeholder="اسم القطعة أو الرقم..."
                />
              </div>
            </div>

            {/* Category selection list/dropdown */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-surface-300">تصنيف الأقسام (الأقسام)</label>
              <div className="relative">
                <Layers className="absolute right-3 top-3 w-4 h-4 text-surface-550" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-surface-950/80 border border-white/10 text-white rounded-xl text-xs focus:border-primary-500 transition-colors h-10 appearance-none cursor-pointer"
                >
                  <option value="">كافة الأقسام</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.parts_count || 0})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute left-3 top-3 w-4 h-4 text-surface-500 pointer-events-none" />
              </div>
            </div>

            {/* Car Model compatibility selection list/dropdown */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-surface-300">موديلات السيارات المتوافقة</label>
              <div className="relative">
                <Car className="absolute right-3 top-3 w-4 h-4 text-surface-550" />
                <select
                  value={selectedCarModel}
                  onChange={(e) => setSelectedCarModel(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-surface-950/80 border border-white/10 text-white rounded-xl text-xs focus:border-primary-500 transition-colors h-10 appearance-none cursor-pointer"
                >
                  <option value="">كافة السيارات</option>
                  {carModels.map((car) => (
                    <option key={car.id} value={car.id}>
                      {car.brand} {car.model_name} ({car.year_start}-{car.year_end || 'الآن'})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute left-3 top-3 w-4 h-4 text-surface-500 pointer-events-none" />
              </div>
            </div>

            {/* Quick stats in filters */}
            <div className="pt-4 border-t border-white/5 text-[10px] text-surface-450 space-y-1 font-semibold">
              <p>النتائج المطابقة: {parts.length} قطعة غيار متوفرة</p>
            </div>
          </div>

          {/* ──── PARTS RESULTS SECTION ──── */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Loading Indicator inside grid */}
            {partsLoading ? (
              <div className="glass-card py-24 flex flex-col items-center justify-center text-center">
                <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
                <p className="text-xs text-surface-450 font-bold">جاري تحديث قائمة المنتجات...</p>
              </div>
            ) : parts.length === 0 ? (
              
              /* ──── EMPTY STATE ──── */
              <div className="glass-card py-20 px-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-surface-900 border border-white/5 flex items-center justify-center text-surface-600">
                  <Grid className="w-8 h-8 opacity-40" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">لا توجد قطع غيار مطابقة لبحثك</h3>
                  <p className="text-xs text-surface-450 max-w-sm leading-relaxed">
                    جرب تغيير خيارات التصفية أو كتابة رقم الجزء بشكل مغاير، أو تواصل معنا للاستفسار عنها مباشرة.
                  </p>
                </div>
                <button
                  onClick={handleClearFilters}
                  className="h-10 px-6 rounded-xl bg-surface-900 border border-white/10 text-white text-xs font-semibold hover:bg-surface-800 transition-colors cursor-pointer"
                >
                  إعادة تعيين خيارات البحث
                </button>
              </div>
            ) : (
              
              /* ──── SPARE PARTS GRID ──── */
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {parts.map((part) => (
                  <div
                    key={part.id}
                    className="glass-card flex flex-col group overflow-hidden border border-white/5 hover:border-primary-500/30 transition-all duration-300 shadow-md"
                  >
                    {/* Part Image display */}
                    <div className="h-44 w-full bg-gradient-to-br from-surface-900 to-surface-950 flex items-center justify-center relative border-b border-white/3 overflow-hidden">
                      {part.image ? (
                        <img src={getImageUrl(part.image)} alt={part.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <Wrench className="w-10 h-10 text-surface-800 opacity-40 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300" />
                      )}
                      
                      <span className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-primary-600/20 border border-primary-500/30 text-primary-400 text-[10px] font-bold">
                        {part.category?.name || 'غير مصنف'}
                      </span>
                      {part.stock_quantity === 0 && (
                        <span className="absolute inset-0 bg-surface-950/70 backdrop-blur-[2px] flex items-center justify-center text-danger-400 font-extrabold text-xs">
                          غير متوفر حالياً
                        </span>
                      )}
                    </div>

                    {/* Metadata Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div>
                          <h3 className="text-xs md:text-sm font-extrabold text-white group-hover:text-primary-400 transition-colors line-clamp-1">{part.name}</h3>
                        </div>

                        {/* Description snippet */}
                        {part.description ? (
                          <p className="text-[10px] text-surface-450 line-clamp-2 leading-relaxed h-[32px]">{part.description}</p>
                        ) : (
                          <p className="text-[10px] text-surface-600 italic h-[32px]">لا يتوفر تفاصيل إضافية...</p>
                        )}

                        {/* Compatible vehicle badges */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1 max-h-[44px] overflow-hidden">
                            {part.compatible_cars && part.compatible_cars.length > 0 ? (
                              part.compatible_cars.map((car) => (
                                <span key={car.id} className="px-1.5 py-0.5 rounded bg-surface-950 text-surface-300 text-[8px] font-medium border border-white/3">
                                  {car.brand} {car.model_name}
                                </span>
                              ))
                            ) : (
                              <span className="text-surface-650 text-[9px]">-</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Pricing and Action CTAs */}
                      <div className="pt-3 border-t border-white/5 flex flex-col gap-2 mt-auto">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-surface-500 font-bold">السعر المقدر</span>
                          <span className="text-xs md:text-sm font-extrabold text-accent-400">{formatCurrency(part.selling_price)}</span>
                        </div>

                        {/* Add to Cart Button */}
                        <button
                          disabled={part.stock_quantity === 0}
                          onClick={() => {
                            addToCart(part);
                            setCartOpen(true);
                          }}
                          className={`w-full h-8.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${part.stock_quantity === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <ShoppingCart className="w-3.5 h-3.5 text-white" />
                          أضف إلى السلة
                        </button>

                        <button
                          onClick={() => navigate(`/product/${part.id}`)}
                          className="w-full h-8.5 rounded-lg bg-surface-900 border border-white/5 hover:border-primary-500/20 text-white text-[11px] font-bold hover:bg-surface-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5 text-primary-400" />
                          عرض التفاصيل
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ──── Floating Cart Icon ──── */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all animate-bounce cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' }}
        >
          <div className="relative">
            <ShoppingCart className="w-6 h-6" />
            <span className="absolute -top-3.5 -right-3.5 px-2 py-0.5 rounded-full bg-danger-500 text-white text-[10px] font-black border border-white">
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
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-surface-900 text-white">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-primary-400" />
                  <h3 className="font-extrabold text-sm md:text-base">سلة التسوق ({cartCount})</h3>
                </div>
                <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cart Items list */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {cart.length === 0 ? (
                  <div className="text-center py-20 text-gray-400 space-y-3">
                    <ShoppingBag className="w-12 h-12 mx-auto opacity-30 animate-pulse" />
                    <p className="text-xs font-semibold">سلة التسوق فارغة حالياً</p>
                    <a href="/shop" onClick={(e) => { e.preventDefault(); setCartOpen(false); }} className="text-primary-500 text-xs font-bold block underline">تصفح المنتجات الآن</a>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.part.id} className="flex gap-4 p-3 rounded-2xl bg-gray-50 border border-gray-100 relative group overflow-hidden">
                      <div className="w-16 h-16 rounded-xl bg-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {item.part.image ? (
                          <img src={getImageUrl(item.part.image)} alt={item.part.name} className="w-full h-full object-cover" />
                        ) : (
                          <Wrench className="w-6 h-6 text-gray-450" />
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
                          <span className="text-xs font-extrabold text-danger-600 font-mono">{formatCurrency(item.part.selling_price * item.quantity)}</span>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(item.part.id)} className="absolute top-2 left-2 text-gray-400 hover:text-danger-500 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
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
                    <span className="text-base font-black text-danger-600 font-mono">{formatCurrency(cartTotal)}</span>
                  </div>
                  
                  <button
                    onClick={() => setCheckoutOpen(true)}
                    className="w-full py-3 rounded-xl bg-danger-600 hover:bg-danger-700 hover:shadow-lg text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer leading-normal"
                  >
                    <CheckSquare className="w-4 h-4" />
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
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center space-y-2 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary-100 border border-primary-200 text-primary-600 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">إتمام طلب الشراء</h3>
              <p className="text-[11px] text-gray-500">الرجاء إدخال معلوماتك لتأكيد حجز قطع الغيار وتسهيل التواصل معك.</p>
            </div>

            {checkoutSuccess ? (
              <div className="p-6 text-center space-y-3 bg-green-50 border border-green-150 rounded-2xl animate-fade-in text-green-700">
                <CheckCircle className="w-12 h-12 mx-auto animate-bounce text-green-500" />
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
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none h-10 transition-colors"
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
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none h-10 transition-colors"
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
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none h-10 transition-colors"
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
                    className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none h-10 transition-colors"
                    placeholder="مثال: الرياض، الخرطوم، بحري..."
                  />
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-3 border-t border-gray-100 pt-3">
                    <span>المجموع النهائي:</span>
                    <span className="text-danger-600 text-sm font-black font-mono">{formatCurrency(cartTotal)}</span>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={checkoutLoading}
                    className="w-full py-3 rounded-xl bg-danger-600 hover:bg-danger-700 hover:shadow-lg text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer leading-normal disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري معالجة الطلب...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
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
