import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { lineDifference, parseCountInput } from './stockMath';

/** الفرق بلون: أخضر زيادة، أحمر نقص، رمادي بلا فرق. */
function DifferenceCell({ value }) {
  if (value === null) return <span className="text-surface-500">—</span>;
  if (value === 0) return <span className="text-surface-400 tabular-nums">0</span>;
  return (
    <span className={`font-bold tabular-nums ${value > 0 ? 'text-success-400' : 'text-danger-400'}`} dir="ltr">
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

/**
 * خانة العدد القابلة للتعديل. نحتفظ بمسودة فقط أثناء الكتابة؛ خارجها تُعرض
 * القيمة من الخادم مباشرة، فيظهر أثر المسح الجديد حتى لو لم يُلمس الحقل.
 */
function CountedCell({ line, busy, onCommit, onInvalid }) {
  const [draft, setDraft] = useState(null);

  const commit = () => {
    if (draft === null) return;
    const value = parseCountInput(draft);
    setDraft(null);
    if (value === null) {
      onInvalid(line);
      return;
    }
    if (value !== Number(line.counted_quantity)) onCommit(line, value);
  };

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={`counted-${line.id}`} className="sr-only">العدد المعدود لـ {line.spare_part_name}</label>
      <input
        id={`counted-${line.id}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        value={draft ?? String(line.counted_quantity)}
        onFocus={(event) => {
          setDraft(String(line.counted_quantity));
          event.target.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(null);
            // نؤجل فقدان التركيز حتى تُطبّق إعادة القيمة فلا يُحفظ ما كُتب.
            const input = event.currentTarget;
            window.setTimeout(() => input.blur(), 0);
          }
        }}
        disabled={busy}
        className="w-20 px-2 py-1.5 rounded-lg bg-surface-900 border border-white/10 text-white text-sm text-center font-bold tabular-nums focus:border-primary-500 disabled:opacity-50"
      />
      {busy && <Loader2 className="w-3.5 h-3.5 text-primary-400 animate-spin" aria-label="جارٍ الحفظ" />}
    </div>
  );
}

/**
 * أسطر الجرد مرتبة حسب الرف. في المسودة: العدد قابل للتعديل والفرق مقابل
 * الرصيد الحالي. بعد التطبيق: للقراءة فقط والفرق مقابل رصيد لحظة التطبيق.
 */
export default function CountLinesTable({
  lines, editable, applied, busyIds, highlightId, onSetQuantity, onRemove, onInvalid,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b border-white/5 text-surface-400 text-xs">
            <th scope="col" className="p-3 font-semibold">الرف</th>
            <th scope="col" className="p-3 font-semibold">القطعة</th>
            <th scope="col" className="p-3 font-semibold">الرقم</th>
            <th scope="col" className="p-3 font-semibold text-center">
              {applied ? 'رصيد النظام عند التطبيق' : 'رصيد النظام'}
            </th>
            <th scope="col" className="p-3 font-semibold text-center">المعدود</th>
            <th scope="col" className="p-3 font-semibold text-center">الفرق</th>
            {editable && <th scope="col" className="p-3"><span className="sr-only">إجراءات</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-surface-200">
          {lines.map((line) => {
            const busy = busyIds.has(line.id);
            const base = applied ? line.system_quantity : line.current_quantity;
            return (
              <tr
                key={line.id}
                className={`transition-colors duration-500 ${highlightId === line.id ? 'bg-success-500/15' : ''}`}
              >
                <td className="p-3 text-xs font-mono text-surface-300">{line.shelf_location || '—'}</td>
                <td className="p-3 font-semibold text-white">{line.spare_part_name}</td>
                <td className="p-3 text-xs font-mono text-surface-400" dir="ltr">{line.part_number}</td>
                <td className="p-3 text-center tabular-nums">{base ?? '—'}</td>
                <td className="p-3">
                  <div className="flex justify-center">
                    {editable ? (
                      <CountedCell line={line} busy={busy} onCommit={onSetQuantity} onInvalid={onInvalid} />
                    ) : (
                      <span className="font-bold text-white tabular-nums">{line.counted_quantity}</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <DifferenceCell value={lineDifference(line, { applied })} />
                </td>
                {editable && (
                  <td className="p-3 text-left">
                    <button
                      type="button"
                      onClick={() => onRemove(line)}
                      disabled={busy}
                      aria-label={`حذف ${line.spare_part_name} من الجرد`}
                      title="حذف من الجرد"
                      className="p-1.5 rounded-lg bg-danger-600/10 hover:bg-danger-600/20 text-danger-400 transition disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
