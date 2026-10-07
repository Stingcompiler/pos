import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * `BACKEND_BASE_URL` ثابت يُحسب مرة واحدة عند أول استيراد للوحدة، لذا نعيد
 * تحميل الوحدة بعد تغيير المتغيّر لاختبار كل حالة نشر على حدة.
 */
async function loadMedia(apiUrl) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', apiUrl);
  return import('./media');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mediaUrl — أصل واحد (VITE_API_URL = /api/)', () => {
  it('يبقي المسار النسبي كما هو', async () => {
    const { mediaUrl } = await loadMedia('/api/');
    expect(mediaUrl('/media/parts/x.jpg')).toBe('/media/parts/x.jpg');
  });

  it('يضيف الشرطة المائلة إن غابت', async () => {
    const { mediaUrl } = await loadMedia('/api/');
    expect(mediaUrl('media/parts/x.jpg')).toBe('/media/parts/x.jpg');
  });
});

describe('mediaUrl — خادم منفصل (نطاق مطلق)', () => {
  it('يبني رابطاً مطلقاً من مسار نسبي', async () => {
    const { mediaUrl } = await loadMedia('https://api.example.com/api/');
    expect(mediaUrl('/media/parts/x.jpg')).toBe('https://api.example.com/media/parts/x.jpg');
  });

  it('يعمل إن غابت الشرطة المائلة الأخيرة من عنوان الـ API', async () => {
    const { mediaUrl } = await loadMedia('https://api.example.com/api');
    expect(mediaUrl('/media/parts/x.jpg')).toBe('https://api.example.com/media/parts/x.jpg');
  });
});

describe('mediaUrl — قيم تُترك كما هي', () => {
  it('لا يعدّل الروابط المطلقة', async () => {
    const { mediaUrl } = await loadMedia('https://api.example.com/api/');
    expect(mediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(mediaUrl('http://cdn.example.com/a.png')).toBe('http://cdn.example.com/a.png');
  });

  it('لا يعدّل روابط data: وblob:', async () => {
    const { mediaUrl } = await loadMedia('https://api.example.com/api/');
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    const blobUri = 'blob:http://localhost:5173/abc-123';
    expect(mediaUrl(dataUri)).toBe(dataUri);
    expect(mediaUrl(blobUri)).toBe(blobUri);
  });
});

describe('mediaUrl — القيم الفارغة', () => {
  it('يُرجع نصاً فارغاً للقيم غير المعرَّفة', async () => {
    const { mediaUrl } = await loadMedia('/api/');
    expect(mediaUrl(null)).toBe('');
    expect(mediaUrl(undefined)).toBe('');
    expect(mediaUrl('')).toBe('');
  });
});
