import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Send, ShoppingBag, X } from 'lucide-react';
import api from '../../api/axios';
import { useCart } from '../../context/useCart';
import { apiErrorMessage } from '../../utils/api';
import { formatPrice } from '../../utils/currency';

// ألوان الصفحة الرئيسية (هوية المحل) وصفحة المتجر؛ أسماء الأصناف مكتوبة كاملة
// حتى يلتقطها Tailwind.
const THEMES = {
  brand: {
    badge: 'bg-dal-sky/10 border-dal-sky/20 text-dal-sky',
    input: 'focus:border-dal-sky focus:ring-dal-sky',
    total: 'text-dal-red',
    submit: 'bg-dal-red hover:bg-red-700',
  },
  default: {
    badge: 'bg-primary-100 border-primary-200 text-primary-600',
    input: 'focus:border-primary-500 focus:ring-primary-500',
    total: 'text-danger-600',
    submit: 'bg-danger-600 hover:bg-danger-700',
  },
};

const EMPTY_FORM = { customer_name: '', phone_number: '', email: '', location: '' };

/**
 * نافذة إتمام طلب المتجر (مشتركة بين الصفحة الرئيسية وصفحة المتجر).
 *
 * الخادم يقبل الطلب دائماً ويعيد stock_warnings للبنود التي تتجاوز المتوفر؛
 * كانت الصفحتان تتجاهلانها وتعلنان النجاح، فيفاجأ العميل لاحقاً باتصال المحل.
 */
export default function CheckoutModal({ onClose, onOrdered, theme = 'default' }) {
  const colors = THEMES[theme] || THEMES.default;
  const { cart, cartTotal, clearCart } = useCart();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const closeTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const finish = () => {
    onOrdered?.();
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.customer_name.trim() || !form.phone_number.trim()) {
      setError('الرجاء تعبئة الاسم ورقم الهاتف لإكمال الطلب.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await api.post('public-orders/', {
        customer_name: form.customer_name,
        phone_number: form.phone_number,
        email: form.email || null,
        location: form.location || null,
        items: cart.map((item) => ({ spare_part: item.part.id, quantity: item.quantity })),
      });
      const stockWarnings = response.data.stock_warnings || [];
      setWarnings(stockWarnings);
      setSuccess(true);
      clearCart();
      setForm(EMPTY_FORM);
      // عند نقص الكمية تبقى الرسالة حتى يقرأها العميل ويغلقها بنفسه.
      if (!stockWarnings.length) {
        closeTimer.current = window.setTimeout(finish, 3000);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'فشل إرسال الطلب، يرجى المحاولة مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-slate-800 text-xs focus:ring-1 outline-none h-10 transition-colors ${colors.input}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" dir="rtl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-800 relative animate-scale-in max-h-[92vh] overflow-y-auto"
      >
        <button onClick={success ? finish : onClose} aria-label="إغلاق" className="absolute top-4 left-4 text-gray-400 hover:text-slate-800 cursor-pointer">
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className={`w-12 h-12 rounded-full border flex items-center justify-center mx-auto ${colors.badge}`}>
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h3 id="checkout-title" className="text-base font-bold text-slate-800">إتمام طلب الشراء</h3>
          <p className="text-[11px] text-gray-500">الرجاء إدخال معلوماتك لتأكيد حجز قطع الغيار وتسهيل التواصل معك.</p>
        </div>

        {success ? (
          <div className="p-6 text-center space-y-3 bg-green-50 border border-green-150 rounded-2xl animate-fade-in text-green-700">
            <CheckCircle className="w-12 h-12 mx-auto animate-bounce text-green-500" />
            <h4 className="text-sm font-bold">تم إرسال طلبك بنجاح!</h4>
            <p className="text-xs">شكراً لك، تم استلام طلبك وسيتم إشعار الإدارة فوراً والتواصل معك قريباً.</p>
            {warnings.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-right space-y-1.5">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  بعض الكميات غير متوفرة كاملة حالياً — سيتواصل معك المحل لتأكيد التوفر قبل التجهيز:
                </p>
                <ul className="text-[11px] space-y-0.5">
                  {warnings.map((warning) => (
                    <li key={warning.part}>
                      {warning.part}: طلبت {warning.requested}، المتوفر {warning.available}
                    </li>
                  ))}
                </ul>
                <button onClick={finish} className="w-full mt-2 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold cursor-pointer">
                  حسناً
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="checkout-name" className="block text-xs font-semibold text-gray-600 mb-1.5">الاسم الكامل *</label>
              <input id="checkout-name" type="text" required value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className={inputClass} placeholder="اسمك الكامل" />
            </div>
            <div>
              <label htmlFor="checkout-phone" className="block text-xs font-semibold text-gray-600 mb-1.5">رقم الهاتف الجوال *</label>
              <input id="checkout-phone" type="tel" required value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                className={inputClass} placeholder="رقم الهاتف للتواصل أو الواتساب" dir="ltr" />
            </div>
            <div>
              <label htmlFor="checkout-email" className="block text-xs font-semibold text-gray-600 mb-1.5">البريد الإلكتروني (اختياري)</label>
              <input id="checkout-email" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass} placeholder="name@example.com" dir="ltr" />
            </div>
            <div>
              <label htmlFor="checkout-location" className="block text-xs font-semibold text-gray-600 mb-1.5">العنوان / المنطقة *</label>
              <input id="checkout-location" type="text" required value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className={inputClass} placeholder="مثال: الخرطوم، بحري، بورتسودان..." />
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-3 border-t border-gray-100 pt-3">
                <span>المجموع النهائي:</span>
                <span className={`text-sm font-black font-mono ${colors.total}`}>{formatPrice(cartTotal)}</span>
              </div>
              <button
                type="submit"
                disabled={loading || cart.length === 0}
                className={`w-full py-3 rounded-xl hover:shadow-lg text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer leading-normal disabled:opacity-50 ${colors.submit}`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري معالجة الطلب...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>إرسال وتأكيد الطلب الآن</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
