import React, { useRef, useState } from 'react';
import { UserRole, type UserProfile } from '../../types';
import { useGuestLearningProgress } from '../../hooks/useGuestLearningProgress';
import { guestLearningProgressStore } from '../../services/guestLearningProgress';
import { importGuestLearning } from '../../services/guestLearning';
import { sessionService } from '../../services/session';
import { resolveStorageMode } from '../../shared/storageMode';
import { isDemoEmail } from '../../utils/demo';

const cloud = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE).mode === 'cloudflare';

const GuestLearningImportNotice: React.FC<{ user: UserProfile }> = ({ user }) => {
  const device = useGuestLearningProgress();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const eligible = user.role === UserRole.STUDENT && !isDemoEmail(user.email);
  const progress = device.progress;
  const anotherAccount = Boolean(progress?.boundUserId && progress.boundUserId !== user.uid);
  const pending = progress?.attempts.filter(a => !progress.importedAttemptIds.includes(a.attemptId)) || [];
  const save = async () => {
    if (!progress || !eligible || !cloud || anotherAccount || lock.current || !pending.length) return;
    lock.current = true; setSaving(true); setError(null);
    try {
      const bound = await guestLearningProgressStore.bind(progress.sessionId, user.uid);
      device.changed(bound);
      const snapshot = bound.progress;
      if (!snapshot || snapshot.boundUserId !== user.uid) throw new Error('ACCOUNT_CHANGED');
      const batches = snapshot.attempts.filter(a => !snapshot.importedAttemptIds.includes(a.attemptId));
      for (let offset = 0; offset < batches.length; offset += 100) {
        if ((await sessionService.getSession())?.uid !== user.uid) throw new Error('ACCOUNT_CHANGED');
        const attempts = batches.slice(offset, offset + 100);
        const response = await importGuestLearning({ expectedUserId: user.uid, sessionId: snapshot.sessionId, version: snapshot.version, attempts });
        const submitted = new Set(attempts.map(a => a.attemptId));
        const successful = response.importedAttemptIds;
        const failed = response.failedAttempts;
        if (response.sessionId !== snapshot.sessionId || response.version !== snapshot.version
          || !Number.isSafeInteger(response.importedAt) || response.importedAt <= 0
          || !Array.isArray(successful) || !Array.isArray(failed)
          || new Set(successful).size !== successful.length || new Set(failed.map(a => a.attemptId)).size !== failed.length
          || successful.some(id => !submitted.has(id))
          || failed.some(a => !submitted.has(a.attemptId) || successful.includes(a.attemptId) || typeof a.retryable !== 'boolean')
          || attempts.some(a => !successful.includes(a.attemptId) && !failed.some(f => f.attemptId === a.attemptId))) throw new Error('RECEIPT_UNCONFIRMED');
        if ((await sessionService.getSession())?.uid !== user.uid) throw new Error('ACCOUNT_CHANGED');
        if (successful.length) device.changed(await guestLearningProgressStore.acknowledge(snapshot.sessionId, user.uid, successful));
        if (failed.length) throw new Error('PARTIAL_SAVE');
      }
    } catch {
      setError('保存を確認できなかった回答が端末に残っています。同じアカウントでもう一度保存してください。確認済みの回答は重複しません。');
    } finally { lock.current = false; setSaving(false); }
  };
  if (!eligible || device.loading || !progress || !progress.attempts.length) return null;
  if (anotherAccount) return <section data-testid="guest-learning-import" className="mx-auto mb-4 max-w-5xl rounded-xl border border-medace-200 bg-white p-4">
    <h2 className="font-black text-steady-ink">別のアカウントに紐づいた端末記録</h2>
    <p role="status" className="mt-2 text-sm leading-relaxed text-slate-600">別のアカウントで保存を開始したNaruの記録です。このアカウントには表示・引継ぎできません。</p>
  </section>;
  return <section data-testid="guest-learning-import" className="mx-auto mb-4 max-w-5xl rounded-xl border border-medace-200 bg-white p-4">
    <h2 className="font-black text-steady-ink">{pending.length ? `登録前のNaru学習 ${pending.length}回答を保存できます` : `登録前のNaru学習 ${progress.importedAttemptIds.length}回答を保存しました`}</h2>
    {pending.length > 0 && <>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">保存先：{user.displayName}。単語の理解度を復習記録へ引き継ぎます。XPは加算しません。</p>
      {anotherAccount ? <p role="status" className="mt-2 text-sm">別のアカウントで保存を開始した記録です。このアカウントには引き継げません。</p>
        : !cloud ? <p role="status" className="mt-2 text-sm">このプレビューではアカウント保存を利用できません。</p>
          : <button type="button" data-testid="guest-learning-import-confirm" disabled={saving} onClick={() => void save()} className="ui-button-primary mt-3">{saving ? '保存を確認しています…' : error ? '同じ回答をもう一度保存' : 'このアカウントに学習記録を保存'}</button>}
    </>}
    {(error || device.notice) && <p role={error ? 'alert' : 'status'} className="mt-2 text-sm leading-relaxed text-medace-900">{error || device.notice}</p>}
  </section>;
};
export default GuestLearningImportNotice;
