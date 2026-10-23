import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

vi.mock('../utils/publicSettings', async (importOriginal) => ({
  ...(await importOriginal()),
  getPublicSettings: vi.fn(() => Promise.resolve({})),
}));
vi.mock('./NotificationBadge', () => ({ default: () => <button type="button">إشعارات</button> }));
// الشريط يكشف حالته للاختبار بدلاً من رسم القائمة كلها.
vi.mock('./Sidebar', () => ({
  default: ({ collapsed, setCollapsed }) => (
    <aside>
      <span data-testid="state">{collapsed ? 'collapsed' : 'expanded'}</span>
      <button type="button" onClick={() => setCollapsed(!collapsed)}>تبديل</button>
    </aside>
  ),
}));

function setWidth(px) {
  window.matchMedia = (query) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? px >= Number(min[1]) : false,
      media: query, addEventListener: () => {}, removeEventListener: () => {},
    };
  };
}

describe('طيّ الشريط حسب العرض', () => {
  afterEach(() => { delete window.matchMedia; });

  it('التابلت (900px): مطوي افتراضياً، والمستخدم يوسّعه', () => {
    setWidth(900);
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(screen.getByTestId('state')).toHaveTextContent('collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'تبديل' }));
    expect(screen.getByTestId('state')).toHaveTextContent('expanded');
  });

  it('الشاشة العريضة (1280px): موسّع افتراضياً', () => {
    setWidth(1280);
    render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(screen.getByTestId('state')).toHaveTextContent('expanded');
  });
});
