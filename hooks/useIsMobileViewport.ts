import { useEffect, useState } from 'react';

const DEFAULT_QUERY = '(max-width: 639px)';

export const useIsMobileViewport = (query = DEFAULT_QUERY): boolean => {
  const getMatches = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
};

export default useIsMobileViewport;
