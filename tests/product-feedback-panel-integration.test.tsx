import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductFeedbackInput, ProductFeedbackList, ProductFeedbackReport } from '../contracts/productFeedback';
import { UserRole, type UserProfile } from '../types';

const harness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0,
  effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState: (initial: any) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.slots[index], (next: any) => { harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next; }];
    },
    useRef: (value: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: value };
      return harness.slots[index];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = harness.cursor++; const previous = harness.slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        harness.slots[index] = deps; harness.effects.set(index, effect);
      }
    },
  };
});
const api = vi.hoisted(() => ({ listProductFeedback: vi.fn(), saveProductFeedback: vi.fn(), getProductFeedback: vi.fn() }));
vi.mock('../services/productFeedback', () => api);
vi.mock('../components/ModalOverlay', () => ({ default: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div> }));
import ProductFeedbackPanel, { FeedbackReport, ProductFeedbackWorkspaceEntry, type ProductFeedbackPanelProps } from '../components/ProductFeedbackPanel';
import ProductFeedbackStatusLink from '../components/ProductFeedbackStatusLink';

const input: ProductFeedbackInput = { title: 'Synthetic report', version: 'prior-release', screen: 'Review', steps: 'Open review', expected: 'Word appears', actual: 'Blank page', impact: 'Cannot study' };
const report = (patch: Partial<ProductFeedbackReport> = {}): ProductFeedbackReport => ({ ...input, id: 'report', revision: 1, createdAt: 1, updatedAt: 1, status: 'NEW', history: [], historyLoaded: true, isOwnReport: true, ...patch });
const list = (reports: ProductFeedbackReport[] = [], nextCursor: string | null = null): ProductFeedbackList => ({ reports, nextCursor, canManage: false, deploymentRevision: 'current-runtime-sha', });
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const render = <T,>(fn: () => T) => { harness.cursor = 0; return fn(); };
const settle = async () => { for (let i = 0; i < 7; i++) await Promise.resolve(); };
const flush = async () => {
  const effects = [...harness.effects]; harness.effects.clear();
  for (const [index, effect] of effects) {
    harness.cleanups.get(index)?.(); const cleanup = effect();
    if (cleanup) harness.cleanups.set(index, cleanup); else harness.cleanups.delete(index);
  }
  await settle();
};
const reset = () => {
  harness.cleanups.forEach(cleanup => cleanup()); harness.cleanups.clear();
  harness.slots = []; harness.cursor = 0; harness.effects.clear();
};
const nodes = (tree: ReactElement<any>): ReactElement<any>[] => {
  const result = [tree];
  for (const child of React.Children.toArray(tree.props.children)) if (React.isValidElement(child)) result.push(...nodes(child));
  return result;
};
const byLabel = (tree: ReactElement<any>, label: string) => nodes(tree).find(node => node.props['aria-label'] === label)!;
const byButton = (tree: ReactElement<any>, label: string) => nodes(tree).find(node => node.type === 'button' && renderToStaticMarkup(node).includes(label))!;
const props: ProductFeedbackPanelProps = { open: true, onClose: vi.fn(), contextKey: 'teacher|org|grant1' };
const panel = (patch: Partial<ProductFeedbackPanelProps> = {}) => render(() => {
  const outer = ProductFeedbackPanel({ ...props, ...patch }) as ReactElement<any>;
  return outer ? (outer.type as (props: any) => ReactElement<any>)(outer.props) : null;
})!;
const renderedReports = (tree: ReactElement<any>) => nodes(tree).filter(node => node.type === FeedbackReport);
beforeEach(() => { reset(); vi.clearAllMocks(); api.listProductFeedback.mockResolvedValue(list()); });
afterEach(reset);

describe('authorized feedback panel integration', () => {
  it('requests initial server status, clears cursor and old rows when changing filters, and ignores an old response', async () => {
    api.listProductFeedback.mockResolvedValueOnce(list([report({ status: 'FIXED' })], 'fixed-cursor'));
    panel({ initialStatus: 'FIXED' }); await flush();
    let tree = panel({ initialStatus: 'FIXED' });
    expect(api.listProductFeedback).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal), 'FIXED');
    expect(byLabel(tree, '報告の状態').props.value).toBe('FIXED');
    const old = deferred<ProductFeedbackList>(); api.listProductFeedback.mockReturnValueOnce(old.promise);
    byButton(tree, '次の報告を読み込む').props.onClick(); const oldSignal = api.listProductFeedback.mock.calls.at(-1)![1] as AbortSignal;
    expect(api.listProductFeedback).toHaveBeenLastCalledWith('fixed-cursor', oldSignal, 'FIXED');
    api.listProductFeedback.mockResolvedValueOnce(list([report({ id: 'new', status: 'NEW' })]));
    byLabel(tree, '報告の状態').props.onChange({ target: { value: 'ALL' } });
    tree = panel({ initialStatus: 'FIXED' }); expect(renderedReports(tree)).toHaveLength(0); expect(oldSignal.aborted).toBe(true);
    expect(api.listProductFeedback).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal), undefined);
    await settle(); old.resolve(list([report({ id: 'old-page', status: 'FIXED' })])); await settle();
    tree = panel({ initialStatus: 'FIXED' }); expect(renderedReports(tree).map(node => node.props.report.id)).toEqual(['new']);
  });

  it('reloads a stale filtered cursor once from the first page and distinguishes an empty filter from unknown reads', async () => {
    api.listProductFeedback.mockResolvedValueOnce(list([report({ status: 'FIXED' })], 'stale'))
      .mockRejectedValueOnce(Object.assign(new Error('cursor changed'), { status: 400 })).mockResolvedValueOnce(list());
    panel({ initialStatus: 'FIXED' }); await flush(); byButton(panel({ initialStatus: 'FIXED' }), '次の報告を読み込む').props.onClick(); await settle();
    const tree = panel({ initialStatus: 'FIXED' });
    expect(api.listProductFeedback).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal), 'FIXED');
    expect(nodes(tree).some(node => node.type === 'p' && renderToStaticMarkup(node).includes('全件に切り替えて'))).toBe(true);
    api.listProductFeedback.mockRejectedValueOnce(new Error('offline')); byButton(tree, '一覧を更新').props.onClick(); await settle();
    const failed = panel({ initialStatus: 'FIXED' });
    expect(nodes(failed).some(node => node.type === 'p' && renderToStaticMarkup(node).includes('全件に切り替えて'))).toBe(false);
    expect(nodes(failed).some(node => node.props.role === 'alert')).toBe(true);
  });

  it('keeps a lost create retry identical and input intact; close retains same-context draft while context change resets by key', async () => {
    panel(); await flush(); let tree = panel();
    for (const [key, label] of Object.entries({ title: '件名', version: '試した版', screen: '画面・操作の場所', steps: '再現する手順', expected: '期待する動作', actual: '実際の動作', impact: '困ったこと・影響' })) byLabel(tree, label).props.onChange({ target: { value: input[key as keyof ProductFeedbackInput] } });
    const privacyLabel = '生徒の氏名・連絡先・答案を含めず、匿名の手順にしたことを確認しました。';
    byLabel(tree, privacyLabel).props.onChange({ target: { checked: true } });
    api.saveProductFeedback.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(report());
    tree = panel(); nodes(tree).find(node => node.props['data-testid'] === 'product-feedback-create')!.props.onSubmit({ preventDefault: vi.fn() }); await settle();
    tree = panel(); expect(byLabel(tree, '件名').props.value).toBe(input.title); expect(byButton(tree, '同じ内容で再試行')).toBeDefined();
    byButton(tree, '同じ内容で再試行').props.onClick(); await settle(); expect(api.saveProductFeedback.mock.calls[0][0]).toEqual(api.saveProductFeedback.mock.calls[1][0]);
    byLabel(panel(), '件名').props.onChange({ target: { value: 'unsaved after confirmed save' } });
    panel({ open: false }); await flush(); panel(); await flush(); expect(byLabel(panel(), '件名').props.value).toBe('unsaved after confirmed save');
    const old = ProductFeedbackPanel(props) as ReactElement; const changed = ProductFeedbackPanel({ ...props, contextKey: 'teacher|elsewhere|grant2' }) as ReactElement;
    expect(changed.key).not.toBe(old.key); reset();
    expect(byLabel(panel({ contextKey: 'teacher|elsewhere|grant2' }), '件名').props.value).toBe('');
    expect(ProductFeedbackPanel({ ...props, contextKey: null })).toBeNull();
  });

  it('retains conflict input, refreshes against the server and removes reports that leave a filtered status', async () => {
    api.listProductFeedback.mockResolvedValue(list([report()])); const onSaved = vi.fn();
    panel({ initialStatus: 'NEW', onSaved }); await flush(); let tree = panel({ initialStatus: 'NEW', onSaved });
    byLabel(tree, '件名').props.onChange({ target: { value: 'retain me after conflict' } });
    api.saveProductFeedback.mockRejectedValueOnce(Object.assign(new Error('concurrent'), { status: 409 }));
    renderedReports(tree)[0].props.onChange({ type: 'triage', priority: 'P1', acceptance: 'Check button' }); await settle();
    tree = panel({ initialStatus: 'NEW', onSaved }); expect(byLabel(tree, '件名').props.value).toBe('retain me after conflict');
    expect(nodes(tree).some(node => node.props.role === 'alert' && renderToStaticMarkup(node).includes('入力は保持しました'))).toBe(true);
    api.saveProductFeedback.mockResolvedValueOnce(report({ revision: 2, status: 'TRIAGED' }));
    renderedReports(tree)[0].props.onChange({ type: 'triage', priority: 'P1', acceptance: 'Check button' }); await settle();
    expect(renderedReports(panel({ initialStatus: 'NEW', onSaved }))).toHaveLength(0); expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('opens a different status after closing during a delayed save and fetches that status after confirmation', async () => {
    api.listProductFeedback.mockResolvedValueOnce(list([report()]));
    panel({ initialStatus: 'NEW' }); await flush();
    const save = deferred<ProductFeedbackReport>(); api.saveProductFeedback.mockReturnValueOnce(save.promise);
    renderedReports(panel({ initialStatus: 'NEW' }))[0].props.onChange({ type: 'triage', priority: 'P1', acceptance: 'Check button' });
    panel({ open: false, initialStatus: 'NEW' }); await flush();
    panel({ open: true, initialStatus: 'FIXED' }); await flush();
    expect(byLabel(panel({ initialStatus: 'FIXED' }), '報告の状態').props.value).toBe('FIXED');
    expect(renderedReports(panel({ initialStatus: 'FIXED' }))).toHaveLength(0);
    api.listProductFeedback.mockResolvedValueOnce(list([report({ id: 'fixed', status: 'FIXED' })]));
    save.resolve(report({ status: 'TRIAGED', revision: 2 })); await settle();
    expect(api.listProductFeedback).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal), 'FIXED');
    expect(renderedReports(panel({ initialStatus: 'FIXED' })).map(node => node.props.report.id)).toEqual(['fixed']);
  });

  it('clears reports and drafts on current auth denial and aborts pending reads when its keyed context unmounts', async () => {
    api.listProductFeedback.mockResolvedValueOnce(list([report()])); panel(); await flush();
    byLabel(panel(), '件名').props.onChange({ target: { value: 'private unsaved' } });
    api.listProductFeedback.mockRejectedValueOnce(Object.assign(new Error('role revoked'), { status: 403 }));
    byButton(panel(), '一覧を更新').props.onClick(); await settle();
    expect(renderedReports(panel())).toHaveLength(0); expect(byLabel(panel(), '件名').props.value).toBe('');
    const pending = deferred<ProductFeedbackList>(); api.listProductFeedback.mockReturnValueOnce(pending.promise);
    byButton(panel(), '一覧を更新').props.onClick(); const signal = api.listProductFeedback.mock.calls.at(-1)![1] as AbortSignal;
    reset(); expect(signal.aborted).toBe(true); pending.resolve(list([report({ id: 'late' })])); await settle();
    expect(renderedReports(panel({ contextKey: 'new-context' }))).toHaveLength(0);
  });

  it('opens an unknown question only as an unconfirmed draft without creating a report', async () => {
    const tree = panel({ initialDraft: 'Unknown workflow question' }); await flush();
    const ready = panel({ initialDraft: 'Unknown workflow question' });
    expect(byLabel(ready, '件名').props.value).toBe('Unknown workflow question');
    expect(byLabel(ready, '実際の動作').props.value).toContain('Unknown workflow question');
    expect(nodes(ready).find(node => node.props.id === 'product-feedback-form-fields')!.props.hidden).toBe(false);
    expect(nodes(ready).find(node => node.type === 'input' && node.props.type === 'checkbox')!.props.checked).toBe(false);
    expect(api.saveProductFeedback).not.toHaveBeenCalled(); expect(tree).toBeDefined();
  });

  it('shows a newly saved NEW report by switching a status-filtered view to ALL', async () => {
    panel({ initialStatus: 'FIXED' }); await flush(); let tree = panel({ initialStatus: 'FIXED' });
    for (const [key, label] of Object.entries({ title: '件名', version: '試した版', screen: '画面・操作の場所', steps: '再現する手順', expected: '期待する動作', actual: '実際の動作', impact: '困ったこと・影響' })) byLabel(tree, label).props.onChange({ target: { value: input[key as keyof ProductFeedbackInput] } });
    nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox')!.props.onChange({ target: { checked: true } });
    api.saveProductFeedback.mockResolvedValueOnce(report()); api.listProductFeedback.mockResolvedValueOnce(list([report()]));
    tree = panel({ initialStatus: 'FIXED' }); nodes(tree).find(node => node.props['data-testid'] === 'product-feedback-create')!.props.onSubmit({ preventDefault: vi.fn() }); await settle();
    tree = panel({ initialStatus: 'FIXED' }); expect(byLabel(tree, '報告の状態').props.value).toBe('ALL');
    expect(api.listProductFeedback).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal), undefined);
    expect(renderedReports(tree).map(node => node.props.report.id)).toEqual(['report']);
  });

  it('keeps an incoming unknown-question draft queued during a prior save and acknowledges it only after applying', async () => {
    api.listProductFeedback.mockResolvedValueOnce(list([report()])); panel(); await flush();
    byLabel(panel(), '実際の動作').props.onChange({ target: { value: 'Keep existing draft details' } });
    const save = deferred<ProductFeedbackReport>(); api.saveProductFeedback.mockReturnValueOnce(save.promise);
    renderedReports(panel())[0].props.onChange({ type: 'triage', priority: 'P1', acceptance: 'Check button' });
    const onInitialDraftApplied = vi.fn(); const question = { initialDraft: 'New unknown question', onInitialDraftApplied };
    panel(question); await flush(); expect(onInitialDraftApplied).not.toHaveBeenCalled();
    save.resolve(report({ status: 'TRIAGED', revision: 2 })); await settle(); panel(question); await flush();
    const tree = panel(question); expect(onInitialDraftApplied).toHaveBeenCalledTimes(1);
    expect(byLabel(tree, '実際の動作').props.value).toContain('Keep existing draft details');
    expect(byLabel(tree, '実際の動作').props.value).toContain('New unknown question');
    expect(api.saveProductFeedback).toHaveBeenCalledTimes(1);
  });
});

describe('published revision boundaries and current workspace entry', () => {
  it.each([null, 'another-runtime-sha'])('shows unknown or mismatched publication and cannot record target-version success: %s', async actualDeploymentRevision => {
    const onChange = vi.fn();
    const props = { report: report({ status: 'FIXED', fixRevision: 'manual-fix-sha' }), canManage: false, busy: false, actualDeploymentRevision, onDetail: vi.fn(), onChange };
    let tree = render(() => FeedbackReport(props)) as ReactElement<any>;
    byLabel(tree, '再テストした条件と結果').props.onChange({ target: { value: 'Still fails' } });
    tree = render(() => FeedbackReport(props)) as ReactElement<any>;
    expect(renderToStaticMarkup(tree)).toContain('自己申告'); expect(renderToStaticMarkup(tree)).toContain('対象版の成功としては記録できません');
    expect(byButton(tree, '再テスト成功を記録').props.disabled).toBe(true);
    byButton(tree, '再テスト成功を記録').props.onClick(); expect(onChange).not.toHaveBeenCalled();
    byButton(tree, '再テスト失敗を記録').props.onClick();
    expect(onChange).toHaveBeenCalledWith({ type: 'retest', passed: false, note: expect.stringContaining(`現在の公開版: ${actualDeploymentRevision || '不明'}`) });
  });

  it('records matching revision as a user observation with runtime metadata, and resets retest draft at a newer workflow revision', () => {
    const onChange = vi.fn(); const props = { report: report({ status: 'FIXED', fixRevision: 'current-runtime-sha', revision: 4 }), canManage: false, busy: false, actualDeploymentRevision: 'current-runtime-sha', onDetail: vi.fn(), onChange };
    let tree = render(() => FeedbackReport(props)) as ReactElement<any>;
    byLabel(tree, '再テストした条件と結果').props.onChange({ target: { value: '320px and desktop checked' } }); tree = render(() => FeedbackReport(props)) as ReactElement<any>;
    expect(byButton(tree, '再テスト成功を記録').props.disabled).toBe(false); byButton(tree, '再テスト成功を記録').props.onClick();
    expect(onChange).toHaveBeenCalledWith({ type: 'retest', passed: true, note: expect.stringContaining('自己申告') });
    expect(onChange.mock.calls[0][0].note).toContain('現在の公開版: current-runtime-sha');
    tree = render(() => FeedbackReport({ ...props, report: { ...props.report, revision: 6 } })) as ReactElement<any>;
    expect(byLabel(tree, '再テストした条件と結果').props.value).toBe(''); expect(byButton(tree, '再テスト成功を記録').props.disabled).toBe(true);
  });

  it('isolates current role/org/workspace and extra grant key and limits entry to staff', async () => {
    const user: UserProfile = { uid: 'teacher', email: 'teacher@example.invalid', displayName: 'Teacher', role: UserRole.INSTRUCTOR, organizationId: 'org' };
    const entry = (patch: Partial<UserProfile> = {}, key = 'grant1') => ProductFeedbackWorkspaceEntry({ user: { ...user, ...patch }, workspace: 'instructor', productFeedbackContextKey: key }) as ReactElement<any>;
    expect(entry({ organizationId: 'other-org' }).key).not.toBe(entry().key); expect(entry({}, 'grant2').key).not.toBe(entry().key);
    expect(entry({ role: UserRole.ADMIN }).key).not.toBe(entry().key); expect(entry({ uid: 'other-user' }).key).not.toBe(entry().key);
    expect(entry({ role: UserRole.STUDENT })).toBeNull();
    const consumed = vi.fn(); const outer = ProductFeedbackWorkspaceEntry({ user, workspace: 'instructor', productFeedbackDraft: 'Unknown question', onProductFeedbackDraftConsumed: consumed }) as ReactElement<any>;
    const draw = () => render(() => (outer.type as (props: any) => ReactElement<any>)(outer.props));
    draw(); await flush(); let tree = draw();
    const panelNode = nodes(tree).find(node => node.type === ProductFeedbackPanel)!;
    expect(panelNode.props).toMatchObject({ open: true, initialDraft: 'Unknown question' }); expect(consumed).toHaveBeenCalledTimes(1); expect(api.saveProductFeedback).not.toHaveBeenCalled();
    const statusLink = nodes(tree).find(node => node.type === ProductFeedbackStatusLink)!;
    statusLink.props.onOpen('FIXED'); tree = draw(); expect(nodes(tree).find(node => node.type === ProductFeedbackPanel)!.props.initialStatus).toBe('FIXED');
    const refreshKey = statusLink.props.refreshKey; nodes(tree).find(node => node.type === ProductFeedbackPanel)!.props.onSaved(); tree = draw();
    expect(nodes(tree).find(node => node.type === ProductFeedbackStatusLink)!.props.refreshKey).toBe(refreshKey + 1);
    nodes(tree).find(node => node.type === ProductFeedbackPanel)!.props.onClose(); tree = draw();
    expect(nodes(tree).find(node => node.type === ProductFeedbackPanel)!.props.open).toBe(false);
    expect(nodes(tree).find(node => node.type === ProductFeedbackStatusLink)!.props.refreshKey).toBe(refreshKey + 2);
  });
});
