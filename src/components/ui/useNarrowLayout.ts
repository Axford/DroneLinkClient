import { useEffect, useState } from 'react';
export default function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 767px)').matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 767px)');
    if (!media) return;
    const changed = () => setNarrow(media.matches);
    media.addEventListener('change', changed); return () => media.removeEventListener('change', changed);
  }, []);
  return narrow;
}
