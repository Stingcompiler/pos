import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBadge from './NotificationBadge';
import { useState } from 'react';
import { Menu } from 'lucide-react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-surface-950 flex">
      {/* Sidebar Navigation */}
      <div className="no-print">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
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
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center h-10 w-10"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-white font-cairo">لوحة الإدارة</h1>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBadge />
          </div>
        </header>

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
