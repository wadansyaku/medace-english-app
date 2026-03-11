import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { generateInstructorFollowUp } from '../services/gemini';
import { storage } from '../services/storage';
import { listWritingAssignments, listWritingReviewQueue } from '../services/writing';
import {
  InstructorWorkspaceView,
  StudentRiskLevel,
  SUBSCRIPTION_PLAN_LABELS,
  type StudentSummary,
  type UserProfile,
  type WritingAssignment,
  type WritingQueueItem,
} from '../types';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  FileStack,
  Loader2,
  MessageSquareText,
  ScanText,
  Search,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import WorkspaceMetricCard from './workspace/WorkspaceMetricCard';

const OfficialCatalogAccessPanel = lazy(() => import('./OfficialCatalogAccessPanel'));
const WorksheetPrintLauncher = lazy(() => import('./WorksheetPrintLauncher'));
const WritingOpsPanel = lazy(() => import('./WritingOpsPanel'));

interface InstructorDashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: InstructorWorkspaceView;
  onChangeView: (view: InstructorWorkspaceView) => void;
}

const getRiskStyle = (risk: StudentRiskLevel) => {
  switch (risk) {
    case StudentRiskLevel.DANGER:
      return 'bg-red-50 text-red-700 border-red-200';
    case StudentRiskLevel.WARNING:
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
};

const getPlanStyle = (plan?: StudentSummary['subscriptionPlan']) => {
  if (!plan) return 'bg-medace-50 text-medace-700 border-medace-100';
  if (plan === 'TOB_PAID') return 'bg-medace-900 text-white border-medace-900';
  if (plan === 'TOB_FREE') return 'bg-medace-100 text-medace-800 border-medace-200';
  if (plan === 'TOC_PAID') return 'bg-medace-50 text-medace-700 border-medace-200';
  return 'bg-white text-medace-700 border-medace-200';
};

const getRiskLabel = (risk: StudentRiskLevel) => {
  switch (risk) {
    case StudentRiskLevel.DANGER:
      return '要フォロー';
    case StudentRiskLevel.WARNING:
      return '見守り';
    default:
      return '安定';
  }
};

const buildFallbackMessage = (student: StudentSummary, instructorName: string): string => {
  const days = student.lastActive > 0 ? Math.floor((Date.now() - student.lastActive) / (1000 * 60 * 60 * 24)) : 0;
  if (student.riskLevel === StudentRiskLevel.DANGER) {
    return `${instructorName}より: ${student.name}さん、${days}日ほど学習が空いているので、今日はまず10語だけ復習して流れを戻しましょう。短時間で大丈夫です。`;
  }
  if (student.riskLevel === StudentRiskLevel.WARNING) {
    return `${instructorName}より: ${student.name}さん、このまま少しずつ続ければ安定します。今日は前回の復習を15分だけ進めてみましょう。`;
  }
  return `${instructorName}より: ${student.name}さん、良いペースです。次回も同じリズムで続けて、定着を一段上げていきましょう。`;
};

const getTriggerReason = (student: StudentSummary): string => {
  if (student.riskLevel === StudentRiskLevel.DANGER) return '離脱リスクフォロー';
  if (student.riskLevel === StudentRiskLevel.WARNING) return '学習再開フォロー';
  return '継続称賛フォロー';
};

const formatDateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDaysSinceActive = (timestamp: number): string => {
  if (!timestamp) return '未学習';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (days === 0) return '今日';
  if (days === 1) return '1日ぶり';
  return `${days}日ぶり`;
};

const getNextActionText = (student: StudentSummary): string => {
  if (student.recommendedAction) return student.recommendedAction;
  if (student.riskLevel === StudentRiskLevel.DANGER) return '今日のうちに声かけする';
  if (student.riskLevel === StudentRiskLevel.WARNING) return '次の学習開始を後押しする';
  return '現在のペースを維持する';
};

const VIEW_COPY: Record<InstructorWorkspaceView, { eyebrow: string; title: string; body: string }> = {
  [InstructorWorkspaceView.OVERVIEW]: {
    eyebrow: 'Coach Overview',
    title: '今日の介入対象と運用状況を先に掴む',
    body: '最優先の生徒、今日送る通知、自由英作文の滞留を最初に確認してから各作業へ入ります。',
  },
  [InstructorWorkspaceView.STUDENTS]: {
    eyebrow: 'Student Queue',
    title: '生徒一覧と通知作成を同じ画面で進める',
    body: '優先度の高い生徒から一覧で確認し、右側の詳細で理由と次アクションを見ながら通知文を整えます。',
  },
  [InstructorWorkspaceView.WRITING]: {
    eyebrow: 'Writing Workflow',
    title: '自由英作文の紙提出運用を段階ごとに進める',
    body: '問題作成、印刷、添削キュー、返却履歴を一つのワークスペースで処理します。',
  },
  [InstructorWorkspaceView.WORKSHEETS]: {
    eyebrow: 'Worksheet Ops',
    title: '紙配布の問題作成だけを素早く進める',
    body: '日々の単語配布に必要な PDF 問題作成を独立させ、他の運用情報と分離して扱います。',
  },
  [InstructorWorkspaceView.CATALOG]: {
    eyebrow: 'Catalog Access',
    title: '教材確認は必要なときだけ開く',
    body: '生徒フォローを邪魔しないように、教材閲覧は独立ビューに寄せて必要時だけ使います。',
  },
};

const InstructorDashboard: React.FC<InstructorDashboardProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
}) => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [writingAssignments, setWritingAssignments] = useState<WritingAssignment[]>([]);
  const [writingQueue, setWritingQueue] = useState<WritingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'DANGER' | 'WARNING'>('ALL');
  const [query, setQuery] = useState('');
  const [focusedStudentUid, setFocusedStudentUid] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [usedAi, setUsedAi] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentRows, assignmentResponse, queueResponse] = await Promise.all([
        storage.getAllStudentsProgress(),
        listWritingAssignments('organization'),
        listWritingReviewQueue('QUEUE'),
      ]);
      setStudents(studentRows);
      setWritingAssignments(assignmentResponse.assignments);
      setWritingQueue(queueResponse.items);
    } catch (loadError) {
      console.error(loadError);
      setError((loadError as Error).message || '生徒データの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const sortedStudents = useMemo(() => {
    const riskWeight = (riskLevel: StudentRiskLevel): number => {
      if (riskLevel === StudentRiskLevel.DANGER) return 0;
      if (riskLevel === StudentRiskLevel.WARNING) return 1;
      return 2;
    };

    return [...students].sort((left, right) => {
      const riskDiff = riskWeight(left.riskLevel) - riskWeight(right.riskLevel);
      if (riskDiff !== 0) return riskDiff;
      return (left.lastActive || 0) - (right.lastActive || 0);
    });
  }, [students]);

  const filteredStudents = useMemo(() => sortedStudents.filter((student) => {
    if (filter === 'DANGER' && student.riskLevel !== StudentRiskLevel.DANGER) return false;
    if (filter === 'WARNING' && student.riskLevel === StudentRiskLevel.SAFE) return false;
    if (query.trim()) {
      const keyword = query.trim().toLowerCase();
      return student.name.toLowerCase().includes(keyword) || student.email.toLowerCase().includes(keyword);
    }
    return true;
  }), [filter, query, sortedStudents]);

  useEffect(() => {
    if (filteredStudents.length === 0) {
      setFocusedStudentUid(null);
      return;
    }
    if (!focusedStudentUid || !filteredStudents.some((student) => student.uid === focusedStudentUid)) {
      setFocusedStudentUid(filteredStudents[0].uid);
    }
  }, [filteredStudents, focusedStudentUid]);

  const focusedStudent = filteredStudents.find((student) => student.uid === focusedStudentUid) || filteredStudents[0] || null;
  const atRiskCount = students.filter((student) => student.riskLevel === StudentRiskLevel.DANGER).length;
  const notificationTodayCount = students.filter((student) => student.lastNotificationAt && Date.now() - student.lastNotificationAt < 86400000).length;
  const revisionRequestedCount = writingAssignments.filter((assignment) => assignment.status === 'REVISION_REQUESTED').length;
  const reviewReadyCount = writingQueue.length;
  const unassignedVisibleCount = students.filter((student) => !student.assignedInstructorUid).length;
  const topPriorityStudents = sortedStudents.slice(0, 5);
  const latestWritingQueue = writingQueue.slice(0, 3);

  const openComposer = (student: StudentSummary) => {
    setSelectedStudent(student);
    setMessageDraft(buildFallbackMessage(student, user.displayName));
    setCustomInstruction('');
    setUsedAi(false);
  };

  const closeComposer = () => {
    setSelectedStudent(null);
    setMessageDraft('');
    setCustomInstruction('');
    setUsedAi(false);
  };

  const handleGenerateDraft = async () => {
    if (!selectedStudent) return;
    setDrafting(true);
    try {
      const daysSinceActive = selectedStudent.lastActive > 0
        ? Math.max(0, Math.floor((Date.now() - selectedStudent.lastActive) / (1000 * 60 * 60 * 24)))
        : 0;
      const draft = await generateInstructorFollowUp({
        instructorName: user.displayName,
        studentName: selectedStudent.name,
        riskLevel: selectedStudent.riskLevel,
        daysSinceActive,
        totalLearned: selectedStudent.totalLearned,
        currentLevel: undefined,
        customInstruction,
      });
      if (draft?.message) {
        setMessageDraft(draft.message);
        setUsedAi(true);
      } else {
        setMessageDraft(buildFallbackMessage(selectedStudent, user.displayName));
        setUsedAi(false);
      }
    } catch (draftError) {
      console.error(draftError);
      setNotice((draftError as Error).message || 'AI下書きの生成に失敗しました。');
    } finally {
      setDrafting(false);
    }
  };

  const handleSendNotification = async () => {
    if (!selectedStudent || !messageDraft.trim()) return;
    setSending(true);
    try {
      await storage.sendInstructorNotification(
        selectedStudent.uid,
        messageDraft.trim(),
        getTriggerReason(selectedStudent),
        usedAi,
      );
      setNotice(`${selectedStudent.name}さんへ講師名入りのフォロー通知を保存しました。`);
      closeComposer();
      await fetchData();
    } catch (sendError) {
      console.error(sendError);
      setNotice((sendError as Error).message || 'フォロー通知の保存に失敗しました。');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500">生徒データを分析中...</div>;
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const viewCopy = VIEW_COPY[activeView];

  return (
    <div data-testid="instructor-dashboard" className="space-y-8 animate-in fade-in pb-12">
      {selectedStudent && (
        <div data-testid="notification-composer" className="fixed inset-0 z-50 flex items-center justify-center bg-medace-900/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Follow-up Message</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{selectedStudent.name}さんへの通知</h3>
                <p className="mt-2 text-sm text-slate-500">
                  生徒には <span className="font-bold text-slate-700">{user.displayName}</span> 名義で自然な日本語の通知が表示されます。
                </p>
              </div>
              <button type="button" onClick={closeComposer} className="text-sm font-bold text-slate-400 hover:text-slate-600">
                閉じる
              </button>
            </div>

            <div className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className={`rounded-full border px-2.5 py-1 ${getRiskStyle(selectedStudent.riskLevel)}`}>
                  {getRiskLabel(selectedStudent.riskLevel)}
                </span>
                {selectedStudent.subscriptionPlan && (
                  <span className={`rounded-full border px-2.5 py-1 ${getPlanStyle(selectedStudent.subscriptionPlan)}`}>
                    {SUBSCRIPTION_PLAN_LABELS[selectedStudent.subscriptionPlan]}
                  </span>
                )}
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                  {formatDaysSinceActive(selectedStudent.lastActive)}
                </span>
              </div>
              {selectedStudent.riskReasons && selectedStudent.riskReasons.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedStudent.riskReasons.map((reason) => (
                    <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {reason}
                    </span>
                  ))}
                </div>
              )}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-slate-500">AIへの補足</label>
                <input
                  type="text"
                  value={customInstruction}
                  onChange={(event) => setCustomInstruction(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                  placeholder="例: 次の模試までに復習を再開してほしい"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={drafting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-medace-200 bg-white px-4 py-3 text-sm font-bold text-medace-700 transition-colors hover:bg-medace-50 disabled:opacity-60"
              >
                {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                AIで下書きを作る
              </button>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold uppercase text-slate-500">通知文</label>
              <textarea
                data-testid="notification-message-draft"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                rows={8}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeComposer}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                data-testid="notification-send-submit"
                onClick={handleSendNotification}
                disabled={sending || !messageDraft.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                通知を保存する
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}

      <section className="relative overflow-hidden rounded-[32px] bg-medace-500 p-8 text-white shadow-[0_24px_60px_rgba(255,130,22,0.22)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.26),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_22%)]"></div>
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
                グループ講師
              </span>
              {user.organizationName && (
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
                  {user.organizationName}
                </span>
              )}
            </div>
            <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
              {user.displayName}
            </div>
          </div>

          <div className="mt-6 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{viewCopy.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">{viewCopy.title}</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/78">{viewCopy.body}</p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onChangeView(InstructorWorkspaceView.STUDENTS)}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-medace-900 transition-colors hover:bg-medace-50"
            >
              <Bell className="h-4 w-4" />
              優先生徒を見る
            </button>
            <button
              type="button"
              onClick={() => onChangeView(InstructorWorkspaceView.WRITING)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <ScanText className="h-4 w-4" />
              作文を進める
            </button>
            <button
              type="button"
              onClick={() => onChangeView(InstructorWorkspaceView.WORKSHEETS)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <FileStack className="h-4 w-4" />
              問題を印刷する
            </button>
          </div>
        </div>
      </section>

      {activeView === InstructorWorkspaceView.OVERVIEW && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="要フォロー人数" value={`${atRiskCount}名`} detail="最優先で声かけしたい生徒" tone={atRiskCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="今日送る通知" value={`${notificationTodayCount}件`} detail="過去24時間の講師フォロー通知" tone="accent" />
            <WorkspaceMetricCard label="再提出待ち作文" value={`${revisionRequestedCount}件`} detail="生徒の再提出待ちになっている課題" tone={revisionRequestedCount > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="未割当生徒" value={`${unassignedVisibleCount}名`} detail="担当講師がまだ付いていない生徒" tone={unassignedVisibleCount > 0 ? 'warning' : 'default'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Priority Students</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">今すぐ見ておきたい生徒</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeView(InstructorWorkspaceView.STUDENTS)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:border-medace-200 hover:text-medace-700"
                >
                  生徒一覧へ <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {topPriorityStudents.map((student) => (
                  <div key={student.uid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{student.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{student.email}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(student.riskLevel)}`}>
                        {getRiskLabel(student.riskLevel)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[0.82fr_1.18fr_auto] sm:items-center">
                      <div className="text-sm text-slate-500">
                        最終学習: <span className="font-bold text-slate-900">{formatDaysSinceActive(student.lastActive)}</span>
                      </div>
                      <div className="text-sm text-slate-600">{getNextActionText(student)}</div>
                      <button
                        type="button"
                        data-testid={`send-notification-${student.uid}`}
                        onClick={() => openComposer(student)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
                      >
                        <Bell className="h-4 w-4" />
                        通知を作る
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <ScanText className="h-5 w-5 text-medace-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Writing Snapshot</p>
                    <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">自由英作文の滞留</h3>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-medace-100 bg-medace-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-700">添削キュー</div>
                    <div className="mt-2 text-2xl font-black text-slate-950">{reviewReadyCount}</div>
                    <div className="mt-1 text-sm text-slate-600">講師確認待ちの提出</div>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">再提出待ち</div>
                    <div className="mt-2 text-2xl font-black text-slate-950">{revisionRequestedCount}</div>
                    <div className="mt-1 text-sm text-slate-600">返却後の再提出待ち</div>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {latestWritingQueue.length > 0 ? latestWritingQueue.map((item) => (
                    <div key={item.submissionId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-slate-950">{item.studentName}</div>
                        <div className="text-xs font-bold text-slate-400">Attempt {item.attemptNo}</div>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{item.promptTitle}</div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      現在の添削キューはありません。
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onChangeView(InstructorWorkspaceView.WRITING)}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                >
                  作文ワークスペースへ <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <Clock3 className="h-5 w-5 text-medace-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Next Actions</p>
                    <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">このあと進める作業</h3>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  {[
                    { title: '生徒フォロー', body: '一覧から優先生徒を選び、理由を見ながら通知文を作る', view: InstructorWorkspaceView.STUDENTS },
                    { title: '自由英作文', body: '紙提出の添削キューを確認し、返却まで進める', view: InstructorWorkspaceView.WRITING },
                    { title: '紙問題配布', body: '今日配布する PDF 問題だけを作る', view: InstructorWorkspaceView.WORKSHEETS },
                  ].map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => onChangeView(item.view)}
                      className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-left transition-colors hover:border-medace-200 hover:bg-medace-50/60"
                    >
                      <div className="text-sm font-bold text-slate-950">{item.title}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeView === InstructorWorkspaceView.STUDENTS && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="対象生徒" value={`${filteredStudents.length}名`} detail="現在のフィルタ条件に一致" />
            <WorkspaceMetricCard label="要フォロー" value={`${atRiskCount}名`} detail="最優先の声かけ対象" tone={atRiskCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="プラン未設定" value={`${students.filter((student) => !student.hasLearningPlan).length}名`} detail="学習プランの確認が必要" tone="warning" />
            <WorkspaceMetricCard label="未割当" value={`${unassignedVisibleCount}名`} detail="担当講師が決まっていない生徒" tone={unassignedVisibleCount > 0 ? 'warning' : 'default'} />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Students Split View</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">一覧で選び、右側で次アクションを決める</h3>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                {[
                  { key: 'ALL', label: '全体' },
                  { key: 'DANGER', label: '要フォロー' },
                  { key: 'WARNING', label: '見守り以上' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key as 'ALL' | 'DANGER' | 'WARNING')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === option.key ? 'bg-medace-700 text-white' : 'text-slate-500'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="生徒名・メールで検索"
                  className="w-64 text-sm text-slate-700 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[0.72fr_1.2fr_0.88fr_1.2fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <div>優先度</div>
                <div>生徒</div>
                <div>最終接触</div>
                <div>次アクション</div>
              </div>
              <div data-testid="instructor-students-list">
                {filteredStudents.length === 0 ? (
                  <div className="px-6 py-16 text-center text-sm text-slate-500">該当する生徒はいません。</div>
                ) : (
                  filteredStudents.map((student) => (
                    <button
                      key={student.uid}
                      type="button"
                      onClick={() => setFocusedStudentUid(student.uid)}
                      className={`grid w-full grid-cols-[0.72fr_1.2fr_0.88fr_1.2fr] gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-b-0 ${
                        focusedStudent?.uid === student.uid ? 'bg-medace-50/70' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(student.riskLevel)}`}>
                          {getRiskLabel(student.riskLevel)}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-950">{student.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{student.email}</div>
                      </div>
                      <div className="text-sm text-slate-600">
                        <div className="font-bold text-slate-900">{formatDaysSinceActive(student.lastActive)}</div>
                        {student.lastNotificationAt && <div className="mt-1 text-xs text-slate-400">通知: {formatDateTime(student.lastNotificationAt)}</div>}
                      </div>
                      <div className="text-sm leading-relaxed text-slate-600">{getNextActionText(student)}</div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              {focusedStudent ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Student Detail</p>
                      <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{focusedStudent.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{focusedStudent.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(focusedStudent.riskLevel)}`}>
                        {getRiskLabel(focusedStudent.riskLevel)}
                      </span>
                      {focusedStudent.subscriptionPlan && (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getPlanStyle(focusedStudent.subscriptionPlan)}`}>
                          {SUBSCRIPTION_PLAN_LABELS[focusedStudent.subscriptionPlan]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終学習</div>
                      <div className="mt-2 text-xl font-black text-slate-950">{formatDaysSinceActive(focusedStudent.lastActive)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習プラン</div>
                      <div className="mt-2 text-xl font-black text-slate-950">{focusedStudent.hasLearningPlan ? '設定済み' : '未設定'}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当講師</div>
                      <div className="mt-2 text-sm font-black text-slate-950">{focusedStudent.assignedInstructorName || '未割当'}</div>
                    </div>
                  </div>

                  {focusedStudent.riskReasons && focusedStudent.riskReasons.length > 0 && (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">介入理由</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {focusedStudent.riskReasons.map((reason) => (
                          <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-3xl border border-medace-100 bg-medace-50/70 px-5 py-5">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-700">次にやること</div>
                    <div className="mt-3 text-sm leading-relaxed text-medace-900">{getNextActionText(focusedStudent)}</div>
                  </div>

                  {focusedStudent.lastNotificationMessage ? (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最新フォロー</div>
                        <div className="text-xs text-slate-400">{focusedStudent.lastNotificationAt ? formatDateTime(focusedStudent.lastNotificationAt) : ''}</div>
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-slate-700">{focusedStudent.lastNotificationMessage}</div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
                      まだ通知履歴はありません。必要ならここから初回フォローを作成します。
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      data-testid={`send-notification-${focusedStudent.uid}`}
                      onClick={() => openComposer(focusedStudent)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
                    >
                      <Bell className="h-4 w-4" />
                      通知文を作る
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeView(InstructorWorkspaceView.WRITING)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                    >
                      <ScanText className="h-4 w-4" />
                      作文ワークスペースへ
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                  左側の一覧から生徒を選んでください。
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {activeView === InstructorWorkspaceView.WRITING && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="添削キュー" value={`${reviewReadyCount}件`} detail="講師確認待ちの提出" tone={reviewReadyCount > 0 ? 'warning' : 'success'} />
            <WorkspaceMetricCard label="再提出待ち" value={`${revisionRequestedCount}件`} detail="返却後の再提出待ち課題" tone={revisionRequestedCount > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="配布済み課題" value={`${writingAssignments.filter((assignment) => assignment.status === 'ISSUED').length}件`} detail="まだ提出されていない課題" />
            <WorkspaceMetricCard label="完了済み" value={`${writingAssignments.filter((assignment) => assignment.status === 'COMPLETED').length}件`} detail="返却と完了まで終えた課題" />
          </div>
          <WritingOpsPanel user={user} />
        </div>
      )}

      {activeView === InstructorWorkspaceView.WORKSHEETS && (
        <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Worksheet Workflow</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">単語配布だけを素早く進める</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              今日の授業や面談で配る紙問題はここだけで作成します。生徒フォロー一覧や教材一覧から切り離して、印刷作業に集中できます。
            </p>
            <div className="mt-5 grid gap-3">
              {[
                '対象生徒を選ぶ',
                '問題数と出題条件を確認する',
                'そのまま印刷または PDF 保存する',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <Suspense
              fallback={
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 text-slate-500">
                  <Loader2 className="h-7 w-7 animate-spin text-medace-500" />
                  <div className="mt-3 text-sm font-medium">プリント機能を読み込み中...</div>
                </div>
              }
            >
              <WorksheetPrintLauncher user={user} />
            </Suspense>
          </section>
        </div>
      )}

      {activeView === InstructorWorkspaceView.CATALOG && (
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Catalog Access</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">教材確認は必要なときだけ開く</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
                講師ワークスペースでは生徒フォローを主役にし、教材確認は独立ビューに分離しています。学習画面やテスト導線の確認が必要なときだけ使ってください。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChangeView(InstructorWorkspaceView.STUDENTS)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
            >
              生徒一覧へ戻る <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6">
            <Suspense
              fallback={
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 text-slate-500">
                  <Loader2 className="h-7 w-7 animate-spin text-medace-500" />
                  <div className="mt-3 text-sm font-medium">単語帳一覧を読み込み中...</div>
                </div>
              }
            >
              <OfficialCatalogAccessPanel
                user={user}
                onSelectBook={onSelectBook}
                eyebrow="Business Demo Catalog"
                title="ビジネス版の既存単語帳をそのまま確認する"
                description="先生体験アカウントでも、既存の公式単語帳をそのまま開けます。学習画面に入ることも、テストで英日・日英・先頭2文字ヒントを切り替えることもできます。"
              />
            </Suspense>
          </div>
        </section>
      )}
    </div>
  );
};

export default InstructorDashboard;
