import { describe, it, expect } from 'vitest';
import {
  buildSupplyDealPayload,
  currencyLabel,
  foreignToBase,
  formatRate,
  parseAmount,
  priceChange,
  roundingLabel,
  roundingOptions,
  roundUpPrice,
} from './pricingHelpers';

describe('parseAmount', () => {
  it('يميّز الفارغ عن الصفر', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('0')).toBe(0);
  });

  it('يقرأ قيم DRF النصية ويرفض غير الرقمي', () => {
    expect(parseAmount('2100.0000')).toBe(2100);
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('roundUpPrice', () => {
  it('يقرّب لأعلى إلى مضاعف الخطوة كما يفعل الخادم', () => {
    expect(roundUpPrice(1201, 50)).toBe(1250);
    expect(roundUpPrice(1250, 50)).toBe(1250);
    expect(roundUpPrice(1234.2, 1)).toBe(1235);
  });

  it('لا ترفع الفاصلة العائمة المضاعف الصحيح إلى التالي', () => {
    expect(roundUpPrice(1000, 5)).toBe(1000);
    expect(roundUpPrice(0.3 * 3, 0.9)).toBeCloseTo(0.9);
  });

  it('بلا خطوة: رقمان عشريان', () => {
    expect(roundUpPrice(10.555, 0)).toBeCloseTo(10.56);
    expect(roundUpPrice('', 5)).toBeNull();
  });
});

describe('roundingOptions', () => {
  it('يحافظ على قيمة حالية خارج القائمة', () => {
    expect(roundingOptions(25)).toEqual([0, 1, 5, 10, 25, 50, 100]);
    expect(roundingOptions(10)).toEqual([0, 1, 5, 10, 50, 100]);
    expect(roundingOptions(null)).toEqual([0, 1, 5, 10, 50, 100]);
  });

  it('يصف الخطوة بالعربية', () => {
    expect(roundingLabel(0)).toBe('بلا تقريب');
    expect(roundingLabel(50)).toBe('لأقرب 50 جنيه');
  });
});

describe('foreignToBase', () => {
  it('يضرب التكلفة الأجنبية في سعر الصرف ويقرّب لقرشين', () => {
    expect(foreignToBase('12.5', '2100')).toBe(26250);
    expect(foreignToBase('1.234', '3')).toBe(3.7);
  });

  it('يعيد null إن نقص سعر الصرف أو كان غير موجب', () => {
    expect(foreignToBase('10', '')).toBeNull();
    expect(foreignToBase('10', '0')).toBeNull();
    expect(foreignToBase('', '2100')).toBeNull();
  });
});

describe('priceChange', () => {
  it('يحدد الاتجاه والنسبة', () => {
    expect(priceChange('100.00', '125.00')).toEqual({ diff: 25, percent: 25, direction: 'up' });
    expect(priceChange('200', '150')).toMatchObject({ diff: -50, direction: 'down' });
    expect(priceChange('0', '10')).toMatchObject({ percent: null, direction: 'up' });
  });
});

describe('currencyLabel / formatRate', () => {
  it('يعرض اسم العملة ورمزها، والرمز وحده لغير المعروف', () => {
    expect(currencyLabel('USD')).toBe('دولار أمريكي (USD)');
    expect(currencyLabel('')).toBe('جنيه سوداني (SDG)');
    expect(currencyLabel('XYZ')).toBe('XYZ');
  });

  it('يعرض سعر الصرف حتى أربع خانات', () => {
    expect(formatRate('2100.1250', { locale: 'en-US' })).toBe('2,100.125');
    expect(formatRate('2100.0000', { locale: 'en-US' })).toBe('2,100.00');
    expect(formatRate(null)).toBe('—');
  });
});

describe('buildSupplyDealPayload', () => {
  const base = { supplier: '3', sparePart: '7', quantity: '10', invoiceReference: '  ' };

  it('الشراء بالجنيه يرسل purchase_price فقط', () => {
    expect(buildSupplyDealPayload({ ...base, currency: '', purchasePrice: ' 4500 ' })).toEqual({
      supplier: 3,
      spare_part: 7,
      quantity_added: 10,
      invoice_reference: null,
      purchase_price: '4500',
    });
  });

  it('الشراء بعملة أجنبية لا يرسل purchase_price، ويُغفل سعر الصرف الفارغ', () => {
    const payload = buildSupplyDealPayload({
      ...base, currency: 'USD', foreignUnitCost: '12.5', exchangeRate: '', invoiceReference: 'INV-1',
    });
    expect(payload).toEqual({
      supplier: 3,
      spare_part: 7,
      quantity_added: 10,
      invoice_reference: 'INV-1',
      currency: 'USD',
      foreign_unit_cost: '12.5',
    });
  });

  it('يرسل سعر الصرف المُدخل يدوياً', () => {
    const payload = buildSupplyDealPayload({
      ...base, currency: 'AED', foreignUnitCost: '40', exchangeRate: '570.5',
    });
    expect(payload.exchange_rate).toBe('570.5');
    expect(payload).not.toHaveProperty('purchase_price');
  });

  it('العملة الأساسية تُعامل كشراء بالجنيه', () => {
    const payload = buildSupplyDealPayload({ ...base, currency: 'SDG', purchasePrice: '100' });
    expect(payload).not.toHaveProperty('currency');
    expect(payload.purchase_price).toBe('100');
  });
});
