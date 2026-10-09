import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../api/axios';
import { AuthContext } from '../../context/authContext';
import { invalidateReceiptSettings } from '../../hooks/useReceiptSettings';
import BusinessInfoSection from './BusinessInfoSection';
import PricingSection from './PricingSection';
import BankAccountsSection from './BankAccountsSection';
import ExchangeRatesSection from './ExchangeRatesSection';

vi.mock('../../api/axios', () => ({
  API_BASE_URL: '/api/',
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../hooks/useReceiptSettings', () => ({ invalidateReceiptSettings: vi.fn() }));

const settings = {
  business_phone: '0912', business_address: 'الخرطوم', tax_number: '', receipt_footer: 'شكراً',
  receipt_paper: '80mm', default_markup_percent: '25.00', price_rounding: 25,
  workshop_discount_percent: '5.00', wholesale_discount_percent: '10.00',
};

const withManager = (ui) => (
  <AuthContext.Provider value={{ user: { username: 'm', role: 'manager' }, loading: false }}>{ui}</AuthContext.Provider>
);

describe('أقسام الإعدادات', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset?.());
    api.put.mockImplementation((url, body) => Promise.resolve({ data: { ...settings, ...body } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('بيانات المحل: تحفظ حقولها فقط وتفرّغ نسخة الإيصال المخزّنة', async () => {
    const onSaved = vi.fn();
    render(<BusinessInfoSection settings={settings} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('الرقم الضريبي (اختياري)'), { target: { value: 'TX-9' } });
    fireEvent.click(screen.getByLabelText(/ورق A4/));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ بيانات المحل' }));

    await screen.findByText('تم حفظ بيانات المحل والإيصال.');
    expect(api.put).toHaveBeenCalledWith('admin/settings/', {
      business_phone: '0912', business_address: 'الخرطوم', tax_number: 'TX-9', receipt_footer: 'شكراً', receipt_paper: 'a4',
    });
    expect(invalidateReceiptSettings).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('التسعير: يحافظ على تقريب غير قياسي ويرسل الخطوة رقماً', async () => {
    render(<PricingSection settings={settings} />);
    expect(screen.getByLabelText('تقريب سعر البيع')).toHaveValue('25');
    fireEvent.change(screen.getByLabelText('تقريب سعر البيع'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ إعدادات التسعير' }));

    await screen.findByText('تم حفظ إعدادات التسعير والخصومات.');
    expect(api.put).toHaveBeenCalledWith('admin/settings/', {
      default_markup_percent: '25.00', price_rounding: 100,
      workshop_discount_percent: '5.00', wholesale_discount_percent: '10.00',
    });
  });

  it('الحسابات البنكية: تعرض رسالة الخادم عند رفض الحذف وتعطّل الحساب', async () => {
    api.get.mockResolvedValue({ data: { next: null, results: [{ id: 1, name: 'بنكك', account_number: '123', is_active: true }] } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(withManager(<BankAccountsSection />));
    await screen.findByText('بنكك');

    api.delete.mockRejectedValue({ response: { status: 400, data: { detail: 'للحساب دفعات مسجّلة؛ عطّله بدل حذفه.' } } });
    fireEvent.click(screen.getByRole('button', { name: 'حذف الحساب بنكك' }));
    expect(await screen.findByText('للحساب دفعات مسجّلة؛ عطّله بدل حذفه.')).toBeInTheDocument();

    api.patch.mockResolvedValue({ data: { id: 1, name: 'بنكك', account_number: '123', is_active: false } });
    fireEvent.click(screen.getByRole('button', { name: 'تعطيل' }));
    expect(await screen.findByText('معطّل')).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith('bank-accounts/1/', { is_active: false });
  });

  it('أسعار الصرف: تسجيل سعر جديد يحدّث الأسعار ويُبلغ قسم المراجعة', async () => {
    api.get.mockImplementation((url, config) => {
      if (url === 'exchange-rates/latest/') {
        return Promise.resolve({ data: { base_currency: 'SDG', currencies: ['USD', 'AED'], rates: { USD: '2100.0000' } } });
      }
      return Promise.resolve({ data: { results: [
        { id: 3, currency: config.params.currency, rate: '2100.0000', created_by_name: 'admin', created_at: '2026-10-01T10:00:00Z' },
      ] } });
    });
    api.post.mockResolvedValue({ data: {} });
    const onRateRecorded = vi.fn();
    render(<ExchangeRatesSection onRateRecorded={onRateRecorded} />);

    expect(await screen.findByText('لم يُسجَّل بعد')).toBeInTheDocument(); // AED
    expect(await screen.findByText('admin')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/السعر بالجنيه لكل 1 USD/), { target: { value: '2200' } });
    expect(screen.getByText(/عن السعر الحالي/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل السعر' }));

    await waitFor(() => expect(onRateRecorded).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('exchange-rates/', { currency: 'USD', rate: '2200' });
  });
});
