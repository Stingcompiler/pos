import { useState } from 'react';
import { Printer } from 'lucide-react';
import { isEncodable } from '../../utils/barcode';
import PartsModal from './PartsModal';
import { labelCode } from './partForm';
import { BTN_PRIMARY, BTN_SECONDARY, CHECKBOX_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from './styles';

const MAX_COPIES = 100;

/** خيارات طباعة ملصقات القطع المحددة: عدد النسخ لكل قطعة وإظهار السعر. */
export default function LabelsDialog({ parts, onClose, onPrint }) {
  const [copies, setCopies] = useState('1');
  const [showPrice, setShowPrice] = useState(true);

  const copiesNumber = Number(copies);
  const validCopies = Number.isInteger(copiesNumber) && copiesNumber >= 1 && copiesNumber <= MAX_COPIES;
  // الباركود يرمّز الحروف اللاتينية والأرقام فقط؛ رمز عربي يُطبع نصاً.
  const textOnly = parts.filter((part) => !isEncodable(labelCode(part))).length;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validCopies) return;
    onPrint({ copies: copiesNumber, showPrice });
  };

  return (
    <PartsModal title="طباعة ملصقات" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-surface-400">
          القطع المحددة: <span className="font-bold text-white">{parts.length}</span>
          {validCopies && (
            <>
              {' — '}إجمالي الملصقات: <span className="font-bold text-white">{parts.length * copiesNumber}</span>
            </>
          )}
        </p>

        <div>
          <label htmlFor="labels-copies" className={LABEL_CLASS}>عدد النسخ لكل قطعة</label>
          <input
            id="labels-copies"
            type="number"
            min="1"
            max={MAX_COPIES}
            step="1"
            required
            value={copies}
            onChange={(e) => setCopies(e.target.value)}
            className={INPUT_CLASS}
            dir="ltr"
          />
          <p className={HINT_CLASS}>الورق: A4 بشبكة 3 أعمدة (ملصق 63.5×25.4 مم تقريباً).</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="labels-show-price"
            type="checkbox"
            checked={showPrice}
            onChange={(e) => setShowPrice(e.target.checked)}
            className={CHECKBOX_CLASS}
          />
          <label htmlFor="labels-show-price" className="text-xs font-semibold text-surface-200 cursor-pointer">
            إظهار سعر البيع على الملصق
          </label>
        </div>

        {textOnly > 0 && (
          <p className="text-[11px] text-warning-400 leading-relaxed">
            {textOnly} قطعة رمزها يحتوي حروفاً لا يرمّزها الباركود (مثل العربية) — سيُطبع رمزها نصاً فقط.
            أضف لها باركوداً لاتينياً لتُقرأ بالماسح.
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>إلغاء</button>
          <button type="submit" disabled={!validCopies || parts.length === 0} className={BTN_PRIMARY}>
            <Printer className="w-4 h-4" />
            طباعة
          </button>
        </div>
      </form>
    </PartsModal>
  );
}
