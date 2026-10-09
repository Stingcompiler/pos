import { useState } from 'react';
import { Loader2, Scale } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import PartsModal from './PartsModal';
import { BTN_PRIMARY, BTN_SECONDARY, ERROR_BOX, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from './styles';

/**
 * تسوية الرصيد: إدخال الكمية المعدودة فعلياً مع السبب.
 *
 * الخادم يسجّل حركة «تسوية يدوية» بالفرق، فيبقى أثر في سجل الحركات بدل
 * الكتابة فوق الرقم بصمت. نعرض النتيجة كما أعادها الخادم لا كما أُدخلت.
 */
export default function StockAdjustModal({ part, onClose, onAdjusted }) {
  const [quantity, setQuantity] = useState(String(part.stock_quantity ?? 0));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current = Number(part.stock_quantity ?? 0);
  const counted = quantity === '' ? null : Number(quantity);
  const valid = counted !== null && Number.isInteger(counted) && counted >= 0;
  const difference = valid ? counted - current : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) {
      setError('أدخل الكمية المعدودة كعدد صحيح لا يقل عن صفر.');
      return;
    }
    if (difference === 0) {
      setError('الكمية المعدودة تساوي الرصيد الحالي؛ لا حاجة للتسوية.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`spare-parts/${part.id}/adjust-stock/`, {
        stock_quantity: counted,
        reason: reason.trim(),
      });
      onAdjusted(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّرت تسوية الرصيد.'));
      setSaving(false);
    }
  };

  return (
    <PartsModal title="تسوية الرصيد" onClose={onClose} maxWidth="max-w-md" layer="z-[60]" busy={saving}>
      <p className="text-xs text-surface-400 mb-4 leading-relaxed">
        <span className="text-white font-semibold">{part.name}</span>
        {' — '}الرصيد الحالي في النظام:{' '}
        <span className="font-mono font-bold text-white">{current}</span>
      </p>

      {error && <div className={`${ERROR_BOX} mb-4`} role="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="adjust-stock-quantity" className={LABEL_CLASS}>الكمية المعدودة فعلياً *</label>
          <input
            id="adjust-stock-quantity"
            type="number"
            min="0"
            step="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={INPUT_CLASS}
            dir="ltr"
          />
          {valid && difference !== 0 && (
            <p className={`mt-1 text-xs font-semibold ${difference > 0 ? 'text-success-400' : 'text-danger-400'}`}>
              الفرق: <span dir="ltr" className="font-mono">{difference > 0 ? `+${difference}` : difference}</span>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="adjust-stock-reason" className={LABEL_CLASS}>السبب *</label>
          <input
            id="adjust-stock-reason"
            type="text"
            required
            maxLength={80}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: جرد الرف A-3، قطعة تالفة..."
            className={INPUT_CLASS}
          />
          <p className={HINT_CLASS}>يظهر السبب في سجل حركات القطعة للمراجعة لاحقاً.</p>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className={BTN_SECONDARY}>
            إلغاء
          </button>
          <button type="submit" disabled={saving || !valid || difference === 0} className={BTN_PRIMARY}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
            تسوية
          </button>
        </div>
      </form>
    </PartsModal>
  );
}
