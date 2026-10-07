import { formatCurrency } from '../../utils/currency';
import { mediaUrl } from '../../api/media';
import { formatDate, formatDateTime } from './salesUtils';

// عمود البيان نصّ طويل: نلغي محاذاة الأرقام (يساراً بلا التفاف) التي يفرضها
// .receipt-items على الأعمدة غير الأولى في index.css.
const TEXT_CELL = { textAlign: 'right', whiteSpace: 'normal' };

/** كشف حساب العميل للطباعة على A4 داخل PrintArea. */
export default function StatementDocument({ customer, entries, settings, printedAt }) {
  return (
    <div className="receipt receipt-a4">
      <header className="receipt-header">
        {settings?.logo && <img src={mediaUrl(settings.logo)} alt="" className="receipt-logo" />}
        <h1>{settings?.site_name || 'كشف حساب'}</h1>
        {settings?.business_address && <p>{settings.business_address}</p>}
        {settings?.business_phone && <p dir="ltr">{settings.business_phone}</p>}
        <p><strong>كشف حساب عميل</strong></p>
      </header>

      <section className="receipt-meta">
        <div><span>العميل</span><strong>{customer.name}</strong></div>
        {customer.phone && <div><span>الهاتف</span><span dir="ltr">{customer.phone}</span></div>}
        {customer.customer_type_display && <div><span>النوع</span><span>{customer.customer_type_display}</span></div>}
        <div><span>حد الائتمان</span><span>{formatCurrency(customer.credit_limit)}</span></div>
        <div><span>تاريخ الطباعة</span><span>{formatDateTime(printedAt)}</span></div>
      </section>

      <table className="receipt-items">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th style={TEXT_CELL}>البيان</th>
            <th>مدين</th>
            <th>دائن</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={5}>لا توجد حركات على الحساب.</td></tr>
          ) : entries.map((entry, index) => (
            <tr key={`${entry.type}-${entry.reference}-${index}`}>
              <td>{formatDate(entry.date)}</td>
              <td style={TEXT_CELL}>{entry.reference}</td>
              <td>{Number(entry.debit) > 0 ? formatCurrency(entry.debit) : ''}</td>
              <td>{Number(entry.credit) > 0 ? formatCurrency(entry.credit) : ''}</td>
              <td>{formatCurrency(entry.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="receipt-totals">
        <div className="receipt-total">
          <span>الرصيد المستحق</span>
          <strong>{formatCurrency(customer.balance)}</strong>
        </div>
      </section>

      {settings?.receipt_footer && (
        <footer className="receipt-footer"><p>{settings.receipt_footer}</p></footer>
      )}
    </div>
  );
}
