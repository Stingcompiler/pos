import { describe, it, expect } from 'vitest';
import { DATE_LOCALE } from './dates';

const sources = import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.{js,jsx}'], {
  query: '?raw', import: 'default', eager: true,
});

describe('تواريخ الواجهة', () => {
  it('التقويم ميلادي صراحةً', () => {
    expect(new Intl.DateTimeFormat(DATE_LOCALE).resolvedOptions().calendar).toBe('gregory');
  });

  it('لا تنسيق تاريخ بلغة مكتوبة حرفياً (ar-SA قد يعرض الهجري)', () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => /(DateTimeFormat|new Date\([^)]*\)\.toLocale\w*)\(\s*'ar/.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
