/**
 * خطّاف قراءة سياق سلة التسوق.
 *
 * فُصل في ملف مستقل عن CartProvider.jsx لنفس سبب useAuth.js: قاعدة
 * react-refresh تشترط أن تصدّر ملفات المكوّنات مكوّنات فقط.
 */

import { useContext } from 'react';
import { CartContext } from './cartContext';

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
