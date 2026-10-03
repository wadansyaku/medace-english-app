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
const api = vi.hoisted(() => ({ assignments: vi.fn(), finalize: vi.fn() }));
vi.mock('../services/writing', () => ({
  listWritingAssignments: api.assignments, finalizeStudentWritingSubmission: api.finalize,
  calculateWritingAssetSha256Base64: vi.fn(), createWritingUploadUrl: vi.fn(),
  getWritingPrintableFeedback: vi.fn(), getStudentWritingSubmissionDetail: vi.fn(), uploadWritingAsset: vi.fn(),
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
});
afterEach(() => vi.restoreAllMocks());

describe('writing assignment acquisition', () => {
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
