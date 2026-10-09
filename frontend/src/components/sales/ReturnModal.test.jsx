import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/currency';
import ReturnModal from './ReturnModal';

vi.mock('../../api/axios', () => ({ API_BASE_URL: '/api/', default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../utils/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAllPages: vi.fn(() => Promise.resolve([{ id: 4, name: 'بنكك', account_number: '' }])),
}));

const invoice = {
  id: 12,
  customer: 3,
  customer_name: 'ورشة النيل',
  paid_amount: '10.00',
  credit_amount: '50.00',
  items: [
    { id: 1, spare_part_name: 'فلتر زيت', quantity: 3, returned_quantity: 1, unit_price: '20.00' },
  ],
  returns: [],
};

describe('ReturnModal', () => {
  beforeEach(() => {
    api.post.mockReset();
  });

  it('يحسب الإجمالي مباشرة ويحصر الكمية في المتاح', () => {
    render(<ReturnModal invoice={invoice} onClose={() => {}} onSuccess={() => {}} />);
    const input = screen.getByLabelText('فلتر زيت');
    fireEvent.change(input, { target: { value: '9' } });
    expect(input).toHaveValue(2);
    expect(screen.getByText(formatCurrency(40))).toBeInTheDocument();
  });

  it('يختار الخصم من الحساب افتراضياً للفاتورة الآجلة ويرسل الطلب', async () => {
    const onSuccess = vi.fn();
    api.post.mockResolvedValue({ data: { id: 5, total_amount: '20.00' } });
    render(<ReturnModal invoice={invoice} onClose={() => {}} onSuccess={onSuccess} />);

    expect(screen.getByLabelText('خصم من حساب العميل')).toBeChecked();
    fireEvent.change(screen.getByLabelText('فلتر زيت'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد المرتجع' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: 5, total_amount: '20.00' }));
    expect(api.post).toHaveBeenCalledWith('invoices/12/returns/', {
      items: [{ invoice_item: 1, quantity: 1 }], refund_method: 'account', reason: '',
    });
  });

  it('يعرض رسالة الخادم عند الرفض', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { payment: 'المبلغ المردود أكبر مما دُفع' } } });
    render(<ReturnModal invoice={{ ...invoice, customer: null, credit_amount: '0.00' }} onClose={() => {}} onSuccess={() => {}} />);

    expect(screen.queryByLabelText('خصم من حساب العميل')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('فلتر زيت'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد المرتجع' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('المبلغ المردود أكبر مما دُفع');
  });
});
