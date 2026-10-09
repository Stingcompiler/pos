/**
 * أدوات صافية (بلا React ولا شبكة) لشاشات المبيعات والعملاء.
 *
 * فُصلت هنا لتُختبر وحدها: حساب مبلغ المرتجع وحدود التحصيل يجب أن يطابق ما
 * يفعله الخادم، وأي خطأ تقريب في الواجهة يظهر للكاشير كرفض غير مفهوم.
 */

import { DATE_LOCALE } from '../../utils/dates';

export const PRIVILEGED_ROLES = ['manager', 'supervisor'];

export function isPrivilegedRole(role) {
  return PRIVILEGED_ROLES.includes(role);
}

/** طرق دفع الفاتورة كما يعيدها الخادم (Invoice.PaymentMethod). */
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'bank', label: 'تحويل' },
  { value: 'mixed', label: 'مختلط' },
  { value: 'credit', label: 'آجل' },
];

// لون لكل طريقة حتى يميّزها الكاشير بنظرة دون قراءة النص.
export const PAYMENT_METHOD_STYLES = {
  cash: 'bg-success-600/15 text-success-400 border-success-500/25',
  bank: 'bg-primary-600/20 text-primary-300 border-primary-500/25',
  mixed: 'bg-warning-500/15 text-warning-400 border-warning-500/25',
  credit: 'bg-danger-600/15 text-danger-400 border-danger-500/25',
};

export const CUSTOMER_TYPE_OPTIONS = [
  { value: 'retail', label: 'مستهلك' },
  { value: 'workshop', label: 'ورشة' },
  { value: 'wholesale', label: 'تاجر جملة' },
];

export const CUSTOMER_TYPE_STYLES = {
  retail: 'bg-surface-800 text-surface-300 border-white/10',
  workshop: 'bg-primary-600/15 text-primary-300 border-primary-500/25',
  wholesale: 'bg-warning-500/15 text-warning-400 border-warning-500/25',
};

export const REFUND_METHOD_LABELS = {
  cash: 'نقدي',
  bank: 'تحويل بنكي',
  account: 'خصم من حساب العميل',
};

// ─── المال بالقروش ──────────────────────────────────────────────────────────
// الخادم يعيد المبالغ كسلاسل عشرية ("25.50"). الجمع بالأعداد العشرية يعطي
// 0.1 + 0.2 = 0.30000000000000004، فنحسب بالقروش (أعداد صحيحة) ثم نعرض.

export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/** قروش → سلسلة "123.45" (لحقول الإدخال ولما يُرسل للخادم). */
export function centsToAmount(cents) {
  return (Math.round(cents) / 100).toFixed(2);
}

/** حذف القيم الفارغة من معاملات الاستعلام حتى لا تُرسل `?search=` بلا قيمة. */
export function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  );
}

/** حدود الصفحة الحالية لعرض "21–40 من 95". */
export function pageInfo(page, pageSize, count) {
  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));
  if (!count) return { totalPages, from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  return { totalPages, from, to };
}

/** القائمة المقسّمة أو المصفوفة المباشرة (احتياطاً لنقاط بلا تقسيم). */
export function normalizeList(data) {
  if (Array.isArray(data)) return { count: data.length, results: data };
  return { count: data?.count ?? 0, results: data?.results ?? [] };
}

// ─── الفاتورة والمرتجع ───────────────────────────────────────────────────────

export function returnableQuantity(item) {
  return Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0));
}

export function hasReturnableItems(invoice) {
  return (invoice?.items || []).some((item) => returnableQuantity(item) > 0);
}

/** "2 (أُرجع 1)" — الكمية المباعة مع ما أُرجع منها. */
export function quantityLabel(item) {
  const returned = Number(item.returned_quantity || 0);
  return returned > 0 ? `${item.quantity} (أُرجع ${returned})` : String(item.quantity);
}

/**
 * قيمة حقل الكمية بعد الحصر بين 0 والمتاح. الحقل الفارغ يبقى فارغاً حتى
 * يستطيع المستخدم مسحه وكتابة رقم جديد.
 */
export function clampQuantity(raw, max) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed)) return '';
  return String(Math.min(Math.max(parsed, 0), max));
}

/** بنود المرتجع الفعلية (الكمية > 0 وضمن المتاح). */
export function selectedReturnItems(items, quantities) {
  return (items || [])
    .map((item) => ({ item, quantity: Math.min(Number(quantities[item.id] || 0), returnableQuantity(item)) }))
    .filter(({ quantity }) => quantity > 0);
}

/** إجمالي المرتجع = سعر البيع المسجّل × الكمية، كما يحسبه الخادم. */
export function returnTotalCents(items, quantities) {
  return selectedReturnItems(items, quantities).reduce(
    (sum, { item, quantity }) => sum + toCents(item.unit_price) * quantity,
    0,
  );
}

/** ما يمكن ردّه نقداً/تحويلاً: المدفوع ناقص ما رُدّ سابقاً بغير الخصم من الحساب. */
export function refundableCents(invoice) {
  const refunded = (invoice?.returns || [])
    .filter((ret) => ret.refund_method !== 'account')
    .reduce((sum, ret) => sum + toCents(ret.total_amount), 0);
  return Math.max(0, toCents(invoice?.paid_amount) - refunded);
}

export function returnedTotalCents(invoice) {
  return (invoice?.returns || []).reduce((sum, ret) => sum + toCents(ret.total_amount), 0);
}

/** الفاتورة الآجلة لعميل: الأنسب خصم المرتجع من دينه بدل إخراج نقد من الدرج. */
export function defaultRefundMethod(invoice) {
  return invoice?.customer && toCents(invoice.credit_amount) > 0 ? 'account' : 'cash';
}

/** حالة حقول التحويل الفارغة (BankTransferFields). */
export const EMPTY_BANK = { bankAccount: '', bankName: '', referenceId: '', senderAccount: '' };

/**
 * التحقق من بيانات تحويل بنكي قبل الإرسال (نفس شروط الخادم _prepare_transfer):
 * اسم البنك (من الحساب المختار أو مكتوباً) ورقم الإشعار، ورقم حساب المرسل
 * للتحويلات الواردة فقط.
 */
export function bankFieldsError({ bankAccount, bankName, referenceId, senderAccount }, { requireSender }) {
  const missing = [];
  if (!bankAccount && !String(bankName || '').trim()) missing.push('الحساب البنكي');
  if (!String(referenceId || '').trim()) missing.push('رقم الإشعار');
  if (requireSender && !String(senderAccount || '').trim()) missing.push('رقم حساب المرسل');
  return missing.length ? `أكمل حقول التحويل: ${missing.join('، ')}.` : '';
}

function bankPayload({ bankAccount, bankName, referenceId }) {
  const payload = { reference_id: String(referenceId || '').trim() };
  if (bankAccount) payload.bank_account = Number(bankAccount);
  else payload.bank_name = String(bankName || '').trim();
  return payload;
}

export function validateReturn({ invoice, quantities, refundMethod, bank }) {
  if (selectedReturnItems(invoice?.items, quantities).length === 0) {
    return 'حدّد كمية بند واحد على الأقل للإرجاع.';
  }
  if (refundMethod === 'account' && !invoice?.customer) {
    return 'الخصم من الحساب يتطلب فاتورة باسم عميل.';
  }
  if (refundMethod === 'bank') {
    return bankFieldsError(bank, { requireSender: false });
  }
  return '';
}

/** جسم طلب POST invoices/{id}/returns/ */
export function buildReturnPayload({ invoice, quantities, refundMethod, reason, bank }) {
  const payload = {
    items: selectedReturnItems(invoice.items, quantities).map(({ item, quantity }) => ({
      invoice_item: item.id,
      quantity,
    })),
    refund_method: refundMethod,
    reason: String(reason || '').trim(),
  };
  if (refundMethod === 'bank') Object.assign(payload, bankPayload(bank));
  return payload;
}

// ─── العميل والتحصيل ─────────────────────────────────────────────────────────

/** الائتمان المتاح = الحد − الرصيد (لا يقل عن صفر). الحد 0 = لا بيع آجل. */
export function availableCreditCents(customer) {
  return Math.max(0, toCents(customer?.credit_limit) - toCents(customer?.balance));
}

export function validateCollection({ method, amount, balance, bank }) {
  const cents = toCents(amount);
  if (cents <= 0) return 'أدخل مبلغاً أكبر من صفر.';
  if (cents > toCents(balance)) return 'المبلغ أكبر من الرصيد المستحق على العميل.';
  if (method === 'bank') return bankFieldsError(bank, { requireSender: true });
  return '';
}

/** جسم طلب POST customers/{id}/payments/ */
export function buildCollectionPayload({ method, amount, note, bank }) {
  const payload = { method, amount: centsToAmount(toCents(amount)) };
  if (String(note || '').trim()) payload.note = String(note).trim();
  if (method === 'bank') {
    Object.assign(payload, bankPayload(bank), {
      sender_account_number: String(bank.senderAccount || '').trim(),
    });
  }
  return payload;
}

// ─── التواريخ ───────────────────────────────────────────────────────────────

export function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(DATE_LOCALE, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(value));
}

// ─── بيع طلب المتجر ─────────────────────────────────────────────────────────

/**
 * دفعات بيع طلب المتجر: كامل المبلغ نقداً أو تحويلاً، أو بلا دفعات (آجل على
 * العميل ضمن حده). الخادم يحسب الإجمالي من أسعار الطلب.
 */
export function buildOrderSalePayload({ method, total, bank }) {
  if (method === 'credit') return { payments: [] };
  const payment = { method, amount: centsToAmount(toCents(total)) };
  if (method === 'bank') {
    Object.assign(payment, bankPayload(bank), {
      sender_account_number: String(bank.senderAccount || '').trim(),
    });
  }
  return { payments: [payment] };
}
