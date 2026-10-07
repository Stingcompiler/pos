import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * طباعة مستند واحد معزول عن بقية الصفحة.
 *
 * الطريقة القديمة كانت تطبع الصفحة كلها (كل الفواتير المفتوحة والقائمة
 * الجانبية). هنا يُرسم المستند داخل #print-root خارج شجرة التطبيق، ويُخفى
 * كل ما عداه عند الطباعة (index.css)، ويُضبط مقاس الورق: إيصال حراري 80/58 مم
 * أو A4، أو ملصقات.
 *
 * الاستخدام: {doc && <PrintArea paper="80mm" onDone={() => setDoc(null)}>...</PrintArea>}
 */
const PAGE_RULES = {
  '80mm': '@page { size: 80mm auto; margin: 2mm; }',
  '58mm': '@page { size: 58mm auto; margin: 1mm; }',
  a4: '@page { size: A4; margin: 12mm; }',
  labels: '@page { size: A4; margin: 8mm; }',
};

export default function PrintArea({ paper = '80mm', onDone, children }) {
  // onDone في مرجع: دالة جديدة في كل رسم من الصفحة الأم لا تعيد فتح الطباعة.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = PAGE_RULES[paper] || PAGE_RULES.a4;
    document.head.appendChild(style);
    document.body.classList.add('is-printing');

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove('is-printing');
      style.remove();
      onDoneRef.current?.();
    };
    window.addEventListener('afterprint', finish);
    // احتياط للمتصفحات التي لا ترسل afterprint: انتهاء وسائط الطباعة. لا
    // نزيل المستند بمهلة ثابتة، فالطباعة على أندرويد غير متزامنة وقد تخرج فارغة.
    const printMedia = window.matchMedia?.('print');
    const onMediaChange = (event) => {
      if (!event.matches) finish();
    };
    printMedia?.addEventListener?.('change', onMediaChange);
    // مهلة قصيرة حتى تكتمل الصور (الشعار، الباركود) قبل فتح نافذة الطباعة.
    const timer = window.setTimeout(() => window.print(), 250);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      printMedia?.removeEventListener?.('change', onMediaChange);
      document.body.classList.remove('is-printing');
      style.remove();
    };
  }, [paper]);

  return createPortal(
    <div id="print-root" className={`print-paper-${paper}`} dir="rtl">
      {children}
    </div>,
    document.body,
  );
}
