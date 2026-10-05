import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import { workspaceService } from '../services/workspace';
import {
  calculateWritingAssetSha256Base64,
  approveWritingReturn,
  completeWritingAssignment,
  createWritingUploadUrl,
  finalizeStaffWritingSubmission,
  generateWritingAssignment,
  getStaffWritingSubmissionDetail,
  issueWritingAssignment,
  listWritingAssignments,
  listWritingReviewQueue,
  listWritingTemplates,
  requestWritingRevision,
  uploadWritingAsset,
} from '../services/writing';
import {
  WritingAssignmentStatus,
  WritingSubmissionSource,
  type StudentSummary,
  type WritingAssignment,
  type WritingPromptTemplate,
  type WritingQueueItem,
} from '../types';
import {
  getReviewListForTab,
  resolveSelectedAssignmentId,
  resolveSelectedEvaluationId,
  resolveSelectedSubmissionId,
  type WritingOpsTab,
} from '../utils/writingOps';
import { appendWritingSideEffectWarning } from '../utils/writingSideEffects';
import { resolveWritingUploadRetryCache, type WritingUploadRetryCache } from '../utils/writingUploadRetry';
import { isSampleWritingProvenance } from '../shared/writingAiSafety';
import {
  resolveWritingUploadMimeType,
  validateWritingSubmissionFiles,
} from '../utils/writingSubmissionValidation';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

type BusyAction = 'generate' | 'issue' | 'review' | null;

export const useWritingOpsController = () => {
  const [tab, setTab] = useState<WritingOpsTab>('CREATE');
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [templates, setTemplates] = useState<WritingPromptTemplate[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [assignments, setAssignments] = useState<WritingAssignment[]>([]);
  const [queue, setQueue] = useState<WritingQueueItem[]>([]);
  const [history, setHistory] = useState<WritingQueueItem[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [detail, setDetail] = useState<WritingSubmissionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [selectedStudentUid, setSelectedStudentUid] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [topicHint, setTopicHint] = useState('');
  const [notes, setNotes] = useState('');
  const [reviewPublicComment, setReviewPublicComment] = useState('');
  const [reviewPrivateMemo, setReviewPrivateMemo] = useState('');
  const [selectedEvaluationId, setSelectedEvaluationId] = useState('');
  const [scannerTarget, setScannerTarget] = useState<WritingAssignment | null>(null);
  const [scannerFiles, setScannerFiles] = useState<File[]>([]);
  const [scannerManualTranscript, setScannerManualTranscript] = useState('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [submittingScan, setSubmittingScan] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const operationLock = useRef(false);
  const uploadedScannerFilesRef = useRef<WritingUploadRetryCache | null>(null);
  const refreshVersion = useRef(0);
  const detailVersion = useRef(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const selectedSubmissionRef = useRef(selectedSubmissionId);
  selectedSubmissionRef.current = selectedSubmissionId;

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [templateResponse, studentRows, assignmentResponse, queueResponse, historyResponse] = await Promise.all([
        listWritingTemplates(),
        workspaceService.getAllStudentsProgress(),
        listWritingAssignments('organization'),
        listWritingReviewQueue('QUEUE'),
        listWritingReviewQueue('HISTORY'),
      ]);

      if (version !== refreshVersion.current) return;
      setTemplates(templateResponse.templates);
      setStudents(studentRows.filter((student) => student.subscriptionPlan === 'TOB_PAID'));
      setAssignments(assignmentResponse.assignments);
      setQueue(queueResponse.items);
      setHistory(historyResponse.items);
      setHasData(true);
    } catch (error) {
      if (version !== refreshVersion.current) return;
      console.error(error);
      setLoadError((error as Error).message || '自由英作文データの読み込みに失敗しました。');
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { refreshVersion.current += 1; detailVersion.current += 1; };
  }, [refresh]);

  const changeTab = useCallback((nextTab: WritingOpsTab) => {
    if (operationLock.current || nextTab === tabRef.current) return;
    tabRef.current = nextTab;
    detailVersion.current += 1;
    setDetail(null);
    setDetailError(null);
    setTab(nextTab);
  }, []);

  const selectSubmission = useCallback((id: string) => {
    if (operationLock.current) return;
    if (id === selectedSubmissionRef.current) return;
    selectedSubmissionRef.current = id;
    detailVersion.current += 1;
    setDetail(null);
    setDetailError(null);
    setSelectedSubmissionId(id);
  }, []);

  const reviewList = useMemo(() => (
    getReviewListForTab(tab, queue, history)
  ), [history, queue, tab]);

  useEffect(() => {
    const nextAssignmentId = resolveSelectedAssignmentId(assignments, selectedAssignmentId);
    if (nextAssignmentId !== selectedAssignmentId) {
      setSelectedAssignmentId(nextAssignmentId);
    }
  }, [assignments, selectedAssignmentId]);

  useEffect(() => {
    if (tab !== 'QUEUE' && tab !== 'HISTORY') return;

    const nextSubmissionId = resolveSelectedSubmissionId(reviewList, selectedSubmissionId);
    if (nextSubmissionId !== selectedSubmissionId) {
      selectedSubmissionRef.current = nextSubmissionId;
      detailVersion.current += 1;
      setDetail(null);
      setSelectedSubmissionId(nextSubmissionId);
      return;
    }

    if (!nextSubmissionId) {
      setDetail(null);
    }
  }, [reviewList, selectedSubmissionId, tab]);

  useEffect(() => {
    const version = ++detailVersion.current;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    if ((tab !== 'QUEUE' && tab !== 'HISTORY') || !selectedSubmissionId) {
      return;
    }
    setDetailLoading(true);

    const loadDetail = async () => {
      try {
        const nextDetail = await getStaffWritingSubmissionDetail(selectedSubmissionId);
        if (version !== detailVersion.current) return;

        setDetail(nextDetail);
        setReviewPublicComment(
          nextDetail.submission.teacherReview?.publicComment
            || '良い点と次に直すべき点を一緒に確認しましょう。',
        );
        setReviewPrivateMemo(nextDetail.submission.teacherReview?.privateMemo || '');
        setSelectedEvaluationId(resolveSelectedEvaluationId(nextDetail));
      } catch (error) {
        if (version !== detailVersion.current) return;
        console.error(error);
        setDetailError((error as Error).message || '提出詳細の取得に失敗しました。');
      } finally {
        if (version === detailVersion.current) setDetailLoading(false);
      }
    };

    void loadDetail();
    return () => {
      detailVersion.current += 1;
    };
  }, [selectedSubmissionId, tab, detailRetry]);

  const currentDetail = detail?.submission.id === selectedSubmissionId && !detailLoading && !detailError
    ? detail
    : null;
  const retryDetail = useCallback(() => {
    if (!operationLock.current) setDetailRetry((value) => value + 1);
  }, []);

  const selectedAssignment = useMemo(() => (
    assignments.find((assignment) => assignment.id === selectedAssignmentId) || null
  ), [assignments, selectedAssignmentId]);
  const selectedTemplate = useMemo(() => (
    templates.find((template) => template.id === selectedTemplateId) || null
  ), [selectedTemplateId, templates]);
  const selectedStudent = useMemo(() => (
    students.find((student) => student.uid === selectedStudentUid) || null
  ), [selectedStudentUid, students]);
  const selectedEvaluation = useMemo(() => (
    currentDetail?.submission.evaluations.find((evaluation) => evaluation.id === selectedEvaluationId)
      || currentDetail?.submission.evaluations.find((evaluation) => evaluation.isDefault)
      || currentDetail?.submission.evaluations[0]
  ), [currentDetail, selectedEvaluationId]);

  const clearScanner = useCallback(() => {
    uploadedScannerFilesRef.current = null;
    setScannerFiles([]);
    setScannerManualTranscript('');
    setScannerTarget(null);
    setScannerError(null);
  }, []);
  const resetScanner = useCallback(() => {
    if (!operationLock.current) clearScanner();
  }, [clearScanner]);

  const handleGenerate = useCallback(async () => {
    if (operationLock.current || !selectedStudentUid || !selectedTemplateId) return;
    operationLock.current = true;
    setBusyAction('generate');
    try {
      const assignment = await generateWritingAssignment({
        studentUid: selectedStudentUid,
        templateId: selectedTemplateId,
        topicHint,
        notes,
      });

      setNotice({ tone: 'success', message: isSampleWritingProvenance(assignment.promptProvenance)
        ? `${assignment.studentName} さん向けにテンプレート課題を作成しました。AI生成は行っていません。`
        : `${assignment.studentName} さん向けの自由英作文課題を生成しました。` });
      setSelectedAssignmentId(assignment.id);
      setTab('PRINT');
      setTopicHint('');
      setNotes('');
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '課題生成に失敗しました。' });
    } finally {
      operationLock.current = false;
      setBusyAction(null);
    }
  }, [notes, refresh, selectedStudentUid, selectedTemplateId, topicHint]);

  const handleIssue = useCallback(async () => {
    if (operationLock.current || !selectedAssignment) return;
    operationLock.current = true;
    setBusyAction('issue');
    try {
      const issued = await issueWritingAssignment(selectedAssignment.id);
      setNotice({ tone: 'success', message: `${issued.studentName} さんへ課題を配布状態にしました。` });
      setSelectedAssignmentId(issued.id);
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '課題配布に失敗しました。' });
    } finally {
      operationLock.current = false;
      setBusyAction(null);
    }
  }, [refresh, selectedAssignment]);

  const handleApprove = useCallback(async () => {
    if (operationLock.current || tabRef.current !== 'QUEUE' || !currentDetail || selectedSubmissionRef.current !== currentDetail.submission.id || !selectedEvaluationId || !reviewPublicComment.trim()) return;
    operationLock.current = true;
    setBusyAction('review');
    try {
      const nextDetail = await approveWritingReturn(currentDetail.submission.id, {
        selectedEvaluationId,
        publicComment: reviewPublicComment,
        privateMemo: reviewPrivateMemo,
      });
      setDetail(nextDetail);
      setSelectedEvaluationId(resolveSelectedEvaluationId(nextDetail, selectedEvaluationId));
      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('講師確認後の返却内容を確定しました。', nextDetail),
      });
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '返却確定に失敗しました。' });
    } finally {
      operationLock.current = false;
      setBusyAction(null);
    }
  }, [currentDetail, refresh, reviewPrivateMemo, reviewPublicComment, selectedEvaluationId]);

  const handleRequestRevision = useCallback(async () => {
    if (operationLock.current || tabRef.current !== 'QUEUE' || !currentDetail || selectedSubmissionRef.current !== currentDetail.submission.id || !selectedEvaluationId || !reviewPublicComment.trim()) return;
    operationLock.current = true;
    setBusyAction('review');
    try {
      const nextDetail = await requestWritingRevision(currentDetail.submission.id, {
        selectedEvaluationId,
        publicComment: reviewPublicComment,
        privateMemo: reviewPrivateMemo,
      });
      setDetail(nextDetail);
      setSelectedEvaluationId(resolveSelectedEvaluationId(nextDetail, selectedEvaluationId));
      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('再提出依頼を保存しました。', nextDetail),
      });
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '再提出依頼に失敗しました。' });
    } finally {
      operationLock.current = false;
      setBusyAction(null);
    }
  }, [currentDetail, refresh, reviewPrivateMemo, reviewPublicComment, selectedEvaluationId]);

  const handleComplete = useCallback(async () => {
    if (operationLock.current || tabRef.current !== 'HISTORY' || !currentDetail || selectedSubmissionRef.current !== currentDetail.submission.id) return;
    if (currentDetail.assignment.status !== WritingAssignmentStatus.RETURNED) {
      setNotice({
        tone: 'error',
        message: '講師コメントを返却してから、課題を完了にできます。',
      });
      return;
    }

    operationLock.current = true;
    setBusyAction('review');
    try {
      const assignment = await completeWritingAssignment(currentDetail.assignment.id);
      setDetail((previous) => (
        tabRef.current === 'HISTORY'
        && selectedSubmissionRef.current === currentDetail.submission.id
        && previous?.submission.id === currentDetail.submission.id
        && previous.assignment.id === assignment.id
          ? { ...previous, assignment }
          : previous
      ));
      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('課題を完了済みにしました。', assignment),
      });
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '完了処理に失敗しました。' });
    } finally {
      operationLock.current = false;
      setBusyAction(null);
    }
  }, [currentDetail, refresh]);

  const handleScannerSubmit = useCallback(async () => {
    if (operationLock.current || !scannerTarget || scannerFiles.length === 0) return;
    const validation = validateWritingSubmissionFiles(scannerFiles);
    if (!validation.valid) {
      setScannerError(validation.message);
      return;
    }

    operationLock.current = true;
    setScannerError(null);
    setSubmittingScan(true);
    const attemptNo = scannerTarget.attemptCount + 1;
    const cache = resolveWritingUploadRetryCache(uploadedScannerFilesRef.current, `${scannerTarget.id}:${attemptNo}`, scannerFiles);
    uploadedScannerFilesRef.current = cache;
    try {
      const assetIds: string[] = [];
      for (const [index, file] of scannerFiles.entries()) {
        const existingAssetId = cache.assetIds[index];
        if (existingAssetId) {
          assetIds.push(existingAssetId);
          continue;
        }
        const upload = await createWritingUploadUrl({
          assignmentId: scannerTarget.id,
          fileName: file.name,
          mimeType: resolveWritingUploadMimeType(file),
          byteSize: file.size,
          sha256Base64: await calculateWritingAssetSha256Base64(file),
          assetOrder: index + 1,
          attemptNo,
        });
        await uploadWritingAsset(upload, file);
        cache.assetIds[index] = upload.assetId;
        assetIds.push(upload.assetId);
      }

      const detail = await finalizeStaffWritingSubmission({
        assignmentId: scannerTarget.id,
        source: WritingSubmissionSource.STAFF_SCANNER,
        assetIds,
        attemptNo,
        manualTranscript: scannerManualTranscript.trim() || undefined,
      });

      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('校舎スキャナー経由の答案を登録しました。', detail),
      });
      clearScanner();
      setTab('QUEUE');
      await refresh();
    } catch (error) {
      console.error(error);
      setScannerError((error as Error).message || 'スキャナー提出の登録に失敗しました。');
    } finally {
      operationLock.current = false;
      setSubmittingScan(false);
    }
  }, [refresh, clearScanner, scannerFiles, scannerManualTranscript, scannerTarget]);

  return {
    tab,
    loading,
    hasData,
    loadError,
    notice,
    templates,
    students,
    assignments,
    queue,
    history,
    reviewList,
    selectedAssignmentId,
    selectedSubmissionId,
    detail: currentDetail,
    detailLoading,
    detailError,
    retryDetail,
    selectedStudentUid,
    selectedTemplateId,
    topicHint,
    notes,
    reviewPublicComment,
    reviewPrivateMemo,
    selectedEvaluationId,
    selectedAssignment,
    selectedTemplate,
    selectedStudent,
    selectedEvaluation,
    scannerTarget,
    scannerFiles,
    scannerManualTranscript,
    busyAction,
    submittingScan,
    scannerError,
    setTab: changeTab,
    setSelectedAssignmentId: (value: string) => { if (!operationLock.current) setSelectedAssignmentId(value); },
    setSelectedSubmissionId: selectSubmission,
    setSelectedStudentUid: (value: string) => { if (!operationLock.current) setSelectedStudentUid(value); },
    setSelectedTemplateId: (value: string) => { if (!operationLock.current) setSelectedTemplateId(value); },
    setTopicHint: (value: string) => { if (!operationLock.current) setTopicHint(value); },
    setNotes: (value: string) => { if (!operationLock.current) setNotes(value); },
    setReviewPublicComment: (value: string) => { if (!operationLock.current) setReviewPublicComment(value); },
    setReviewPrivateMemo: (value: string) => { if (!operationLock.current) setReviewPrivateMemo(value); },
    setSelectedEvaluationId: (value: string) => { if (!operationLock.current) setSelectedEvaluationId(value); },
    setScannerTarget: (value: WritingAssignment) => { if (!operationLock.current) { clearScanner(); setScannerTarget(value); } },
    setScannerFiles: (value: File[]) => { if (!operationLock.current) { setScannerFiles(value); setScannerError(null); } },
    setScannerManualTranscript: (value: string) => { if (!operationLock.current) { setScannerManualTranscript(value); setScannerError(null); } },
    resetScanner,
    refresh,
    handleGenerate,
    handleIssue,
    handleApprove,
    handleRequestRevision,
    handleComplete,
    handleScannerSubmit,
  };
};

export default useWritingOpsController;
