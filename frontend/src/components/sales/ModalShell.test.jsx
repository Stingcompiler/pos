import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import ModalShell from './ModalShell';

function Harness({ onClose }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>فتح</button>
      {open && (
        <ModalShell title="فئة جديدة" onClose={() => { onClose(); setOpen(false); }}>
          <label htmlFor="f">الاسم</label>
          <input id="f" />
        </ModalShell>
      )}
    </>
  );
}

describe('ModalShell', () => {
  it('نافذة مسمّاة بعنوانها، والحقل مربوط بتسميته', () => {
    render(<Harness onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'فتح' }));
    expect(screen.getByRole('dialog', { name: 'فئة جديدة' })).toBeInTheDocument();
    expect(screen.getByLabelText('الاسم')).toBeInTheDocument();
  });

  it('Escape يغلق النافذة ويعيد التركيز إلى مشغّلها', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'فتح' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
