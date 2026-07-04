import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import ProductDetails from './pages/ProductDetails';
import FilterPage from './pages/FilterPage';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import POS from './pages/POS';
import SpareParts from './pages/SpareParts';
import Categories from './pages/Categories';
import CarModels from './pages/CarModels';
import Invoices from './pages/Invoices';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Messages from './pages/Messages';
import Reports from './pages/Reports';
import SuppliersList from './pages/SuppliersList';
import SingleSupplier from './pages/SingleSupplier';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import PWAInstallBadge from './components/PWAInstallBadge';
import { Loader2 } from 'lucide-react';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-surface-950"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'employee' ? <Navigate to="/pos" replace /> : <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
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
          <PWAInstallBadge />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
