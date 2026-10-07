import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// عنوان خادم الباك إند أثناء التطوير (يمكن تغييره بمتغيّر بيئة).
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/static/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      // ملفات البناء تُخدم من /static/ لكن صفحات التطبيق (/pos، /shop...) عند
      // الجذر. عامل الخدمة يبقى في /static/sw.js (روابط ذاكرته نسبية إليه)
      // ويُسجَّل بنطاق الجذر؛ الخادم يسمح بذلك بترويسة Service-Worker-Allowed
      // (core/static_headers.py).
      scope: '/',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'اسبير — نقطة البيع والمخزون',
        short_name: 'اسبير',
        description: 'نظام إدارة قطع غيار السيارات: المخزون، نقطة البيع، والطلبات الخارجية',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#1A2432',
        background_color: '#1A2432',
        display: 'standalone',
        orientation: 'portrait',
        id: '/',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // لا تخدم صفحة الواجهة بدل استدعاءات الـ API أو الميديا أو لوحة الإدارة.
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//, /^\/media\//, /^\/static\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/media': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/static': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/admin': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
            return 'vendor';
          }
        },
      },
    },
  },
})
