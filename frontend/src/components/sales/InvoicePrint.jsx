import PrintArea from '../PrintArea';
import Receipt from '../Receipt';

/**
 * مهمة طباعة فاتورة واحدة: `job = {key, invoice, paper}`.
 *
 * المفتاح يتغيّر مع كل طلب طباعة فيُعاد تركيب PrintArea وتُفتح نافذة الطباعة
 * من جديد حتى لو طُبعت الفاتورة نفسها مرتين متتاليتين. `onDone` يجب أن يكون
 * ثابتاً (useCallback) وإلا أعاد PrintArea فتح الطباعة مع كل تصيير.
 */
export default function InvoicePrint({ job, settings, onDone }) {
  if (!job) return null;
  return (
    <PrintArea key={job.key} paper={job.paper} onDone={onDone}>
      <Receipt invoice={job.invoice} settings={settings} paper={job.paper} />
    </PrintArea>
  );
}
