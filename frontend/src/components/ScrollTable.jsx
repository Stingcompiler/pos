import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * حاوية جدول عريض تتمرر أفقياً، وتُظهر أن في الجدول أعمدة خارج الشاشة.
 *
 * كان الجدولان العريضان (قطع الغيار 1301px، التحويلات 920px) يتمرران على الهاتف
 * بلا أي إشارة، فلا يعرف المستخدم أن هناك أعمدة أخرى. هنا يتلاشى الجدول عند الحافة
 * التي فيها بقية الأعمدة، وتظهر عبارة «اسحب» على الهاتف ما دام في الجدول المزيد.
 *
 * relative مطلوبة: بدونها تخرج عناصر sr-only المطلقة داخل الجدول من الحاوية
 * وتوسّع الصفحة كلها (انظر tableWrappers.test.js).
 */
export default function ScrollTable({ children, className = '' }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // في RTL يكون scrollLeft سالباً (0 عند البداية على اليمين)؛ القيمة المطلقة
    // هي مقدار ما تمرّره المستخدم من البداية في الاتجاهين.
    const progress = Math.abs(el.scrollLeft);
    setEdges({ start: progress > 1, end: max > 1 && progress < max - 1 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [update]);

  // الحافة المنطقية (start/end) تتبع اتجاه الصفحة؛ التدرج يحتاج اتجاهاً فيزيائياً.
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const fade = (side) => {
    const physical = (side === 'start') === rtl ? 'right' : 'left'; // start في RTL = يمين
    return {
      position: 'absolute', top: 0, bottom: 0, [physical]: 0, width: '2rem', pointerEvents: 'none',
      background: `linear-gradient(to ${physical === 'right' ? 'left' : 'right'}, rgba(12,20,31,0.95), transparent)`,
    };
  };

  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className={`relative overflow-x-auto ${className}`}>
        {children}
      </div>
      {edges.start && <div aria-hidden="true" data-testid="fade-start" style={fade('start')} />}
      {edges.end && <div aria-hidden="true" data-testid="fade-end" style={fade('end')} />}
      {edges.end && (
        <p className="md:hidden px-4 py-2 text-center text-xs text-surface-300 border-t border-white/5">
          اسحب الجدول جانبياً لرؤية بقية الأعمدة
        </p>
      )}
    </div>
  );
}
