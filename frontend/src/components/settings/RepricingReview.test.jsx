import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../api/axios';
import RepricingReview from './RepricingReview';

vi.mock('../../api/axios', () => ({ API_BASE_URL: '/api/', default: { get: vi.fn(), post: vi.fn() } }));

const preview = {
  applied: false,
  count: 2,
  changes: [
    { id: 1, name: 'فلتر زيت', part_number: 'OF-1', currency: 'USD', foreign_cost: '2.00', rate: '2100.0000', old_price: '5000.00', new_price: '5250.00' },
    { id: 2, name: 'بوجي', part_number: 'SP-9', currency: 'AED', foreign_cost: '10.00', rate: '570.0000', old_price: '8000.00', new_price: '7150.00' },
  ],
};

describe('RepricingReview', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('يعرض المعاينة ويميّز الزيادة والانخفاض', async () => {
    api.get.mockResolvedValue({ data: preview });
    render(<RepricingReview />);

    expect(await screen.findByText('فلتر زيت')).toBeInTheDocument();
    expect(screen.getByText('زيادة')).toBeInTheDocument();
    expect(screen.getByText('انخفاض')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('pricing/', { params: { allow_decrease: 'true' } });
  });

  it('خيار «عدم خفض أي سعر» يعيد المعاينة بـ allow_decrease=false', async () => {
    api.get.mockResolvedValue({ data: preview });
    render(<RepricingReview />);
    await screen.findByText('فلتر زيت');

    fireEvent.click(screen.getByLabelText(/عدم خفض أي سعر/));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('pricing/', { params: { allow_decrease: 'false' } }));
  });

  it('يطبّق على القطع المعروضة فقط ويعرض عدد ما حُدّث', async () => {
    api.get.mockResolvedValueOnce({ data: preview }).mockResolvedValue({ data: { applied: false, count: 0, changes: [] } });
    api.post.mockResolvedValue({ data: { ...preview, applied: true } });
    render(<RepricingReview />);
    await screen.findByText('فلتر زيت');

    fireEvent.click(screen.getByRole('button', { name: /تطبيق التسعير الجديد/ }));

    expect(await screen.findByText('تم تحديث أسعار 2 قطعة بنجاح.')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('pricing/', { allow_decrease: true, part_ids: [1, 2] });
  });

  it('يعرض رسالة الخادم عند الفشل', async () => {
    api.get.mockRejectedValue({ response: { status: 403, data: { detail: 'غير مصرح.' } } });
    render(<RepricingReview />);
    expect(await screen.findByText('غير مصرح.')).toBeInTheDocument();
  });
});
