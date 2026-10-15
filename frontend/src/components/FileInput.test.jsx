import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FileInput from './FileInput';

describe('FileInput', () => {
  it('نصوص عربية للصور وللملفات، ويعرض اسم الملف المختار ويمرّر الحدث', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FileInput id="logo" accept="image/*" onChange={onChange} />);
    expect(screen.getByText('اختر صورة')).toBeInTheDocument();
    expect(screen.getByText('لم تُختر صورة')).toBeInTheDocument();

    const file = new File(['x'], 'شعار.png', { type: 'image/png' });
    fireEvent.change(document.getElementById('logo'), { target: { files: [file] } });
    expect(screen.getByText('شعار.png')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(<FileInput id="sheet" accept=".xlsx" />);
    expect(screen.getByText('اختر ملفاً')).toBeInTheDocument();
  });

  it('الزر عنوان للحقل: الضغط عليه يفتح الحقل (label مرتبطة)', () => {
    render(<FileInput id="proof" accept="image/*" />);
    expect(screen.getByText('اختر صورة')).toHaveAttribute('for', 'proof');
    expect(document.getElementById('proof')).toHaveClass('sr-only');
  });
});
