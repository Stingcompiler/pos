import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import api from '../../api/axios';
import SpareParts from '../../pages/SpareParts';

vi.mock('../../api/axios', () => ({
  API_BASE_URL: '/api/',
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

let currentUser = { role: 'employee' };
vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: currentUser }),
}));

const row = {
  id: 7,
  name: 'فلتر زيت',
  part_number: '04152-YZZA1',
  category: 3,
  category_name: 'فلاتر',
  selling_price: '1800.00',
  stock_quantity: 2,
  min_stock_alert: 3,
  is_low_stock: true,
  shelf_location: 'A-3',
  compatible_cars: [2],
  compatible_cars_display: ['Toyota Hilux (2015-حتى الآن)'],
  is_featured: false,
  image: null,
  description: '',
  supplier: null,
  supplier_name: null,
  brand: 'Toyota',
  oem_number: '04152-YZZA1',
  quality_grade: 'original',
  quality_grade_display: 'أصلي',
  aliases: 'فلتر مكينة',
  barcode: null,
  price_updated_at: null,
};

const page = (results) => ({ data: { count: results.length, next: null, previous: null, results } });

function mockGets({ partsResponse } = {}) {
  api.get.mockImplementation((path) => {
    if (path === 'spare-parts/') return partsResponse ? partsResponse() : Promise.resolve(page([row]));
    if (path === 'car-models/') return Promise.resolve(page([{ id: 2, brand: 'Toyota', model_name: 'Hilux', year_start: 2015, year_end: null, display_name: 'Toyota Hilux (2015-حتى الآن)' }]));
    if (path === 'categories/') return Promise.resolve(page([{ id: 3, name: 'فلاتر', markup_percent: '20.00' }]));
    if (path === 'suppliers/') return Promise.resolve(page([]));
    if (path === 'spare-parts/7/') {
      return Promise.resolve({ data: { ...row, purchase_price: '1200.00', cost_currency: '', foreign_cost: null, markup_percent: null } });
    }
    if (path === 'exchange-rates/latest/') return Promise.resolve({ data: { base_currency: 'SDG', currencies: ['USD'], rates: { USD: '2100.0000' } } });
    if (path === 'admin/settings/') return Promise.resolve({ data: { default_markup_percent: '25.00', price_rounding: 0 } });
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SpareParts page', () => {
  it('الموظف: لا عمود لسعر الشراء ولا تعديل، وسجل الحركات متاح', async () => {
    currentUser = { role: 'employee' };
    mockGets();
    render(<SpareParts />);

    expect(await screen.findByText('فلتر زيت')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'سعر الشراء' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل فلتر زيت' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /استيراد Excel/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'سجل حركات فلتر زيت' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('أصلي')).toBeInTheDocument();
    // الموظف لا يحتاج الفئات والموردين (النموذج للمدير والمشرف).
    expect(api.get).not.toHaveBeenCalledWith('categories/', expect.anything());
  });

  it('التعديل يُعبّأ من التفاصيل ويحفظ دون الرصيد وسعر الشراء', async () => {
    currentUser = { role: 'manager' };
    mockGets();
    api.put.mockResolvedValue({ data: { ...row, purchase_price: '1200.00' } });
    render(<SpareParts />);

    fireEvent.click(await screen.findByRole('button', { name: 'تعديل فلتر زيت' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('الفئة *')).toHaveValue('3'));
    expect(api.get).toHaveBeenCalledWith('spare-parts/7/');
    expect(within(dialog).getByRole('checkbox', { name: /Hilux/ })).toBeChecked();
    expect(within(dialog).getByText('يتغيّر عبر التوريد (متوسط التكلفة)')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /تحديث/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe('spare-parts/7/');
    expect(body.get('category')).toBe('3');
    expect(body.getAll('compatible_cars')).toEqual(['2']);
    expect(body.get('min_stock_alert')).toBe('3');
    expect(body.has('purchase_price')).toBe(false);
    expect(body.has('stock_quantity')).toBe(false);
    expect(await screen.findByText('تم تحديث «فلتر زيت».')).toBeInTheDocument();
  });

  it('فشل التحميل يعرض خطأ وإعادة محاولة بدل جدول فارغ', async () => {
    currentUser = { role: 'employee' };
    let fail = true;
    mockGets({
      partsResponse: () => (fail
        ? Promise.reject(Object.assign(new Error('boom'), { response: { status: 500, data: { detail: 'خطأ في الخادم' } } }))
        : Promise.resolve(page([row]))),
    });
    render(<SpareParts />);

    expect(await screen.findByText('خطأ في الخادم')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد قطع غيار مسجّلة بعد.')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(await screen.findByText('فلتر زيت')).toBeInTheDocument();
  });
  it('الاستيراد: المعاينة بأخطاء تمنع التطبيق، والمعاينة السليمة تطبّق بـ dry_run=0', async () => {
    currentUser = { role: 'manager' };
    mockGets();
    const summary = { create_count: 1, update_count: 0, skipped_count: 0, warnings: [], preview: [], applied: false };
    api.post.mockResolvedValueOnce({
      data: { ...summary, errors: [{ row: 3, part_number: 'X-1', messages: ['الاسم مطلوب.'] }] },
    });
    render(<SpareParts />);

    fireEvent.click(await screen.findByRole('button', { name: /استيراد Excel/ }));
    const dialog = await screen.findByRole('dialog');
    const file = new File(['a,b'], 'parts.csv', { type: 'text/csv' });
    fireEvent.change(within(dialog).getByLabelText(/ملف Excel أو CSV/), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'معاينة' }));

    expect(await within(dialog).findByText('الاسم مطلوب.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /تطبيق الاستيراد/ })).toBeDisabled();
    expect(api.post.mock.calls[0][0]).toBe('spare-parts/import/');
    expect(api.post.mock.calls[0][1].get('dry_run')).toBe('1');

    api.post.mockResolvedValueOnce({
      data: { ...summary, errors: [], preview: [{ row: 2, part_number: 'P1', name: 'فلتر', action: 'create' }] },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /إعادة المعاينة/ }));
    const apply = within(dialog).getByRole('button', { name: /تطبيق الاستيراد/ });
    await waitFor(() => expect(apply).toBeEnabled());

    api.post.mockResolvedValueOnce({ data: { ...summary, errors: [], applied: true } });
    fireEvent.click(apply);
    expect(await within(dialog).findByText(/تم الاستيراد/)).toBeInTheDocument();
    expect(api.post.mock.calls[2][1].get('dry_run')).toBe('0');
  });
});
