import { describe, expect, it, vi } from 'vitest';
import type { StudentSummary, WritingAssignment, WritingQueueItem } from '../types';
import { StudentRiskLevel } from '../types';

vi.mock('../services/workspace', () => ({ workspaceService: {} }));
vi.mock('../services/writing', () => ({
  listWritingAssignments: vi.fn(),
  listWritingReviewQueue: vi.fn(),
}));
import { createInstructorDashboardResource } from '../hooks/useInstructorDashboardData';

const student: StudentSummary = {
  uid: 'synthetic-student',
  name: 'デモ生徒',
  email: 'student@example.invalid',
  totalLearned: 0,
  totalAttempts: 0,
  lastActive: 0,
  riskLevel: StudentRiskLevel.WARNING,
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const loaders = () => ({
  students: vi.fn<() => Promise<StudentSummary[]>>().mockResolvedValue([student]),
  assignments: vi.fn<() => Promise<WritingAssignment[]>>().mockResolvedValue([]),
  queue: vi.fn<() => Promise<WritingQueueItem[]>>().mockResolvedValue([]),
});

describe('instructor workspace acquisition', () => {
  it('keeps failed collections unknown while accepting independently confirmed empty data', async () => {
    const load = loaders();
    load.students.mockRejectedValue(new Error('offline'));
    load.queue.mockRejectedValue(new Error('offline'));
    const resource = createInstructorDashboardResource(load);
    await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({
      students: null,
      writingAssignments: [],
      writingQueue: null,
      loading: false,
      updatedAt: null,
    });
    expect(resource.getSnapshot().errors.students).toBeTruthy();
    expect(resource.getSnapshot().errors.assignments).toBeNull();
    load.students.mockResolvedValue([]);
    load.queue.mockResolvedValue([]);
    await resource.refresh();
    expect(resource.getSnapshot()).toMatchObject({
      students: [],
      writingAssignments: [],
      writingQueue: [],
      errors: { students: null, assignments: null, queue: null },
    });
    expect(resource.getSnapshot().updatedAt).not.toBeNull();
  });

  it('continues student follow-up when writing fails', async () => {
    const load = loaders();
    load.assignments.mockRejectedValue(new Error('writing unavailable'));
    const resource = createInstructorDashboardResource(load);
    await resource.refresh();
    expect(resource.getSnapshot().students).toEqual([student]);
    expect(resource.getSnapshot().writingAssignments).toBeNull();
    expect(resource.getSnapshot().errors.students).toBeNull();
  });

  it('retains confirmed data and its timestamp when refreshing fails', async () => {
    const load = loaders();
    const resource = createInstructorDashboardResource(load);
    await resource.refresh();
    const confirmed = resource.getSnapshot();
    load.students.mockRejectedValue(new Error('offline'));
    await resource.refresh();
    expect(resource.getSnapshot().students).toEqual(confirmed.students);
    expect(resource.getSnapshot().updatedAt).toBe(confirmed.updatedAt);
    expect(resource.getSnapshot().errors.students).toBeTruthy();
  });

  it('coalesces repeated refresh clicks', async () => {
    const load = loaders();
    const pending = deferred<StudentSummary[]>();
    load.students.mockReturnValue(pending.promise);
    const resource = createInstructorDashboardResource(load);
    const first = resource.refresh();
    const second = resource.refresh();
    expect(second).toBe(first);
    pending.resolve([student]);
    await first;
    expect(load.students).toHaveBeenCalledTimes(1);
  });

  it('cannot publish an old account result after cancellation', async () => {
    const load = loaders();
    const pending = deferred<StudentSummary[]>();
    load.students.mockReturnValueOnce(pending.promise);
    const resource = createInstructorDashboardResource(load);
    const oldRequest = resource.refresh();
    resource.cancel();
    load.students.mockResolvedValue([]);
    await resource.refresh();
    pending.resolve([student]);
    await oldRequest;
    expect(resource.getSnapshot().students).toEqual([]);
  });

  it('does not attempt workspace calls when organization APIs are unavailable', async () => {
    const load = loaders();
    const resource = createInstructorDashboardResource(load, false);
    await resource.refresh();
    expect(load.students).not.toHaveBeenCalled();
    expect(load.assignments).not.toHaveBeenCalled();
    expect(resource.getSnapshot().students).toBeNull();
    expect(resource.getSnapshot().errors.students).toContain('Cloudflare');
  });

  it('starts a fresh read after a confirmed mutation instead of reusing an older request', async () => {
    const load = loaders();
    const resource = createInstructorDashboardResource(load);
    await resource.refresh();
    const pending = deferred<StudentSummary[]>();
    load.students.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([]);
    const oldRead = resource.refresh();
    await resource.refreshAfterMutation();
    expect(resource.getSnapshot().students).toEqual([]);
    pending.resolve([student]);
    await oldRead;
    expect(resource.getSnapshot().students).toEqual([]);
    expect(load.students).toHaveBeenCalledTimes(3);
  });
});
