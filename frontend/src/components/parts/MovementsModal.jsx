import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';
import PartsModal from './PartsModal';
import { formatDateTime } from './partForm';
import { ERROR_BOX } from './styles';

/**
 * سجل حركات مخزون القطعة (بيع، توريد، مرتجع، تسوية، جرد...) — لكل الأدوار.
 * يجيب عن «أين ذهبت الكمية؟» دون الرجوع إلى الفواتير واحدة واحدة.
 */
export default function MovementsModal({ part, onClose }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`spare-parts/${part.id}/movements/`);
      setMovements(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(apiErrorMessage(err, 'تعذّر تحميل سجل الحركات.'));
    } finally {
      setLoading(false);
    }
  }, [part.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PartsModal title={`سجل حركات: ${part.name}`} onClose={onClose} maxWidth="max-w-3xl">
      <p className="text-xs text-surface-400 mb-4">
        رقم القطعة: <span className="font-mono" dir="ltr">{part.part_number}</span>
        {' — '}الرصيد الحالي: <span className="font-mono font-bold text-white">{part.stock_quantity}</span>
        {' — '}تُعرض آخر 100 حركة، الأحدث أولاً.
      </p>

      {loading ? (
        <div className="py-12 text-center" role="status" aria-label="جارٍ التحميل">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className={`${ERROR_BOX} flex items-center justify-between gap-3`} role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger-500/15 hover:bg-danger-500/25 text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      ) : movements.length === 0 ? (
        <p className="py-10 text-center text-surface-500 text-sm">لا توجد حركات مسجّلة لهذه القطعة.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-surface-400">
                <th scope="col" className="px-3 py-2.5 text-right font-medium">التاريخ</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">السبب</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">التغيير</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">الرصيد بعدها</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">المرجع</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">المستخدم</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((move) => (
                <tr key={move.id} className="border-b border-white/3">
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">{formatDateTime(move.created_at)}</td>
                  <td className="px-3 py-2 text-surface-200">{move.reason_display || move.reason}</td>
                  <td className="px-3 py-2">
                    <span
                      dir="ltr"
                      className={`font-mono font-bold ${move.change > 0 ? 'text-success-400' : move.change < 0 ? 'text-danger-400' : 'text-surface-400'}`}
                    >
                      {move.change > 0 ? `+${move.change}` : move.change}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-white">{move.quantity_after}</td>
                  <td className="px-3 py-2 text-surface-400 break-words max-w-[220px]">{move.reference || '-'}</td>
                  <td className="px-3 py-2 text-surface-400">{move.created_by_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PartsModal>
  );
}
