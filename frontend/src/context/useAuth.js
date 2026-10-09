/**
 * خطّاف قراءة سياق المصادقة.
 *
 * فُصل في ملف مستقل عن AuthContext.jsx لأن قاعدة react-refresh تشترط أن
 * تصدّر ملفات المكوّنات مكوّنات فقط؛ تصدير خطّاف بجانب AuthProvider كان
 * يكسر Fast Refresh أثناء التطوير.
 */

import { useContext } from 'react';
import { AuthContext } from './authContext';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
