import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileStack,
  History,
  Loader2,
  MessageSquareMore,
  ScanText,
  Sparkles,
} from 'lucide-react';
import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import type {
  StudentSummary,
  UserProfile,
  WritingAssignment,
  WritingAssignmentStatus,
  WritingEvaluation,
  WritingQueueItem,
  WritingPromptTemplate,
} from '../types';
import {
  WRITING_AI_PROVIDER_LABELS,
  WRITING_ASSIGNMENT_STATUS_LABELS,
  WRITING_SUBMISSION_SOURCE_LABELS,
  WritingSubmissionSource,
} from '../types';
import { storage } from '../services/storage';
import {
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
import ModalOverlay from './ModalOverlay';
import WritingPrintLauncher from './WritingPrintLauncher';
import WorkspaceStageStrip from './workspace/WorkspaceStageStrip';

interface WritingOpsPanelProps {
  user: UserProfile;
}

type WritingOpsTab = 'CREATE' | 'PRINT' | 'QUEUE' | 'HISTORY';

const TAB_COPY: Record<
  WritingOpsTab,
  {
    label: string;
    icon: React.ReactNode;
    eyebrow: string;
    title: string;
    body: string;
    nextAction: string;
  }
> = {
  CREATE: {
    label: '問題作成',
    icon: <Sparkles className="h-4 w-4" />,
    eyebrow: 'Create Prompt',
    title: 'テンプレートから配布前の課題を作る',
    body: '対象生徒とテンプレートを選び、テーマ補足を入れて紙配布用の課題を下書き化します。',
    nextAction: '生徒とテンプレートを選んで課題を生成する',
  },
  PRINT: {
    label: '印刷 / 配布',
    icon: <FileStack className="h-4 w-4" />,
    eyebrow: 'Issue Worksheet',
    title: '印刷、配布、校舎スキャナー提出を同じ場所で扱う',
    body: '生成済み課題の状態を見ながら、印刷、配布、校舎スキャナー提出までをまとめて進めます。',
    nextAction: '下書き課題を配布状態にして、紙学習に流す',
  },
  QUEUE: {
    label: '添削キュー',
    icon: <ScanText className="h-4 w-4" />,
    eyebrow: 'Review Queue',
    title: '答案、OCR、AI比較、返却操作を一画面で処理する',
    body: '講師確認待ちの提出を選び、右側で返却コメントと再提出判断を確定します。',
    nextAction: '提出を選んで返却または再提出依頼を決める',
  },
  HISTORY: {
    label: '返却履歴',
    icon: <History className="h-4 w-4" />,
    eyebrow: 'Return History',
    title: '返却済み答案の履歴をあとから確認する',
    body: 'どの講評で返却したか、どの AI 結果を採用したかを履歴として追えます。',
    nextAction: '返却済みの内容を確認し、必要なら完了へ進める',
  },
};

const statusTone = (status: WritingAssignmentStatus): string => {
  switch (status) {
    case 'REVIEW_READY':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'RETURNED':
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'REVISION_REQUESTED':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

const formatDateTime = (timestamp?: number): string => {
  if (!timestamp) return '未設定';
  return new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

const WritingOpsPanel: React.FC<WritingOpsPanelProps> = ({ user }) => {
  const [tab, setTab] = useState<WritingOpsTab>('CREATE');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [templates, setTemplates] = useState<WritingPromptTemplate[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [assignments, setAssignments] = useState<WritingAssignment[]>([]);
  const [queue, setQueue] = useState<WritingQueueItem[]>([]);
  const [history, setHistory] = useState<WritingQueueItem[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('');
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
  const [busyAction, setBusyAction] = useState<'generate' | 'issue' | 'review' | null>(null);
  const [submittingScan, setSubmittingScan] = useState(false);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [templateResponse, studentRows, assignmentResponse, queueResponse, historyResponse] = await Promise.all([
        listWritingTemplates(),
        storage.getAllStudentsProgress(),
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
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (assignments.length === 0) {
      setSelectedAssignmentId('');
      return;
    }
    if (!selectedAssignmentId || !assignments.some((assignment) => assignment.id === selectedAssignmentId)) {
      setSelectedAssignmentId(assignments[0].id);
    }
  }, [assignments, selectedAssignmentId]);

  const reviewList = tab === 'QUEUE' ? queue : history;

  useEffect(() => {
    if (tab !== 'QUEUE' && tab !== 'HISTORY') return;
    if (reviewList.length === 0) {
      setSelectedSubmissionId('');
      setDetail(null);
      return;
    }
    if (!selectedSubmissionId || !reviewList.some((item) => item.submissionId === selectedSubmissionId)) {
      setSelectedSubmissionId(reviewList[0].submissionId);
    }
  }, [reviewList, selectedSubmissionId, tab]);

  useEffect(() => {
    if (tab !== 'QUEUE' && tab !== 'HISTORY') return;
    if (!selectedSubmissionId) {
      setDetail(null);
      return;
    }
    const loadDetail = async () => {
      try {
        const nextDetail = await getWritingSubmissionDetail(selectedSubmissionId);
        setDetail(nextDetail);
        setReviewPublicComment(nextDetail.submission.teacherReview?.publicComment || '良い点と次に直すべき点を一緒に確認しましょう。');
        setReviewPrivateMemo(nextDetail.submission.teacherReview?.privateMemo || '');
        setSelectedEvaluationId(
          nextDetail.submission.teacherReview?.selectedEvaluationId
          || nextDetail.submission.selectedEvaluationId
          || nextDetail.submission.evaluations[0]?.id
          || '',
        );
      } catch (error) {
        console.error(error);
        setNotice({
          tone: 'error',
          message: (error as Error).message || '提出詳細の取得に失敗しました。',
        });
      }
    };
    void loadDetail();
  }, [selectedSubmissionId, tab]);

  const selectedAssignment = assignments.find((assignment) => assignment.id === selectedAssignmentId) || null;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;
  const selectedStudent = students.find((student) => student.uid === selectedStudentUid) || null;

  const handleGenerate = async () => {
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
      await refreshAll();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '課題生成に失敗しました。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleIssue = async () => {
    if (!selectedAssignment) return;
    setBusyAction('issue');
    try {
      const issued = await issueWritingAssignment(selectedAssignment.id);
      setNotice({ tone: 'success', message: `${issued.studentName} さんへ課題を配布状態にしました。` });
      setSelectedAssignmentId(issued.id);
      await refreshAll();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '課題配布に失敗しました。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleApprove = async () => {
    if (!detail || !selectedEvaluationId || !reviewPublicComment.trim()) return;
    setBusyAction('review');
    try {
      const nextDetail = await approveWritingReturn(detail.submission.id, {
        selectedEvaluationId,
        publicComment: reviewPublicComment,
        privateMemo: reviewPrivateMemo,
      });
      setDetail(nextDetail);
      setNotice({ tone: 'success', message: '講師確認後の返却内容を確定しました。' });
      await refreshAll();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '返却確定に失敗しました。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRequestRevision = async () => {
    if (!detail || !selectedEvaluationId || !reviewPublicComment.trim()) return;
    setBusyAction('review');
    try {
      const nextDetail = await requestWritingRevision(detail.submission.id, {
        selectedEvaluationId,
        publicComment: reviewPublicComment,
        privateMemo: reviewPrivateMemo,
      });
      setDetail(nextDetail);
      setNotice({ tone: 'success', message: '再提出依頼を保存しました。' });
      await refreshAll();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '再提出依頼に失敗しました。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleComplete = async () => {
    if (!detail) return;
    setBusyAction('review');
    try {
      await completeWritingAssignment(detail.assignment.id);
      setNotice({ tone: 'success', message: '課題を完了済みにしました。' });
      await refreshAll();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || '完了処理に失敗しました。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleScannerSubmit = async () => {
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
          assetOrder: index + 1,
          attemptNo: scannerTarget.attemptCount + 1,
        });
        await uploadWritingAsset(upload, file);
        assetIds.push(upload.assetId);
      }

      await finalizeWritingSubmission({
        assignmentId: scannerTarget.id,
        source: WritingSubmissionSource.STAFF_SCANNER,
        assetIds,
        attemptNo: scannerTarget.attemptCount + 1,
        manualTranscript: scannerManualTranscript.trim() || undefined,
      });
      setNotice({ tone: 'success', message: '校舎スキャナー経由の答案を登録しました。' });
      setScannerFiles([]);
      setScannerManualTranscript('');
      setScannerTarget(null);
      setTab('QUEUE');
      await refreshAll();
    } catch (error) {
      console.error(error);
      setNotice({ tone: 'error', message: (error as Error).message || 'スキャナー提出の登録に失敗しました。' });
    } finally {
      setSubmittingScan(false);
    }
  };

  const selectedEvaluation = detail?.submission.evaluations.find((evaluation) => evaluation.id === selectedEvaluationId)
    || detail?.submission.evaluations.find((evaluation) => evaluation.isDefault)
    || detail?.submission.evaluations[0];
  const viewCopy = TAB_COPY[tab];
  const stageSteps = [
    {
      id: 'CREATE',
      index: 1,
      label: '問題作成',
      value: `${templates.length}種`,
      hint: `${students.length}名に配布候補`,
      active: tab === 'CREATE',
    },
    {
      id: 'PRINT',
      index: 2,
      label: '印刷 / 配布',
      value: `${assignments.length}件`,
      hint: `下書き ${assignments.filter((assignment) => assignment.status === 'DRAFT').length} / 配布済み ${assignments.filter((assignment) => assignment.status === 'ISSUED').length}`,
      active: tab === 'PRINT',
    },
    {
      id: 'QUEUE',
      index: 3,
      label: '添削キュー',
      value: `${queue.length}件`,
      hint: '返却前の講師確認待ち',
      active: tab === 'QUEUE',
    },
    {
      id: 'HISTORY',
      index: 4,
      label: '返却履歴',
      value: `${history.length}件`,
      hint: '返却済みと完了済みの履歴',
      active: tab === 'HISTORY',
    },
  ];
  const currentStageCount = (() => {
    if (tab === 'CREATE') return `${templates.length}テンプレート`;
    if (tab === 'PRINT') return `${assignments.length}課題`;
    if (tab === 'QUEUE') return `${queue.length}提出`;
    return `${history.length}履歴`;
  })();

  return (
    <section data-testid="writing-ops-panel" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Writing Ops</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">自由英作文の紙提出運用</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            問題生成、印刷、紙答案の提出、AI比較、講師確認、返却までを段階ごとに処理します。
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

      <div className="mt-6">
        <WorkspaceStageStrip steps={stageSteps} />
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{viewCopy.eyebrow}</p>
            <h4 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{viewCopy.title}</h4>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{viewCopy.body}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:min-w-[560px]">
            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">現在の段階</div>
              <div className="mt-2 text-lg font-black text-slate-950">{viewCopy.label}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">件数</div>
              <div className="mt-2 text-lg font-black text-slate-950">{currentStageCount}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">次にやること</div>
              <div className="mt-2 text-sm font-bold leading-relaxed text-slate-700">{viewCopy.nextAction}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.keys(TAB_COPY) as WritingOpsTab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ${
                tab === key
                  ? 'bg-medace-700 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-medace-200 hover:text-medace-700'
              }`}
            >
              {TAB_COPY[key].icon}
              {TAB_COPY[key].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex min-h-[24vh] items-center justify-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-medace-500" />
        </div>
      ) : (
        <div className="mt-6">
          {tab === 'CREATE' && (
            <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-medace-600" />
                  <div>
                    <h4 className="text-lg font-black text-slate-950">新しい課題を作る</h4>
                    <p className="mt-1 text-sm text-slate-500">対象生徒とテンプレートを決めて、紙配布前の課題を作成します。</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">対象生徒</label>
                    <select
                      data-testid="writing-student-select"
                      value={selectedStudentUid}
                      onChange={(event) => setSelectedStudentUid(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      <option value="">生徒を選択</option>
                      {students.map((student) => (
                        <option key={student.uid} value={student.uid}>{student.name} / {student.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">テンプレート</label>
                    <select
                      data-testid="writing-template-select"
                      value={selectedTemplateId}
                      onChange={(event) => setSelectedTemplateId(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      <option value="">テンプレートを選択</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.title} / {template.defaultWordCountMin}-{template.defaultWordCountMax}語
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">テーマ補足</label>
                    <input
                      type="text"
                      value={topicHint}
                      onChange={(event) => setTopicHint(event.target.value)}
                      placeholder="例: 学校でのICT活用"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">講師メモ</label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="面談で確認したい観点や、扱ってほしい具体例"
                      className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    />
                  </div>
                  <button
                    type="button"
                    data-testid="writing-generate-submit"
                    disabled={busyAction === 'generate' || !selectedStudentUid || !selectedTemplateId}
                    onClick={handleGenerate}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
                  >
                    {busyAction === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    課題を生成する
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Generation Preview</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-white bg-white px-5 py-5">
                      <div className="text-sm font-bold text-slate-950">対象生徒</div>
                      {selectedStudent ? (
                        <>
                          <div className="mt-3 text-lg font-black text-slate-950">{selectedStudent.name}</div>
                          <div className="mt-1 text-sm text-slate-500">{selectedStudent.email}</div>
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            {selectedStudent.recommendedAction || '日々の進行に合わせて作文課題を調整します。'}
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 text-sm text-slate-500">左側で生徒を選ぶとここに対象が表示されます。</div>
                      )}
                    </div>
                    <div className="rounded-3xl border border-white bg-white px-5 py-5">
                      <div className="text-sm font-bold text-slate-950">テンプレート</div>
                      {selectedTemplate ? (
                        <>
                          <div className="mt-3 text-lg font-black text-slate-950">{selectedTemplate.title}</div>
                          <div className="mt-1 text-sm text-slate-500">{selectedTemplate.examCategory} / {selectedTemplate.templateType}</div>
                          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            {selectedTemplate.defaultWordCountMin}-{selectedTemplate.defaultWordCountMax}語 / {selectedTemplate.sampleTopic || 'テーマ自由'}
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 text-sm text-slate-500">左側でテンプレートを選ぶと課題条件が表示されます。</div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Template Bank</div>
                      <h4 className="mt-1 text-lg font-black text-slate-950">テンプレート一覧</h4>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                      {templates.length} 件
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`rounded-3xl border px-5 py-4 text-left ${
                          selectedTemplateId === template.id
                            ? 'border-medace-300 bg-medace-50/80'
                            : 'border-slate-200 bg-slate-50 hover:border-medace-200'
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-950">{template.title}</div>
                        <div className="mt-2 text-xs text-slate-400">{template.templateType}</div>
                        <div className="mt-3 text-sm leading-relaxed text-slate-600">{template.promptBase}</div>
                        <div className="mt-4 rounded-2xl border border-white bg-white px-4 py-3 text-xs text-slate-500">
                          {template.defaultWordCountMin}-{template.defaultWordCountMax} words / {template.sampleTopic || '自由設定'}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === 'PRINT' && (
            <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
              <div className="space-y-3">
                {assignments.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                    まだ自由英作文課題はありません。先に問題作成タブで生成してください。
                  </div>
                )}
                {assignments.map((assignment) => (
                  <button
                    key={assignment.id}
                    type="button"
                    onClick={() => setSelectedAssignmentId(assignment.id)}
                    className={`w-full rounded-3xl border px-5 py-4 text-left ${
                      selectedAssignment?.id === assignment.id
                        ? 'border-medace-300 bg-medace-50/80'
                        : 'border-slate-200 bg-white hover:border-medace-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{assignment.studentName}</div>
                        <div className="mt-1 text-xs text-slate-400">{assignment.promptTitle}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(assignment.status)}`}>
                        {WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        語数
                        <div className="mt-1 text-sm font-black text-slate-900">{assignment.wordCountMin}-{assignment.wordCountMax}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        提出コード
                        <div className="mt-1 text-sm font-black text-slate-900">{assignment.submissionCode}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        更新
                        <div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(assignment.updatedAt)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-5">
                <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                  {selectedAssignment ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-bold text-slate-950">{selectedAssignment.studentName}</div>
                          <div className="mt-1 text-xs text-slate-400">{selectedAssignment.promptTitle}</div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(selectedAssignment.status)}`}>
                          {WRITING_ASSIGNMENT_STATUS_LABELS[selectedAssignment.status]}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Attempt</div>
                          <div className="mt-2 text-xl font-black text-slate-950">{selectedAssignment.attemptCount} / {selectedAssignment.maxAttempts}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">配布時刻</div>
                          <div className="mt-2 text-sm font-black text-slate-950">{formatDateTime(selectedAssignment.issuedAt)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終提出</div>
                          <div className="mt-2 text-sm font-black text-slate-950">{formatDateTime(selectedAssignment.lastSubmittedAt)}</div>
                        </div>
                      </div>

                      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Prompt Snapshot</div>
                        <div className="mt-3 text-sm leading-relaxed text-slate-700">{selectedAssignment.promptText}</div>
                        <div className="mt-4 rounded-2xl border border-white bg-white px-4 py-3 text-xs leading-relaxed text-slate-500">
                          {selectedAssignment.guidance}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        {selectedAssignment.status === 'DRAFT' && (
                          <button
                            type="button"
                            data-testid="writing-issue-assignment"
                            disabled={busyAction === 'issue'}
                            onClick={handleIssue}
                            className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
                          >
                            {busyAction === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            配布状態にする
                          </button>
                        )}
                        {(selectedAssignment.status === 'ISSUED' || selectedAssignment.status === 'REVISION_REQUESTED') && (
                          <button
                            type="button"
                            onClick={() => setScannerTarget(selectedAssignment)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                          >
                            <ScanText className="h-4 w-4" />
                            校舎スキャナー提出
                          </button>
                        )}
                        <WritingPrintLauncher assignment={selectedAssignment} />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                      印刷したい課題を左から選択してください。
                    </div>
                  )}
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Operation Notes</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {[
                      '問題作成後に印刷し、提出コード付きで紙配布する',
                      '校舎提出は PDF 1枚または画像 4 枚までにそろえる',
                      '返却後の再提出は 1 回だけ許可される',
                    ].map((item) => (
                      <div key={item} className="rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-600">
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {(tab === 'QUEUE' || tab === 'HISTORY') && (
            <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
              <div className="space-y-3" data-testid="writing-review-queue">
                {reviewList.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                    {tab === 'QUEUE' ? '講師確認待ちの提出はまだありません。' : '返却済みの履歴はまだありません。'}
                  </div>
                )}
                {reviewList.map((item) => (
                  <button
                    key={item.submissionId}
                    type="button"
                    data-testid={`writing-review-item-${item.submissionId}`}
                    onClick={() => setSelectedSubmissionId(item.submissionId)}
                    className={`w-full rounded-3xl border px-5 py-4 text-left ${
                      selectedSubmissionId === item.submissionId
                        ? 'border-medace-300 bg-medace-50/80'
                        : 'border-slate-200 bg-white hover:border-medace-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{item.studentName}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.promptTitle}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(item.status)}`}>
                        {WRITING_ASSIGNMENT_STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                      <div>提出: {formatDateTime(item.submittedAt)}</div>
                      <div>Attempt {item.attemptNo}</div>
                      <div>OCR {Math.round(item.transcriptConfidence * 100)}%</div>
                      <div>{item.recommendedProvider ? WRITING_AI_PROVIDER_LABELS[item.recommendedProvider] : '未選択'}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                {!detail ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
                    左の一覧から答案を選ぶと、答案、OCR、AI比較、講師コメント、返却操作をまとめて確認できます。
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
                      <div className="space-y-5">
                        <section className="rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="text-sm font-bold text-slate-950">{detail.assignment.studentName}</div>
                              <div className="mt-1 text-xs text-slate-400">{detail.assignment.promptTitle}</div>
                            </div>
                            <div className="text-right text-xs text-slate-500">
                              <div>{formatDateTime(detail.submission.submittedAt)}</div>
                              <div className="mt-1">Attempt {detail.submission.attemptNo}</div>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">提出元</div>
                              <div className="mt-2 text-sm font-black text-slate-950">
                                {WRITING_SUBMISSION_SOURCE_LABELS[detail.submission.submissionSource]}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">OCR信頼度</div>
                              <div className="mt-2 text-sm font-black text-slate-950">
                                {Math.round(detail.submission.transcriptConfidence * 100)}%
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">現在状態</div>
                              <div className="mt-2 text-sm font-black text-slate-950">
                                {WRITING_ASSIGNMENT_STATUS_LABELS[detail.assignment.status]}
                              </div>
                            </div>
                          </div>
                        </section>

                        <section className="rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                            <FileStack className="h-4 w-4" />
                            答案
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {detail.submission.assets.map((asset) => (
                              <div key={asset.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                                <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{asset.fileName}</div>
                                {renderAsset(asset)}
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                            <ClipboardList className="h-4 w-4" />
                            OCR
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{detail.submission.transcript}</p>
                        </section>

                        <section className="rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                            <MessageSquareMore className="h-4 w-4" />
                            AI比較
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {detail.submission.evaluations.map((evaluation) => (
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
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-bold text-slate-900">{WRITING_AI_PROVIDER_LABELS[evaluation.provider]}</div>
                                  <div className="text-xs font-bold text-slate-400">{evaluation.latencyMs} ms</div>
                                </div>
                                <div className="mt-3 text-2xl font-black text-slate-950">{evaluation.overallScore} / 20</div>
                                <div className="mt-2 text-xs leading-relaxed text-slate-500">
                                  structure {Math.round(evaluation.structureScore * 100)} / alignment {Math.round(evaluation.transcriptAlignment * 100)} / confidence {Math.round(evaluation.confidence * 100)}
                                </div>
                              </button>
                            ))}
                          </div>

                          {selectedEvaluation && (
                            <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                              <div className="space-y-4">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">観点別評価</div>
                                  <div className="mt-3 grid gap-2">
                                    {selectedEvaluation.rubric.map((item) => (
                                      <div key={item.key} className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-700">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="font-bold text-slate-900">{item.label}</span>
                                          <span className="text-xs font-bold text-slate-400">{item.score} / {item.maxScore}</span>
                                        </div>
                                        <div className="mt-2 text-xs leading-relaxed text-slate-500">{item.comment}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">良い点</div>
                                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                                    {selectedEvaluation.strengths.map((item) => <li key={item}>{item}</li>)}
                                  </ul>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">改善点</div>
                                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                                    {selectedEvaluation.improvementPoints.map((item) => <li key={item}>{item}</li>)}
                                  </ul>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">訂正文例</div>
                                  <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                                    {selectedEvaluation.correctedDraft}
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">模範例</div>
                                  <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                                    {selectedEvaluation.modelAnswer}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </section>
                      </div>

                      <aside className="space-y-5">
                        <section className="rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">採用候補</div>
                          {selectedEvaluation ? (
                            <>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <div className="text-sm font-bold text-slate-950">
                                  {WRITING_AI_PROVIDER_LABELS[selectedEvaluation.provider]}
                                </div>
                                <div className="rounded-full border border-medace-200 bg-medace-50 px-2.5 py-1 text-xs font-bold text-medace-700">
                                  {selectedEvaluation.overallScore} / 20
                                </div>
                              </div>
                              <div className="mt-4 grid gap-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                  OCR整合: <span className="font-black text-slate-950">{Math.round(selectedEvaluation.transcriptAlignment * 100)}%</span>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                  構造完全性: <span className="font-black text-slate-950">{Math.round(selectedEvaluation.structureScore * 100)}%</span>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                  コスト: <span className="font-black text-slate-950">{selectedEvaluation.costMilliYen} m¥</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="mt-3 text-sm text-slate-500">比較結果がありません。</div>
                          )}
                        </section>

                        {tab === 'QUEUE' ? (
                          <section className="rounded-3xl border border-slate-200 bg-white p-5">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">講師コメント</div>
                            <textarea
                              data-testid="writing-review-public-comment"
                              value={reviewPublicComment}
                              onChange={(event) => setReviewPublicComment(event.target.value)}
                              className="mt-3 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                            />
                            <div className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">講師メモ</div>
                            <textarea
                              value={reviewPrivateMemo}
                              onChange={(event) => setReviewPrivateMemo(event.target.value)}
                              className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                            />
                            <div className="mt-5 flex flex-col gap-3">
                              <button
                                type="button"
                                data-testid="writing-approve-return"
                                disabled={busyAction === 'review' || !selectedEvaluationId || !reviewPublicComment.trim()}
                                onClick={handleApprove}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {busyAction === 'review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                承認して返却
                              </button>
                              {detail.submission.attemptNo < detail.assignment.maxAttempts && (
                                <button
                                  type="button"
                                  onClick={handleRequestRevision}
                                  disabled={busyAction === 'review' || !selectedEvaluationId || !reviewPublicComment.trim()}
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                                >
                                  再提出を依頼
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={handleComplete}
                                disabled={busyAction === 'review'}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700 disabled:opacity-50"
                              >
                                完了にする
                              </button>
                            </div>
                          </section>
                        ) : (
                          <section className="rounded-3xl border border-slate-200 bg-white p-5">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">返却済みコメント</div>
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700">
                              {detail.submission.teacherReview?.publicComment || '講師コメントはまだありません。'}
                            </div>
                            {detail.submission.teacherReview?.privateMemo && (
                              <>
                                <div className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">内部メモ</div>
                                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700">
                                  {detail.submission.teacherReview.privateMemo}
                                </div>
                              </>
                            )}
                            {detail.assignment.status !== 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={handleComplete}
                                disabled={busyAction === 'review'}
                                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700 disabled:opacity-50"
                              >
                                完了にする
                              </button>
                            )}
                          </section>
                        )}
                      </aside>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {scannerTarget && (
        <ModalOverlay
          onClose={() => {
            if (submittingScan) return;
            setScannerTarget(null);
            setScannerFiles([]);
            setScannerManualTranscript('');
          }}
          panelClassName="max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Staff Scanner Submit</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{scannerTarget.promptTitle}</h3>
            <p className="mt-2 text-sm text-slate-500">
              校舎で取り込んだ PDF 1枚または画像最大4枚まで提出できます。OCR補助用のテキストも入力できます。
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">答案ファイル</label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  onChange={(event) => setScannerFiles(Array.from(event.target.files || []))}
                  className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">補助テキスト（任意）</label>
                <textarea
                  value={scannerManualTranscript}
                  onChange={(event) => setScannerManualTranscript(event.target.value)}
                  className="mt-2 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  placeholder="OCR 補助のために本文を入力できます。"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setScannerTarget(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleScannerSubmit}
                disabled={submittingScan || scannerFiles.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
              >
                {submittingScan ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                スキャン答案を登録する
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
};

export default WritingOpsPanel;
