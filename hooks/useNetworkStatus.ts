import { useEffect, useRef, useState } from 'react';

const ONLINE_PROBE_TIMEOUT_MS = 5000;
const ONLINE_PROBE_PATH = '/api/session';
const OFFLINE_CONFIRMATION_FAILURES = 2;
const OFFLINE_RETRY_DELAY_MS = 1500;

const getNavigatorOnlineState = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  return typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
};

export const useNetworkStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const probeAbortRef = useRef<AbortController | null>(null);
  const offlineFailureCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let isMounted = true;

    const cancelProbe = () => {
      probeAbortRef.current?.abort();
      probeAbortRef.current = null;
    };

    const cancelRetry = () => {
      if (retryTimerRef.current === null) return;
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    };

    const markOnline = () => {
      offlineFailureCountRef.current = 0;
      cancelRetry();
      if (isMounted) setIsOnline(true);
    };

    const scheduleRetry = () => {
      if (retryTimerRef.current !== null || !isMounted) return;
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void confirmOnlineState();
      }, OFFLINE_RETRY_DELAY_MS);
    };

    const confirmOnlineState = async () => {
      const navigatorOnline = getNavigatorOnlineState();
      if (navigatorOnline || typeof fetch === 'undefined') {
        cancelProbe();
        markOnline();
        return;
      }

      cancelProbe();
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), ONLINE_PROBE_TIMEOUT_MS);
      probeAbortRef.current = controller;

      try {
        await fetch(ONLINE_PROBE_PATH, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
          headers: {
            'x-medace-online-probe': '1',
          },
        });
        markOnline();
      } catch {
        if (!isMounted || controller.signal.aborted) return;
        offlineFailureCountRef.current += 1;
        if (offlineFailureCountRef.current >= OFFLINE_CONFIRMATION_FAILURES) {
          setIsOnline(false);
          return;
        }
        scheduleRetry();
      } finally {
        window.clearTimeout(timeoutId);
        if (probeAbortRef.current === controller) {
          probeAbortRef.current = null;
        }
      }
    };

    const sync = () => {
      void confirmOnlineState();
    };

    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      isMounted = false;
      cancelProbe();
      cancelRetry();
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return isOnline;
};

export default useNetworkStatus;
