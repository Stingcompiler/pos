import { Outlet, useLocation } from 'react-router-dom';
import { getPublicSettings } from '../utils/publicSettings';
import Sidebar from './Sidebar';
import NotificationBadge from './NotificationBadge';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';

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
        <header className={`no-print flex items-center justify-between px-6 py-4 border-b border-white/5 bg-surface-900/40 backdrop-blur-md sticky top-0 z-20 transition-all duration-300 ease-in-out ${
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

        {demoMode && (
          <div
            role="note"
            className={`no-print px-4 py-2 text-center text-xs md:text-sm font-semibold bg-warning-500/15 text-warning-300 border-b border-warning-500/20 ${
              collapsed ? 'md:mr-20' : 'md:mr-64'
            }`}
          >
            نسخة تجريبية: البيانات وهمية وتُعاد كل 3 ساعات، وبعض الإعدادات معطّلة.
          </div>
        )}

        {/* Dynamic Route Content */}
        <main className={`flex-1 transition-all duration-300 ease-in-out p-4 md:p-8 ${
          collapsed ? 'md:mr-20' : 'md:mr-64'
        }`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
