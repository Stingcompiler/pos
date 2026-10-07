import { describe, it, expect } from 'vitest';
import {
  EMPTY_FORM,
  buildPartFormData,
  formFromPart,
  isPriceStale,
  labelCode,
  priceAgeDays,
  resolveMarkup,
  suggestedPrice,
  validatePartForm,
} from './partForm';

const DAY = 86400000;

const detail = {
  id: 7,
  name: 'فلتر زيت',
  part_number: '04152-YZZA1',
  category: 3,
  supplier: null,
  compatible_cars: [2, 5],
  brand: 'Toyota',
  oem_number: '04152-YZZA1',
  quality_grade: 'original',
  aliases: 'فلتر زيت هايلوكس\nفلتر مكينة',
  barcode: null,
  purchase_price: '1200.00',
  selling_price: '1800.00',
  cost_currency: 'USD',
  foreign_cost: '0.60',
  markup_percent: null,
  min_stock_alert: 3,
  shelf_location: 'A-3',
  is_featured: true,
  description: null,
  stock_quantity: 10,
};

describe('suggestedPrice', () => {
  it('التكلفة × سعر الصرف × (1 + الهامش)', () => {
    expect(suggestedPrice({ foreignCost: '2', rate: '2100.0000', markupPercent: 15 }))
      .toEqual({ value: 4830, withMarkup: true });
  });

  it('يقرّب لأعلى إلى خطوة التقريب كما يفعل الخادم', () => {
    expect(suggestedPrice({ foreignCost: '2', rate: '2100', markupPercent: 15, rounding: 100 }).value).toBe(4900);
    // قيمة على الخطوة تماماً لا تصعد بسبب أخطاء الفاصلة العائمة.
    expect(suggestedPrice({ foreignCost: '0.1', rate: '3000', markupPercent: 0, rounding: 100 }).value).toBe(300);
  });

  it('الهامش المجهول: التكلفة × سعر الصرف فقط', () => {
    expect(suggestedPrice({ foreignCost: '1.5', rate: '2000', markupPercent: null, rounding: 500 }))
      .toEqual({ value: 3000, withMarkup: false });
  });

  it('لا اقتراح بلا سعر صرف أو تكلفة', () => {
    expect(suggestedPrice({ foreignCost: '', rate: '2100' })).toBeNull();
    expect(suggestedPrice({ foreignCost: '2', rate: undefined })).toBeNull();
    expect(suggestedPrice({ foreignCost: '2', rate: '0' })).toBeNull();
  });
});

describe('resolveMarkup', () => {
  it('القطعة ثم الفئة ثم المؤسسة', () => {
    expect(resolveMarkup({ partMarkup: '10', categoryMarkup: '20', defaultMarkup: '30' })).toEqual({ value: 10, source: 'part' });
    expect(resolveMarkup({ partMarkup: '', categoryMarkup: '20.00', defaultMarkup: '30' })).toEqual({ value: 20, source: 'category' });
    expect(resolveMarkup({ partMarkup: '', categoryMarkup: null, defaultMarkup: '30' })).toEqual({ value: 30, source: 'default' });
  });

  it('هامش صفر معتبر وليس فارغاً', () => {
    expect(resolveMarkup({ partMarkup: '0', categoryMarkup: '20' })).toEqual({ value: 0, source: 'part' });
  });

  it('null إن لم يُعرف أي هامش', () => {
    expect(resolveMarkup({ partMarkup: '', categoryMarkup: undefined, defaultMarkup: undefined })).toBeNull();
  });
});

describe('formFromPart', () => {
  it('يعبّئ الفئة والسيارات وحد التنبيه والحقول الجديدة من التفاصيل', () => {
    const form = formFromPart(detail);
    expect(form.category).toBe('3');
    expect(form.supplier).toBe('');
    expect(form.compatible_cars).toEqual([2, 5]);
    expect(form.min_stock_alert).toBe('3');
    expect(form.brand).toBe('Toyota');
    expect(form.quality_grade).toBe('original');
    expect(form.aliases).toBe('فلتر زيت هايلوكس\nفلتر مكينة');
    expect(form.barcode).toBe('');
    expect(form.cost_currency).toBe('USD');
    expect(form.foreign_cost).toBe('0.60');
    expect(form.markup_percent).toBe('');
    expect(form.description).toBe('');
    expect(form.is_featured).toBe(true);
  });
});

describe('buildPartFormData', () => {
  it('التعديل بلا تغيير يعيد القيم نفسها ولا يرسل الرصيد أو سعر الشراء', () => {
    const data = buildPartFormData(formFromPart(detail), { isEdit: true });
    expect(data.get('category')).toBe('3');
    expect(data.getAll('compatible_cars')).toEqual(['2', '5']);
    expect(data.get('min_stock_alert')).toBe('3');
    expect(data.get('aliases')).toBe('فلتر زيت هايلوكس\nفلتر مكينة');
    expect(data.get('supplier')).toBe('');
    expect(data.get('foreign_cost')).toBe('0.60');
    expect(data.get('is_featured')).toBe('true');
    expect(data.has('purchase_price')).toBe(false);
    expect(data.has('opening_quantity')).toBe(false);
    expect(data.has('stock_quantity')).toBe(false);
    expect(data.has('image')).toBe(false);
  });

  it('الإنشاء يرسل opening_quantity وسعر الشراء، وليس stock_quantity أبداً', () => {
    const form = { ...EMPTY_FORM, name: 'x', part_number: 'P1', category: '1', purchase_price: '5', selling_price: '8', opening_quantity: '12' };
    const data = buildPartFormData(form, { isEdit: false });
    expect(data.get('opening_quantity')).toBe('12');
    expect(data.get('purchase_price')).toBe('5');
    expect(data.has('stock_quantity')).toBe(false);
  });

  it('الرصيد الافتتاحي الفارغ يُرسل صفراً', () => {
    const data = buildPartFormData({ ...EMPTY_FORM, opening_quantity: '' }, { isEdit: false });
    expect(data.get('opening_quantity')).toBe('0');
  });
});

describe('validatePartForm', () => {
  it('الفئة مطلوبة والتكلفة الأجنبية مطلوبة مع العملة', () => {
    expect(validatePartForm({ ...EMPTY_FORM }, { isEdit: false })).toMatch('فئة');
    expect(validatePartForm({ ...EMPTY_FORM, category: '1', cost_currency: 'USD' }, { isEdit: true })).toMatch('بالعملة');
    expect(validatePartForm({ ...EMPTY_FORM, category: '1', opening_quantity: '1.5' }, { isEdit: false })).toMatch('الرصيد');
    expect(validatePartForm({ ...EMPTY_FORM, category: '1' }, { isEdit: false })).toBe('');
  });
});

describe('isPriceStale', () => {
  const now = Date.UTC(2026, 9, 7);

  it('قطعة بعملة أجنبية لم يُراجَع سعرها منذ أكثر من 30 يوماً', () => {
    const old = new Date(now - 45 * DAY).toISOString();
    expect(priceAgeDays(old, now)).toBe(45);
    expect(isPriceStale({ cost_currency: 'USD', price_updated_at: old }, now)).toBe(true);
  });

  it('لا شارة للسعر الحديث أو لقطعة بالجنيه أو بلا تاريخ تحديث', () => {
    const recent = new Date(now - 10 * DAY).toISOString();
    const old = new Date(now - 45 * DAY).toISOString();
    expect(isPriceStale({ cost_currency: 'USD', price_updated_at: recent }, now)).toBe(false);
    expect(isPriceStale({ cost_currency: '', price_updated_at: old }, now)).toBe(false);
    expect(isPriceStale({ price_updated_at: old }, now)).toBe(false);
    expect(isPriceStale({ cost_currency: 'USD', price_updated_at: null }, now)).toBe(false);
  });
});

describe('labelCode', () => {
  it('الباركود أولاً ثم رقم القطعة', () => {
    expect(labelCode({ barcode: '6281234', part_number: 'P-1' })).toBe('6281234');
    expect(labelCode({ barcode: null, part_number: 'P-1' })).toBe('P-1');
    expect(labelCode({ barcode: '  ', part_number: 'P-1' })).toBe('P-1');
  });
});
