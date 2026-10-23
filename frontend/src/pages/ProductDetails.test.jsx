import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProductDetails from './ProductDetails';
import { CartProvider } from '../context/CartProvider';

const part = {
  id: 13, name: 'طرمبة بنزين أكسنت', part_number: 'FP-2401', brand: 'Hyundai',
  quality_grade_display: 'أصلي', selling_price: '95000', stock_quantity: 3,
  compatible_cars: [], category: null, description: '', image: null, is_featured: false,
};

vi.mock('../api/axios', async (importOriginal) => ({
  ...(await importOriginal()),
  default: {
    get: vi.fn((url) => Promise.resolve({
      data: url.startsWith('public/parts/') ? part : { settings: { site_name: 'اسبير' }, contact_methods: [] },
    })),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/product/13']}>
      <CartProvider>
        <Routes>
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/shop" element={<p>المتجر</p>} />
        </Routes>
      </CartProvider>
    </MemoryRouter>,
  );
}

describe('صفحة المنتج: السلة', () => {
  beforeEach(() => localStorage.clear());

  it('تعرض رقم القطعة والماركة والجودة', async () => {
    renderPage();
    expect(await screen.findByText('FP-2401')).toBeInTheDocument();
    expect(screen.getAllByText('Hyundai').length).toBeGreaterThan(0);
    expect(screen.getAllByText('أصلي').length).toBeGreaterThan(0);
  });

  it('الكمية لا تتجاوز المخزون، والإضافة تحدّث السلة وتعرض رابط إتمام الطلب', async () => {
    renderPage();
    await screen.findByText('FP-2401');
    const [plus] = screen.getAllByRole('button', { name: 'زيادة الكمية' });
    fireEvent.click(plus); fireEvent.click(plus); fireEvent.click(plus);
    expect(screen.getAllByRole('group', { name: 'الكمية' })[0]).toHaveTextContent('3');
    fireEvent.click(screen.getAllByRole('button', { name: 'أضف إلى السلة' })[0]);
    await waitFor(() => expect(screen.getAllByText(/في السلة: 3/).length).toBeGreaterThan(0));
    expect(JSON.parse(localStorage.getItem('car_pos_cart'))[0].quantity).toBe(3);
    expect(screen.getAllByText(/أضفتَ كل الكمية المتوفرة/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'عرض السلة وإتمام الطلب' })[0]);
    expect(await screen.findByText('المتجر')).toBeInTheDocument();
  });
});
