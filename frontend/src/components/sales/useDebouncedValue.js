import { useEffect, useState } from 'react';

/** قيمة تتأخر حتى يتوقف المستخدم عن الكتابة، فلا يُرسل طلب بحث مع كل حرف. */
export default function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
