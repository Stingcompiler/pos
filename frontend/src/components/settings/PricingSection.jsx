import { useState } from 'react';
import { BadgePercent, Info, Loader2, Save } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { roundingLabel, roundingOptions, roundUpPrice } from './pricingHelpers';
import {
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  Notice,
  PRIMARY_BUTTON_CLASS,
  SectionCard,
} from './SettingsUi';

// سعر محسوب نموذجي لشرح أثر التقريب بمثال حيّ.
const ROUNDING_EXAMPLE = 12340.4;

function pickPricingFields(settings) {
  return {
    default_markup_percent: settings?.default_markup_percent ?? '25',
    price_rounding: String(settings?.price_rounding ?? 0),
    workshop_discount_percent: settings?.workshop_discount_percent ?? '0',
    wholesale_discount_percent: settings?.wholesale_discount_percent ?? '0',
  };
}

/**
 * هامش الربح الافتراضي وتقريب الأسعار وخصومات أنواع العملاء.
 * يُحفظ عبر PUT admin/settings/ بهذه الحقول فقط.
 */
export default function PricingSection({ settings, onSaved }) {
  const [form, setForm] = useState(() => pickPricingFields(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const update = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const step = Number(form.price_rounding) || 0;

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put('admin/settings/', {
        default_markup_percent: form.default_markup_percent,
        price_rounding: step,
        workshop_discount_percent: form.workshop_discount_percent,
        wholesale_discount_percent: form.wholesale_discount_percent,
      });
      setForm(pickPricingFields(data));
      onSaved?.(data);
      setMessage('تم حفظ إعدادات التسعير والخصومات.');
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر حفظ إعدادات التسعير.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      icon={BadgePercent}
      title="التسعير والخصومات"
      description="كيف يُحسب سعر البيع من تكلفة الشراء، والخصومات التلقائية لعملاء الورش والجملة."
    >
      <form onSubmit={save} className="space-y-6 max-w-2xl">
        <Notice type="success">{message}</Notice>
        <Notice>{error}</Notice>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="pricing-markup" className={LABEL_CLASS}>هامش الربح الافتراضي %</label>
            <input
              id="pricing-markup"
              type="number"
              required
              min="0"
              max="9999.99"
              step="0.01"
              dir="ltr"
              value={form.default_markup_percent}
              onChange={update('default_markup_percent')}
              aria-describedby="pricing-markup-hint"
              className={`${INPUT_CLASS} text-left font-mono`}
            />
            <p id="pricing-markup-hint" className={HINT_CLASS}>
              يُضاف إلى تكلفة القطعة عند حساب سعر البيع من سعر الصرف. يُستخدم فقط إن لم يكن للقطعة أو لفئتها هامش خاص.
            </p>
          </div>

          <div>
            <label htmlFor="pricing-rounding" className={LABEL_CLASS}>تقريب سعر البيع</label>
            <select
              id="pricing-rounding"
              value={form.price_rounding}
              onChange={update('price_rounding')}
              aria-describedby="pricing-rounding-hint"
              className={`${INPUT_CLASS} cursor-pointer`}
            >
              {roundingOptions(settings?.price_rounding).map((value) => (
                <option key={value} value={String(value)}>{roundingLabel(value)}</option>
              ))}
            </select>
            <p id="pricing-rounding-hint" className={HINT_CLASS}>
              يُرفع السعر المحسوب لأعلى (لا لأسفل) إلى أقرب مضاعف للرقم المختار، فلا تضيع كسور الجنيه ويسهل الدفع نقداً.
              {' '}مثال: {formatCurrency(ROUNDING_EXAMPLE)} ← {formatCurrency(roundUpPrice(ROUNDING_EXAMPLE, step))}
            </p>
          </div>
        </div>

        <div className="border-t border-white/5 pt-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white">خصومات أنواع العملاء</h3>
            <p className={HINT_CLASS}>
              تُطبَّق تلقائياً في نقطة البيع على كل عميل من هذا النوع، إلا إذا كان للعميل خصم خاص في ملفه فيُستخدم خصمه بدلاً منها.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="pricing-workshop" className={LABEL_CLASS}>خصم الورش %</label>
              <input
                id="pricing-workshop"
                type="number"
                required
                min="0"
                max="100"
                step="0.01"
                dir="ltr"
                value={form.workshop_discount_percent}
                onChange={update('workshop_discount_percent')}
                className={`${INPUT_CLASS} text-left font-mono`}
              />
            </div>
            <div>
              <label htmlFor="pricing-wholesale" className={LABEL_CLASS}>خصم تجار الجملة %</label>
              <input
                id="pricing-wholesale"
                type="number"
                required
                min="0"
                max="100"
                step="0.01"
                dir="ltr"
                value={form.wholesale_discount_percent}
                onChange={update('wholesale_discount_percent')}
                className={`${INPUT_CLASS} text-left font-mono`}
              />
            </div>
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs text-surface-400 bg-surface-950/40 border border-white/5 rounded-xl p-3 leading-relaxed">
          <Info className="w-4 h-4 text-primary-400 flex-shrink-0 mt-px" aria-hidden="true" />
          <span>
            تغيير الهامش أو التقريب لا يغيّر أسعار القطع الحالية مباشرة؛ راجع الأسعار الجديدة وطبّقها من تبويب «أسعار الصرف».
          </span>
        </p>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            <span>حفظ إعدادات التسعير</span>
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
