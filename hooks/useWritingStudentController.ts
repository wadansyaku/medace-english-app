import { useEffect, useMemo, useState } from 'react';

import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import {
  calculateWritingAssetSha256Base64,
  createWritingUploadUrl,
  finalizeWritingSubmission,
  getWritingPrintableFeedback,
  getWritingSubmissionDetail,
  listWritingAssignments,
  uploadWritingAsset,
} from '../services/writing';
import {
  WritingSubmissionSource,
  type UserProfile,
  type WritingAssignment,
} from '../types';
import {
  canOpenWritingFeedback,
  canSubmitWritingAssignment,
} from '../components/writing/studentSectionUtils';
import { appendWritingSideEffectWarning } from '../utils/writingSideEffects';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

export const useWritingStudentController = (user: UserProfile) => {
  const [assignments, setAssignments] = useState<WritingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [submitTarget, setSubmitTarget] = useState<WritingAssignment | null>(null);
  const [feedbackDetail, setFeedbackDetail] = useState<WritingSubmissionDetailResponse | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [manualTranscript, setManualTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingFeedbackId, setOpeningFeedbackId] = useState<string | null>(null);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState('');
  const [feedbackCommentExpanded, setFeedbackCommentExpanded] = useState(false);
  const [mobileSubmitStep, setMobileSubmitStep] = useState(0);

  const actionableAssignmentCount = useMemo(
    () => assignments.filter((assignment) => (
      canSubmitWritingAssignment(assignment) || canOpenWritingFeedback(assignment)
    )).length,
    [assignments],
  );

  const selectedEvaluation = useMemo(() => (
    feedbackDetail?.submission.evaluations.find((evaluation) => evaluation.id === selectedEvaluationId)
      || feedbackDetail?.submission.evaluations.find((evaluation) => evaluation.isDefault)
      || feedbackDetail?.submission.evaluations[0]
  ), [feedbackDetail, selectedEvaluationId]);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await listWritingAssignments('mine');
      const sortedAssignments = [...response.assignments].sort(
        (left, right) => (right.updatedAt || 0) - (left.updatedAt || 0),
      );
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
  }, [user.uid]);

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

      const uploadResults: string[] = [];
      for (const [index, file] of files.entries()) {
        const upload = await createWritingUploadUrl({
          assignmentId: submitTarget.id,
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          sha256Base64: await calculateWritingAssetSha256Base64(file),
          assetOrder: index + 1,
          attemptNo: submitTarget.attemptCount + 1,
        });
        await uploadWritingAsset(upload, file);
        uploadResults.push(upload.assetId);
      }

      const detail = await finalizeWritingSubmission({
        assignmentId: submitTarget.id,
        source: WritingSubmissionSource.STUDENT_MOBILE,
        assetIds: uploadResults,
        attemptNo: submitTarget.attemptCount + 1,
        manualTranscript: manualTranscript.trim() || undefined,
      });

      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('答案を提出しました。講師確認後に返却されます。', detail),
      });
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
      setFeedbackCommentExpanded(false);
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

  const closeFeedback = () => {
    setFeedbackDetail(null);
    setFeedbackCommentExpanded(false);
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

  return {
    assignments,
    loading,
    notice,
    submitTarget,
    feedbackDetail,
    files,
    manualTranscript,
    submitting,
    openingFeedbackId,
    selectedEvaluationId,
    selectedEvaluation,
    feedbackCommentExpanded,
    mobileSubmitStep,
    actionableAssignmentCount,
    refresh,
    openSubmitDialog,
    resetSubmitDialog,
    setFiles,
    setManualTranscript,
    handleSubmit,
    openFeedback,
    closeFeedback,
    handlePrintFeedback,
    setSelectedEvaluationId,
    toggleFeedbackCommentExpanded: () => setFeedbackCommentExpanded((current) => !current),
    setMobileSubmitStep,
  };
};

export default useWritingStudentController;
