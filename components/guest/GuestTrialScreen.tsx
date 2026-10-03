import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { GUEST_TRIAL_QUESTIONS, isGuestTrialAnswerCorrect } from '../../shared/guestTrial';
import { guestTrialProgressStore } from '../../services/guestTrialProgress';
import { useGuestTrialProgress } from '../../hooks/useGuestTrialProgress';
import ModalOverlay from '../ModalOverlay';

export interface GuestTrialScreenProps {
  onBack: () => void;
  onOpenAuth: (mode: 'LOGIN' | 'SIGNUP') => void;
  onReturnToAccount?: () => void;
}

const GuestTrialScreen: React.FC<GuestTrialScreenProps> = ({ onBack, onOpenAuth, onReturnToAccount }) => {
  const device = useGuestTrialProgress();
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClear, setShowClear] = useState(false);
  const initialized = useRef<string | null>(null);
  const starting = useRef(false);
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const feedback = useRef<HTMLDivElement | null>(null);
  const progress = device.progress;

  useEffect(() => {
    if (device.loading || progress || starting.current) return;
    starting.current = true;
    guestTrialProgressStore.start().then(device.changed).catch(() => setError('体験を準備できませんでした。もう一度開いてください。'))
      .finally(() => { starting.current = false; });
  }, [device.loading, progress, device.changed]);
  useEffect(() => {
    if (!progress || initialized.current === progress.trialId) return;
    initialized.current = progress.trialId;
    const unanswered = GUEST_TRIAL_QUESTIONS.findIndex(q => !progress.answers.some(a => a.questionId === q.id));
    setIndex(unanswered < 0 ? GUEST_TRIAL_QUESTIONS.length : unanswered);
    setChoice(null);
  }, [progress]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [index]);

  const question = GUEST_TRIAL_QUESTIONS[index];
  const answer = progress?.answers.find(a => a.questionId === question?.id);
  useEffect(() => {
    if (!answer) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: 'nearest' });
  }, [answer?.attemptId]);
  const displayedChoice = answer ? answer.choiceIndex : choice;
  const confirm = async () => {
    if (!progress || !question || choice === null || answer || saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { device.changed(await guestTrialProgressStore.answer(progress.trialId, question.id, choice)); }
    catch (e) { setError(e instanceof Error ? e.message : '回答を残せませんでした。選択はこの画面に残っています。'); }
    finally { saving.current = false; setBusy(false); }
  };
  const clear = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      await guestTrialProgressStore.clear();
      initialized.current = null; setIndex(0); setChoice(null); setShowClear(false);
      device.changed(await guestTrialProgressStore.start());
    } catch { setError('端末の記録を消せませんでした。もう一度お試しください。'); }
    finally { saving.current = false; setBusy(false); }
  };

  return <section data-testid="guest-trial-screen" className="mx-auto w-full max-w-2xl py-3 sm:py-6">
    <button type="button" onClick={onBack} disabled={busy} data-testid="guest-trial-back"
      className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-medace-800 hover:bg-medace-50 disabled:opacity-50">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> ホームへ戻る
    </button>
    <div className="rounded-panel border border-medace-200 bg-white p-4 shadow-sm sm:p-7">
      <p className="text-xs font-bold text-medace-700">登録不要のお試し学習</p>
      <h1 ref={heading} tabIndex={-1} className="mt-2 text-2xl font-black leading-tight text-steady-ink outline-none">
        {question ? 'まずは、1語から' : '5語を練習しました'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">独自の5語を、意味と解説で練習します。</p>
      {(device.notice || device.error || error) && <p role={error || device.error ? 'alert' : 'status'} className="mt-3 rounded-xl border border-medace-200 bg-medace-50 p-3 text-sm leading-relaxed text-medace-900">
        {error || device.error || device.notice}
      </p>}
      {(device.loading || !progress) ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> 体験を準備しています</p>
        : question ? <div className="mt-5" data-testid="guest-trial-question">
          <p className="text-xs font-bold text-slate-500">{index + 1} / {GUEST_TRIAL_QUESTIONS.length}語</p>
          <h2 className="mt-2 break-words text-4xl font-black text-steady-ink">{question.word}</h2>
          <p className="mt-3 text-sm font-bold text-slate-700">意味を選んでください</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {question.choices.map((text, option) => <button key={text} type="button" disabled={Boolean(answer) || busy}
              onClick={() => setChoice(option)} aria-pressed={displayedChoice === option} data-testid={`guest-choice-${option}`}
              className={`min-h-12 rounded-xl border px-4 py-3 text-left text-sm font-bold disabled:opacity-100 ${displayedChoice === option ? 'border-medace-500 bg-medace-50 text-medace-950' : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'} ${busy ? 'opacity-60' : ''}`}>
              {text}
            </button>)}
          </div>
          {answer ? <>
            <div ref={feedback} tabIndex={-1} role="status" data-testid="guest-trial-feedback" className="mt-4 rounded-xl border border-medace-200 bg-medace-50 p-4 text-sm leading-relaxed text-medace-950 outline-none">
              <p className="font-black">{isGuestTrialAnswerCorrect(answer) ? '正解です' : `正解は「${question.choices[question.correctChoiceIndex]}」です`}</p>
              <p className="mt-2">{question.explanation}</p>
            </div>
            <button type="button" data-testid="guest-trial-next" disabled={busy} onClick={() => { setChoice(null); setIndex(i => i + 1); }}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-steady-action px-4 py-3 font-bold text-steady-on-action hover:bg-steady-action-hover">
              {index === GUEST_TRIAL_QUESTIONS.length - 1 ? '練習結果を見る' : '次の単語へ'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </> : <button type="button" data-testid="guest-trial-confirm" onClick={() => void confirm()} disabled={choice === null || busy}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-steady-action px-4 py-3 font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50">
            {busy ? '回答を残しています...' : '答えを確認する'} <Check className="h-4 w-4" aria-hidden="true" />
          </button>}
        </div> : <div className="mt-5" data-testid="guest-trial-result">
          <p className="text-lg font-black text-steady-ink">{progress.answers.filter(isGuestTrialAnswerCorrect).length} / {progress.answers.length}語 正解</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">この練習はレベル判定や通常教材の学習成績には含めません。</p>
          <details className="mt-4 rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer py-1 text-sm font-bold text-medace-800">練習した5語を見る</summary>
            <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{GUEST_TRIAL_QUESTIONS.map(q => <li key={q.id}><strong>{q.word}</strong><p>{q.explanation}</p></li>)}</ul>
          </details>
        </div>}
      {progress && <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-3 text-xs leading-relaxed text-slate-500">レベル診断ではありません。登録前の回答はこの端末だけに7日間残り、続きから再開できます。</p>
        <button type="button" data-testid={onReturnToAccount ? 'guest-return-to-account' : 'guest-save-account'} onClick={() => onReturnToAccount ? onReturnToAccount() : onOpenAuth('SIGNUP')} disabled={busy}
          className={`${question ? 'border border-medace-200 bg-white text-medace-900 hover:bg-medace-50' : 'bg-steady-action text-steady-on-action hover:bg-steady-action-hover'} min-h-12 w-full rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50`}>
          {onReturnToAccount ? 'ホームで体験の保存を確認' : question ? 'ここまでの体験を登録して保存' : '登録してこの体験を保存'}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{onReturnToAccount ? '体験の回答は端末に残ります。ホームで保存先を確認して引き継げます。' : '登録後に保存先を確認して引き継げます。登録せず練習を続けることもできます。'}</p>
        {!onReturnToAccount && <button type="button" disabled={busy} onClick={() => onOpenAuth('LOGIN')} data-testid="guest-existing-login"
          className="mt-2 min-h-11 rounded-lg px-2 text-sm font-bold text-medace-800 hover:bg-medace-50">アカウントをお持ちの方はログイン</button>}
        {progress.answers.length > 0 && <button type="button" disabled={busy} onClick={() => setShowClear(true)} data-testid="guest-clear-opener"
          className="mt-2 block min-h-11 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-50">端末の体験記録を消して始め直す</button>}
      </div>}
    </div>
    {showClear && <ModalOverlay ariaLabelledBy="guest-clear-title" onClose={() => { if (!busy) setShowClear(false); }}
      initialFocusSelector="[data-testid=guest-clear-cancel]" returnFocusSelector="[data-testid=guest-clear-opener]" panelClassName="max-w-md">
      <div className="rounded-panel bg-white p-5">
        <h2 id="guest-clear-title" className="text-lg font-black text-steady-ink">端末の体験記録を消しますか？</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">この端末のお試し回答を消して新しく始めます。アカウントに保存済みの記録は消えません。</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" data-testid="guest-clear-cancel" disabled={busy} onClick={() => setShowClear(false)} className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">戻る</button>
          <button type="button" data-testid="guest-clear-confirm" disabled={busy} onClick={() => void clear()} className="min-h-11 rounded-xl bg-steady-action px-3 py-2 text-sm font-bold text-steady-on-action">消して始め直す</button>
        </div>
      </div>
    </ModalOverlay>}
  </section>;
};

export default GuestTrialScreen;
