import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SaveWritingInputDraftRequest, WritingAiCapabilities, WritingInputDraft } from '../contracts/writing-ai-drafts';
import { getWritingAiCapabilities, getWritingInputDraft, saveWritingInputDraft } from '../services/writingAiDrafts';
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
  getWritingFeedbackSubmissionId,
  isWritingSubmissionPending,
} from '../components/writing/studentSectionUtils';
import { appendWritingSideEffectWarning } from '../utils/writingSideEffects';
import { resolveWritingUploadRetryCache, type WritingUploadRetryCache } from '../utils/writingUploadRetry';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [submitTarget, setSubmitTarget] = useState<WritingAssignment | null>(null);
  const [feedbackDetail, setFeedbackDetail] = useState<WritingStudentSubmissionDetailResponse | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [manualTranscript, setManualTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<WritingAiCapabilities | null>(null);
  const [savedInputDraft, setSavedInputDraft] = useState<WritingInputDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);
  const draftScopeVersionRef = useRef(0);
  const manualDirtyRef = useRef(false);
  const assetsNeedRetirementRef = useRef(false);
  const committedInputRef = useRef<WritingInputDraft | null>(null);
  const pendingDraftSaveRef = useRef<{ signature: string; request: SaveWritingInputDraftRequest } | null>(null);
  const pendingRetirementSaveRef = useRef<{ signature: string; request: SaveWritingInputDraftRequest } | null>(null);
  const uploadedFilesRef = useRef<WritingUploadRetryCache | null>(null);
  const pendingUploadsRef = useRef<{ cache: WritingUploadRetryCache; requests: Array<Awaited<ReturnType<typeof createWritingUploadUrl>> | undefined> } | null>(null);
  const preparedInputRef = useRef<{ cache: WritingUploadRetryCache; signature: string; revision: number } | null>(null);
  const submitLockRef = useRef(false);
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
    () => assignments.filter(isWritingSubmissionPending).length,
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
      setLoadError(null);
    })();

    refreshInFlightRef.current = { userUid: user.uid, promise: refreshPromise };

    try {
      await refreshPromise;
    } catch (error) {
      if (activeUserUidRef.current !== user.uid) return;
      console.error(error);
      setLoadError((error as Error).message || '自由英作文課題の取得に失敗しました。');
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
    setLoadError(null);
    setNotice(null);
    setFeedbackDetail(null);
    draftScopeVersionRef.current += 1;
    setCapabilities(null); setSavedInputDraft(null); setDraftLoaded(false);
    setDraftLoading(false); setDraftLoadError(null); setDraftSavedMessage(null);
    pendingDraftSaveRef.current = null; pendingRetirementSaveRef.current = null; preparedInputRef.current = null;
    manualDirtyRef.current = false; assetsNeedRetirementRef.current = false; committedInputRef.current = null;
    setSubmitTarget(null);
    setFiles([]);
    setManualTranscript('');
    setSubmissionError(null);
    uploadedFilesRef.current = null; pendingUploadsRef.current = null;
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
    if (submitLockRef.current) return;
    draftScopeVersionRef.current += 1;
    setCapabilities(null); setSavedInputDraft(null); setDraftLoaded(false);
    setDraftLoading(false); setDraftLoadError(null); setDraftSavedMessage(null);
    pendingDraftSaveRef.current = null; pendingRetirementSaveRef.current = null; preparedInputRef.current = null;
    manualDirtyRef.current = false; assetsNeedRetirementRef.current = false; committedInputRef.current = null;
    setSubmitTarget(null);
    setFiles([]);
    setManualTranscript('');
    setMobileSubmitStep(0);
    setSubmissionError(null);
    uploadedFilesRef.current = null; pendingUploadsRef.current = null;
  };

  const restoreDraft = async (assignment: WritingAssignment, preserveInput = false) => {
    if (submitLockRef.current) return;
    const version = ++draftScopeVersionRef.current;
    setDraftLoading(true); setDraftLoadError(null); setDraftLoaded(false);
    const attemptNo = assignment.attemptCount + 1;
    const results = await Promise.allSettled([
      getWritingAiCapabilities(assignment.id), getWritingInputDraft(assignment.id, attemptNo),
    ]);
    if (version !== draftScopeVersionRef.current || activeUserUidRef.current !== user.uid) return;
    const [capabilityResult, draftResult] = results;
    setCapabilities(capabilityResult.status === 'fulfilled' ? capabilityResult.value : null);
    if (draftResult.status === 'fulfilled') {
      const draft = draftResult.value.draft;
      if (draft && (draft.assignmentId !== assignment.id || draft.attemptNo !== attemptNo)) {
        setDraftLoadError('課題に対応する下書きを確認できません。入力を保持しています。');
      } else {
        committedInputRef.current = draft; assetsNeedRetirementRef.current = false;
        setSavedInputDraft(draft); setDraftLoaded(true);
        const keepEditedManual = preserveInput && manualDirtyRef.current;
        if (!keepEditedManual) { setManualTranscript(draft?.manualTranscript || ''); manualDirtyRef.current = false; }
        setDraftSavedMessage(draft ? (keepEditedManual
          ? '保存済みの添付を確認しました。編集中の本文は保持しています（未保存）。'
          : '保存済みの下書きを復元しました。未評価です。') : null);
        pendingDraftSaveRef.current = null; pendingRetirementSaveRef.current = null; preparedInputRef.current = null;
      }
    } else {
      setDraftLoadError('保存済み下書きの復元を確認できませんでした。入力は保持しています。再取得してから保存してください。');
    }
    setDraftLoading(false);
  };

  const openSubmitDialog = (assignment: WritingAssignment) => {
    if (submitLockRef.current) return;
    setSubmitTarget(assignment); setFiles([]); setManualTranscript('');
    setCapabilities(null); setSavedInputDraft(null); setDraftSavedMessage(null);
    setMobileSubmitStep(0); setSubmissionError(null); uploadedFilesRef.current = null; pendingUploadsRef.current = null;
    pendingDraftSaveRef.current = null; pendingRetirementSaveRef.current = null; preparedInputRef.current = null;
    manualDirtyRef.current = false; assetsNeedRetirementRef.current = false; committedInputRef.current = null;
    void restoreDraft(assignment);
  };

  const handleSubmit = async () => {
    if (!submitTarget || submitLockRef.current) return;
    if (!draftLoaded || draftLoading) {
      setSubmissionError('保存済み下書きを確認してから操作してください。'); return;
    }
    const gradingEnabled = capabilities?.gradingEnabled === true;
    const validation = validateWritingSubmissionFiles(files);
    const previousCache = uploadedFilesRef.current;
    const transientIds = new Set(previousCache?.assetIds.filter(Boolean));
    const existingAssets = (savedInputDraft?.assets || []).filter(asset => !transientIds.has(asset.id));
    const manualOnly = !gradingEnabled && files.length === 0 && (manualTranscript.trim().length > 0 || existingAssets.length > 0 || Boolean(committedInputRef.current?.revision));
    if (!validation.valid && !manualOnly) {
      setNotice({
        tone: 'error',
        message: validation.message,
      });
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setSubmissionError(null);
    const target = submitTarget;
    const attemptNo = target.attemptCount + 1;
    const cache = resolveWritingUploadRetryCache(previousCache, `${user.uid}:${target.id}:${attemptNo}`, files);
    if (cache !== previousCache) {
      pendingRetirementSaveRef.current = null; pendingDraftSaveRef.current = null; preparedInputRef.current = null;
      pendingUploadsRef.current = { cache, requests: [] };
    }
    uploadedFilesRef.current = cache;
    try {
      const uploadResults: string[] = gradingEnabled ? [] : existingAssets.map(asset => asset.id);
      const combinedMimeTypes = [...existingAssets.map(asset => asset.mimeType), ...files.map(resolveWritingUploadMimeType)];
      if (!gradingEnabled && (combinedMimeTypes.length > 4 || (combinedMimeTypes.includes('application/pdf') && combinedMimeTypes.length > 1))) {
        throw new Error('下書きはPDF 1件、または画像最大4件で保存してください。');
      }
      let expectedRevision = committedInputRef.current?.revision || savedInputDraft?.revision || 0;
      const persistInput = async (assetIds: string[], revision: number, retiring = false): Promise<WritingInputDraft> => {
        const pendingRequest = retiring ? pendingRetirementSaveRef : pendingDraftSaveRef;
        const payload = { assignmentId: target.id, attemptNo, expectedRevision: revision, assetIds, manualTranscript,
          ...(retiring && files.length > 0 ? { prepareUpload: true as const } : {}) };
        const signature = JSON.stringify(payload);
        const pending = pendingRequest.current?.signature === signature
          ? pendingRequest.current
          : { signature, request: { ...payload, requestId: crypto.randomUUID() } };
        pendingRequest.current = pending;
        const response = await saveWritingInputDraft(pending.request);
        if (!response.draft || response.draft.assignmentId !== target.id || response.draft.attemptNo !== attemptNo) throw new Error('保存した下書きを確認できませんでした。');
        if (activeUserUidRef.current !== user.uid) throw new Error('アカウントが変更されました。');
        committedInputRef.current = response.draft;
        // Pending uploads remain represented by Files until the final CAS succeeds.
        const transientAssetIds = retiring && files.length > 0 ? new Set(cache.assetIds.filter(Boolean)) : new Set<string>();
        setSavedInputDraft({ ...response.draft, assetIds: response.draft.assetIds.filter(id => !transientAssetIds.has(id)),
          assets: response.draft.assets.filter(asset => !transientAssetIds.has(asset.id)) });
        manualDirtyRef.current = false;
        pendingRequest.current = null;
        return response.draft;
      };
      if (!gradingEnabled && (files.length > 0 || assetsNeedRetirementRef.current)) {
        const preparationSignature = JSON.stringify({ assetIds: existingAssets.map(asset => asset.id), manualTranscript });
        const prepared = preparedInputRef.current;
        if (files.length > 0 && !assetsNeedRetirementRef.current && prepared?.cache === cache
          && prepared.signature === preparationSignature && prepared.revision === expectedRevision) {
          expectedRevision = prepared.revision;
        } else {
          const retainedIds = [...new Set([...existingAssets.map(asset => asset.id), ...cache.assetIds.filter((id): id is string => Boolean(id))])];
          const retained = await persistInput(retainedIds, expectedRevision, true);
          expectedRevision = retained.revision;
          preparedInputRef.current = { cache, signature: preparationSignature, revision: expectedRevision };
          assetsNeedRetirementRef.current = false;
        }
        if (files.length === 0) {
          setDraftSavedMessage('下書きを保存しました。未評価で、成績・提出は確定していません。');
          setNotice({ tone: 'success', message: '答案の下書きを保存しました（未評価）。' });
          return;
        }
        setDraftSavedMessage('添付と本文の保存準備は確認済みです。新しいファイルはまだ保存されていません。');
      }
      for (const [index, file] of files.entries()) {
        const existingAssetId = cache.assetIds[index];
        if (existingAssetId) {
          uploadResults.push(existingAssetId);
          continue;
        }
        const upload = (!gradingEnabled && pendingUploadsRef.current?.requests[index]) || await createWritingUploadUrl({
          assignmentId: target.id,
          fileName: file.name,
          mimeType: resolveWritingUploadMimeType(file),
          byteSize: file.size,
          sha256Base64: await calculateWritingAssetSha256Base64(file),
          assetOrder: (gradingEnabled ? 0 : existingAssets.length) + index + 1,
          attemptNo,
        });
        if (!gradingEnabled) pendingUploadsRef.current!.requests[index] = upload;
        await uploadWritingAsset(upload, file);
        cache.assetIds[index] = upload.assetId;
        uploadResults.push(upload.assetId);
      }

      if (!gradingEnabled) {
        await persistInput(uploadResults, expectedRevision);
        setFiles([]); uploadedFilesRef.current = null; pendingUploadsRef.current = null; preparedInputRef.current = null;
        setDraftSavedMessage('下書きを保存しました。未評価で、成績・提出は確定していません。');
        setNotice({ tone: 'success', message: '答案の下書きを保存しました（未評価）。' });
        return;
      }

      const detail = await finalizeStudentWritingSubmission({
        assignmentId: target.id,
        source: WritingSubmissionSource.STUDENT_MOBILE,
        assetIds: uploadResults,
        attemptNo,
        manualTranscript: manualTranscript.trim() || undefined,
      });

      if (activeUserUidRef.current !== user.uid) return;
      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('答案を提出しました。講師確認後に返却されます。', detail),
      });
      submitLockRef.current = false;
      resetSubmitDialog();
      await refresh();
    } catch (error) {
      if (activeUserUidRef.current !== user.uid) return;
      console.error(error);
      setSubmissionError(`${(error as Error).message || '保存を確認できませんでした。'} 入力とファイルは保持しています。同じ内容で再試行できます。別の画面で更新した場合は、下書きを再取得してください。原本の手動確認を講師に依頼できます。`);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '答案提出に失敗しました。',
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const openFeedback = async (assignment: WritingAssignment) => {
    const submissionId = getWritingFeedbackSubmissionId(assignment);
    if (!submissionId) return;
    const requestVersion = feedbackRequestVersionRef.current + 1;
    feedbackRequestVersionRef.current = requestVersion;
    setOpeningFeedbackId(submissionId);
    try {
      const detail = await getStudentWritingSubmissionDetail(submissionId);
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
    loadError,
    notice,
    submitTarget,
    feedbackDetail,
    files,
    manualTranscript,
    submitting,
    submissionError,
    capabilities, savedInputDraft, draftLoading, draftLoadError, draftLoaded, draftSavedMessage,
    retryDraftLoad: () => { if (submitTarget) void restoreDraft(submitTarget, true); },
    removeSavedAsset: (id: string) => {
      if (submitLockRef.current || draftLoading) return;
      setSavedInputDraft(current => current ? { ...current, assetIds: current.assetIds.filter(assetId => assetId !== id), assets: current.assets.filter(asset => asset.id !== id) } : null);
      assetsNeedRetirementRef.current = true;
      setDraftSavedMessage(null);
    },
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
    setFiles: (value: File[]) => { if (!submitLockRef.current && !draftLoading) { setFiles(value); setDraftSavedMessage(null); } },
    setManualTranscript: (value: string) => { if (!submitLockRef.current && !draftLoading) { manualDirtyRef.current = true; setManualTranscript(value); setDraftSavedMessage(null); } },
    handleSubmit,
    openFeedback,
    closeFeedback,
    handlePrintFeedback,
    toggleFeedbackCommentExpanded: () => setFeedbackCommentExpanded((current) => !current),
    setMobileSubmitStep,
  };
};

export default useWritingStudentController;
