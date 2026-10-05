import React, { useEffect, useRef } from 'react';
import type { WritingAssignment } from '../../../types';
import { useWritingDraftEditor } from '../../../hooks/useWritingDraftEditor';
import ModalOverlay from '../../ModalOverlay';

interface Props { assignment: WritingAssignment; onClose: () => void; legacyScanner: React.ReactNode; }
const WritingTeacherDraftModal: React.FC<Props> = ({ assignment, onClose, legacyScanner }) => {
  const draft = useWritingDraftEditor(assignment.id, assignment.attemptCount + 1);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (draft.error) errorRef.current?.focus(); }, [draft.error]);
  if (draft.capabilities?.gradingEnabled === true) return <>{legacyScanner}</>;
  const result = draft.aiDraft?.result;
  return <ModalOverlay ariaLabel={`未評価の答案下書き: ${assignment.promptTitle}`} onClose={() => { if (!draft.busy) onClose(); }} closeOnOverlayClick={!draft.busy}
    panelClassName="max-w-3xl max-h-[95dvh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{assignment.studentName}</p><h3 className="mt-1 text-xl font-black text-slate-950">答案の下書き（未評価）</h3></div>
      <button type="button" disabled={draft.busy} onClick={onClose} className="min-h-11 px-3 font-bold text-slate-600">閉じる</button></div>
    <p className="mt-3 text-sm leading-6 text-slate-600">{draft.capabilities?.state === 'ENABLED' ? 'GPTの結果は講師確認用の下書きです。' : 'AIは未有効、または利用可否が未確認です。'} 保存・GPT下書き作成では成績と提出は確定しません。PDFは保存できますが、GPTによるPDF読取は未有効です。</p>
    {draft.error && <div ref={errorRef} tabIndex={-1} role="alert" data-testid="writing-teacher-draft-error" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900">{draft.error}</div>}
    {draft.notice && <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{draft.notice}</p>}
    <button type="button" onClick={draft.reload} disabled={draft.busy || draft.loading} className="mt-3 min-h-11 rounded-xl border px-3 text-sm font-bold">{draft.loading ? '下書きを確認中' : '下書きを再取得'}</button>
    {draft.saved?.assets.map(asset => <div key={asset.id} className="mt-2 flex items-start justify-between gap-2 rounded-xl border p-3 text-sm"><span className="min-w-0 break-all">保存済み: {asset.fileName}</span><button type="button" disabled={draft.busy || draft.loading} onClick={() => draft.removeAsset(asset.id)} className="min-h-11 shrink-0 px-2">外す</button></div>)}
    <label htmlFor="writing-teacher-draft-files" className="mt-4 block text-sm font-bold">画像最大4件／PDF 1件</label>
    <input id="writing-teacher-draft-files" data-testid="writing-teacher-draft-files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple disabled={draft.busy || draft.loading} onChange={event => draft.setFiles(Array.from(event.target.files || []))} className="mt-2 block w-full min-w-0 rounded-xl border p-3 text-sm" />
    {draft.files.map((file, index) => <p key={index} className="mt-1 break-all text-xs text-slate-600">未保存: {file.name}</p>)}
    <label htmlFor="writing-teacher-draft-manual" className="mt-4 block text-sm font-bold">答案本文（手入力）</label>
    <textarea id="writing-teacher-draft-manual" data-testid="writing-teacher-draft-manual" value={draft.manual} readOnly={draft.busy || draft.loading} onChange={event => draft.setManual(event.target.value)} rows={6} className="mt-2 w-full rounded-xl border p-3 text-sm" />
    <button type="button" data-testid="writing-teacher-draft-save" onClick={() => void draft.save()} disabled={!draft.loaded || draft.loading || draft.busy} className="mt-3 min-h-11 rounded-xl bg-steady-action px-4 py-2 font-bold text-steady-on-action">{draft.busy ? '処理中' : '下書きを保存（未評価）'}</button>
    <div className="mt-5 border-t pt-4"><p className="text-sm font-bold">GPT下書き（講師確認用・未評価）</p><p className="mt-1 text-xs leading-5 text-slate-600">入力を保存してから実行できます。画像読取は画像のみ、コメント下書きは保存済み本文を使います。</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" data-testid="writing-gpt-ocr" disabled={draft.busy || !draft.canOcr} onClick={() => void draft.generate('OCR')} className="min-h-11 rounded-xl border px-3 text-sm font-bold disabled:opacity-50">画像の読取下書き</button>
        <button type="button" data-testid="writing-gpt-feedback" disabled={draft.busy || !draft.canFeedback} onClick={() => void draft.generate('WRITING_FEEDBACK')} className="min-h-11 rounded-xl border px-3 text-sm font-bold disabled:opacity-50">コメント下書き</button>
        {draft.hasPendingRequest && <button type="button" disabled={draft.busy} onClick={() => void draft.generate(draft.pendingOperation || 'WRITING_FEEDBACK', true)} className="min-h-11 rounded-xl border px-3 text-sm">結果を再確認</button>}</div>
      {draft.aiDraft && <div data-testid="writing-gpt-unassessed-result" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6"><p className="font-bold">未評価・人手確認が必要です</p>
        {draft.aiDraft.status !== 'READY' && <p>{draft.aiDraft.reason || '処理結果はまだ確認できません。'}</p>}
        {result?.operation === 'OCR' && <><p className="mt-2 whitespace-pre-wrap break-words">{result.transcript}</p><button type="button" disabled={draft.busy} onClick={() => draft.setManual(result.transcript)} className="mt-2 min-h-11 rounded-xl border bg-white px-3 font-bold">この文を手入力欄に使う（保存は別操作）</button></>}
        {result?.operation === 'WRITING_FEEDBACK' && <><p className="mt-2 font-bold">良かった点の候補</p>{result.strengths.map((value, index) => <p key={index}>{value}</p>)}<p className="mt-2 font-bold">改善点の候補</p>{result.improvementPoints.map((value, index) => <p key={index}>{value}</p>)}<p className="mt-2 whitespace-pre-wrap break-words">{result.correctedDraft}</p>{result.sentenceCorrections.map((item, index) => <div key={index} className="mt-2 border-t pt-2"><p>原文: {item.before}</p><p>修正案: {item.after}</p><p>{item.reason}</p></div>)}</>}
      </div>}
    </div>
  </ModalOverlay>;
};
export default WritingTeacherDraftModal;
