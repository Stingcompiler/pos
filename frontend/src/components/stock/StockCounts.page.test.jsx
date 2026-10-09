import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../../api/axios';
import StockCounts from '../../pages/StockCounts';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const APPLIED = {
  id: 1,
  title: 'جرد سبتمبر',
  status: 'applied',
  status_display: 'مطبّق',
  notes: '',
  lines: [{ id: 1 }, { id: 2 }],
  created_by_name: 'admin',
  created_at: '2026-09-30T08:00:00Z',
  applied_by_name: 'admin',
  applied_at: '2026-09-30T12:00:00Z',
};

const NEW_COUNT = {
  ...APPLIED,
  id: 2,
  title: 'رف الفلاتر',
  status: 'draft',
  status_display: 'قيد العدّ',
  lines: [],
  applied_by_name: null,
  applied_at: null,
};

afterEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('صفحة الجرد', () => {
  it('تعرض القائمة، وإنشاء جرد جديد يفتح شاشة العدّ', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'stock-counts/') return Promise.resolve({ data: { count: 1, next: null, results: [APPLIED] } });
      if (url === 'stock-counts/2/') return Promise.resolve({ data: NEW_COUNT });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    api.post.mockResolvedValue({ data: NEW_COUNT });

    render(
      <MemoryRouter initialEntries={['/stock-counts']}>
        <StockCounts />
      </MemoryRouter>,
    );

    expect(await screen.findByText('جرد سبتمبر')).toBeInTheDocument();
    expect(screen.getByText('مطبّق')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /جرد جديد/ }));
    fireEvent.change(screen.getByLabelText('العنوان'), { target: { value: '  رف الفلاتر ' } });
    fireEvent.click(screen.getByRole('button', { name: /إنشاء وبدء العدّ/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('stock-counts/', { title: 'رف الفلاتر', notes: '' }));
    expect(await screen.findByLabelText('الباركود أو رقم القطعة')).toBeInTheDocument();
    expect(screen.getByText('لم تُعدّ أي قطعة بعد')).toBeInTheDocument();
    // الكاميرا غير مدعومة في jsdom: تظهر بدائل المسح.
    expect(screen.getByText(/قارئ باركود USB أو/)).toBeInTheDocument();
  });

  it('قائمة فارغة تعرض حالة الفراغ', async () => {
    api.get.mockResolvedValue({ data: { count: 0, next: null, results: [] } });
    render(
      <MemoryRouter initialEntries={['/stock-counts']}>
        <StockCounts />
      </MemoryRouter>,
    );
    expect(await screen.findByText('لا توجد عمليات جرد بعد')).toBeInTheDocument();
  });
});
