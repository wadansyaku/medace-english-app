import { useEffect, useState } from 'react';

const getStandaloneState = (): boolean => {
  if (typeof window === 'undefined') return false;
  const navigatorStandalone = typeof navigator !== 'undefined' && 'standalone' in navigator
    ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    : false;
  return window.matchMedia('(display-mode: standalone)').matches || navigatorStandalone;
};

export const useIsStandalone = (): boolean => {
  const [isStandalone, setIsStandalone] = useState<boolean>(getStandaloneState);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const update = () => setIsStandalone(getStandaloneState());

    update();
    mediaQuery.addEventListener('change', update);
    window.addEventListener('orientationchange', update);

    return () => {
      mediaQuery.removeEventListener('change', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return isStandalone;
};

export default useIsStandalone;
