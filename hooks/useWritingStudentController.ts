import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  getWritingStudentAssignmentPriority,
} from '../components/writing/studentSectionUtils';
import { appendWritingSideEffectWarning } from '../utils/writingSideEffects';
import {
  resolveWritingUploadMimeType,
  validateWritingSubmissionFiles,
} from '../utils/writingSubmissionValidation';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

export const useWritingStudentController = (user: UserProfile) => {
  const [assignments, setAssignments] = useState<WritingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
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
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const actionableAssignmentCount = useMemo(
    () => assignments.filter((assignment) => (
      canSubmitWritingAssignment(assignment) || canOpenWritingFeedback(assignment)
    )).length,
    [assignments],
  );
  const submitReadyCount = useMemo(
    () => assignments.filter(canSubmitWritingAssignment).length,
    [assignments],
  );
  const feedbackReadyCount = useMemo(
    () => assignments.filter(canOpenWritingFeedback).length,
    [assignments],
  );
  const waitingAssignmentCount = useMemo(
    () => assignments.filter((assignment) => (
      !canSubmitWritingAssignment(assignment)
      && !canOpenWritingFeedback(assignment)
      && assignment.status !== 'COMPLETED'
    )).length,
    [assignments],
  );

  const selectedEvaluation = useMemo(() => (
    feedbackDetail?.submission.evaluations.find((evaluation) => evaluation.id === selectedEvaluationId)
      || feedbackDetail?.submission.evaluations.find((evaluation) => evaluation.isDefault)
      || feedbackDetail?.submission.evaluations[0]
  ), [feedbackDetail, selectedEvaluationId]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const inFlightRefresh = refreshInFlightRef.current;
    if (inFlightRefresh) {
      await inFlightRefresh.catch(() => undefined);
      return;
    }

    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const refreshPromise = (async () => {
      const response = await listWritingAssignments('mine');
      const sortedAssignments = [...response.assignments].sort(
        (left, right) => {
          const priorityDiff = getWritingStudentAssignmentPriority(left) - getWritingStudentAssignmentPriority(right);
          if (priorityDiff !== 0) return priorityDiff;
          return (right.updatedAt || 0) - (left.updatedAt || 0);
        },
      );
      setAssignments(sortedAssignments);
      setLastRefreshedAt(Date.now());
    })();

    refreshInFlightRef.current = refreshPromise;

    try {
      await refreshPromise;
    } catch (error) {
      console.error(error);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '自由英作文課題の取得に失敗しました。',
      });
    } finally {
      refreshInFlightRef.current = null;
      if (options?.silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, user.uid]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const revalidateVisibleAssignments = () => {
      if (document.visibilityState !== 'visible' || submitting) return;
      void refresh({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        revalidateVisibleAssignments();
      }
    };

    window.addEventListener('focus', revalidateVisibleAssignments);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(revalidateVisibleAssignments, 60_000);

    return () => {
      window.removeEventListener('focus', revalidateVisibleAssignments);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [refresh, submitting]);

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
    if (!submitTarget) return;
    const validation = validateWritingSubmissionFiles(files);
    if (!validation.valid) {
      setNotice({
        tone: 'error',
        message: validation.message,
      });
      return;
    }

    setSubmitting(true);
    try {
      const uploadResults: string[] = [];
      for (const [index, file] of files.entries()) {
        const upload = await createWritingUploadUrl({
          assignmentId: submitTarget.id,
          fileName: file.name,
          mimeType: resolveWritingUploadMimeType(file),
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
    refreshing,
    lastRefreshedAt,
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
    submitReadyCount,
    feedbackReadyCount,
    waitingAssignmentCount,
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
