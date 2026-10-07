import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, UserPlus, X } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';

const fieldClass = 'w-full px-3 py-2 rounded-xl bg-surface-800 border border-white/10 text-white text-sm '
  + 'focus:border-primary-500 h-10 placeholder-surface-500';

/**
 * إضافة عميل سريعة من نقطة البيع (متاحة للموظف أيضاً). النوع والخصم وحد
 * الائتمان يحددها المدير لاحقاً من صفحة العملاء.
 *
 * `initialText`: ما كتبه الكاشير في البحث؛ يُملأ في الهاتف إن كان أرقاماً
 * وفي الاسم إن كان نصاً، فلا يُعاد كتابته.
 */
export default function QuickAddCustomerModal({ initialText = '', onClose, onCreated }) {
  const ids = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const looksLikePhone = /^[\d+\s-]+$/.test(initialText.trim());

  // Escape يغلق النافذة كما يتوقع المستخدم.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name) => String(form.get(name) || '').trim();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('customers/', {
        name: value('name'),
        phone: value('phone'),
        location: value('location'),
        email: value('email'),
        whatsapp_number: value('whatsapp_number'),
      });
      onCreated(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر إضافة العميل. راجع الحقول ثم أعد المحاولة.'));
      setSaving(false);
    }
  };

  const fields = [
    { name: 'name', label: 'اسم العميل *', required: true, placeholder: 'الاسم الكامل', defaultValue: looksLikePhone ? '' : initialText.trim() },
    { name: 'phone', label: 'رقم الهاتف *', required: true, placeholder: 'رقم الهاتف الأساسي', dir: 'ltr', inputMode: 'tel', defaultValue: looksLikePhone ? initialText.trim() : '' },
    { name: 'location', label: 'الموقع (اختياري)', placeholder: 'العنوان أو المدينة' },
    { name: 'email', label: 'البريد الإلكتروني (اختياري)', type: 'email', placeholder: 'example@domain.com', dir: 'ltr' },
    { name: 'whatsapp_number', label: 'رقم الواتساب (اختياري)', placeholder: 'رقم الواتساب', dir: 'ltr', inputMode: 'tel' },
  ];

  // يُرسم في body: داخل لوحة السلة يحبسه سياق التراكب فتظهر القائمة الجانبية فوقه.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="w-full max-w-md max-h-full overflow-y-auto bg-surface-900 border border-white/10 rounded-2xl p-6 shadow-xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 id={`${ids}-title`} className="text-lg font-bold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary-400" />
            إضافة عميل جديد
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.name}>
              <label htmlFor={`${ids}-${field.name}`} className="block text-xs font-semibold text-surface-300 mb-1">
                {field.label}
              </label>
              <input
                id={`${ids}-${field.name}`}
                name={field.name}
                type={field.type || 'text'}
                required={field.required}
                dir={field.dir}
                inputMode={field.inputMode}
                defaultValue={field.defaultValue}
                placeholder={field.placeholder}
                autoFocus={index === 0}
                className={fieldClass}
              />
            </div>
          ))}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-white/5 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-semibold transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl gradient-primary hover:opacity-95 text-white text-sm font-semibold transition shadow-lg shadow-primary-600/20 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              حفظ العميل
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
