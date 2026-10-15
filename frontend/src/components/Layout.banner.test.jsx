import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';
import { clearPublicSettingsCache } from '../utils/publicSettings';

vi.mock('../utils/publicSettings', async (importOriginal) => ({
  ...(await importOriginal()),
  getPublicSettings: vi.fn(() => Promise.resolve({ demo_mode: true })),
}));
vi.mock('./Sidebar', () => ({ default: () => <aside /> }));
vi.mock('./NotificationBadge', () => ({ default: () => <button type="button">إشعارات</button> }));

describe('شريط النسخة التجريبية', () => {
  beforeEach(() => { sessionStorage.clear(); clearPublicSettingsCache(); });

  it('سطر واحد، ويُغلق ويبقى مغلقاً طوال الجلسة', async () => {
    const { unmount } = render(<MemoryRouter><Layout /></MemoryRouter>);
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('نسخة تجريبية');
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء التنبيه' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    unmount();

    render(<MemoryRouter><Layout /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'فتح قائمة التنقل' })).toBeInTheDocument());
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
