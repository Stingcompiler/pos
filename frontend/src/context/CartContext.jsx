import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const stored = localStorage.getItem('car_pos_cart');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Sync to localStorage on cart change
  useEffect(() => {
    localStorage.setItem('car_pos_cart', JSON.stringify(cart));
  }, [cart]);

  // Add Item
  const addToCart = (part) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.part.id === part.id);
      if (existing) {
        if (existing.quantity >= part.stock_quantity) {
          return prev; // Limit to stock quantity silently or trigger an event
        }
        return prev.map((item) =>
          item.part.id === part.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { part, quantity: 1 }];
    });
  };

  // Remove Item
  const removeFromCart = (partId) => {
    setCart((prev) => prev.filter((item) => item.part.id !== partId));
  };

  // Update Item Quantity
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

  // Clear Cart
  const clearCart = () => {
    setCart([]);
  };

  // Count total unique or cumulative items
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Compute total cart price
  const cartTotal = cart.reduce((sum, item) => sum + Number(item.part.selling_price) * item.quantity, 0);

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

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
