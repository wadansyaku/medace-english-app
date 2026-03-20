import { useCallback, useEffect, useMemo, useState } from 'react';

import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import { workspaceService } from '../services/workspace';
import {
  calculateWritingAssetSha256Base64,
  approveWritingReturn,
  completeWritingAssignment,
  createWritingUploadUrl,
  finalizeWritingSubmission,
  generateWritingAssignment,
  getWritingSubmissionDetail,
  issueWritingAssignment,
  listWritingAssignments,
  listWritingReviewQueue,
  listWritingTemplates,
  requestWritingRevision,
  uploadWritingAsset,
} from '../services/writing';
import {
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

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

type BusyAction = 'generate' | 'issue' | 'review' | null;

export const useWritingOpsController = () => {
  const [tab, setTab] = useState<WritingOpsTab>('CREATE');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [templates, setTemplates] = useState<WritingPromptTemplate[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [assignments, setAssignments] = useState<WritingAssignment[]>([]);
  const [queue, setQueue] = useState<WritingQueueItem[]>([]);
  const [history, setHistory] = useState<WritingQueueItem[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [detail, setDetail] = useState<WritingSubmissionDetailResponse | null>(null);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [templateResponse, studentRows, assignmentResponse, queueResponse, historyResponse] = await Promise.all([
        listWritingTemplates(),
        workspaceService.getAllStudentsProgress(),
        listWritingAssignments('organization'),
        listWritingReviewQueue('QUEUE'),
        listWritingReviewQueue('HISTORY'),
      ]);

      setTemplates(templateResponse.templates);
      setStudents(studentRows.filter((student) => student.subscriptionPlan === 'TOB_PAID'));
      setAssignments(assignmentResponse.assignments);
      setQueue(queueResponse.items);
      setHistory(historyResponse.items);
    } catch (error) {
      console.error(error);
      setNotice({
        tone: 'error',
        message: (error as Error).message || '自由英作文データの読み込みに失敗しました。',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      setSelectedSubmissionId(nextSubmissionId);
      return;
    }

    if (!nextSubmissionId) {
      setDetail(null);
    }
  }, [reviewList, selectedSubmissionId, tab]);

  useEffect(() => {
    if (tab !== 'QUEUE' && tab !== 'HISTORY') return;
    if (!selectedSubmissionId) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      try {
        const nextDetail = await getWritingSubmissionDetail(selectedSubmissionId);
        if (cancelled) return;

        setDetail(nextDetail);
        setReviewPublicComment(
          nextDetail.submission.teacherReview?.publicComment
            || '良い点と次に直すべき点を一緒に確認しましょう。',
        );
        setReviewPrivateMemo(nextDetail.submission.teacherReview?.privateMemo || '');
        setSelectedEvaluationId(resolveSelectedEvaluationId(nextDetail));
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setNotice({
          tone: 'error',
          message: (error as Error).message || '提出詳細の取得に失敗しました。',
        });
      }
    };

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSubmissionId, tab]);

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
    detail?.submission.evaluations.find((evaluation) => evaluation.id === selectedEvaluationId)
      || detail?.submission.evaluations.find((evaluation) => evaluation.isDefault)
      || detail?.submission.evaluations[0]
  ), [detail, selectedEvaluationId]);

  const resetScanner = useCallback(() => {
    setScannerFiles([]);
    setScannerManualTranscript('');
    setScannerTarget(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedStudentUid || !selectedTemplateId) return;

    setBusyAction('generate');
    try {
      const assignment = await generateWritingAssignment({
        studentUid: selectedStudentUid,
        templateId: selectedTemplateId,
        topicHint,
        notes,
      });

      setNotice({ tone: 'success', message: `${assignment.studentName} さん向けの自由英作文課題を生成しました。` });
      setSelectedAssignmentId(assignment.id);
      setTab('PRINT');
      setTopicHint('');
      setNotes('');
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '課題生成に失敗しました。' });
    } finally {
      setBusyAction(null);
    }
  }, [notes, refresh, selectedStudentUid, selectedTemplateId, topicHint]);

  const handleIssue = useCallback(async () => {
    if (!selectedAssignment) return;

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
      setBusyAction(null);
    }
  }, [refresh, selectedAssignment]);

  const handleApprove = useCallback(async () => {
    if (!detail || !selectedEvaluationId || !reviewPublicComment.trim()) return;

    setBusyAction('review');
    try {
      const nextDetail = await approveWritingReturn(detail.submission.id, {
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
      setBusyAction(null);
    }
  }, [detail, refresh, reviewPrivateMemo, reviewPublicComment, selectedEvaluationId]);

  const handleRequestRevision = useCallback(async () => {
    if (!detail || !selectedEvaluationId || !reviewPublicComment.trim()) return;

    setBusyAction('review');
    try {
      const nextDetail = await requestWritingRevision(detail.submission.id, {
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
      setBusyAction(null);
    }
  }, [detail, refresh, reviewPrivateMemo, reviewPublicComment, selectedEvaluationId]);

  const handleComplete = useCallback(async () => {
    if (!detail) return;

    setBusyAction('review');
    try {
      const assignment = await completeWritingAssignment(detail.assignment.id);
      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('課題を完了済みにしました。', assignment),
      });
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '完了処理に失敗しました。' });
    } finally {
      setBusyAction(null);
    }
  }, [detail, refresh]);

  const handleScannerSubmit = useCallback(async () => {
    if (!scannerTarget || scannerFiles.length === 0) return;

    setSubmittingScan(true);
    try {
      const isPdf = scannerFiles[0].type === 'application/pdf';
      if (isPdf && scannerFiles.length > 1) {
        throw new Error('PDF は1ファイルのみ提出できます。');
      }
      if (!isPdf && scannerFiles.length > 4) {
        throw new Error('画像は最大4枚まで提出できます。');
      }

      const assetIds: string[] = [];
      for (const [index, file] of scannerFiles.entries()) {
        const upload = await createWritingUploadUrl({
          assignmentId: scannerTarget.id,
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          sha256Base64: await calculateWritingAssetSha256Base64(file),
          assetOrder: index + 1,
          attemptNo: scannerTarget.attemptCount + 1,
        });
        await uploadWritingAsset(upload, file);
        assetIds.push(upload.assetId);
      }

      const detail = await finalizeWritingSubmission({
        assignmentId: scannerTarget.id,
        source: WritingSubmissionSource.STAFF_SCANNER,
        assetIds,
        attemptNo: scannerTarget.attemptCount + 1,
        manualTranscript: scannerManualTranscript.trim() || undefined,
      });

      setNotice({
        tone: 'success',
        message: appendWritingSideEffectWarning('校舎スキャナー経由の答案を登録しました。', detail),
      });
      resetScanner();
      setTab('QUEUE');
      await refresh();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || 'スキャナー提出の登録に失敗しました。' });
    } finally {
      setSubmittingScan(false);
    }
  }, [refresh, resetScanner, scannerFiles, scannerManualTranscript, scannerTarget]);

  return {
    tab,
    loading,
    notice,
    templates,
    students,
    assignments,
    queue,
    history,
    reviewList,
    selectedAssignmentId,
    selectedSubmissionId,
    detail,
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
    setTab,
    setSelectedAssignmentId,
    setSelectedSubmissionId,
    setSelectedStudentUid,
    setSelectedTemplateId,
    setTopicHint,
    setNotes,
    setReviewPublicComment,
    setReviewPrivateMemo,
    setSelectedEvaluationId,
    setScannerTarget,
    setScannerFiles,
    setScannerManualTranscript,
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
