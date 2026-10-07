import { useCallback, useState } from 'react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api';

/**
 * فتح/طي تفاصيل الفواتير وجلبها عند الطلب (GET invoices/{id}/) مع حفظها.
 *
 * مشترك بين صفحة الفواتير وملف العميل؛ فشل الجلب يُعرض برسالة وإعادة محاولة
 * بدل مؤشر تحميل يدور للأبد.
 */
export default function useInvoiceDetails() {
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const [errors, setErrors] = useState({});

  const loadDetail = useCallback(async (id) => {
    setErrors((prev) => ({ ...prev, [id]: '' }));
    try {
      const { data } = await api.get(`invoices/${id}/`);
      setDetails((prev) => ({ ...prev, [id]: data }));
      return data;
    } catch (err) {
      setErrors((prev) => ({ ...prev, [id]: apiErrorMessage(err, 'تعذّر تحميل تفاصيل الفاتورة.') }));
      return null;
    }
  }, []);

  const toggle = useCallback((id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!details[id]) loadDetail(id);
  }, [expandedId, details, loadDetail]);

  return { expandedId, details, errors, toggle, loadDetail };
}
