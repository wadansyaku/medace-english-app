import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductFeedbackStatusSummary } from '../contracts/productFeedback';
import { ApiError } from '../services/apiClient';

// Real hook/resource and rendered controls; integrated browser geometry is a separate gate.
const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0,
  effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useMemo: (factory: () => unknown, deps: unknown[]) => {
      const index = harness.cursor++; const previous = harness.slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) harness.slots[index] = { deps, value: factory() };
      return harness.slots[index].value;
    },
    useRef: (value: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: value };
      return harness.slots[index];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = harness.cursor++; const previous = harness.slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        harness.slots[index] = deps; harness.effects.set(index, effect);
      }
    },
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
});
const api = vi.hoisted(() => ({ getProductFeedbackStatusSummary: vi.fn() }));
vi.mock('../services/productFeedback', () => api);
import { createProductFeedbackStatusResource, useProductFeedbackStatus } from '../hooks/useProductFeedbackStatus';
import { ProductFeedbackStatusLink } from '../components/ProductFeedbackStatusLink';

const summary = (fixed = 2, admin = false): ProductFeedbackStatusSummary => ({
  counts: { NEW: 3, TRIAGED: 0, HANDOFF_PREPARED: 0, FIXED: fixed, RETEST_PASS: 0, RETEST_FAIL: 1 },
  canManage: admin, scope: admin ? 'all' : 'own-current-organization', actualDeploymentRevision: null, fetchedAt: 123,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const render = <T,>(fn: () => T) => { harness.cursor = 0; return fn(); };
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const flush = async () => {
  const effects = [...harness.effects]; harness.effects.clear();
  for (const [index, effect] of effects) {
    harness.cleanups.get(index)?.(); const cleanup = effect();
    if (cleanup) harness.cleanups.set(index, cleanup); else harness.cleanups.delete(index);
  }
  await settle();
};
const allButtons = (tree: ReactElement<any>): ReactElement<any>[] => {
  const result = tree.type === 'button' ? [tree] : [];
  for (const child of React.Children.toArray(tree.props.children)) if (React.isValidElement(child)) result.push(...allButtons(child));
  return result;
};
const view = (props: React.ComponentProps<typeof ProductFeedbackStatusLink>) => render(() => ProductFeedbackStatusLink(props)) as ReactElement<any>;
beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects.clear(); harness.cleanups.clear();
  vi.clearAllMocks(); api.getProductFeedbackStatusSummary.mockResolvedValue(summary());
});
afterEach(() => { harness.cleanups.forEach(cleanup => cleanup()); harness.cleanups.clear(); });

describe('feedback summary resource', () => {
  it('distinguishes initial failure and confirmed empty data and recovers on explicit retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(summary(0));
    const resource = createProductFeedbackStatusResource(load);
    await resource.refresh(); expect(resource.getSnapshot()).toMatchObject({ data: null, loading: false, error: 'initial' });
    await resource.refresh(); expect(resource.getSnapshot()).toMatchObject({ data: { counts: { FIXED: 0 } }, loading: false, error: null });
  });
  it('keeps the last confirmed counts marked as previous on refresh failure', async () => {
    const load = vi.fn().mockResolvedValueOnce(summary(7)).mockRejectedValueOnce(new Error('offline'));
    const resource = createProductFeedbackStatusResource(load);
    await resource.refresh(); await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ data: { counts: { FIXED: 7 } }, loading: false, error: 'refresh' });
  });
  it.each([401, 403])('discards confirmed counts when current auth is rejected: %s', async status => {
    const load = vi.fn().mockResolvedValueOnce(summary(7)).mockRejectedValueOnce(new ApiError('denied', status));
    const resource = createProductFeedbackStatusResource(load);
    await resource.refresh(); await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ data: null, error: 'initial', message: expect.stringContaining('権限') });
  });
  it('aborts the superseded request and ignores an old success after a newer response', async () => {
    const old = deferred<ProductFeedbackStatusSummary>(); const current = deferred<ProductFeedbackStatusSummary>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const resource = createProductFeedbackStatusResource(load);
    const first = resource.refresh(); const oldSignal = load.mock.calls[0][0] as AbortSignal;
    const second = resource.refresh(); expect(oldSignal.aborted).toBe(true);
    current.resolve(summary(8)); await second; old.resolve(summary(1)); await first;
    expect(resource.getSnapshot().data?.counts.FIXED).toBe(8);
  });
  it('clears retained data on cancellation and ignores a late failure; disabled contexts never fetch', async () => {
    const pending = deferred<ProductFeedbackStatusSummary>();
    const load = vi.fn().mockResolvedValueOnce(summary(7)).mockReturnValueOnce(pending.promise);
    const resource = createProductFeedbackStatusResource(load);
    await resource.refresh(); const request = resource.refresh(); resource.cancel();
    expect(load.mock.calls[1][0].aborted).toBe(true);
    pending.reject(new Error('late')); await request;
    expect(resource.getSnapshot()).toEqual({ data: null, loading: false, error: null, message: null });
    await createProductFeedbackStatusResource(load, false).refresh(); expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('context-bound feedback hook and entry controls', () => {
  it('masks the old identity synchronously before effect cleanup and aborts its pending response', async () => {
    const old = deferred<ProductFeedbackStatusSummary>();
    api.getProductFeedbackStatusSummary.mockResolvedValueOnce(summary(5)).mockReturnValueOnce(old.promise).mockResolvedValueOnce(summary(1));
    render(() => useProductFeedbackStatus('teacher|org|grant1')); await flush();
    const previous = render(() => useProductFeedbackStatus('teacher|org|grant1')); expect(previous.data?.counts.FIXED).toBe(5);
    const request = previous.refresh();
    const changed = render(() => useProductFeedbackStatus('teacher|elsewhere|grant2'));
    expect(changed.data).toBeNull(); expect(changed.loading).toBe(true);
    await flush(); expect(api.getProductFeedbackStatusSummary.mock.calls[1][0].aborted).toBe(true);
    old.resolve(summary(99)); await request;
    expect(render(() => useProductFeedbackStatus('teacher|elsewhere|grant2')).data?.counts.FIXED).toBe(1);
    const loggedOut = render(() => useProductFeedbackStatus(null)); expect(loggedOut.data).toBeNull(); expect(loggedOut.loading).toBe(false);
    await flush(); expect(api.getProductFeedbackStatusSummary).toHaveBeenCalledTimes(3);
  });
  it('refreshes on a mutation/close key without refetching on stable rerenders', async () => {
    render(() => useProductFeedbackStatus('teacher', true, 0)); await flush();
    render(() => useProductFeedbackStatus('teacher', true, 0)); await flush(); expect(api.getProductFeedbackStatusSummary).toHaveBeenCalledTimes(1);
    api.getProductFeedbackStatusSummary.mockResolvedValueOnce(summary(0));
    render(() => useProductFeedbackStatus('teacher', true, 1)); await flush();
    expect(render(() => useProductFeedbackStatus('teacher', true, 1)).data?.counts.FIXED).toBe(0);
    expect(api.getProductFeedbackStatusSummary).toHaveBeenCalledTimes(2);
  });
  it('renders pending and errors as unknown, supports retry, and opens the teacher FIXED list', async () => {
    api.getProductFeedbackStatusSummary.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(summary(2));
    const onOpen = vi.fn(); const props = { contextKey: 'teacher', audience: 'teacher' as const, onOpen };
    let tree = view(props); expect(renderToStaticMarkup(tree)).toContain('報告状況を取得しています'); expect(renderToStaticMarkup(tree)).not.toContain('0件');
    await flush(); tree = view(props); expect(renderToStaticMarkup(tree)).toContain('role="alert"'); expect(renderToStaticMarkup(tree)).not.toContain('再テスト待ち');
    await allButtons(tree).find(button => renderToStaticMarkup(button).includes('件数を再取得'))!.props.onClick(); await settle();
    tree = view(props); expect(renderToStaticMarkup(tree)).toContain('再テスト待ち 2件');
    allButtons(tree).find(button => renderToStaticMarkup(button).includes('再テスト待ち'))!.props.onClick(); expect(onOpen).toHaveBeenLastCalledWith('FIXED');
    allButtons(tree).find(button => renderToStaticMarkup(button).includes('報告する・対応を見る'))!.props.onClick(); expect(onOpen).toHaveBeenLastCalledWith();
  });
  it('labels administrator NEW, failed retests and all FIXED counts separately and passes exact filters', async () => {
    api.getProductFeedbackStatusSummary.mockResolvedValue(summary(4, true));
    const onOpen = vi.fn(); const props = { contextKey: 'admin', audience: 'admin' as const, onOpen };
    view(props); await flush(); const tree = view(props); const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('確認待ち 3件'); expect(markup).toContain('再テスト失敗 1件'); expect(markup).toContain('全体の再テスト待ち 4件');
    const buttons = allButtons(tree);
    for (const [label, status] of [['確認待ち', 'NEW'], ['再テスト失敗', 'RETEST_FAIL'], ['全体の再テスト待ち', 'FIXED']]) {
      buttons.find(button => renderToStaticMarkup(button).includes(label))!.props.onClick(); expect(onOpen).toHaveBeenLastCalledWith(status);
    }
  });
  it('marks retained refresh counts as previous and never displays a summary under the wrong role label', async () => {
    const props = { contextKey: 'teacher', audience: 'teacher' as const, onOpen: vi.fn(), refreshKey: 0 };
    view(props); await flush(); api.getProductFeedbackStatusSummary.mockRejectedValueOnce(new Error('offline'));
    view({ ...props, refreshKey: 1 }); await flush(); let markup = renderToStaticMarkup(view({ ...props, refreshKey: 1 }));
    expect(markup).toContain('前回取得した件数'); expect(markup).toContain('再テスト待ち 2件');
    api.getProductFeedbackStatusSummary.mockResolvedValueOnce(summary(99, true));
    view({ ...props, refreshKey: 2 }); await flush(); markup = renderToStaticMarkup(view({ ...props, refreshKey: 2 }));
    expect(markup).toContain('権限が変わりました'); expect(markup).not.toContain('99件');
    expect(view({ ...props, contextKey: null })).toBeNull(); await flush();
  });
});
