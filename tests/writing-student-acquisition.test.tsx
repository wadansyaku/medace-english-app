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
const api = vi.hoisted(() => ({ assignments: vi.fn(), finalize: vi.fn(), hash: vi.fn(), createUpload: vi.fn(), upload: vi.fn() }));
vi.mock('../services/writing', () => ({
  listWritingAssignments: api.assignments, finalizeStudentWritingSubmission: api.finalize,
  calculateWritingAssetSha256Base64: api.hash, createWritingUploadUrl: api.createUpload,
  getWritingPrintableFeedback: vi.fn(), getStudentWritingSubmissionDetail: vi.fn(), uploadWritingAsset: api.upload,
}));
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
    expect(text(tree)).toContain('提出できます');
    expect(list(tree)?.props.assignments).toEqual([assignment]);
    list(tree)!.props.onOpenSubmit(assignment);
    expect(controller().submitTarget?.id).toBe(assignment.id);
    expect(controller().lastRefreshedAt).not.toBeNull();
  });

  it('clears only the load error after recovery and preserves submission validation feedback and draft', async () => {
    await settle();
    controller().openSubmitDialog(assignment);
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
});
