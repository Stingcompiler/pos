import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import api from '../../api/axios';
import Orders from '../../pages/Orders';

vi.mock('../../api/axios', () => ({
  API_BASE_URL: '/api/',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const ORDER = {
  id: 9, customer_name: 'عثمان', phone_number: '0912000111', email: null, location: 'بحري',
  status: 'confirmed', created_at: '2026-10-08T09:00:00Z', total_amount: '50.00', invoice: null,
  items: [{ id: 1, spare_part: 7, spare_part_name: 'فلتر زيت', part_number: 'OF-100', quantity: 2, unit_price: '25.00' }],
};

describe('صفحة الطلبات الخارجية', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => (url === 'public-orders/'
      ? Promise.resolve({ data: { results: [ORDER] } })
      : Promise.resolve({ data: { results: [], next: null } })));
  });

  it('بيع طلب مؤكد نقداً ينشئ فاتورة ويغلق الطلب', async () => {
    api.post.mockResolvedValue({ data: { id: 42 } });
    render(<Orders />);

    fireEvent.click(await screen.findByRole('button', { name: 'بيع' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/لن يُخصم مرتين/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /إنشاء الفاتورة/ }));

    expect(await screen.findByText(/بالفاتورة #42/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('public-orders/9/invoice/', {
      payments: [{ method: 'cash', amount: '50.00' }],
    });
    expect(screen.queryByRole('button', { name: 'بيع' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('حالة الطلب #9')).toBeDisabled();
  });

  it('رفض الخادم يظهر داخل النافذة ولا يغلق الطلب', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { payment: 'المبلغ الآجل يتجاوز حد ائتمان العميل.' } } });
    render(<Orders />);

    fireEvent.click(await screen.findByRole('button', { name: 'بيع' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('آجل'));
    fireEvent.click(within(dialog).getByRole('button', { name: /إنشاء الفاتورة/ }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('يتجاوز حد ائتمان');
    expect(api.post.mock.calls[0][1]).toEqual({ payments: [] });
    expect(screen.getByLabelText('حالة الطلب #9')).not.toBeDisabled();
  });
});
