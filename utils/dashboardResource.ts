import type { DashboardSnapshot } from '../types';

export interface DashboardResourceState {
  snapshot: DashboardSnapshot | null;
  loading: boolean;
  error: 'initial' | 'refresh' | null;
  updatedAt: number | null;
}

/** Each account owns a resource; cancelled or superseded requests cannot publish. */
export const createDashboardResource = (
  load: () => Promise<DashboardSnapshot>,
  enabled = true,
) => {
  let state: DashboardResourceState = {
    snapshot: null,
    loading: enabled,
    error: null,
    updatedAt: null,
  };
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: DashboardResourceState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    cancel: () => { generation += 1; },
    refresh: async (): Promise<void> => {
      if (!enabled) return;
      const requestGeneration = ++generation;
      publish({ ...state, loading: true, error: state.snapshot ? state.error : null });
      try {
        const snapshot = await load();
        if (requestGeneration !== generation) return;
        publish({ snapshot, loading: false, error: null, updatedAt: Date.now() });
      } catch {
        if (requestGeneration !== generation) return;
        publish({ ...state, loading: false, error: state.snapshot ? 'refresh' : 'initial' });
      }
    },
    update: (transform: (snapshot: DashboardSnapshot) => DashboardSnapshot) => {
      if (!state.snapshot) return;
      // A confirmed mutation is newer than an in-flight dashboard read.
      generation += 1;
      publish({ ...state, snapshot: transform(state.snapshot), loading: false });
    },
  };
};
