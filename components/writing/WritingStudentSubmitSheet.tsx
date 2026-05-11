import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle2, FileText, Image, ListChecks, Loader2, ScanSearch, X } from 'lucide-react';

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
  onClose,
  onChangeFiles,
  onChangeManualTranscript,
  onChangeStep,
  onSubmit,
}) => {
  const fileValidation = useMemo(() => validateWritingSubmissionFiles(files), [files]);
  const fileRows = useMemo(() => files.map((file) => ({
    file,
    resolvedMimeType: resolveWritingUploadMimeType(file),
    kind: resolveWritingUploadFileKind(file),
  })), [files]);
  const currentStep = SUBMIT_FLOW_STEPS[mobileSubmitStep] || SUBMIT_FLOW_STEPS[0];
  const validationTone = fileValidation.valid
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white"
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
            disabled={!fileValidation.valid}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            最終送信へ進む
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
          disabled={submitting || !fileValidation.valid}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          答案を提出する
        </button>
      </div>
    );
  }, [fileValidation.valid, isMobileViewport, mobileSubmitStep, onChangeStep, onSubmit, submitting]);

  return (
    <MobileSheetDialog
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      mode={isMobileViewport ? 'fullscreen' : 'sheet'}
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
          <p className="text-xs font-bold text-slate-400">英作文提出</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{submitTarget.promptTitle}</h3>
          <p className="mt-2 text-sm text-slate-500">
            提出条件を確認してからファイルを選び、最後に送信を確定します。
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
          {isMobileViewport && (
            <MobileStepPager
              steps={SUBMIT_FLOW_STEPS.map((step) => ({ ...step }))}
              activeStep={mobileSubmitStep}
              onSelectStep={onChangeStep}
            />
          )}

          {(!isMobileViewport || mobileSubmitStep === 0) && (
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-700 text-xs font-black text-white">1</div>
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
                撮影する場合は、答案全体、名前や提出コード、英文が切れていないことを確認してから次へ進みます。
              </div>
            </section>
          )}

          {(!isMobileViewport || mobileSubmitStep === 1) && (
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-700 text-xs font-black text-white">2</div>
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
                {fileValidation.valid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{fileValidation.message}</span>
              </div>
            </section>
          )}

          {(!isMobileViewport || mobileSubmitStep === 2) && (
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-700 text-xs font-black text-white">3</div>
                <div>
                  <div className="text-sm font-black text-slate-950">最終送信</div>
                  <div className="mt-1 text-sm text-slate-500">OCR が読み取りにくい場合だけ補助テキストを入れて送信します。</div>
                </div>
              </div>
              <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${validationTone}`}>
                {fileValidation.valid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{fileValidation.message}</span>
              </div>
              <textarea
                value={manualTranscript}
                onChange={(event) => onChangeManualTranscript(event.target.value)}
                className="mt-4 min-h-40 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                placeholder="OCR が読み取りにくいときのために、書いた英文をおおまかに入力できます。"
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
              disabled={submitting || !fileValidation.valid}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              答案を提出する
            </button>
          </div>
        )}
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default WritingStudentSubmitSheet;
