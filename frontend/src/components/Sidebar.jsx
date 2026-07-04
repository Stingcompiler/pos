import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderOpen,
  Car,
  FileText,
  Users,
  LogOut,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Settings,
  Mail,
  Truck,
} from 'lucide-react';

const menuItems = [
  {
    label: 'لوحة التحكم',
    icon: LayoutDashboard,
    path: '/dashboard',
    roles: ['manager', 'supervisor'],
  },
  {
    label: 'نقطة البيع',
    icon: ShoppingCart,
    path: '/pos',
    roles: ['manager', 'supervisor', 'employee'],
  },
  {
    label: 'قطع الغيار',
    icon: Package,
    path: '/spare-parts',
    roles: ['manager', 'supervisor', 'employee'],
  },
  {
    label: 'الفئات',
    icon: FolderOpen,
    path: '/categories',
    roles: ['manager', 'supervisor', 'employee'],
  },
  {
    label: 'موديلات السيارات',
    icon: Car,
    path: '/car-models',
    roles: ['manager', 'supervisor', 'employee'],
  },
  {
    label: 'الفواتير',
    icon: FileText,
    path: '/invoices',
    roles: ['manager', 'supervisor', 'employee'],
  },
  {
    label: 'العملاء',
    icon: Users,
    path: '/customers',
    roles: ['manager', 'supervisor', 'employee'],
  },
  {
    label: 'المستخدمون',
    icon: Users,
    path: '/users',
    roles: ['manager'],
  },
  {
    label: 'تقارير المبيعات',
    icon: LayoutDashboard,
    path: '/dashboard/reports',
    roles: ['manager', 'supervisor'],
  },
  {
    label: 'الموردون',
    icon: Truck,
    path: '/dashboard/suppliers',
    roles: ['manager', 'supervisor', 'employee'],
  },
  {
    label: 'الطلبات الخارجية',
    icon: ShoppingCart,
    path: '/dashboard/orders',
    roles: ['manager', 'supervisor'],
  },
  {
    label: 'رسائل التواصل',
    icon: Mail,
    path: '/dashboard/messages',
    roles: ['manager', 'supervisor'],
  },
  {
    label: 'إعدادات الموقع',
    icon: Settings,
    path: '/dashboard/settings',
    roles: ['manager'],
  },
];

export default function Sidebar({ isOpen, onClose, collapsed, setCollapsed }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredItems = menuItems.filter((item) =>
    item.roles.includes(user?.role)
  );

  const roleLabels = {
    manager: 'مدير',
    supervisor: 'مشرف',
    employee: 'موظف',
  };

  return (
    <aside
      className={`fixed top-0 bottom-0 h-screen z-40 flex flex-col transition-all duration-300 ease-in-out
        ${collapsed ? 'md:w-20' : 'md:w-64'} 
        ${isOpen ? 'right-0 w-64' : 'right-[-264px] md:right-0'}
      `}
      style={{
        background: 'linear-gradient(180deg, rgba(20,20,35,0.98) 0%, rgba(15,15,28,0.99) 100%)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="p-5 flex items-center gap-3 border-b border-white/5">
        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
          <Wrench className="w-5 h-5 text-white" />
        </div>
        {(!collapsed || isOpen) && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="text-base font-bold text-white whitespace-nowrap">قطع الغيار</h1>
            <p className="text-xs text-surface-400 whitespace-nowrap">نظام الإدارة</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/dashboard'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-primary-600/20 text-primary-400 shadow-lg shadow-primary-600/10'
                  : 'text-surface-400 hover:text-white hover:bg-white/5'
              } ${collapsed && !isOpen ? 'md:justify-center' : ''}`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110" />
            {(!collapsed || isOpen) && (
              <span className="animate-fade-in whitespace-nowrap">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Info */}
      <div className="p-3 border-t border-white/5">
        {(!collapsed || isOpen) && (
          <div className="px-3 py-2 mb-2 animate-fade-in">
            <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
            <p className="text-xs text-primary-400">{roleLabels[user?.role]}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium
            text-danger-400 hover:bg-danger-500/10 transition-all duration-200
            ${collapsed && !isOpen ? 'md:justify-center' : ''}`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || isOpen) && <span>تسجيل الخروج</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full
          bg-surface-800 border border-white/10 items-center justify-center
          text-surface-400 hover:text-white hover:bg-surface-700 transition-all duration-200
          shadow-lg"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
}
