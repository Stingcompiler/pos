import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../../api/axios';
import StockCountSheet from './StockCountSheet';

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const LINE = {
  id: 11,
  spare_part: 5,
  spare_part_name: 'فلتر زيت تويوتا',
  part_number: 'OF-100',
  shelf_location: 'A2',
  counted_quantity: 1,
  system_quantity: null,
  current_quantity: 4,
};

const DRAFT = {
  id: 3,
  title: 'جرد الرف A',
  status: 'draft',
  status_display: 'قيد العدّ',
  notes: '',
  lines: [],
  created_by_name: 'admin',
  created_at: '2026-10-07T08:00:00Z',
  applied_by_name: null,
  applied_at: null,
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function renderSheet(count = DRAFT) {
  api.get.mockResolvedValue({ data: count });
  render(<StockCountSheet countId="3" onBack={() => {}} />);
  return screen.findByLabelText('الباركود أو رقم القطعة');
}

function scan(input, code) {
  fireEvent.change(input, { target: { value: code } });
  fireEvent.submit(input.closest('form'));
}

afterEach(() => {
  vi.restoreAllMocks();
  api.get.mockReset();
  api.post.mockReset();
  api.delete.mockReset();
});

describe('StockCountSheet', () => {
  it('كل مسحة +1، والمسحات تُرسل بالتتابع لا بالتوازي', async () => {
    const input = await renderSheet();
    const first = deferred();
    api.post
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ data: { ...LINE, counted_quantity: 2 } });

    scan(input, 'OF-100');
    scan(input, ' OF-١٠٠ ');

    // المسحة الثانية تنتظر ردّ الأولى.
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await new Promise((done) => { setTimeout(done, 30); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('stock-counts/3/lines/', {
      code: 'OF-100', counted_quantity: 1, mode: 'add',
    });

    first.resolve({ data: LINE });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post).toHaveBeenLastCalledWith('stock-counts/3/lines/', {
      code: 'OF-100', counted_quantity: 1, mode: 'add',
    });
    expect(await screen.findByText(/المعدود الآن 2/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'فلتر زيت تويوتا' })).toBeInTheDocument();
  });

  it('رمز غير معروف يعطي رسالة واضحة', async () => {
    const input = await renderSheet();
    api.post.mockRejectedValue({ response: { status: 404, data: { detail: 'لم يُعثر على القطعة.' } } });
    scan(input, 'XYZ');
    expect(await screen.findByText('لم يُعثر على قطعة بالرمز «XYZ».')).toBeInTheDocument();
  });

  it('مربع التطبيق يلخّص الزيادة والنقص ثم يطبّق', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderSheet({
      ...DRAFT,
      lines: [
        { ...LINE, id: 1, spare_part: 1, counted_quantity: 7, current_quantity: 4 },
        { ...LINE, id: 2, spare_part: 2, spare_part_name: 'بوجي', counted_quantity: 1, current_quantity: 3 },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /تطبيق الجرد على المخزون/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('+3 وحدة')).toBeInTheDocument();
    expect(within(dialog).getByText('−2 وحدة')).toBeInTheDocument();

    api.post.mockResolvedValue({
      data: {
        ...DRAFT,
        status: 'applied',
        status_display: 'مطبّق',
        applied_by_name: 'admin',
        applied_at: '2026-10-07T12:00:00Z',
        lines: [{ ...LINE, counted_quantity: 7, system_quantity: 4, current_quantity: 7 }],
      },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /تطبيق وضبط الأرصدة/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith('stock-counts/3/apply/');
    expect(screen.getByText('مطبّق')).toBeInTheDocument();
    // بعد التطبيق: للقراءة فقط.
    expect(screen.queryByLabelText('الباركود أو رقم القطعة')).not.toBeInTheDocument();
  });
});
