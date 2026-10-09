import React, { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  const hooks = {
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.slots[index], (next: unknown) => {
        harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next;
      }];
    },
    useEffect: () => {},
    useCallback: (callback: unknown) => callback,
  };
  return { ...original, ...hooks, default: { ...original.default, ...hooks } };
});

import PhrasebookCreateModal from '../components/dashboard/PhrasebookCreateModal';
import StudentDashboardModals from '../components/dashboard/StudentDashboardModals';
import { UserRole } from '../types';
import { ApiError } from '../services/apiClient';
import { createPersonalDraftRow, emptyPersonalWordbookDraft, readPersonalWordbookDraft, writePersonalWordbookDraft } from '../shared/personalWordbookDraft';
import PersonalWordbookEditor from '../components/dashboard/PersonalWordbookEditor';
import type { CatalogImportResult } from '../contracts/storage';

type Props = React.ComponentProps<typeof PhrasebookCreateModal>;
type Node = ReactElement<Record<string, any>>;
const nodes = (value: unknown): Node[] => {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
};
const find = (tree: Node, predicate: (node: Node) => boolean) => {
  const node = nodes(tree).find(predicate);
  if (!node) throw new Error('Expected modal control was not rendered');
  return node;
};
const byId = (tree: Node, id: string) => find(tree, (node) => node.props.id === id);
const submit = (tree: Node) => find(tree, (node) => node.props['data-testid'] === 'phrasebook-create-submit');
const savedResult: CatalogImportResult = { importedBookIds: ['actual-server-book-id'], importedBookCount: 1, importedWordCount: 1, skippedRowCount: 0, warnings: [] };
const deferred = () => {
  let resolve!: (value: CatalogImportResult) => void; let reject!: (error: Error) => void;
  const promise = new Promise<CatalogImportResult>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const fixture = (overrides: Partial<Props> = {}) => {
  writePersonalWordbookDraft({ ...emptyPersonalWordbookDraft('synthetic-student'), title: '教材A', rows: [createPersonalDraftRow({ word: 'plant', definition: '植物' })] });
  const handlers = { onClose: vi.fn(), onStartStudy: vi.fn(), onCreate: vi.fn<Props['onCreate']>().mockResolvedValue(savedResult) };
  const render = () => { harness.cursor = 0; return PhrasebookCreateModal({ open: true, ownerUid: 'synthetic-student', creating: false, canUseSelectedCreateMode: true, currentPlanLabel: '合成プラン', ...handlers, ...overrides }) as Node; };
  return { handlers, render };
};
const confirm = (f: ReturnType<typeof fixture>) => { submit(f.render()).props.onClick(); return f.render(); };
const text = (tree: Node) => JSON.stringify(tree, (_key, value) => typeof value === 'function' ? undefined : value);
beforeEach(() => {
  harness.slots = []; harness.cursor = 0;
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('direct My wordbook creation and immutable receipt recovery', () => {
  it('requires both fields in the current row and does not save before confirmation', () => {
    const f = fixture(); const tree = f.render();
    find(tree, node => node.type === PersonalWordbookEditor).props.onChange([createPersonalDraftRow({ word: 'unfinished', definition: '' })]);
    submit(f.render()).props.onClick();
    expect(text(f.render())).toContain('単語と意味を両方'); expect(f.handlers.onCreate).not.toHaveBeenCalled();
    find(f.render(), node => node.type === PersonalWordbookEditor).props.onChange([createPersonalDraftRow({ word: 'plant', definition: '植物' })]);
    expect(text(confirm(f))).toContain('保存する内容を確認'); expect(f.handlers.onCreate).not.toHaveBeenCalled();
  });
  it('blocks duplicate submit, edits and every close path synchronously while the save is pending', async () => {
    const save = deferred(); const f = fixture(); f.handlers.onCreate.mockReturnValue(save.promise);
    const editing = f.render(); const confirmed = confirm(f); submit(confirmed).props.onClick(); submit(confirmed).props.onClick();
    byId(editing, 'phrasebook-create-book-title').props.onChange({ target: { value: 'B' } });
    find(editing, node => node.type === PersonalWordbookEditor).props.onChange([createPersonalDraftRow({ word: 'B', definition: 'B' })]);
    editing.props.onClose(); confirmed.props.onClose();
    nodes(confirmed).filter(node => node.type === 'button' && node.props['aria-label'] === '閉じる').forEach(node => node.props.onClick());
    expect(f.handlers.onCreate).toHaveBeenCalledTimes(1); expect(f.handlers.onClose).not.toHaveBeenCalled();
    expect(readPersonalWordbookDraft('synthetic-student').title).toBe('教材A');
    expect(readPersonalWordbookDraft('synthetic-student').rows[0].word).toBe('plant');
    const pending = f.render(); expect(pending.props.closeOnOverlayClick).toBe(false); expect(submit(pending).props.disabled).toBe(true);
    save.resolve(savedResult); await vi.waitFor(() => expect(text(f.render())).toContain('単語帳を保存しました'));
  });
  it('freezes an ambiguous reply and retries the exact ID/payload rather than accepting edits', async () => {
    const f = fixture(); f.handlers.onCreate.mockRejectedValueOnce(new Error('response lost'));
    submit(confirm(f)).props.onClick(); await vi.waitFor(() => expect(text(f.render())).toContain('response lost'));
    const first = f.handlers.onCreate.mock.calls[0][0]; const failed = f.render();
    expect(text(failed)).toContain('保存を再確認'); expect(nodes(failed).some(node => node.type === PersonalWordbookEditor)).toBe(false);
    expect(readPersonalWordbookDraft('synthetic-student').pendingRequest).toEqual(first);
    submit(failed).props.onClick(); await vi.waitFor(() => expect(text(f.render())).toContain('単語帳を保存しました'));
    expect(f.handlers.onCreate.mock.calls[1][0]).toEqual(first);
  });
  it('recovers an unconfirmed request after reopening with the same immutable creation ID', async () => {
    const f = fixture(); f.handlers.onCreate.mockRejectedValueOnce(new Error('reply lost'));
    submit(confirm(f)).props.onClick(); await vi.waitFor(() => expect(text(f.render())).toContain('reply lost'));
    const original = f.handlers.onCreate.mock.calls[0][0];
    harness.slots = []; harness.cursor = 0;
    expect(text(f.render())).toContain('保存を再確認');
    submit(f.render()).props.onClick();
    await vi.waitFor(() => expect(text(f.render())).toContain('単語帳を保存しました'));
    expect(f.handlers.onCreate.mock.calls[1][0]).toEqual(original);
  });
  it('unlocks known server rejection for correction and preserves original rows', async () => {
    const f = fixture(); f.handlers.onCreate.mockRejectedValueOnce(new ApiError('修正してください', 400));
    submit(confirm(f)).props.onClick(); await vi.waitFor(() => expect(text(f.render())).toContain('修正してください'));
    expect(readPersonalWordbookDraft('synthetic-student').pendingRequest).toBeUndefined();
    expect(find(f.render(), node => node.type === PersonalWordbookEditor).props.rows[0].word).toBe('plant');
    byId(f.render(), 'phrasebook-create-book-title').props.onChange({ target: { value: '修正版' } });
    submit(confirm(f)).props.onClick(); await vi.waitFor(() => expect(f.handlers.onCreate).toHaveBeenCalledTimes(2));
    expect(f.handlers.onCreate.mock.calls[1][0].defaultBookName).toBe('修正版');
  });
  it('does not treat an undefined save result as success and releases the busy lock for retry', async () => {
    const f = fixture(); f.handlers.onCreate.mockResolvedValueOnce(undefined);
    submit(confirm(f)).props.onClick(); await vi.waitFor(() => expect(text(f.render())).toContain('保存結果を確認できません'));
    expect(submit(f.render()).props.disabled).toBe(false); expect(readPersonalWordbookDraft('synthetic-student').pendingRequest).toBeDefined();
    submit(f.render()).props.onClick(); await vi.waitFor(() => expect(f.handlers.onCreate).toHaveBeenCalledTimes(2));
  });
  it('honors parent pending state for stale edit, confirmation and close events', () => {
    const f = fixture({ creating: true }); const tree = f.render(); tree.props.onClose(); submit(tree).props.onClick();
    byId(tree, 'phrasebook-create-book-title').props.onChange({ target: { value: 'B' } });
    expect(f.handlers.onCreate).not.toHaveBeenCalled(); expect(f.handlers.onClose).not.toHaveBeenCalled();
    expect(readPersonalWordbookDraft('synthetic-student').title).toBe('教材A');
  });
  it('keeps CSV optional, rejects PDF extraction and never submits during file import', async () => {
    const f = fixture(); const tree = f.render(); const input = byId(tree, 'phrasebook-create-file-upload');
    expect(input.props.accept).toBe('.csv,text/csv');
    input.props.onChange({ target: { files: [new File(['synthetic'], 'source.pdf', { type: 'application/pdf' })], value: 'source.pdf' } });
    await vi.waitFor(() => expect(nodes(f.render()).some(node => node.props.role === 'alert')).toBe(true));
    expect(f.handlers.onCreate).not.toHaveBeenCalled(); expect(readPersonalWordbookDraft('synthetic-student').rows[0].word).toBe('plant');
  });
  it('starts study using the actual returned book ID and displays persisted warnings', async () => {
    const f = fixture(); f.handlers.onCreate.mockResolvedValue({ ...savedResult, skippedRowCount: 1, warnings: [{ code: 'DUPLICATE_ROW', rowNumber: 3, message: 'duplicate synthetic row' }] });
    submit(confirm(f)).props.onClick(); await vi.waitFor(() => expect(text(f.render())).toContain('単語帳を保存しました'));
    const tree = f.render(); expect(text(tree)).toContain('duplicate synthetic row');
    find(tree, node => node.props['data-testid'] === 'personal-wordbook-start-study').props.onClick();
    expect(f.handlers.onStartStudy).toHaveBeenCalledWith('actual-server-book-id'); expect(f.handlers.onClose).toHaveBeenCalledTimes(1);
  });
  it('guards the parent modal close while controller is creating', () => {
    const close = vi.fn(); const controller = { creating: true, setShowCreateModal: close };
    const tree = StudentDashboardModals({ user: { uid: 'synthetic-student', email: 'student@example.invalid', displayName: '合成生徒', role: UserRole.STUDENT }, announcementFeed: { feed: [] }, controller,
      viewModel: { canCreateFromText: true, currentPlanPolicy: { label: 'テスト' } }, isMobileViewport: false, onUserUpdate: () => {} } as unknown as React.ComponentProps<typeof StudentDashboardModals>) as Node;
    const modal = find(tree, node => node.type === PhrasebookCreateModal); modal.props.onClose(); expect(close).not.toHaveBeenCalled();
    controller.creating = false; modal.props.onClose(); expect(close).toHaveBeenCalledWith(false);
  });
  it.each(['success', 'rejection', 'lost-response'] as const)('preserves a newer other-tab draft after an old save %s', async outcome => {
    const old = deferred(); const f = fixture(); f.handlers.onCreate.mockReturnValue(old.promise);
    submit(confirm(f)).props.onClick();
    expect(readPersonalWordbookDraft('synthetic-student').pendingRequest).toBeDefined();
    const newer = { ...emptyPersonalWordbookDraft('synthetic-student'), title: '次の単語帳',
      rows: [createPersonalDraftRow({ word: 'newer-tab-word', definition: '別タブの新しい入力' })] };
    writePersonalWordbookDraft(newer);
    if (outcome === 'success') old.resolve(savedResult);
    else old.reject(outcome === 'rejection' ? new ApiError('old request rejected', 409) : new Error('old reply lost'));
    await vi.waitFor(() => expect(submit(f.render()).props.disabled).toBe(false));
    expect(readPersonalWordbookDraft('synthetic-student')).toEqual(newer);
    expect(find(f.render(), node => node.type === PersonalWordbookEditor).props.rows).toEqual(newer.rows);
    expect(text(f.render())).not.toContain('単語帳を保存しました');
    expect(nodes(f.render()).some(node => node.props.role === 'alert')).toBe(false);
  });
  it('completes its own memory-only save when storage writes fail', async () => {
    const f = fixture();
    f.render();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    submit(confirm(f)).props.onClick();
    await vi.waitFor(() => expect(text(f.render())).toContain('単語帳を保存しました'));
    expect(text(f.render())).toContain('下書きをこのブラウザーに保存できません');
  });
});
