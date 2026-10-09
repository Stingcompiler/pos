import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../../api/axios';
import Invoices from '../../pages/Invoices';
import Customers from '../../pages/Customers';
import CustomerDetail from '../../pages/CustomerDetail';

/**
 * اختبارات تصيير للصفحات الثلاث بخادم وهمي: تلتقط أخطاء وقت التشغيل
 * (حقول خاطئة، شروط الأدوار) دون تشغيل الخادم أو المتصفح.
 */

const auth = { user: { role: 'manager' } };
vi.mock('../../context/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../hooks/useReceiptSettings', () => ({
  default: () => ({ site_name: 'متجر الاختبار', receipt_paper: '80mm' }),
}));
vi.mock('../../api/axios', () => ({
  API_BASE_URL: '/api/',
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const customer = {
  id: 3, name: 'ورشة النيل', phone: '0912345678', whatsapp_number: '', location: '', email: '',
  customer_type: 'workshop', customer_type_display: 'ورشة', discount_percent: null,
  effective_discount_percent: '5.00', credit_limit: '500.00', balance: '120.00',
};

const invoiceRow = {
  id: 5, cashier_name: 'ali', customer: 3, customer_name: 'ورشة النيل', created_at: '2026-10-01T10:00:00Z',
  total_amount: '170.00', paid_amount: '50.00', credit_amount: '120.00', items_count: 1,
  payment_method: 'credit', payment_method_display: 'آجل', currency: 'SDG',
};

const invoiceDetail = {
  ...invoiceRow,
  items: [{
    id: 9, spare_part: 1, spare_part_name: 'فلتر زيت', part_number: 'OF-1', quantity: 3, returned_quantity: 1,
    unit_price: '56.67', subtotal: '170.00', cost_price: '40.00', profit: '50.00',
  }],
  payments: [{
    id: 1, kind: 'sale', kind_display: 'دفعة بيع', method: 'bank', method_display: 'تحويل بنكي', amount: '50.00',
    bank_account_name: 'بنكك', bank_name: 'بنكك', reference_id: 'TX-77', sender_account_number: '123',
    proof_image: '/media/proofs/p.jpg', verified_at: '2026-10-01T11:00:00Z', verified_by_name: 'boss',
    created_by_name: 'ali', created_at: '2026-10-01T10:00:00Z',
  }],
  returns: [{
    id: 2, refund_method: 'account', refund_method_display: 'خصم من حساب العميل', total_amount: '56.67',
    reason: 'تالف', items: [{ id: 1, invoice_item: 9, spare_part_name: 'فلتر زيت', quantity: 1, unit_price: '56.67', subtotal: '56.67' }],
    created_by_name: 'boss', created_at: '2026-10-02T10:00:00Z',
  }],
};

const statement = {
  customer,
  entries: [
    { date: '2026-10-01T10:00:00Z', type: 'invoice', reference: 'فاتورة #5', invoice: 5, debit: '176.67', credit: '0', balance: '176.67' },
    { date: '2026-10-02T10:00:00Z', type: 'return', reference: 'مرتجع #2 من فاتورة #5', invoice: 5, debit: '0', credit: '56.67', balance: '120.00' },
  ],
};

function mockServer() {
  api.get.mockImplementation((url) => {
    const routes = {
      'invoices/': { count: 1, next: null, results: [invoiceRow] },
      'invoices/5/': invoiceDetail,
      'customers/': { count: 1, next: null, results: [customer] },
      'customers/3/': customer,
      'customers/3/statement/': statement,
      'bank-accounts/': { count: 0, next: null, results: [] },
    };
    if (url in routes) return Promise.resolve({ data: routes[url] });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderAt(path, element, routePath = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={routePath} element={element} /></Routes>
    </MemoryRouter>,
  );
}

describe('صفحة الفواتير', () => {
  beforeEach(() => {
    auth.user = { role: 'manager' };
    vi.clearAllMocks();
    mockServer();
    window.print = vi.fn();
  });

  it('تعرض الصف بشارته وتفاصيله الموسّعة وتطبع عبر PrintArea', async () => {
    renderAt('/invoices', <Invoices />);
    const row = await screen.findByRole('button', { name: /فاتورة #5/ });
    expect(within(row).getByText('آجل')).toBeInTheDocument();
    expect(within(row).getByText(/آجل: /)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('invoices/', { params: { page: 1, page_size: 25 } });

    fireEvent.click(row);
    expect(await screen.findByText('3 (أُرجع 1)')).toBeInTheDocument();
    expect(screen.getByText(/تم التحقق/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /صورة الإشعار/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('السبب:', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'الربح' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مرتجع' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /طباعة الإيصال/ }));
    const printRoot = document.getElementById('print-root');
    expect(printRoot).not.toBeNull();
    expect(printRoot).toHaveTextContent('متجر الاختبار');
    expect(printRoot).toHaveClass('print-paper-80mm');
  });

  it('يرسل فلتر طريقة الدفع للخادم ويعيد الصفحة للأولى', async () => {
    renderAt('/invoices', <Invoices />);
    await screen.findByRole('button', { name: /فاتورة #5/ });
    fireEvent.click(screen.getByRole('button', { name: 'مختلط' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('invoices/', {
      params: { page: 1, page_size: 25, payment_method: 'mixed' },
    }));
  });

  it('تعرض الخطأ مع إعادة المحاولة', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'عطل في الخادم' } } });
    renderAt('/invoices', <Invoices />);
    expect(await screen.findByRole('alert')).toHaveTextContent('عطل في الخادم');
    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(await screen.findByRole('button', { name: /فاتورة #5/ })).toBeInTheDocument();
  });

  it('الموظف لا يرى زر المرتجع', async () => {
    auth.user = { role: 'employee' };
    renderAt('/invoices', <Invoices />);
    fireEvent.click(await screen.findByRole('button', { name: /فاتورة #5/ }));
    await screen.findByText('3 (أُرجع 1)');
    expect(screen.queryByRole('button', { name: 'مرتجع' })).not.toBeInTheDocument();
  });
});

describe('صفحة العملاء', () => {
  beforeEach(() => {
    auth.user = { role: 'manager' };
    vi.clearAllMocks();
    mockServer();
  });

  it('تعرض النوع والرصيد وحد الائتمان وتصفّي المدينين من الخادم', async () => {
    renderAt('/customers', <Customers />);
    expect(await screen.findByText('ورشة النيل')).toBeInTheDocument();
    expect(screen.getAllByText('ورشة').length).toBeGreaterThan(0);
    expect(screen.getByText('خصم 5%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'المدينون' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('customers/', {
      params: { page: 1, page_size: 24, has_balance: 1 },
    }));
  });

  it('الموظف يضيف عميلاً بلا حقول الخصم والائتمان', async () => {
    auth.user = { role: 'employee' };
    renderAt('/customers', <Customers />);
    await screen.findByText('ورشة النيل');
    expect(screen.queryByRole('button', { name: /تعديل بيانات/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /إضافة عميل جديد/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByLabelText('حد الائتمان')).not.toBeInTheDocument();
  });
});

describe('ملف العميل', () => {
  beforeEach(() => {
    auth.user = { role: 'employee' };
    vi.clearAllMocks();
    mockServer();
    window.print = vi.fn();
  });

  it('يعرض ملخص الحساب وكشفه ويفتح نافذة التحصيل', async () => {
    renderAt('/customers/3', <CustomerDetail />, '/customers/:id');
    expect(await screen.findByText('الرصيد المستحق')).toBeInTheDocument();
    expect(await screen.findByText('مرتجع #2 من فاتورة #5')).toBeInTheDocument();
    expect(screen.getByText('ورشة · 5%')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('invoices/', { params: { customer: '3', page: 1, page_size: 10 } });

    fireEvent.click(screen.getByRole('button', { name: /تسجيل دفعة/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('المبلغ *')).toHaveValue(120);

    fireEvent.click(within(dialog).getByRole('button', { name: 'إغلاق' }));
    fireEvent.click(screen.getByRole('button', { name: /طباعة الكشف/ }));
    expect(document.getElementById('print-root')).toHaveTextContent('كشف حساب عميل');
  });
});
