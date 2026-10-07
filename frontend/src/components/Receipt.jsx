import Barcode from './Barcode';
import { formatCurrency } from '../utils/currency';
import { mediaUrl } from '../api/media';

const METHOD_LABELS = { cash: 'نقدي', bank: 'تحويل بنكي' };

function formatDate(value) {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

/**
 * إيصال/فاتورة البيع للطباعة: هوية البائع، البنود، الدفعات، والمتبقي آجلاً.
 *
 * يعتمد على بيانات InvoiceSerializer كما يعيدها الخادم (لا على السلة)، فما
 * يُطبع هو ما سُجّل فعلاً بالأسعار والخصومات المطبّقة.
 */
export default function Receipt({ invoice, settings, paper = '80mm' }) {
  const thermal = paper !== 'a4';
  const credit = Number(invoice.credit_amount || 0);
  const returned = (invoice.returns || []).reduce((sum, ret) => sum + Number(ret.total_amount), 0);

  return (
    <div className={`receipt ${thermal ? 'receipt-thermal' : 'receipt-a4'}`}>
      <header className="receipt-header">
        {settings?.logo && <img src={mediaUrl(settings.logo)} alt="" className="receipt-logo" />}
        <h1>{settings?.site_name || 'فاتورة بيع'}</h1>
        {settings?.business_address && <p>{settings.business_address}</p>}
        {settings?.business_phone && <p dir="ltr">{settings.business_phone}</p>}
        {settings?.tax_number && <p>الرقم الضريبي: <span dir="ltr">{settings.tax_number}</span></p>}
      </header>

      <section className="receipt-meta">
        <div><span>فاتورة رقم</span><strong>#{invoice.id}</strong></div>
        <div><span>التاريخ</span><span>{formatDate(invoice.created_at)}</span></div>
        <div><span>الكاشير</span><span>{invoice.cashier_name}</span></div>
        {invoice.customer_name && <div><span>العميل</span><span>{invoice.customer_name}</span></div>}
      </section>

      <table className="receipt-items">
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية</th>
            {!thermal && <th>السعر</th>}
            <th>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.spare_part_name}
                {thermal && <div className="receipt-sub">{formatCurrency(item.unit_price)} × {item.quantity}</div>}
                {!thermal && <div className="receipt-sub" dir="ltr">{item.part_number}</div>}
              </td>
              <td>{item.quantity}</td>
              {!thermal && <td>{formatCurrency(item.unit_price)}</td>}
              <td>{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="receipt-totals">
        <div className="receipt-total"><span>الإجمالي</span><strong>{formatCurrency(invoice.total_amount)} {invoice.currency}</strong></div>
        {(invoice.payments || []).filter((payment) => payment.kind === 'sale').map((payment) => (
          <div key={payment.id}>
            <span>{METHOD_LABELS[payment.method] || payment.method}{payment.reference_id ? ` (${payment.reference_id})` : ''}</span>
            <span>{formatCurrency(payment.amount)}</span>
          </div>
        ))}
        {credit > 0 && <div><span>المتبقي آجلاً</span><strong>{formatCurrency(credit)}</strong></div>}
        {returned > 0 && <div><span>مرتجعات</span><span>-{formatCurrency(returned)}</span></div>}
      </section>

      <footer className="receipt-footer">
        <Barcode value={`INV-${invoice.id}`} height={28} className="receipt-barcode" />
        {settings?.receipt_footer && <p>{settings.receipt_footer}</p>}
      </footer>
    </div>
  );
}
