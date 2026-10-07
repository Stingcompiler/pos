import { useEffect, useState } from 'react';
import { apiErrorMessage, fetchAllPages } from '../../utils/api';

/** حسابات المحل البنكية النشطة (لاختيار الحساب في الردّ والتحصيل). */
export default function useActiveBankAccounts() {
  const [state, setState] = useState({ accounts: [], loading: true, error: '' });

  useEffect(() => {
    let active = true;
    fetchAllPages('bank-accounts/', { active: 1 })
      .then((accounts) => {
        if (active) setState({ accounts, loading: false, error: '' });
      })
      .catch((err) => {
        if (active) {
          setState({ accounts: [], loading: false, error: apiErrorMessage(err, 'تعذّر تحميل الحسابات البنكية.') });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
