import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import {
  Users, ChevronRight, Phone, Mail, MapPin, MessageSquare,
  Receipt, Printer, Loader2, AlertCircle, ChevronDown, ChevronUp,
  HandCoins, Wallet, ScrollText, RefreshCw, CheckCircle2, X,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import useReceiptSettings from '../hooks/useReceiptSettings';
import { apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import PrintArea from '../components/PrintArea';
import Pagination from '../components/sales/Pagination';
import PaymentMethodBadge from '../components/sales/PaymentMethodBadge';
import InvoiceDetailPanel from '../components/sales/InvoiceDetailPanel';
import InvoicePrint from '../components/sales/InvoicePrint';
import ReturnModal from '../components/sales/ReturnModal';
import CollectPaymentModal from '../components/sales/CollectPaymentModal';
import StatementDocument from '../components/sales/StatementDocument';
import useInvoiceDetails from '../components/sales/useInvoiceDetails';
import {
  CUSTOMER_TYPE_STYLES, availableCreditCents, centsToAmount, formatDate, formatDateTime,
  isPrivilegedRole, normalizeList, toCents,
} from '../components/sales/salesUtils';

const INVOICE_PAGE_SIZE = 10;

const ENTRY_TYPES = {
  invoice: { label: 'فاتورة آجلة', className: 'bg-danger-600/15 text-danger-400' },
  collection: { label: 'تحصيل', className: 'bg-success-600/15 text-success-400' },
  return: { label: 'مرتجع', className: 'bg-warning-500/15 text-warning-400' },
};

function MetricCard({ label, value, tone = 'text-white', border, hint }) {
  return (
    <div className={`glass-card p-4 space-y-1.5 border-r-4 ${border}`}>
      <span className="text-xs font-semibold text-surface-400 block">{label}</span>
      <p className={`text-lg font-bold tracking-wide ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-surface-500">{hint}</p>}
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const privileged = isPrivilegedRole(user?.role);
  const receiptSettings = useReceiptSettings();
  const receiptPaper = receiptSettings?.receipt_paper || '80mm';

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // ─── بيانات العميل ───
  const customerRequest = useRef(0);
  const fetchCustomer = useCallback(async () => {
    const current = ++customerRequest.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`customers/${id}/`);
      if (current === customerRequest.current) setCustomer(res.data);
    } catch (err) {
      if (current === customerRequest.current) {
        setError(apiErrorMessage(err, 'فشل في تحميل تفاصيل العميل.'));
      }
    } finally {
      if (current === customerRequest.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  // ─── كشف الحساب (يعيد العميل أيضاً بأحدث رصيد) ───
  const [statement, setStatement] = useState({ entries: [], loading: true, error: '' });
  const statementRequest = useRef(0);
  const loadStatement = useCallback(async () => {
    const current = ++statementRequest.current;
    setStatement((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const { data } = await api.get(`customers/${id}/statement/`);
      if (current !== statementRequest.current) return;
      setStatement({ entries: data.entries || [], loading: false, error: '' });
      if (data.customer) setCustomer(data.customer);
    } catch (err) {
      if (current !== statementRequest.current) return;
      setStatement((prev) => ({ ...prev, loading: false, error: apiErrorMessage(err, 'تعذّر تحميل كشف الحساب.') }));
    }
  }, [id]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  // ─── فواتير العميل (مقسّمة) ───
  const [invoicePageState, setInvoicePageState] = useState({ key: id, page: 1 });
  const invoicePage = invoicePageState.key === id ? invoicePageState.page : 1;
  const [invoices, setInvoices] = useState({ count: 0, results: [], loaded: false, loading: true, error: '' });
  const invoicesRequest = useRef(0);
  const loadInvoices = useCallback(async () => {
    const current = ++invoicesRequest.current;
    setInvoices((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const { data } = await api.get('invoices/', {
        params: { customer: id, page: invoicePage, page_size: INVOICE_PAGE_SIZE },
      });
      if (current !== invoicesRequest.current) return;
      setInvoices({ ...normalizeList(data), loaded: true, loading: false, error: '' });
    } catch (err) {
      if (current !== invoicesRequest.current) return;
      setInvoices((prev) => ({ ...prev, loading: false, error: apiErrorMessage(err, 'تعذّر تحميل فواتير العميل.') }));
    }
  }, [id, invoicePage]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // ─── التفاصيل والطباعة والمرتجع والتحصيل ───
  const { expandedId, details, errors, toggle, loadDetail } = useInvoiceDetails();
  const printSeq = useRef(0);
  const [printJob, setPrintJob] = useState(null);
  const finishPrint = useCallback(() => setPrintJob(null), []);
  const [statementJob, setStatementJob] = useState(null);
  const finishStatementPrint = useCallback(() => setStatementJob(null), []);
  const [returnInvoice, setReturnInvoice] = useState(null);
  const closeReturn = useCallback(() => setReturnInvoice(null), []);
  const [showCollect, setShowCollect] = useState(false);
  const closeCollect = useCallback(() => setShowCollect(false), []);

  const handlePrint = (invoice, paper) => {
    printSeq.current += 1;
    setPrintJob({ key: printSeq.current, invoice, paper });
  };

  const handlePrintStatement = () => {
    printSeq.current += 1;
    setStatementJob({ key: printSeq.current, printedAt: new Date().toISOString() });
  };

  const handleReturnSuccess = async (saleReturn) => {
    const invoiceId = returnInvoice.id;
    setReturnInvoice(null);
    setNotice(`تم تسجيل المرتجع #${saleReturn.id} من فاتورة #${invoiceId} بقيمة ${formatCurrency(saleReturn.total_amount)}.`);
    // الخصم من الحساب يغيّر رصيد العميل وكشفه.
    await Promise.all([loadDetail(invoiceId), loadStatement()]);
  };

  const handleCollectSuccess = (payment) => {
    setShowCollect(false);
    setNotice(`تم تسجيل دفعة ${payment.method_display || ''} بقيمة ${formatCurrency(payment.amount)}.`);
    loadStatement();
  };

  if (loading && !customer) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="جارٍ تحميل ملف العميل">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4 max-w-lg mx-auto text-center py-20" role="alert">
        <AlertCircle className="w-12 h-12 text-danger-500 mx-auto" aria-hidden="true" />
        <p className="text-white font-semibold">{error || 'العميل المطلوبة تفاصيله غير موجود.'}</p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={fetchCustomer}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="px-4 py-2 bg-surface-900 border border-white/10 hover:border-white/20 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            العودة لسجل العملاء
          </button>
        </div>
      </div>
    );
  }

  const balanceCents = toCents(customer.balance);
  const limitCents = toCents(customer.credit_limit);
  const discount = Number(customer.effective_discount_percent || 0);
  const customDiscount = customer.discount_percent !== null && customer.discount_percent !== undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs / Header */}
      <nav aria-label="مسار التنقل" className="flex items-center gap-2 text-xs text-surface-400">
        <button type="button" onClick={() => navigate('/customers')} className="hover:text-white transition cursor-pointer">
          إدارة العملاء
        </button>
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <span className="text-white font-semibold">ملف العميل: {customer.name}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            aria-label="العودة لسجل العملاء"
            className="w-10 h-10 rounded-xl bg-surface-900 border border-white/10 hover:border-white/20 flex items-center justify-center text-white transition cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{customer.name}</h1>
            <p className="text-sm text-surface-400">ملف العميل المالي وسجل المبيعات</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCollect(true)}
          disabled={balanceCents <= 0}
          title={balanceCents <= 0 ? 'لا يوجد رصيد مستحق على العميل' : undefined}
          className="px-4 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition flex items-center gap-2 justify-center shadow-lg shadow-primary-600/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <HandCoins className="w-4 h-4" aria-hidden="true" />
          تسجيل دفعة
        </button>
      </div>

      {notice && (
        <div role="status" className="p-3 rounded-xl bg-success-600/10 border border-success-500/20 text-success-400 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="إخفاء الرسالة" className="p-1 rounded-lg hover:bg-white/5 cursor-pointer">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ملخص الحساب */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="الرصيد المستحق"
          value={formatCurrency(customer.balance)}
          tone={balanceCents > 0 ? 'text-danger-400' : balanceCents < 0 ? 'text-success-400' : 'text-white'}
          border={balanceCents > 0 ? 'border-r-danger-500' : 'border-r-success-500'}
          hint={balanceCents < 0 ? 'رصيد لصالح العميل' : balanceCents === 0 ? 'لا ديون قائمة' : undefined}
        />
        <MetricCard
          label="حد الائتمان"
          value={limitCents > 0 ? formatCurrency(customer.credit_limit) : 'غير مسموح بالآجل'}
          tone={limitCents > 0 ? 'text-white' : 'text-surface-400'}
          border="border-r-primary-500"
        />
        <MetricCard
          label="الائتمان المتاح"
          value={limitCents > 0 ? formatCurrency(centsToAmount(availableCreditCents(customer))) : '—'}
          tone={limitCents > 0 && availableCreditCents(customer) === 0 ? 'text-warning-400' : 'text-white'}
          border="border-r-accent-500"
          hint={limitCents > 0 && availableCreditCents(customer) === 0 ? 'استُنفد الحد' : undefined}
        />
        <MetricCard
          label="النوع والخصم الفعلي"
          value={`${customer.customer_type_display} · ${discount}%`}
          border="border-r-warning-500"
          hint={customDiscount ? 'خصم خاص بهذا العميل' : 'خصم نوعه الافتراضي'}
        />
      </div>

      {/* Customer summary layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1 glass-card p-6 space-y-6 self-start border-t border-white/5">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary-600/10 border border-primary-500/20 flex items-center justify-center mx-auto">
              <Users className="w-8 h-8 text-primary-400" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-white">{customer.name}</h2>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-surface-400">
                معرف العميل #{customer.id}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${CUSTOMER_TYPE_STYLES[customer.customer_type] || CUSTOMER_TYPE_STYLES.retail}`}>
                {customer.customer_type_display}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/5 text-sm text-surface-300">
            <div className="flex justify-between items-center py-1">
              <span className="text-surface-400 text-xs flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-surface-500" aria-hidden="true" />
                رقم الهاتف:
              </span>
              <a href={`tel:${customer.phone}`} className="font-semibold text-white font-mono hover:underline" dir="ltr">
                {customer.phone}
              </a>
            </div>

            {customer.location && (
              <div className="flex justify-between items-start py-1">
                <span className="text-surface-400 text-xs flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-surface-500" aria-hidden="true" />
                  العنوان:
                </span>
                <span className="font-semibold text-white text-left">{customer.location}</span>
              </div>
            )}

            {customer.email && (
              <div className="flex justify-between items-center py-1">
                <span className="text-surface-400 text-xs flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-surface-500" aria-hidden="true" />
                  البريد الإلكتروني:
                </span>
                <a href={`mailto:${customer.email}`} className="font-semibold text-white hover:underline truncate max-w-[150px]">
                  {customer.email}
                </a>
              </div>
            )}
          </div>

          {/* Social Quick Launch Actions */}
          <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-2">
            {customer.whatsapp_number && (
              <a
                href={`https://wa.me/${customer.whatsapp_number.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                واتساب
              </a>
            )}
            <a
              href={`tel:${customer.phone}`}
              className="py-2.5 rounded-xl bg-primary-600/15 hover:bg-primary-600/25 text-primary-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Phone className="w-4 h-4" aria-hidden="true" />
              اتصال هاتفي
            </a>
          </div>
        </div>

        {/* Statement and invoices */}
        <div className="lg:col-span-2 space-y-6">
          {/* كشف الحساب */}
          <section className="glass-card overflow-hidden" aria-labelledby="statement-title">
            <div className="p-5 border-b border-white/5 flex items-center justify-between gap-3">
              <h3 id="statement-title" className="text-sm font-semibold text-white flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-primary-400" aria-hidden="true" />
                كشف الحساب
              </h3>
              <button
                type="button"
                onClick={handlePrintStatement}
                disabled={statement.loading || Boolean(statement.error)}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-surface-200 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                طباعة الكشف
              </button>
            </div>

            {statement.error ? (
              <div role="alert" className="p-6 flex flex-col items-center gap-3 text-sm text-danger-400">
                <p>{statement.error}</p>
                <button
                  type="button"
                  onClick={loadStatement}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  إعادة المحاولة
                </button>
              </div>
            ) : statement.loading && statement.entries.length === 0 ? (
              <div className="flex justify-center py-8" role="status" aria-label="جارٍ تحميل كشف الحساب">
                <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
              </div>
            ) : statement.entries.length === 0 ? (
              <p className="p-8 text-center text-sm text-surface-500">لا توجد حركات آجلة على حساب هذا العميل.</p>
            ) : (
              <div className={`max-h-96 overflow-auto transition-opacity ${statement.loading ? 'opacity-60' : ''}`}>
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="sticky top-0 bg-surface-900">
                    <tr className="text-surface-400 border-b border-white/5">
                      <th scope="col" className="py-2.5 px-4 text-right font-medium">التاريخ</th>
                      <th scope="col" className="py-2.5 px-2 text-right font-medium">البيان</th>
                      <th scope="col" className="py-2.5 px-2 text-left font-medium">مدين</th>
                      <th scope="col" className="py-2.5 px-2 text-left font-medium">دائن</th>
                      <th scope="col" className="py-2.5 px-4 text-left font-medium">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.entries.map((entry, index) => {
                      const type = ENTRY_TYPES[entry.type] || ENTRY_TYPES.invoice;
                      return (
                        <tr key={`${entry.type}-${entry.reference}-${index}`} className="border-b border-white/5">
                          <td className="py-2.5 px-4 text-surface-300 whitespace-nowrap" title={formatDateTime(entry.date)}>
                            {formatDate(entry.date)}
                          </td>
                          <td className="py-2.5 px-2 text-white">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold me-1.5 ${type.className}`}>{type.label}</span>
                            {entry.reference}
                          </td>
                          <td className="py-2.5 px-2 text-left text-danger-400">
                            {toCents(entry.debit) > 0 ? formatCurrency(entry.debit) : ''}
                          </td>
                          <td className="py-2.5 px-2 text-left text-success-400">
                            {toCents(entry.credit) > 0 ? formatCurrency(entry.credit) : ''}
                          </td>
                          <td className="py-2.5 px-4 text-left font-semibold text-white">{formatCurrency(entry.balance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-4 border-t border-white/5 flex items-center justify-between text-sm">
              <span className="text-surface-400 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" aria-hidden="true" />
                الرصيد الحالي
              </span>
              <span className={`font-bold ${balanceCents > 0 ? 'text-danger-400' : 'text-success-400'}`}>
                {formatCurrency(customer.balance)}
              </span>
            </div>
          </section>

          {/* Invoices List */}
          <section className="glass-card overflow-hidden" aria-labelledby="invoices-title">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h3 id="invoices-title" className="text-sm font-semibold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary-400" aria-hidden="true" />
                سجل الفواتير والمشتريات
                {invoices.loaded && <span className="text-xs text-surface-400 font-normal">({invoices.count})</span>}
              </h3>
              {invoices.loading && invoices.loaded && (
                <Loader2 className="w-4 h-4 text-primary-400 animate-spin" aria-label="جارٍ التحديث" />
              )}
            </div>

            {invoices.error ? (
              <div role="alert" className="p-6 flex flex-col items-center gap-3 text-sm text-danger-400">
                <p>{invoices.error}</p>
                <button
                  type="button"
                  onClick={loadInvoices}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-surface-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  إعادة المحاولة
                </button>
              </div>
            ) : !invoices.loaded ? (
              <div className="flex justify-center py-8" role="status" aria-label="جارٍ تحميل الفواتير">
                <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
              </div>
            ) : invoices.results.length === 0 ? (
              <p className="p-8 text-center text-sm text-surface-500">لا توجد مبيعات سابقة مسجلة لهذا العميل.</p>
            ) : (
              <>
                <div className={`divide-y divide-white/5 transition-opacity ${invoices.loading ? 'opacity-60' : ''}`} aria-busy={invoices.loading}>
                  {invoices.results.map((inv) => {
                    const expanded = expandedId === inv.id;
                    const panelId = `customer-invoice-panel-${inv.id}`;
                    return (
                      <div key={inv.id}>
                        <button
                          type="button"
                          onClick={() => toggle(inv.id)}
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          className="w-full p-5 flex items-center justify-between gap-3 text-right hover:bg-white/2 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                              <span>فاتورة #{inv.id}</span>
                              <PaymentMethodBadge
                                method={inv.payment_method}
                                label={inv.payment_method_display}
                                creditAmount={inv.credit_amount}
                              />
                            </p>
                            <p className="text-xs text-surface-400 mt-1">
                              {formatDateTime(inv.created_at)} · البائع: {inv.cashier_name}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-base font-bold text-accent-400">{formatCurrency(inv.total_amount)}</span>
                            {expanded
                              ? <ChevronUp className="w-5 h-5 text-surface-500" aria-hidden="true" />
                              : <ChevronDown className="w-5 h-5 text-surface-500" aria-hidden="true" />}
                          </div>
                        </button>

                        {expanded && (
                          <div id={panelId} className="p-5 border-t border-white/5 bg-surface-900/30 animate-fade-in">
                            <InvoiceDetailPanel
                              detail={details[inv.id]}
                              error={errors[inv.id]}
                              onRetry={() => loadDetail(inv.id)}
                              privileged={privileged}
                              receiptPaper={receiptPaper}
                              onPrint={(paper) => handlePrint(details[inv.id], paper)}
                              onReturn={() => setReturnInvoice(details[inv.id])}
                              showCustomerLink={false}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 pb-4">
                  <Pagination
                    page={invoicePage}
                    pageSize={INVOICE_PAGE_SIZE}
                    count={invoices.count}
                    onPageChange={(next) => setInvoicePageState({ key: id, page: next })}
                    disabled={invoices.loading}
                    noun="فاتورة"
                  />
                </div>
              </>
            )}
          </section>

        </div>
      </div>

      {showCollect && (
        <CollectPaymentModal customer={customer} onClose={closeCollect} onSuccess={handleCollectSuccess} />
      )}
      {returnInvoice && (
        <ReturnModal invoice={returnInvoice} onClose={closeReturn} onSuccess={handleReturnSuccess} />
      )}
      <InvoicePrint job={printJob} settings={receiptSettings} onDone={finishPrint} />
      {statementJob && (
        <PrintArea key={statementJob.key} paper="a4" onDone={finishStatementPrint}>
          <StatementDocument
            customer={customer}
            entries={statement.entries}
            settings={receiptSettings}
            printedAt={statementJob.printedAt}
          />
        </PrintArea>
      )}
    </div>
  );
}
