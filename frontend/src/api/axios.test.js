import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * نستبدل محوّل الشبكة في axios قبل تحميل الوحدة، لأن العملاء (api وعميل
 * رمز CSRF) يُنشَؤون عند الاستيراد ويأخذون المحوّل حينها.
 */
let requests;
let axiosLib;
let originalAdapter;

async function loadApi() {
  vi.resetModules();
  axiosLib = (await import('axios')).default;
  originalAdapter = axiosLib.defaults.adapter;
  axiosLib.defaults.adapter = async (config) => {
    requests.push(config);
    const data = config.url === 'auth/csrf/' ? { csrfToken: 'server-token' } : {};
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  return (await import('./axios')).default;
}

function clearCsrfCookie() {
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

beforeEach(() => {
  requests = [];
  clearCsrfCookie();
});

afterEach(() => {
  axiosLib.defaults.adapter = originalAdapter;
  clearCsrfCookie();
});

describe('حماية CSRF في عميل الـ API', () => {
  it('يرسل رمز كوكي csrftoken مع طلبات الكتابة', async () => {
    const api = await loadApi();
    document.cookie = 'csrftoken=cookie-token; path=/';

    await api.post('invoices/', {});

    expect(requests).toHaveLength(1);
    expect(requests[0].headers['X-CSRFToken']).toBe('cookie-token');
  });

  it('لا يضيف الرمز لطلبات القراءة', async () => {
    const api = await loadApi();
    document.cookie = 'csrftoken=cookie-token; path=/';

    await api.get('spare-parts/');

    expect(requests[0].headers['X-CSRFToken']).toBeUndefined();
  });

  it('يطلب الرمز من الخادم مرة واحدة إن غابت الكوكي', async () => {
    const api = await loadApi();

    await Promise.all([api.post('invoices/', {}), api.delete('customers/1/')]);

    const csrfCalls = requests.filter((config) => config.url === 'auth/csrf/');
    const writes = requests.filter((config) => config.url !== 'auth/csrf/');
    expect(csrfCalls).toHaveLength(1);
    expect(writes.map((config) => config.headers['X-CSRFToken'])).toEqual([
      'server-token',
      'server-token',
    ]);
  });
});

describe('صفحات الزوار لا تحوّل إلى دخول الموظفين', () => {
  it('يميّز صفحات المتجر العامة عن صفحات النظام', async () => {
    const { isPublicPath } = await import('./axios');
    for (const path of ['/', '/store', '/shop', '/shop/', '/inventory', '/product/12', '/login']) {
      expect(isPublicPath(path), path).toBe(true);
    }
    for (const path of ['/pos', '/dashboard', '/invoices', '/shopping-admin', '/products', '/stores']) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});
