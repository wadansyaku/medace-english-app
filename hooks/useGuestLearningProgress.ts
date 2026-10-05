import { useCallback, useEffect, useRef, useState } from 'react';
import { guestLearningProgressStore, type GuestLearningDeviceState } from '../services/guestLearningProgress';

const CHANNEL = 'steady-study-guest-learning-changed';
export const useGuestLearningProgress = () => {
  const [state, setState] = useState<GuestLearningDeviceState>({ progress: null, persistent: true, notice: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const closeChannel = useCallback(() => {
    const current = channel.current; channel.current = null;
    try { current?.close(); } catch { /* Device notifications are optional. */ }
  }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const next = await guestLearningProgressStore.load();
      if (request === sequence.current) { setState(next); setError(null); }
    } catch { if (request === sequence.current) setError('端末の一時記録を確認できませんでした。もう一度開いてください。'); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    const update = () => { if (active) void refresh(); };
    const unsubscribe = guestLearningProgressStore.subscribe(update);
    window.addEventListener('focus', update);
    if (typeof BroadcastChannel !== 'undefined') {
      try { channel.current = new BroadcastChannel(CHANNEL); channel.current.onmessage = update; }
      catch { closeChannel(); }
    }
    void refresh();
    return () => {
      active = false; sequence.current++; unsubscribe(); window.removeEventListener('focus', update); closeChannel();
    };
  }, [refresh, closeChannel]);
  const changed = useCallback((next: GuestLearningDeviceState) => {
    sequence.current++; setState(next); setLoading(false); setError(null);
    try { channel.current?.postMessage('changed'); } catch { closeChannel(); }
  }, [closeChannel]);
  return { ...state, loading, error, changed, refresh };
};
