import { useState, useEffect } from 'react';
import { CartContext } from './cartContext';

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const stored = localStorage.getItem('car_pos_cart');
      return stored ? JSON.parse(stored) : [];
    } catch {
      // نتجاهل خطأ التحليل: نبدأ بسلة فارغة بدل تعطيل التطبيق.
      return [];
    }
  });

  // مزامنة السلة مع التخزين المحلي عند كل تغيير.
  useEffect(() => {
    localStorage.setItem('car_pos_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (part) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.part.id === part.id);
      if (existing) {
        // لا نتجاوز الكمية المتوفرة في المخزون.
        if (existing.quantity >= part.stock_quantity) {
          return prev;
        }
        return prev.map((item) =>
          item.part.id === part.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { part, quantity: 1 }];
    });
  };

  const removeFromCart = (partId) => {
    setCart((prev) => prev.filter((item) => item.part.id !== partId));
  };

  const updateQuantity = (partId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(partId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.part.id === partId) {
          const maxStock = item.part.stock_quantity;
          const allowedQty = quantity > maxStock ? maxStock : quantity;
          return { ...item, quantity: allowedQty };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.part.selling_price) * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        cartTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
