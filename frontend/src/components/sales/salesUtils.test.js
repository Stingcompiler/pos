import { describe, it, expect } from 'vitest';
import {
  availableCreditCents, buildCollectionPayload, buildReturnPayload, centsToAmount, clampQuantity, cleanParams,
  defaultRefundMethod, isPrivilegedRole, normalizeList, pageInfo, quantityLabel, refundableCents,
  returnTotalCents, returnableQuantity, selectedReturnItems, toCents, validateCollection, validateReturn,
  EMPTY_BANK,
} from './salesUtils';

const invoice = {
  id: 7,
  customer: 3,
  customer_name: 'ورشة النيل',
  paid_amount: '100.00',
  credit_amount: '50.00',
  items: [
    { id: 1, spare_part_name: 'فلتر زيت', quantity: 3, returned_quantity: 1, unit_price: '20.10' },
    { id: 2, spare_part_name: 'بوجي', quantity: 2, returned_quantity: 2, unit_price: '15.00' },
  ],
  returns: [
    { id: 1, refund_method: 'cash', total_amount: '20.10' },
    { id: 2, refund_method: 'account', total_amount: '30.00' },
  ],
};

describe('المال بالقروش', () => {
  it('يحوّل السلاسل العشرية إلى قروش دون أخطاء الفاصلة العائمة', () => {
    expect(toCents('20.10')).toBe(2010);
    expect(toCents('0.1') + toCents('0.2')).toBe(30);
    expect(toCents('')).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(toCents('abc')).toBe(0);
  });

  it('يعيد القروش إلى مبلغ برقمين عشريين', () => {
    expect(centsToAmount(2010)).toBe('20.10');
    expect(centsToAmount(0)).toBe('0.00');
  });
});

describe('الأدوار والقوائم', () => {
  it('المدير والمشرف فقط مميّزان', () => {
    expect(isPrivilegedRole('manager')).toBe(true);
    expect(isPrivilegedRole('supervisor')).toBe(true);
    expect(isPrivilegedRole('employee')).toBe(false);
    expect(isPrivilegedRole(undefined)).toBe(false);
  });

  it('يحذف المعاملات الفارغة ويُبقي الصفر', () => {
    expect(cleanParams({ page: 1, search: '', date_from: null, x: undefined, has_balance: 0 }))
      .toEqual({ page: 1, has_balance: 0 });
  });

  it('يحسب حدود الصفحة', () => {
    expect(pageInfo(1, 25, 0)).toEqual({ totalPages: 1, from: 0, to: 0 });
    expect(pageInfo(2, 25, 60)).toEqual({ totalPages: 3, from: 26, to: 50 });
    expect(pageInfo(3, 25, 60)).toEqual({ totalPages: 3, from: 51, to: 60 });
  });

  it('يقبل القائمة المقسّمة والمصفوفة المباشرة', () => {
    expect(normalizeList({ count: 9, results: [{ id: 1 }] })).toEqual({ count: 9, results: [{ id: 1 }] });
    expect(normalizeList([{ id: 1 }, { id: 2 }])).toEqual({ count: 2, results: [{ id: 1 }, { id: 2 }] });
  });
});

describe('المرتجع', () => {
  it('المتاح للإرجاع = المباع − المُرجَع سابقاً', () => {
    expect(returnableQuantity(invoice.items[0])).toBe(2);
    expect(returnableQuantity(invoice.items[1])).toBe(0);
  });

  it('يعرض الكمية مع المُرجَع منها', () => {
    expect(quantityLabel(invoice.items[0])).toBe('3 (أُرجع 1)');
    expect(quantityLabel({ quantity: 4, returned_quantity: 0 })).toBe('4');
  });

  it('يحصر حقل الكمية بين 0 والمتاح ويقبل الفراغ', () => {
    expect(clampQuantity('5', 2)).toBe('2');
    expect(clampQuantity('-1', 2)).toBe('0');
    expect(clampQuantity('1.7', 2)).toBe('1');
    expect(clampQuantity('', 2)).toBe('');
  });

  it('يتجاهل البنود الصفرية وما يتجاوز المتاح', () => {
    const selected = selectedReturnItems(invoice.items, { 1: '5', 2: '1' });
    expect(selected).toEqual([{ item: invoice.items[0], quantity: 2 }]);
  });

  it('إجمالي المرتجع = السعر × الكمية', () => {
    expect(returnTotalCents(invoice.items, { 1: '2' })).toBe(4020);
    expect(returnTotalCents(invoice.items, {})).toBe(0);
  });

  it('المبلغ القابل للرد نقداً لا يحسب المرتجع المخصوم من الحساب', () => {
    expect(refundableCents(invoice)).toBe(10000 - 2010);
    expect(refundableCents({ paid_amount: '10.00', returns: [{ refund_method: 'bank', total_amount: '15.00' }] })).toBe(0);
  });

  it('يقترح الخصم من الحساب للفاتورة الآجلة لعميل فقط', () => {
    expect(defaultRefundMethod(invoice)).toBe('account');
    expect(defaultRefundMethod({ ...invoice, credit_amount: '0.00' })).toBe('cash');
    expect(defaultRefundMethod({ ...invoice, customer: null })).toBe('cash');
  });

  it('يتحقق من البنود وحقول التحويل', () => {
    expect(validateReturn({ invoice, quantities: {}, refundMethod: 'cash', bank: EMPTY_BANK }))
      .toMatch('بند واحد');
    expect(validateReturn({ invoice: { ...invoice, customer: null }, quantities: { 1: '1' }, refundMethod: 'account', bank: EMPTY_BANK }))
      .toMatch('عميل');
    expect(validateReturn({ invoice, quantities: { 1: '1' }, refundMethod: 'bank', bank: EMPTY_BANK }))
      .toMatch('رقم الإشعار');
    // الرد البنكي صادر من المحل: لا يُطلب رقم حساب المرسل.
    expect(validateReturn({
      invoice, quantities: { 1: '1' }, refundMethod: 'bank', bank: { ...EMPTY_BANK, bankAccount: '2', referenceId: 'TX1' },
    })).toBe('');
  });

  it('يبني جسم الطلب كما يتوقعه الخادم', () => {
    expect(buildReturnPayload({ invoice, quantities: { 1: '2' }, refundMethod: 'cash', reason: '  تالف ', bank: EMPTY_BANK }))
      .toEqual({ items: [{ invoice_item: 1, quantity: 2 }], refund_method: 'cash', reason: 'تالف' });
    expect(buildReturnPayload({
      invoice, quantities: { 1: '1' }, refundMethod: 'bank', reason: '',
      bank: { ...EMPTY_BANK, bankAccount: '4', referenceId: ' TX-9 ' },
    })).toEqual({
      items: [{ invoice_item: 1, quantity: 1 }], refund_method: 'bank', reason: '', bank_account: 4, reference_id: 'TX-9',
    });
    expect(buildReturnPayload({
      invoice, quantities: { 1: '1' }, refundMethod: 'bank', reason: '',
      bank: { ...EMPTY_BANK, bankName: 'بنكك', referenceId: 'TX' },
    })).toMatchObject({ bank_name: 'بنكك', reference_id: 'TX' });
  });
});

describe('التحصيل والائتمان', () => {
  it('الائتمان المتاح = الحد − الرصيد ولا يقل عن صفر', () => {
    expect(availableCreditCents({ credit_limit: '500.00', balance: '120.50' })).toBe(37950);
    expect(availableCreditCents({ credit_limit: '100.00', balance: '150.00' })).toBe(0);
    expect(availableCreditCents({ credit_limit: '0.00', balance: '0.00' })).toBe(0);
  });

  it('يرفض المبلغ الصفري وما يتجاوز الرصيد', () => {
    expect(validateCollection({ method: 'cash', amount: '0', balance: '50.00', bank: EMPTY_BANK })).toMatch('أكبر من صفر');
    expect(validateCollection({ method: 'cash', amount: '50.01', balance: '50.00', bank: EMPTY_BANK })).toMatch('أكبر من الرصيد');
    expect(validateCollection({ method: 'cash', amount: '50', balance: '50.00', bank: EMPTY_BANK })).toBe('');
  });

  it('التحويل الوارد يتطلب رقم حساب المرسل', () => {
    const bank = { ...EMPTY_BANK, bankAccount: '1', referenceId: 'R1' };
    expect(validateCollection({ method: 'bank', amount: '10', balance: '50', bank })).toMatch('رقم حساب المرسل');
    expect(validateCollection({ method: 'bank', amount: '10', balance: '50', bank: { ...bank, senderAccount: '99' } })).toBe('');
  });

  it('يبني جسم طلب التحصيل', () => {
    expect(buildCollectionPayload({ method: 'cash', amount: '25.5', note: '', bank: EMPTY_BANK }))
      .toEqual({ method: 'cash', amount: '25.50' });
    expect(buildCollectionPayload({
      method: 'bank', amount: '10', note: ' دفعة أولى ',
      bank: { bankAccount: '3', bankName: '', referenceId: 'R-1', senderAccount: ' 123 ' },
    })).toEqual({
      method: 'bank', amount: '10.00', note: 'دفعة أولى', bank_account: 3, reference_id: 'R-1', sender_account_number: '123',
    });
  });
});
