import { describe, expect, it, vi } from 'vitest';
import { createDashboardResource } from '../utils/dashboardResource';
import type { DashboardSnapshot } from '../types';

const snapshot = (dueCount: number): DashboardSnapshot => ({
  dueCount,
  officialBooks: [],
  myBooks: [],
  progressMap: {},
  learningPlan: null,
  learningPreference: null,
  primaryMission: null,
  weaknessProfile: null,
  leaderboard: [],
  masteryDist: { new: 0, learning: 0, review: 0, graduated: 0, total: 0 },
  activityLogs: [],
  motivationSnapshot: null,
  coachNotifications: [],
  accountOverview: null,
  commercialRequests: [],
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

describe('dashboard resource', () => {
  it('keeps an initial failure unknown and recovers with an explicitly requested retry', async () => {
    const load = vi.fn<() => Promise<DashboardSnapshot>>()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(snapshot(4));
    const resource = createDashboardResource(load);
    await resource.refresh();
    expect(resource.getSnapshot()).toEqual({ snapshot: null, loading: false, error: 'initial', updatedAt: null });
    expect(load).toHaveBeenCalledTimes(1);
    await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ snapshot: { dueCount: 4 }, loading: false, error: null });
    expect(resource.getSnapshot().updatedAt).not.toBeNull();
  });

  it('accepts a confirmed empty snapshot as loaded data', async () => {
    const resource = createDashboardResource(async () => snapshot(0));
    await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({ snapshot: { dueCount: 0 }, loading: false, error: null });
  });

  it('retains the last confirmed snapshot and its timestamp when refresh fails', async () => {
    const load = vi.fn<() => Promise<DashboardSnapshot>>()
      .mockResolvedValueOnce(snapshot(7))
      .mockRejectedValueOnce(new Error('offline'));
    const resource = createDashboardResource(load);
    await resource.refresh();
    const confirmed = resource.getSnapshot();
    await resource.refresh();
    expect(resource.getSnapshot()).toEqual({ ...confirmed, error: 'refresh' });
  });

  it('ignores an old success after a newer request has completed', async () => {
    const old = deferred<DashboardSnapshot>();
    const current = deferred<DashboardSnapshot>();
    const load = vi.fn<() => Promise<DashboardSnapshot>>()
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const resource = createDashboardResource(load);
    const first = resource.refresh();
    const second = resource.refresh();
    current.resolve(snapshot(9));
    await second;
    old.resolve(snapshot(2));
    await first;
    expect(resource.getSnapshot().snapshot?.dueCount).toBe(9);
  });

  it('ignores an old error while the current request is still loading', async () => {
    const old = deferred<DashboardSnapshot>();
    const current = deferred<DashboardSnapshot>();
    const load = vi.fn<() => Promise<DashboardSnapshot>>()
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const resource = createDashboardResource(load);
    const first = resource.refresh();
    const second = resource.refresh();
    old.reject(new Error('old request'));
    await first;
    expect(resource.getSnapshot()).toMatchObject({ loading: true, error: null });
    current.resolve(snapshot(9));
    await second;
  });

  it('cancels publication when its account leaves the screen', async () => {
    const pending = deferred<DashboardSnapshot>();
    const resource = createDashboardResource(() => pending.promise);
    const listener = vi.fn();
    resource.subscribe(listener);
    const request = resource.refresh();
    listener.mockClear();
    resource.cancel();
    pending.resolve(snapshot(12));
    await request;
    expect(resource.getSnapshot().snapshot).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not let an older read undo a confirmed local mutation', async () => {
    const pending = deferred<DashboardSnapshot>();
    const load = vi.fn<() => Promise<DashboardSnapshot>>()
      .mockResolvedValueOnce(snapshot(3)).mockReturnValueOnce(pending.promise);
    const resource = createDashboardResource(load);
    await resource.refresh();
    const request = resource.refresh();
    resource.update((previous) => ({ ...previous, dueCount: 8 }));
    pending.resolve(snapshot(3));
    await request;
    expect(resource.getSnapshot()).toMatchObject({ snapshot: { dueCount: 8 }, loading: false });
  });

  it('does not load data without an account', async () => {
    const load = vi.fn(async () => snapshot(1));
    const resource = createDashboardResource(load, false);
    await resource.refresh();
    expect(load).not.toHaveBeenCalled();
    expect(resource.getSnapshot()).toMatchObject({ snapshot: null, loading: false, updatedAt: null });
  });
});
