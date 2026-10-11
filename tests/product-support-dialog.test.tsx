import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, key: '' }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => {
  const index = state.cursor++;
  if (!(index in state.slots)) state.slots[index] = initial;
  return [state.slots[index], (next: unknown) => { state.slots[index] = next; }];
} }));
vi.mock('../components/ModalOverlay', () => ({ default: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock('../components/ProductSupportConversation', () => ({ default: () => <p>conversation</p> }));
import ProductSupportConversation from '../components/ProductSupportConversation';
import ProductSupportDialog, { type ProductSupportDialogProps } from '../components/ProductSupportDialog';

type Node = ReactElement<Record<string, any>>;
const walk = (value: any): Node[] => Array.isArray(value) ? value.flatMap(walk) : React.isValidElement(value)
  ? [value as Node, ...walk((value as Node).props.children)] : [];
let props: ProductSupportDialogProps;
const render = () => {
  const outer = ProductSupportDialog(props) as Node | null;
  if (!outer) { state.slots = []; state.key = ''; return null; }
  if (state.key !== outer.key) { state.slots = []; state.key = String(outer.key); }
  state.cursor = 0;
  return (outer.type as React.FC<ProductSupportDialogProps>)(outer.props as ProductSupportDialogProps) as Node;
};
const draft = (question: string) => walk(render()).find(node => node.type === ProductSupportConversation)!.props.onDraft(question);
const markup = () => renderToStaticMarkup(render());
beforeEach(() => {
  state.slots = []; state.cursor = 0; state.key = '';
  props = { open: true, role: 'GUEST', contextKey: 'guest', ready: true, onAsk: vi.fn(), onClose: vi.fn() };
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('product support dialog integration', () => {
  it('opens only on request and states the generation-off limits while delegating keyboard and return focus to ModalOverlay', () => {
    props.open = false; expect(render()).toBeNull(); props.open = true;
    const tree = render()!;
    expect(tree.props).toMatchObject({ mobileBehavior: 'fullscreen', initialFocusSelector: '[data-support-dialog-close]', returnFocusSelector: '[data-product-support-trigger]', onClose: props.onClose });
    expect(markup()).toContain('公開案内の会話（生成OFF）'); expect(markup()).toContain('AIによる回答生成は停止中');
    walk(tree).find(node => node.props['data-support-dialog-close'])!.props.onClick(); expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onAsk).not.toHaveBeenCalled();
  });

  it('keeps guest and student feedback as a local manual draft without sending or copying automatically', () => {
    props.role = 'STUDENT'; draft('意味の入力方法を確認したいです');
    expect(markup()).toContain('まだ送信していません'); expect(markup()).toContain('意味の入力方法を確認したいです');
    const textarea = walk(render()).find(node => node.type === 'textarea')!;
    expect(textarea.props.readOnly).toBe(true); expect(props.onAsk).not.toHaveBeenCalled(); expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('copies only after a click and reports copy as separate from sending', async () => {
    draft('操作について確認したいです');
    const button = walk(render()).find(node => node.type === 'button' && node.props.children === '下書きをコピー')!;
    button.props.onClick(); await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('操作について確認したいです');
    expect(markup()).toContain('下書きをコピーしました。送信はしていません'); expect(props.onAsk).not.toHaveBeenCalled();
  });

  it('makes authorized staff drafting a callback only, preserving the existing confirmation form', () => {
    props.role = 'INSTRUCTOR'; props.onDraft = vi.fn(); draft('課題の操作を確認したいです');
    expect(props.onDraft).toHaveBeenCalledWith('課題の操作を確認したいです'); expect(props.onAsk).not.toHaveBeenCalled();
    expect(markup()).not.toContain('support-local-draft');
  });

  it.each(['close', 'role', 'person', 'workspace'] as const)('discards a local draft across %s', change => {
    draft('旧会話の下書き'); expect(markup()).toContain('旧会話の下書き');
    if (change === 'close') { props.open = false; render(); props.open = true; }
    if (change === 'role') props.role = 'STUDENT';
    if (change === 'person') props.contextKey = 'other-person';
    if (change === 'workspace') props.contextKey = 'guest:other-workspace';
    expect(markup()).not.toContain('旧会話の下書き');
  });
});
