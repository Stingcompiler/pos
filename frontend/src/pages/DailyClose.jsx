import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, HandCoins, Lock, LockOpen, Printer, Receipt, RefreshCw, ShoppingCart, Undo2, Wallet,
} from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/useAuth';
import useReceiptSettings from '../hooks/useReceiptSettings';
import PrintArea from '../components/PrintArea';
import { apiErrorMessage, fetchAllPages, localDateString } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import { parseMoneyInput } from '../components/cash/cashMath';
import { ErrorState, InlineAlert, LoadingState, PageHeader } from '../components/cash/PageStates';
import StatCard from '../components/cash/StatCard';
import CashBoxPanel from '../components/cash/CashBoxPanel';
import BanksTable from '../components/cash/BanksTable';
import ExpensesPanel from '../components/cash/ExpensesPanel';
import CloseDayPanel from '../components/cash/CloseDayPanel';
import RecentCloses from '../components/cash/RecentCloses';
import DailySummaryPrint from '../components/cash/DailySummaryPrint';

// مهلة قبل إعادة حساب الملخص أثناء كتابة نقد البداية: طلب واحد بعد التوقف لا طلب لكل حرف.
const OPENING_DEBOUNCE_MS = 500;

/**
 * إقفال اليومية: ملخص اليوم، حساب الدرج، المصروفات، ثم عدّ النقد وإقفال اليوم.
 *
 * الخادم مصدر الأرقام كلها (daily-summary)؛ الواجهة تعرض وتحسب الفرق لحظياً
 * فقط. المدير وحده يعيد فتح يوم مُقفل ويحذف المصروفات.
 */
export default function DailyClose() {
  const { isManager } = useAuth();
  const receiptSettings = useReceiptSettings();
  const [today] = useState(() => localDateString());
  const [date, setDate] = useState(today);

  const [summary, setSummary] = useState(null);
  const [summaryStatus, setSummaryStatus] = useState('loading');
  const [summaryError, setSummaryError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const summarySeq = useRef(0);

  // نقد البداية: النص في الحقل، والقيمة المعتمدة المرسلة للخادم (null = الافتراضي).
  const [openingInput, setOpeningInput] = useState('');
  const [openingOverride, setOpeningOverride] = useState(null);
  const [openingInvalid, setOpeningInvalid] = useState(false);
  const [openingPending, setOpeningPending] = useState(false);
  const openingTimer = useRef(null);

  const [expenses, setExpenses] = useState([]);
  const [expensesStatus, setExpensesStatus] = useState('loading');
  const [expensesError, setExpensesError] = useState('');
  const expensesSeq = useRef(0);

  const [closes, setCloses] = useState([]);
  const [closesStatus, setClosesStatus] = useState('loading');
  const [closesError, setClosesError] = useState('');

  const [printJob, setPrintJob] = useState(null);

  /*
   * دوال الجلب لا تغيّر الحالة قبل اكتمال الطلب؛ من يستدعيها يضبط حالة
   * «جارٍ التحميل» بنفسه. الرقم التسلسلي يُسقط ردّاً متأخراً ليوم سابق حين
   * يتنقّل المستخدم بين الأيام بسرعة.
   */
  const fetchSummary = useCallback((day, opening, { fillOpening = false, quiet = false } = {}) => {
    summarySeq.current += 1;
    const seq = summarySeq.current;
    const params = { date: day };
    if (opening !== null && opening !== undefined) params.opening_cash = opening;
    return api.get('daily-summary/', { params })
      .then(({ data }) => {
        if (seq !== summarySeq.current) return;
        setSummary(data);
        setSummaryStatus('ready');
        setRefreshError('');
        if (fillOpening) setOpeningInput(String(data.opening_cash ?? '0'));
      })
      .catch((err) => {
        if (seq !== summarySeq.current) return;
        const message = apiErrorMessage(err, 'تعذّر تحميل ملخص اليوم.');
        if (quiet) {
          // تحديث بعد إجراء: نُبقي آخر ملخص ظاهراً مع تنبيه بدل مسح الشاشة.
          setRefreshError(message);
        } else {
          setSummaryError(message);
          setSummaryStatus('error');
        }
      })
      .finally(() => {
        if (seq === summarySeq.current) setOpeningPending(false);
      });
  }, []);

  const fetchExpenses = useCallback((day) => {
    expensesSeq.current += 1;
    const seq = expensesSeq.current;
    return fetchAllPages('expenses/', { date: day })
      .then((rows) => {
        if (seq !== expensesSeq.current) return;
        setExpenses(rows);
        setExpensesStatus('ready');
      })
      .catch((err) => {
        if (seq !== expensesSeq.current) return;
        setExpensesError(apiErrorMessage(err, 'تعذّر تحميل المصروفات.'));
        setExpensesStatus('error');
      });
  }, []);

  const fetchCloses = useCallback(() => api.get('daily-closes/', { params: { page_size: 10 } })
    .then(({ data }) => {
      setCloses(data.results || data);
      setClosesStatus('ready');
    })
    .catch((err) => {
      setClosesError(apiErrorMessage(err, 'تعذّر تحميل الإقفالات السابقة.'));
      setClosesStatus('error');
    }), []);

  useEffect(() => {
    fetchSummary(date, null, { fillOpening: true });
    fetchExpenses(date);
  }, [date, fetchSummary, fetchExpenses]);

  useEffect(() => {
    fetchCloses();
  }, [fetchCloses]);

  // مؤقّت إعادة الحساب لا يجوز أن يعمل بعد مغادرة الصفحة.
  useEffect(() => () => window.clearTimeout(openingTimer.current), []);

  const changeDate = (value) => {
    if (!value || value === date) return;
    window.clearTimeout(openingTimer.current);
    summarySeq.current += 1;
    expensesSeq.current += 1;
    setDate(value);
    setSummaryStatus('loading');
    setExpensesStatus('loading');
    setRefreshError('');
    setOpeningInput('');
    setOpeningOverride(null);
    setOpeningInvalid(false);
    setOpeningPending(false);
  };

  const handleOpeningChange = (text) => {
    setOpeningInput(text);
    window.clearTimeout(openingTimer.current);
    const parsed = parseMoneyInput(text);
    if (parsed === null) {
      setOpeningInvalid(true);
      setOpeningPending(false);
      return;
    }
    setOpeningInvalid(false);
    setOpeningOverride(parsed);
    setOpeningPending(true);
    // نُسقط أي ردّ جارٍ بقيمة أقدم: لو وصل أثناء مهلة الانتظار لأظهر متوقعاً
    // قديماً وأتاح الإقفال قبل إعادة الحساب.
    summarySeq.current += 1;
    openingTimer.current = window.setTimeout(() => {
      fetchSummary(date, parsed, { quiet: true });
    }, OPENING_DEBOUNCE_MS);
  };

  const retrySummary = () => {
    setSummaryStatus('loading');
    fetchSummary(date, openingOverride, { fillOpening: openingOverride === null });
  };

  const retryExpenses = () => {
    setExpensesStatus('loading');
    fetchExpenses(date);
  };

  const retryCloses = () => {
    setClosesStatus('loading');
    fetchCloses();
  };

  const refreshAll = () => {
    fetchSummary(date, openingOverride, { quiet: true });
    fetchExpenses(date);
    fetchCloses();
  };

  // بعد إضافة مصروف أو حذفه يتغيّر النقد المتوقع، فنعيد الملخص مع القائمة.
  const handleExpensesChanged = () => Promise.all([
    fetchSummary(date, openingOverride, { quiet: true }),
    fetchExpenses(date),
  ]);

  // بعد الإقفال أو إعادة الفتح. عند إعادة الفتح نُبقي نقد البداية الذي أُقفل به
  // اليوم، فإعادة الإقفال تبدأ من نفس الأرقام.
  const handleCloseChanged = () => {
    const reopened = summary?.closed ? summary.close : null;
    let opening = openingOverride;
    if (reopened) {
      opening = String(reopened.opening_cash);
      setOpeningInput(opening);
      setOpeningOverride(opening);
      setOpeningInvalid(false);
    }
    return Promise.all([fetchSummary(date, opening, { quiet: true }), fetchCloses()]);
  };

  const startPrint = () => setPrintJob({ key: Date.now(), printedAt: new Date().toISOString() });
  // مرجع ثابت: PrintArea يعيد الطباعة إن تغيّر onDone.
  const endPrint = useCallback(() => setPrintJob(null), []);

  const ready = summaryStatus === 'ready' && summary;
  const closed = Boolean(ready && summary.closed);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={Wallet}
        title="إقفال اليومية"
        subtitle="ملخص اليوم، حساب الدرج، المصروفات، ثم مقارنة النقد المعدود بالمتوقع"
        gradient="from-success-500 to-primary-500"
      >
        <label htmlFor="close-date" className="sr-only">اليوم</label>
        <input
          id="close-date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => changeDate(event.target.value)}
          className="px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm h-10 focus:border-primary-500"
        />
        {date !== today && (
          <button
            type="button"
            onClick={() => changeDate(today)}
            className="px-3 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-200 text-xs font-semibold transition cursor-pointer"
          >
            اليوم
          </button>
        )}
        <button
          type="button"
          onClick={refreshAll}
          aria-label="تحديث الأرقام"
          title="تحديث"
          className="w-10 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-200 flex items-center justify-center transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={startPrint}
          disabled={!ready || expensesStatus !== 'ready'}
          className="px-4 h-10 rounded-xl gradient-primary text-white text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          طباعة الملخص
        </button>
      </PageHeader>

      {refreshError && (
        <InlineAlert tone="warning" onDismiss={() => setRefreshError('')}>
          تعذّر تحديث الملخص: {refreshError} الأرقام الظاهرة قد تكون قديمة.
        </InlineAlert>
      )}

      {summaryStatus === 'loading' ? (
        <div className="glass-card"><LoadingState label="جارٍ تحميل ملخص اليوم…" /></div>
      ) : summaryStatus === 'error' ? (
        <div className="glass-card"><ErrorState message={summaryError} onRetry={retrySummary} /></div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            {closed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-500/10 text-success-400 border border-success-500/20">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                اليوم مُقفل
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning-500/10 text-warning-400 border border-warning-500/20">
                <LockOpen className="w-3.5 h-3.5" aria-hidden="true" />
                اليوم مفتوح
              </span>
            )}
            <span className="text-surface-400 text-xs">العملة: {summary.currency}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard
              icon={ShoppingCart}
              label="إجمالي المبيعات"
              value={formatCurrency(summary.sales_total)}
              hint={`${summary.sales_count} فاتورة`}
            />
            <StatCard icon={FileText} label="منها آجل (دين)" value={formatCurrency(summary.credit_sales)} tone="warning" />
            <StatCard icon={HandCoins} label="تحصيلات ديون" value={formatCurrency(summary.collections)} tone="success" />
            <StatCard
              icon={Undo2}
              label="المرتجعات"
              value={formatCurrency(summary.returns_total)}
              hint={`${summary.returns_count} مرتجع`}
              tone="danger"
            />
            <StatCard icon={Receipt} label="المصروفات" value={formatCurrency(summary.expenses_total)} tone="neutral" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <div className="xl:col-span-2 space-y-6">
              <CashBoxPanel
                summary={summary}
                openingInput={openingInput}
                onOpeningChange={handleOpeningChange}
                openingInvalid={openingInvalid}
                pending={openingPending}
              />
              <BanksTable banks={summary.banks || []} date={date} />
              <ExpensesPanel
                date={date}
                expenses={expenses}
                status={expensesStatus}
                error={expensesError}
                onRetry={retryExpenses}
                closed={closed}
                canDelete={isManager}
                onChanged={handleExpensesChanged}
              />
            </div>
            <div className="space-y-6">
              <CloseDayPanel
                key={`${date}-${summary.close?.id ?? 'open'}`}
                date={date}
                summary={summary}
                pending={openingPending}
                openingInvalid={openingInvalid}
                isManager={isManager}
                onChanged={handleCloseChanged}
              />
              <RecentCloses
                closes={closes}
                status={closesStatus}
                error={closesError}
                onRetry={retryCloses}
                onSelect={changeDate}
                selectedDate={date}
              />
            </div>
          </div>
        </>
      )}

      {printJob && ready && (
        <PrintArea key={printJob.key} paper="a4" onDone={endPrint}>
          <DailySummaryPrint
            summary={summary}
            expenses={expenses}
            settings={receiptSettings}
            printedAt={printJob.printedAt}
          />
        </PrintArea>
      )}
    </div>
  );
}
