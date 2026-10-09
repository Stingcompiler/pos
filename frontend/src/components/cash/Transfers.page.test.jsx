import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../../api/axios';
import Transfers from '../../pages/Transfers';

vi.mock('../../api/axios', () => ({
  API_BASE_URL: '/api/',
  default: { get: vi.fn(), post: vi.fn() },
}));

const PAYMENTS = [
  {
    id: 1, kind: 'sale', kind_display: 'دفعة بيع', method: 'bank', amount: '2500.00', invoice: 12,
    customer: null, customer_name: null, bank_account: 1, bank_account_name: 'بنكك', bank_name: '',
    reference_id: 'TRX-778', sender_account_number: '1234567', proof_image: '/media/payment_proofs/a.jpg',
    verified_at: null, verified_by_name: null, created_at: '2026-10-01T09:15:00Z',
  },
  {
    id: 2, kind: 'collection', kind_display: 'تحصيل دين', method: 'bank', amount: '500.00', invoice: null,
    customer: 7, customer_name: 'ورشة النيل', bank_account: 1, bank_account_name: 'بنكك', bank_name: '',
    reference_id: 'TRX-779', sender_account_number: '7654321', proof_image: null,
    verified_at: '2026-10-01T10:00:00Z', verified_by_name: 'admin', created_at: '2026-10-01T09:45:00Z',
  },
];

function mockApi() {
  api.get.mockImplementation((url) => {
    if (url === 'payments/') return Promise.resolve({ data: { count: 2, next: null, results: PAYMENTS } });
    if (url === 'bank-accounts/') {
      return Promise.resolve({ data: { count: 1, next: null, results: [{ id: 1, name: 'بنكك', is_active: true }] } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderPage(path = '/dashboard/transfers?date=2026-10-01') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Transfers />
    </MemoryRouter>,
  );
}

const paymentCalls = () => api.get.mock.calls.filter(([url]) => url === 'payments/').map(([, config]) => config.params);

afterEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('صفحة مطابقة التحويلات', () => {
  it('تقرأ التاريخ من الرابط وتعرض الإجماليات والتحويلات', async () => {
    mockApi();
    renderPage();
    expect(await screen.findByText('TRX-778')).toBeInTheDocument();
    expect(screen.getByLabelText('التاريخ')).toHaveValue('2026-10-01');
    expect(paymentCalls()).toContainEqual(expect.objectContaining({ method: 'bank', date: '2026-10-01', page: 1 }));

    // الإجماليات: وارد 3000، المطابق 500، وغير مطابق واحد.
    await waitFor(() => expect(screen.getByText('إجمالي الوارد').previousSibling).toHaveTextContent('٣٬٠٠٠٫٠٠'));
    expect(screen.getByText('المطابق منه').previousSibling).toHaveTextContent('٥٠٠٫٠٠');
    expect(screen.getByText('تحويلات غير مطابقة').previousSibling).toHaveTextContent('1');

    expect(screen.getByRole('link', { name: /فتح صورة إشعار التحويل TRX-778/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('لا توجد صورة')).toBeInTheDocument();
  });

  it('المطابقة تحدّث السطر والإجماليات دون إعادة تحميل', async () => {
    mockApi();
    api.post.mockResolvedValue({
      data: { ...PAYMENTS[0], verified_at: '2026-10-01T12:00:00Z', verified_by_name: 'admin' },
    });
    renderPage();
    const row = (await screen.findByText('TRX-778')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'مطابقة' }));

    await waitFor(() => expect(within(row).getByRole('button', { name: 'إلغاء المطابقة' })).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith('payments/1/verify/');
    expect(screen.getByText('تحويلات غير مطابقة').previousSibling).toHaveTextContent('0');
  });

  it('فلتر الحالة يعيد تحميل القائمة فقط لا الإجماليات', async () => {
    mockApi();
    renderPage();
    await screen.findByText('TRX-778');
    const before = paymentCalls().length;

    fireEvent.change(screen.getByLabelText('حالة المطابقة'), { target: { value: '0' } });
    await waitFor(() => expect(paymentCalls().length).toBe(before + 1));
    expect(paymentCalls().at(-1)).toEqual(expect.objectContaining({ verified: '0', page: 1 }));
  });

  it('خطأ التحميل يعرض رسالة وزر إعادة المحاولة', async () => {
    api.get.mockRejectedValue({ response: { status: 500, data: { detail: 'تعطل الخادم' } } });
    renderPage();
    expect(await screen.findByText('تعطل الخادم')).toBeInTheDocument();
    mockApi();
    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(await screen.findByText('TRX-778')).toBeInTheDocument();
  });
});
