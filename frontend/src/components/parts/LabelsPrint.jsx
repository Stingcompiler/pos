import PrintArea from '../PrintArea';
import Barcode from '../Barcode';
import { isEncodable } from '../../utils/barcode';
import { formatPrice } from '../../utils/currency';
import { labelCode } from './partForm';

/**
 * ورقة ملصقات القطع للطباعة (A4، أصناف .label-sheet في index.css).
 *
 * كل قطعة تتكرر بعدد النسخ. الرمز = الباركود إن وُجد وإلا رقم القطعة،
 * فيُمسح الملصق في نقطة البيع والجرد مباشرة.
 * يُركَّب بمفتاح جديد لكل مهمة طباعة ويُزال في onDone (يجب أن تكون ثابتة).
 */
export default function LabelsPrint({ parts, copies, showPrice, onDone }) {
  const labels = [];
  parts.forEach((part) => {
    for (let copy = 0; copy < copies; copy += 1) {
      labels.push({ key: `${part.id}-${copy}`, part });
    }
  });

  return (
    <PrintArea paper="labels" onDone={onDone}>
      <div className="label-sheet">
        {labels.map(({ key, part }) => {
          const code = labelCode(part);
          return (
            <div className="label" key={key}>
              <div className="label-name">{part.name}</div>
              {isEncodable(code) ? (
                <Barcode value={code} height={40} />
              ) : (
                <div className="label-name" dir="auto">{code}</div>
              )}
              <div className="label-meta">
                <span dir="ltr">{part.part_number}</span>
                {part.shelf_location && <span>رف {part.shelf_location}</span>}
                {showPrice && <span>{formatPrice(part.selling_price)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </PrintArea>
  );
}
