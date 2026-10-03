import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type GuestTrialSummary } from '../../contracts/guestTrial';
import { UserRole, type UserProfile } from '../../types';
import { isDemoEmail } from '../../utils/demo';
import { resolveStorageMode } from '../../shared/storageMode';
import { GUEST_TRIAL_QUESTIONS, isGuestTrialAnswerCorrect } from '../../shared/guestTrial';
import { getLatestGuestTrialSummary, importGuestTrial } from '../../services/guestTrial';
import { guestTrialProgressStore } from '../../services/guestTrialProgress';
import { sessionService } from '../../services/session';
import { useGuestTrialProgress } from '../../hooks/useGuestTrialProgress';

const cloud = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE).mode === 'cloudflare';

const GuestTrialImportNotice: React.FC<{ user: UserProfile; onContinueTrial: () => void }> = ({ user, onContinueTrial }) => {
  const device = useGuestTrialProgress();
  const [summary, setSummary] = useState<GuestTrialSummary | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const eligible = user.role === UserRole.STUDENT && !isDemoEmail(user.email);
  const refresh = useCallback(async () => {
    if (!eligible || !cloud) return;
    try { setSummary(await getLatestGuestTrialSummary()); setReadError(null); }
    catch { setReadError('保存済みの体験を確認できませんでした。'); }
  }, [eligible, user.uid]);
  useEffect(() => { void refresh(); }, [refresh]);
  const p = device.progress;
  const anotherAccount = Boolean(p?.boundUserId && p.boundUserId !== user.uid);
  const unsaved = p?.answers.filter(a => !p.importedAttemptIds.includes(a.attemptId)) || [];
  const hasPending = unsaved.length > 0;
  const canContinue = Boolean(p && p.answers.length > 0 && p.answers.length < GUEST_TRIAL_QUESTIONS.length && !anotherAccount);

  const save = async () => {
    if (!p || !hasPending || anotherAccount || !eligible || !cloud || inFlight.current) return;
    inFlight.current = true; setSaving(true); setSaveError(null);
    try {
      const bound = await guestTrialProgressStore.bind(p.trialId, user.uid);
      device.changed(bound);
      const snapshot = bound.progress;
      if (!snapshot || (await sessionService.getSession())?.uid !== user.uid) throw new Error('ACCOUNT_CHANGED');
      const response = await importGuestTrial({
        expectedUserId: user.uid, trialId: snapshot.trialId, version: snapshot.version, answers: snapshot.answers,
      });
      const receipt = response.summary;
      if (receipt.trialId !== snapshot.trialId || receipt.version !== snapshot.version
        || !snapshot.answers.every(a => receipt.answers.some(saved => saved.attemptId === a.attemptId
          && saved.questionId === a.questionId && saved.choiceIndex === a.choiceIndex && saved.answeredAt === a.answeredAt))) throw new Error('RECEIPT_UNCONFIRMED');
      device.changed(await guestTrialProgressStore.acknowledge(snapshot.trialId, user.uid, snapshot.answers.map(a => a.attemptId)));
      setSummary(receipt); setReadError(null);
    } catch {
      setSaveError('保存を確認できませんでした。体験の回答はこの端末に残っています。同じアカウントでもう一度保存してください。');
    } finally { inFlight.current = false; setSaving(false); }
  };

  if (!eligible || device.loading || (!hasPending && !summary && !readError && !canContinue)) return null;
  return <section data-testid="guest-trial-import" className="mx-auto mb-4 w-full max-w-5xl rounded-xl border border-medace-200 bg-white p-4 sm:p-5">
    {hasPending && <>
      <h2 className="text-base font-black text-steady-ink">お試しで練習した{p!.answers.length}語を引き継げます</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">保存先：{user.displayName}のアカウント。通常教材の成績・XPやレベル判定とは別の体験記録です。</p>
      {anotherAccount ? <p role="status" className="mt-3 text-sm leading-relaxed text-slate-600">この体験は別のアカウントで保存を開始しています。このアカウントには引き継げません。</p>
        : !cloud ? <p role="status" className="mt-3 text-sm leading-relaxed text-slate-600">このプレビューではアカウント保存を利用できません。体験の回答はこの端末内だけに残ります。</p>
        : <button type="button" data-testid="guest-import-confirm" disabled={saving} onClick={() => void save()}
          className="mt-3 min-h-11 rounded-xl bg-steady-action px-4 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50">
          {saving ? '保存を確認しています...' : saveError ? '同じ体験をもう一度保存する' : 'このアカウントに体験を保存'}
        </button>}
      {(device.notice || saveError) && <p role={saveError ? 'alert' : 'status'} data-testid="guest-import-message" className="mt-3 text-sm leading-relaxed text-medace-900">{saveError || device.notice}</p>}
    </>}
    {summary && <details data-testid="guest-import-saved" className={hasPending ? 'mt-4 border-t border-slate-100 pt-3' : ''}>
      <summary className="cursor-pointer py-1 text-sm font-bold text-medace-800">保存したお試し練習：{summary.answerCount}語（{summary.correctCount}語正解）</summary>
      <p className="mt-2 text-xs text-slate-500">レベル判定ではありません。アカウントに保存した体験は、端末の体験記録を消しても残ります。</p>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{summary.answers.map(a => {
        const q = GUEST_TRIAL_QUESTIONS.find(question => question.id === a.questionId);
        return q ? <li key={a.attemptId}><strong>{q.word}</strong> — {isGuestTrialAnswerCorrect(a) ? '正解' : '解説を確認'}<p>あなたの回答：{q.choices[a.choiceIndex]}</p><p>{q.explanation}</p></li> : null;
      })}</ul>
    </details>}
    {canContinue && !user.needsOnboarding && <button type="button" data-testid="guest-continue-trial" disabled={saving} onClick={onContinueTrial}
      className="mt-2 min-h-11 rounded-lg px-2 text-sm font-bold text-medace-800 hover:bg-medace-50">お試しの続きを練習する</button>}
    {readError && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600"><p role="status">{readError}</p><button type="button" disabled={saving} data-testid="guest-import-read-retry" onClick={() => void refresh()} className="min-h-11 rounded-lg px-3 font-bold text-medace-800 hover:bg-medace-50">再確認</button></div>}
  </section>;
};

export default GuestTrialImportNotice;
