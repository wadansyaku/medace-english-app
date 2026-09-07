import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WritingStudentSubmissionDetailResponse } from '../contracts/writing';
import {
  calculateWritingAssetSha256Base64,
  createWritingUploadUrl,
  finalizeStudentWritingSubmission,
  getWritingPrintableFeedback,
  getStudentWritingSubmissionDetail,
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
  const [feedbackDetail, setFeedbackDetail] = useState<WritingStudentSubmissionDetailResponse | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [manualTranscript, setManualTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingFeedbackId, setOpeningFeedbackId] = useState<string | null>(null);
  const [feedbackCommentExpanded, setFeedbackCommentExpanded] = useState(false);
  const [mobileSubmitStep, setMobileSubmitStep] = useState(0);
  const refreshInFlightRef = useRef<{ userUid: string; promise: Promise<void> } | null>(null);
  const activeUserUidRef = useRef(user.uid);
  const feedbackRequestVersionRef = useRef(0);
  activeUserUidRef.current = user.uid;

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

  const selectedEvaluation = feedbackDetail?.submission.evaluations[0];

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const inFlightRefresh = refreshInFlightRef.current;
    if (inFlightRefresh?.userUid === user.uid) {
      await inFlightRefresh.promise.catch(() => undefined);
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
      if (activeUserUidRef.current !== user.uid) return;
      setAssignments(sortedAssignments);
      setLastRefreshedAt(Date.now());
    })();

    refreshInFlightRef.current = { userUid: user.uid, promise: refreshPromise };

    try {
      await refreshPromise;
    } catch (error) {
      if (activeUserUidRef.current !== user.uid) return;
      console.error(error);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '自由英作文課題の取得に失敗しました。',
      });
    } finally {
      if (refreshInFlightRef.current?.promise === refreshPromise) {
        refreshInFlightRef.current = null;
      }
      if (activeUserUidRef.current === user.uid) {
        if (options?.silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }
  }, [user.uid]);

  useEffect(() => {
    feedbackRequestVersionRef.current += 1;
    setAssignments([]);
    setLastRefreshedAt(null);
    setNotice(null);
    setFeedbackDetail(null);
    setSubmitTarget(null);
    setFiles([]);
    setManualTranscript('');
    setOpeningFeedbackId(null);
    setFeedbackCommentExpanded(false);
    setMobileSubmitStep(0);
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

      const detail = await finalizeStudentWritingSubmission({
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
    const requestVersion = feedbackRequestVersionRef.current + 1;
    feedbackRequestVersionRef.current = requestVersion;
    setOpeningFeedbackId(assignment.latestSubmissionId);
    try {
      const detail = await getStudentWritingSubmissionDetail(assignment.latestSubmissionId);
      if (feedbackRequestVersionRef.current !== requestVersion) return;
      setFeedbackDetail(detail);
      setFeedbackCommentExpanded(false);
    } catch (error) {
      console.error(error);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '返却内容の取得に失敗しました。',
      });
    } finally {
      if (feedbackRequestVersionRef.current === requestVersion) {
        setOpeningFeedbackId(null);
      }
    }
  };

  const closeFeedback = () => {
    feedbackRequestVersionRef.current += 1;
    setFeedbackDetail(null);
    setFeedbackCommentExpanded(false);
  };

  const handlePrintFeedback = async () => {
    if (!feedbackDetail) return;
    const printable = await getWritingPrintableFeedback(feedbackDetail.submission.id);
    const blob = new Blob([printable.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!win) {
      URL.revokeObjectURL(url);
      setNotice({ tone: 'error', message: '印刷プレビューを開けませんでした。ポップアップ設定を確認してください。' });
      return;
    }
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
    toggleFeedbackCommentExpanded: () => setFeedbackCommentExpanded((current) => !current),
    setMobileSubmitStep,
  };
};

export default useWritingStudentController;
