import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../../api/axios';
import { AuthContext } from '../../context/authContext';
import DailyClose from '../../pages/DailyClose';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const SUMMARY = {
  date: '2026-10-07',
  currency: 'SDG',
  sales_count: 4,
  sales_total: '9000.00',
  credit_sales: '1000.00',
  collections: '500.00',
  returns_count: 1,
  returns_total: '200.00',
  expenses_total: '300.00',
  opening_cash: '1000.00',
  cash_in: '6000.00',
  cash_refunds: '200.00',
  cash_expenses: '300.00',
  expected_cash: '6500.00',
  banks: [{ bank: 'بنكك', in: '3000.00', out: '0.00', count: 2, unverified: 1 }],
  closed: false,
  close: null,
};

const EXPENSE = {
  id: 1, date: '2026-10-07', category: 'ترحيل', amount: '300.00', method: 'cash',
  bank_account: null, bank_account_name: null, description: '', created_by_name: 'sara',
};

function mockApi() {
  api.get.mockImplementation((url, config = {}) => {
    const params = config.params || {};
    if (url === 'daily-summary/') {
      if (params.opening_cash !== undefined) {
        const opening = Number(params.opening_cash);
        return Promise.resolve({
          data: { ...SUMMARY, opening_cash: opening.toFixed(2), expected_cash: (opening + 5500).toFixed(2) },
        });
      }
      return Promise.resolve({ data: SUMMARY });
    }
    if (url === 'expenses/') return Promise.resolve({ data: { count: 1, next: null, results: [EXPENSE] } });
    if (url === 'daily-closes/') return Promise.resolve({ data: { count: 0, next: null, results: [] } });
    if (url === 'bank-accounts/') return Promise.resolve({ data: { count: 0, next: null, results: [] } });
    if (url === 'receipt-settings/') return Promise.resolve({ data: { site_name: 'دال موتورز' } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderPage(role = 'manager') {
  const auth = { user: { role }, isManager: role === 'manager', isSupervisor: role === 'supervisor' };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <DailyClose />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

afterEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.delete.mockReset();
});

describe('صفحة إقفال اليومية', () => {
  it('تعرض الملخص والنقد المتوقع وتعيد الحساب عند تعديل نقد البداية', async () => {
    mockApi();
    renderPage();

    const opening = await screen.findByLabelText(/نقد بداية اليوم/);
    expect(opening).toHaveValue('1000.00');
    const expectedBox = screen.getByText('النقد المتوقع في الدرج').closest('div');
    expect(within(expectedBox).getByText(/٦٬٥٠٠٫٠٠/)).toBeInTheDocument();

    fireEvent.change(opening, { target: { value: '2000' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('daily-summary/', {
      params: { date: expect.any(String), opening_cash: '2000' },
    }));
    await waitFor(() => expect(within(expectedBox).getByText(/٧٬٥٠٠٫٠٠/)).toBeInTheDocument());
  });

  it('المدخل غير الصالح لنقد البداية لا يُرسل للخادم ويمنع الإقفال', async () => {
    mockApi();
    renderPage();
    const opening = await screen.findByLabelText(/نقد بداية اليوم/);
    const before = api.get.mock.calls.length;
    fireEvent.change(opening, { target: { value: 'abc' } });
    expect(screen.getByText(/صحّح نقد بداية اليوم أولاً/)).toBeInTheDocument();
    await new Promise((done) => { setTimeout(done, 600); });
    expect(api.get.mock.calls.slice(before).some(([url]) => url === 'daily-summary/')).toBe(false);
  });

  it('المشرف لا يرى زر حذف المصروفات، والمدير يراه', async () => {
    mockApi();
    renderPage('supervisor');
    await screen.findByText('ترحيل');
    expect(screen.queryByRole('button', { name: /حذف مصروف/ })).not.toBeInTheDocument();
  });

  it('المدير يرى زر حذف المصروف', async () => {
    mockApi();
    renderPage('manager');
    await screen.findByText('ترحيل');
    expect(screen.getByRole('button', { name: 'حذف مصروف ترحيل' })).toBeInTheDocument();
  });

  it('خطأ تحميل الملخص يعرض رسالة مع إعادة المحاولة', async () => {
    mockApi();
    const working = api.get.getMockImplementation();
    api.get.mockImplementation((url, config) => (url === 'daily-summary/'
      ? Promise.reject({ response: { status: 500, data: { detail: 'خطأ في الخادم' } } })
      : working(url, config)));
    renderPage();
    expect(await screen.findByText('خطأ في الخادم')).toBeInTheDocument();

    api.get.mockImplementation(working);
    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(await screen.findByLabelText(/نقد بداية اليوم/)).toBeInTheDocument();
  });
});
