import { useEffect, useState } from 'react';

/** تطابق استعلام وسائط CSS (مثل شاشة الكمبيوتر) مع التحديث عند تغيّر العرض. */
export default function useMediaQuery(query) {
  const read = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true);
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
