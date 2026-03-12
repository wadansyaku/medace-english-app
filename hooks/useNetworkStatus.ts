import { useEffect, useState } from 'react';

const getOnlineState = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
};

export const useNetworkStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState<boolean>(getOnlineState);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const sync = () => setIsOnline(getOnlineState());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();

    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return isOnline;
};

export default useNetworkStatus;
