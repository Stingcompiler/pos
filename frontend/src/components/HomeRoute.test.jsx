import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Suspense } from 'react';
import api from '../api/axios';
import HomeRoute from './HomeRoute';
import { clearPublicSettingsCache } from '../utils/publicSettings';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../pages/LandingPage', () => ({ default: () => <h1>متجر المحل</h1> }));
const login = vi.fn();
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ login }) }));

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/dashboard" element={<p>لوحة التحكم</p>} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

describe('الصفحة الرئيسية', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPublicSettingsCache();
  });

  it('المحل الحقيقي يرى متجره لا صفحة تسويق النظام', async () => {
    api.get.mockResolvedValue({ data: { demo_mode: false, demo_accounts: [] } });
    renderHome();
    // الصفحتان تُحمَّلان كسولاً (lazy): مهلة أطول من الافتراضية تحت ضغط التشغيل المتوازي.
    expect(await screen.findByRole('heading', { name: 'متجر المحل' }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('نسخة العرض: صفحة التسويق، وزر التجربة يدخل بحساب المدير', async () => {
    api.get.mockResolvedValue({
      data: {
        demo_mode: true,
        demo_accounts: [
          { username: 'demo', password: 'aspir-demo', role: 'مدير' },
          { username: 'cashier', password: 'aspir-demo', role: 'كاشير' },
        ],
      },
    });
    login.mockResolvedValue({ role: 'manager' });
    renderHome();

    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).toHaveTextContent('نقطة بيع لمحل قطع الغيار');
    const whatsapp = screen.getAllByRole('link', { name: /واتساب/ })[0];
    expect(whatsapp).toHaveAttribute('href', expect.stringContaining('https://wa.me/249902929451'));

    fireEvent.click(screen.getAllByRole('button', { name: /جرّب النظام الآن/ })[0]);
    await waitFor(() => expect(login).toHaveBeenCalledWith('demo', 'aspir-demo'));
    expect(await screen.findByText('لوحة التحكم')).toBeInTheDocument();
  });
});
