import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, Check,
  Loader2, Package, AlertCircle, Receipt,
} from 'lucide-react';

export default function POS() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [bankName, setBankName] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [senderAccountNumber, setSenderAccountNumber] = useState('');
  const [activeTab, setActiveTab] = useState('products');
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);

  // New Customer Management States
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const customerSelectRef = useRef(null);

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Fetch customers on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await api.get('customers/');
        setCustomers(res.data.results || res.data);
      } catch (err) {
        console.error('Failed to fetch customers', err);
      }
    };
    fetchCustomers();
  }, []);

  // Click outside listener for customer selection dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerSelectRef.current && !customerSelectRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`spare-parts/search-pos/?q=${encodeURIComponent(query)}`);
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Add to cart
  const addToCart = (part) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === part.id);
      if (existing) {
        if (existing.quantity >= part.stock_quantity) return prev;
        return prev.map((item) =>
          item.id === part.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...part, quantity: 1 }];
    });
    setSearchQuery('');
    setSearchResults([]);
    searchRef.current?.focus();
  };

  // Update quantity
  const updateQuantity = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.stock_quantity) return item;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean)
    );
  };

  // Remove from cart
  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  // Calculate total
  const total = cart.reduce((sum, item) => sum + parseFloat(item.selling_price) * item.quantity, 0);

  // Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    setError('');

    try {
      const payload = {
        items: cart.map((item) => ({
          spare_part: item.id,
          quantity: item.quantity,
          unit_price: item.selling_price,
        })),
        payment_method: paymentMethod,
        customer: selectedCustomerId || null,
      };

      if (paymentMethod === 'bank') {
        payload.bank_name = bankName;
        payload.reference_id = referenceId;
        payload.sender_account_number = senderAccountNumber;
      }

      await api.post('invoices/', payload);
      setCart([]);
      setPaymentMethod('cash');
      setBankName('');
      setReferenceId('');
      setSenderAccountNumber('');
      setSelectedCustomerId('');
      setCustomerSearch('');
      setSuccessMsg('تمت عملية البيع بنجاح! ✅');
      setTimeout(() => setSuccessMsg(''), 4000);
      searchRef.current?.focus();
    } catch (err) {
      const errData = err.response?.data;
      if (errData && typeof errData === 'object') {
        const msg = Object.entries(errData)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(' ') : val}`)
          .join('\n');
        setError(msg || 'حدث خطأ أثناء إتمام البيع');
      } else {
        setError(errData?.detail || errData?.[0] || 'حدث خطأ أثناء إتمام البيع');
      }
    } finally {
      setCheckingOut(false);
    }
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  return (
    <div className="animate-fade-in h-[calc(100vh-48px)] flex flex-col lg:flex-row gap-5 pb-16 lg:pb-0">
      {/* ──── Left: Search & Results ──── */}
      <div className={`flex-1 flex flex-col min-w-0 ${activeTab === 'products' ? 'flex' : 'hidden lg:flex'}`}>
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
          <input
            ref={searchRef}
            id="pos-search"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pr-12 pl-4 py-4 rounded-2xl bg-surface-900/70 border border-white/10 text-white
              text-lg placeholder-surface-500 focus:border-primary-500 transition-all duration-200"
            placeholder="ابحث بالاسم أو رقم القطعة..."
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500 animate-spin" />
          )}
        </div>

        {/* Search Results */}
        <div className="flex-1 overflow-y-auto space-y-2 pl-1">
          {searchResults.length > 0 ? (
            searchResults.map((part) => {
              const inCart = cart.find((c) => c.id === part.id);
              return (
                <button
                  key={part.id}
                  onClick={() => addToCart(part)}
                  className="w-full text-right p-4 rounded-2xl glass-card hover:border-primary-500/30
                    hover:bg-primary-600/5 transition-all duration-200 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-base font-semibold text-white truncate">{part.name}</h3>
                        {part.category_name && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-300 whitespace-nowrap">
                            {part.category_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-surface-400">
                        <span dir="ltr">{part.part_number}</span>
                        <span>المخزون: {part.stock_quantity}</span>
                        {part.shelf_location && <span>الرف: {part.shelf_location}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mr-4">
                      <span className="text-lg font-bold text-accent-400">
                        {formatCurrency(part.selling_price)}
                      </span>
                      <div className="w-9 h-9 rounded-xl bg-primary-600/20 flex items-center justify-center
                        group-hover:bg-primary-600 transition-all duration-200">
                        <Plus className="w-4 h-4 text-primary-400 group-hover:text-white" />
                      </div>
                    </div>
                  </div>
                  {inCart && (
                    <p className="text-xs text-primary-400 mt-1">في السلة ({inCart.quantity})</p>
                  )}
                </button>
              );
            })
          ) : searchQuery && !searching ? (
            <div className="flex flex-col items-center justify-center py-20 text-surface-500">
              <Package className="w-12 h-12 mb-3 opacity-40" />
              <p>لا توجد نتائج لـ "{searchQuery}"</p>
            </div>
          ) : !searchQuery ? (
            <div className="flex flex-col items-center justify-center py-20 text-surface-500">
              <Search className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg">ابدأ بالبحث عن قطع الغيار</p>
              <p className="text-sm mt-1">اكتب اسم القطعة أو رقمها</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ──── Right: Cart ──── */}
      <div className={`w-full lg:w-[420px] flex-shrink-0 flex flex-col glass-card overflow-hidden ${activeTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
        {/* Cart Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-bold text-white">سلة المبيعات</h2>
          </div>
          <span className="text-sm text-surface-400">
            {cart.length} عناصر
          </span>
        </div>

        {/* Success Message */}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-success-500/10 border border-success-500/20 text-success-400 text-sm flex items-center gap-2 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {cart.length > 0 ? (
            cart.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-surface-900/50 border border-white/5 animate-slide-up"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">{item.name}</h4>
                    <p className="text-xs text-surface-400 mt-0.5" dir="ltr">{item.part_number}</p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-1.5 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10
                      transition-all duration-200"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-8 h-8 rounded-lg bg-surface-800 border border-white/10 flex items-center justify-center
                        text-surface-300 hover:text-white hover:border-primary-500/30 transition-all duration-200"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center text-sm font-bold text-white">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-8 h-8 rounded-lg bg-surface-800 border border-white/10 flex items-center justify-center
                        text-surface-300 hover:text-white hover:border-primary-500/30 transition-all duration-200"
                      disabled={item.quantity >= item.stock_quantity}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-accent-400">
                    {formatCurrency(parseFloat(item.selling_price) * item.quantity)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-surface-500">
              <Receipt className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">السلة فارغة</p>
            </div>
          )}
        </div>

        {/* Cart Footer */}
        <div className="p-5 border-t border-white/5 space-y-4">
          {/* Payment Method Selector */}
          {cart.length > 0 && (
            <div className="space-y-3.5 p-3.5 rounded-2xl bg-surface-950/60 border border-white/5 mb-2 animate-fade-in">
              {/* Customer Selector */}
              <div ref={customerSelectRef} className="space-y-1.5">
                <label className="block text-xs font-semibold text-surface-400">العميل</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="ابحث عن عميل بالاسم أو الهاتف..."
                      value={customerSearch}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                        if (!e.target.value) {
                          setSelectedCustomerId('');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10 placeholder-surface-500"
                    />
                    {showCustomerDropdown && (
                      <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-xl bg-surface-900 border border-white/10 shadow-xl divide-y divide-white/5 scrollbar-none">
                        <div
                          onClick={() => {
                            setSelectedCustomerId('');
                            setCustomerSearch('');
                            setShowCustomerDropdown(false);
                          }}
                          className="p-2.5 text-xs text-surface-400 hover:bg-surface-800 cursor-pointer"
                        >
                          -- عميل عام --
                        </div>
                        {customers
                          .filter((c) =>
                            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                            c.phone.includes(customerSearch)
                          )
                          .map((c) => (
                            <div
                              key={c.id}
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setCustomerSearch(c.name);
                                setShowCustomerDropdown(false);
                              }}
                              className="p-2.5 text-sm text-white hover:bg-primary-600/20 cursor-pointer flex justify-between items-center"
                            >
                              <span className="font-medium">{c.name}</span>
                              <span className="text-xs text-surface-400">{c.phone}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddModal(true)}
                    className="w-10 h-10 rounded-xl bg-primary-600/20 border border-primary-500/30 text-primary-400 hover:bg-primary-600 hover:text-white transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">طريقة الدفع</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white text-sm focus:border-primary-500 transition-colors h-10 cursor-pointer"
                >
                  <option value="cash">نقدي (Cash)</option>
                  <option value="bank">تحويل بنكي (Bank Transfer)</option>
                </select>
              </div>

              {/* Conditional Bank Details */}
              {paymentMethod === 'bank' && (
                <div className="space-y-2.5 pt-1 border-t border-white/5 animate-slide-up">
                  <div>
                    <label className="block text-xs font-medium text-surface-300 mb-1">اسم البنك *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: بنك الخرطوم"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10"
                    />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-surface-300 mb-1">رقم الإشعار *</label>
                      <input
                        type="text"
                        required
                        placeholder="رقم العملية"
                        value={referenceId}
                        onChange={(e) => setReferenceId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-300 mb-1">رقم حساب المرسل *</label>
                      <input
                        type="text"
                        required
                        placeholder="رقم الحساب"
                        value={senderAccountNumber}
                        onChange={(e) => setSenderAccountNumber(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface-900/50 border border-white/10 text-white text-xs focus:border-primary-500 transition-colors h-10"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-lg font-medium text-surface-300">الإجمالي</span>
            <span className="text-2xl font-bold text-white">
              {formatCurrency(total)}
            </span>
          </div>

          <button
            id="pos-checkout-btn"
            onClick={handleCheckout}
            disabled={cart.length === 0 || checkingOut}
            className="w-full py-4 rounded-2xl gradient-primary text-white font-bold text-lg
              hover:opacity-90 active:scale-[0.98] transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed
              flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30"
          >
            {checkingOut ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري المعالجة...</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                <span>إتمام البيع</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40 flex gap-2">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border transition-all duration-200 ${
            activeTab === 'products'
              ? 'gradient-primary text-white border-transparent shadow-lg shadow-primary-600/30'
              : 'bg-surface-900/90 text-surface-300 border-white/5 backdrop-blur-sm'
          }`}
        >
          <Search className="w-4 h-4" />
          بحث المنتجات
        </button>
        <button
          onClick={() => setActiveTab('cart')}
          className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border transition-all duration-200 relative ${
            activeTab === 'cart'
              ? 'gradient-primary text-white border-transparent shadow-lg shadow-primary-600/30'
              : 'bg-surface-900/90 text-surface-300 border-white/5 backdrop-blur-sm'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          سلة المبيعات
          {cart.length > 0 && (
            <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center border border-surface-950 animate-bounce">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Quick-Add Customer Modal */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface-900 border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-400" />
                إضافة عميل جديد
              </h3>
              <button
                onClick={() => setShowQuickAddModal(false)}
                className="text-surface-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const name = formData.get('name');
                const phone = formData.get('phone');
                const location = formData.get('location');
                const email = formData.get('email');
                const whatsapp_number = formData.get('whatsapp_number');

                try {
                  const res = await api.post('customers/', {
                    name,
                    phone,
                    location: location || '',
                    email: email || '',
                    whatsapp_number: whatsapp_number || '',
                  });
                  // Update customer list
                  setCustomers((prev) => [...prev, res.data]);
                  // Select new customer
                  setSelectedCustomerId(res.data.id);
                  setCustomerSearch(res.data.name);
                  // Close modal
                  setShowQuickAddModal(false);
                } catch (err) {
                  alert('حدث خطأ أثناء إضافة العميل. يرجى التحقق من المدخلات.');
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">اسم العميل *</label>
                <input
                  name="name"
                  type="text"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="الاسم الكامل"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">رقم الهاتف *</label>
                <input
                  name="phone"
                  type="text"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="رقم الهاتف الأساسي"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">الموقع (اختياري)</label>
                <input
                  name="location"
                  type="text"
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="العنوان أو المدينة"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">البريد الإلكتروني (اختياري)</label>
                <input
                  name="email"
                  type="email"
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="example@domain.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-300 mb-1">رقم الواتساب (اختياري)</label>
                <input
                  name="whatsapp_number"
                  type="text"
                  className="w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm focus:border-primary-500 h-10"
                  placeholder="رقم الواتساب"
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-white/5 justify-end">
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-semibold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition shadow-lg shadow-primary-600/20"
                >
                  حفظ العميل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
