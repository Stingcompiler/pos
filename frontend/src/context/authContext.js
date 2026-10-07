/**
 * كائن سياق المصادقة.
 *
 * موضوع في ملف مستقل بلا أي مكوّنات لأن قاعدة react-refresh تشترط ألّا
 * يصدّر ملف المكوّن (AuthProvider.jsx) سوى مكوّنات، وألّا يصدّر ملف الخطّاف
 * (useAuth.js) سوى خطّافات. كائن السياق لا ينتمي لأيّ منهما.
 */

import { createContext } from 'react';

export const AuthContext = createContext(null);
