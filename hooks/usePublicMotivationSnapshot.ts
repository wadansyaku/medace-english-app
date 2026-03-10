import { useEffect, useState } from 'react';

import type { PublicMotivationSnapshot } from '../types';
import { getPublicMotivationSnapshot } from '../services/publicStats';

interface UsePublicMotivationSnapshotResult {
  snapshot: PublicMotivationSnapshot | null;
  loading: boolean;
  error: string | null;
}

export const usePublicMotivationSnapshot = (
  enabled = true,
  pollIntervalMs = 30_000,
): UsePublicMotivationSnapshotResult => {
  const [snapshot, setSnapshot] = useState<PublicMotivationSnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async (isInitial = false) => {
      if (isInitial) {
        setLoading(true);
      }

      try {
        const nextSnapshot = await getPublicMotivationSnapshot();
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : '公開データの取得に失敗しました。');
      } finally {
        if (!cancelled && isInitial) {
          setLoading(false);
        }
      }
    };

    void load(true);
    const intervalId = window.setInterval(() => {
      void load(false);
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, pollIntervalMs]);

  return { snapshot, loading, error };
};
