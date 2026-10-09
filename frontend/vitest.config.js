import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * إعداد الاختبارات منفصل عن `vite.config.js` عمداً:
 * إضافة إضافات الإنتاج (Tailwind وPWA) إلى مسار الاختبار تُبطئه بلا فائدة،
 * وPWA تولّد service worker عند البناء وهو غير مرغوب داخل الاختبارات.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    // قيمة ثابتة حتى لا يعتمد بناء روابط الميديا في الاختبارات على بيئة
    // المطوّر (غياب المتغيّر يجعل الأساس مساراً نسبياً فتتغيّر النتائج).
    env: { VITE_API_URL: '/api/' },
    // المهلة الافتراضية (5 ثوانٍ) أقصر من تكلفة تهيئة أول اختبار في كل ملف
    // على هذا الجهاز: بناء jsdom وتحويل الوحدات يستهلك وحده ثوانيَ طويلة.
    // جسم الاختبارات نفسه سريع، فالمهلة الأوسع تعالج التهيئة لا منطقاً بطيئاً.
    testTimeout: 30000,
  },
});
