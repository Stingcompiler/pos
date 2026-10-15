import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// مهلة انتظار findBy/waitFor الافتراضية 1000ms: تكفي على CI، لكن اختبارات صحيحة
// كانت تفشل أحياناً على جهاز مشغول بمشاريع أخرى. النجاح لا يتأخر؛ المهلة سقف فقط.
configure({ asyncUtilTimeout: 5000 });

/**
 * تنظيف بعد كل اختبار حتى لا تتسرّب الحالة بين الاختبارات:
 * - DOM: يفكّ المكوّنات المُركَّبة (Testing Library لا تفعلها تلقائياً مع globals).
 * - localStorage: السلة تُحفظ فيه، فبقاؤه يُفسد اختبار «سلة فارغة».
 */
afterEach(() => {
  cleanup();
  localStorage.clear();
});
