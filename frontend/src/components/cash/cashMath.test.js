import { describe, expect, it } from 'vitest';
import {
  cashDifference, differenceTone, expectedCash, normalizeDigits, parseMoneyInput, toCents, transferTotals,
} from './cashMath';

describe('normalizeDigits', () => {
  it('يحوّل الأرقام العربية والفارسية إلى لاتينية', () => {
    expect(normalizeDigits('١٢٣٤٫٥')).toBe('1234٫5');
    expect(normalizeDigits('۰۹')).toBe('09');
    expect(normalizeDigits(null)).toBe('');
  });
});

describe('toCents', () => {
  it('يحوّل سلاسل DRF إلى قروش صحيحة', () => {
    expect(toCents('25.50')).toBe(2550);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('')).toBe(0);
    expect(toCents('abc')).toBe(0);
  });
});

describe('parseMoneyInput', () => {
  it('يقبل المبالغ الصحيحة بالأرقام العربية والفواصل', () => {
    expect(parseMoneyInput('1500')).toBe('1500');
    expect(parseMoneyInput(' 1,500.50 ')).toBe('1500.5');
    expect(parseMoneyInput('١٥٠٠٫٢٥')).toBe('1500.25');
    expect(parseMoneyInput('0')).toBe('0');
  });

  it('يرفض الفارغ والسالب وأكثر من خانتين عشريتين', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('-5')).toBeNull();
    expect(parseMoneyInput('1.234')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});

describe('expectedCash / cashDifference', () => {
  it('المتوقع = البداية + الوارد − المردود − المصروف دون أخطاء الفاصلة العائمة', () => {
    expect(expectedCash({ opening: '0.10', cashIn: '0.20', cashRefunds: '0', cashExpenses: '0' })).toBe(0.3);
    expect(expectedCash({ opening: '5000.00', cashIn: '12500.50', cashRefunds: '500.00', cashExpenses: '1200.25' }))
      .toBe(15800.25);
  });

  it('الفرق موجب للزيادة وسالب للعجز', () => {
    expect(cashDifference('15800.25', 15800.25)).toBe(0);
    expect(cashDifference('15700', '15800.25')).toBe(-100.25);
    expect(cashDifference('16000', '15800.25')).toBe(199.75);
  });
});

describe('differenceTone', () => {
  it('يصنّف الفرق', () => {
    expect(differenceTone(0)).toBe('balanced');
    expect(differenceTone('0.00')).toBe('balanced');
    expect(differenceTone(-0.01)).toBe('shortage');
    expect(differenceTone('25.00')).toBe('overage');
  });
});

describe('transferTotals', () => {
  it('يفصل الوارد والمطابق والمردود ويعدّ غير المطابق', () => {
    const totals = transferTotals([
      { kind: 'sale', amount: '1000.00', verified_at: '2026-10-07T10:00:00Z' },
      { kind: 'collection', amount: '500.50', verified_at: null },
      { kind: 'sale', amount: '0.20', verified_at: '2026-10-07T11:00:00Z' },
      { kind: 'refund', amount: '300.00', verified_at: null },
    ]);
    expect(totals).toEqual({
      count: 4,
      incoming: 1500.7,
      verified: 1000.2,
      refunds: 300,
      unverifiedCount: 2,
    });
  });

  it('قائمة فارغة = أصفار', () => {
    expect(transferTotals([])).toEqual({ count: 0, incoming: 0, verified: 0, refunds: 0, unverifiedCount: 0 });
  });
});
