import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real controller's asynchronous collection state and real view callbacks.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: new Map<number, () => unknown>() }));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  const changed = (before: unknown[] | undefined, after: unknown[]) => !before || after.some((value, index) => !Object.is(value, before[index]));
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const slot = hooks.cursor++;
    if (changed(hooks.slots[slot]?.deps, deps)) hooks.slots[slot] = { value: factory(), deps };
    return hooks.slots[slot].value;
  };
  const replacements = {
    useState(initial: any) {
      const slot = hooks.cursor++;
      if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [hooks.slots[slot], (next: any) => { hooks.slots[slot] = typeof next === 'function' ? next(hooks.slots[slot]) : next; }];
    },
    useRef(initial: unknown) {
      const slot = hooks.cursor++;
      if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial };
      return hooks.slots[slot];
    },
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useEffect(effect: () => unknown, deps: unknown[]) {
      const slot = hooks.cursor++;
      if (changed(hooks.slots[slot], deps)) { hooks.slots[slot] = deps; hooks.effects.set(slot, effect); }
    },
  };
  return { ...original, ...replacements, default: { ...original.default, ...replacements } };
});
vi.mock('../hooks/useIsMobileViewport', () => ({ default: () => false }));
const api = vi.hoisted(() => ({ capabilities: vi.fn(), inputDraft: vi.fn(), saveDraft: vi.fn(), assignments: vi.fn(), finalize: vi.fn(), hash: vi.fn(), createUpload: vi.fn(), upload: vi.fn() }));
vi.mock('../services/writing', () => ({
  listWritingAssignments: api.assignments, finalizeStudentWritingSubmission: api.finalize,
  calculateWritingAssetSha256Base64: api.hash, createWritingUploadUrl: api.createUpload,
  getWritingPrintableFeedback: vi.fn(), getStudentWritingSubmissionDetail: vi.fn(), uploadWritingAsset: api.upload,
}));
vi.mock('../services/writingAiDrafts', () => ({ getWritingAiCapabilities: api.capabilities, getWritingInputDraft: api.inputDraft, saveWritingInputDraft: api.saveDraft }));
import WritingStudentSection from '../components/WritingStudentSection';
import WritingStudentAssignmentList from '../components/writing/WritingStudentAssignmentList';
import { useWritingStudentController } from '../hooks/useWritingStudentController';
import { UserRole, type UserProfile, type WritingAssignment } from '../types';

const user: UserProfile = { uid: 'synthetic-writing-student', displayName: '合成生徒', email: 'synthetic@example.invalid', role: UserRole.STUDENT };
const assignment = { id: 'synthetic-assignment', studentUid: user.uid, status: 'ISSUED', attemptCount: 0, maxAttempts: 2 } as WritingAssignment;
const render = () => { hooks.cursor = 0; return WritingStudentSection({ user }) as ReactElement; };
const controller = () => { hooks.cursor = 0; return useWritingStudentController(user); };
const elements = (tree: unknown): ReactElement<any>[] => {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...elements((tree as ReactElement<any>).props.children)];
};
const byTestId = (tree: ReactElement, id: string) => elements(tree).find(element => element.props['data-testid'] === id);
const list = (tree: ReactElement) => elements(tree).find(element => element.type === WritingStudentAssignmentList);
const text = (tree: unknown): string => Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree)
  ? text((tree as ReactElement<any>).props.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const settle = async () => {
  let tree = render();
  for (let index = 0; index < 6; index += 1) {
    const effects = [...hooks.effects.values()]; hooks.effects.clear(); effects.forEach(effect => effect());
    await Promise.resolve(); tree = render();
  }
  return tree;
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.effects.clear();
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.assignments.mockResolvedValue({ assignments: [] });
  api.capabilities.mockResolvedValue({ gradingEnabled: true });
  api.inputDraft.mockResolvedValue({ draft: null });
  api.hash.mockResolvedValue('synthetic-hash');
  api.createUpload.mockResolvedValue({ assetId: 'synthetic-asset' });
  api.upload.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('writing assignment acquisition', () => {
  it('keeps failed AI input and reuses the uploaded PDF on retry without duplicate submissions', async () => {
    await settle();
    const file = new File(['%PDF-1.4 synthetic'], 'synthetic.pdf', { type: 'application/pdf' });
    controller().openSubmitDialog(assignment);
    await settle();
    controller().setFiles([file]);
    controller().setManualTranscript('My unchanged draft.');
    const pending = deferred<any>();
    api.finalize.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ submission: { id: 'real-receipt' } });
    const firstController = controller();
    const first = firstController.handleSubmit();
    const duplicate = firstController.handleSubmit();
    firstController.resetSubmitDialog();
    await vi.waitFor(() => expect(api.finalize).toHaveBeenCalledTimes(1));
    pending.reject(new Error('AI処理待ちです。提出は未確定です。'));
    await Promise.all([first, duplicate]);
    expect(controller().files).toEqual([file]);
    expect(controller().manualTranscript).toBe('My unchanged draft.');
    expect(controller().submissionError).toContain('手動確認');
    expect(controller().submitTarget?.id).toBe(assignment.id);
    await controller().handleSubmit();
    expect(api.createUpload).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.finalize).toHaveBeenCalledTimes(2);
    expect(api.finalize.mock.calls[0][0]).toEqual(api.finalize.mock.calls[1][0]);
    expect(controller().submitTarget).toBeNull();
    expect(controller().submissionError).toBeNull();
  });

  it('reuses only completed files after a partial upload fails', async () => {
    await settle();
    const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })];
    controller().openSubmitDialog(assignment);
    await settle();
    controller().setFiles(files);
    api.createUpload.mockResolvedValueOnce({ assetId: 'asset-a' }).mockResolvedValueOnce({ assetId: 'asset-b-failed' }).mockResolvedValueOnce({ assetId: 'asset-b' });
    api.upload.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Upload failed')).mockResolvedValueOnce(undefined);
    api.finalize.mockResolvedValue({ submission: { id: 'real-receipt' } });
    await controller().handleSubmit();
    expect(api.finalize).not.toHaveBeenCalled();
    await controller().handleSubmit();
    expect(api.createUpload.mock.calls.map(([input]) => input.fileName)).toEqual(['a.png', 'b.png', 'b.png']);
    expect(api.finalize).toHaveBeenCalledWith(expect.objectContaining({ assetIds: ['asset-a', 'asset-b'] }));
  });

  it('saves manual input as an unassessed draft with stable retry ID and restores it without an upload', async () => {
    api.capabilities.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false });
    await settle(); controller().openSubmitDialog(assignment); await settle();
    controller().setManualTranscript('My saved manual input.');
    api.saveDraft.mockRejectedValueOnce(new Error('response lost')).mockImplementationOnce(async (request: any) => ({ draft: {
      ...request, revision: 1, assets: [], assessmentStatus: 'UNASSESSED', updatedAt: 1,
    } }));
    const first = controller().handleSubmit();
    await controller().handleSubmit();
    await first;
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(controller().manualTranscript).toBe('My saved manual input.');
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[0][0]).toEqual(api.saveDraft.mock.calls[1][0]);
    expect(api.finalize).not.toHaveBeenCalled(); expect(api.createUpload).not.toHaveBeenCalled();
    expect(controller().draftSavedMessage).toContain('成績・提出は確定していません');
    api.inputDraft.mockResolvedValue({ draft: controller().savedInputDraft });
    controller().resetSubmitDialog(); controller().openSubmitDialog(assignment); await settle();
    expect(controller().manualTranscript).toBe('My saved manual input.');
    expect(controller().files).toEqual([]);
    expect(controller().savedInputDraft?.revision).toBe(1);
  });

  it('keeps restored asset metadata without recreating File objects or uploading them again', async () => {
    api.capabilities.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false });
    const saved = { assignmentId: assignment.id, attemptNo: 1, revision: 2, manualTranscript: '', assetIds: ['saved-image'],
      assets: [{ id: 'saved-image', fileName: 'original.png', mimeType: 'image/png', byteSize: 20 }], updatedAt: 1, assessmentStatus: 'UNASSESSED' };
    api.inputDraft.mockResolvedValue({ draft: saved });
    api.saveDraft.mockResolvedValue({ draft: { ...saved, revision: 3 } });
    await settle(); controller().openSubmitDialog(assignment); await settle();
    expect(controller().files).toEqual([]); expect(controller().savedInputDraft?.assets).toEqual(saved.assets);
    await controller().handleSubmit();
    expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2, assetIds: ['saved-image'] }));
    expect(api.createUpload).not.toHaveBeenCalled(); expect(api.finalize).not.toHaveBeenCalled();
  });

  it('fails closed after draft restoration fails and retains typed input during a read retry', async () => {
    api.capabilities.mockRejectedValue(new Error('capabilities unavailable'));
    api.inputDraft.mockRejectedValueOnce(new Error('draft read unavailable')).mockResolvedValue({ draft: null });
    await settle(); controller().openSubmitDialog(assignment); await settle();
    controller().setManualTranscript('Keep this input.');
    await controller().handleSubmit();
    expect(api.finalize).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled();
    expect(controller().draftLoadError).toContain('復元を確認できません');
    controller().retryDraftLoad(); await settle();
    expect(controller().manualTranscript).toBe('Keep this input.');
    expect(controller().draftLoaded).toBe(true);
    expect(controller().capabilities).toBeNull();
  });

  it('keeps pending and failed acquisition unknown, deduplicates retry and only shows empty after a successful response', async () => {
    const first = deferred<{ assignments: WritingAssignment[] }>();
    api.assignments.mockReturnValueOnce(first.promise);
    let tree = await settle();
    expect(text(tree)).toContain('読込中');
    expect(text(tree)).not.toContain('対応待ちはありません');
    expect(list(tree)).toBeUndefined();
    first.reject(new Error('Synthetic first load failure'));
    tree = await settle();
    expect(text(tree)).toContain('未取得');
    expect(text(tree)).not.toContain('対応待ちはありません');
    expect(list(tree)).toBeUndefined();
    expect(byTestId(tree, 'writing-load-error')).toBeDefined();
    const retry = deferred<{ assignments: WritingAssignment[] }>();
    api.assignments.mockReturnValueOnce(retry.promise);
    const update = byTestId(tree, 'writing-refresh-button')!;
    update.props.onClick(); update.props.onClick();
    tree = await settle();
    expect(api.assignments).toHaveBeenCalledTimes(2);
    expect(text(tree)).toContain('読込中');
    expect(list(tree)).toBeUndefined();
    retry.resolve({ assignments: [] });
    tree = await settle();
    expect(byTestId(tree, 'writing-load-error')).toBeUndefined();
    expect(text(tree)).toContain('対応待ちはありません');
    expect(list(tree)?.props.assignments).toEqual([]);
    expect(renderToStaticMarkup(tree)).toContain('まだ自由英作文課題はありません');
  });

  it('retains confirmed assignments and submit access with an explicit stale warning after refresh fails', async () => {
    api.assignments.mockResolvedValue({ assignments: [assignment] });
    await settle();
    api.assignments.mockRejectedValueOnce(new Error('Synthetic refresh failure'));
    await controller().refresh({ silent: true });
    const tree = await settle();
    expect(text(tree)).toContain('前回取得した課題と件数を表示しています');
    expect(text(tree)).toContain('下書きを保存できます');
    expect(list(tree)?.props.assignments).toEqual([assignment]);
    list(tree)!.props.onOpenSubmit(assignment);
    expect(controller().submitTarget?.id).toBe(assignment.id);
    expect(controller().lastRefreshedAt).not.toBeNull();
  });

  it('clears only the load error after recovery and preserves submission validation feedback and draft', async () => {
    await settle();
    controller().openSubmitDialog(assignment);
    await settle();
    controller().setManualTranscript('合成の未送信答案');
    await controller().handleSubmit();
    const submissionNotice = controller().notice;
    expect(submissionNotice?.tone).toBe('error');
    api.assignments.mockRejectedValueOnce(new Error('Synthetic independent load failure'));
    await controller().refresh({ silent: true });
    expect(controller().loadError).toBe('Synthetic independent load failure');
    expect(controller().notice).toEqual(submissionNotice);
    await controller().refresh({ silent: true });
    expect(controller().loadError).toBeNull();
    expect(controller().notice).toEqual(submissionNotice);
    expect(controller().manualTranscript).toBe('合成の未送信答案');
    expect(controller().submitTarget?.id).toBe(assignment.id);
    expect(api.finalize).not.toHaveBeenCalled();
  });
  it.each([false, true])('restores the saved student manual text after first GET failure unless edited=%s', async edited => {
    api.capabilities.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false });
    const saved = { assignmentId: assignment.id, attemptNo: 1, revision: 1, manualTranscript: 'My persisted text.', assetIds: [], assets: [], assessmentStatus: 'UNASSESSED', updatedAt: 1 };
    api.inputDraft.mockRejectedValueOnce(new Error('503')).mockResolvedValue({ draft: saved });
    await settle(); controller().openSubmitDialog(assignment); await settle();
    if (edited) controller().setManualTranscript('My edited local text.');
    controller().retryDraftLoad(); await settle();
    expect(controller().manualTranscript).toBe(edited ? 'My edited local text.' : saved.manualTranscript);
    api.saveDraft.mockResolvedValue({ draft: { ...saved, revision: 2 } }); await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[0][0].manualTranscript).toBe(edited ? 'My edited local text.' : saved.manualTranscript);
  });
  const pdfReplacement = new File(['%PDF-1.4 replacement'], 'replacement.pdf', { type: 'application/pdf' });
  const prepareReplacement = async () => {
    api.capabilities.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false });
    const saved = { assignmentId: assignment.id, attemptNo: 1, revision: 1, manualTranscript: '', assetIds: ['old-pdf'],
      assets: [{ id: 'old-pdf', fileName: 'old.pdf', mimeType: 'application/pdf', byteSize: 20 }], assessmentStatus: 'UNASSESSED', updatedAt: 1 };
    api.inputDraft.mockResolvedValue({ draft: saved });
    api.createUpload.mockResolvedValue({ assetId: 'replacement' });
    api.saveDraft.mockImplementation(async (request: any) => ({ draft: { ...saved,
      revision: request.expectedRevision + 1, assetIds: request.assetIds, manualTranscript: request.manualTranscript,
      assets: request.assetIds.map((id: string) => ({ id, fileName: pdfReplacement.name, mimeType: pdfReplacement.type, byteSize: pdfReplacement.size })) } }));
    await settle(); controller().openSubmitDialog(assignment); await settle();
    controller().removeSavedAsset('old-pdf'); controller().setFiles([pdfReplacement]);
  };
  it('retires a removed PDF before uploading its replacement and finalizes the next CAS revision', async () => {
    await prepareReplacement(); await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[0][0]).toMatchObject({ expectedRevision: 1, assetIds: [], manualTranscript: '' });
    expect(api.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(api.createUpload.mock.invocationCallOrder[0]);
    expect(api.saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: 2, assetIds: ['replacement'] });
    expect(controller().savedInputDraft?.revision).toBe(3); expect(controller().files).toEqual([]); expect(api.finalize).not.toHaveBeenCalled();
  });
  it('uses the same removal request after an uncertain response and holds the upload until confirmation', async () => {
    await prepareReplacement(); api.saveDraft.mockRejectedValueOnce(new Error('removal response lost'));
    await controller().handleSubmit(); expect(api.createUpload).not.toHaveBeenCalled(); expect(controller().files).toEqual([pdfReplacement]);
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[0][0]).toEqual(api.saveDraft.mock.calls[1][0]);
    expect(api.saveDraft.mock.calls[2][0].expectedRevision).toBe(2);
  });
  it('keeps the confirmed removal revision and reuses the final payload and upload after response loss', async () => {
    await prepareReplacement(); const save = api.saveDraft.getMockImplementation()!;
    api.saveDraft.mockImplementationOnce(save).mockRejectedValueOnce(new Error('final response lost'));
    await controller().handleSubmit(); expect(controller().savedInputDraft?.revision).toBe(2); expect(controller().files).toEqual([pdfReplacement]);
    await controller().handleSubmit();
    expect(api.createUpload).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.saveDraft.mock.calls[1][0]).toEqual(api.saveDraft.mock.calls[2][0]); expect(controller().savedInputDraft?.revision).toBe(3);
  });
  it('keeps replacement files and manual input when upload fails after the removal is saved', async () => {
    await prepareReplacement(); controller().setManualTranscript('Replacement manual input.'); api.upload.mockRejectedValueOnce(new Error('upload failed'));
    await controller().handleSubmit();
    expect(controller().savedInputDraft?.revision).toBe(2); expect(controller().savedInputDraft?.assetIds).toEqual([]);
    expect(controller().manualTranscript).toBe('Replacement manual input.'); expect(controller().files).toEqual([pdfReplacement]);
    expect(controller().draftSavedMessage).toContain('新しいファイルはまだ保存されていません'); expect(api.saveDraft).toHaveBeenCalledTimes(1);
  });
  it('does not upload after a retirement CAS conflict and keeps the new PDF with a reload instruction', async () => {
    await prepareReplacement(); api.saveDraft.mockRejectedValueOnce(new Error('revision conflict'));
    await controller().handleSubmit();
    expect(api.createUpload).not.toHaveBeenCalled(); expect(controller().files).toEqual([pdfReplacement]);
    expect(controller().submissionError).toContain('再取得');
  });
  it('confirms one removal from four saved images before requesting the replacement upload slot', async () => {
    api.capabilities.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false });
    const originalAssets = Array.from({ length: 4 }, (_, index) => ({ id: `image-${index}`, fileName: `${index}.png`, mimeType: 'image/png', byteSize: 20 }));
    const activeIds = new Set(originalAssets.map(asset => asset.id));
    const saved = { assignmentId: assignment.id, attemptNo: 1, revision: 1, manualTranscript: 'My original input.', assetIds: [...activeIds], assets: originalAssets, assessmentStatus: 'UNASSESSED', updatedAt: 1 };
    api.inputDraft.mockResolvedValue({ draft: saved });
    api.createUpload.mockImplementation(async () => { if (activeIds.size >= 4) throw new Error('active quota full'); activeIds.add('new-image'); return { assetId: 'new-image' }; });
    api.saveDraft.mockImplementation(async (request: any) => {
      for (const id of activeIds) if (!request.assetIds.includes(id)) activeIds.delete(id);
      return { draft: { ...saved, revision: request.expectedRevision + 1, assetIds: request.assetIds,
        assets: request.assetIds.map((id: string) => originalAssets.find(asset => asset.id === id) || { id, fileName: 'new.png', mimeType: 'image/png', byteSize: 1 }) } };
    });
    await settle(); controller().openSubmitDialog(assignment); await settle();
    controller().removeSavedAsset('image-0'); controller().setFiles([new File(['a'], 'new.png', { type: 'image/png' })]);
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[0][0].assetIds).toEqual(['image-1', 'image-2', 'image-3']);
    expect(controller().savedInputDraft?.assetIds).toEqual(['image-1', 'image-2', 'image-3', 'new-image']);
    expect(activeIds.size).toBe(4); expect(controller().submissionError).toBeNull(); expect(api.finalize).not.toHaveBeenCalled();
  });
  const prepareFreshDraft = async (kind: 'pdf' | 'images' = 'pdf') => {
    api.capabilities.mockResolvedValue({ state: 'DISABLED', gradingEnabled: false });
    api.inputDraft.mockResolvedValue({ draft: null });
    api.hash.mockResolvedValue('synthetic-hash'); api.upload.mockResolvedValue(undefined);
    const selected = kind === 'pdf'
      ? [new File(['%PDF-1.4 A'], 'a.pdf', { type: 'application/pdf' })]
      : [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })];
    const active = new Set<string>();
    const metadata = new Map<string, { id: string; fileName: string; mimeType: string; byteSize: number }>();
    api.createUpload.mockImplementation(async (request: any) => {
      if (request.mimeType === 'application/pdf' && active.size > 0) throw new Error('active PDF quota full');
      const id = `uploaded-${request.fileName}`;
      active.add(id); metadata.set(id, { id, fileName: request.fileName, mimeType: request.mimeType, byteSize: request.byteSize });
      return { assetId: id, uploadUrl: `https://example.invalid/${id}` };
    });
    api.saveDraft.mockImplementation(async (request: any) => {
      if (request.prepareUpload) for (const id of active) if (!request.assetIds.includes(id)) active.delete(id);
      return { draft: { assignmentId: assignment.id, attemptNo: 1, revision: request.expectedRevision + 1,
        manualTranscript: request.manualTranscript, assetIds: request.assetIds,
        assets: request.assetIds.map((id: string) => metadata.get(id)), assessmentStatus: 'UNASSESSED', updatedAt: 1 } };
    });
    await settle(); controller().openSubmitDialog(assignment); await settle();
    controller().setFiles(selected);
    return { selected, active, metadata };
  };
  it('prepares an initially empty draft before upload and replays the exact uncertain preparation', async () => {
    const { selected } = await prepareFreshDraft();
    const persist = api.saveDraft.getMockImplementation()!;
    let confirmed: any;
    api.saveDraft.mockImplementationOnce(async (request: any) => { confirmed = await persist(request); throw new Error('preparation response lost'); })
      .mockImplementationOnce(async (request: any) => { expect(request).toEqual(api.saveDraft.mock.calls[0][0]); return confirmed; });
    await controller().handleSubmit(); expect(api.createUpload).not.toHaveBeenCalled(); expect(controller().files).toEqual(selected);
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[0][0]).toMatchObject({ expectedRevision: 0, assetIds: [], prepareUpload: true });
    expect(api.saveDraft.mock.calls[2][0]).toMatchObject({ expectedRevision: 1, assetIds: ['uploaded-a.pdf'] });
    expect(controller().savedInputDraft?.revision).toBe(2); expect(controller().submissionError).toBeNull();
  });
  it('retains preparation and completed uploads while replaying an uncertain first-file final save', async () => {
    await prepareFreshDraft(); const persist = api.saveDraft.getMockImplementation()!;
    api.saveDraft.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('final response lost'));
    await controller().handleSubmit(); await controller().handleSubmit();
    expect(api.saveDraft).toHaveBeenCalledTimes(3); expect(api.saveDraft.mock.calls[1][0]).toEqual(api.saveDraft.mock.calls[2][0]);
    expect(api.createUpload).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(1);
    expect(controller().savedInputDraft?.revision).toBe(2);
  });
  it('retires an orphan PDF after failed final save when the selected File is replaced', async () => {
    const { active } = await prepareFreshDraft(); const persist = api.saveDraft.getMockImplementation()!;
    api.saveDraft.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('final failed before commit'));
    await controller().handleSubmit(); expect(active).toEqual(new Set(['uploaded-a.pdf']));
    const next = new File(['%PDF-1.4 B'], 'b.pdf', { type: 'application/pdf' }); controller().setFiles([next]);
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[2][0]).toMatchObject({ expectedRevision: 1, assetIds: [], prepareUpload: true });
    expect(api.saveDraft.mock.calls[2][0].requestId).not.toBe(api.saveDraft.mock.calls[0][0].requestId);
    expect(active).toEqual(new Set(['uploaded-b.pdf']));
    expect(controller().savedInputDraft?.assetIds).toEqual(['uploaded-b.pdf']); expect(controller().submissionError).toBeNull();
  });
  it('reuses issued upload URLs and completed assets after a partial PUT response is lost', async () => {
    const { selected } = await prepareFreshDraft('images');
    api.upload.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('PUT response lost')).mockResolvedValueOnce(undefined);
    await controller().handleSubmit(); expect(controller().files).toEqual(selected); expect(api.saveDraft).toHaveBeenCalledTimes(1);
    await controller().handleSubmit();
    expect(api.createUpload).toHaveBeenCalledTimes(2); expect(api.upload).toHaveBeenCalledTimes(3);
    expect(api.upload.mock.calls[1]).toEqual(api.upload.mock.calls[2]);
    expect(api.saveDraft).toHaveBeenCalledTimes(2);
    expect(controller().savedInputDraft?.assetIds).toEqual(['uploaded-a.png', 'uploaded-b.png']); expect(controller().savedInputDraft?.revision).toBe(2);
  });
  it('saves manual-only edits in the final CAS while retaining completed uploads without another preparation', async () => {
    const { active } = await prepareFreshDraft(); const persist = api.saveDraft.getMockImplementation()!;
    api.saveDraft.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('final failed before commit'));
    await controller().handleSubmit(); controller().setManualTranscript('My updated text.');
    api.saveDraft.mockRejectedValueOnce(new Error('second final response lost'));
    await controller().handleSubmit();
    expect(controller().savedInputDraft?.assetIds).toEqual([]); expect(controller().savedInputDraft?.assets).toEqual([]);
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[2][0]).toMatchObject({ expectedRevision: 1, assetIds: ['uploaded-a.pdf'], manualTranscript: 'My updated text.' });
    expect(api.saveDraft.mock.calls[2][0].prepareUpload).toBeUndefined();
    expect(api.saveDraft.mock.calls[2][0]).toEqual(api.saveDraft.mock.calls[3][0]);
    expect(api.saveDraft.mock.calls.filter(([request]) => request.prepareUpload)).toHaveLength(1);
    expect(controller().savedInputDraft?.assetIds).toEqual(['uploaded-a.pdf']); expect(controller().savedInputDraft?.manualTranscript).toBe('My updated text.');
    expect(active.size).toBe(1); expect(api.createUpload).toHaveBeenCalledTimes(1); expect(controller().submissionError).toBeNull();
  });
  it('replays a successful-but-uncertain PUT after a manual-only edit without retiring its original', async () => {
    const { active } = await prepareFreshDraft();
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockImplementationOnce(async (upload: any) => {
      if (!active.has(upload.assetId)) throw new Error('original retired before PUT receipt');
    });
    await controller().handleSubmit(); controller().setManualTranscript('My text after the lost PUT.'); await controller().handleSubmit();
    expect(api.saveDraft).toHaveBeenCalledTimes(2);
    expect(api.saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: 1, manualTranscript: 'My text after the lost PUT.', assetIds: ['uploaded-a.pdf'] });
    expect(api.createUpload).toHaveBeenCalledTimes(1); expect(api.upload.mock.calls[0]).toEqual(api.upload.mock.calls[1]);
    expect(controller().savedInputDraft?.revision).toBe(2); expect(controller().submissionError).toBeNull();
  });
  it.each([false, true])('renews an expired unconfirmed URL after preparation, previously uploaded=%s', async uploaded => {
    const { active, selected, metadata } = await prepareFreshDraft();
    const record = (id: string, index = 0) => metadata.set(id, { id, fileName: selected[index].name, mimeType: selected[index].type, byteSize: selected[index].size });
    const firstIssued = { assetId: 'uncertain-old', uploadUrl: 'https://example.invalid/old', expiresAt: Date.now() + 60_000 };
    const nextIssued = { assetId: 'confirmed-new', uploadUrl: 'https://example.invalid/new', expiresAt: Date.now() + 120_000 };
    api.createUpload.mockImplementationOnce(async () => { if (uploaded) active.add(firstIssued.assetId); record(firstIssued.assetId); return firstIssued; })
      .mockImplementationOnce(async () => { if (active.size) throw new Error('old quota not retired'); active.add(nextIssued.assetId); record(nextIssued.assetId); return nextIssued; });
    api.upload.mockRejectedValueOnce(new Error(uploaded ? 'successful PUT response lost' : 'PUT never reached server')).mockResolvedValueOnce(undefined);
    await controller().handleSubmit();
    firstIssued.expiresAt = Date.now() - 1;
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: 1, assetIds: [], prepareUpload: true });
    expect(api.saveDraft.mock.invocationCallOrder[1]).toBeLessThan(api.createUpload.mock.invocationCallOrder[1]);
    expect(api.createUpload).toHaveBeenCalledTimes(2); expect(api.upload.mock.calls[1][0]).toEqual(nextIssued);
    expect(controller().savedInputDraft?.assetIds).toEqual(['confirmed-new']); expect(controller().savedInputDraft?.revision).toBe(3); expect(controller().submissionError).toBeNull();
  });
  it('keeps known successful originals when renewing another expired pending image URL', async () => {
    const { active, selected, metadata } = await prepareFreshDraft('images');
    const record = (id: string, index: number) => metadata.set(id, { id, fileName: selected[index].name, mimeType: selected[index].type, byteSize: selected[index].size });
    const first = { assetId: 'image-success', uploadUrl: 'https://example.invalid/first', expiresAt: Date.now() + 60_000 };
    const unknown = { assetId: 'image-uncertain', uploadUrl: 'https://example.invalid/unknown', expiresAt: Date.now() + 60_000 };
    const replacement = { assetId: 'image-replacement', uploadUrl: 'https://example.invalid/replacement', expiresAt: Date.now() + 120_000 };
    api.createUpload.mockImplementationOnce(async () => { active.add(first.assetId); record(first.assetId, 0); return first; })
      .mockImplementationOnce(async () => { active.add(unknown.assetId); record(unknown.assetId, 1); return unknown; })
      .mockImplementationOnce(async () => { expect(active).toEqual(new Set([first.assetId])); active.add(replacement.assetId); record(replacement.assetId, 1); return replacement; });
    api.upload.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('second image PUT response lost')).mockResolvedValueOnce(undefined);
    await controller().handleSubmit(); first.expiresAt = Date.now() - 1; unknown.expiresAt = Date.now() - 1;
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: 1, prepareUpload: true, assetIds: [first.assetId] });
    expect(api.createUpload).toHaveBeenCalledTimes(3); expect(api.upload).toHaveBeenCalledTimes(3);
    expect(controller().savedInputDraft?.assetIds).toEqual([first.assetId, replacement.assetId]); expect(controller().submissionError).toBeNull();
  });

  it('clears the old save error after a successful conflict recovery while keeping edited text and Files', async () => {
    const { selected } = await prepareFreshDraft('images');
    controller().setManualTranscript('My retained edited text.');
    api.saveDraft.mockRejectedValueOnce(new Error('409 revision conflict'));
    await controller().handleSubmit(); expect(controller().submissionError).toContain('revision conflict');
    api.inputDraft.mockResolvedValue({ draft: { assignmentId: assignment.id, attemptNo: 1, revision: 4,
      manualTranscript: 'Text changed in another tab.', assetIds: [], assets: [], assessmentStatus: 'UNASSESSED', updatedAt: 2 } });
    controller().retryDraftLoad(); await settle();
    expect(controller().submissionError).toBeNull(); expect(controller().manualTranscript).toBe('My retained edited text.');
    expect(controller().files).toEqual(selected); expect(controller().savedInputDraft?.revision).toBe(4);
    expect(controller().draftSavedMessage).toContain('編集中の本文は保持');
    await controller().handleSubmit();
    expect(api.saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: 4, prepareUpload: true, manualTranscript: 'My retained edited text.' });
    expect(controller().savedInputDraft?.revision).toBe(6); expect(controller().submissionError).toBeNull();
  });

  it.each([1, 4])('confirms a lost successful PUT before preparing after restoring draft revision %s', async revision => {
    const { selected, active } = await prepareFreshDraft();
    controller().setManualTranscript('My text before the upload.');
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockImplementationOnce(async (issued: any, file: File) => {
      expect(file).toBe(selected[0]);
      if (!active.has(issued.assetId)) throw new Error('retired before receipt confirmation');
    });
    await controller().handleSubmit(); controller().setManualTranscript('My local edit after the lost response.');
    api.inputDraft.mockResolvedValue({ draft: { assignmentId: assignment.id, attemptNo: 1, revision,
      manualTranscript: 'Saved elsewhere.', assetIds: [], assets: [], assessmentStatus: 'UNASSESSED', updatedAt: 2 } });
    controller().retryDraftLoad(); await settle();
    expect(controller().manualTranscript).toBe('My local edit after the lost response.'); expect(controller().files).toEqual(selected);
    await controller().handleSubmit();
    expect(api.upload.mock.invocationCallOrder[1]).toBeLessThan(api.saveDraft.mock.invocationCallOrder[1]);
    expect(api.upload.mock.calls[0]).toEqual(api.upload.mock.calls[1]); expect(api.createUpload).toHaveBeenCalledTimes(1);
    expect(api.saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: revision, prepareUpload: true, assetIds: ['uploaded-a.pdf'] });
    expect(controller().savedInputDraft?.revision).toBe(revision + 2); expect(controller().savedInputDraft?.assetIds).toEqual(['uploaded-a.pdf']);
    expect(controller().savedInputDraft?.manualTranscript).toBe('My local edit after the lost response.'); expect(controller().submissionError).toBeNull();
    expect(active).toEqual(new Set(['uploaded-a.pdf']));
  });
  it('does not retire or save after restored pending PUT confirmation fails and recovers with the same File', async () => {
    const { selected, active } = await prepareFreshDraft();
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockRejectedValueOnce(new Error('confirmation unavailable')).mockResolvedValueOnce(undefined);
    await controller().handleSubmit();
    api.inputDraft.mockResolvedValue({ draft: controller().savedInputDraft }); controller().retryDraftLoad(); await settle();
    await controller().handleSubmit(); expect(api.saveDraft).toHaveBeenCalledTimes(1); expect(controller().files).toEqual(selected);
    expect(active).toEqual(new Set(['uploaded-a.pdf'])); expect(controller().submissionError).toContain('confirmation unavailable');
    await controller().handleSubmit();
    expect(api.createUpload).toHaveBeenCalledTimes(1); expect(api.upload.mock.calls[0]).toEqual(api.upload.mock.calls[2]);
    expect(api.saveDraft.mock.calls[1][0].assetIds).toEqual(['uploaded-a.pdf']); expect(controller().savedInputDraft?.revision).toBe(3); expect(controller().submissionError).toBeNull();
  });
  it('treats a restored asset matching the pending File as one original and confirms it before preparation', async () => {
    const { selected, active, metadata } = await prepareFreshDraft();
    api.upload.mockRejectedValueOnce(new Error('successful PUT response lost')).mockImplementationOnce(async (issued: any) => {
      if (!active.has(issued.assetId)) throw new Error('retired before receipt confirmation');
    });
    await controller().handleSubmit();
    api.inputDraft.mockResolvedValue({ draft: { assignmentId: assignment.id, attemptNo: 1, revision: 4,
      manualTranscript: '', assetIds: ['uploaded-a.pdf'], assets: [metadata.get('uploaded-a.pdf')], assessmentStatus: 'UNASSESSED', updatedAt: 2 } });
    controller().retryDraftLoad(); await settle(); expect(controller().files).toEqual(selected);
    await controller().handleSubmit();
    expect(api.createUpload).toHaveBeenCalledTimes(1); expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.saveDraft.mock.calls[1][0]).toMatchObject({ expectedRevision: 4, prepareUpload: true, assetIds: ['uploaded-a.pdf'] });
    expect(controller().savedInputDraft?.assetIds).toEqual(['uploaded-a.pdf']); expect(controller().savedInputDraft?.revision).toBe(6); expect(controller().submissionError).toBeNull();
  });

});
