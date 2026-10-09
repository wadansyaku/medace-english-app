import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPlan } from '../types';

const state = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
const api = vi.hoisted(() => ({
  dashboard: vi.fn(), settings: vi.fn(), missions: vi.fn(), books: vi.fn(),
  assignments: vi.fn(), queue: vi.fn(),
}));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = initial;
    return [state.slots[index], (next: unknown) => { state.slots[index] = next; }];
  },
  useRef: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = { current: initial };
    return state.slots[index];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));
vi.mock('../shared/storageMode', () => ({ resolveStorageMode: () => ({ capabilities: {
  writing: { available: true }, organization: { available: true }, missions: { available: true },
} }) }));
vi.mock('../services/workspace', () => ({ workspaceService: {
  getOrganizationDashboardSnapshot: api.dashboard, getOrganizationSettingsSnapshot: api.settings,
  getWeeklyMissionBoard: api.missions, getBooks: api.books,
} }));
vi.mock('../services/writing', () => ({ listWritingAssignments: api.assignments, listWritingReviewQueue: api.queue }));
import { useBusinessAdminDashboardData } from '../hooks/useBusinessAdminDashboardData';
const render = (subscriptionPlan?: SubscriptionPlan) => {
  state.cursor = 0;
  return useBusinessAdminDashboardData({ subscriptionPlan });
};

beforeEach(() => {
  state.slots = []; state.cursor = 0; vi.clearAllMocks();
  api.dashboard.mockResolvedValue({ marker: 'confirmed organization' });
  api.settings.mockResolvedValue({ marker: 'confirmed settings' });
  api.missions.mockResolvedValue({ marker: 'confirmed missions' });
  api.books.mockResolvedValue([{ id: 'real-response-book' }]);
  api.assignments.mockResolvedValue({ assignments: [{ id: 'paid-assignment' }] });
  api.queue.mockResolvedValue({ items: [{ id: 'paid-review' }] });
});

describe('business admin optional writing eligibility', () => {
  it.each([SubscriptionPlan.TOB_FREE, undefined])('loads base workspace without forbidden writing requests for %s', async plan => {
    api.assignments.mockRejectedValue(new Error('403 unavailable'));
    api.queue.mockRejectedValue(new Error('403 unavailable'));
    await render(plan).refresh();
    const result = render(plan);
    expect(result.error).toBeNull(); expect(result.loading).toBe(false);
    expect(result.snapshot).toEqual({ marker: 'confirmed organization' });
    expect(result.settingsSnapshot).toEqual({ marker: 'confirmed settings' });
    expect(result.missionBoard).toEqual({ marker: 'confirmed missions' });
    expect(result.books).toEqual([{ id: 'real-response-book' }]);
    expect(result.writingAssignments).toEqual([]); expect(result.writingQueue).toEqual([]);
    expect(result.writingState).toBe('NOT_INCLUDED');
    expect(api.assignments).not.toHaveBeenCalled(); expect(api.queue).not.toHaveBeenCalled();
  });
  it('fetches writing for paid plans and clears old paid collections after a free-plan refresh', async () => {
    await render(SubscriptionPlan.TOB_PAID).refresh();
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('READY');
    expect(render(SubscriptionPlan.TOB_PAID).writingAssignments).toEqual([{ id: 'paid-assignment' }]);
    expect(api.assignments).toHaveBeenCalledWith('organization'); expect(api.queue).toHaveBeenCalledWith('QUEUE');
    vi.clearAllMocks();
    await render(SubscriptionPlan.TOB_FREE).refresh();
    const result = render(SubscriptionPlan.TOB_FREE);
    expect(result.writingAssignments).toEqual([]); expect(result.writingQueue).toEqual([]);
    expect(result.writingState).toBe('NOT_INCLUDED');
    expect(api.assignments).not.toHaveBeenCalled(); expect(api.queue).not.toHaveBeenCalled();
  });
  it('does not report an initial or refreshed paid request as zero records before completion', async () => {
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('LOADING');
    let resolveQueue!: (value: { items: unknown[] }) => void;
    api.queue.mockReturnValue(new Promise(resolve => { resolveQueue = resolve; }));
    const pending = render(SubscriptionPlan.TOB_PAID).refreshWriting();
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('LOADING');
    resolveQueue({ items: [] }); await pending;
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('READY');
    expect(render(SubscriptionPlan.TOB_PAID).writingQueue).toEqual([]);
  });
  it('keeps genuine paid zero results distinct from unavailable data', async () => {
    api.assignments.mockResolvedValue({ assignments: [] }); api.queue.mockResolvedValue({ items: [] });
    await render(SubscriptionPlan.TOB_PAID).refresh();
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('READY');
    expect(render(SubscriptionPlan.TOB_PAID).error).toBeNull();
  });
  it('marks a free-to-paid plan change as loading until writing has actually been fetched', async () => {
    await render(SubscriptionPlan.TOB_FREE).refresh();
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('LOADING');
    await render(SubscriptionPlan.TOB_PAID).refresh();
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('READY');
  });
  it('ignores a stale paid response after the user switches to the free plan', async () => {
    let resolveQueue!: (value: { items: unknown[] }) => void;
    api.queue.mockReturnValue(new Promise(resolve => { resolveQueue = resolve; }));
    const oldRequest = render(SubscriptionPlan.TOB_PAID).refreshWriting();
    await render(SubscriptionPlan.TOB_FREE).refresh();
    resolveQueue({ items: [{ id: 'stale-paid-row' }] }); await oldRequest;
    const result = render(SubscriptionPlan.TOB_FREE);
    expect(result.writingState).toBe('NOT_INCLUDED');
    expect(result.writingQueue).toEqual([]); expect(result.loading).toBe(false);
  });
  it('retains paid writing failure as an error rather than masking it with empty success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      api.queue.mockRejectedValue(new Error('paid review queue unavailable'));
      await render(SubscriptionPlan.TOB_PAID).refresh();
      expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('ERROR');
      expect(render(SubscriptionPlan.TOB_PAID).error).toBeNull();
      expect(render(SubscriptionPlan.TOB_PAID).loading).toBe(false);
      expect(api.assignments).toHaveBeenCalledOnce(); expect(api.queue).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });
});

describe('business admin partial recovery', () => {
  it('keeps confirmed base resources usable when only writing fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      api.queue.mockRejectedValue(new Error('synthetic optional writing outage'));
      await render(SubscriptionPlan.TOB_PAID).refresh();
      const result = render(SubscriptionPlan.TOB_PAID);
      expect(result.snapshot).toEqual({ marker: 'confirmed organization' });
      expect(result.settingsSnapshot).toEqual({ marker: 'confirmed settings' });
      expect(result.missionBoard).toEqual({ marker: 'confirmed missions' });
      expect(result.books).toEqual([{ id: 'real-response-book' }]);
      expect(result.error).toBeNull();
      expect(result.loading).toBe(false);
      expect(result.writingState).toBe('ERROR');
    } finally { log.mockRestore(); }
  });
});

describe('business admin isolated writing refresh', () => {
  it('finishes base retrieval while writing is still waiting', async () => {
    let resolveQueue!: (value: { items: unknown[] }) => void;
    api.queue.mockReturnValue(new Promise(resolve => { resolveQueue = resolve; }));
    await render(SubscriptionPlan.TOB_PAID).refresh();
    const result = render(SubscriptionPlan.TOB_PAID);
    expect(result.loading).toBe(false);
    expect(result.snapshot).toEqual({ marker: 'confirmed organization' });
    expect(result.writingState).toBe('LOADING');
    expect(result.error).toBeNull();
    resolveQueue({ items: [] });
    await vi.waitFor(() => expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('READY'));
  });

  it('recovers writing without fetching or clearing confirmed base resources', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      api.queue.mockRejectedValue(new Error('synthetic outage'));
      await render(SubscriptionPlan.TOB_PAID).refresh();
      expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('ERROR');
      vi.clearAllMocks();
      api.queue.mockResolvedValue({ items: [{ id: 'recovered-queue-row' }] });
      await render(SubscriptionPlan.TOB_PAID).refreshWriting();
      const result = render(SubscriptionPlan.TOB_PAID);
      expect(result.writingState).toBe('READY');
      expect(result.writingQueue).toEqual([{ id: 'recovered-queue-row' }]);
      expect(result.snapshot).toEqual({ marker: 'confirmed organization' });
      expect(result.error).toBeNull();
      expect(result.loading).toBe(false);
      expect(api.dashboard).not.toHaveBeenCalled(); expect(api.settings).not.toHaveBeenCalled();
      expect(api.missions).not.toHaveBeenCalled(); expect(api.books).not.toHaveBeenCalled();
      expect(api.assignments).toHaveBeenCalledOnce(); expect(api.queue).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });

  it('does not let an older writing response overwrite a newer recovery', async () => {
    let resolveOld!: (value: { items: unknown[] }) => void;
    api.queue.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    api.queue.mockResolvedValueOnce({ items: [{ id: 'newest-confirmed-row' }] });
    const old = render(SubscriptionPlan.TOB_PAID).refreshWriting();
    await render(SubscriptionPlan.TOB_PAID).refreshWriting();
    resolveOld({ items: [{ id: 'late-stale-row' }] }); await old;
    expect(render(SubscriptionPlan.TOB_PAID).writingQueue).toEqual([{ id: 'newest-confirmed-row' }]);
    expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('READY');
  });

  it('keeps a base-resource failure blocking instead of treating it as a writing-only outage', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      api.settings.mockRejectedValue(new Error('synthetic base settings outage'));
      await render(SubscriptionPlan.TOB_PAID).refresh();
      const result = render(SubscriptionPlan.TOB_PAID);
      expect(result.error).toBe('synthetic base settings outage');
      expect(result.snapshot).toBeNull();
      expect(result.loading).toBe(false);
      await vi.waitFor(() => expect(render(SubscriptionPlan.TOB_PAID).writingState).toBe('READY'));
    } finally { log.mockRestore(); }
  });
});
