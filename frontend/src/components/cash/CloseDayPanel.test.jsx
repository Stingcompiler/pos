import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../../api/axios';
import CloseDayPanel from './CloseDayPanel';

vi.mock('../../api/axios', () => ({
  default: { post: vi.fn(), delete: vi.fn() },
}));

const OPEN_SUMMARY = {
  date: '2026-10-07',
  currency: 'SDG',
  opening_cash: '1000.00',
  expected_cash: '1500.00',
  banks: [{ bank: 'بنكك', in: '300.00', out: '0', count: 3, unverified: 2 }],
  closed: false,
  close: null,
};

const CLOSED_SUMMARY = {
  ...OPEN_SUMMARY,
  banks: [],
  closed: true,
  close: {
    id: 9,
    date: '2026-10-07',
    opening_cash: '1000.00',
    expected_cash: '1500.00',
    counted_cash: '1450.00',
    difference: '-50.00',
    notes: 'نقص فكة',
    closed_by_name: 'admin',
    closed_at: '2026-10-07T20:00:00Z',
  },
};

function renderPanel(props = {}) {
  const onChanged = vi.fn(() => Promise.resolve());
  render(
    <MemoryRouter>
      <CloseDayPanel
        date="2026-10-07"
        summary={OPEN_SUMMARY}
        pending={false}
        openingInvalid={false}
        isManager
        onChanged={onChanged}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onChanged };
}

const countedInput = () => screen.getByLabelText(/النقد المعدود فعلياً/);
const closeButton = () => screen.getByRole('button', { name: /إقفال اليوم/ });

afterEach(() => {
  vi.restoreAllMocks();
  api.post.mockReset();
  api.delete.mockReset();
});

describe('CloseDayPanel', () => {
  it('ينبّه إلى التحويلات غير المطابقة ويربطها بشاشة المطابقة لنفس اليوم', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: 'افتح المطابقة' });
    expect(link).toHaveAttribute('href', '/dashboard/transfers?date=2026-10-07');
  });

  it('يعرض الفرق لحظياً: عجز ثم مطابق ثم مدخل غير صالح', () => {
    renderPanel();
    expect(closeButton()).toBeDisabled();

    fireEvent.change(countedInput(), { target: { value: '1400' } });
    expect(screen.getByText('عجز')).toBeInTheDocument();
    expect(closeButton()).toBeEnabled();

    fireEvent.change(countedInput(), { target: { value: '١٥٠٠' } });
    expect(screen.getByText('مطابق')).toBeInTheDocument();

    fireEvent.change(countedInput(), { target: { value: '1600' } });
    expect(screen.getByText('زيادة')).toBeInTheDocument();

    fireEvent.change(countedInput(), { target: { value: 'abc' } });
    expect(screen.getByText(/أدخل مبلغاً صحيحاً/)).toBeInTheDocument();
    expect(closeButton()).toBeDisabled();
  });

  it('يمنع الإقفال أثناء إعادة حساب نقد البداية', () => {
    renderPanel({ pending: true });
    fireEvent.change(countedInput(), { target: { value: '1500' } });
    expect(closeButton()).toBeDisabled();
  });

  it('يرسل الإقفال بنقد البداية المعروض بعد التأكيد', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.post.mockResolvedValue({ data: {} });
    const { onChanged } = renderPanel();

    fireEvent.change(countedInput(), { target: { value: '1,400.5' } });
    fireEvent.change(screen.getByLabelText('ملاحظات'), { target: { value: ' عجز بسيط ' } });
    fireEvent.click(closeButton());

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('daily-closes/', {
      date: '2026-10-07',
      counted_cash: '1400.5',
      opening_cash: '1000.00',
      notes: 'عجز بسيط',
    });
  });

  it('لا يرسل شيئاً إن ألغى المستخدم التأكيد', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();
    fireEvent.change(countedInput(), { target: { value: '1500' } });
    fireEvent.click(closeButton());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('اليوم المُقفل: يعرض السجل، وإعادة الفتح للمدير فقط', () => {
    renderPanel({ summary: CLOSED_SUMMARY, isManager: false });
    expect(screen.getByText('اليوم مُقفل')).toBeInTheDocument();
    expect(screen.getByText('نقص فكة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إعادة فتح اليوم/ })).not.toBeInTheDocument();
  });

  it('المدير يعيد فتح اليوم بحذف سجل الإقفال', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockResolvedValue({});
    const { onChanged } = renderPanel({ summary: CLOSED_SUMMARY });
    fireEvent.click(screen.getByRole('button', { name: /إعادة فتح اليوم/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.delete).toHaveBeenCalledWith('daily-closes/9/');
  });
});
