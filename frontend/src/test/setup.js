import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * تنظيف بعد كل اختبار حتى لا تتسرّب الحالة بين الاختبارات:
 * - DOM: يفكّ المكوّنات المُركَّبة (Testing Library لا تفعلها تلقائياً مع globals).
 * - localStorage: السلة تُحفظ فيه، فبقاؤه يُفسد اختبار «سلة فارغة».
 */
afterEach(() => {
  cleanup();
  localStorage.clear();
});
