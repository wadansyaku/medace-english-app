import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ProductFeedbackStatusSummary } from '../contracts/productFeedback';
import { ApiError } from '../services/apiClient';
import { getProductFeedbackStatusSummary } from '../services/productFeedback';

export interface ProductFeedbackStatusState {
  data: ProductFeedbackStatusSummary | null;
  loading: boolean;
  error: 'initial' | 'refresh' | null;
  message: string | null;
}

/** A resource belongs to one current identity/grant context, never a role cache. */
export const createProductFeedbackStatusResource = (
  load: (signal: AbortSignal) => Promise<ProductFeedbackStatusSummary> = getProductFeedbackStatusSummary,
  enabled = true,
) => {
  let state: ProductFeedbackStatusState = { data: null, loading: enabled, error: null, message: null };
  let generation = 0;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: ProductFeedbackStatusState) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    cancel: () => {
      generation += 1;
      controller?.abort();
      controller = undefined;
      publish({ data: null, loading: false, error: null, message: null });
    },
    refresh: async (): Promise<void> => {
      if (!enabled) return;
      const requestGeneration = ++generation;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      publish({ ...state, loading: true, error: null, message: null });
      try {
        const data = await load(current.signal);
        if (requestGeneration !== generation || current.signal.aborted) return;
        publish({ data, loading: false, error: null, message: null });
      } catch (error) {
        if (requestGeneration !== generation || current.signal.aborted) return;
        const permissionChanged = error instanceof ApiError && (error.status === 401 || error.status === 403);
        const data = permissionChanged ? null : state.data;
        publish({ data, loading: false, error: data ? 'refresh' : 'initial',
          message: permissionChanged ? 'ログイン状態や権限を確認してから、再取得してください。' : '報告状況を取得できませんでした。もう一度取得してください。' });
      } finally {
        if (requestGeneration === generation) controller = undefined;
      }
    },
  };
};

export const useProductFeedbackStatus = (contextKey: string | null, enabled = true, refreshKey?: string | number) => {
  // A new key gets an empty snapshot during render, before old effects clean up.
  const resource = useMemo(() => createProductFeedbackStatusResource(
    getProductFeedbackStatusSummary, enabled && Boolean(contextKey),
  ), [contextKey, enabled]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  const previousRefresh = useRef({ resource, refreshKey });
  useEffect(() => {
    void resource.refresh();
    return resource.cancel;
  }, [resource]);
  useEffect(() => {
    const previous = previousRefresh.current;
    previousRefresh.current = { resource, refreshKey };
    if (previous.resource === resource && previous.refreshKey !== refreshKey) void resource.refresh();
  }, [resource, refreshKey]);
  return { ...state, refresh: resource.refresh };
};
