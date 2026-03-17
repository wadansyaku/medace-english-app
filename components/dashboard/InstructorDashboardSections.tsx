import React, { Suspense, lazy } from 'react';
import {
  ArrowRight,
  Bell,
  Clock3,
  FileStack,
  Loader2,
  ScanText,
  Search,
} from 'lucide-react';

import {
  INTERVENTION_KIND_LABELS,
  INTERVENTION_OUTCOME_LABELS,
  InstructorWorkspaceView,
  LEARNING_TRACK_LABELS,
  RETENTION_CONTINUITY_BAND_LABELS,
  StudentRiskLevel,
  SUBSCRIPTION_PLAN_LABELS,
  WEAKNESS_DIMENSION_LABELS,
  WEEKLY_MISSION_STATUS_LABELS,
  type StudentSummary,
  type UserProfile,
  type WritingAssignment,
  type WritingQueueItem,
} from '../../types';
import type { useInstructorDashboardController } from '../../hooks/useInstructorDashboardController';
import { getInstructorQueueSegment } from '../../shared/retention';
import { getBusinessAdminWritingCounts } from '../../utils/businessAdminDashboard';
import WorkspaceMetricCard from '../workspace/WorkspaceMetricCard';

const OfficialCatalogAccessPanel = lazy(() => import('../OfficialCatalogAccessPanel'));
const WorksheetPrintLauncher = lazy(() => import('../WorksheetPrintLauncher'));
const WritingOpsPanel = lazy(() => import('../WritingOpsPanel'));

type InstructorDashboardController = ReturnType<typeof useInstructorDashboardController>;

interface InstructorDashboardSectionsProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: InstructorWorkspaceView;
  onChangeView: (view: InstructorWorkspaceView) => void;
  controller: InstructorDashboardController;
  students: StudentSummary[];
  writingAssignments: WritingAssignment[];
  writingQueue: WritingQueueItem[];
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

const getQueueLabel = (student: StudentSummary): string => {
  const segment = getInstructorQueueSegment(student);
  if (segment === 'IMMEDIATE') return '要即対応';
  if (segment === 'WAITING') return '再開待ち';
  return '再開済み';
};

const getQueueStyle = (student: StudentSummary): string => {
  const segment = getInstructorQueueSegment(student);
  if (segment === 'IMMEDIATE') return 'bg-red-50 text-red-700 border-red-200';
  if (segment === 'WAITING') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const getOutcomeStyle = (student: StudentSummary): string => {
  if (student.latestInterventionOutcome === 'EXPIRED') return 'bg-red-50 text-red-700 border-red-200';
  if (student.latestInterventionOutcome === 'PENDING') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (student.latestInterventionOutcome === 'REACTIVATED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
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

const formatStudyDays7d = (days?: number): string => `${days || 0}日`;

const getWeaknessTone = (score = 0): string => (
  score >= 55
    ? 'border-red-200 bg-red-50 text-red-700'
    : score >= 30
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
);

const getCohortStyle = (cohortName?: string): string => (
  cohortName
    ? 'bg-sky-50 text-sky-700 border-sky-200'
    : 'bg-white text-slate-500 border-dashed border-slate-200'
);

const getCohortLabel = (cohortName?: string): string => cohortName || '未設定';

const getNextActionText = (student: StudentSummary): string => {
  if (student.recommendedAction) return student.recommendedAction;
  if (student.riskLevel === StudentRiskLevel.DANGER) return '今日のうちに声かけする';
  if (student.riskLevel === StudentRiskLevel.WARNING) return '次の学習開始を後押しする';
  return '現在のペースを維持する';
};

const InstructorDashboardSections: React.FC<InstructorDashboardSectionsProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
  controller,
  students,
  writingAssignments,
  writingQueue,
}) => {
  const immediateCount = controller.sortedStudents.filter((student) => getInstructorQueueSegment(student) === 'IMMEDIATE').length;
  const waitingCount = controller.sortedStudents.filter((student) => getInstructorQueueSegment(student) === 'WAITING').length;
  const reactivatedCount = controller.sortedStudents.filter((student) => getInstructorQueueSegment(student) === 'REACTIVATED').length;
  const unassignedAtRiskCount = students.filter((student) => !student.assignedInstructorUid && student.riskLevel !== StudentRiskLevel.SAFE).length;
  const writingCounts = getBusinessAdminWritingCounts(writingAssignments, writingQueue);
  const topPriorityStudents = controller.sortedStudents
    .filter((student) => getInstructorQueueSegment(student) === 'IMMEDIATE')
    .slice(0, 5);
  const latestWritingQueue = writingQueue.slice(0, 3);

  return (
    <>
      {activeView === InstructorWorkspaceView.OVERVIEW && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="要即対応" value={`${immediateCount}名`} detail="48時間以内に介入したい生徒" tone={immediateCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="再開待ち" value={`${waitingCount}名`} detail="前回フォロー後の反応を確認中" tone={waitingCount > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="再開済み" value={`${reactivatedCount}名`} detail="前回フォロー後に学習再開済み" tone="success" />
            <WorkspaceMetricCard label="未割当 at-risk" value={`${unassignedAtRiskCount}名`} detail="担当講師の再確認が必要" tone={unassignedAtRiskCount > 0 ? 'warning' : 'default'} />
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
                {(topPriorityStudents.length > 0 ? topPriorityStudents : controller.sortedStudents.slice(0, 5)).map((student) => (
                  <div key={student.uid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{student.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{student.email}</div>
                        <div className="mt-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getCohortStyle(student.cohortName)}`}>
                            クラス: {getCohortLabel(student.cohortName)}
                          </span>
                        </div>
                        {student.topWeaknesses && student.topWeaknesses.length > 0 && (
                          <div className="mt-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${getWeaknessTone(student.topWeaknesses[0].score)}`}>
                              {WEAKNESS_DIMENSION_LABELS[student.topWeaknesses[0].dimension]}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getQueueStyle(student)}`}>
                        {getQueueLabel(student)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[0.82fr_1.18fr_auto] sm:items-center">
                      <div className="text-sm text-slate-500">
                        最終学習: <span className="font-bold text-slate-900">{formatDaysSinceActive(student.lastActive)}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {student.primaryMissionStatus && (
                          <div className="mb-1 text-xs font-bold text-slate-500">
                            {student.primaryMissionTrack ? LEARNING_TRACK_LABELS[student.primaryMissionTrack] : '今週ミッション'} / {WEEKLY_MISSION_STATUS_LABELS[student.primaryMissionStatus]}
                          </div>
                        )}
                        {getNextActionText(student)}
                      </div>
                      <button
                        type="button"
                        data-testid={`send-notification-${student.uid}`}
                        onClick={() => controller.openComposer(student)}
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
                    <div className="mt-2 text-2xl font-black text-slate-950">{writingCounts.reviewReadyCount}</div>
                    <div className="mt-1 text-sm text-slate-600">講師確認待ちの提出</div>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">再提出待ち</div>
                    <div className="mt-2 text-2xl font-black text-slate-950">{writingCounts.revisionRequestedCount}</div>
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
            <WorkspaceMetricCard label="要即対応" value={`${immediateCount}名`} detail="今すぐ介入するキュー" tone={immediateCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="再開待ち" value={`${waitingCount}名`} detail="前回フォロー後の確認待ち" tone={waitingCount > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="再開済み" value={`${reactivatedCount}名`} detail="称賛と次の維持導線" tone="success" />
            <WorkspaceMetricCard label="期限超過課題" value={`${students.filter((student) => student.missionOverdue).length}名`} detail="今週ミッションが止まっている生徒" tone={students.some((student) => student.missionOverdue) ? 'danger' : 'default'} />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Students Split View</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">一覧で選び、右側で次アクションを決める</h3>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                {[
                  { key: 'IMMEDIATE', label: '要即対応' },
                  { key: 'WAITING', label: '再開待ち' },
                  { key: 'REACTIVATED', label: '再開済み' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => controller.setFilter(option.key as 'IMMEDIATE' | 'WAITING' | 'REACTIVATED')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${controller.filter === option.key ? 'bg-medace-700 text-white' : 'text-slate-500'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={controller.query}
                  onChange={(event) => controller.setQuery(event.target.value)}
                  placeholder="生徒名・メールで検索"
                  className="w-64 text-sm text-slate-700 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[0.72fr_1.2fr_0.88fr_1.2fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <div>キュー</div>
                <div>生徒</div>
                <div>直近介入</div>
                <div>次アクション</div>
              </div>
              <div data-testid="instructor-students-list">
                {controller.filteredStudents.length === 0 ? (
                  <div className="px-6 py-16 text-center text-sm text-slate-500">該当する生徒はいません。</div>
                ) : (
                  controller.filteredStudents.map((student) => (
                    <button
                      key={student.uid}
                      type="button"
                      data-testid={`instructor-student-row-${student.uid}`}
                      onClick={() => controller.setFocusedStudentUid(student.uid)}
                      className={`grid w-full grid-cols-[0.72fr_1.2fr_0.88fr_1.2fr] gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-b-0 ${
                        controller.focusedStudent?.uid === student.uid ? 'bg-medace-50/70' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex flex-col gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getQueueStyle(student)}`}>
                            {getQueueLabel(student)}
                          </span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(student.riskLevel)}`}>
                            {getRiskLabel(student.riskLevel)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-950">{student.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{student.email}</div>
                        <div className="mt-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getCohortStyle(student.cohortName)}`}>
                            クラス: {getCohortLabel(student.cohortName)}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600">
                        <div className="font-bold text-slate-900">
                          {student.latestInterventionAt ? formatDateTime(student.latestInterventionAt) : '未介入'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {student.latestInterventionOutcome
                            ? INTERVENTION_OUTCOME_LABELS[student.latestInterventionOutcome]
                            : '初回フォロー前'}
                        </div>
                      </div>
                      <div className="text-sm leading-relaxed text-slate-600">{getNextActionText(student)}</div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              {controller.focusedStudent ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Student Detail</p>
                      <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{controller.focusedStudent.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{controller.focusedStudent.email}</p>
                      <div className="mt-3">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getCohortStyle(controller.focusedStudent.cohortName)}`}>
                          クラス/担当グループ: {getCohortLabel(controller.focusedStudent.cohortName)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(controller.focusedStudent.riskLevel)}`}>
                        {getRiskLabel(controller.focusedStudent.riskLevel)}
                      </span>
                      {controller.focusedStudent.subscriptionPlan && (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getPlanStyle(controller.focusedStudent.subscriptionPlan)}`}>
                          {SUBSCRIPTION_PLAN_LABELS[controller.focusedStudent.subscriptionPlan]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終学習</div>
                      <div className="mt-2 text-xl font-black text-slate-950">{formatDaysSinceActive(controller.focusedStudent.lastActive)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">直近7日学習日数</div>
                      <div className="mt-2 text-xl font-black text-slate-950">{formatStudyDays7d(controller.focusedStudent.activeStudyDays7d)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">継続帯</div>
                      <div className="mt-2 text-xl font-black text-slate-950">
                        {controller.focusedStudent.continuityBand
                          ? RETENTION_CONTINUITY_BAND_LABELS[controller.focusedStudent.continuityBand]
                          : '未集計'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終介入結果</div>
                      <div className="mt-2 text-xl font-black text-slate-950">
                        {controller.focusedStudent.latestInterventionOutcome
                          ? INTERVENTION_OUTCOME_LABELS[controller.focusedStudent.latestInterventionOutcome]
                          : '未介入'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習プラン</div>
                      <div className="mt-2 text-xl font-black text-slate-950">{controller.focusedStudent.hasLearningPlan ? '設定済み' : '未設定'}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当講師</div>
                      <div className="mt-2 text-sm font-black text-slate-950">{controller.focusedStudent.assignedInstructorName || '未割当'}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今週ミッション</div>
                      <div className="mt-2 text-xl font-black text-slate-950">
                        {controller.focusedStudent.primaryMissionStatus
                          ? WEEKLY_MISSION_STATUS_LABELS[controller.focusedStudent.primaryMissionStatus]
                          : '未配布'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">トラック</div>
                      <div className="mt-2 text-sm font-black text-slate-950">
                        {controller.focusedStudent.primaryMissionTrack
                          ? LEARNING_TRACK_LABELS[controller.focusedStudent.primaryMissionTrack]
                          : '未設定'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">課題進捗</div>
                      <div className="mt-2 text-xl font-black text-slate-950">
                        {controller.focusedStudent.primaryMissionCompletionRate != null
                          ? `${controller.focusedStudent.primaryMissionCompletionRate}%`
                          : '0%'}
                      </div>
                    </div>
                  </div>

                  {controller.focusedStudent.riskReasons && controller.focusedStudent.riskReasons.length > 0 && (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">介入理由</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {controller.focusedStudent.riskReasons.map((reason) => (
                          <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {controller.focusedStudent.topWeaknesses && controller.focusedStudent.topWeaknesses.length > 0 && (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">弱点の根拠</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {controller.focusedStudent.topWeaknesses.slice(0, 3).map((weakness) => (
                          <div key={weakness.dimension} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-slate-900">{WEAKNESS_DIMENSION_LABELS[weakness.dimension]}</div>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getWeaknessTone(weakness.score)}`}>
                                score {weakness.score}
                              </span>
                            </div>
                            <div className="mt-2 text-sm leading-relaxed text-slate-600">{weakness.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-3xl border border-medace-100 bg-medace-50/70 px-5 py-5">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-700">次にやること</div>
                    <div className="mt-3 text-sm leading-relaxed text-medace-900">{getNextActionText(controller.focusedStudent)}</div>
                  </div>

                  {controller.focusedStudent.lastNotificationMessage ? (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最新フォロー</div>
                        <div className="text-xs text-slate-400">{controller.focusedStudent.lastNotificationAt ? formatDateTime(controller.focusedStudent.lastNotificationAt) : ''}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {controller.focusedStudent.latestInterventionKind && (
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                            {INTERVENTION_KIND_LABELS[controller.focusedStudent.latestInterventionKind]}
                          </span>
                        )}
                        {controller.focusedStudent.latestInterventionOutcome && (
                          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getOutcomeStyle(controller.focusedStudent)}`}>
                            {INTERVENTION_OUTCOME_LABELS[controller.focusedStudent.latestInterventionOutcome]}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-slate-700">{controller.focusedStudent.lastNotificationMessage}</div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
                      まだ通知履歴はありません。必要ならここから初回フォローを作成します。
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      data-testid={`send-notification-${controller.focusedStudent.uid}`}
                      onClick={() => controller.openComposer(controller.focusedStudent)}
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
            <WorkspaceMetricCard label="添削キュー" value={`${writingCounts.reviewReadyCount}件`} detail="講師確認待ちの提出" tone={writingCounts.reviewReadyCount > 0 ? 'warning' : 'success'} />
            <WorkspaceMetricCard label="再提出待ち" value={`${writingCounts.revisionRequestedCount}件`} detail="返却後の再提出待ち課題" tone={writingCounts.revisionRequestedCount > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="配布済み課題" value={`${writingCounts.issuedCount}件`} detail="まだ提出されていない課題" />
            <WorkspaceMetricCard label="完了済み" value={`${writingCounts.completedCount}件`} detail="返却と完了まで終えた課題" />
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
    </>
  );
};

export default InstructorDashboardSections;
