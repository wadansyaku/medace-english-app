import React, { useEffect, useMemo, useRef } from 'react';
import { AlertCircle, CheckCircle2, FileText, Image, ListChecks, Loader2, ScanSearch, X } from 'lucide-react';

import type { WritingAiCapabilities, WritingInputDraft } from '../../contracts/writing-ai-drafts';
import type { WritingAssignment } from '../../types';
import {
  formatWritingUploadBytes,
  resolveWritingUploadFileKind,
  resolveWritingUploadMimeType,
  validateWritingSubmissionFiles,
} from '../../utils/writingSubmissionValidation';
import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStepPager from '../mobile/MobileStepPager';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import { SUBMIT_FLOW_STEPS } from './studentSectionUtils';

interface WritingStudentSubmitSheetProps {
  submitTarget: WritingAssignment;
  isMobileViewport: boolean;
  files: File[];
  manualTranscript: string;
  mobileSubmitStep: number;
  submitting: boolean;
  submissionError?: string | null;
  capabilities?: WritingAiCapabilities | null;
  savedInputDraft?: WritingInputDraft | null;
  draftLoading?: boolean;
  draftLoaded?: boolean;
  draftLoadError?: string | null;
  draftSavedMessage?: string | null;
  onRetryDraftLoad?: () => void;
  onRemoveSavedAsset?: (id: string) => void;
  onClose: () => void;
  onChangeFiles: (files: File[]) => void;
  onChangeManualTranscript: (value: string) => void;
  onChangeStep: (step: number) => void;
  onSubmit: () => void;
}

const WritingStudentSubmitSheet: React.FC<WritingStudentSubmitSheetProps> = ({
  submitTarget,
  isMobileViewport,
  files,
  manualTranscript,
  mobileSubmitStep,
  submitting,
  submissionError, capabilities, savedInputDraft, draftLoading = false, draftLoaded = false,
  draftLoadError, draftSavedMessage, onRetryDraftLoad, onRemoveSavedAsset,
  onClose,
  onChangeFiles,
  onChangeManualTranscript,
  onChangeStep,
  onSubmit,
}) => {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (submissionError || draftLoadError) errorRef.current?.focus(); }, [submissionError, draftLoadError]);
  const gradingEnabled = capabilities?.gradingEnabled === true;
  const steps = SUBMIT_FLOW_STEPS.map((step, index) => index === 2 && !gradingEnabled ? { ...step, label: '下書き保存' } : step);
  const fileValidation = useMemo(() => validateWritingSubmissionFiles(files), [files]);
  const fileRows = useMemo(() => files.map((file) => ({
    file,
    resolvedMimeType: resolveWritingUploadMimeType(file),
    kind: resolveWritingUploadFileKind(file),
  })), [files]);
  const displayValidation = !gradingEnabled && files.length === 0
    ? { valid: true, message: '本文だけでも下書き保存できます。画像・PDFの追加は任意です。' }
    : fileValidation;
  const currentStep = steps[mobileSubmitStep] || steps[0];
  const hasDraftInput = manualTranscript.trim().length > 0 || Boolean(savedInputDraft?.assets.length) || Boolean(savedInputDraft?.revision);
  const canSave = draftLoaded && !draftLoading && !submitting && (fileValidation.valid || (!gradingEnabled && files.length === 0 && hasDraftInput));
  const actionLabel = gradingEnabled ? (submissionError ? '処理を再試行する' : '答案を提出する') : (submissionError ? '下書き保存を再試行' : '下書きを保存（未評価）');
  const validationTone = displayValidation.valid
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-800';

  const mobileSubmitActions = useMemo(() => {
    if (!isMobileViewport) return null;
    if (mobileSubmitStep === 0) {
      return (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onChangeStep(1)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-600 px-5 py-3 text-sm font-bold text-slate-950"
          >
            <ListChecks className="h-4 w-4" />
            ファイル選択へ進む
          </button>
        </div>
      );
    }
    if (mobileSubmitStep === 1) {
      return (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onChangeStep(0)}
            className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={() => onChangeStep(2)}
            disabled={draftLoading || (files.length > 0 && !fileValidation.valid)}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-medace-600 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            {gradingEnabled ? '最終送信へ進む' : '本文・保存へ進む'}
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => onChangeStep(1)}
          className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
        >
          戻る
        </button>
        <button
          type="button"
          data-testid="writing-submit-upload"
          onClick={onSubmit}
          disabled={!canSave}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-steady-action px-5 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          {actionLabel}
        </button>
      </div>
    );
  }, [fileValidation.valid, isMobileViewport, mobileSubmitStep, onChangeStep, onSubmit, submitting, submissionError, gradingEnabled, draftLoading, canSave, actionLabel]);

  return (
    <MobileSheetDialog
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      mode={isMobileViewport ? 'fullscreen' : 'sheet'}
      ariaLabel={`${gradingEnabled ? '英作文提出' : '英作文下書き'}: ${submitTarget.promptTitle}`}
      panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-4xl sm:rounded-[28px] sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[28px] sm:px-6">
        <button
          type="button"
          onClick={() => {
            if (submitting) return;
            onClose();
          }}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="pr-12">
          <p className="text-xs font-bold text-slate-400">{gradingEnabled ? '英作文提出' : '英作文の下書き'}</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{submitTarget.promptTitle}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {gradingEnabled ? '提出条件を確認してからファイルを選び、最後に送信を確定します。' : '本文・画像・PDFを下書きとして保存できます。成績と提出は確定しません。'}
          </p>
          {isMobileViewport && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-medace-200 bg-medace-50 px-3 py-1.5 text-xs font-bold text-medace-800">
              手順 {mobileSubmitStep + 1} / {SUBMIT_FLOW_STEPS.length} {currentStep.label}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="space-y-4">
          {(submissionError || draftLoadError) && (
            <div ref={errorRef} tabIndex={-1} role="alert" data-testid="writing-submit-error" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
              <p className="font-bold">{draftLoadError ? '下書きの復元を確認できません' : gradingEnabled ? '提出完了を確認できません' : '下書き保存を確認できません'}</p>
              <p className="mt-1">{submissionError || draftLoadError}</p>
            </div>
          )}
          <div data-testid="writing-draft-state" className="rounded-2xl border border-medace-100 bg-medace-50 p-4 text-sm leading-6 text-medace-900">
            {draftLoading ? '保存済みの下書きを確認中です。' : capabilities?.state === 'ENABLED'
              ? 'GPTの処理結果は未評価の下書きです。講師の確認が必要で、成績は確定しません。'
              : capabilities ? 'AIは未有効です。下書きはAIなしで保存でき、成績は確定しません。'
                : 'AIの利用可否は未確認です。下書きとして保存し、成績は確定しません。'}
            <p className="mt-1 text-xs">PDFは保存できますが、GPTによるPDF読取は未有効です。</p>
            {(draftLoadError || (!gradingEnabled && submissionError)) && <button type="button" onClick={onRetryDraftLoad} disabled={draftLoading || submitting} className="mt-2 min-h-11 rounded-xl border border-medace-200 bg-white px-3 py-2 font-bold">下書きを再取得する</button>}
          </div>
          {draftSavedMessage && <div role="status" aria-live="polite" data-testid="writing-draft-saved" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{draftSavedMessage}</div>}
          {Boolean(savedInputDraft?.assets.length) && <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-bold">保存済みの添付（再選択不要）</p>
            {savedInputDraft!.assets.map(asset => <div key={asset.id} className="mt-2 flex min-w-0 items-start justify-between gap-2 text-sm">
              <span className="min-w-0 break-all">{asset.fileName} / {formatWritingUploadBytes(asset.byteSize)}</span>
              <button type="button" disabled={submitting || draftLoading} onClick={() => onRemoveSavedAsset?.(asset.id)} className="min-h-11 shrink-0 px-2 text-slate-600">外す</button>
            </div>)}
          </div>}
          {isMobileViewport && (
            <MobileStepPager
              steps={steps}
              activeStep={mobileSubmitStep}
              onSelectStep={onChangeStep}
            />
          )}

          {(!isMobileViewport || mobileSubmitStep === 0) && (
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-600 text-xs font-black text-slate-950">1</div>
                <div>
                  <div className="text-sm font-black text-slate-950">提出条件</div>
                  <div className="mt-1 text-sm text-slate-500">形式と提出コード、提出回数を確認します。</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出コード</div>
                  <div className="mt-2 text-lg font-black text-slate-950">{submitTarget.submissionCode}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出形式</div>
                  <div className="mt-2 text-sm font-black text-slate-950">PDF 1枚 / 画像最大4枚</div>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <div className="text-xs font-bold text-slate-400">提出回数</div>
                  <div className="mt-2 text-sm font-black text-slate-950">{submitTarget.attemptCount + 1} 回目 / 最大 {submitTarget.maxAttempts} 回</div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white bg-white px-4 py-3 text-sm leading-relaxed text-slate-600">
                撮影する場合は英文全体が読めることを確認してください。氏名など、不要な個人情報は写さないでください。
              </div>
            </section>
          )}

          {(!isMobileViewport || mobileSubmitStep === 1) && (
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-600 text-xs font-black text-slate-950">2</div>
                <div>
                  <div className="text-sm font-black text-slate-950">答案ファイルを選ぶ</div>
                  <div className="mt-1 text-sm text-slate-500">スマホで撮影した画像か PDF を選択します。</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-black text-slate-950">
                    <FileText className="h-4 w-4 text-medace-600" />
                    PDF
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">1ファイルだけ提出できます。</div>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-black text-slate-950">
                    <Image className="h-4 w-4 text-medace-600" />
                    画像
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">JPEG / PNG / WebP を最大4枚まで提出できます。</div>
                </div>
              </div>
              <input
                data-testid="writing-student-file-input"
                type="file"
                accept="application/pdf,image/*"
                multiple
                disabled={submitting || draftLoading}
                onChange={(event) => onChangeFiles(Array.from(event.target.files || []))}
                className="mt-4 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-bold"
              />
              {files.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {fileRows.map(({ file, resolvedMimeType, kind }) => (
                    <div key={`${file.name}-${file.size}`} className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{file.name}</div>
                          <div className="mt-1 text-xs text-slate-400">{resolvedMimeType || '形式未判定'} / {formatWritingUploadBytes(file.size)}</div>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                          {kind === 'pdf' ? 'PDF' : kind === 'image' ? '画像' : '対象外'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                  まだファイルは選択されていません。
                </div>
              )}
              <div data-testid="writing-file-validation-message" className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${validationTone}`}>
                {displayValidation.valid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{displayValidation.message}</span>
              </div>
            </section>
          )}

          {(!isMobileViewport || mobileSubmitStep === 2) && (
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-600 text-xs font-black text-slate-950">3</div>
                <div>
                  <div className="text-sm font-black text-slate-950">{gradingEnabled ? '最終送信' : '本文と下書き保存'}</div>
                  <div className="mt-1 text-sm text-slate-500">{gradingEnabled ? '本文を入力すると、その英文を読み取り結果として使います。答案と同じ英文を入力してください。' : '本文だけでも保存できます。入力内容を確認してください。保存しても提出回数や成績は変わりません。'}</div>
                </div>
              </div>
              <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${validationTone}`}>
                {displayValidation.valid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{displayValidation.message}</span>
              </div>
              <textarea
                id="writing-submit-manual-transcript"
                aria-label="答案本文（任意）"
                readOnly={submitting || draftLoading}
                value={manualTranscript}
                onChange={(event) => onChangeManualTranscript(event.target.value)}
                className="mt-4 min-h-40 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                placeholder="必要に応じて、答案に書いた英文をそのまま入力してください。"
              />
            </section>
          )}
        </div>
      </div>

      <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[28px]">
        {isMobileViewport ? (
          mobileSubmitActions
        ) : (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
            >
              キャンセル
            </button>
            <button
              type="button"
              data-testid="writing-submit-upload"
              onClick={onSubmit}
              disabled={!canSave}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-steady-action px-5 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {actionLabel}
            </button>
          </div>
        )}
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default WritingStudentSubmitSheet;
