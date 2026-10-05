import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as Array<() => (() => void) | void> }));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | void) => { harness.cursor++; harness.effects.push(effect); },
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [harness.slots[index], (next: unknown) => { harness.slots[index] = next; }];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
}));
const store = vi.hoisted(() => ({ load: vi.fn(), subscribe: vi.fn() }));
vi.mock('../services/guestLearningProgress', () => ({ guestLearningProgressStore: store }));
import { useGuestLearningProgress } from '../hooks/useGuestLearningProgress';

const state = { progress: null, persistent: false, notice: 'memory only' };
const render = () => { harness.cursor = 0; return useGuestLearningProgress(); };
const mountEffect = () => {
  const cleanup = harness.effects[0]();
  if (typeof cleanup !== 'function') throw new Error('Hook cleanup was not registered');
  return cleanup;
};
beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects = [];
  vi.resetAllMocks();
  store.load.mockResolvedValue(state); store.subscribe.mockReturnValue(vi.fn());
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('optional Naru device notifications and stale reads', () => {
  it('loads progress when BroadcastChannel constructor is denied and cleans up subscriptions', async () => {
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new DOMException('denied', 'SecurityError'); } });
    render(); const cleanup = mountEffect(); await Promise.resolve();
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(render()).toMatchObject({ ...state, loading: false, error: null });
    cleanup();
    expect(store.subscribe.mock.results[0].value).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });
  it('keeps successful state when sending or closing a notification channel throws', async () => {
    const close = vi.fn(() => { throw new Error('closed'); });
    const postMessage = vi.fn(() => { throw new DOMException('closed', 'InvalidStateError'); });
    vi.stubGlobal('BroadcastChannel', class { onmessage: unknown; close = close; postMessage = postMessage; });
    render(); const cleanup = mountEffect(); await Promise.resolve();
    const next = { ...state, notice: 'successful memory save' };
    expect(() => render().changed(next)).not.toThrow();
    expect(render()).toMatchObject({ ...next, loading: false, error: null });
    expect(close).toHaveBeenCalledTimes(1);
    render().changed(next); expect(postMessage).toHaveBeenCalledTimes(1);
    cleanup(); expect(close).toHaveBeenCalledTimes(1);
  });
  it('closes a channel whose handler assignment fails while keeping successful refresh', async () => {
    const close = vi.fn();
    vi.stubGlobal('BroadcastChannel', class { close = close; set onmessage(_handler: unknown) { throw new DOMException('denied', 'SecurityError'); } });
    render(); const cleanup = mountEffect(); await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1); expect(store.load).toHaveBeenCalledTimes(1);
    expect(render()).toMatchObject({ ...state, loading: false, error: null });
    cleanup(); expect(store.subscribe.mock.results[0].value).toHaveBeenCalledTimes(1);
  });
  it('does not restore a pending old snapshot after a successful clear/start mutation', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    let resolveOld!: (value: typeof state) => void;
    store.load.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    render(); const cleanup = mountEffect();
    const fresh = { ...state, persistent: true, notice: null };
    render().changed(fresh);
    resolveOld({ ...state, notice: 'old stale record' }); await Promise.resolve();
    expect(render()).toMatchObject({ ...fresh, loading: false, error: null });
    cleanup();
  });
  it('ignores delayed responses after unmount and exposes load failures without a false saved state', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    store.load.mockRejectedValueOnce(new Error('read failed'));
    render(); const cleanup = mountEffect(); await Promise.resolve();
    expect(render()).toMatchObject({ loading: false, error: expect.stringContaining('確認できません') });
    let resolve!: (value: typeof state) => void;
    store.load.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const refresh = render().refresh(); cleanup();
    resolve({ ...state, notice: 'unmounted response' }); await refresh;
    expect(render().notice).not.toBe('unmounted response');
  });
});
