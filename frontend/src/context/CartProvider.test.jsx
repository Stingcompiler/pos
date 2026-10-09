import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartProvider } from './CartProvider';
import { useCart } from './useCart';

const CART_STORAGE_KEY = 'car_pos_cart';

// قطع ثابتة تُستخدم عبر الاختبارات (سعر البيع نصّي كما يصل من الـ API).
const PART_A = { id: 1, name: 'فلتر زيت', selling_price: '25.00', stock_quantity: 5 };
const PART_B = { id: 2, name: 'فلتر هواء', selling_price: '10.50', stock_quantity: 5 };
const PART_LIMITED = { id: 3, name: 'شمعات', selling_price: '15.00', stock_quantity: 2 };
const PART_CAP3 = { id: 4, name: 'سيور', selling_price: '8.00', stock_quantity: 3 };
const PART_QTY5 = { id: 5, name: 'مساحات', selling_price: '12.00', stock_quantity: 5 };
const PART_7 = { id: 7, name: 'بطارية', selling_price: '100.00', stock_quantity: 4 };

/**
 * مسبار يمارس السلة عبر أزرار حقيقية.
 *
 * اخترنا التفاعل بالأزرار بدل التقاط قيم `useCart` في متغيّر خارجي: إسناد
 * متغيّر خارج المكوّن أثناء الرسم أو في تأثير يخالف قاعدة
 * react-hooks/immutability ويفشل الـ lint — والأزرار أقرب لسلوك المستخدم.
 */
function CartProbe() {
  const cart = useCart();

  return (
    <div>
      <span data-testid="lines">{cart.cart.length}</span>
      <span data-testid="count">{cart.cartCount}</span>
      <span data-testid="total">{cart.cartTotal}</span>
      <span data-testid="ids">{cart.cart.map((item) => item.part.id).join(',')}</span>

      <button onClick={() => cart.addToCart(PART_A)}>add-a</button>
      <button onClick={() => cart.addToCart(PART_B)}>add-b</button>
      <button onClick={() => cart.addToCart(PART_LIMITED)}>add-limited</button>
      <button onClick={() => cart.addToCart(PART_CAP3)}>add-cap3</button>
      <button onClick={() => cart.addToCart(PART_QTY5)}>add-qty5</button>
      <button onClick={() => cart.addToCart(PART_7)}>add-7</button>
      <button onClick={() => cart.removeFromCart(PART_A.id)}>remove-a</button>
      <button onClick={() => cart.updateQuantity(PART_CAP3.id, 99)}>cap3-to-99</button>
      <button onClick={() => cart.updateQuantity(PART_QTY5.id, 0)}>qty5-to-zero</button>
      <button onClick={cart.clearCart}>clear</button>
    </div>
  );
}

function renderCart() {
  return render(
    <CartProvider>
      <CartProbe />
    </CartProvider>
  );
}

const click = (label) => fireEvent.click(screen.getByText(label));
const total = () => screen.getByTestId('total').textContent;
const count = () => screen.getByTestId('count').textContent;
const lines = () => screen.getByTestId('lines').textContent;
const ids = () => screen.getByTestId('ids').textContent;

describe('CartProvider', () => {
  it('يبدأ بسلة فارغة وإجمالي صفر', () => {
    renderCart();
    expect(lines()).toBe('0');
    expect(count()).toBe('0');
    expect(total()).toBe('0');
  });

  it('يحسب الإجمالي = سعر البيع × الكمية لكل بند', () => {
    renderCart();
    click('add-a');
    click('add-a');
    click('add-b');

    // 2 × 25.00 + 1 × 10.50 = 60.50
    expect(total()).toBe('60.5');
    expect(count()).toBe('3');
    expect(lines()).toBe('2');
  });

  it('يدمج القطعة المتكرّرة في بند واحد بزيادة الكمية', () => {
    renderCart();
    click('add-a');
    click('add-a');

    expect(lines()).toBe('1');
    expect(count()).toBe('2');
  });

  it('لا تتجاوز الكمية المتوفرة في المخزون عند الإضافة المتكرّرة', () => {
    renderCart();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      click('add-limited');
    }

    // المخزون المتاح قطعتان فقط.
    expect(count()).toBe('2');
  });

  it('يحترم حدّ المخزون عند تعديل الكمية يدوياً', () => {
    renderCart();
    click('add-cap3');
    click('cap3-to-99');

    expect(count()).toBe('3');
  });

  it('تعديل الكمية إلى صفر يزيل البند', () => {
    renderCart();
    click('add-qty5');
    click('qty5-to-zero');

    expect(lines()).toBe('0');
    expect(total()).toBe('0');
  });

  it('removeFromCart يزيل البند المطلوب فقط', () => {
    renderCart();
    click('add-a');
    click('add-b');
    click('remove-a');

    expect(lines()).toBe('1');
    expect(ids()).toBe('2');
  });

  it('clearCart يفرّغ السلة والإجمالي', () => {
    renderCart();
    click('add-a');
    click('clear');

    expect(lines()).toBe('0');
    expect(total()).toBe('0');
  });

  it('يحفظ السلة في localStorage عند التغيير', () => {
    renderCart();
    click('add-7');

    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY));
    expect(saved).toHaveLength(1);
    expect(saved[0].part.id).toBe(7);
    expect(saved[0].quantity).toBe(1);
  });

  it('يستعيد السلة من localStorage عند التحميل', () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([{ part: { ...PART_QTY5, id: 9, selling_price: '12.00' }, quantity: 2 }])
    );
    renderCart();

    expect(lines()).toBe('1');
    expect(count()).toBe('2');
    expect(total()).toBe('24');
  });

  it('يبدأ بسلة فارغة إن كان المحفوظ تالفاً', () => {
    // سلة محفوظة بصيغة غير صالحة يجب ألا تُسقط التطبيق كاملاً.
    localStorage.setItem(CART_STORAGE_KEY, '{ليست JSON صالحة');
    renderCart();

    expect(lines()).toBe('0');
    expect(total()).toBe('0');
  });
});
