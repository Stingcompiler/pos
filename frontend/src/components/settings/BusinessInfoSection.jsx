import { useState } from 'react';
import { Loader2, Receipt, Save } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { invalidateReceiptSettings } from '../../hooks/useReceiptSettings';
import {
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  Notice,
  PRIMARY_BUTTON_CLASS,
  SectionCard,
} from './SettingsUi';

const PAPER_OPTIONS = [
  { value: '80mm', label: 'إيصال حراري 80 مم', hint: 'طابعات الإيصالات الشائعة في المحلات' },
  { value: '58mm', label: 'إيصال حراري 58 مم', hint: 'الطابعات الصغيرة والمحمولة' },
  { value: 'a4', label: 'ورق A4', hint: 'فاتورة كاملة بطابعة مكتبية عادية' },
];

function pickBusinessFields(settings) {
  return {
    business_phone: settings?.business_phone || '',
    business_address: settings?.business_address || '',
    tax_number: settings?.tax_number || '',
    receipt_footer: settings?.receipt_footer || '',
    receipt_paper: settings?.receipt_paper || '80mm',
  };
}

/**
 * بيانات المحل كما تُطبع على الإيصال، ومقاس ورق الطابعة.
 * يُحفظ عبر PUT admin/settings/ بالحقول الخاصة به فقط (الخادم يقبل التحديث الجزئي).
 */
export default function BusinessInfoSection({ settings, onSaved }) {
  const [form, setForm] = useState(() => pickBusinessFields(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const update = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put('admin/settings/', form);
      setForm(pickBusinessFields(data));
      // الإيصالات تقرأ نسخة مخزّنة للجلسة؛ نفرّغها حتى يُطبع الجديد فوراً.
      invalidateReceiptSettings();
      onSaved?.(data);
      setMessage('تم حفظ بيانات المحل والإيصال.');
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر حفظ بيانات المحل.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      icon={Receipt}
      title="بيانات المحل والإيصال"
      description="تظهر هذه البيانات في رأس وتذييل كل إيصال أو فاتورة مطبوعة من نقطة البيع."
    >
      <form onSubmit={save} className="space-y-5 max-w-2xl">
        <Notice type="success">{message}</Notice>
        <Notice>{error}</Notice>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="business-phone" className={LABEL_CLASS}>هاتف المحل</label>
            <input
              id="business-phone"
              type="tel"
              dir="ltr"
              maxLength={100}
              value={form.business_phone}
              onChange={update('business_phone')}
              className={`${INPUT_CLASS} text-left font-mono`}
              placeholder="0912 345 678"
            />
          </div>
          <div>
            <label htmlFor="business-tax" className={LABEL_CLASS}>الرقم الضريبي (اختياري)</label>
            <input
              id="business-tax"
              type="text"
              dir="ltr"
              maxLength={50}
              value={form.tax_number}
              onChange={update('tax_number')}
              aria-describedby="business-tax-hint"
              className={`${INPUT_CLASS} text-left font-mono`}
            />
            <p id="business-tax-hint" className={HINT_CLASS}>
              إن أدخلته يُطبع على كل إيصال تحت اسم المحل. اتركه فارغاً إن لم يكن المحل مسجّلاً ضريبياً.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="business-address" className={LABEL_CLASS}>عنوان المحل</label>
          <input
            id="business-address"
            type="text"
            maxLength={255}
            value={form.business_address}
            onChange={update('business_address')}
            className={INPUT_CLASS}
            placeholder="مثال: الخرطوم بحري — السوق الصناعي، شارع المعونة"
          />
        </div>

        <div>
          <label htmlFor="business-footer" className={LABEL_CLASS}>تذييل الإيصال</label>
          <input
            id="business-footer"
            type="text"
            maxLength={255}
            value={form.receipt_footer}
            onChange={update('receipt_footer')}
            aria-describedby="business-footer-hint"
            className={INPUT_CLASS}
            placeholder="مثال: شكراً لتعاملكم معنا — الاستبدال خلال 3 أيام بالإيصال"
          />
          <p id="business-footer-hint" className={HINT_CLASS}>
            سطر قصير يُطبع أسفل كل إيصال (شكر، سياسة الاسترجاع، أرقام التواصل...).
          </p>
        </div>

        <fieldset>
          <legend className={LABEL_CLASS}>مقاس ورق الإيصال</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PAPER_OPTIONS.map((option) => {
              const selected = form.receipt_paper === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    selected
                      ? 'border-primary-500 bg-primary-600/10'
                      : 'border-white/10 bg-surface-950/40 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="receipt_paper"
                    value={option.value}
                    checked={selected}
                    onChange={update('receipt_paper')}
                    className="mt-1 accent-primary-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-white">{option.label}</span>
                    <span className="block text-xs text-surface-400 mt-0.5">{option.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            <span>حفظ بيانات المحل</span>
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
