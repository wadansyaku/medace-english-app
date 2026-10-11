import React, { useEffect, useRef, useState } from 'react';
import { PRODUCT_SUPPORT_MAX_QUESTION_CHARS, type ProductSupportRequest, type ProductSupportResponse } from '../contracts/productSupport';
import {
  PRODUCT_SUPPORT_TARGET_VERSION, type ProductSupportKnowledgeSource, type ProductSupportRole,
} from '../shared/productSupportKnowledge';
import { searchProductSupportConversation, validateProductSupportAnswer } from '../shared/productSupportConversation';
import { buildProductSupportSourcePath } from './ProductSupportSourcePage';

export interface ProductSupportConversationProps {
  role: ProductSupportRole;
  /** The parent includes the current person and workspace in this identity. */
  contextKey: string;
  onAsk: (request: ProductSupportRequest, signal: AbortSignal) => Promise<ProductSupportResponse>;
  onDraft: (question: string) => void;
  ready: boolean;
  disabledReason?: string;
  open?: boolean;
  targetVersion?: string;
}

type Ask = Extract<ProductSupportRequest, { action: 'ask' }>;
type Turn = {
  id: string; question: string; answer: string; unknown: boolean; providerUsed: boolean;
  sources: readonly ProductSupportKnowledgeSource[];
};
type Pending = {
  request: Ask;
  status: Exclude<ProductSupportResponse['status'], 'ANSWERED'> | 'CONNECTION_FAILED';
  recheckAllowed: boolean;
};
const control = 'min-h-11 rounded-xl border border-medace-200 bg-white px-3 py-2 text-sm font-bold text-[#2F1609] disabled:opacity-50';
const pendingCopy: Record<Pending['status'], string> = {
  DISABLED: '回答処理は停止しています。入力は残っています。',
  CAPACITY_REACHED: '会話回答の利用枠に達しています。入力は残っています。',
  PENDING: '回答の処理中です。状態の確認は、回答を作り直す操作ではありません。',
  UNKNOWN_RESULT: '回答の結果を確認できません。作成済みでも本文を取り戻せない場合があります。自動で作り直しません。',
  CONNECTION_FAILED: '通信が完了せず、処理結果はまだ確認できません。入力は残っています。状態だけを確認できます。',
};

const ConversationSession: React.FC<ProductSupportConversationProps> = ({
  role, onAsk, onDraft, ready, disabledReason, targetVersion = PRODUCT_SUPPORT_TARGET_VERSION,
}) => {
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputError, setInputError] = useState('');
  const busyRef = useRef(false);
  const alive = useRef(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const latestAnswer = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; ++sequence.current;
      controller.current?.abort(); controller.current = null;
      busyRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready || !controller.current) return;
    ++sequence.current; controller.current.abort(); controller.current = null;
    busyRef.current = false; setBusy(false);
    setPending(previous => previous ? { ...previous, status: 'UNKNOWN_RESULT', recheckAllowed: true } : null);
  }, [ready]);
  useEffect(() => {
    if (turns.length) {
      latestAnswer.current?.focus({ preventScroll: true });
      latestAnswer.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [turns]);

  const clear = () => {
    ++sequence.current; controller.current?.abort(); controller.current = null;
    busyRef.current = false; setBusy(false); setPending(null); setTurns([]);
    setQuestion(''); setConsent(false); setInputError(''); input.current?.focus();
  };
  const newQuestion = () => {
    if (busyRef.current) return;
    setPending(null); setQuestion(''); setInputError(''); input.current?.focus();
  };
  const send = async (request: ProductSupportRequest, original: Ask) => {
    if (busyRef.current || !alive.current) return;
    busyRef.current = true; setBusy(true); setInputError('');
    const current = ++sequence.current;
    const abort = new AbortController(); controller.current = abort;
    setPending({ request: original, status: 'PENDING', recheckAllowed: true });
    const currentResponse = () => alive.current && current === sequence.current && !abort.signal.aborted;
    try {
      const response = await onAsk(request, abort.signal);
      if (!currentResponse()) return;
      if (response.requestId !== original.requestId || response.version !== targetVersion) {
        setPending({ request: original, status: 'UNKNOWN_RESULT', recheckAllowed: false }); return;
      }
      if (response.status !== 'ANSWERED') {
        if (!['DISABLED', 'CAPACITY_REACHED', 'PENDING', 'UNKNOWN_RESULT'].includes(response.status)) {
          setPending({ request: original, status: 'UNKNOWN_RESULT', recheckAllowed: false }); return;
        }
        setPending({ request: original, status: response.status, recheckAllowed: response.recheckAllowed === true });
        return;
      }
      if (response.kind !== 'ANSWER' && response.kind !== 'CLARIFICATION') {
        setPending({ request: original, status: 'UNKNOWN_RESULT', recheckAllowed: false }); return;
      }
      const context = { question: original.question, role, history: original.history, targetVersion };
      const decision = searchProductSupportConversation(context);
      const unknown = response.kind === 'CLARIFICATION';
      const checked = validateProductSupportAnswer({
        answer: response.answer, sourceIds: response.sourceIds, unknown,
        clarification: unknown && decision.kind === 'clarification' ? response.answer : null,
      }, context, decision);
      if (checked.valid !== true || typeof response.providerUsed !== 'boolean') {
        setPending({ request: original, status: 'UNKNOWN_RESULT', recheckAllowed: false }); return;
      }
      setTurns(previous => [...previous, {
        id: original.requestId, question: original.question, answer: checked.value.answer,
        unknown: checked.value.unknown, providerUsed: response.providerUsed, sources: checked.sources,
      }].slice(-3));
      setPending(null);
      if (!unknown) setQuestion(previous => previous.trim() === original.question ? '' : previous);
    } catch {
      if (currentResponse()) setPending({ request: original, status: 'CONNECTION_FAILED', recheckAllowed: true });
    } finally {
      if (currentResponse()) {
        controller.current = null; busyRef.current = false; setBusy(false);
      }
    }
  };
  const ask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !consent || busyRef.current || pending) return;
    const text = question.trim();
    if (!text || text.length > PRODUCT_SUPPORT_MAX_QUESTION_CHARS) {
      setInputError(`質問を${PRODUCT_SUPPORT_MAX_QUESTION_CHARS}文字以内で入力してください。`); input.current?.focus(); return;
    }
    const request: Ask = {
      action: 'ask', requestId: crypto.randomUUID(), question: text,
      history: turns.slice(-3).map(turn => ({ userText: turn.question })),
      privacyConsent: true, targetVersion,
    };
    void send(request, request);
  };

  return <section aria-label="製品についての会話" className="min-w-0 rounded-2xl border border-medace-100 bg-white p-4 text-[#2F1609]">
    <h3 className="sr-only">Steady Studyの使い方を聞く</h3>
    {(turns.length > 0 || pending) && <button type="button" className={control} onClick={clear} data-testid="support-clear">会話を消す</button>}
    <div role="log" aria-label="質問と回答" aria-live="polite" aria-relevant="additions" className={`${turns.length || pending ? 'mt-3 ' : ''}max-h-80 space-y-4 overflow-y-auto [overflow-wrap:anywhere]`}>
      {turns.map((turn, index) => <article key={turn.id} className="min-w-0 space-y-2" data-testid="support-turn">
        <p className="whitespace-pre-wrap rounded-xl bg-[#FDF3ED] p-3 text-sm leading-6"><span className="font-bold">あなた: </span>{turn.question}</p>
        <p ref={index === turns.length - 1 ? latestAnswer : undefined} tabIndex={-1} className="whitespace-pre-wrap text-sm leading-6" data-testid="support-answer">{turn.answer}</p>
        <p className="text-xs text-[#75452E]">{turn.providerUsed ? 'AIによる回答。根拠も確認してください。' : '公開案内からの回答（生成OFF）'}</p>
        {turn.sources.map(source => <details key={source.sourceId} className="rounded-xl border border-medace-100 p-3" data-testid="support-source">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">根拠を読む: {source.title}</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{source.content}</p>
          <p className="mt-2 text-xs leading-5">根拠ID: {source.sourceId} · 確認日: {source.checkedAt} · 仕様版: {source.targetVersion}</p>
          <a href={buildProductSupportSourcePath({ sourceId: source.sourceId, targetVersion: source.targetVersion })}
            className="mt-2 inline-flex min-h-11 items-center text-sm font-bold underline">この根拠を別のページで読む</a>
        </details>)}
        {turn.unknown && <button type="button" className={control} onClick={() => onDraft(turn.question)} data-testid="support-draft">この質問を報告の下書きにする</button>}
      </article>)}
      {pending && <div className="rounded-xl bg-[#FDF3ED] p-3 text-sm leading-6" data-testid="support-pending">
        <p className="whitespace-pre-wrap"><span className="font-bold">あなた: </span>{pending.request.question}</p>
        <p role={pending.status === 'CONNECTION_FAILED' ? 'alert' : 'status'} className="mt-2">{busy ? '確認しています…' : pendingCopy[pending.status]}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {pending.recheckAllowed && <button type="button" className={control} disabled={busy} onClick={() => void send({ action: 'recheck', requestId: pending.request.requestId }, pending.request)} data-testid="support-recheck">状態だけを確認する</button>}
          <button type="button" className={control} disabled={busy} onClick={newQuestion} data-testid="support-new-question">新しい質問を書く</button>
          {pending.status === 'UNKNOWN_RESULT' && <button type="button" className={control} disabled={busy} onClick={() => onDraft(pending.request.question)} data-testid="support-pending-draft">この質問を報告の下書きにする</button>}
        </div>
      </div>}
    </div>
    <form className={`${turns.length || pending ? 'mt-4 ' : ''}space-y-3`} onSubmit={ask} aria-busy={busy} data-testid="support-form">
      <label className="block text-sm font-bold">質問
        <textarea ref={input} aria-label="製品についての質問" rows={2} maxLength={PRODUCT_SUPPORT_MAX_QUESTION_CHARS} value={question}
          disabled={busy} readOnly={pending !== null} onChange={event => setQuestion(event.target.value)}
          placeholder="たとえば、登録なしで使った記録はどうなりますか？"
          className="mt-1 w-full min-w-0 rounded-xl border border-medace-200 bg-white p-3 text-base font-normal leading-6" />
      </label>
      {!ready && <p role="status" className="text-sm leading-6" data-testid="support-disabled">{disabledReason || '会話の回答処理は停止しています。質問は入力できますが、送信しません。'}</p>}
      {inputError && <p role="alert" className="text-sm text-red-800">{inputError}</p>}
      <details className="text-sm leading-6">
        <summary className="min-h-11 cursor-pointer py-2 font-bold">送信内容と会話の使い方</summary>
        <p>自分の言葉で質問できます。続きの質問には、直近3回のあなたの発言を使います。分からない内容は確認をお願いするか、報告の下書きにできます。</p>
        <p>質問、直近3回のあなたの発言、公開の製品説明をCloudflare上のBot処理へ送ります。回答生成を有効にした場合は、同じ範囲をCloudflare AIにも渡します。AIが回答した本文は次の質問に送信しません。</p>
        <p className="mt-2">氏名・連絡先・答案・教材本文は入力しないでください。このBotの同意は英作文の外部送信同意と別です。</p>
      </details>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input type="checkbox" aria-label="Bot専用のCloudflare送信に同意する" className="mt-1 h-5 w-5 shrink-0" checked={consent} disabled={busy}
          onChange={event => setConsent(event.target.checked)} />
        <span>質問・直近3発言・公開案内を、このBot専用のCloudflare処理へ送信することに同意します。個人情報は入力しないでください。</span>
      </label>
      <button type="submit" className={`${control} bg-[#F66D0B]`} disabled={!ready || !consent || !question.trim() || busy || pending !== null} data-testid="support-submit">{busy ? '確認中…' : '質問を送信する'}</button>
    </form>
    <p className="mt-3 text-xs leading-5 text-[#75452E]">会話はこの画面を開いている間だけ表示します。閉じる、ログアウト、利用者や作業場所を切り替えると消えます。</p>
  </section>;
};

const ProductSupportConversation: React.FC<ProductSupportConversationProps> = props => {
  if (props.open === false) return null;
  // A keyed session removes old text immediately, even before effect cleanup.
  return <ConversationSession key={JSON.stringify([props.role, props.contextKey, props.targetVersion ?? PRODUCT_SUPPORT_TARGET_VERSION])} {...props} />;
};

export default ProductSupportConversation;
