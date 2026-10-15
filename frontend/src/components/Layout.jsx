import { Outlet, useLocation } from 'react-router-dom';
import { getPublicSettings } from '../utils/publicSettings';
import Sidebar from './Sidebar';
import NotificationBadge from './NotificationBadge';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Menu, X } from 'lucide-react';

const PAGE_TITLES = {
  '/dashboard/settings': 'الإعدادات',
  '/dashboard/daily-close': 'إقفال اليومية',
  '/dashboard/transfers': 'مطابقة التحويلات',
  '/dashboard/reports': 'تقارير المبيعات',
  '/dashboard/orders': 'الطلبات الخارجية',
  '/dashboard/messages': 'رسائل التواصل',
  '/dashboard/suppliers': 'الموردون',
  '/dashboard': 'لوحة التحكم',
  '/pos': 'نقطة البيع',
  '/spare-parts': 'قطع الغيار',
  '/categories': 'الفئات',
  '/car-models': 'موديلات السيارات',
  '/invoices': 'الفواتير',
  '/customers': 'العملاء',
  '/stock-counts': 'الجرد',
  '/users': 'المستخدمون',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const menuButtonRef = useRef(null);
  const wasOpen = useRef(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [demoMode, setDemoMode] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(() => {
    try { return sessionStorage.getItem('demo-banner-hidden') === '1'; } catch { return false; }
  });
  const hideBanner = () => {
    setBannerHidden(true);
    try { sessionStorage.setItem('demo-banner-hidden', '1'); } catch { /* الإخفاء لهذه الصفحة فقط */ }
  };
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;
    getPublicSettings().then((data) => { if (active) setDemoMode(Boolean(data.demo_mode)); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // عنوان التبويب يميّز الصفحة بدل «اسبير | إدارة المخزون» في كل مكان.
  useEffect(() => {
    const match = Object.entries(PAGE_TITLES).find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
    document.title = match ? `${match[1]} | اسبير` : 'اسبير';
  }, [pathname]);

  // إغلاق القائمة على الجوال يعيد التركيز إلى زر فتحها لا إلى أول الصفحة.
  useEffect(() => {
    if (wasOpen.current && !sidebarOpen) menuButtonRef.current?.focus();
    wasOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-surface-950 flex">
      {/* Sidebar Navigation */}
      <div className="no-print">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
      </div>

      {/* Backdrop overlay for mobile screens */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="no-print md:hidden fixed inset-0 z-30 bg-surface-950/60 backdrop-blur-sm"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Global Responsive Header Bar */}
        <header style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }} className={`no-print flex items-center justify-between px-6 pb-4 border-b border-white/5 bg-surface-900/40 backdrop-blur-md sticky top-0 z-20 transition-all duration-300 ease-in-out ${
          collapsed ? 'md:mr-20' : 'md:mr-64'
        }`}>
          <div className="flex items-center gap-4">
            <button
              ref={menuButtonRef}
              onClick={() => setSidebarOpen(true)}
              aria-label="فتح قائمة التنقل"
              aria-expanded={sidebarOpen}
              aria-controls="app-sidebar"
              className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center h-10 w-10"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <h1 className="text-lg font-bold text-white font-cairo">لوحة الإدارة</h1>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBadge />
          </div>
        </header>

        {demoMode && !bannerHidden && (
          <div
            role="note"
            className={`no-print flex items-center justify-between gap-2 ps-4 pe-1 text-xs md:text-sm font-semibold bg-warning-500/15 text-warning-300 border-b border-warning-500/20 ${
              collapsed ? 'md:mr-20' : 'md:mr-64'
            }`}
          >
            <span className="py-2.5 truncate">
              نسخة تجريبية — البيانات وهمية وتُعاد كل 3 ساعات<span className="hidden md:inline">، وبعض الإعدادات معطّلة</span>
            </span>
            <button
              type="button"
              onClick={hideBanner}
              aria-label="إخفاء التنبيه"
              className="shrink-0 flex items-center justify-center w-11 h-11 rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Dynamic Route Content */}
        <main style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} className={`flex-1 transition-all duration-300 ease-in-out p-4 md:p-8 ${
          collapsed ? 'md:mr-20' : 'md:mr-64'
        }`}>
          {/* التحميل داخل الإطار: كان Suspense الجذري يستبدل القائمة والترويسة كلها
              بشاشة تحميل عند أول زيارة لكل صفحة. */}
          <Suspense
            fallback={(
              <div className="flex justify-center py-24" role="status" aria-label="جارٍ التحميل">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" aria-hidden="true" />
              </div>
            )}
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
