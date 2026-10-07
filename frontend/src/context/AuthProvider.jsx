import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { AuthContext } from './authContext';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check authentication on mount
  const checkAuth = useCallback(async () => {
    try {
      const response = await api.get('auth/me/');
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username, password) => {
    const response = await api.post('auth/login/', { username, password });
    setUser(response.data);
    return response.data;
  };

  const logout = async () => {
    try {
      await api.post('auth/logout/');
    } catch {
      // نتجاهل الخطأ: الخروج محلياً يجب أن ينجح حتى لو فشل نداء الخادم.
    }
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    checkAuth,
    isAuthenticated: !!user,
    isManager: user?.role === 'manager',
    isSupervisor: user?.role === 'supervisor',
    isEmployee: user?.role === 'employee',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
