import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import PrintArea from '../components/PrintArea';
import useReceiptSettings from '../hooks/useReceiptSettings';
import {
  LayoutDashboard, TrendingUp, ShoppingBag, CreditCard, Printer, Loader2,
  Calendar, Wallet, RotateCcw, HandCoins, Receipt, PiggyBank, Percent,
  AlertTriangle, AlertCircle, Trophy, Scale, RefreshCw,
} from 'lucide-react';

const PERIODS = [
  { id: 'daily', tab: 'يومي', label: 'يومي (آخر 30 يوم)' },
  { id: 'weekly', tab: 'أسبوعي', label: 'أسبوعي (آخر 12 أسبوع)' },
  { id: 'monthly', tab: 'شهري', label: 'شهري (آخر 12 شهر)' },
  { id: 'yearly', tab: 'سنوي', label: 'سنوي (آخر 5 سنوات)' },
];

const periodLabel = (id) => PERIODS.find((p) => p.id === id)?.label || '';

const fmtNum = (v) => new Intl.NumberFormat('ar-SA').format(Number(v) || 0);
const fmtPercent = (v) => `${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 1 }).format(Number(v) || 0)}٪`;
const shareOf = (part, total) => (total > 0 ? Math.min(100, (Number(part) / total) * 100) : 0);

// تواريخ ميلادية صراحةً: ar-SA في بعض المتصفحات يعرض التقويم الهجري.
const bucketFormats = {
  daily: new Intl.DateTimeFormat('ar-SD', { weekday: 'short', day: 'numeric', month: 'short' }),
  weekly: new Intl.DateTimeFormat('ar-SD', { day: 'numeric', month: 'short', year: 'numeric' }),
  monthly: new Intl.DateTimeFormat('ar-SD', { month: 'long', year: 'numeric' }),
  yearly: new Intl.DateTimeFormat('ar-SD', { year: 'numeric' }),
};
const printedAtFormat = new Intl.DateTimeFormat('ar-SD', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** تسمية صف الفترة من "YYYY-MM-DD" (بداية اليوم/الأسبوع/الشهر/السنة). */
function formatBucket(period, value) {
  if (!value) return '-';
  const [year, month, day] = value.split('-').map(Number);
  if (!year) return value;
  const date = new Date(year, (month || 1) - 1, day || 1);
  const text = (bucketFormats[period] || bucketFormats.daily).format(date);
  return period === 'weekly' ? `أسبوع ${text}` : text;
}

function Kpi({ label, value, hint, icon, tone = 'primary', money = true, children }) {
  const Icon = icon;
  const tones = {
    primary: 'border-r-primary-500 text-primary-400',
    accent: 'border-r-accent-500 text-accent-400',
    success: 'border-r-success-500 text-success-400',
    warning: 'border-r-warning-500 text-warning-400',
    danger: 'border-r-danger-500 text-danger-400',
  };
  const [border, iconColor] = tones[tone].split(' ');
  return (
    <div className={`glass-card p-5 space-y-2 border-r-4 ${border}`}>
      <div className="flex justify-between items-start gap-2">
        <span className="text-xs font-semibold text-surface-400">{label}</span>
        <Icon className={`w-4 h-4 ${iconColor}`} aria-hidden="true" />
      </div>
      <p className="text-xl font-bold text-white tracking-wide nums">
        {value}
        {money && <span className="text-xs font-medium text-surface-400 mr-1">ج.س</span>}
      </p>
      {hint && <div className="text-[11px] text-surface-400 leading-relaxed">{hint}</div>}
      {children}
    </div>
  );
}

function ShareBar({ percent, color }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-surface-400">
        <span>من إجمالي المبيعات</span>
        <span>{fmtPercent(percent)}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden" aria-hidden="true">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// ─── تخطيط الطباعة (A4): ملخص + التفاصيل + الأكثر مبيعاً، بلا ألوان الشاشة ───
const ps = {
  page: { fontSize: '11.5px', color: '#000', lineHeight: 1.5 },
  header: { borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '10px' },
  h1: { fontSize: '18px', fontWeight: 700, margin: 0 },
  meta: { fontSize: '11px', color: '#333', margin: '2px 0 0' },
  h2: { fontSize: '13px', fontWeight: 700, margin: '14px 0 6px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid #000', fontWeight: 700 },
  td: { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid #ccc' },
  num: { textAlign: 'left', whiteSpace: 'nowrap' },
  note: { fontSize: '10.5px', color: '#333', marginTop: '6px' },
};

function ReportPrintLayout({ data, period, siteName, printedAt }) {
  const o = data.overall;
  const summary = [
    ['إجمالي المبيعات', formatCurrency(o.gross_revenue)],
    [`المرتجعات (${fmtNum(o.returns_count)} عملية)`, formatCurrency(o.returns_total)],
    ['صافي المبيعات', formatCurrency(o.total_revenue)],
    ['عدد الفواتير', fmtNum(o.total_orders)],
    ['المحصّل نقداً', formatCurrency(o.cash_sales)],
    ['المحصّل بالتحويل البنكي', formatCurrency(o.bank_sales)],
    ['المبيعات الآجلة', formatCurrency(o.credit_sales)],
    ['ربح المبيعات قبل المصروفات', formatCurrency(o.total_profit)],
    ['المصروفات', formatCurrency(o.expenses_total)],
    ['صافي الربح', formatCurrency(o.net_profit)],
    ['هامش الربح', fmtPercent(o.gross_margin_percent)],
  ];
  // جدول الملخص بعمودين من الأزواج لتوفير الورق.
  const rows = [];
  for (let i = 0; i < summary.length; i += 2) rows.push([summary[i], summary[i + 1]]);

  return (
    <div style={ps.page}>
      <div style={ps.header}>
        <h1 style={ps.h1}>{siteName ? `${siteName} — ` : ''}تقرير المبيعات</h1>
        <p style={ps.meta}>
          الفترة: {periodLabel(period)} · المبالغ بـ{data.currency || 'SDG'} · تاريخ الطباعة: {printedAtFormat.format(new Date(printedAt))}
        </p>
      </div>

      <h2 style={ps.h2}>الملخص</h2>
      <table style={ps.table}>
        <tbody>
          {rows.map((pair, index) => (
            <tr key={index}>
              {pair.map((cell, cellIndex) => (cell ? (
                <FragmentCells key={cellIndex} label={cell[0]} value={cell[1]} />
              ) : (
                <FragmentCells key={cellIndex} label="" value="" />
              )))}
            </tr>
          ))}
        </tbody>
      </table>
      {o.other_currency_orders > 0 && (
        <p style={ps.note}>
          * لا يشمل التقرير {fmtNum(o.other_currency_orders)} فاتورة قديمة مسجّلة بعملة أخرى.
        </p>
      )}

      <h2 style={ps.h2}>التفاصيل حسب الفترة</h2>
      <table style={ps.table}>
        <thead>
          <tr>
            <th style={ps.th}>الفترة</th>
            <th style={{ ...ps.th, textAlign: 'center' }}>الفواتير</th>
            <th style={{ ...ps.th, ...ps.num }}>نقدي</th>
            <th style={{ ...ps.th, ...ps.num }}>بنكي</th>
            <th style={{ ...ps.th, ...ps.num }}>المرتجعات</th>
            <th style={{ ...ps.th, ...ps.num }}>صافي المبيعات</th>
          </tr>
        </thead>
        <tbody>
          {data.breakdown.length === 0 ? (
            <tr><td colSpan={6} style={{ ...ps.td, textAlign: 'center' }}>لا توجد بيانات لهذه الفترة</td></tr>
          ) : data.breakdown.map((item, i) => (
            <tr key={item.period || i}>
              <td style={ps.td}>{formatBucket(period, item.period)}</td>
              <td style={{ ...ps.td, textAlign: 'center' }}>{fmtNum(item.orders)}</td>
              <td style={{ ...ps.td, ...ps.num }}>{formatCurrency(item.cash_revenue)}</td>
              <td style={{ ...ps.td, ...ps.num }}>{formatCurrency(item.bank_revenue)}</td>
              <td style={{ ...ps.td, ...ps.num }}>{formatCurrency(item.returns)}</td>
              <td style={{ ...ps.td, ...ps.num, fontWeight: 700 }}>{formatCurrency(item.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={ps.h2}>الأكثر مبيعاً</h2>
      <table style={ps.table}>
        <thead>
          <tr>
            <th style={ps.th}>#</th>
            <th style={ps.th}>القطعة</th>
            <th style={{ ...ps.th, textAlign: 'center' }}>الكمية</th>
            <th style={{ ...ps.th, ...ps.num }}>الإيراد</th>
            <th style={{ ...ps.th, ...ps.num }}>الربح</th>
          </tr>
        </thead>
        <tbody>
          {(data.top_products || []).length === 0 ? (
            <tr><td colSpan={5} style={{ ...ps.td, textAlign: 'center' }}>لا توجد مبيعات</td></tr>
          ) : data.top_products.map((product, i) => (
            <tr key={product.id}>
              <td style={ps.td}>{fmtNum(i + 1)}</td>
              <td style={ps.td}>{product.name}</td>
              <td style={{ ...ps.td, textAlign: 'center' }}>{fmtNum(product.quantity_sold)}</td>
              <td style={{ ...ps.td, ...ps.num }}>{formatCurrency(product.revenue)}</td>
              <td style={{ ...ps.td, ...ps.num }}>{formatCurrency(product.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentCells({ label, value }) {
  return (
    <>
      <td style={{ ...ps.td, color: '#333', width: '30%' }}>{label}</td>
      <td style={{ ...ps.td, ...ps.num, fontWeight: 700, width: '20%' }}>{value}</td>
    </>
  );
}

export default function Reports() {
  const [period, setPeriod] = useState('daily');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // وقت بدء الطباعة: مفتاح لكل مهمة طباعة ويُطبع في رأس التقرير.
  const [printJob, setPrintJob] = useState(null);
  const receiptSettings = useReceiptSettings();

  // useCallback يربط الجلب بالفترة المختارة فقط بدل إعادة الإنشاء كل تصيير.
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('reports/sales/', { params: { period } });
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(apiErrorMessage(err, 'فشل في تحميل بيانات التقارير. يرجى المحاولة مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // ثابتة عبر التصيير: PrintArea يعيد الطباعة إن تغيّرت onDone.
  const handlePrintDone = useCallback(() => setPrintJob(null), []);

  const o = data?.overall;
  const gross = Number(o?.gross_revenue) || 0;
  const netProfitNegative = Number(o?.net_profit) < 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary-500" aria-hidden="true" />
            تقارير المبيعات
          </h1>
          <p className="text-sm text-surface-400">
            مراقبة وتحليل أداء مبيعات المتجر — {periodLabel(period)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Tabs */}
          <div className="bg-surface-900/60 p-1 border border-white/5 rounded-xl flex gap-1" role="group" aria-label="فترة التقرير">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                aria-pressed={period === p.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p.id
                    ? 'bg-primary-600 text-white shadow'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                {p.tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPrintJob(Date.now())}
            disabled={!data || loading}
            className="px-4 py-1.5 bg-surface-900 border border-white/10 hover:border-primary-500/30 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4 text-primary-400" aria-hidden="true" />
            طباعة التقرير
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24" role="status" aria-label="جاري تحميل التقرير">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center max-w-lg mx-auto space-y-3" role="alert">
          <AlertCircle className="w-8 h-8 text-danger-400 mx-auto" aria-hidden="true" />
          <p className="text-danger-400 font-semibold">{error}</p>
          <button
            type="button"
            onClick={fetchReportData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-900 border border-white/10 text-white text-xs font-bold hover:border-primary-500/30"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      ) : data ? (
        <>
          {o.other_currency_orders > 0 && (
            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-warning-500/10 border border-warning-500/20 text-warning-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                لا يشمل التقرير {fmtNum(o.other_currency_orders)} فاتورة قديمة مسجّلة بعملة أخرى غير {data.currency || 'SDG'}؛ الأرقام أدناه بالجنيه فقط.
              </span>
            </div>
          )}

          {/* المبيعات */}
          <section aria-labelledby="sales-heading" className="space-y-3">
            <h2 id="sales-heading" className="text-sm font-bold text-surface-300">المبيعات</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                label="إجمالي المبيعات"
                value={formatCurrency(o.gross_revenue)}
                icon={TrendingUp}
                tone="primary"
                hint="قيمة الفواتير قبل خصم المرتجعات"
              />
              <Kpi
                label="المرتجعات"
                value={formatCurrency(o.returns_total)}
                icon={RotateCcw}
                tone="danger"
                hint={`${fmtNum(o.returns_count)} عملية إرجاع خلال الفترة`}
              />
              <Kpi
                label="صافي المبيعات"
                value={formatCurrency(o.total_revenue)}
                icon={Scale}
                tone="success"
                hint="إجمالي المبيعات بعد خصم المرتجعات"
              />
              <Kpi
                label="عدد الفواتير"
                value={`${fmtNum(o.total_orders)} فاتورة`}
                icon={ShoppingBag}
                tone="accent"
                money={false}
                hint="حجم العمليات الإجمالي"
              />
            </div>
          </section>

          {/* التحصيل */}
          <section aria-labelledby="collection-heading" className="space-y-3">
            <h2 id="collection-heading" className="text-sm font-bold text-surface-300">طريقة الدفع</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Kpi
                label="نقدي"
                value={formatCurrency(o.cash_sales)}
                icon={Wallet}
                tone="success"
                hint={`دفعات نقدية في ${fmtNum(o.cash_count)} فاتورة`}
              >
                <ShareBar percent={shareOf(o.cash_sales, gross)} color="bg-success-500" />
              </Kpi>
              <Kpi
                label="تحويل بنكي"
                value={formatCurrency(o.bank_sales)}
                icon={CreditCard}
                tone="primary"
                hint={`تحويلات في ${fmtNum(o.bank_count)} فاتورة`}
              >
                <ShareBar percent={shareOf(o.bank_sales, gross)} color="bg-primary-500" />
              </Kpi>
              <Kpi
                label="مبيعات آجلة"
                value={formatCurrency(o.credit_sales)}
                icon={HandCoins}
                tone="warning"
                hint="الجزء غير المدفوع من الفواتير (دَين على العملاء)"
              >
                <ShareBar percent={shareOf(o.credit_sales, gross)} color="bg-warning-500" />
              </Kpi>
            </div>
          </section>

          {/* الأرباح */}
          <section aria-labelledby="profit-heading" className="space-y-3">
            <h2 id="profit-heading" className="text-sm font-bold text-surface-300">الأرباح</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                label="ربح المبيعات قبل المصروفات"
                value={formatCurrency(o.total_profit)}
                icon={TrendingUp}
                tone="accent"
                hint="سعر البيع ناقص التكلفة، صافياً من المرتجعات"
              />
              <Kpi
                label="المصروفات"
                value={formatCurrency(o.expenses_total)}
                icon={Receipt}
                tone="warning"
                hint="إيجار، كهرباء، رواتب... المسجّلة خلال الفترة"
              />
              <Kpi
                label="صافي الربح"
                value={formatCurrency(o.net_profit)}
                icon={PiggyBank}
                tone={netProfitNegative ? 'danger' : 'success'}
                hint={netProfitNegative ? 'المصروفات أكبر من ربح المبيعات' : 'ربح المبيعات بعد خصم المصروفات'}
              />
              <Kpi
                label="هامش الربح"
                value={fmtPercent(o.gross_margin_percent)}
                icon={Percent}
                tone="primary"
                money={false}
                hint="ربح المبيعات ÷ صافي المبيعات"
              />
            </div>
          </section>

          {/* Periodic breakdown table */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary-400" aria-hidden="true" />
                تفاصيل المبيعات حسب الفترة
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-surface-400 border-b border-white/5">
                    <th scope="col" className="p-4 font-semibold text-right">الفترة الزمنية</th>
                    <th scope="col" className="p-4 font-semibold text-center">عدد الفواتير</th>
                    <th scope="col" className="p-4 font-semibold text-left">نقدي</th>
                    <th scope="col" className="p-4 font-semibold text-left">بنكي</th>
                    <th scope="col" className="p-4 font-semibold text-left">المرتجعات</th>
                    <th scope="col" className="p-4 font-semibold text-left">صافي المبيعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.breakdown.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-surface-500">
                        لا توجد بيانات متاحة لهذه الفترة
                      </td>
                    </tr>
                  ) : (
                    data.breakdown.map((item, i) => (
                      <tr key={item.period || i} className="hover:bg-white/2 transition-colors">
                        <td className="p-4 text-white font-medium whitespace-nowrap">{formatBucket(period, item.period)}</td>
                        <td className="p-4 text-center text-surface-300">{fmtNum(item.orders)}</td>
                        <td className="p-4 text-left text-success-400">{formatCurrency(item.cash_revenue)}</td>
                        <td className="p-4 text-left text-primary-300">{formatCurrency(item.bank_revenue)}</td>
                        <td className={`p-4 text-left ${Number(item.returns) > 0 ? 'text-danger-400' : 'text-surface-500'}`}>
                          {formatCurrency(item.returns)}
                        </td>
                        <td className="p-4 text-left text-accent-400 font-bold">{formatCurrency(item.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top products */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-warning-400" aria-hidden="true" />
                القطع الأكثر مبيعاً (بالإيراد الصافي)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-surface-400 border-b border-white/5">
                    <th scope="col" className="p-4 font-semibold text-right w-12">#</th>
                    <th scope="col" className="p-4 font-semibold text-right">القطعة</th>
                    <th scope="col" className="p-4 font-semibold text-center">الكمية المباعة</th>
                    <th scope="col" className="p-4 font-semibold text-left">الإيراد</th>
                    <th scope="col" className="p-4 font-semibold text-left">الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(data.top_products || []).length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-surface-500">لا توجد مبيعات في هذه الفترة</td>
                    </tr>
                  ) : (
                    data.top_products.map((product, i) => (
                      <tr key={product.id} className="hover:bg-white/2 transition-colors">
                        <td className="p-4 text-surface-500">{fmtNum(i + 1)}</td>
                        <td className="p-4 text-white font-medium">{product.name}</td>
                        <td className="p-4 text-center text-surface-300">{fmtNum(product.quantity_sold)}</td>
                        <td className="p-4 text-left text-accent-400">{formatCurrency(product.revenue)}</td>
                        <td className={`p-4 text-left ${Number(product.profit) < 0 ? 'text-danger-400' : 'text-success-400'}`}>
                          {formatCurrency(product.profit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {printJob && data && (
        <PrintArea key={printJob} paper="a4" onDone={handlePrintDone}>
          <ReportPrintLayout
            data={data}
            period={period}
            siteName={receiptSettings?.site_name}
            printedAt={printJob}
          />
        </PrintArea>
      )}
    </div>
  );
}
