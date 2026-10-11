import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductSupportRequest, ProductSupportResponse } from '../contracts/productSupport';
import { PRODUCT_SUPPORT_TARGET_VERSION } from '../shared/productSupportKnowledge';
import { searchProductSupportConversation } from '../shared/productSupportConversation';
import { ProductSupportNotAdmittedError } from '../services/productSupport';

// Render the real component and its asynchronous state transitions with the
// repository's existing network-free React hook harness. Browser QA is separate.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, key: null as string | null,
  effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++; const slots = hooks.slots;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = hooks.cursor++; const before = hooks.slots[index] as unknown[] | undefined;
      if (!before || deps.some((dep, i) => !Object.is(dep, before[i]))) {
        hooks.slots[index] = deps; hooks.effects.set(index, effect);
      }
    },
  };
});
import ProductSupportConversation, { type ProductSupportConversationProps } from '../components/ProductSupportConversation';

type Node = ReactElement<Record<string, any>>;
type Ask = Extract<ProductSupportRequest, { action: 'ask' }>;
let props: ProductSupportConversationProps;
const dispose = () => {
  hooks.cleanups.forEach(cleanup => cleanup()); hooks.cleanups.clear(); hooks.effects.clear();
  hooks.slots = []; hooks.cursor = 0; hooks.key = null;
};
const render = (): Node | null => {
  const session = ProductSupportConversation(props) as Node | null;
  if (!session) { dispose(); return null; }
  const key = session.key as string;
  if (hooks.key !== key) { dispose(); hooks.key = key; }
  hooks.cursor = 0;
  return (session.type as React.FC<ProductSupportConversationProps>)(session.props as ProductSupportConversationProps) as Node;
};
const flush = () => {
  const effects = [...hooks.effects]; hooks.effects.clear();
  for (const [index, effect] of effects) {
    hooks.cleanups.get(index)?.(); const cleanup = effect();
    if (cleanup) hooks.cleanups.set(index, cleanup); else hooks.cleanups.delete(index);
  }
};
const settle = async (): Promise<Node> => {
  for (let i = 0; i < 4; i++) { render(); flush(); await Promise.resolve(); }
  return render()!;
};
const nodes = (value: unknown): Node[] => {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
};
const find = (tree: Node, testId: string) => {
  const node = nodes(tree).find(item => item.props['data-testid'] === testId);
  if (!node) throw new Error(`Missing control ${testId}`);
  return node;
};
const field = (tree: Node) => nodes(tree).find(node => node.type === 'textarea')!;
const consent = (tree: Node) => nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox')!;
const html = () => renderToStaticMarkup(render());
const fill = (text: string) => field(render()!).props.onChange({ target: { value: text } });
const agree = () => consent(render()!).props.onChange({ target: { checked: true } });
const submit = () => find(render()!, 'support-form').props.onSubmit({ preventDefault: vi.fn() });
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const answer = (request: Ask, extra: Record<string, unknown> = {}): ProductSupportResponse => {
  const decision = searchProductSupportConversation({ ...request, role: props.role });
  return {
    requestId: request.requestId, status: 'ANSWERED', version: PRODUCT_SUPPORT_TARGET_VERSION,
    answer: decision.kind === 'grounded' ? decision.sources[0].content
      : decision.kind === 'clarification' ? decision.clarification : 'この答えは、公開案内では確認できていません。',
    sourceIds: decision.sources.map(source => source.sourceId),
    references: decision.sources.map(source => ({ sourceId: source.sourceId, title: source.title, excerpt: source.content, version: source.targetVersion, checkedAt: source.checkedAt })),
    kind: decision.kind === 'grounded' ? 'ANSWER' : 'CLARIFICATION', providerUsed: false,
    ...extra,
  } as ProductSupportResponse;
};
const lastAsk = () => (props.onAsk as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Ask;
beforeEach(() => {
  dispose();
  props = { role: 'GUEST', contextKey: 'synthetic-person:workspace-a', ready: true, open: true,
    onAsk: vi.fn(async (request: ProductSupportRequest) => answer(request as Ask)), onDraft: vi.fn() };
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => { throw new Error('No persistent conversation storage'); }), setItem: vi.fn(() => { throw new Error('No persistent conversation storage'); }) });
  vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => { throw new Error('No persistent conversation storage'); }), setItem: vi.fn(() => { throw new Error('No persistent conversation storage'); }) });
});
afterEach(() => { dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('product conversation UI and safe state inquiry', () => {
  it('renders a small chat and labelled input before optional sending details, with separate Bot consent', async () => {
    await settle(); const markup = html();
    expect(markup.indexOf('<textarea')).toBeLessThan(markup.indexOf('送信内容と会話の使い方'));
    expect(markup).toContain('直近3回'); expect(markup).toContain('Cloudflare AI');
    expect(markup).toContain('英作文の外部送信同意と別');
    expect(markup).toContain('role="log"'); expect(markup).toContain('max-h-80');
    expect(markup).not.toContain('href='); expect(markup).not.toContain('よくある質問');
    expect(find(render()!, 'support-submit').props.disabled).toBe(true);
  });

  it('requires ready, explicit Bot consent and a nonempty question without posting a claimed role', async () => {
    await settle(); fill('登録前のNaruの記録はどうなりますか？'); submit();
    expect(props.onAsk).not.toHaveBeenCalled(); agree(); props.ready = false;
    props.disabledReason = '回答処理をまだ開始していません。'; await settle(); submit();
    expect(props.onAsk).not.toHaveBeenCalled(); expect(field(render()!).props.value).toContain('Naru');
    expect(html()).toContain(props.disabledReason); props.ready = true; await settle(); submit();
    const sent = lastAsk(); expect(sent).toMatchObject({ action: 'ask', privacyConsent: true, history: [], targetVersion: PRODUCT_SUPPORT_TARGET_VERSION });
    expect(sent).not.toHaveProperty('role'); expect(sent.requestId).toBeTruthy();
    await settle(); expect(html()).toContain('公開案内からの回答（生成OFF）');
  });

  it('matches the server 600-character envelope and refuses an oversized question before posting', async () => {
    await settle(); agree(); expect(field(render()!).props.maxLength).toBe(600);
    fill('あ'.repeat(601)); submit(); expect(props.onAsk).not.toHaveBeenCalled();
    expect(html()).toContain('質問を600文字以内'); expect(field(render()!).props.value).toHaveLength(601);
    fill('あ'.repeat(600)); submit(); expect(lastAsk().question).toHaveLength(600); await settle();
  });

  it('blocks duplicate submits synchronously and resolves canonical source content without arbitrary reference links', async () => {
    const wait = deferred<ProductSupportResponse>(); (props.onAsk as any).mockReturnValueOnce(wait.promise);
    await settle(); agree(); fill('登録前のNaruの記録はどうなりますか？');
    const staleForm = find(render()!, 'support-form'); staleForm.props.onSubmit({ preventDefault: vi.fn() }); staleForm.props.onSubmit({ preventDefault: vi.fn() });
    expect(props.onAsk).toHaveBeenCalledTimes(1); expect(field(render()!).props.disabled).toBe(true);
    const sent = lastAsk(); wait.resolve(answer(sent, { references: [{ sourceId: sent.requestId, title: 'untrusted-title', excerpt: 'untrusted-content', url: 'https://invalid.test/arbitrary' }] }));
    await settle(); const markup = html();
    expect(markup).toContain('根拠を読む: 登録前のNaru単語回答と引継ぎ');
    expect(markup).toContain('根拠ID: guest-naru-records'); expect(markup).toContain('確認日: 2026-10-11'); expect(markup).toContain(`仕様版: ${PRODUCT_SUPPORT_TARGET_VERSION}`);
    expect(markup).not.toContain('untrusted'); expect(markup).not.toContain('invalid.test');
    expect(markup).toContain('href="/public?supportSource=guest-naru-records"');
    expect(field(render()!).props.value).toBe('');
  });

  it.each([
    { answer: '<img src=x onerror=alert(1)>' }, { answer: 'https://invalid.test/arbitrary' },
    { sourceIds: ['not-a-canonical-source'] }, { version: 'wrong-version' }, { requestId: 'different-request' },
    { kind: 'unrecognized-kind' }, { status: 'unrecognized-status' },
  ])('does not display an invalid or mismatched answer: %j', async extra => {
    (props.onAsk as any).mockImplementationOnce(async (request: Ask) => answer(request, extra));
    await settle(); agree(); fill('登録前のNaruの記録はどうなりますか？'); submit(); await settle();
    const markup = html(); expect(markup).toContain('回答の結果を確認できません');
    expect(markup).not.toContain('support-answer'); expect(markup).not.toContain('<img'); expect(markup).not.toContain('href=');
    expect(field(render()!).props.value).toContain('Naru'); expect(props.onDraft).not.toHaveBeenCalled();
  });

  it('asks for clarification, keeps the question and makes feedback a manual callback only', async () => {
    await settle(); agree(); fill('単語帳はどう作る？'); submit(); await settle();
    expect(html()).toContain('どちらですか'); expect(field(render()!).props.value).toBe('単語帳はどう作る？');
    expect(props.onDraft).not.toHaveBeenCalled(); find(render()!, 'support-draft').props.onClick();
    expect(props.onDraft).toHaveBeenCalledWith('単語帳はどう作る？');
  });

  it('sends at most the last three user turns and no assistant text, with only three exchanges retained', async () => {
    await settle(); agree();
    for (const text of ['登録前のNaruの記録は？', 'それはいつまで残る？', 'それはどこから引き継ぐ？', 'それは自動ですか？']) {
      fill(text); submit(); await settle();
    }
    fill('それはどうやって確認する？'); submit();
    const sent = lastAsk(); expect(sent.history).toEqual([
      { userText: 'それはいつまで残る？' }, { userText: 'それはどこから引き継ぐ？' }, { userText: 'それは自動ですか？' },
    ]);
    expect(JSON.stringify(sent.history)).not.toContain('この端末');
    await settle(); expect(nodes(render()).filter(node => node.props['data-testid'] === 'support-turn')).toHaveLength(3);
    expect(localStorage.setItem).not.toHaveBeenCalled(); expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('checks a pending request only by the original ID, never repeating ask', async () => {
    (props.onAsk as any).mockImplementationOnce(async (request: Ask) => ({ requestId: request.requestId, status: 'PENDING', version: PRODUCT_SUPPORT_TARGET_VERSION, recheckAllowed: true }));
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit(); await settle();
    const sent = lastAsk(); expect(field(render()!).props.value).toBe(sent.question); expect(field(render()!).props.readOnly).toBe(true);
    submit(); expect(props.onAsk).toHaveBeenCalledTimes(1);
    (props.onAsk as any).mockResolvedValueOnce(answer(sent)); find(render()!, 'support-recheck').props.onClick();
    expect((props.onAsk as any).mock.calls[1][0]).toEqual({ action: 'recheck', requestId: sent.requestId });
    await settle(); expect(html()).toContain('support-answer'); expect(props.onAsk).toHaveBeenCalledTimes(2);
  });

  it('keeps failed input and offers only a state inquiry after a lost response', async () => {
    (props.onAsk as any).mockRejectedValueOnce(new Error('synthetic connection failure'));
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit(); await settle();
    const sent = lastAsk(); expect(html()).toContain('通信が完了せず'); expect(field(render()!).props.value).toBe(sent.question);
    (props.onAsk as any).mockResolvedValueOnce({ requestId: sent.requestId, status: 'UNKNOWN_RESULT', version: PRODUCT_SUPPORT_TARGET_VERSION, recheckAllowed: false });
    find(render()!, 'support-recheck').props.onClick(); await settle();
    expect((props.onAsk as any).mock.calls[1][0]).toEqual({ action: 'recheck', requestId: sent.requestId });
    expect(nodes(render()).some(node => node.props['data-testid'] === 'support-recheck')).toBe(false);
    expect(html()).toContain('自動で作り直しません'); submit(); expect(props.onAsk).toHaveBeenCalledTimes(2);
    find(render()!, 'support-new-question').props.onClick(); fill('発音が聞こえない時は？'); submit();
    expect(lastAsk().action).toBe('ask'); expect(lastAsk().requestId).not.toBe(sent.requestId); await settle();
  });

  it.each([
    '個人情報や秘密情報を取り除いて、操作だけを入力してください。',
    '同じサイトの画面から質問してください。',
    '操作案内の版が変わりました。画面を再読み込みしてください。',
  ])('preserves an editable new ask and the exact safe rejection: %s', async message => {
    (props.onAsk as any).mockImplementationOnce(async (request: Ask) => { throw new ProductSupportNotAdmittedError(message, request.requestId); });
    await settle(); agree(); fill('synthetic@example.test のNaru記録は？'); submit(); await settle();
    const rejected = lastAsk();
    expect(html()).toContain(message); expect(html()).not.toContain('support-pending');
    expect(field(render()!).props.value).toBe(rejected.question);
    expect(field(render()!).props.readOnly).toBe(false); expect(field(render()!).props.disabled).toBe(false);
    expect(consent(render()!).props.checked).toBe(true); expect(props.onAsk).toHaveBeenCalledTimes(1);
    fill('登録前のNaruの記録は？'); submit();
    expect(lastAsk().requestId).not.toBe(rejected.requestId); await settle();
    expect(html()).toContain('support-answer'); expect(props.onAsk).toHaveBeenCalledTimes(2);
  });

  it('keeps the original unknown ask locked when a state inquiry is rejected before admission', async () => {
    (props.onAsk as any).mockRejectedValueOnce(new Error('response lost'));
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit(); await settle();
    const original = lastAsk();
    (props.onAsk as any).mockRejectedValueOnce(new ProductSupportNotAdmittedError('状態照会が拒否されました。', original.requestId));
    find(render()!, 'support-recheck').props.onClick(); await settle();
    expect(field(render()!).props.readOnly).toBe(true); expect(field(render()!).props.value).toBe(original.question);
    expect(html()).toContain('通信が完了せず'); submit(); expect(props.onAsk).toHaveBeenCalledTimes(2);
  });

  it('does not unlock an ask on a rejection for a different request', async () => {
    (props.onAsk as any).mockRejectedValueOnce(new ProductSupportNotAdmittedError('synthetic stale response', 'different-request'));
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit(); await settle();
    expect(field(render()!).props.readOnly).toBe(true); expect(html()).toContain('通信が完了せず');
    submit(); expect(props.onAsk).toHaveBeenCalledTimes(1);
  });

  it.each(['DISABLED', 'CAPACITY_REACHED'] as const)('shows %s without zero/done or automatic retries and retains input', async status => {
    (props.onAsk as any).mockImplementationOnce(async (request: Ask) => ({ requestId: request.requestId, status, version: PRODUCT_SUPPORT_TARGET_VERSION, recheckAllowed: false }));
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit(); await settle();
    expect(html()).toContain(status === 'DISABLED' ? '回答処理は停止しています' : '利用枠に達しています');
    expect(html()).not.toContain('support-answer'); expect(field(render()!).props.value).toContain('Naru');
    submit(); await settle(); expect(props.onAsk).toHaveBeenCalledTimes(1);
  });

  it('clear aborts pending work, resets consent and rejects a late response', async () => {
    const wait = deferred<ProductSupportResponse>(); (props.onAsk as any).mockReturnValueOnce(wait.promise);
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit();
    const sent = lastAsk(); const signal = (props.onAsk as any).mock.calls[0][1] as AbortSignal;
    find(render()!, 'support-clear').props.onClick(); expect(signal.aborted).toBe(true);
    wait.resolve(answer(sent)); await settle(); expect(html()).not.toContain('support-answer');
    expect(field(render()!).props.value).toBe(''); expect(consent(render()!).props.checked).toBe(false);
  });

  it.each(['person', 'workspace', 'role', 'close'] as const)('discards old conversations and pending responses on %s change', async change => {
    const wait = deferred<ProductSupportResponse>(); (props.onAsk as any).mockReturnValueOnce(wait.promise);
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit();
    const sent = lastAsk(); const signal = (props.onAsk as any).mock.calls[0][1] as AbortSignal;
    if (change === 'role') props.role = 'INSTRUCTOR';
    else if (change === 'close') props.open = false;
    else props.contextKey = change === 'person' ? 'other-person:workspace-a' : 'synthetic-person:workspace-b';
    expect(renderToStaticMarkup(render())).not.toContain(sent.question); expect(signal.aborted).toBe(true);
    wait.resolve(answer(sent)); await Promise.resolve(); props.open = true; await settle();
    expect(html()).not.toContain('support-answer'); expect(field(render()!).props.value).toBe(''); expect(consent(render()!).props.checked).toBe(false);
  });

  it('aborts work when generation becomes unavailable, preserving input and allowing a non-generating inquiry', async () => {
    const wait = deferred<ProductSupportResponse>(); (props.onAsk as any).mockReturnValueOnce(wait.promise);
    await settle(); agree(); fill('登録前のNaruの記録は？'); submit();
    const sent = lastAsk(); const signal = (props.onAsk as any).mock.calls[0][1] as AbortSignal;
    props.ready = false; await settle(); expect(signal.aborted).toBe(true); expect(field(render()!).props.value).toBe(sent.question);
    wait.resolve(answer(sent)); await settle(); expect(html()).not.toContain('support-answer');
    (props.onAsk as any).mockResolvedValueOnce({ requestId: sent.requestId, status: 'UNKNOWN_RESULT', version: PRODUCT_SUPPORT_TARGET_VERSION, recheckAllowed: false });
    find(render()!, 'support-recheck').props.onClick(); await settle();
    expect((props.onAsk as any).mock.calls[1][0]).toEqual({ action: 'recheck', requestId: sent.requestId });
  });
});
