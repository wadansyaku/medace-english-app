import React, { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      if (!(index in harness.slots)) harness.slots[index] = initial;
      return [harness.slots[index], (next: unknown) => {
        harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next;
      }];
    },
    useEffect: () => {},
  };
  return { ...original, ...hooks, default: { ...original.default, ...hooks } };
});

import PhrasebookCreateModal from '../components/dashboard/PhrasebookCreateModal';
import StudentDashboardModals from '../components/dashboard/StudentDashboardModals';
import { UserRole } from '../types';

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
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const fixture = (overrides: Partial<Props> = {}) => {
  const state = { open: true, newBookTitle: '教材A', rawText: 'Word,Meaning\nsource,出典', createMode: 'TEXT' as Props['createMode'], creating: false };
  const handlers = {
    onClose: vi.fn(() => { state.open = false; }),
    onChangeTitle: vi.fn((value: string) => { state.newBookTitle = value; }),
    onChangeRawText: vi.fn((value: string) => { state.rawText = value; }),
    onChangeMode: vi.fn((value: Props['createMode']) => { state.createMode = value; }),
    onFileChange: vi.fn(),
    onCreate: vi.fn<() => void | Promise<void>>().mockResolvedValue(undefined),
  };
  const render = () => {
    harness.cursor = 0;
    return PhrasebookCreateModal({ ...state, uploadFile: null, errorMsg: null, canUseSelectedCreateMode: true, currentPlanLabel: '合成テストプラン', ...handlers, ...overrides }) as Node;
  };
  return { state, handlers, render };
};

beforeEach(() => { harness.slots = []; harness.cursor = 0; });

describe('My phrasebook creation keeps one pending input intact', () => {
  it('blocks duplicate submit, edits, mode switches and all close paths in the same tick', async () => {
    const save = deferred();
    const f = fixture();
    f.handlers.onCreate.mockReturnValue(save.promise);
    const original = f.render();
    const first = submit(original).props.onClick();
    const second = submit(original).props.onClick();
    byId(original, 'phrasebook-create-book-title').props.onChange({ target: { value: '教材B' } });
    byId(original, 'phrasebook-create-source-text').props.onChange({ target: { value: 'New source B.' } });
    nodes(original).filter((node) => node.type === 'button' && node.props.onClick).forEach((node) => {
      if (node !== submit(original)) node.props.onClick();
    });
    original.props.onClose(); // Escape and overlay both use this callback.
    expect(f.handlers.onCreate).toHaveBeenCalledTimes(1);
    expect(f.handlers.onClose).not.toHaveBeenCalled();
    expect(f.handlers.onChangeTitle).not.toHaveBeenCalled();
    expect(f.handlers.onChangeRawText).not.toHaveBeenCalled();
    expect(f.handlers.onChangeMode).not.toHaveBeenCalled();
    const pending = f.render();
    expect(byId(pending, 'phrasebook-create-book-title').props.readOnly).toBe(true);
    expect(byId(pending, 'phrasebook-create-source-text').props.readOnly).toBe(true);
    expect(pending.props.closeOnOverlayClick).toBe(false);
    expect(nodes(pending).filter((node) => node.type === 'button').every((node) => node.props.disabled)).toBe(true);
    save.resolve();
    await Promise.all([first, second]);
  });

  it('lets a delayed success clear only the accepted A input because B cannot be entered while pending', async () => {
    const save = deferred();
    const f = fixture();
    f.handlers.onCreate.mockImplementation(async () => {
      f.state.creating = true;
      await save.promise;
      f.state.rawText = '';
      f.state.newBookTitle = '';
      f.state.open = false;
      f.state.creating = false;
    });
    const first = submit(f.render()).props.onClick();
    const pending = f.render();
    byId(pending, 'phrasebook-create-book-title').props.onChange({ target: { value: '教材B' } });
    byId(pending, 'phrasebook-create-source-text').props.onChange({ target: { value: 'B source.' } });
    pending.props.onClose();
    expect(f.state.newBookTitle).toBe('教材A');
    expect(f.state.rawText).toBe('Word,Meaning\nsource,出典');
    expect(f.state.open).toBe(true);
    save.resolve();
    await first;
    expect(f.state.open).toBe(false);
    expect(f.state.rawText).toBe('');
    expect(f.handlers.onChangeTitle).not.toHaveBeenCalled();
  });

  it('keeps the source after a delayed failure and unlocks editing and retry', async () => {
    const save = deferred();
    const f = fixture();
    f.handlers.onCreate.mockReturnValueOnce(save.promise);
    const first = submit(f.render()).props.onClick();
    save.reject(new Error('保存を確認できませんでした'));
    await first;
    const failed = f.render();
    expect(f.state.open).toBe(true);
    expect(f.state.newBookTitle).toBe('教材A');
    expect(f.state.rawText).toBe('Word,Meaning\nsource,出典');
    expect(byId(failed, 'phrasebook-create-source-text').props.readOnly).toBe(false);
    expect(find(failed, (node) => node.props.role === 'alert').props.children).toContainEqual(expect.objectContaining({ props: expect.objectContaining({ children: '保存を確認できませんでした' }) }));
    byId(failed, 'phrasebook-create-book-title').props.onChange({ target: { value: '教材B' } });
    await submit(f.render()).props.onClick();
    expect(f.state.newBookTitle).toBe('教材B');
    expect(f.handlers.onCreate).toHaveBeenCalledTimes(2);
  });

  it('releases the same-tick lock when the callback throws synchronously', async () => {
    const f = fixture();
    f.handlers.onCreate.mockImplementationOnce(() => { throw new Error('接続を確認してください'); });
    await submit(f.render()).props.onClick();
    expect(submit(f.render()).props.disabled).toBe(false);
    await submit(f.render()).props.onClick();
    expect(f.handlers.onCreate).toHaveBeenCalledTimes(2);
  });

  it('also honors an already pending parent operation before any local submit', () => {
    const f = fixture({ creating: true });
    const tree = f.render();
    tree.props.onClose();
    submit(tree).props.onClick();
    byId(tree, 'phrasebook-create-book-title').props.onChange({ target: { value: 'B' } });
    expect(f.handlers.onClose).not.toHaveBeenCalled();
    expect(f.handlers.onCreate).not.toHaveBeenCalled();
    expect(f.handlers.onChangeTitle).not.toHaveBeenCalled();
  });

  it('provides a focusable native button for file selection and locks late file events', async () => {
    const save = deferred();
    const f = fixture({ createMode: 'FILE', uploadFile: new File(['synthetic'], 'sample.csv', { type: 'text/csv' }) });
    f.handlers.onCreate.mockReturnValue(save.promise);
    const tree = f.render();
    const input = byId(tree, 'phrasebook-create-file-upload');
    const click = vi.fn();
    input.props.ref.current = { click };
    const picker = find(tree, (node) => node.props['data-testid'] === 'phrasebook-create-file-picker');
    expect(picker.type).toBe('button');
    expect(picker.props.type).toBe('button');
    expect(picker.props.tabIndex).not.toBe(-1);
    picker.props.onClick();
    expect(click).toHaveBeenCalledTimes(1);
    const first = submit(tree).props.onClick();
    picker.props.onClick();
    input.props.onChange({ target: { files: [new File(['B'], 'new.csv')] } });
    expect(click).toHaveBeenCalledTimes(1);
    expect(f.handlers.onFileChange).not.toHaveBeenCalled();
    const pending = f.render();
    expect(byId(pending, 'phrasebook-create-file-upload').props.disabled).toBe(true);
    save.resolve();
    await first;
  });

  it('does not call creation for an empty title even if a stale event handler is invoked', async () => {
    const f = fixture({ newBookTitle: ' ' });
    await submit(f.render()).props.onClick();
    expect(f.handlers.onCreate).not.toHaveBeenCalled();
  });

  it('accepts CSV only and explains stopped OCR without calling creation or clearing the selected input', async () => {
    const uploadFile = new File(['synthetic'], 'source.pdf', { type: 'application/pdf' });
    const f = fixture({ createMode: 'FILE', uploadFile });
    const tree = f.render();
    expect(byId(tree, 'phrasebook-create-file-upload').props.accept).toBe('.csv,text/csv');
    expect(submit(tree).props.disabled).toBe(true);
    await submit(tree).props.onClick();
    expect(f.handlers.onCreate).not.toHaveBeenCalled();
    expect(f.handlers.onChangeTitle).not.toHaveBeenCalled();
    expect(f.handlers.onChangeRawText).not.toHaveBeenCalled();
    expect(find(tree, node => node.props['data-testid'] === 'phrasebook-create-validation-message').props.children).toContain('自動抽出は現在利用できません');
    expect(find(tree, node => node.type === 'span' && node.props.children === uploadFile.name)).toBeTruthy();
  });

  it('guards the parent modal close callback while its controller is creating', () => {
    const close = vi.fn();
    const controller = { creating: true, createMode: 'TEXT', setShowCreateModal: close };
    const tree = StudentDashboardModals({
      user: { uid: 'synthetic-student', email: 'student@example.invalid', displayName: '合成生徒', role: UserRole.STUDENT },
      announcementFeed: { feed: [] }, controller,
      viewModel: { canCreateFromText: true, currentPlanPolicy: { label: 'テスト' } },
      isMobileViewport: false, onUserUpdate: () => {},
    } as unknown as React.ComponentProps<typeof StudentDashboardModals>) as Node;
    const modal = find(tree, (node) => node.type === PhrasebookCreateModal);
    modal.props.onClose();
    expect(close).not.toHaveBeenCalled();
    controller.creating = false;
    modal.props.onClose();
    expect(close).toHaveBeenCalledWith(false);
  });
});
