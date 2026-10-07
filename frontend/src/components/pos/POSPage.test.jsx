import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import api from '../../api/axios';
import POS from '../../pages/POS';

vi.mock('../../api/axios', () => ({
  API_BASE_URL: '/api/',
  default: { get: vi.fn(), post: vi.fn() },
}));

const PART = {
  id: 7, name: 'فلتر زيت', part_number: 'OF-100', selling_price: '25.00', stock_quantity: 5,
  brand: 'Toyota', quality_grade: 'original', quality_grade_display: 'أصلي',
};
const WORKSHOP = {
  id: 3, name: 'ورشة النور', phone: '0912345678', customer_type: 'workshop',
  customer_type_display: 'ورشة', effective_discount_percent: '10.00', credit_limit: '0.00', balance: '0.00',
};
const INVOICE = {
  id: 42, total_amount: '25.00', paid_amount: '25.00', credit_amount: '0.00',
  payment_method: 'cash', payment_method_display: 'نقدي', items: [], payments: [],
};

const notFound = () => Promise.reject({ response: { status: 404, data: { detail: 'لا توجد قطعة بهذا الرمز.' } } });

function mockApi({ searchFails = false } = {}) {
  api.get.mockImplementation((url, config = {}) => {
    switch (url) {
      case 'receipt-settings/':
        return Promise.resolve({ data: { site_name: 'المحل', receipt_paper: '80mm' } });
      case 'bank-accounts/':
        return Promise.resolve({ data: { results: [], next: null } });
      case 'customers/':
        return Promise.resolve({ data: { results: [WORKSHOP] } });
      case 'spare-parts/lookup/':
        return config.params.code === 'OF-100' ? Promise.resolve({ data: PART }) : notFound();
      case 'spare-parts/search-pos/':
        return searchFails
          ? Promise.reject({ response: { status: 500, data: { detail: 'انقطع الاتصال بقاعدة البيانات.' } } })
          : Promise.resolve({ data: [] });
      default:
        return Promise.reject(new Error(`unexpected GET ${url}`));
    }
  });
}

const searchBox = () => screen.getByLabelText('ابحث عن قطعة أو امسح الباركود');

async function scan(code) {
  fireEvent.change(searchBox(), { target: { value: code } });
  fireEvent.keyDown(searchBox(), { key: 'Enter' });
}

describe('صفحة نقطة البيع', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('الباركود + Enter يضيف القطعة مباشرة، والبيع يُرسل بلا سعر وحدة وبمفتاح Idempotency', async () => {
    api.post.mockResolvedValue({ status: 201, data: INVOICE });
    render(<POS />);

    await scan('OF-100');
    expect(await screen.findByRole('heading', { name: 'فلتر زيت' })).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: /إتمام البيع/ }));
    expect(await screen.findByText(/فاتورة رقم #42/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /طباعة الإيصال/ })).toBeInTheDocument();

    const [url, payload, config] = api.post.mock.calls[0];
    expect(url).toBe('invoices/');
    expect(payload).toEqual({
      items: [{ spare_part: 7, quantity: 1 }],
      customer: null,
      payments: [{ method: 'cash', amount: '25.00' }],
    });
    expect(config.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('فشل البحث يظهر كخطأ لا كـ«لا توجد نتائج»', async () => {
    mockApi({ searchFails: true });
    render(<POS />);

    fireEvent.change(searchBox(), { target: { value: 'فلتر' } });
    expect(await screen.findByText('انقطع الاتصال بقاعدة البيانات.')).toBeInTheDocument();
    expect(screen.queryByText(/لا توجد قطع متوفرة/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument();
  });

  it('التحويل: صورة الإشعار تُرفع بعد الفاتورة، وفشلها تحذير لا يلغي البيع', async () => {
    const bankInvoice = {
      ...INVOICE, payment_method: 'bank', payment_method_display: 'تحويل بنكي',
      payments: [{ id: 5, kind: 'sale', method: 'bank', amount: '25.00' }],
    };
    api.post.mockImplementation((url) => (url === 'invoices/'
      ? Promise.resolve({ status: 201, data: bankInvoice })
      : Promise.reject({ response: { status: 400, data: { detail: 'الملف المرفوع ليس صورة صالحة.' } } })));
    render(<POS />);

    await scan('OF-100');
    await screen.findByRole('heading', { name: 'فلتر زيت' });
    fireEvent.click(screen.getByRole('button', { name: 'تحويل' }));
    // لا حسابات بنكية مسجّلة → اسم البنك نصاً.
    fireEvent.change(screen.getByLabelText('اسم البنك *'), { target: { value: 'بنك الخرطوم' } });
    fireEvent.change(screen.getByLabelText('رقم الإشعار *'), { target: { value: 'TRX-1' } });
    fireEvent.change(screen.getByLabelText('رقم حساب المرسل *'), { target: { value: '998877' } });
    const file = new File(['x'], 'proof.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/إرفاق صورة الإشعار/), { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /إتمام البيع/ }));
    expect(await screen.findByText(/فاتورة رقم #42/)).toBeInTheDocument();
    expect(await screen.findByText(/تعذّر رفع صورة الإشعار/)).toBeInTheDocument();

    expect(api.post.mock.calls[0][1].payments).toEqual([{
      method: 'bank', amount: '25.00', bank_name: 'بنك الخرطوم', reference_id: 'TRX-1', sender_account_number: '998877',
    }]);
    const [proofUrl, form] = api.post.mock.calls[1];
    expect(proofUrl).toBe('payments/5/proof/');
    expect(form.get('proof_image')).toBe(file);
  });

  it('فشل إضافة عميل سريعة يظهر داخل النافذة لا في alert', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { phone: ['هذا الرقم مسجّل لعميل آخر.'] } } });
    render(<POS />);

    fireEvent.click(screen.getByRole('button', { name: 'إضافة عميل جديد' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('اسم العميل *'), { target: { value: 'سامي' } });
    fireEvent.change(within(dialog).getByLabelText('رقم الهاتف *'), { target: { value: '0911111111' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ العميل/ }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('هذا الرقم مسجّل لعميل آخر.');
  });

  it('خصم العميل يظهر في السلة، والآجل يُمنع لعميل حده صفر', async () => {
    render(<POS />);

    fireEvent.focus(screen.getByLabelText('العميل'));
    fireEvent.click(await screen.findByRole('button', { name: /ورشة النور/ }));
    await scan('OF-100');
    await screen.findByRole('heading', { name: 'فلتر زيت' });

    // 25.00 بخصم 10% = 22.50، كما يحسبه الخادم.
    const totals = screen.getByText('الإجمالي').closest('dl');
    expect(within(totals).getByText(/خصم العميل/)).toBeInTheDocument();
    expect(within(totals).getByText('٢٢٫٥٠')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'آجل' }));
    expect(screen.getByText(/غير مسموح له بالبيع الآجل/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إتمام البيع/ })).toBeDisabled();
  });
});
