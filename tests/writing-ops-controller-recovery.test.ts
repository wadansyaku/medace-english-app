import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import type { WritingAssignment } from '../types';

const harness = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0,
  effects: new Map<number, () => void | (() => void)>(),
  cleanups: new Map<number, () => void>(),
}));
vi.mock('react', () => {
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = harness.cursor++;
    const old = harness.slots[index];
    if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
      harness.slots[index] = { value: factory(), deps };
    }
    return harness.slots[index].value;
  };
  return {
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = initial;
      return [harness.slots[index], (next: any) => {
        harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = harness.cursor++;
      const old = harness.slots[index] as unknown[] | undefined;
      if (!old || deps.some((dep, i) => !Object.is(dep, old[i]))) {
        harness.slots[index] = deps;
        harness.effects.set(index, effect);
      }
    },
  };
});
const api = vi.hoisted(() => ({
  students: vi.fn(), templates: vi.fn(), assignments: vi.fn(), queue: vi.fn(), detail: vi.fn(),
  approve: vi.fn(), revision: vi.fn(), complete: vi.fn(), generate: vi.fn(), issue: vi.fn(),
  hash: vi.fn(), createUpload: vi.fn(), upload: vi.fn(), finalize: vi.fn(),
}));
vi.mock('../services/workspace', () => ({ workspaceService: { getAllStudentsProgress: api.students } }));
vi.mock('../services/writing', () => ({
  listWritingTemplates: api.templates, listWritingAssignments: api.assignments, listWritingReviewQueue: api.queue,
  getStaffWritingSubmissionDetail: api.detail, approveWritingReturn: api.approve,
  requestWritingRevision: api.revision, completeWritingAssignment: api.complete,
  generateWritingAssignment: api.generate, issueWritingAssignment: api.issue,
  calculateWritingAssetSha256Base64: api.hash, createWritingUploadUrl: api.createUpload,
  uploadWritingAsset: api.upload, finalizeStaffWritingSubmission: api.finalize,
}));
import { useWritingOpsController } from '../hooks/useWritingOpsController';

const assignment = { id: 'assignment-A', studentUid: 'A', studentName: '合成生徒A', status: 'ISSUED', attemptCount: 0, maxAttempts: 2 } as WritingAssignment;
const detail = (id: string): WritingSubmissionDetailResponse => ({
  assignment,
  submission: { id, evaluations: [{ id: `evaluation-${id}` }], teacherReview: null },
} as unknown as WritingSubmissionDetailResponse);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const render = () => { harness.cursor = 0; return useWritingOpsController(); };
const flushEffects = () => {
  const effects = [...harness.effects.entries()];
  harness.effects.clear();
  for (const [index, effect] of effects) {
    harness.cleanups.get(index)?.();
    const cleanup = effect();
    if (cleanup) harness.cleanups.set(index, cleanup);
    else harness.cleanups.delete(index);
  }
};
const settle = async () => {
  for (let i = 0; i < 6; i += 1) { render(); flushEffects(); await Promise.resolve(); }
  return render();
};
beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects.clear(); harness.cleanups.clear();
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.templates.mockResolvedValue({ templates: [] });
  api.students.mockResolvedValue([]);
  api.assignments.mockResolvedValue({ assignments: [assignment] });
  api.queue.mockImplementation(async (tab: string) => ({ items: tab === 'QUEUE' ? [{ submissionId: 'A' }, { submissionId: 'B' }] : [] }));
  api.detail.mockImplementation(async (id: string) => detail(id));
  api.approve.mockImplementation(async (id: string) => detail(id));
  api.hash.mockResolvedValue('synthetic-hash');
  api.createUpload.mockResolvedValue({ assetId: 'synthetic-asset' });
  api.upload.mockResolvedValue(undefined);
  api.finalize.mockResolvedValue(detail('A'));
  api.generate.mockResolvedValue(assignment);
});
afterEach(() => { harness.cleanups.forEach((cleanup) => cleanup()); vi.restoreAllMocks(); });

describe('writing operations recover without changing the pending target', () => {
  it('keeps initial acquisition unknown, retries it, and preserves a confirmed snapshot on a later failure', async () => {
    api.templates.mockRejectedValueOnce(new Error('合成取得失敗'));
    let controller = await settle();
    expect(controller.loading).toBe(false);
    expect(controller.hasData).toBe(false);
    expect(controller.loadError).toBe('合成取得失敗');
    await controller.refresh();
    controller = await settle();
    expect(controller.hasData).toBe(true);
    expect(controller.loadError).toBeNull();
    api.students.mockRejectedValueOnce(new Error('更新できません'));
    await controller.refresh();
    controller = await settle();
    expect(controller.hasData).toBe(true);
    expect(controller.assignments).toEqual([assignment]);
    expect(controller.loadError).toBe('更新できません');
  });

  it('rejects a retained A handler in the same tick B is selected, and retries B after detail failure', async () => {
    await settle();
    render().setTab('QUEUE');
    let controller = await settle();
    expect(controller.detail?.submission.id).toBe('A');
    const pending = deferred<WritingSubmissionDetailResponse>();
    api.detail.mockImplementationOnce(() => pending.promise);
    const oldApprove = controller.handleApprove;
    controller.setSelectedSubmissionId('B');
    await oldApprove();
    expect(api.approve).not.toHaveBeenCalled();
    controller = await settle();
    expect(controller.detail).toBeNull();
    expect(controller.detailLoading).toBe(true);
    pending.reject(new Error('答案B取得失敗'));
    controller = await settle();
    expect(controller.detailError).toBe('答案B取得失敗');
    await controller.handleApprove();
    expect(api.approve).not.toHaveBeenCalled();
    controller.retryDetail();
    controller = await settle();
    expect(controller.detail?.submission.id).toBe('B');
    await controller.handleApprove();
    expect(api.approve).toHaveBeenCalledWith('B', expect.any(Object));
  });

  it('blocks duplicate scanner submit, closing and late input events, then preserves the failed source for retry', async () => {
    await settle();
    const files = [new File(['%PDF-1.4 synthetic'], 'synthetic-A.pdf', { type: 'application/pdf' })];
    render().setScannerTarget(assignment);
    render().setScannerFiles(files);
    render().setScannerManualTranscript('補助文A');
    const pending = deferred<WritingSubmissionDetailResponse>();
    api.finalize.mockReturnValueOnce(pending.promise);
    const controller = render();
    const first = controller.handleScannerSubmit();
    const duplicate = controller.handleScannerSubmit();
    controller.setScannerFiles([new File(['B'], 'B.pdf', { type: 'application/pdf' })]);
    controller.setScannerManualTranscript('補助文B');
    controller.resetScanner();
    expect(render().scannerFiles).toEqual(files);
    expect(render().scannerManualTranscript).toBe('補助文A');
    expect(render().scannerTarget?.id).toBe(assignment.id);
    await vi.waitFor(() => expect(api.finalize).toHaveBeenCalledTimes(1));
    pending.reject(new Error('合成提出失敗'));
    await Promise.all([first, duplicate]);
    expect(render().scannerError).toBe('合成提出失敗');
    expect(render().scannerFiles).toEqual(files);
    expect(render().scannerManualTranscript).toBe('補助文A');
    await render().handleScannerSubmit();
    expect(api.finalize).toHaveBeenCalledTimes(2);
    expect(api.finalize.mock.calls.map(([input]) => input.manualTranscript)).toEqual(['補助文A', '補助文A']);
    expect(render().scannerTarget).toBeNull();
  });

  it('keeps one captured generation draft through duplicate events and delayed failure', async () => {
    await settle();
    render().setSelectedStudentUid('A'); render().setSelectedTemplateId('template');
    render().setTopicHint('テーマA'); render().setNotes('メモA');
    const pending = deferred<WritingAssignment>();
    api.generate.mockReturnValueOnce(pending.promise);
    const controller = render();
    const first = controller.handleGenerate();
    const duplicate = controller.handleGenerate();
    controller.setSelectedStudentUid('B'); controller.setTopicHint('テーマB'); controller.setNotes('メモB');
    controller.setTab('QUEUE');
    expect(render().selectedStudentUid).toBe('A');
    expect(render().topicHint).toBe('テーマA'); expect(render().notes).toBe('メモA');
    expect(render().tab).toBe('CREATE');
    expect(api.generate).toHaveBeenCalledTimes(1);
    pending.reject(new Error('合成生成失敗'));
    await Promise.all([first, duplicate]);
    expect(render().notes).toBe('メモA');
    expect(render().busyAction).toBeNull();
    await render().handleGenerate();
    expect(api.generate).toHaveBeenLastCalledWith({ studentUid: 'A', templateId: 'template', topicHint: 'テーマA', notes: 'メモA' });
  });

  it('reflects completion in the same selected history detail without refetching it', async () => {
    const returned = { ...assignment, status: 'RETURNED' } as WritingAssignment;
    const completed = { ...returned, status: 'COMPLETED' } as WritingAssignment;
    api.assignments.mockResolvedValue({ assignments: [returned] });
    api.queue.mockResolvedValue({ items: [{ submissionId: 'A' }] });
    api.detail.mockResolvedValue({ ...detail('A'), assignment: returned });
    api.complete.mockResolvedValue(completed);
    await settle();
    render().setTab('HISTORY');
    let controller = await settle();
    expect(controller.detail?.assignment.status).toBe('RETURNED');
    api.assignments.mockResolvedValue({ assignments: [completed] });
    await controller.handleComplete();
    controller = await settle();
    expect(controller.selectedSubmissionId).toBe('A');
    expect(controller.detail?.assignment.status).toBe('COMPLETED');
    expect(controller.assignments[0].status).toBe('COMPLETED');
    expect(api.detail).toHaveBeenCalledTimes(1);
  });

  it('does not apply a mismatched completion response to the selected assignment', async () => {
    const returned = { ...assignment, status: 'RETURNED' } as WritingAssignment;
    api.queue.mockResolvedValue({ items: [{ submissionId: 'A' }] });
    api.detail.mockResolvedValue({ ...detail('A'), assignment: returned });
    api.complete.mockResolvedValue({ ...returned, id: 'assignment-B', status: 'COMPLETED' });
    await settle();
    render().setTab('HISTORY');
    const controller = await settle();
    await controller.handleComplete();
    expect(render().detail?.assignment).toEqual(returned);
  });

  it('ignores a late completion response after history reconciliation selects another answer', async () => {
    const returned = { ...assignment, status: 'RETURNED' } as WritingAssignment;
    const returnedB = { ...returned, id: 'assignment-B' };
    api.queue.mockResolvedValue({ items: [{ submissionId: 'A' }] });
    api.detail.mockImplementation(async (id: string) => ({ ...detail(id), assignment: id === 'A' ? returned : returnedB }));
    const pending = deferred<WritingAssignment>();
    api.complete.mockReturnValueOnce(pending.promise);
    await settle();
    render().setTab('HISTORY');
    const controller = await settle();
    const completion = controller.handleComplete();
    api.queue.mockResolvedValue({ items: [{ submissionId: 'B' }] });
    await controller.refresh();
    await settle();
    expect(render().detail?.submission.id).toBe('B');
    pending.resolve({ ...returned, status: 'COMPLETED' } as WritingAssignment);
    await completion;
    await settle();
    expect(render().detail?.submission.id).toBe('B');
    expect(render().detail?.assignment).toEqual(returnedB);
  });
});
