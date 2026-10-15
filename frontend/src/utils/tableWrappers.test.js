import { describe, it, expect } from 'vitest';

const sources = import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.{js,jsx}'], {
  query: '?raw', import: 'default', eager: true,
});

describe('حاويات الجداول القابلة للتمرير', () => {
  it('كلها relative، وإلا خرجت عناصر sr-only المطلقة من الجدول ووسّعت الصفحة كلها', () => {
    // عنصر absolute (مثل sr-only) لا يقصّه overflow حاويته ما لم تكن الحاوية نفسها
    // موضِعاً (position)؛ فيبقى خلف الجدول العريض ويجعل الصفحة قابلة للسحب جانبياً.
    const offenders = [];
    for (const [path, code] of Object.entries(sources)) {
      for (const match of code.matchAll(/className=(?:"|\{`)([^"`]*\boverflow-x-auto\b[^"`]*)/g)) {
        if (match[1].includes('scrollbar-none')) continue; // شريط أفقي لا جدول
        if (!/\brelative\b/.test(match[1])) offenders.push(`${path}: ${match[1].trim().slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
