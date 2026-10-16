#!/usr/bin/env node
/**
 * لقطات الشاشات التمثيلية لمراجعة الواجهة بصرياً (docs/ui-profile.md).
 *
 *   npm run shots -- before        # → shots/before/<الشاشة>--<العرض>--dark--ar.png
 *   BASE_URL=http://localhost:5173 npm run shots -- after-batch-1
 *
 * يفترض أن الواجهة والخادم يعملان على نسخة العرض (DJANGO_DEMO_MODE=True) ببيانات
 * seed_demo، فيدخل بزر «دخول كمدير». لحساب آخر: SHOTS_USER و SHOTS_PASS.
 * أول مرة: npx playwright install chromium
 *
 * الحركة معطّلة (reducedMotion)، والأحجام وأوضاع الألوان واللغات من ملحق المشروع.
 * التواريخ تأتي من بيانات العرض (نسبية لليوم) فتختلف يوماً عن يوم؛ قارن لقطات اليوم نفسه.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const LABEL = process.argv[2] ?? 'current';
const OUT = new URL(`../shots/${LABEL}/`, import.meta.url).pathname;

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
];
const SCHEMES = ['dark']; // لوحة الإدارة داكنة فقط؛ لا تبديل
const LOCALES = ['ar'];

const settle = (page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(500));

const SCREENS = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'dashboard-loading', path: '/dashboard', before: (page) => page.route('**/api/dashboard/stats/**', async (route) => { await new Promise((r) => setTimeout(r, 4000)); route.continue(); }), settle: (page) => page.waitForTimeout(700) },
  { name: 'dashboard-error', path: '/dashboard', before: (page) => page.route('**/api/dashboard/stats/**', (route) => route.abort()) },
  { name: 'pos', path: '/pos', after: async (page) => {
    const search = page.getByLabel('ابحث عن قطعة أو امسح الباركود');
    for (const code of ['OF-1001', 'SP-2101', 'SP-2101', 'BP-1101']) { await search.fill(code); await search.press('Enter'); await page.waitForTimeout(350); }
    await search.fill('طرمبة'); await page.waitForTimeout(800);
  } },
  { name: 'spare-parts', path: '/spare-parts' },
  { name: 'spare-parts-selected', path: '/spare-parts', after: async (page) => { await page.getByRole('checkbox', { name: /تحديد /i }).nth(1).check(); await page.getByRole('checkbox', { name: /تحديد /i }).nth(2).check(); } },
  { name: 'spare-parts-empty', path: '/spare-parts', after: async (page) => { await page.getByPlaceholder(/ابحث بالاسم/).fill('لا-توجد-قطعة-بهذا-الاسم'); await page.waitForTimeout(900); } },
  { name: 'invoices', path: '/invoices' },
  { name: 'customers', path: '/customers' },
  { name: 'orders', path: '/dashboard/orders' },
  { name: 'daily-close', path: '/dashboard/daily-close' },
  { name: 'categories', path: '/categories' },
  { name: 'store', path: '/store', public: true },
  { name: 'shop', path: '/shop', public: true },
];

async function login(page) {
  await page.goto(`${BASE}/login`);
  if (process.env.SHOTS_USER) {
    await page.getByPlaceholder('أدخل اسم المستخدم').fill(process.env.SHOTS_USER);
    await page.getByPlaceholder('أدخل كلمة المرور').fill(process.env.SHOTS_PASS ?? '');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  } else {
    await page.getByRole('button', { name: 'دخول كمدير' }).click({ timeout: 15000 });
  }
  await page.waitForURL(/dashboard|pos/);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let taken = 0;
try {
  for (const vp of VIEWPORTS) for (const scheme of SCHEMES) for (const locale of LOCALES) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, locale,
      colorScheme: scheme, reducedMotion: 'reduce', isMobile: vp.mobile, hasTouch: vp.mobile,
    });
    const page = await context.newPage();
    await login(page);
    for (const screen of SCREENS) {
      const target = await context.newPage(); // صفحة جديدة لكل شاشة: اعتراضات الشبكة لا تتسرّب
      try {
        await screen.before?.(target);
        await target.goto(`${BASE}${screen.path}`);
        await (screen.settle ?? settle)(target);
        await screen.after?.(target);
        await target.screenshot({ path: `${OUT}${screen.name}--${vp.name}--${scheme}--${locale}.png`, fullPage: true });
        taken += 1;
      } catch (error) {
        console.error(`✗ ${screen.name} @ ${vp.name}: ${error.message.split('\n')[0]}`);
      } finally {
        await target.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`${taken} لقطة في ${OUT}`);
