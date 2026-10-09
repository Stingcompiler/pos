import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileText, FilterX, Loader2, Receipt, RefreshCw, Search, X,
} from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import useReceiptSettings from '../hooks/useReceiptSettings';
import { apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import Pagination from '../components/sales/Pagination';
import PaymentMethodBadge from '../components/sales/PaymentMethodBadge';
import InvoiceDetailPanel from '../components/sales/InvoiceDetailPanel';
import InvoicePrint from '../components/sales/InvoicePrint';
import ReturnModal from '../components/sales/ReturnModal';
import useDebouncedValue from '../components/sales/useDebouncedValue';
import useInvoiceDetails from '../components/sales/useInvoiceDetails';
import {
  PAYMENT_METHOD_OPTIONS, cleanParams, formatDateTime, isPrivilegedRole, normalizeList,
} from '../components/sales/salesUtils';

const PAGE_SIZE = 25;
const METHOD_FILTERS = [{ value: '', label: 'الكل' }, ...PAYMENT_METHOD_OPTIONS];

const dateInputClass =
  'w-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 h-11';

export default function Invoices() {
  const { user } = useAuth();
  const privileged = isPrivilegedRole(user?.role);
  const receiptSettings = useReceiptSettings();
  const receiptPaper = receiptSettings?.receipt_paper || '80mm';

  // ─── الفلاتر ───
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [method, setMethod] = useState('');
  const hasFilters = Boolean(search.trim() || dateFrom || dateTo || method);

  // الصفحة مربوطة بمفتاح الفلاتر: تغيير البحث أو التاريخ يعيدها للأولى تلقائياً
  // دون طلب إضافي للصفحة القديمة بالفلاتر الجديدة.
  const filterKey = JSON.stringify([debouncedSearch, dateFrom, dateTo, method]);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;

  // ─── القائمة ───
  const [list, setList] = useState({ count: 0, results: [] });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadInvoices = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('invoices/', {
        params: cleanParams({
          page,
          page_size: PAGE_SIZE,
          search: debouncedSearch,
          date_from: dateFrom,
          date_to: dateTo,
          payment_method: method,
        }),
      });
      // ردّ متأخر لفلتر قديم لا يطغى على نتيجة أحدث.
      if (current !== requestId.current) return;
      setList(normalizeList(data));
      setLoaded(true);
    } catch (err) {
      if (current !== requestId.current) return;
      setError(apiErrorMessage(err, 'تعذّر تحميل الفواتير.'));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [page, debouncedSearch, dateFrom, dateTo, method]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const clearFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setMethod('');
  };

  // ─── التفاصيل والطباعة والمرتجع ───
  const { expandedId, details, errors, toggle, loadDetail } = useInvoiceDetails();
  const [printJob, setPrintJob] = useState(null);
  const printSeq = useRef(0);
  const finishPrint = useCallback(() => setPrintJob(null), []);
  const [returnInvoice, setReturnInvoice] = useState(null);
  const closeReturn = useCallback(() => setReturnInvoice(null), []);
  const [notice, setNotice] = useState('');

  const handlePrint = (invoice, paper) => {
    // مفتاح جديد لكل طلب حتى تُعاد الطباعة ولو كانت الفاتورة نفسها.
    printSeq.current += 1;
    setPrintJob({ key: printSeq.current, invoice, paper });
  };

  const handleReturnSuccess = async (saleReturn) => {
    const invoiceId = returnInvoice.id;
    setReturnInvoice(null);
    setNotice(`تم تسجيل المرتجع #${saleReturn.id} من فاتورة #${invoiceId} بقيمة ${formatCurrency(saleReturn.total_amount)}.`);
    await loadDetail(invoiceId);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success-500 to-success-400 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">الفواتير</h1>
          <p className="text-sm text-surface-400 flex items-center gap-2">
            سجل المبيعات{loaded ? ` · ${list.count} فاتورة` : ''}
            {loading && loaded && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-400" aria-label="جارٍ التحديث" />}
          </p>
        </div>
      </div>

      {/* ─── الفلاتر ─── */}
      <div className="glass-card p-4 mb-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="relative flex-1">
            <label htmlFor="invoice-search" className="block text-[11px] text-surface-400 mb-1">بحث</label>
            <input
              id="invoice-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="رقم الفاتورة، اسم العميل، الهاتف، أو رقم الإشعار..."
              className="w-full px-4 py-2.5 pr-10 rounded-xl bg-surface-900 border border-white/10 text-white text-sm focus:border-primary-500 transition placeholder-surface-500 h-11"
            />
            <Search className="absolute right-3.5 bottom-3.5 w-4 h-4 text-surface-400" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-80">
            <div>
              <label htmlFor="invoice-date-from" className="block text-[11px] text-surface-400 mb-1">من تاريخ</label>
              <input
                id="invoice-date-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className={dateInputClass}
              />
            </div>
            <div>
              <label htmlFor="invoice-date-to" className="block text-[11px] text-surface-400 mb-1">إلى تاريخ</label>
              <input
                id="invoice-date-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className={dateInputClass}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="تصفية حسب طريقة الدفع">
          {METHOD_FILTERS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              aria-pressed={method === option.value}
              onClick={() => setMethod(option.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                method === option.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white/5 text-surface-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ms-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-surface-400 hover:text-white hover:bg-white/5 flex items-center gap-1.5 cursor-pointer"
            >
              <FilterX className="w-3.5 h-3.5" aria-hidden="true" />
              مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="mb-4 p-3 rounded-xl bg-success-600/10 border border-success-500/20 text-success-400 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="إخفاء الرسالة" className="p-1 rounded-lg hover:bg-white/5 cursor-pointer">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ─── القائمة ─── */}
      {error ? (
        <div role="alert" className="glass-card p-8 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-10 h-10 text-danger-400" aria-hidden="true" />
          <p className="text-sm text-danger-400 font-semibold">{error}</p>
          <button
            type="button"
            onClick={loadInvoices}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-surface-200 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      ) : !loaded ? (
        <div className="flex justify-center py-20" role="status" aria-label="جارٍ تحميل الفواتير">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      ) : list.results.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-surface-500 gap-3">
          <Receipt className="w-12 h-12 opacity-30" aria-hidden="true" />
          <p>{hasFilters ? 'لا توجد فواتير مطابقة للبحث أو الفلاتر.' : 'لا توجد فواتير بعد.'}</p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-200 text-xs font-semibold cursor-pointer"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {list.results.map((inv) => {
              const expanded = expandedId === inv.id;
              const panelId = `invoice-panel-${inv.id}`;
              return (
                <div key={inv.id} className="glass-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(inv.id)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right hover:bg-white/2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-10 shrink-0 rounded-xl bg-primary-600/15 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary-400">#{inv.id}</span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                          فاتورة #{inv.id}
                          <PaymentMethodBadge
                            method={inv.payment_method}
                            label={inv.payment_method_display}
                            creditAmount={inv.credit_amount}
                          />
                        </p>
                        <p className="text-xs text-surface-400 truncate">
                          {formatDateTime(inv.created_at)} · {inv.cashier_name}
                          {inv.customer_name ? ` · العميل: ${inv.customer_name}` : ''}
                          {inv.items_count != null ? ` · ${inv.items_count} بند` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-base sm:text-lg font-bold text-accent-400">{formatCurrency(inv.total_amount)}</p>
                      {expanded
                        ? <ChevronUp className="w-5 h-5 text-surface-400" aria-hidden="true" />
                        : <ChevronDown className="w-5 h-5 text-surface-400" aria-hidden="true" />}
                    </div>
                  </button>
                  {expanded && (
                    <div id={panelId} className="border-t border-white/5 p-5 animate-fade-in">
                      <InvoiceDetailPanel
                        detail={details[inv.id]}
                        error={errors[inv.id]}
                        onRetry={() => loadDetail(inv.id)}
                        privileged={privileged}
                        receiptPaper={receiptPaper}
                        onPrint={(paper) => handlePrint(details[inv.id], paper)}
                        onReturn={() => setReturnInvoice(details[inv.id])}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            count={list.count}
            onPageChange={(next) => setPageState({ key: filterKey, page: next })}
            disabled={loading}
            noun="فاتورة"
          />
        </div>
      )}

      {returnInvoice && (
        <ReturnModal invoice={returnInvoice} onClose={closeReturn} onSuccess={handleReturnSuccess} />
      )}
      <InvoicePrint job={printJob} settings={receiptSettings} onDone={finishPrint} />
    </div>
  );
}
