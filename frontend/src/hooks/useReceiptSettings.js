import { useEffect, useState } from 'react';
import api from '../api/axios';

/**
 * هوية البائع ومقاس الإيصال، تُجلب مرة واحدة لكل جلسة وتُشارك بين الصفحات.
 */
let cached = null;
let pending = null;

export function loadReceiptSettings() {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = api
      .get('receipt-settings/')
      .then((response) => {
        cached = response.data;
        return cached;
      })
      .catch(() => ({ site_name: '', receipt_paper: '80mm' }))
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** تفريغ النسخة المخزّنة بعد تعديل الإعدادات. */
export function invalidateReceiptSettings() {
  cached = null;
}

export default function useReceiptSettings() {
  const [settings, setSettings] = useState(cached);
  useEffect(() => {
    let active = true;
    loadReceiptSettings().then((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
