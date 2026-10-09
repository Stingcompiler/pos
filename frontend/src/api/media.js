import { API_BASE_URL } from './axios';

/**
 * العنوان الأساسي للخادم بدون لاحقة `/api/` — يُستخدم لبناء روابط ملفات
 * الميديا (الصور) القادمة من الباك إند.
 */
export const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * تحويل قيمة صورة قادمة من الـ API إلى رابط قابل للعرض.
 *
 * يتعامل مع:
 * - الروابط المطلقة (http/https).
 * - روابط البيانات (data:) و blob:.
 * - المسارات النسبية القادمة من الخادم (مثل /media/parts/x.jpg).
 */
export function mediaUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${BACKEND_BASE_URL}${path}`;
}
