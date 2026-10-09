import { describe, it, expect } from 'vitest';
import {
  centsToAmount, discountedUnitCents, parseAmountInput, percentToBasisPoints, priceCart, toCents,
} from './money';

describe('toCents / centsToAmount', () => {
  it('يحوّل مبالغ الـ API النصية إلى قروش صحيحة دون أخطاء الكسور', () => {
    expect(toCents('25.00')).toBe(2500);
    expect(toCents('0.29')).toBe(29); // 0.29 × 100 = 28.999… في الكسور العشرية
    expect(toCents(null)).toBe(0);
    expect(toCents('abc')).toBe(0);
  });

  it('يصوغ المبلغ بخانتين كما يقبله الخادم', () => {
    expect(centsToAmount(150050)).toBe('1500.50');
    expect(centsToAmount(5)).toBe('0.05');
    expect(centsToAmount(0)).toBe('0.00');
  });
});

describe('parseAmountInput', () => {
  it('يقبل الأرقام الهندية والفاصلة العشرية العربية', () => {
    expect(parseAmountInput('١٥٠٠٫٥')).toBe(150050);
    expect(parseAmountInput('1,500')).toBe(150000);
    expect(parseAmountInput(' 20 ')).toBe(2000);
  });

  it('الفارغ null وغير الصالح NaN (ومنه أكثر من خانتين عشريتين)', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('12.345')).toBeNaN();
    expect(parseAmountInput('-5')).toBeNaN();
    expect(parseAmountInput('abc')).toBeNaN();
  });
});

describe('discountedUnitCents — مطابقة services._discounted في الخادم', () => {
  it('بلا خصم يبقى السعر كما هو', () => {
    expect(discountedUnitCents(2500, 0)).toBe(2500);
  });

  it('يطبّق النسبة ويقرّب لقرشين', () => {
    expect(discountedUnitCents(2500, percentToBasisPoints('10.00'))).toBe(2250);
    // 33.33 × 0.925 = 30.83025 → 30.83
    expect(discountedUnitCents(3333, percentToBasisPoints('7.5'))).toBe(3083);
  });

  it('يقرّب النصف إلى الزوجي كما يفعل Decimal (ROUND_HALF_EVEN)', () => {
    // 0.05 × 50% = 0.025 → 0.02 (لا 0.03)
    expect(discountedUnitCents(5, 5000)).toBe(2);
    // 0.15 × 50% = 0.075 → 0.08
    expect(discountedUnitCents(15, 5000)).toBe(8);
  });

  it('النسبة محصورة بين 0 و100%', () => {
    expect(percentToBasisPoints('150')).toBe(10000);
    expect(percentToBasisPoints(null)).toBe(0);
  });
});

describe('priceCart', () => {
  it('يحسب الإجمالي من سعر الوحدة بعد الخصم × الكمية كما يفعل الخادم', () => {
    const cart = [
      { id: 1, selling_price: '33.33', quantity: 3 },
      { id: 2, selling_price: '10.00', quantity: 1 },
    ];
    const result = priceCart(cart, '7.50');
    expect(result.lines[1]).toEqual({ originalUnitCents: 3333, unitCents: 3083, lineCents: 9249 });
    expect(result.subtotalCents).toBe(10999);
    expect(result.totalCents).toBe(9249 + 925);
    expect(result.discountCents).toBe(10999 - 10174);
  });
});
