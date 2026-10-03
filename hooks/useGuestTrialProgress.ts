import { useCallback, useEffect, useRef, useState } from 'react';
import { guestTrialProgressStore, type GuestTrialDeviceState } from '../services/guestTrialProgress';

const CHANNEL = 'steady-study-guest-trial-changed';
export const useGuestTrialProgress = () => {
  const [state, setState] = useState<GuestTrialDeviceState>({ progress: null, persistent: true, notice: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const closeChannel = useCallback(() => {
    const current = channel.current;
    channel.current = null;
    try { current?.close(); } catch { /* Device notifications are optional. */ }
  }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const next = await guestTrialProgressStore.load();
      if (request === sequence.current) { setState(next); setError(null); }
    } catch { if (request === sequence.current) setError('端末の体験記録を確認できませんでした。もう一度開いてください。'); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    const update = () => { if (active) void refresh(); };
    const unsubscribe = guestTrialProgressStore.subscribe(update);
    const onFocus = () => update();
    window.addEventListener('focus', onFocus);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel.current = new BroadcastChannel(CHANNEL);
        channel.current.onmessage = update;
      } catch { closeChannel(); }
    }
    void refresh();
    return () => {
      active = false; sequence.current++; unsubscribe(); window.removeEventListener('focus', onFocus);
      closeChannel();
    };
  }, [refresh, closeChannel]);
  const changed = useCallback((next: GuestTrialDeviceState) => {
    sequence.current++; setState(next); setLoading(false); setError(null);
    try { channel.current?.postMessage('changed'); } catch { closeChannel(); }
  }, [closeChannel]);
  return { ...state, loading, error, changed, refresh };
};
