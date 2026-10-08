import api from '../api/axios';

/**
 * إعدادات المتجر العامة (الهوية، الفئات، الموديلات، وسائل التواصل) بطلب واحد
 * مشترك: الصفحة الرئيسية وصفحة المتجر وصفحة الدخول كانت تطلبها كلٌّ على حدة
 * وبالتتابع، فتتراكم أزمنة الشبكة على الجوال. تُعاد الصلاحية بعد دقيقة.
 */
const TTL_MS = 60_000;
let cached = null;

export function getPublicSettings() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const promise = api.get('public/settings/').then(({ data }) => data);
    cached = { at: Date.now(), promise };
    promise.catch(() => { if (cached?.promise === promise) cached = null; });
  }
  return cached.promise;
}

/** للاختبارات: كل اختبار يبدأ بلا نسخة محفوظة. */
export function clearPublicSettingsCache() {
  cached = null;
}
