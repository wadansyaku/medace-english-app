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
    expect(api.assignments).not.toHaveBeenCalled(); expect(api.queue).not.toHaveBeenCalled();
  });
  it('fetches writing for paid plans and clears old paid collections after a free-plan refresh', async () => {
    await render(SubscriptionPlan.TOB_PAID).refresh();
    expect(render(SubscriptionPlan.TOB_PAID).writingAssignments).toEqual([{ id: 'paid-assignment' }]);
    expect(api.assignments).toHaveBeenCalledWith('organization'); expect(api.queue).toHaveBeenCalledWith('QUEUE');
    vi.clearAllMocks();
    await render(SubscriptionPlan.TOB_FREE).refresh();
    const result = render(SubscriptionPlan.TOB_FREE);
    expect(result.writingAssignments).toEqual([]); expect(result.writingQueue).toEqual([]);
    expect(api.assignments).not.toHaveBeenCalled(); expect(api.queue).not.toHaveBeenCalled();
  });
  it('retains paid writing failure as an error rather than masking it with empty success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      api.queue.mockRejectedValue(new Error('paid review queue unavailable'));
      await render(SubscriptionPlan.TOB_PAID).refresh();
      expect(render(SubscriptionPlan.TOB_PAID).error).toBe('paid review queue unavailable');
      expect(render(SubscriptionPlan.TOB_PAID).loading).toBe(false);
      expect(api.assignments).toHaveBeenCalledOnce(); expect(api.queue).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });
});
