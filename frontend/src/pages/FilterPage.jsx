import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Wrench, Layers, Car, Search, Trash2, ArrowRight,
  Loader2, Info, Grid, SlidersHorizontal, ChevronDown, ChevronUp,
  ShoppingCart, ShoppingBag, X, CheckSquare, Send, CheckCircle, AlertTriangle, RefreshCw,
} from 'lucide-react';
import api from '../api/axios';
import { mediaUrl } from '../api/media';
import { useCart } from '../context/useCart';
import CheckoutModal from '../components/shop/CheckoutModal';
import { apiErrorMessage } from '../utils/api';
import { formatPrice } from '../utils/currency';

// روابط الصور تُبنى مركزياً من مساعد الميديا الموحّد (بدون أي نطاق مكتوب).
const getImageUrl = mediaUrl;

export default function FilterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cart, addToCart, removeFromCart, updateQuantity, cartCount, cartTotal } = useCart();

  // ──── Cart & Checkout Drawer States ────
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // ──── States ────
  const [categories, setCategories] = useState([]);
  const [carModels, setCarModels] = useState([]);
  const [parts, setParts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPage, setNextPage] = useState(null);

  // الفلاتر تبدأ من رابط الصفحة مرة واحدة (روابط الأقسام من الصفحة الرئيسية).
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('category_id') || '');
  const [selectedCarModel, setSelectedCarModel] = useState(() => searchParams.get('car_model_id') || '');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [metadataError, setMetadataError] = useState('');
  const [partsLoading, setPartsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [partsError, setPartsError] = useState('');
  const [siteName, setSiteName] = useState('اسبير');

  useEffect(() => {
    document.title = siteName ? `تصفح القطع | ${siteName}` : 'تصفح القطع';
  }, [siteName]);
  // رقم آخر طلب: ردّ بحث قديم يصل متأخراً لا يكتب فوق نتائج البحث الحالي.
  const requestId = useRef(0);

  // Mobile filters collapse toggle
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // ──── Initial Load: Settings, Categories & CarModels (مرة واحدة) ────
  const fetchMetadata = useCallback(async () => {
    setLoading(true);
    setMetadataError('');
    try {
      const res = await api.get('public/settings/');
      if (res.data.settings) setSiteName(res.data.settings.site_name);
      setCategories(res.data.categories || []);
      setCarModels(res.data.car_models || []);
    } catch (err) {
      setMetadataError(apiErrorMessage(err, 'تعذّر تحميل أقسام المتجر.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  const buildParams = useCallback((page) => {
    const params = { page };
    if (selectedCategory) params.category_id = selectedCategory;
    if (selectedCarModel) params.car_model_id = selectedCarModel;
    if (searchQuery.trim()) params.search = searchQuery.trim();
    return params;
  }, [selectedCategory, selectedCarModel, searchQuery]);

  // ──── Fetch Parts on Filter / Search Change (الصفحة الأولى) ────
  const fetchFirstPage = useCallback(async () => {
    const current = ++requestId.current;
    setPartsLoading(true);
    setPartsError('');
    try {
      const res = await api.get('public/parts/', { params: buildParams(1) });
      if (current !== requestId.current) return;
      setParts(res.data.results);
      setTotalCount(res.data.count);
      setNextPage(res.data.next ? 2 : null);
    } catch (err) {
      if (current !== requestId.current) return;
      // فشل التحميل ليس «لا توجد نتائج»: الزائر يحتاج أن يعرف ويعيد المحاولة.
      setPartsError(apiErrorMessage(err, 'تعذّر تحميل المنتجات.'));
    } finally {
      if (current === requestId.current) setPartsLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    // Keep URL Search Params synced
    const nextParams = {};
    if (selectedCategory) nextParams.category_id = selectedCategory;
    if (selectedCarModel) nextParams.car_model_id = selectedCarModel;
    setSearchParams(nextParams, { replace: true });

    // Debounce search queries slightly to avoid excessive backend hitting
    const delayDebounce = setTimeout(fetchFirstPage, 300);
    return () => clearTimeout(delayDebounce);
  }, [selectedCategory, selectedCarModel, fetchFirstPage, setSearchParams]);

  const loadMore = async () => {
    if (!nextPage || loadingMore) return;
    const current = requestId.current;
    setLoadingMore(true);
    try {
      const res = await api.get('public/parts/', { params: buildParams(nextPage) });
      if (current !== requestId.current) return;
      setParts((prev) => [...prev, ...res.data.results]);
      setNextPage(res.data.next ? nextPage + 1 : null);
    } catch (err) {
      setPartsError(apiErrorMessage(err, 'تعذّر تحميل المزيد من المنتجات.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedCategory('');
    setSelectedCarModel('');
    setSearchQuery('');
    setSearchParams({});
  };

  const formatCurrency = formatPrice;


  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-950 text-surface-200">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
        <p className="text-sm font-semibold text-surface-400">جاري تحميل دليل قطع الغيار...</p>
      </div>
    );
  }

  if (metadataError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface-950 text-surface-200 px-6 text-center" dir="rtl">
        <AlertTriangle className="w-10 h-10 text-warning-400" />
        <p className="text-sm font-semibold">{metadataError}</p>
        <button
          onClick={fetchMetadata}
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-primary-600 text-white text-xs font-bold hover:bg-primary-500 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
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
              <label htmlFor="shop-search" className="block text-xs font-semibold text-surface-300">بحث بالكلمات المفتاحية</label>
              <div className="relative">
                <Search className="absolute right-3 top-3 w-4 h-4 text-surface-550" />
                <input
                  id="shop-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 bg-surface-950/60 border border-white/10 text-white rounded-xl text-xs focus:border-primary-500 transition-colors h-10"
                  placeholder="اسم القطعة أو الرقم أو السيارة..."
                />
              </div>
            </div>

            {/* Category selection list/dropdown */}
            <div className="space-y-2">
              <label htmlFor="shop-category" className="block text-xs font-semibold text-surface-300">تصنيف الأقسام (الأقسام)</label>
              <div className="relative">
                <Layers className="absolute right-3 top-3 w-4 h-4 text-surface-550" />
                <select
                  id="shop-category"
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
              <label htmlFor="shop-car" className="block text-xs font-semibold text-surface-300">موديلات السيارات المتوافقة</label>
              <div className="relative">
                <Car className="absolute right-3 top-3 w-4 h-4 text-surface-550" />
                <select
                  id="shop-car"
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
              <p>النتائج المطابقة: {totalCount} قطعة غيار</p>
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
            ) : partsError && parts.length === 0 ? (
              <div className="glass-card py-20 px-6 flex flex-col items-center justify-center text-center space-y-4">
                <AlertTriangle className="w-10 h-10 text-warning-400" />
                <p className="text-sm font-bold text-white">{partsError}</p>
                <button
                  onClick={fetchFirstPage}
                  className="flex items-center gap-2 h-10 px-6 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-500 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  إعادة المحاولة
                </button>
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
                          {(part.brand || part.quality_grade_display) && (
                            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-surface-400">
                              {part.brand && <span>{part.brand}</span>}
                              {part.quality_grade_display && (
                                <span className="px-1.5 py-0.5 rounded bg-accent-500/15 text-accent-300 font-semibold">{part.quality_grade_display}</span>
                              )}
                            </p>
                          )}
                        </div>

                        {/* Description snippet */}
                        {part.description ? (
                          <p className="text-[10px] text-surface-300 line-clamp-2 leading-relaxed h-[32px]">{part.description}</p>
                        ) : (
                          <p className="h-[32px]" aria-hidden="true" />
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
                              <span className="text-surface-400 text-[9px]">قطعة عامة — تحقق من المواصفات</span>
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

            {!partsLoading && parts.length > 0 && (nextPage || partsError) && (
              <div className="flex flex-col items-center gap-2">
                {partsError && <p className="text-xs text-danger-400">{partsError}</p>}
                {nextPage && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 h-10 px-6 rounded-xl bg-surface-900 border border-white/10 text-white text-xs font-semibold hover:bg-surface-800 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                    تحميل المزيد ({parts.length} من {totalCount})
                  </button>
                )}
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
                <button onClick={() => setCartOpen(false)} aria-label="إغلاق السلة" className="text-gray-400 hover:text-white cursor-pointer">
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
                      <button onClick={() => removeFromCart(item.part.id)} aria-label={`حذف ${item.part.name} من السلة`} className="absolute top-2 left-2 text-gray-400 hover:text-danger-500 cursor-pointer">
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
        <CheckoutModal theme="default" onClose={() => setCheckoutOpen(false)} onOrdered={() => setCartOpen(false)} />
      )}
    </div>
  );
}
