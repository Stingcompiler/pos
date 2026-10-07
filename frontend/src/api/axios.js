import axios from 'axios';

/**
 * عنوان الـ API يُقرأ من متغيّرات البيئة (Vite).
 *
 * الافتراضي مسار نسبي `/api/` ليعمل في التطوير (عبر بروكسي Vite) وفي
 * الإنتاج (الواجهة والـ API على نفس النطاق) دون كتابة أي نطاق داخل الكود.
 */
export const API_BASE_URL = import.meta.env?.VITE_API_URL || '/api/';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// عميل منفصل لطلبات تحديث الرمز حتى لا يمرّ عبر نفس المعترِض (تفادي حلقة لا نهائية).
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * حماية CSRF: الخادم يرفض أي طلب كتابة بكوكيز المصادقة ما لم يحمل ترويسة
 * X-CSRFToken مطابقة لكوكي csrftoken. إن غابت الكوكي (أول زيارة) نطلبها مرة
 * واحدة من auth/csrf/ قبل الطلب.
 */
const CSRF_COOKIE_NAME = 'csrftoken';
const SAFE_METHODS = ['get', 'head', 'options', 'trace'];

const csrfClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let csrfTokenFromServer = null;
let pendingCsrfRequest = null;

function readCookie(name) {
  const prefix = `${name}=`;
  const match = document.cookie.split('; ').find((row) => row.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

async function getCsrfToken() {
  const fromCookie = readCookie(CSRF_COOKIE_NAME);
  if (fromCookie) return fromCookie;
  if (csrfTokenFromServer) return csrfTokenFromServer;

  if (!pendingCsrfRequest) {
    pendingCsrfRequest = csrfClient
      .get('auth/csrf/')
      .then((response) => {
        csrfTokenFromServer = response.data?.csrfToken || null;
        return readCookie(CSRF_COOKIE_NAME) || csrfTokenFromServer;
      })
      .finally(() => {
        pendingCsrfRequest = null;
      });
  }
  return pendingCsrfRequest;
}

export async function attachCsrfToken(config) {
  const method = (config.method || 'get').toLowerCase();
  if (SAFE_METHODS.includes(method)) return config;

  const token = await getCsrfToken();
  if (token) {
    config.headers['X-CSRFToken'] = token;
  }
  return config;
}

api.interceptors.request.use(attachCsrfToken);
refreshClient.interceptors.request.use(attachCsrfToken);

let isRefreshing = false;
let failedQueue = [];

function resolveQueue(error) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  failedQueue = [];
}

const AUTH_ENDPOINTS = ['auth/login/', 'auth/refresh/', 'auth/logout/'];

/**
 * صفحات الزوار: المتجر والمنتج والصفحة الرئيسية. فحص الجلسة يفشل فيها
 * طبيعياً (لا جلسة لزائر)، فلا يجوز أن يحوّل الزائر إلى دخول الموظفين.
 */
const PUBLIC_PATHS = [/^\/$/, /^\/login\/?$/, /^\/shop(\/|$)/, /^\/inventory(\/|$)/, /^\/product\//];

export function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const requestUrl = originalRequest.url || '';

    // لا نعيد المحاولة لطلبات المصادقة نفسها.
    if (AUTH_ENDPOINTS.some((endpoint) => requestUrl.includes(endpoint))) {
      return Promise.reject(error);
    }

    if (status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // إن كان هناك تحديث جارٍ، انتظر نتيجته ثم أعد الطلب.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => api(originalRequest));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      await refreshClient.post('auth/refresh/');
      resolveQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      resolveQueue(refreshError);

      // إعادة التوجيه لتسجيل الدخول فقط للصفحات المحمية.
      if (!isPublicPath(window.location.pathname)) {
        window.location.assign('/login');
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
