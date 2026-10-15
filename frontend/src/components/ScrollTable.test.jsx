import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScrollTable from './ScrollTable';

function setLayout(el, { scrollWidth, clientWidth, scrollLeft = 0 }) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  el.scrollLeft = scrollLeft;
}

describe('ScrollTable', () => {
  afterEach(() => { document.documentElement.removeAttribute('dir'); });

  it('جدول أعرض من الشاشة: تلاشٍ عند الحافة وعبارة «اسحب»، ولا شيء إن اتسع', () => {
    const { container, rerender } = render(<ScrollTable><table><tbody><tr><td>x</td></tr></tbody></table></ScrollTable>);
    const scroller = container.querySelector('.overflow-x-auto');
    expect(scroller).toHaveClass('relative');

    setLayout(scroller, { scrollWidth: 900, clientWidth: 300 });
    fireEvent.scroll(scroller);
    expect(screen.getByTestId('fade-end')).toBeInTheDocument();
    expect(screen.queryByTestId('fade-start')).not.toBeInTheDocument();
    expect(screen.getByText(/اسحب الجدول جانبياً/)).toBeInTheDocument();

    // في منتصف الجدول: تلاشٍ على الجهتين.
    setLayout(scroller, { scrollWidth: 900, clientWidth: 300, scrollLeft: 300 });
    fireEvent.scroll(scroller);
    expect(screen.getByTestId('fade-start')).toBeInTheDocument();
    expect(screen.getByTestId('fade-end')).toBeInTheDocument();

    // عند النهاية: يختفي التلاشي والعبارة.
    setLayout(scroller, { scrollWidth: 900, clientWidth: 300, scrollLeft: 600 });
    fireEvent.scroll(scroller);
    expect(screen.queryByTestId('fade-end')).not.toBeInTheDocument();
    expect(screen.queryByText(/اسحب الجدول جانبياً/)).not.toBeInTheDocument();

    // جدول يتسع للشاشة: لا إشارة.
    setLayout(scroller, { scrollWidth: 300, clientWidth: 300 });
    fireEvent.scroll(scroller);
    expect(screen.queryByTestId('fade-start')).not.toBeInTheDocument();
    rerender(<ScrollTable><table /></ScrollTable>);
  });

  it('RTL: التلاشي على الحافة اليسرى (حيث بقية الأعمدة) والتمرير يُقاس بالقيمة المطلقة', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    const { container } = render(<ScrollTable><table /></ScrollTable>);
    const scroller = container.querySelector('.overflow-x-auto');
    setLayout(scroller, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(scroller);
    expect(screen.getByTestId('fade-end').style.left).toBe('0px');

    setLayout(scroller, { scrollWidth: 900, clientWidth: 300, scrollLeft: -150 });
    fireEvent.scroll(scroller);
    expect(screen.getByTestId('fade-start').style.right).toBe('0px');
  });
});
