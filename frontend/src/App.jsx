import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { CartProvider } from './context/CartProvider';
import { useAuth } from './context/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PWAInstallBadge from './components/PWAInstallBadge';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// الصفحات تُحمَّل عند فتحها: زائر المتجر لا ينزّل شاشات الإدارة، والكاشير لا
// ينزّل المتجر — فرق ملموس على شبكات الجوال البطيئة.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const FilterPage = lazy(() => import('./pages/FilterPage'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const POS = lazy(() => import('./pages/POS'));
const SpareParts = lazy(() => import('./pages/SpareParts'));
const Categories = lazy(() => import('./pages/Categories'));
const CarModels = lazy(() => import('./pages/CarModels'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Messages = lazy(() => import('./pages/Messages'));
const Reports = lazy(() => import('./pages/Reports'));
const SuppliersList = lazy(() => import('./pages/SuppliersList'));
const SingleSupplier = lazy(() => import('./pages/SingleSupplier'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const DailyClose = lazy(() => import('./pages/DailyClose'));
const Transfers = lazy(() => import('./pages/Transfers'));
const StockCounts = lazy(() => import('./pages/StockCounts'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
    </div>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'employee' ? <Navigate to="/pos" replace /> : <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public customer landing page */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/product/:id" element={<ProductDetails />} />
            <Route path="/shop" element={<FilterPage />} />
            <Route path="/inventory" element={<FilterPage />} />
            
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<RootRedirect />} />
            
            {/* All authenticated users */}
            <Route element={<ProtectedRoute allowedRoles={['manager', 'supervisor', 'employee']} />}>
              <Route element={<Layout />}>
                <Route path="/pos" element={<POS />} />
                <Route path="/spare-parts" element={<SpareParts />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/car-models" element={<CarModels />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/dashboard/suppliers" element={<SuppliersList />} />
                <Route path="/dashboard/suppliers/:id" element={<SingleSupplier />} />

                {/* Manager & Supervisor routes */}
                <Route element={<ProtectedRoute allowedRoles={['manager', 'supervisor']} redirectTo="/pos" />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/dashboard/messages" element={<Messages />} />
                  <Route path="/dashboard/reports" element={<Reports />} />
                  <Route path="/dashboard/orders" element={<Orders />} />
                  <Route path="/dashboard/daily-close" element={<DailyClose />} />
                  <Route path="/dashboard/transfers" element={<Transfers />} />
                  <Route path="/stock-counts" element={<StockCounts />} />
                </Route>

                {/* Manager only routes */}
                <Route element={<ProtectedRoute allowedRoles={['manager']} redirectTo="/pos" />}>
                  <Route path="/users" element={<Users />} />
                  <Route path="/dashboard/settings" element={<Settings />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <PWAInstallBadge />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
