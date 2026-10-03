import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the real hook effects and callbacks while retaining state/ref slots.
// Browser render behavior is checked by the parent-owned smoke suite.
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
vi.mock('../services/guestTrialProgress', () => ({ guestTrialProgressStore: store }));
import { useGuestTrialProgress } from '../hooks/useGuestTrialProgress';

const state = { progress: null, persistent: false, notice: 'memory only' };
const render = () => { harness.cursor = 0; return useGuestTrialProgress(); };
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

describe('optional guest device notifications', () => {
  it('still loads and cleans up subscriptions when BroadcastChannel constructor is denied', async () => {
    vi.stubGlobal('BroadcastChannel', class { constructor() { throw new DOMException('denied', 'SecurityError'); } });
    render(); const cleanup = mountEffect(); await Promise.resolve();
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(render()).toMatchObject({ ...state, loading: false, error: null });
    expect(cleanup).toBeTypeOf('function'); cleanup();
    expect(store.subscribe.mock.results[0].value).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });
  it('keeps the successful device state when channel sending throws and disables the channel', async () => {
    const close = vi.fn(); const postMessage = vi.fn(() => { throw new DOMException('closed', 'InvalidStateError'); });
    vi.stubGlobal('BroadcastChannel', class { onmessage: unknown; close = close; postMessage = postMessage; });
    render(); const cleanup = mountEffect(); await Promise.resolve();
    const next = { ...state, notice: 'successful memory save' };
    expect(() => render().changed(next)).not.toThrow();
    expect(render()).toMatchObject({ ...next, loading: false, error: null });
    expect(close).toHaveBeenCalledTimes(1);
    render().changed(next); expect(postMessage).toHaveBeenCalledTimes(1);
    cleanup(); expect(close).toHaveBeenCalledTimes(1);
  });
  it('closes a constructed channel if assigning its handler fails while preserving refresh and cleanup', async () => {
    const close = vi.fn();
    vi.stubGlobal('BroadcastChannel', class { close = close; set onmessage(_handler: unknown) { throw new DOMException('denied', 'SecurityError'); } });
    render(); const cleanup = mountEffect(); await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1); expect(store.load).toHaveBeenCalledTimes(1);
    expect(render()).toMatchObject({ ...state, loading: false, error: null });
    cleanup(); expect(store.subscribe.mock.results[0].value).toHaveBeenCalledTimes(1);
  });
});
