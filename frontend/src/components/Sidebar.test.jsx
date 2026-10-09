import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { username: 'demo', role: 'manager' }, logout: vi.fn() }) }));

function setViewport(desktop) {
  window.matchMedia = (query) => ({
    matches: desktop, media: query, addEventListener: () => {}, removeEventListener: () => {},
  });
}

function renderSidebar(props) {
  return render(
    <MemoryRouter>
      <Sidebar collapsed={false} setCollapsed={() => {}} onClose={() => {}} {...props} />
    </MemoryRouter>,
  );
}

describe('القائمة الجانبية', () => {
  afterEach(() => { delete window.matchMedia; });

  it('على الجوال وهي مغلقة: خارج التنقل بلوحة المفاتيح وقارئ الشاشة', () => {
    setViewport(false);
    renderSidebar({ isOpen: false });
    expect(document.getElementById('app-sidebar')).toHaveAttribute('inert');
  });

  it('على الجوال وهي مفتوحة: التركيز على أول رابط، وEscape يغلقها', () => {
    setViewport(false);
    const onClose = vi.fn();
    renderSidebar({ isOpen: true, onClose });
    const sidebar = document.getElementById('app-sidebar');
    expect(sidebar).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(screen.getAllByRole('link')[0]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('على الكمبيوتر: ظاهرة دائماً وزر الطي له اسم', () => {
    setViewport(true);
    renderSidebar({ isOpen: false });
    expect(document.getElementById('app-sidebar')).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'طي القائمة الجانبية' })).toBeInTheDocument();
  });
});
