import React, { useEffect, useState } from 'react';
import {
  Eye,
  FileDown,
  Loader2,
  MessageSquareText,
  ScanSearch,
  Send,
} from 'lucide-react';
import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import {
  WRITING_AI_PROVIDER_LABELS,
  WRITING_ASSIGNMENT_STATUS_LABELS,
  WritingSubmissionSource,
  type UserProfile,
  type WritingAssignment,
} from '../types';
import {
  createWritingUploadUrl,
  finalizeWritingSubmission,
  getWritingPrintableFeedback,
  getWritingSubmissionDetail,
  listWritingAssignments,
  uploadWritingAsset,
} from '../services/writing';
import ModalOverlay from './ModalOverlay';

interface WritingStudentSectionProps {
  user: UserProfile;
}

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

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await listWritingAssignments('mine');
      setAssignments(response.assignments);
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
      setFiles([]);
      setManualTranscript('');
      setSubmitTarget(null);
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

  return (
    <section data-testid="writing-student-section" className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-7 shadow-sm">
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
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {assignments.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
              まだ自由英作文課題は配布されていません。
            </div>
          )}
          {assignments.map((assignment) => (
            <div key={assignment.id} className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-950">{assignment.promptTitle}</div>
                  <div className="mt-1 text-xs text-slate-400">{assignment.wordCountMin} - {assignment.wordCountMax} words</div>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                  {WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                </span>
              </div>
              <div className="mt-4 rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                {assignment.promptText}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出コード</div>
                  <div className="mt-2 text-lg font-black text-slate-950">{assignment.submissionCode}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Attempt</div>
                  <div className="mt-2 text-lg font-black text-slate-950">{assignment.attemptCount} / {assignment.maxAttempts}</div>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">最終更新</div>
                  <div className="mt-2 text-sm font-black text-slate-950">{formatDateTime(assignment.updatedAt)}</div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {canSubmit(assignment) && (
                  <button
                    type="button"
                    data-testid={`writing-open-submit-${assignment.id}`}
                    onClick={() => setSubmitTarget(assignment)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
                  >
                    <Send className="h-4 w-4" />
                    スマホで提出する
                  </button>
                )}
                {assignment.latestSubmissionId && (
                  <button
                    type="button"
                    data-testid={`writing-open-feedback-${assignment.id}`}
                    onClick={() => openFeedback(assignment)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                  >
                    {openingFeedbackId === assignment.latestSubmissionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    添削結果を見る
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {submitTarget && (
        <ModalOverlay
          onClose={() => {
            if (submitting) return;
            setSubmitTarget(null);
            setFiles([]);
            setManualTranscript('');
          }}
          panelClassName="max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Submit Writing</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{submitTarget.promptTitle}</h3>
            <p className="mt-2 text-sm text-slate-500">
              PDF 1枚または画像最大4枚まで提出できます。OCRが読み取りにくい場合に備えて、本文の補助テキストも入力できます。
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">答案ファイル</label>
                <input
                  data-testid="writing-student-file-input"
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  onChange={(event) => setFiles(Array.from(event.target.files || []))}
                  className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-bold"
                />
                {files.length > 0 && (
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {files.map((file) => (
                      <div key={`${file.name}-${file.size}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        {file.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">補助テキスト（任意）</label>
                <textarea
                  value={manualTranscript}
                  onChange={(event) => setManualTranscript(event.target.value)}
                  className="mt-2 min-h-36 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  placeholder="OCR が読み取りにくいときのために、書いた英文をおおまかに入力できます。"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSubmitTarget(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
              >
                キャンセル
              </button>
              <button
                type="button"
                data-testid="writing-submit-upload"
                onClick={handleSubmit}
                disabled={submitting || files.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                答案を提出する
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {feedbackDetail && (
        <ModalOverlay
          onClose={() => setFeedbackDetail(null)}
          panelClassName="max-w-5xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Feedback</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{feedbackDetail.assignment.promptTitle}</h3>
              <p className="mt-2 text-sm text-slate-500">
                講師確認後に返却された内容です。面談前後の見直し用にそのまま印刷もできます。
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrintFeedback}
              className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
            >
              <FileDown className="h-4 w-4" />
              添削結果を印刷
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {feedbackDetail.submission.assets.map((asset) => (
              <div key={asset.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{asset.fileName}</div>
                {renderAsset(asset)}
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">講師コメント</div>
            <div className="mt-3 text-sm leading-relaxed text-slate-700">
              {feedbackDetail.submission.teacherReview?.publicComment || '講師コメントはまだありません。'}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {feedbackDetail.submission.evaluations.map((evaluation) => (
              <button
                key={evaluation.id}
                type="button"
                onClick={() => setSelectedEvaluationId(evaluation.id)}
                className={`rounded-3xl border px-4 py-4 text-left ${
                  selectedEvaluationId === evaluation.id
                    ? 'border-medace-300 bg-medace-50/80'
                    : 'border-slate-200 bg-slate-50 hover:border-medace-200'
                }`}
              >
                <div className="text-sm font-bold text-slate-900">{WRITING_AI_PROVIDER_LABELS[evaluation.provider]}</div>
                <div className="mt-3 text-2xl font-black text-slate-950">{evaluation.overallScore} / 20</div>
              </button>
            ))}
          </div>

          {selectedEvaluation && (
            <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
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
              </div>
            </div>
          )}

          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              <MessageSquareText className="h-4 w-4" />
              提出文
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {feedbackDetail.submission.transcript}
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
};

export default WritingStudentSection;
