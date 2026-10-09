import { useSearchParams } from 'react-router-dom';
import StockCountList from '../components/stock/StockCountList';
import StockCountSheet from '../components/stock/StockCountSheet';

/**
 * الجرد: قائمة عمليات الجرد، أو شاشة جرد واحد عند ?count=<id>.
 *
 * رقم الجرد في الرابط حتى يعود العامل لنفس الجرد بعد تحديث الصفحة أو انقطاع
 * الشبكة، وزر الرجوع في المتصفح يعيده للقائمة.
 */
export default function StockCounts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('count');
  const countId = raw && /^\d+$/.test(raw) ? raw : null;

  const open = (id) => setSearchParams({ count: String(id) });
  const back = () => setSearchParams({});

  return countId
    ? <StockCountSheet key={countId} countId={countId} onBack={back} />
    : <StockCountList onOpen={open} />;
}
