import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, CircleAlert, Landmark, RefreshCw, Search, ShieldCheck,
} from 'lucide-react';
import api from '../api/axios';
import { apiErrorMessage, fetchAllPages, localDateString } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import { transferTotals } from '../components/cash/cashMath';
import { formatDay } from '../components/cash/format';
import { EmptyState, ErrorState, InlineAlert, LoadingState, PageHeader } from '../components/cash/PageStates';
import StatCard from '../components/cash/StatCard';
import TransferRow from '../components/cash/TransferRow';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 400;
// بلا تاريخ قد تكون التحويلات بالآلاف: نكتفي بأحدث 2000 لحساب الإجماليات.
const ALL_DAYS_MAX_PAGES = 10;
const TOTALS_PAGE_SIZE = 200;

const STATUS_OPTIONS = [
  { value: '', label: 'الكل' },
  { value: '0', label: 'غير مطابق' },
  { value: '1', label: 'مطابق' },
];

const selectClass = 'px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm h-10 focus:border-primary-500 w-full';

/**
 * مطابقة التحويلات البنكية: مراجعة كل تحويل مقابل كشف الحساب ثم تعليمه مطابقاً.
 *
 * التاريخ في الرابط (?date=) لتفتح شاشة الإقفال المطابقةَ على نفس اليوم؛
 * غيابه يعني اليوم، و«?date=» فارغاً يعني كل الأيام.
 */
export default function Transfers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [today] = useState(() => localDateString());
  const date = searchParams.get('date') ?? today;

  const [bankAccount, setBankAccount] = useState('');
  const [verified, setVerified] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchTimer = useRef(null);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [listStatus, setListStatus] = useState('loading');
  const [listError, setListError] = useState('');
  const listSeq = useRef(0);

  const [totalsRows, setTotalsRows] = useState([]);
  const [totalsStatus, setTotalsStatus] = useState('loading');
  const totalsSeq = useRef(0);

  const [accounts, setAccounts] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  // الإجماليات تتجاهل فلتر حالة المطابقة عمداً: تصفية «غير مطابق» للعمل عليها
  // لا يجوز أن تغيّر صورة اليوم الكاملة.
  const fetchTotals = useCallback((filters) => {
    totalsSeq.current += 1;
    const seq = totalsSeq.current;
    return fetchAllPages('payments/', filters, {
      pageSize: TOTALS_PAGE_SIZE,
      maxPages: filters.date ? 50 : ALL_DAYS_MAX_PAGES,
    })
      .then((all) => {
        if (seq !== totalsSeq.current) return;
        setTotalsRows(all);
        setTotalsStatus('ready');
      })
      .catch(() => {
        if (seq !== totalsSeq.current) return;
        setTotalsStatus('error');
      });
  }, []);

  const fetchList = useCallback((filters) => {
    listSeq.current += 1;
    const seq = listSeq.current;
    return api.get('payments/', { params: { ...filters, page_size: PAGE_SIZE } })
      .then(({ data }) => {
        if (seq !== listSeq.current) return;
        const results = data.results || data;
        setRows(results);
        setCount(data.count ?? results.length);
        setListStatus('ready');
      })
      .catch((err) => {
        if (seq !== listSeq.current) return;
        setListError(apiErrorMessage(err, 'تعذّر تحميل التحويلات.'));
        setListStatus('error');
      });
  }, []);

  useEffect(() => {
    const filters = { method: 'bank' };
    if (date) filters.date = date;
    if (bankAccount) filters.bank_account = bankAccount;
    if (search) filters.search = search;
    fetchTotals(filters);
  }, [date, bankAccount, search, fetchTotals]);

  useEffect(() => {
    const filters = { method: 'bank', page };
    if (date) filters.date = date;
    if (bankAccount) filters.bank_account = bankAccount;
    if (search) filters.search = search;
    if (verified) filters.verified = verified;
    fetchList(filters);
  }, [date, bankAccount, search, verified, page, fetchList]);

  // كل الحسابات (حتى المعطّلة): تحويلات قديمة قد تكون على حساب عُطّل لاحقاً.
  useEffect(() => {
    let active = true;
    fetchAllPages('bank-accounts/')
      .then((list) => { if (active) setAccounts(list); })
      .catch(() => { /* فلتر الحساب اختياري؛ تبقى القائمة «كل الحسابات» فقط. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  // أي تغيير في الفلاتر يعيد للصفحة الأولى ويُظهر التحميل.
  const markReloading = ({ totals = true } = {}) => {
    setPage(1);
    setListStatus('loading');
    if (totals) setTotalsStatus('loading');
    setActionError('');
  };

  const changeDate = (value) => {
    if (value === date) return;
    markReloading();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', value);
      return next;
    }, { replace: true });
  };

  const changeBank = (value) => {
    markReloading();
    setBankAccount(value);
  };

  const changeVerified = (value) => {
    markReloading({ totals: false });
    setVerified(value);
  };

  const changeSearch = (value) => {
    setSearchInput(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      const term = value.trim();
      if (term === search) return;
      markReloading();
      setSearch(term);
    }, SEARCH_DEBOUNCE_MS);
  };

  const goToPage = (next) => {
    setListStatus('loading');
    setPage(next);
  };

  const refresh = () => {
    setListStatus('loading');
    setTotalsStatus('loading');
    setActionError('');
    const filters = { method: 'bank' };
    if (date) filters.date = date;
    if (bankAccount) filters.bank_account = bankAccount;
    if (search) filters.search = search;
    fetchTotals(filters);
    fetchList({ ...filters, page, ...(verified ? { verified } : {}) });
  };

  const toggleVerify = async (payment) => {
    const action = payment.verified_at ? 'unverify' : 'verify';
    setBusyId(payment.id);
    setActionError('');
    try {
      const { data } = await api.post(`payments/${payment.id}/${action}/`);
      // نحدّث السطر في القائمة والإجماليات معاً دون إعادة تحميل الصفحة. السطر
      // يبقى ظاهراً حتى لو خرج من الفلتر الحالي، فيمكن التراجع عن نقرة خاطئة.
      const replace = (list) => list.map((item) => (item.id === data.id ? data : item));
      setRows(replace);
      setTotalsRows(replace);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'تعذّر تحديث حالة المطابقة.'));
    }
    setBusyId(null);
  };

  const totals = transferTotals(totalsRows);
  const totalsPartial = !date && totalsRows.length >= TOTALS_PAGE_SIZE * ALL_DAYS_MAX_PAGES;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const verifiedPercent = totals.incoming > 0 ? Math.round((totals.verified / totals.incoming) * 100) : 0;
  const filtered = Boolean(bankAccount || verified || search);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={Landmark}
        title="مطابقة التحويلات"
        subtitle={date ? `تحويلات ${formatDay(date)}` : 'تحويلات كل الأيام'}
        gradient="from-primary-600 to-primary-400"
      >
        <button
          type="button"
          onClick={refresh}
          aria-label="تحديث القائمة"
          title="تحديث"
          className="w-10 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-200 flex items-center justify-center transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      </PageHeader>

      <InlineAlert tone="info">
        قارن كل تحويل بكشف الحساب البنكي (تطبيق بنكك مثلاً): المبلغ ورقم الإشعار وحساب المرسل، ثم علّمه «مطابق».
        أرقام الإشعارات محمية من التكرار: النظام يرفض استخدام رقم إشعار سبق تسجيله.
      </InlineAlert>

      {/* الفلاتر */}
      <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="transfers-date" className="block text-xs font-semibold text-surface-300 mb-1">التاريخ</label>
          <div className="flex gap-2">
            <input
              id="transfers-date"
              type="date"
              value={date}
              max={today}
              onChange={(event) => changeDate(event.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-sm h-10 focus:border-primary-500"
            />
            {date ? (
              <button
                type="button"
                onClick={() => changeDate('')}
                className="px-3 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-300 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                كل الأيام
              </button>
            ) : (
              <button
                type="button"
                onClick={() => changeDate(today)}
                className="px-3 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 border border-white/10 text-surface-300 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                اليوم
              </button>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="transfers-bank" className="block text-xs font-semibold text-surface-300 mb-1">الحساب البنكي</label>
          <select id="transfers-bank" value={bankAccount} onChange={(event) => changeBank(event.target.value)} className={selectClass}>
            <option value="">كل الحسابات</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}{account.is_active ? '' : ' (معطّل)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="transfers-status" className="block text-xs font-semibold text-surface-300 mb-1">حالة المطابقة</label>
          <select id="transfers-status" value={verified} onChange={(event) => changeVerified(event.target.value)} className={selectClass}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="transfers-search" className="block text-xs font-semibold text-surface-300 mb-1">بحث</label>
          <div className="relative">
            <input
              id="transfers-search"
              type="search"
              value={searchInput}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="رقم الإشعار، حساب المرسل، أو العميل"
              className="w-full px-3 py-2 pr-9 rounded-xl bg-surface-900 border border-white/10 text-white text-sm h-10 focus:border-primary-500 placeholder-surface-500"
            />
            <Search className="absolute right-3 top-3 w-4 h-4 text-surface-400" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* الإجماليات */}
      {totalsStatus === 'error' ? (
        <InlineAlert tone="warning">تعذّر حساب الإجماليات. القائمة أدناه صحيحة؛ استخدم زر التحديث لإعادة المحاولة.</InlineAlert>
      ) : (
        <div className="space-y-2" aria-busy={totalsStatus === 'loading'}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={ArrowDownCircle}
              label="إجمالي الوارد"
              value={totalsStatus === 'loading' ? '…' : formatCurrency(totals.incoming)}
              hint={totalsStatus === 'loading' ? undefined : `${totals.count} تحويل`}
            />
            <StatCard
              icon={ShieldCheck}
              label="المطابق منه"
              value={totalsStatus === 'loading' ? '…' : formatCurrency(totals.verified)}
              hint={totalsStatus === 'loading' ? undefined : `${verifiedPercent}٪ من الوارد`}
              tone="success"
            />
            <StatCard
              icon={CircleAlert}
              label="تحويلات غير مطابقة"
              value={totalsStatus === 'loading' ? '…' : totals.unverifiedCount}
              tone={totals.unverifiedCount > 0 ? 'warning' : 'success'}
            />
            <StatCard
              icon={ArrowUpCircle}
              label="صادر (ردّ مبالغ للعملاء)"
              value={totalsStatus === 'loading' ? '…' : formatCurrency(totals.refunds)}
              tone="danger"
            />
          </div>
          <p className="text-[11px] text-surface-500">
            الإجماليات حسب التاريخ والحساب والبحث، بغضّ النظر عن فلتر حالة المطابقة.
            {totalsPartial && ' محسوبة على أحدث 2000 تحويل فقط؛ اختر يوماً لإجماليات دقيقة.'}
          </p>
        </div>
      )}

      {actionError && <InlineAlert onDismiss={() => setActionError('')}>{actionError}</InlineAlert>}

      {/* القائمة */}
      <section className="glass-card overflow-hidden" aria-labelledby="transfers-list-title">
        <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
          <h2 id="transfers-list-title" className="text-sm font-bold text-white flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary-400" aria-hidden="true" />
            التحويلات البنكية
          </h2>
          {listStatus === 'ready' && <span className="text-xs text-surface-400">العدد: {count}</span>}
        </div>

        {listStatus === 'loading' ? (
          <LoadingState label="جارٍ تحميل التحويلات…" />
        ) : listStatus === 'error' ? (
          <ErrorState message={listError} onRetry={refresh} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title={filtered ? 'لا توجد تحويلات مطابقة للفلاتر' : 'لا توجد تحويلات بنكية في هذه الفترة'}
            hint={filtered ? 'جرّب تغيير الحساب أو الحالة أو نص البحث.' : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-surface-400 text-xs">
                    <th scope="col" className="p-3 font-semibold">{date ? 'الوقت' : 'التاريخ'}</th>
                    <th scope="col" className="p-3 font-semibold">النوع</th>
                    <th scope="col" className="p-3 font-semibold">المبلغ</th>
                    <th scope="col" className="p-3 font-semibold">الحساب / البنك</th>
                    <th scope="col" className="p-3 font-semibold">رقم الإشعار</th>
                    <th scope="col" className="p-3 font-semibold">حساب المرسل</th>
                    <th scope="col" className="p-3 font-semibold">العميل</th>
                    <th scope="col" className="p-3 font-semibold">الفاتورة</th>
                    <th scope="col" className="p-3 font-semibold">صورة الإشعار</th>
                    <th scope="col" className="p-3 font-semibold">الحالة</th>
                    <th scope="col" className="p-3"><span className="sr-only">إجراءات</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-surface-200">
                  {rows.map((payment) => (
                    <TransferRow
                      key={payment.id}
                      payment={payment}
                      showDate={!date}
                      busy={busyId === payment.id}
                      onToggle={toggleVerify}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <nav className="p-3 border-t border-white/5 flex items-center justify-between text-xs" aria-label="صفحات التحويلات">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 flex items-center gap-1 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  السابق
                </button>
                <span className="text-surface-400">صفحة {page} من {totalPages}</span>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 flex items-center gap-1 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  التالي
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
