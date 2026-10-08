import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { cleanParams, normalizeList } from '../components/sales/salesUtils';

/**
 * قائمة مقسّمة من الخادم (DRF PageNumberPagination): صفحة واحدة في كل طلب.
 *
 * كانت صفحات الطلبات والرسائل والموردين وغيرها تقرأ `results` من الصفحة
 * الأولى فقط، فيختفي كل ما بعد أول 50 سجلاً دون أي إشارة. تغيير المعاملات
 * (بحث، تصفية) يعيد إلى الصفحة الأولى، وصفحة فرغت بعد حذف آخر سجلاتها ترجع
 * إلى السابقة بدل خطأ «صفحة غير موجودة».
 *
 * `setItems` لتعديل سجل محلياً بعد تحديثه دون إعادة الجلب.
 */
export default function usePagedList(path, { pageSize = 25, params = {} } = {}) {
  const paramsKey = JSON.stringify(cleanParams(params));
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ items: [], count: 0, loading: true, error: null });
  const seq = useRef(0);
  const [lastKey, setLastKey] = useState(paramsKey);

  // بحث أو تصفية جديدة: من الصفحة الأولى (تعديل الحالة أثناء التصيير، قبل أي جلب).
  if (lastKey !== paramsKey) {
    setLastKey(paramsKey);
    setPage(1);
  }

  const load = useCallback(async () => {
    const current = ++seq.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.get(path, {
        params: { ...JSON.parse(paramsKey), page, page_size: pageSize },
      });
      if (current !== seq.current) return;
      const { count, results } = normalizeList(data);
      setState({ items: results, count, loading: false, error: null });
    } catch (error) {
      if (current !== seq.current) return;
      if (error.response?.status === 404 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
        return;
      }
      setState((prev) => ({ ...prev, loading: false, error }));
    }
  }, [path, paramsKey, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const setItems = useCallback((update) => {
    setState((prev) => ({ ...prev, items: typeof update === 'function' ? update(prev.items) : update }));
  }, []);

  return { ...state, page, setPage, pageSize, reload: load, setItems };
}
