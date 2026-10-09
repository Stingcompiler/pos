import { describe, it, expect } from 'vitest';
import {
  CURRENCY_SUFFIX,
  DEFAULT_LOCALE,
  formatCurrency,
  formatPrice,
} from './currency';

/**
 * القيم المتوقّعة هنا **مقيسة فعلياً** من Intl على هذه البيئة، لا مفترضة:
 *   ar-SA 1234.5 → "١٬٢٣٤٫٥٠"
 *   ar-SA 25     → "٢٥٫٠٠"
 *   ar-SA 10.005 → "١٠٫٠١"
 * أي أن ar-SA يستخدم الأرقام الهندية-العربية (٢٥) والفاصلة العشرية العربية (٫).
 */

describe('formatCurrency', () => {
  it('يُنسّق برقمين عشريين بالضبط بالعربية', () => {
    expect(formatCurrency(25)).toBe('٢٥٫٠٠');
  });

  it('لغته الافتراضية عربية لا لاتينية', () => {
    expect(DEFAULT_LOCALE).toBe('ar-SA');
    expect(formatCurrency(25)).not.toBe(formatCurrency(25, { locale: 'en-US' }));
  });

  it('يقرّب إلى رقمين عشريين ولا يعرض أكثر منهما', () => {
    // هذا كان خللاً فعلياً: صفحة قطع الغيار ضبطت minimumFractionDigits وحدها،
    // وعندها يجعل Intl الحدّ الأقصى 3 فتظهر أسعار بثلاث خانات عشرية.
    expect(formatCurrency(10.005, { locale: 'en-US' })).toBe('10.01');
    expect(formatCurrency(10.999, { locale: 'en-US' })).toBe('11.00');
    expect(formatCurrency(10.005)).toBe('١٠٫٠١');
  });

  it('يُثبّت الخانتين حتى على الأعداد الصحيحة', () => {
    expect(formatCurrency(7, { locale: 'en-US' })).toBe('7.00');
    expect(formatCurrency(7)).toBe('٧٫٠٠');
  });

  it('يقبل الأسعار النصّية القادمة من الـ API', () => {
    // DRF يُرجع الحقول العشرية كسلاسل نصّية لا أرقاماً.
    expect(formatCurrency('25.50', { locale: 'en-US' })).toBe('25.50');
    expect(formatCurrency('0.5', { locale: 'en-US' })).toBe('0.50');
  });

  it('يعالج القيم الفارغة وغير الرقمية بصفر', () => {
    expect(formatCurrency(null, { locale: 'en-US' })).toBe('0.00');
    expect(formatCurrency(undefined, { locale: 'en-US' })).toBe('0.00');
    expect(formatCurrency('', { locale: 'en-US' })).toBe('0.00');
    expect(formatCurrency('abc', { locale: 'en-US' })).toBe('0.00');
  });

  it('لا يُظهر NaN في أي مدخل', () => {
    for (const value of [null, undefined, '', 'abc', NaN, Infinity, -Infinity]) {
      expect(formatCurrency(value)).not.toMatch(/NaN/);
    }
  });
});

describe('formatPrice', () => {
  it('يضيف لاحقة العملة', () => {
    expect(formatPrice(25, { locale: 'en-US' })).toBe(`25.00${CURRENCY_SUFFIX}`);
  });

  it('يبقي رقمين عشريين بعد إضافة اللاحقة', () => {
    expect(formatPrice(10.005, { locale: 'en-US' })).toBe(`10.01${CURRENCY_SUFFIX}`);
  });

  it('اللاحقة هي «ج.س» بالشكل المعروض للعميل', () => {
    expect(CURRENCY_SUFFIX).toBe(' ج.س');
  });
});
