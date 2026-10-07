import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../api/axios';
import { createIdempotencyKey } from '../utils/idempotency';
import { apiErrorMessage, fetchAllPages } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import useReceiptSettings from '../hooks/useReceiptSettings';
import PrintArea from '../components/PrintArea';
import Receipt from '../components/Receipt';
import CustomerPicker from '../components/pos/CustomerPicker';
import PaymentPanel from '../components/pos/PaymentPanel';
import SaleSuccess from '../components/pos/SaleSuccess';
import {
  discountedUnitCents, formatPercent, fromCents, parseAmountInput, priceCart, toCents,
} from '../components/pos/money';
import { EMPTY_PAYMENT, buildPaymentPlan } from '../components/pos/payment';
import { prepareProofImage } from '../components/pos/proofImage';
import { QUALITY_BADGE } from '../components/pos/ui';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, Check,
  Loader2, Package, AlertCircle, Receipt as ReceiptIcon, Info, RotateCcw,
} from 'lucide-react';

const money = (cents) => formatCurrency(fromCents(cents));

/** صورة الإشعار تُرفق بدفعة التحويل بعد إنشاء الفاتورة (الدفعة لا توجد قبلها). */
async function uploadProof(paymentId, file) {
  const prepared = await prepareProofImage(file);
  const form = new FormData();
  form.append('proof_image', prepared);
  await api.post(`payments/${paymentId}/proof/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export default function POS() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  // النص الذي تخص النتائج المعروضة (قد يختلف عمّا يُكتب الآن أثناء التأخير).
  const [resultsQuery, setResultsQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchNotice, setSearchNotice] = useState('');
  const [cart, setCart] = useState([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState('');
  const [customer, setCustomer] = useState(null);
  const [payment, setPayment] = useState(EMPTY_PAYMENT);
  // المبلغ المستلم وصورة الإشعار لا يدخلان في طلب البيع، فلا يغيّران مفتاحه.
  const [tendered, setTendered] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountsFailed, setBankAccountsFailed] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const [activeTab, setActiveTab] = useState('products');
  const receiptSettings = useReceiptSettings();
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);
  // نسخة من نص البحث تقرؤها الدوال غير المتزامنة بعد انتظار الخادم.
  const searchQueryRef = useRef('');
  // رقم آخر طلب بحث: الرد الأقدم الواصل متأخراً يُتجاهل.
  const searchSeqRef = useRef(0);
  const lookupCodeRef = useRef(null);
  const printSeqRef = useRef(0);
  // مفتاح عملية البيع الحالية: يبقى ثابتاً عبر إعادة المحاولة، ويتجدد مع أي
  // تغيير في محتوى البيع أو بعد نجاحه.
  const checkoutKeyRef = useRef(null);
  const customerId = customer?.id ?? null;

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const timeoutRef = searchTimeout;
    return () => clearTimeout(timeoutRef.current);
  }, []);

  // محتوى بيع مختلف = عملية جديدة بمفتاح جديد؛ إعادة استخدام المفتاح القديم
  // بمحتوى مختلف يرفضها الخادم. `payment` يضم كل ما يُرسل من حقول الدفع.
  useEffect(() => {
    checkoutKeyRef.current = null;
  }, [cart, payment, customerId]);

  // حسابات المحل البنكية لاختيار الحساب المحوَّل إليه؛ بدونها يُكتب اسم البنك.
  useEffect(() => {
    let active = true;
    fetchAllPages('bank-accounts/', { active: 1 })
      .then((accounts) => {
        if (!active) return;
        setBankAccounts(accounts);
        // حساب واحد فقط: يُختار تلقائياً بدل اختياره في كل تحويل.
        if (accounts.length === 1) {
          setPayment((prev) => (prev.bankAccount ? prev : { ...prev, bankAccount: String(accounts[0].id) }));
        }
      })
      .catch(() => {
        if (active) setBankAccountsFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const pricing = priceCart(cart, customer?.effective_discount_percent);
  const totalCents = pricing.totalCents;
  const plan = buildPaymentPlan({
    payment, totalCents, customer, hasBankAccounts: bankAccounts.length > 0,
  });

  const runSearch = useCallback(async (query) => {
    const seq = ++searchSeqRef.current;
    setSearching(true);
    setSearchError('');
    try {
      const { data } = await api.get('spare-parts/search-pos/', { params: { q: query } });
      if (seq !== searchSeqRef.current) return;
      setSearchResults(Array.isArray(data) ? data : data.results || []);
      setResultsQuery(query);
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      setSearchResults([]);
      setResultsQuery(query);
      setSearchError(apiErrorMessage(err, 'تعذّر البحث عن القطع.'));
    } finally {
      if (seq === searchSeqRef.current) setSearching(false);
    }
  }, []);

  // Debounced search
  const handleSearch = (query) => {
    setSearchQuery(query);
    searchQueryRef.current = query;
    setSearchNotice('');
    clearTimeout(searchTimeout.current);
    // النص تغيّر: أي رد لطلب سابق لم يعد يخص ما يكتبه الكاشير.
    searchSeqRef.current += 1;

    if (!query.trim()) {
      setSearchResults([]);
      setResultsQuery('');
      setSearching(false);
      setSearchError('');
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(() => runSearch(query.trim()), 300);
  };

  const clearSearch = () => {
    clearTimeout(searchTimeout.current);
    searchSeqRef.current += 1;
    searchQueryRef.current = '';
    setSearchQuery('');
    setSearchResults([]);
    setResultsQuery('');
    setSearching(false);
    setSearchError('');
    searchRef.current?.focus();
  };

  // Add to cart
  const addPartToCart = (part) => {
    const existing = cart.find((item) => item.id === part.id);
    if (existing && existing.quantity >= part.stock_quantity) {
      setSearchNotice(`الكمية في السلة من «${part.name}» بلغت المتوفر في المخزون (${part.stock_quantity}).`);
      return;
    }
    setCart((prev) => {
      const current = prev.find((item) => item.id === part.id);
      if (current) {
        if (current.quantity >= part.stock_quantity) return prev;
        // بيانات القطعة (السعر والمخزون) تُحدَّث بآخر ما أعاده الخادم.
        return prev.map((item) =>
          item.id === part.id ? { ...item, ...part, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...part, quantity: 1 }];
    });
  };

  const handlePickResult = (part) => {
    addPartToCart(part);
    clearSearch();
  };

  const lookupCode = async (code) => {
    lookupCodeRef.current = code;
    try {
      const { data } = await api.get('spare-parts/lookup/', { params: { code } });
      return { part: data };
    } catch (err) {
      return err.response?.status === 404 ? { part: null } : { lookupError: err };
    } finally {
      lookupCodeRef.current = null;
    }
  };

  // قارئ الباركود (USB) يكتب الرمز ثم Enter: المطابقة التامة تُضاف للسلة مباشرة.
  const handleSearchKeyDown = async (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const code = searchQuery.trim();
    // Enter مكرر للرمز نفسه (بعض القارئات ترسل CR وLF) = طلب واحد.
    if (!code || lookupCodeRef.current === code) return;
    clearTimeout(searchTimeout.current);
    searchSeqRef.current += 1;
    setSearching(true);
    setSearchNotice('');

    const { part, lookupError } = await lookupCode(code);
    const unchanged = searchQueryRef.current.trim() === code;

    if (part && part.stock_quantity > 0) {
      // الرمز الممسوح يُضاف حتى لو بدأت كتابة غيره؛ لا تضيع قراءة.
      addPartToCart(part);
      if (unchanged) clearSearch();
      return;
    }
    // كتب الكاشير نصاً آخر أثناء الانتظار؛ بحثه الجديد هو ما يُعرض.
    if (!unchanged) return;
    if (lookupError) {
      setSearchResults([]);
      setResultsQuery(code);
      setSearchError(apiErrorMessage(lookupError, 'تعذّر البحث عن الرمز.'));
      setSearching(false);
      return;
    }
    if (part) setSearchNotice(`«${part.name}» غير متوفرة في المخزون حالياً.`);
    // ليس رمزاً معروفاً: تبقى نتائج البحث العادي للنص نفسه.
    runSearch(code);
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

  const updatePayment = (patch) => {
    // نفس القيم = نفس الكائن، فلا يتجدد مفتاح البيع بنقرة لا تغيّر شيئاً.
    setPayment((prev) => (
      Object.entries(patch).every(([key, value]) => prev[key] === value) ? prev : { ...prev, ...patch }
    ));
    setError('');
  };

  const handleCustomerChange = useCallback((selected) => {
    setCustomer(selected);
    setError('');
    // بعد اختيار العميل يعود التركيز لخانة البحث ليعمل قارئ الباركود مباشرة.
    if (selected) searchRef.current?.focus();
  }, []);

  const sendProof = useCallback(async (invoiceId, paymentId, file) => {
    const update = (patch) =>
      setCompletedSale((sale) =>
        sale && sale.invoice.id === invoiceId && sale.proof
          ? { ...sale, proof: { ...sale.proof, ...patch } }
          : sale
      );
    update({ status: 'uploading', error: '' });
    try {
      await uploadProof(paymentId, file);
      update({ status: 'done' });
    } catch (err) {
      update({ status: 'failed', error: apiErrorMessage(err, 'خطأ غير متوقع.') });
    }
  }, []);

  // Checkout
  const handleCheckout = async () => {
    if (cart.length === 0 || checkingOut) return;
    if (plan.error) {
      setError(plan.error);
      return;
    }
    setCheckingOut(true);
    setError('');

    // لا يُرسل سعر الوحدة: الخادم يسعّر البنود ويطبّق خصم العميل بنفسه.
    const payload = {
      items: cart.map((item) => ({ spare_part: item.id, quantity: item.quantity })),
      customer: customerId,
      payments: plan.payments,
    };
    const tenderedCents = payment.mode === 'cash' ? parseAmountInput(tendered) : null;
    const proof = payment.mode === 'bank' || payment.mode === 'mixed' ? proofFile : null;

    let response;
    try {
      if (!checkoutKeyRef.current) {
        checkoutKeyRef.current = createIdempotencyKey();
      }
      response = await api.post('invoices/', payload, {
        headers: { 'Idempotency-Key': checkoutKeyRef.current },
      });
    } catch (err) {
      // أخطاء الخادم تأتي تحت payment أو items أو detail.
      setError(apiErrorMessage(err, 'حدث خطأ أثناء إتمام البيع.'));
      setCheckingOut(false);
      return;
    }

    checkoutKeyRef.current = null;
    const invoice = response.data;
    const serverTotalCents = toCents(invoice.total_amount);
    const bankPayment = (invoice.payments || []).find(
      (item) => item.kind === 'sale' && item.method === 'bank'
    );
    setCompletedSale({
      invoice,
      replayed: response.status === 200,
      expectedTotalCents: totalCents,
      changeCents: tenderedCents > serverTotalCents ? tenderedCents - serverTotalCents : 0,
      proof: proof && bankPayment
        ? { status: 'uploading', error: '', file: proof, paymentId: bankPayment.id }
        : null,
    });
    setCart([]);
    setPayment({
      ...EMPTY_PAYMENT,
      bankAccount: bankAccounts.length === 1 ? String(bankAccounts[0].id) : '',
    });
    setTendered('');
    setProofFile(null);
    setCustomer(null);
    setCheckingOut(false);
    searchRef.current?.focus();

    // فشل رفع الصورة لا يلغي البيع: يظهر تحذير مع إمكانية إعادة الرفع.
    if (proof && bankPayment) {
      sendProof(invoice.id, bankPayment.id, proof);
    }
  };

  const handlePrint = () => {
    if (!completedSale || !receiptSettings) return;
    // مفتاح جديد لكل طباعة: إعادة الطباعة تعيد تركيب PrintArea فتفتح النافذة مجدداً.
    printSeqRef.current += 1;
    setPrintJob({ key: printSeqRef.current, invoice: completedSale.invoice });
  };

  // ثابت عبر إعادة الرسم: PrintArea تعيد الطباعة إن تغيّر onDone.
  const handlePrintDone = useCallback(() => setPrintJob(null), []);

  const handleNewSale = () => {
    setCompletedSale(null);
    setError('');
    setActiveTab('products');
    searchRef.current?.focus();
  };

  const retryProof = () => {
    const proof = completedSale?.proof;
    if (proof) sendProof(completedSale.invoice.id, proof.paymentId, proof.file);
  };

  const paper = receiptSettings?.receipt_paper || '80mm';
  const discount = pricing.discountBasisPoints;

  return (
    // الارتفاع = الشاشة ناقص ترويسة Layout (73px: py-4 + زر h-10 + الحد) وحشوة
    // main (p-4 = 32px، ومن md: p-8 = 64px)، فيبقى زر الإتمام ظاهراً دون تمرير الصفحة.
    <div className="animate-fade-in h-[calc(100dvh-105px)] md:h-[calc(100dvh-137px)] min-h-[32rem] flex flex-col lg:flex-row gap-5 pb-16 lg:pb-0">
      {/* ──── Left: Search & Results ──── */}
      <div className={`flex-1 min-h-0 flex-col min-w-0 ${activeTab === 'products' ? 'flex' : 'hidden lg:flex'}`}>
        {/* Search Bar */}
        <div className="relative mb-4 shrink-0">
          <label htmlFor="pos-search" className="sr-only">ابحث عن قطعة أو امسح الباركود</label>
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" aria-hidden="true" />
          <input
            ref={searchRef}
            id="pos-search"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            enterKeyHint="search"
            className="w-full pr-12 pl-4 py-4 rounded-2xl bg-surface-900/70 border border-white/10 text-white
              text-lg placeholder-surface-500 focus:border-primary-500 transition-all duration-200"
            placeholder="ابحث بالاسم أو رقم القطعة، أو امسح الباركود..."
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500 animate-spin" />
          )}
        </div>

        {searchNotice && (
          <div role="status" className="mb-3 shrink-0 p-3 rounded-xl bg-warning-500/10 border border-warning-500/20 text-warning-400 text-sm flex items-center gap-2 animate-fade-in">
            <Info className="w-4 h-4 shrink-0" />
            <span>{searchNotice}</span>
          </div>
        )}

        {/* Search Results */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pl-1">
          {searchError ? (
            <div role="alert" className="flex flex-col items-center justify-center py-16 text-danger-400 text-center">
              <AlertCircle className="w-12 h-12 mb-3 opacity-60" />
              <p>{searchError}</p>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => runSearch(searchQuery.trim())}
                  className="mt-4 px-4 py-2 rounded-xl bg-surface-800 border border-white/10 text-surface-200 text-sm font-semibold
                    hover:text-white hover:border-primary-500/30 transition-all flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  إعادة المحاولة
                </button>
              )}
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((part) => {
              const inCart = cart.find((c) => c.id === part.id);
              return (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => handlePickResult(part)}
                  className="w-full text-right p-4 rounded-2xl glass-card hover:border-primary-500/30
                    hover:bg-primary-600/5 transition-all duration-200 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-base font-semibold text-white truncate">{part.name}</h3>
                        {part.quality_grade_display && (
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${QUALITY_BADGE[part.quality_grade] || QUALITY_BADGE.commercial}`}>
                            {part.quality_grade_display}
                          </span>
                        )}
                        {part.category_name && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-700/60 text-surface-300 whitespace-nowrap">
                            {part.category_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-surface-400">
                        <span dir="ltr">{part.part_number}</span>
                        {part.brand && <span>الماركة: {part.brand}</span>}
                        <span>المخزون: {part.stock_quantity}</span>
                        {part.shelf_location && <span>الرف: {part.shelf_location}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mr-4">
                      <div className="text-left">
                        <span className="block text-lg font-bold text-accent-400">
                          {formatCurrency(part.selling_price)}
                        </span>
                        {discount > 0 && (
                          <span className="block text-xs text-success-400">
                            للعميل {money(discountedUnitCents(toCents(part.selling_price), discount))}
                          </span>
                        )}
                      </div>
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
          ) : searchQuery.trim() && !searching ? (
            <div className="flex flex-col items-center justify-center py-20 text-surface-500 text-center">
              <Package className="w-12 h-12 mb-3 opacity-40" />
              <p>لا توجد قطع متوفرة في المخزون تطابق «{resultsQuery || searchQuery.trim()}»</p>
            </div>
          ) : !searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center py-20 text-surface-500 text-center">
              <Search className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg">ابدأ بالبحث عن قطع الغيار</p>
              <p className="text-sm mt-1">اكتب اسم القطعة أو رقمها، أو امسح الباركود مباشرة</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ──── Right: Cart ──── */}
      <div className={`w-full lg:w-[420px] flex-1 lg:flex-none min-h-0 flex-col glass-card overflow-hidden ${activeTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
        {/* Cart Header */}
        <div className="shrink-0 px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-bold text-white">سلة المبيعات</h2>
          </div>
          <span className="text-sm text-surface-400">
            {cart.length} عناصر
          </span>
        </div>

        {/* العميل أولاً: خصمه يغيّر أسعار السلة، والآجل يحتاجه. */}
        <div className="shrink-0 px-5 pt-4 relative z-20">
          <CustomerPicker customer={customer} onChange={handleCustomerChange} />
        </div>

        {/* Cart Items — تتمرر وحدها ويبقى الإجمالي وزر الإتمام ظاهرين */}
        <div className="flex-1 min-h-[6rem] overflow-y-auto p-5 space-y-3">
          {completedSale && (
            <SaleSuccess
              sale={completedSale}
              compact={cart.length > 0}
              canPrint={Boolean(receiptSettings)}
              onPrint={handlePrint}
              onNewSale={handleNewSale}
              onDismiss={() => setCompletedSale(null)}
              onRetryProof={retryProof}
            />
          )}

          {cart.length > 0 ? (
            cart.map((item) => {
              const line = pricing.lines[item.id];
              return (
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
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      aria-label={`حذف ${item.name} من السلة`}
                      className="p-1.5 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10
                        transition-all duration-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        aria-label={`إنقاص كمية ${item.name}`}
                        className="w-8 h-8 rounded-lg bg-surface-800 border border-white/10 flex items-center justify-center
                          text-surface-300 hover:text-white hover:border-primary-500/30 transition-all duration-200"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-10 text-center text-sm font-bold text-white">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        aria-label={`زيادة كمية ${item.name}`}
                        className="w-8 h-8 rounded-lg bg-surface-800 border border-white/10 flex items-center justify-center
                          text-surface-300 hover:text-white hover:border-primary-500/30 transition-all duration-200
                          disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={item.quantity >= item.stock_quantity}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-left">
                      <span className="block text-base font-bold text-accent-400">
                        {money(line.lineCents)}
                      </span>
                      <span className="block text-[11px] text-surface-400">
                        {line.unitCents !== line.originalUnitCents && (
                          <s className="text-surface-500 ml-1">{money(line.originalUnitCents)}</s>
                        )}
                        {money(line.unitCents)} × {item.quantity}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : !completedSale ? (
            <div className="flex flex-col items-center justify-center py-16 text-surface-500">
              <ReceiptIcon className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">السلة فارغة</p>
            </div>
          ) : null}
        </div>

        {cart.length > 0 && (
          <>
            {/* Payment — يتقلّص ويتمرر عند ضيق الشاشة بدل دفع زر الإتمام للأسفل */}
            <div className="min-h-0 overflow-y-auto px-5 py-4 border-t border-white/5">
              <PaymentPanel
                payment={payment}
                onChange={updatePayment}
                totalCents={totalCents}
                customer={customer}
                bankAccounts={bankAccounts}
                bankAccountsFailed={bankAccountsFailed}
                tendered={tendered}
                onTenderedChange={setTendered}
                proofFile={proofFile}
                onProofChange={setProofFile}
              />
            </div>

            {/* Cart Footer */}
            <div className="shrink-0 px-5 py-4 border-t border-white/5 space-y-3">
              {error && (
                <div role="alert" className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm flex items-start gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <dl className="space-y-1">
                {pricing.discountCents > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm text-surface-400">
                      <dt>المجموع قبل الخصم</dt>
                      <dd>{money(pricing.subtotalCents)}</dd>
                    </div>
                    <div className="flex items-center justify-between text-sm text-success-400">
                      <dt>خصم العميل ({formatPercent(customer.effective_discount_percent)}%)</dt>
                      <dd>−{money(pricing.discountCents)}</dd>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-lg font-medium text-surface-300">الإجمالي</dt>
                  <dd className="text-2xl font-bold text-white">{money(totalCents)}</dd>
                </div>
                {!plan.error && plan.creditCents > 0 && (
                  <div className="flex items-center justify-between text-sm text-warning-400">
                    <dt>منها آجل على العميل</dt>
                    <dd>{money(plan.creditCents)}</dd>
                  </div>
                )}
              </dl>

              {plan.error && !error && (
                <p className="text-xs text-warning-400 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{plan.error}</span>
                </p>
              )}

              <button
                id="pos-checkout-btn"
                type="button"
                onClick={handleCheckout}
                disabled={checkingOut || Boolean(plan.error)}
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
          </>
        )}
      </div>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40 flex gap-2">
        <button
          type="button"
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
          type="button"
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

      {/* الإيصال يُطبع معزولاً عن الصفحة؛ مفتاح لكل طباعة. */}
      {printJob && receiptSettings && (
        <PrintArea key={printJob.key} paper={paper} onDone={handlePrintDone}>
          <Receipt invoice={printJob.invoice} settings={receiptSettings} paper={paper} />
        </PrintArea>
      )}
    </div>
  );
}
