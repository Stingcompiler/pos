import { formatCurrency } from '../../utils/currency';
import { centsToAmount, fromCents, parseAmountInput, toCents } from './money';

/**
 * طرق الدفع في نقطة البيع وتحويلها إلى قائمة `payments` في عقد POST invoices/.
 *
 * التحقق هنا يسبق الخادم ليعرف الكاشير المشكلة قبل الضغط (الخادم يتحقق مجدداً
 * ويبقى هو المرجع).
 */

/** حالة الدفع التي تُرسل للخادم. المبلغ المستلم وصورة الإشعار خارجها عمداً. */
export const EMPTY_PAYMENT = {
  mode: 'cash', // cash | bank | mixed | credit
  cashAmount: '', // المختلط: الجزء النقدي
  transferAmount: '', // المختلط: الجزء المحوَّل
  upfrontAmount: '', // الآجل: دفعة مقدَّمة نقداً
  bankAccount: '',
  bankName: '',
  referenceId: '',
  senderAccountNumber: '',
};

const INVALID_AMOUNT = 'أدخل مبلغاً صحيحاً (بحد أقصى خانتين عشريتين).';

const money = (cents) => formatCurrency(fromCents(cents));

/** رصيد العميل وحدّه وما بقي له من آجل؛ null بلا عميل. */
export function creditStatus(customer) {
  if (!customer) return null;
  const limitCents = toCents(customer.credit_limit);
  const balanceCents = toCents(customer.balance);
  return {
    limitCents,
    balanceCents,
    availableCents: Math.max(limitCents - balanceCents, 0),
    allowed: limitCents > 0,
  };
}

/** سبب رفض الآجل بنفس قواعد الخادم (_check_credit_limit)، أو null. */
export function creditError(customer, creditCents) {
  if (creditCents <= 0) return null;
  if (!customer) return 'البيع الآجل يتطلب اختيار العميل.';
  const credit = creditStatus(customer);
  if (!credit.allowed) {
    return `العميل «${customer.name}» غير مسموح له بالبيع الآجل (حد الائتمان صفر).`;
  }
  if (credit.balanceCents + creditCents > credit.limitCents) {
    return `الآجل ${money(creditCents)} يتجاوز المتاح للعميل (${money(credit.availableCents)}).`;
  }
  return null;
}

function bankPayment(payment, amountCents, hasBankAccounts) {
  const referenceId = payment.referenceId.trim();
  const sender = payment.senderAccountNumber.trim();
  const bankName = payment.bankName.trim();
  if (hasBankAccounts && !payment.bankAccount) return { error: 'اختر الحساب البنكي المحوَّل إليه.' };
  if (!hasBankAccounts && !bankName) return { error: 'أدخل اسم البنك.' };
  if (!referenceId) return { error: 'أدخل رقم الإشعار.' };
  if (!sender) return { error: 'أدخل رقم حساب المرسل.' };

  const spec = {
    method: 'bank',
    amount: centsToAmount(amountCents),
    reference_id: referenceId,
    sender_account_number: sender,
  };
  if (hasBankAccounts) spec.bank_account = Number(payment.bankAccount);
  else spec.bank_name = bankName;
  return { spec };
}

const cashPayment = (cents) => ({ method: 'cash', amount: centsToAmount(cents) });

/**
 * خطة الدفع: `{error, payments, paidCents, creditCents}`.
 *
 * `error` نص يمنع الإتمام (وعندها `payments` = null). الباقي غير المدفوع
 * يصبح آجلاً على العميل، فلا يُسمح به إلا لعميل له حد ائتمان يتسع له.
 */
export function buildPaymentPlan({ payment, totalCents, customer, hasBankAccounts }) {
  const fail = (error, extra = {}) => ({ error, payments: null, paidCents: 0, creditCents: 0, ...extra });
  const done = (payments, paidCents) => {
    const creditCents = totalCents - paidCents;
    const error = creditError(customer, creditCents);
    return error ? fail(error, { paidCents, creditCents }) : { error: null, payments, paidCents, creditCents };
  };

  // فاتورة بصفر (خصم 100%) لا تحتاج دفعة؛ الخادم يرفض دفعة مبلغها صفر.
  if (totalCents <= 0) return { error: null, payments: [], paidCents: 0, creditCents: 0 };

  switch (payment.mode) {
    case 'cash':
      return done([cashPayment(totalCents)], totalCents);

    case 'bank': {
      const { spec, error } = bankPayment(payment, totalCents, hasBankAccounts);
      return error ? fail(error) : done([spec], totalCents);
    }

    case 'mixed': {
      const cash = parseAmountInput(payment.cashAmount);
      const transfer = parseAmountInput(payment.transferAmount);
      if (Number.isNaN(cash) || Number.isNaN(transfer)) return fail(INVALID_AMOUNT);
      if (!cash || !transfer) {
        return fail('أدخل المبلغ النقدي والمبلغ المحوَّل، أو اختر «نقدي» أو «تحويل».');
      }
      const paid = cash + transfer;
      if (paid > totalCents) {
        return fail(`مجموع المبلغين (${money(paid)}) أكبر من الإجمالي (${money(totalCents)}).`);
      }
      if (paid < totalCents && !creditStatus(customer)?.allowed) {
        return fail(
          `مجموع المبلغين أقل من الإجمالي بـ ${money(totalCents - paid)}. `
          + 'أكمل المبلغ، أو اختر عميلاً مسموحاً له بالآجل.',
        );
      }
      const { spec, error } = bankPayment(payment, transfer, hasBankAccounts);
      return error ? fail(error) : done([cashPayment(cash), spec], paid);
    }

    case 'credit': {
      if (!customer) return fail('اختر العميل أولاً؛ البيع الآجل يُسجَّل على حسابه.');
      const upfront = parseAmountInput(payment.upfrontAmount) ?? 0;
      if (Number.isNaN(upfront)) return fail(INVALID_AMOUNT);
      if (upfront >= totalCents) {
        return fail('الدفعة المقدَّمة تغطي الإجمالي كله؛ اختر الدفع «نقدي».');
      }
      return done(upfront > 0 ? [cashPayment(upfront)] : [], upfront);
    }

    default:
      return fail('طريقة الدفع غير صالحة.');
  }
}
