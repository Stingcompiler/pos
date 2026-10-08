import { lazy, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getPublicSettings } from '../utils/publicSettings';

const loadLanding = () => import('../pages/LandingPage');
const loadProductLanding = () => import('../pages/ProductLanding');
const LandingPage = lazy(loadLanding);
const ProductLanding = lazy(loadProductLanding);

/**
 * الصفحة الرئيسية: متجر المحل عادةً، وصفحة تسويق النظام في نسخة العرض فقط
 * (DJANGO_DEMO_MODE). المحل الحقيقي لا يرى صفحة التسويق أبداً.
 */
export default function HomeRoute() {
  const [state, setState] = useState({ loading: true, demo: false, accounts: [] });

  useEffect(() => {
    let active = true;
    // ملف الصفحة يُنزَّل مع الإعدادات لا بعدها (كان كل منهما ينتظر الآخر).
    loadLanding().catch(() => {});
    getPublicSettings()
      .then((data) => {
        if (data.demo_mode) loadProductLanding().catch(() => {});
        if (active) setState({ loading: false, demo: Boolean(data.demo_mode), accounts: data.demo_accounts || [] });
      })
      .catch(() => { if (active) setState({ loading: false, demo: false, accounts: [] }); });
    return () => { active = false; };
  }, []);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" aria-label="جارٍ التحميل" />
      </div>
    );
  }
  return state.demo ? <ProductLanding demoAccounts={state.accounts} /> : <LandingPage />;
}
