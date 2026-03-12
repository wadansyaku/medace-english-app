import React, { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  FileDown,
  Loader2,
  MessageSquareText,
  ScanSearch,
  Send,
  X,
} from 'lucide-react';
import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import {
  WRITING_AI_PROVIDER_LABELS,
  WRITING_ASSIGNMENT_STATUS_LABELS,
  WRITING_SUBMISSION_SOURCE_LABELS,
  WritingSubmissionSource,
  type UserProfile,
  type WritingAssignment,
  type WritingAssignmentStatus,
} from '../types';
import {
  createWritingUploadUrl,
  finalizeWritingSubmission,
  getWritingPrintableFeedback,
  getWritingSubmissionDetail,
  listWritingAssignments,
  uploadWritingAsset,
} from '../services/writing';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import MobileSheetDialog from './mobile/MobileSheetDialog';
import MobileStepPager from './mobile/MobileStepPager';
import MobileStickyActionBar from './mobile/MobileStickyActionBar';

interface WritingStudentSectionProps {
  user: UserProfile;
}

const WORKFLOW_STEPS = ['課題', '提出', '処理中', '返却済み'] as const;
const SUBMIT_FLOW_STEPS = [
  { id: 'requirements', label: '提出条件', description: '提出コードと形式を確認' },
  { id: 'files', label: 'ファイル選択', description: 'PDF 1枚 / 画像最大4枚' },
  { id: 'submit', label: '最終送信', description: '補助テキストを添えて提出' },
] as const;

const formatDateTime = (timestamp?: number): string => {
  if (!timestamp) return '未提出';
  return new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const canSubmit = (assignment: WritingAssignment): boolean => (
  assignment.status === 'ISSUED' || assignment.status === 'REVISION_REQUESTED'
);

const canOpenFeedback = (assignment: WritingAssignment): boolean => (
  Boolean(assignment.latestSubmissionId)
  && (assignment.status === 'RETURNED' || assignment.status === 'REVISION_REQUESTED' || assignment.status === 'COMPLETED')
);

const getAssignmentPhase = (
  status: WritingAssignmentStatus,
): {
  label: string;
  description: string;
  tone: string;
  activeStep: number;
} => {
  switch (status) {
    case 'ISSUED':
      return {
        label: '課題',
        description: '紙で答案を書いて、スマホから提出してください。',
        tone: 'border-medace-200 bg-medace-50 text-medace-700',
        activeStep: 1,
      };
    case 'SUBMITTED':
      return {
        label: '提出済み',
        description: 'アップロード済みです。OCR と評価処理が進んでいます。',
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
        activeStep: 2,
      };
    case 'REVIEW_READY':
      return {
        label: '処理中',
        description: 'AI 比較の下書きができ、講師の最終確認を待っています。',
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
        activeStep: 3,
      };
    case 'REVISION_REQUESTED':
      return {
        label: '再提出',
        description: '返却コメントを確認して、1 回だけ書き直し提出ができます。',
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        activeStep: 4,
      };
    case 'RETURNED':
      return {
        label: '返却済み',
        description: '講師確認後の添削結果を確認できます。',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        activeStep: 4,
      };
    case 'COMPLETED':
      return {
        label: '完了',
        description: '返却内容の確認まで完了しています。',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        activeStep: 4,
      };
    default:
      return {
        label: '準備中',
        description: '講師が課題を準備しています。',
        tone: 'border-slate-200 bg-slate-50 text-slate-600',
        activeStep: 1,
      };
  }
};

const renderAsset = (asset: WritingSubmissionDetailResponse['submission']['assets'][number]) => {
  if (asset.mimeType.startsWith('image/')) {
    return <img src={asset.assetUrl} alt={asset.fileName} className="max-h-72 w-full rounded-2xl object-cover" />;
  }
  return (
    <object
      data={asset.assetUrl}
      type={asset.mimeType}
      className="h-72 w-full rounded-2xl border border-slate-200 bg-slate-50"
    >
      <a href={asset.assetUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-medace-700">
        {asset.fileName} を開く
      </a>
    </object>
  );
};

const WritingStudentSection: React.FC<WritingStudentSectionProps> = ({ user }) => {
  const isMobileViewport = useIsMobileViewport();
  const [assignments, setAssignments] = useState<WritingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [submitTarget, setSubmitTarget] = useState<WritingAssignment | null>(null);
  const [feedbackDetail, setFeedbackDetail] = useState<WritingSubmissionDetailResponse | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [manualTranscript, setManualTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingFeedbackId, setOpeningFeedbackId] = useState<string | null>(null);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState('');
  const [mobileSubmitStep, setMobileSubmitStep] = useState(0);
  const actionableAssignmentCount = useMemo(
    () => assignments.filter((assignment) => canSubmit(assignment) || canOpenFeedback(assignment)).length,
    [assignments],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await listWritingAssignments('mine');
      const sortedAssignments = [...response.assignments].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
      setAssignments(sortedAssignments);
    } catch (error) {
      console.error(error);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '自由英作文課題の取得に失敗しました。',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const resetSubmitDialog = () => {
    setSubmitTarget(null);
    setFiles([]);
    setManualTranscript('');
    setMobileSubmitStep(0);
  };

  const openSubmitDialog = (assignment: WritingAssignment) => {
    setSubmitTarget(assignment);
    setFiles([]);
    setManualTranscript('');
    setMobileSubmitStep(0);
  };

  const handleSubmit = async () => {
    if (!submitTarget || files.length === 0) return;
    setSubmitting(true);
    try {
      const isPdf = files[0].type === 'application/pdf';
      if (isPdf && files.length > 1) {
        throw new Error('PDF は1ファイルのみ提出できます。');
      }
      if (!isPdf && files.length > 4) {
        throw new Error('画像は最大4枚まで提出できます。');
      }

      const uploadResults = [];
      for (const [index, file] of files.entries()) {
        const upload = await createWritingUploadUrl({
          assignmentId: submitTarget.id,
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          assetOrder: index + 1,
          attemptNo: submitTarget.attemptCount + 1,
        });
        await uploadWritingAsset(upload, file);
        uploadResults.push(upload.assetId);
      }

      await finalizeWritingSubmission({
        assignmentId: submitTarget.id,
        source: WritingSubmissionSource.STUDENT_MOBILE,
        assetIds: uploadResults,
        attemptNo: submitTarget.attemptCount + 1,
        manualTranscript: manualTranscript.trim() || undefined,
      });

      setNotice({ tone: 'success', message: '答案を提出しました。講師確認後に返却されます。' });
      resetSubmitDialog();
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '答案提出に失敗しました。',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openFeedback = async (assignment: WritingAssignment) => {
    if (!assignment.latestSubmissionId) return;
    setOpeningFeedbackId(assignment.latestSubmissionId);
    try {
      const detail = await getWritingSubmissionDetail(assignment.latestSubmissionId);
      setFeedbackDetail(detail);
      setSelectedEvaluationId(
        detail.submission.teacherReview?.selectedEvaluationId
        || detail.submission.selectedEvaluationId
        || detail.submission.evaluations[0]?.id
        || '',
      );
    } catch (error) {
      console.error(error);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '返却内容の取得に失敗しました。',
      });
    } finally {
      setOpeningFeedbackId(null);
    }
  };

  const handlePrintFeedback = async () => {
    if (!feedbackDetail) return;
    const printable = await getWritingPrintableFeedback(feedbackDetail.submission.id);
    const blob = new Blob([printable.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!win) return;
    win.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
  };

  const selectedEvaluation = feedbackDetail?.submission.evaluations.find((evaluation) => evaluation.id === selectedEvaluationId)
    || feedbackDetail?.submission.evaluations.find((evaluation) => evaluation.isDefault)
    || feedbackDetail?.submission.evaluations[0];

  const mobileSubmitActions = useMemo(() => {
    if (!isMobileViewport) return null;
    if (mobileSubmitStep === 0) {
      return (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setMobileSubmitStep(1)}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white"
          >
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
            onClick={() => setMobileSubmitStep(0)}
            className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={() => setMobileSubmitStep(2)}
            disabled={files.length === 0}
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
          onClick={() => setMobileSubmitStep(1)}
          className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
        >
          戻る
        </button>
        <button
          type="button"
          data-testid="writing-submit-upload"
          onClick={handleSubmit}
          disabled={submitting || files.length === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          答案を提出する
        </button>
      </div>
    );
  }, [files.length, handleSubmit, isMobileViewport, mobileSubmitStep, submitting]);

  return (
    <section data-testid="writing-student-section" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Writing Track</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">自由英作文</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            紙で書いた答案をスマホで提出し、講師確認後の添削結果をアプリ内で確認できます。
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
          {user.organizationName || 'Business Workspace'}
        </div>
      </div>

      {isMobileViewport && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">対応中</div>
            <div className="mt-2 text-lg font-black text-slate-950">{actionableAssignmentCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">課題数</div>
            <div className="mt-2 text-lg font-black text-slate-950">{assignments.length}</div>
          </div>
        </div>
      )}

      {notice && (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
          notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {notice.message}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex min-h-[16vh] items-center justify-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-medace-500" />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {assignments.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
              まだ自由英作文課題は配布されていません。
            </div>
          )}

          {assignments.map((assignment) => {
            const phase = getAssignmentPhase(assignment.status);
            if (isMobileViewport) {
              return (
                <article key={assignment.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-slate-950">{assignment.promptTitle}</div>
                      <div className="mt-1 text-xs text-slate-400">{assignment.wordCountMin} - {assignment.wordCountMax} words</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${phase.tone}`}>
                      {phase.label}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Attempt</div>
                      <div className="mt-2 text-sm font-black text-slate-950">{assignment.attemptCount} / {assignment.maxAttempts}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">最終更新</div>
                      <div className="mt-2 text-sm font-black leading-snug text-slate-950">{formatDateTime(assignment.updatedAt)}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-3xl border border-white bg-white px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">次にやること</div>
                    <div className="mt-2 text-[13px] leading-relaxed text-slate-700">{phase.description}</div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    {canSubmit(assignment) && (
                      <button
                        type="button"
                        data-testid={`writing-open-submit-${assignment.id}`}
                        onClick={() => openSubmitDialog(assignment)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
                      >
                        <Send className="h-4 w-4" />
                        {assignment.status === 'REVISION_REQUESTED' ? '書き直して再提出する' : 'スマホで提出する'}
                      </button>
                    )}

                    {canOpenFeedback(assignment) && (
                      <button
                        type="button"
                        data-testid={`writing-open-feedback-${assignment.id}`}
                        onClick={() => openFeedback(assignment)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                      >
                        {openingFeedbackId === assignment.latestSubmissionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                        添削結果を見る
                      </button>
                    )}

                    {!canSubmit(assignment) && !canOpenFeedback(assignment) && (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500">
                        {WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]} のため、次の操作を待っています。
                      </div>
                    )}
                  </div>

                  <details className="mt-4 rounded-3xl border border-white bg-white px-4 py-4">
                    <summary className="cursor-pointer list-none text-sm font-bold text-slate-900">
                      課題詳細を見る
                    </summary>
                    <div className="mt-4 space-y-4">
                      <MobileStepPager
                        steps={WORKFLOW_STEPS.map((step) => ({ id: step, label: step }))}
                        activeStep={Math.max(0, phase.activeStep - 1)}
                      />
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">課題文</div>
                        <div className="mt-3 text-sm leading-relaxed text-slate-700">{assignment.promptText}</div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出コード</div>
                          <div className="mt-2 text-lg font-black text-slate-950">{assignment.submissionCode}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">状態</div>
                          <div className="mt-2 text-sm font-black text-slate-950">{WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]}</div>
                        </div>
                      </div>
                    </div>
                  </details>
                </article>
              );
            }

            return (
              <article key={assignment.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{assignment.promptTitle}</div>
                        <div className="mt-1 text-xs text-slate-400">{assignment.wordCountMin} - {assignment.wordCountMax} words</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${phase.tone}`}>
                        {phase.label}
                      </span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-4">
                      {WORKFLOW_STEPS.map((step, index) => {
                        const active = phase.activeStep >= index + 1;
                        return (
                          <div
                            key={step}
                            className={`rounded-2xl border px-3 py-3 ${
                              active
                                ? 'border-medace-200 bg-white text-slate-950'
                                : 'border-slate-200 bg-slate-100 text-slate-400'
                            }`}
                          >
                            <div className="text-[11px] font-bold uppercase tracking-[0.16em]">Step {index + 1}</div>
                            <div className="mt-2 text-sm font-bold">{step}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-3xl border border-white bg-white px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">課題文</div>
                      <div className="mt-3 text-sm leading-relaxed text-slate-700">{assignment.promptText}</div>
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                        {phase.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex h-full flex-col gap-4">
                    <div className="rounded-3xl border border-white bg-white px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">課題情報</div>
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出コード</div>
                          <div className="mt-2 text-lg font-black text-slate-950">{assignment.submissionCode}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Attempt</div>
                          <div className="mt-2 text-lg font-black text-slate-950">{assignment.attemptCount} / {assignment.maxAttempts}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">最終更新</div>
                          <div className="mt-2 text-sm font-black text-slate-950">{formatDateTime(assignment.updatedAt)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white bg-white px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">次にやること</div>
                      <div className="mt-3 text-sm leading-relaxed text-slate-700">{phase.description}</div>
                    </div>

                    <div className="mt-auto flex flex-col gap-3">
                      {canSubmit(assignment) && (
                        <button
                          type="button"
                          data-testid={`writing-open-submit-${assignment.id}`}
                          onClick={() => openSubmitDialog(assignment)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
                        >
                          <Send className="h-4 w-4" />
                          {assignment.status === 'REVISION_REQUESTED' ? '書き直して再提出する' : 'スマホで提出する'}
                        </button>
                      )}

                      {canOpenFeedback(assignment) && (
                        <button
                          type="button"
                          data-testid={`writing-open-feedback-${assignment.id}`}
                          onClick={() => openFeedback(assignment)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                        >
                          {openingFeedbackId === assignment.latestSubmissionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                          添削結果を見る
                        </button>
                      )}

                      {!canSubmit(assignment) && !canOpenFeedback(assignment) && (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500">
                          {WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]} のため、次の操作を待っています。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {submitTarget && (
        <MobileSheetDialog
          onClose={() => {
            if (submitting) return;
            resetSubmitDialog();
          }}
          mode={isMobileViewport ? 'fullscreen' : 'sheet'}
          panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-4xl sm:rounded-[28px] sm:border sm:border-slate-200 sm:shadow-2xl"
        >
          <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[28px] sm:px-6">
            <button
              type="button"
              onClick={() => {
                if (submitting) return;
                resetSubmitDialog();
              }}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="pr-12">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Submit Writing</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{submitTarget.promptTitle}</h3>
              <p className="mt-2 text-sm text-slate-500">
                提出条件を確認してからファイルを選び、最後に送信を確定します。
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="space-y-4">
              {isMobileViewport && (
                <MobileStepPager
                  steps={SUBMIT_FLOW_STEPS.map((step) => ({ ...step }))}
                  activeStep={mobileSubmitStep}
                  onSelectStep={setMobileSubmitStep}
                />
              )}

              {(!isMobileViewport || mobileSubmitStep === 0) && (
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-700 text-xs font-black text-white">1</div>
                    <div>
                      <div className="text-sm font-black text-slate-950">提出条件</div>
                      <div className="mt-1 text-sm text-slate-500">形式と提出コード、attempt 回数を確認します。</div>
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
                      <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Attempt</div>
                      <div className="mt-2 text-sm font-black text-slate-950">{submitTarget.attemptCount + 1} 回目 / 最大 {submitTarget.maxAttempts} 回</div>
                    </div>
                  </div>
                </section>
              )}

              {(!isMobileViewport || mobileSubmitStep === 1) && (
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-medace-700 text-xs font-black text-white">2</div>
                    <div>
                      <div className="text-sm font-black text-slate-950">アップロード済みファイル</div>
                      <div className="mt-1 text-sm text-slate-500">スマホで撮影した画像か PDF を選択します。</div>
                    </div>
                  </div>
                  <input
                    data-testid="writing-student-file-input"
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    onChange={(event) => setFiles(Array.from(event.target.files || []))}
                    className="mt-4 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-bold"
                  />
                  {files.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      {files.map((file) => (
                        <div key={`${file.name}-${file.size}`} className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-700">
                          {file.name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                      まだファイルは選択されていません。
                    </div>
                  )}
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
                  <textarea
                    value={manualTranscript}
                    onChange={(event) => setManualTranscript(event.target.value)}
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
                  onClick={resetSubmitDialog}
                  className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  data-testid="writing-submit-upload"
                  onClick={handleSubmit}
                  disabled={submitting || files.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                  答案を提出する
                </button>
              </div>
            )}
          </MobileStickyActionBar>
        </MobileSheetDialog>
      )}

      {feedbackDetail && (
        <MobileSheetDialog
          onClose={() => setFeedbackDetail(null)}
          mode={isMobileViewport ? 'fullscreen' : 'sheet'}
          panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-5xl sm:rounded-[28px] sm:border sm:border-slate-200 sm:shadow-2xl"
        >
          <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[28px] sm:px-6">
            <button
              type="button"
              onClick={() => setFeedbackDetail(null)}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="pr-12">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Feedback</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{feedbackDetail.assignment.promptTitle}</h3>
              <p className="mt-2 text-sm text-slate-500">
                講師確認後に返却された内容です。面談前後の見直し用にそのまま印刷もできます。
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="space-y-5">
              <div className="grid gap-2 grid-cols-2 md:gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">状態</div>
                  <div className="mt-2 text-sm font-black text-slate-950">{WRITING_ASSIGNMENT_STATUS_LABELS[feedbackDetail.assignment.status]}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出元</div>
                  <div className="mt-2 text-sm font-black text-slate-950">
                    {WRITING_SUBMISSION_SOURCE_LABELS[feedbackDetail.submission.submissionSource]}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Attempt</div>
                  <div className="mt-2 text-sm font-black text-slate-950">{feedbackDetail.submission.attemptNo}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">返却時刻</div>
                  <div className="mt-2 text-sm font-black leading-snug text-slate-950">{formatDateTime(feedbackDetail.submission.teacherReview?.releasedAt)}</div>
                </div>
              </div>

              <div data-testid="writing-feedback-comment" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">講師コメント</div>
                <div className="mt-3 text-sm leading-relaxed text-slate-700">
                  {feedbackDetail.submission.teacherReview?.publicComment || '講師コメントはまだありません。'}
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {feedbackDetail.submission.evaluations.map((evaluation) => (
                  <button
                    key={evaluation.id}
                    data-testid={`writing-feedback-provider-${evaluation.provider.toLowerCase()}`}
                    type="button"
                    onClick={() => setSelectedEvaluationId(evaluation.id)}
                    className={`shrink-0 rounded-3xl border text-left ${
                      selectedEvaluationId === evaluation.id
                        ? 'border-medace-300 bg-medace-50/80'
                        : 'border-slate-200 bg-slate-50 hover:border-medace-200'
                    } ${isMobileViewport ? 'min-w-[138px] px-3.5 py-3.5' : 'min-w-[170px] px-4 py-4'}`}
                  >
                    <div className="text-sm font-bold text-slate-900">{WRITING_AI_PROVIDER_LABELS[evaluation.provider]}</div>
                    <div className={`font-black text-slate-950 ${isMobileViewport ? 'mt-2 text-xl' : 'mt-3 text-2xl'}`}>
                      {evaluation.overallScore} / 20
                    </div>
                  </button>
                ))}
              </div>

              {selectedEvaluation && (
                isMobileViewport ? (
                  <div className="space-y-4" data-testid="writing-feedback-mobile-view">
                    <div data-testid="writing-feedback-strengths" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">良かった点</div>
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {selectedEvaluation.strengths.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div data-testid="writing-feedback-improvements" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">改善点</div>
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {selectedEvaluation.improvementPoints.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div data-testid="writing-feedback-corrected" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">訂正文例</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                        {selectedEvaluation.correctedDraft}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">模範例</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                        {selectedEvaluation.modelAnswer}
                      </div>
                    </div>
                    <div data-testid="writing-feedback-transcript" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">提出文</div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {feedbackDetail.submission.transcript}
                      </div>
                    </div>
                    <div data-testid="writing-feedback-assets" className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                        <MessageSquareText className="h-4 w-4" />
                        提出答案
                      </div>
                      <div className="grid gap-3">
                        {feedbackDetail.submission.assets.map((asset) => (
                          <div key={asset.id}>{renderAsset(asset)}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">良かった点</div>
                        <ul className="mt-3 space-y-2 text-sm text-slate-700">
                          {selectedEvaluation.strengths.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">改善点</div>
                        <ul className="mt-3 space-y-2 text-sm text-slate-700">
                          {selectedEvaluation.improvementPoints.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">提出文</div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                          {feedbackDetail.submission.transcript}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">訂正文例</div>
                        <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                          {selectedEvaluation.correctedDraft}
                        </div>
                      </div>
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">模範例</div>
                        <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                          {selectedEvaluation.modelAnswer}
                        </div>
                      </div>
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                          <MessageSquareText className="h-4 w-4" />
                          提出答案
                        </div>
                        <div className="grid gap-3">
                          {feedbackDetail.submission.assets.map((asset) => (
                            <div key={asset.id}>{renderAsset(asset)}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[28px]">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setFeedbackDetail(null)}
                className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={handlePrintFeedback}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
              >
                <FileDown className="h-4 w-4" />
                添削結果を印刷
              </button>
            </div>
          </MobileStickyActionBar>
        </MobileSheetDialog>
      )}
    </section>
  );
};

export default WritingStudentSection;
