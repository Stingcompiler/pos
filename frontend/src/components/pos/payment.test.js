import { describe, it, expect } from 'vitest';
import { EMPTY_PAYMENT, buildPaymentPlan, creditStatus } from './payment';

const bankDetails = { bankAccount: '3', referenceId: ' TRX-77 ', senderAccountNumber: '123456' };
const creditCustomer = { id: 9, name: 'ورشة النور', credit_limit: '1000.00', balance: '200.00' };
const noCreditCustomer = { id: 10, name: 'أحمد', credit_limit: '0.00', balance: '0.00' };

const plan = (payment, { totalCents = 50000, customer = null, hasBankAccounts = true } = {}) =>
  buildPaymentPlan({ payment: { ...EMPTY_PAYMENT, ...payment }, totalCents, customer, hasBankAccounts });

describe('buildPaymentPlan', () => {
  it('النقدي يرسل الإجمالي كاملاً بغض النظر عن المبلغ المستلم', () => {
    expect(plan({ mode: 'cash' })).toEqual({
      error: null,
      payments: [{ method: 'cash', amount: '500.00' }],
      paidCents: 50000,
      creditCents: 0,
    });
  });

  it('التحويل يتطلب الحساب ورقم الإشعار وحساب المرسل', () => {
    expect(plan({ mode: 'bank' }).error).toMatch('الحساب البنكي');
    expect(plan({ mode: 'bank', bankAccount: '3' }).error).toMatch('رقم الإشعار');
    expect(plan({ mode: 'bank', bankAccount: '3', referenceId: 'X' }).error).toMatch('حساب المرسل');

    const result = plan({ mode: 'bank', ...bankDetails });
    expect(result.error).toBeNull();
    expect(result.payments).toEqual([{
      method: 'bank', amount: '500.00', bank_account: 3, reference_id: 'TRX-77', sender_account_number: '123456',
    }]);
  });

  it('بلا حسابات بنكية مسجّلة يُرسل اسم البنك نصاً', () => {
    const result = plan(
      { mode: 'bank', bankName: 'بنك الخرطوم', referenceId: 'R1', senderAccountNumber: 'S1' },
      { hasBankAccounts: false },
    );
    expect(result.payments[0]).toMatchObject({ bank_name: 'بنك الخرطوم' });
    expect(result.payments[0]).not.toHaveProperty('bank_account');
    expect(plan({ mode: 'bank', referenceId: 'R1', senderAccountNumber: 'S1' }, { hasBankAccounts: false }).error)
      .toMatch('اسم البنك');
  });

  describe('المختلط', () => {
    it('مبلغان يساويان الإجمالي → دفعتان نقد + تحويل', () => {
      const result = plan({ mode: 'mixed', cashAmount: '200', transferAmount: '300', ...bankDetails });
      expect(result.error).toBeNull();
      expect(result.payments.map((item) => [item.method, item.amount])).toEqual([
        ['cash', '200.00'], ['bank', '300.00'],
      ]);
      expect(result.creditCents).toBe(0);
    });

    it('يرفض المجموع الأكبر من الإجمالي', () => {
      expect(plan({ mode: 'mixed', cashAmount: '300', transferAmount: '300', ...bankDetails }).error)
        .toMatch('أكبر من الإجمالي');
    });

    it('المجموع الأقل يُقبل فقط لعميل له آجل يتسع للباقي', () => {
      const partial = { mode: 'mixed', cashAmount: '100', transferAmount: '100', ...bankDetails };
      expect(plan(partial).error).toMatch('أقل من الإجمالي');
      expect(plan(partial, { customer: noCreditCustomer }).error).toMatch('أقل من الإجمالي');

      const result = plan(partial, { customer: creditCustomer });
      expect(result.error).toBeNull();
      expect(result.creditCents).toBe(30000);
    });

    it('يتطلب المبلغين معاً ومبالغ صالحة', () => {
      expect(plan({ mode: 'mixed', cashAmount: '500', ...bankDetails }).error).toMatch('المبلغ النقدي والمبلغ المحوَّل');
      expect(plan({ mode: 'mixed', cashAmount: '1.234', transferAmount: '1', ...bankDetails }).error)
        .toMatch('مبلغاً صحيحاً');
    });
  });

  describe('الآجل', () => {
    it('يتطلب عميلاً', () => {
      expect(plan({ mode: 'credit' }).error).toMatch('اختر العميل');
    });

    it('آجل كامل = قائمة دفعات فارغة', () => {
      expect(plan({ mode: 'credit' }, { customer: creditCustomer })).toEqual({
        error: null, payments: [], paidCents: 0, creditCents: 50000,
      });
    });

    it('الدفعة المقدَّمة تُرسل نقداً والباقي آجل', () => {
      const result = plan({ mode: 'credit', upfrontAmount: '150' }, { customer: creditCustomer });
      expect(result.payments).toEqual([{ method: 'cash', amount: '150.00' }]);
      expect(result.creditCents).toBe(35000);
    });

    it('يمنع عميلاً حده صفر، وتجاوز الحد', () => {
      expect(plan({ mode: 'credit' }, { customer: noCreditCustomer }).error).toMatch('غير مسموح له');
      // الرصيد 200 + آجل 900 > الحد 1000
      expect(plan({ mode: 'credit' }, { totalCents: 90000, customer: creditCustomer }).error).toMatch('يتجاوز');
      // الرصيد 200 + آجل 800 = الحد بالضبط → مسموح
      expect(plan({ mode: 'credit' }, { totalCents: 80000, customer: creditCustomer }).error).toBeNull();
    });

    it('دفعة مقدَّمة تغطي الإجمالي ليست آجلاً', () => {
      expect(plan({ mode: 'credit', upfrontAmount: '500' }, { customer: creditCustomer }).error).toMatch('نقدي');
    });
  });

  it('فاتورة بصفر لا ترسل دفعات (الخادم يرفض دفعة بمبلغ صفر)', () => {
    expect(plan({ mode: 'cash' }, { totalCents: 0 }).payments).toEqual([]);
  });
});

describe('creditStatus', () => {
  it('يحسب المتاح من الحد والرصيد', () => {
    expect(creditStatus(creditCustomer)).toEqual({
      limitCents: 100000, balanceCents: 20000, availableCents: 80000, allowed: true,
    });
    expect(creditStatus(null)).toBeNull();
  });
});
