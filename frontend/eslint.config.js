import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          // ^[A-Z_] للمكوّنات التي تُستخدَم داخل JSX فقط، لأن ESLint الأساسي
          // لا يعدّ وسوم JSX مراجع للمتغيّرات (لهذا يُضاف eslint-plugin-react).
          // و ^motion$ لأنها تُستخدَم حصراً كـ <motion.div> في صفحة الهبوط.
          varsIgnorePattern: '^[A-Z_]|^motion$',
        },
      ],
      // السماح بتصدير ثوابت (كائنات السياق) بجانب المكوّن دون كسر Fast Refresh.
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    // ملفات الإعداد تعمل في بيئة Node لا في المتصفح، لذا لا تعرِف `process`.
    files: ['*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
