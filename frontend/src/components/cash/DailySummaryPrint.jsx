import { formatCurrency } from '../../utils/currency';
import { DIFFERENCE_LABELS, differenceTone, expectedCash, toCents } from './cashMath';
import { formatDateTime, formatDay } from './format';

/*
 * ملخص اليومية للطباعة على A4 (يُرسم داخل PrintArea).
 * أنماط مضمّنة بسيطة بالأسود والأبيض: لا نعتمد على ألوان الواجهة الداكنة.
 */
const styles = {
  page: { fontSize: '12px', lineHeight: 1.5, color: '#000' },
  header: { textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '3mm', marginBottom: '4mm' },
  shop: { fontSize: '18px', fontWeight: 700, margin: 0 },
  title: { fontSize: '14px', fontWeight: 700, margin: '2mm 0 0' },
  muted: { margin: 0, fontSize: '11px' },
  section: { marginBottom: '5mm', breakInside: 'avoid' },
  h2: { fontSize: '13px', fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: '1mm', margin: '0 0 2mm' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'right', borderBottom: '1px solid #000', padding: '1mm 1.5mm', fontWeight: 700 },
  td: { textAlign: 'right', borderBottom: '1px solid #ccc', padding: '1mm 1.5mm' },
  num: { textAlign: 'left', borderBottom: '1px solid #ccc', padding: '1mm 1.5mm', whiteSpace: 'nowrap' },
  total: { fontWeight: 700, borderTop: '2px solid #000' },
  signatures: { display: 'flex', justifyContent: 'space-between', marginTop: '14mm', gap: '10mm' },
  signature: { flex: 1, borderTop: '1px solid #000', paddingTop: '1mm', textAlign: 'center' },
};

function Row({ label, value, strong = false }) {
  const cell = strong ? { ...styles.td, ...styles.total } : styles.td;
  const num = strong ? { ...styles.num, ...styles.total } : styles.num;
  return (
    <tr>
      <td style={cell}>{label}</td>
      <td style={num}>{value}</td>
    </tr>
  );
}

export default function DailySummaryPrint({ summary: liveSummary, expenses, settings, printedAt }) {
  const close = liveSummary.closed ? liveSummary.close : null;
  // اليوم المُقفل يُطبع من لقطة الإقفال المحفوظة: الورقة الرسمية تطابق ما أُقفل
  // عليه، لا حركة سُجّلت بعده.
  const summary = close?.summary?.date ? { ...liveSummary, ...close.summary } : liveSummary;
  const opening = close ? close.opening_cash : summary.opening_cash;
  const expected = close
    ? close.expected_cash
    : expectedCash({
      opening, cashIn: summary.cash_in, cashRefunds: summary.cash_refunds, cashExpenses: summary.cash_expenses,
    });
  const expensesTotal = expenses.reduce((sum, expense) => sum + toCents(expense.amount), 0) / 100;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <p style={styles.shop}>{settings?.site_name || 'ملخص اليومية'}</p>
        {settings?.business_address && <p style={styles.muted}>{settings.business_address}</p>}
        {settings?.business_phone && <p style={styles.muted} dir="ltr">{settings.business_phone}</p>}
        <p style={styles.title}>ملخص يومية {formatDay(summary.date)}</p>
        <p style={styles.muted}>
          {close ? `مُقفل بواسطة ${close.closed_by_name} في ${formatDateTime(close.closed_at)}` : 'لم يُقفل بعد (ملخص مبدئي)'}
          {' — '}طُبع في {formatDateTime(printedAt)}
        </p>
      </header>

      <section style={styles.section}>
        <h2 style={styles.h2}>المبيعات والحركة ({summary.currency})</h2>
        <table style={styles.table}>
          <tbody>
            <Row label="عدد فواتير البيع" value={summary.sales_count} />
            <Row label="إجمالي المبيعات" value={formatCurrency(summary.sales_total)} />
            <Row label="منها مبيعات آجلة" value={formatCurrency(summary.credit_sales)} />
            <Row label="تحصيلات ديون العملاء" value={formatCurrency(summary.collections)} />
            <Row label={`المرتجعات (${summary.returns_count})`} value={formatCurrency(summary.returns_total)} />
            <Row label="المصروفات" value={formatCurrency(summary.expenses_total)} />
          </tbody>
        </table>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>الصندوق النقدي</h2>
        <table style={styles.table}>
          <tbody>
            <Row label="نقد بداية اليوم" value={formatCurrency(opening)} />
            <Row label="+ نقد وارد (مبيعات وتحصيلات)" value={formatCurrency(summary.cash_in)} />
            <Row label="− ردّ نقدي للمرتجعات" value={formatCurrency(summary.cash_refunds)} />
            <Row label="− مصروفات نقدية" value={formatCurrency(summary.cash_expenses)} />
            <Row label="= النقد المتوقع" value={formatCurrency(expected)} strong />
            {close && (
              <>
                <Row label="النقد المعدود" value={formatCurrency(close.counted_cash)} />
                <Row
                  label={`الفرق (${DIFFERENCE_LABELS[differenceTone(close.difference)]})`}
                  value={formatCurrency(close.difference)}
                  strong
                />
              </>
            )}
          </tbody>
        </table>
        {close?.notes && <p style={{ margin: '2mm 0 0' }}>ملاحظات الإقفال: {close.notes}</p>}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>التحويلات البنكية</h2>
        {summary.banks.length === 0 ? (
          <p style={styles.muted}>لا توجد تحويلات.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الحساب / البنك</th>
                <th style={styles.th}>وارد</th>
                <th style={styles.th}>صادر</th>
                <th style={styles.th}>العدد</th>
                <th style={styles.th}>غير مطابق</th>
              </tr>
            </thead>
            <tbody>
              {summary.banks.map((row) => (
                <tr key={row.bank}>
                  <td style={styles.td}>{row.bank}</td>
                  <td style={styles.num}>{formatCurrency(row.in)}</td>
                  <td style={styles.num}>{formatCurrency(row.out)}</td>
                  <td style={styles.num}>{row.count}</td>
                  <td style={styles.num}>{row.unverified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>المصروفات</h2>
        {expenses.length === 0 ? (
          <p style={styles.muted}>لا توجد مصروفات.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>البند</th>
                <th style={styles.th}>الطريقة</th>
                <th style={styles.th}>الوصف</th>
                <th style={styles.th}>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td style={styles.td}>{expense.category}</td>
                  <td style={styles.td}>{expense.method === 'bank' ? `تحويل — ${expense.bank_account_name || ''}` : 'نقدي'}</td>
                  <td style={styles.td}>{expense.description || '—'}</td>
                  <td style={styles.num}>{formatCurrency(expense.amount)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...styles.td, ...styles.total }} colSpan={3}>الإجمالي</td>
                <td style={{ ...styles.num, ...styles.total }}>{formatCurrency(expensesTotal)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <div style={styles.signatures}>
        <div style={styles.signature}>توقيع الكاشير</div>
        <div style={styles.signature}>توقيع المدير</div>
      </div>
    </div>
  );
}
