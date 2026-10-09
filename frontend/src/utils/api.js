import api from '../api/axios';

/**
 * أدوات مشتركة لنداءات الـ API.
 *
 * كل صفحة كانت تصوغ رسالة الخطأ بطريقتها (بعضها يعرض "key: value" بأسماء
 * الحقول الإنجليزية، وبعضها يبتلع الخطأ فيبدو كقائمة فارغة). هنا مصدر واحد.
 */

function collectMessages(value, out) {
  if (value == null) return out;
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectMessages(item, out));
  } else if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectMessages(item, out));
  }
  return out;
}

/** رسالة عربية مفهومة من خطأ axios: انقطاع الشبكة يختلف عن رفض الخادم. */
export function apiErrorMessage(error, fallback = 'حدث خطأ غير متوقع.') {
  if (!error?.response) {
    return 'تعذّر الاتصال بالخادم. تحقّق من الشبكة ثم أعد المحاولة.';
  }
  const data = error.response.data;
  if (!data || typeof data !== 'object') return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const messages = collectMessages(data, []);
  return messages.length ? messages.join(' ') : fallback;
}

/**
 * جلب كل صفحات قائمة مقسّمة (للقوائم المرجعية: الفئات، الموديلات، الموردين).
 *
 * نطلب الصفحات برقمها بدل اتباع رابط `next` المطلق: خلف بروكسي التطوير يشير
 * ذلك الرابط إلى منفذ الخادم مباشرة فيصبح طلباً من أصل آخر.
 */
export async function fetchAllPages(path, params = {}, { pageSize = 200, maxPages = 50 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const { data } = await api.get(path, { params: { ...params, page, page_size: pageSize } });
    if (Array.isArray(data)) return data;
    all.push(...(data.results || []));
    if (!data.next) break;
  }
  return all;
}

/**
 * حفظ ملف ثنائي (Excel مثلاً) أعاده الخادم.
 *
 * عند الفشل يصل ردّ الخطأ نفسه كملف (blob)؛ نحوّله إلى JSON قبل رمي الخطأ حتى
 * تقرأ apiErrorMessage رسالة الخادم بدل الرسالة العامة.
 */
export async function downloadFile(path, filename, params = {}) {
  let response;
  try {
    response = await api.get(path, { params, responseType: 'blob' });
  } catch (error) {
    const body = error?.response?.data;
    if (body instanceof Blob) {
      try {
        error.response.data = JSON.parse(await body.text());
      } catch {
        // ليس JSON: تبقى الرسالة العامة.
      }
    }
    throw error;
  }
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** تاريخ اليوم المحلي بصيغة YYYY-MM-DD (لا UTC). */
export function localDateString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
