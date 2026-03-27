import React, { Suspense, lazy } from 'react';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Building2,
  CheckCircle2,
  Loader2,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { getSubscriptionPolicy } from '../../config/subscription';
import type { useBusinessAdminDashboardController } from '../../hooks/useBusinessAdminDashboardController';
import {
  BusinessAdminWorkspaceView,
  INTERVENTION_OUTCOME_LABELS,
  LEARNING_TRACK_LABELS,
  OrganizationRole,
  RETENTION_CONTINUITY_BAND_LABELS,
  StudentRiskLevel,
  SUBSCRIPTION_PLAN_LABELS,
  WEAKNESS_DIMENSION_LABELS,
  WEEKLY_MISSION_STATUS_LABELS,
  type BookMetadata,
  type OrganizationDashboardSnapshot,
  type OrganizationSettingsSnapshot,
  type UserProfile,
  type WritingAssignment,
  type WritingQueueItem,
} from '../../types';
import {
  getBusinessAdminWritingCounts,
  sortInstructorBacklogByLoad,
} from '../../utils/businessAdminDashboard';
import WorkspaceMetricCard from '../workspace/WorkspaceMetricCard';

const OfficialCatalogAccessPanel = lazy(() => import('../OfficialCatalogAccessPanel'));
const WorksheetPrintLauncher = lazy(() => import('../WorksheetPrintLauncher'));
const WritingOpsPanel = lazy(() => import('../WritingOpsPanel'));

type BusinessAdminDashboardController = ReturnType<typeof useBusinessAdminDashboardController>;

interface BusinessAdminDashboardSectionsProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: BusinessAdminWorkspaceView;
  onChangeView: (view: BusinessAdminWorkspaceView) => void;
  controller: BusinessAdminDashboardController;
  snapshot: OrganizationDashboardSnapshot;
  settingsSnapshot: OrganizationSettingsSnapshot | null;
  books: BookMetadata[];
  writingAssignments: WritingAssignment[];
  writingQueue: WritingQueueItem[];
  isLocalMockData: boolean;
}

const riskTone = (riskLevel: StudentRiskLevel): string => {
  if (riskLevel === StudentRiskLevel.DANGER) return 'border-red-200 bg-red-50 text-red-700';
  if (riskLevel === StudentRiskLevel.WARNING) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

const riskLabel = (riskLevel: StudentRiskLevel): string => {
  if (riskLevel === StudentRiskLevel.DANGER) return '要フォロー';
  if (riskLevel === StudentRiskLevel.WARNING) return '見守り';
  return '安定';
};

const formatDays = (timestamp: number): string => {
  if (!timestamp) return '未学習';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (days === 0) return '今日';
  return `${days}日前`;
};

const formatDateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatTrendDate = (dateKey: string): string =>
  new Date(`${dateKey}T00:00:00+09:00`).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  });

const weaknessTone = (score = 0): string => (
  score >= 55
    ? 'border-red-200 bg-red-50 text-red-700'
    : score >= 30
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
);

const cohortTone = (cohortName?: string): string => (
  cohortName
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : 'border-dashed border-slate-200 bg-white text-slate-500'
);

const cohortLabel = (cohortName?: string): string => cohortName || '未設定';

const BusinessAdminDashboardSections: React.FC<BusinessAdminDashboardSectionsProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
  controller,
  snapshot,
  settingsSnapshot,
  books,
  writingAssignments,
  writingQueue,
  isLocalMockData,
}) => {
  const policy = getSubscriptionPolicy(snapshot.subscriptionPlan);
  const instructorLoad = sortInstructorBacklogByLoad(snapshot.instructorBacklog);
  const writingCounts = getBusinessAdminWritingCounts(writingAssignments, writingQueue);
  const recentEvents = snapshot.assignmentEvents.slice(0, 6);
  const latestTrendPoint = snapshot.trend[snapshot.trend.length - 1];
  const reactivatedStudentsLabel = isLocalMockData ? '通知後再開 (参考)' : '通知後再開';
  const reactivatedStudentsDetail = isLocalMockData
    ? 'ローカル擬似データ上の参考値'
    : '72時間以内に学習再開';
  const onboardingChecklist = [
    {
      label: '組織名を確認',
      done: Boolean(settingsSnapshot?.displayName.trim()),
      detail: settingsSnapshot?.displayName || '組織名を設定すると案内メールと管理画面表示が揃います。',
    },
    {
      label: 'cohort を作成',
      done: (settingsSnapshot?.cohorts.length || 0) > 0,
      detail: (settingsSnapshot?.cohorts.length || 0) > 0
        ? `${settingsSnapshot?.cohorts.length || 0}件の cohort を作成済み`
        : '学年・クラス・講座単位で 1 つ以上作ると割当が整理しやすくなります。',
    },
    {
      label: '講師を割り当て',
      done: snapshot.assignmentCoverageRate > 0,
      detail: snapshot.assignmentCoverageRate > 0
        ? `担当割当率 ${snapshot.assignmentCoverageRate}%`
        : '最初は at-risk 生徒からでもよいので担当を決めてください。',
    },
    {
      label: '教材を配布',
      done: books.length > 0,
      detail: books.length > 0
        ? `${books.length}冊の教材を利用可能`
        : '公式教材または My単語帳を最低 1 冊用意してください。',
    },
    {
      label: '初回ミッションを設定',
      done: snapshot.learningPlanCount > 0 || snapshot.missionStartedRate > 0,
      detail: snapshot.learningPlanCount > 0 || snapshot.missionStartedRate > 0
        ? '学習計画またはミッション配布が始まっています。'
        : '最初の1週間分だけでもよいので、開始ミッションを固定してください。',
    },
  ];

  return (
    <>
      {activeView === BusinessAdminWorkspaceView.OVERVIEW && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="週4日継続率" value={`${snapshot.weeklyContinuityRate}%`} detail="直近7日で4日以上学習した生徒" tone="accent" />
            <WorkspaceMetricCard label="48時間介入率" value={`${snapshot.followUpCoverageRate48h}%`} detail="at-risk 生徒への48時間以内フォロー" tone={snapshot.followUpCoverageRate48h >= 80 ? 'success' : 'warning'} />
            <WorkspaceMetricCard label="未処理 backlog" value={`${snapshot.interventionBacklogCount}名`} detail="いま介入順を決めるべき生徒" tone={snapshot.interventionBacklogCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="未割当 at-risk" value={`${snapshot.unassignedAtRiskCount}名`} detail="担当再設定が必要な生徒" tone={snapshot.unassignedAtRiskCount > 0 ? 'warning' : 'default'} />
          </div>

          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-medace-600" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">導入スタートチェック</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">最初に確認する 5 項目</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {onboardingChecklist.map((item) => (
                <div key={item.label} className={`rounded-3xl border px-4 py-4 ${item.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <CheckCircle2 className={`h-4 w-4 ${item.done ? 'text-emerald-600' : 'text-slate-300'}`} />
                    {item.label}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <WorkspaceMetricCard label="期限超過ミッション" value={`${snapshot.overdueMissionCount}件`} detail="未介入で止まっている週次課題" tone={snapshot.overdueMissionCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="配布後着手率" value={`${snapshot.missionStartedRate}%`} detail="配布済みミッションの着手率" tone="accent" />
            <WorkspaceMetricCard label="期限超過からの再開率" value={`${snapshot.overdueMissionRecoveryRate}%`} detail="締切後に再び動き出した割合" tone={snapshot.overdueMissionRecoveryRate >= 50 ? 'success' : 'warning'} />
            <WorkspaceMetricCard label="作文返却率" value={`${Math.max(0, ...snapshot.writingReturnRateByTrack.map((track) => track.returnRate))}%`} detail="ミッション紐づき作文の返却率" tone="success" />
            <WorkspaceMetricCard label="主力トラック完了率" value={`${Math.max(0, ...snapshot.trackCompletion.map((track) => track.completionRate))}%`} detail="トラック別で最も進んでいる完了率" tone="default" />
          </div>

          {!isLocalMockData && (
            <section data-testid="organization-kpi-trend-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">KPI Trend</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">直近14日間の推移</h3>
                </div>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-3">
                {[
                  {
                    testId: 'organization-kpi-trend-continuity',
                    label: '週4日継続率',
                    value: `${snapshot.weeklyContinuityRate}%`,
                    detail: latestTrendPoint ? `${latestTrendPoint.students4PlusDaysActive}/${latestTrendPoint.totalStudents}名が週4日以上学習` : '直近14日を集計',
                    tone: 'bg-medace-500',
                    borderTone: 'border-medace-100 bg-medace-50/60',
                    textTone: 'text-medace-900',
                    series: snapshot.trend.map((point) => ({ date: point.date, value: point.weeklyContinuityRate })),
                  },
                  {
                    testId: 'organization-kpi-trend-followup',
                    label: '48時間介入率',
                    value: `${snapshot.followUpCoverageRate48h}%`,
                    detail: latestTrendPoint ? `${latestTrendPoint.followedUpAtRiskStudents}/${latestTrendPoint.atRiskStudents}名へ48時間以内に介入` : 'at-risk 生徒ベースで集計',
                    tone: 'bg-sky-500',
                    borderTone: 'border-sky-100 bg-sky-50/60',
                    textTone: 'text-sky-900',
                    series: snapshot.trend.map((point) => ({ date: point.date, value: point.followUpCoverageRate48h })),
                  },
                  {
                    testId: 'organization-kpi-trend-reactivation',
                    label: '通知後再開率',
                    value: `${snapshot.reactivationRate7d}%`,
                    detail: latestTrendPoint ? `${latestTrendPoint.reactivatedStudents}/${latestTrendPoint.notifiedStudents}名が72時間以内に再開` : '通知日ベースで集計',
                    tone: 'bg-emerald-500',
                    borderTone: 'border-emerald-100 bg-emerald-50/70',
                    textTone: 'text-emerald-900',
                    series: snapshot.trend.map((point) => ({ date: point.date, value: point.reactivationRate })),
                  },
                ].map((card) => (
                  <div key={card.testId} data-testid={card.testId} className={`rounded-3xl border px-5 py-5 ${card.borderTone}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{card.label}</div>
                        <div className={`mt-2 text-3xl font-black ${card.textTone}`}>{card.value}</div>
                      </div>
                      <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-bold text-slate-500">14日</div>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">{card.detail}</div>
                    <div className="mt-5 grid h-28 grid-cols-14 items-end gap-1.5">
                      {card.series.map((point, index) => (
                        <div key={`${card.testId}-${point.date}`} className="flex h-full flex-col items-center justify-end gap-2">
                          <div
                            className={`w-full rounded-full ${card.tone}`}
                            style={{ height: `${point.value > 0 ? Math.max(10, Math.round(point.value * 0.9)) : 6}px` }}
                            title={`${formatTrendDate(point.date)} ${point.value}%`}
                          />
                          <span className="text-[10px] font-medium text-slate-400">
                            {index % 4 === 0 || index === card.series.length - 1 ? formatTrendDate(point.date) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">At-risk Students</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">今見ておきたい生徒</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeView(BusinessAdminWorkspaceView.ASSIGNMENTS)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:border-medace-200 hover:text-medace-700"
                >
                  割当ビューへ <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {snapshot.atRiskStudentList.slice(0, 5).map((student) => (
                  <div key={student.uid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{student.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{student.email}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(student.riskLevel)}`}>
                        {riskLabel(student.riskLevel)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {student.needsFollowUpNow && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                          要即対応
                        </span>
                      )}
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {student.assignedInstructorName || '未割当'}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${cohortTone(student.cohortName)}`}>
                        クラス: {cohortLabel(student.cohortName)}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">{student.recommendedAction || '担当講師の確認と次の声かけ内容を調整する'}</div>
                  </div>
                ))}
                {snapshot.atRiskStudentList.length === 0 && (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm text-emerald-800">
                    今すぐ介入が必要な生徒はいません。運用は安定しています。
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Assignment Blockers</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">担当割当の詰まり</h3>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">未割当 at-risk</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{snapshot.unassignedAtRiskCount}</div>
                  <div className="mt-1 text-sm text-slate-600">優先度が高いのに担当が未設定の生徒</div>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">未処理 backlog</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{snapshot.interventionBacklogCount}</div>
                  <div className="mt-1 text-sm text-slate-600">48時間以内に介入順を決めたい生徒</div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onChangeView(BusinessAdminWorkspaceView.ASSIGNMENTS)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
                >
                  割当を更新する
                </button>
                <button
                  type="button"
                  onClick={() => onChangeView(BusinessAdminWorkspaceView.INSTRUCTORS)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                >
                  講師負荷を見る
                </button>
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Instructor Load</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師ごとの負荷</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {instructorLoad.slice(0, 4).map((instructor) => (
                  <div key={instructor.uid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{instructor.displayName}</div>
                        <div className="mt-1 text-xs text-slate-400">{instructor.email}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                        instructor.organizationRole === OrganizationRole.GROUP_ADMIN
                          ? 'border-medace-200 bg-medace-50 text-medace-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}>
                        {instructor.organizationRole === OrganizationRole.GROUP_ADMIN ? '管理者' : '講師'}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl border border-white bg-white px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当生徒</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{instructor.assignedStudentCount}</div>
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">要即対応</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{instructor.immediateCount}</div>
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">再開待ち</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{instructor.waitingCount}</div>
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">再開済み</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{instructor.reactivatedCount}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <BellRing className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Writing Snapshot</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">自由英作文の進行</h3>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-medace-200 bg-medace-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-700">配布済み</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{writingCounts.issuedCount}</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">添削待ち</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{writingCounts.reviewReadyCount}</div>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">再提出待ち</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{writingCounts.revisionRequestedCount}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChangeView(BusinessAdminWorkspaceView.WRITING)}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
              >
                作文ワークスペースへ <ArrowRight className="h-4 w-4" />
              </button>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Track Completion</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">トラック別の週次課題</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {snapshot.trackCompletion.map((track) => (
                  <div key={track.track} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{LEARNING_TRACK_LABELS[track.track]}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          完了 {track.completedCount}/{track.assignedCount} / 期限超過 {track.overdueCount}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-slate-950">{track.completionRate}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeView === BusinessAdminWorkspaceView.ASSIGNMENTS && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="割当対象" value={`${controller.filteredAssignments.length}名`} detail="現在の条件に一致する生徒" />
            <WorkspaceMetricCard label="未割当 at-risk" value={`${snapshot.unassignedAtRiskCount}名`} detail="優先して再割当したい生徒" tone={snapshot.unassignedAtRiskCount > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="要即対応" value={`${snapshot.interventionBacklogCount}名`} detail="48時間以内に介入したい生徒" tone={snapshot.interventionBacklogCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="48時間介入率" value={`${snapshot.followUpCoverageRate48h}%`} detail="at-risk 生徒へのフォロー進行" tone="accent" />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Assignments Split View</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">一覧から選び、右側で担当を更新する</h3>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                {[
                  { key: 'ALL', label: '全生徒' },
                  { key: 'IMMEDIATE', label: '要即対応' },
                  { key: 'UNASSIGNED_AT_RISK', label: '未割当 at-risk' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => controller.setAssignmentFilter(option.key as 'ALL' | 'IMMEDIATE' | 'UNASSIGNED_AT_RISK')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${controller.assignmentFilter === option.key ? 'bg-medace-700 text-white' : 'text-slate-500'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={controller.assignmentQuery}
                  onChange={(event) => controller.setAssignmentQuery(event.target.value)}
                  placeholder="生徒名・メールで検索"
                  className="w-64 text-sm text-slate-700 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[0.72fr_1.14fr_0.88fr_1.1fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <div>リスク</div>
                <div>生徒</div>
                <div>現担当</div>
                <div>次アクション</div>
              </div>
              <div>
                {controller.filteredAssignments.length === 0 ? (
                  <div className="px-6 py-16 text-center text-sm text-slate-500">該当する生徒はいません。</div>
                ) : (
                  controller.filteredAssignments.map((student) => (
                    <button
                      key={student.uid}
                      type="button"
                      data-testid={`assignment-row-${student.uid}`}
                      onClick={() => controller.setSelectedStudentUid(student.uid)}
                      className={`grid w-full grid-cols-[0.72fr_1.14fr_0.88fr_1.1fr] gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-b-0 ${
                        controller.selectedAssignmentStudent?.uid === student.uid ? 'bg-medace-50/70' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex flex-col gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(student.riskLevel)}`}>
                            {riskLabel(student.riskLevel)}
                          </span>
                          {student.needsFollowUpNow && (
                            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                              要即対応
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-950">{student.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{student.email}</div>
                        <div className="mt-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${cohortTone(student.cohortName)}`}>
                            クラス: {cohortLabel(student.cohortName)}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600">
                        <div className="font-bold text-slate-900">{student.assignedInstructorName || '未割当'}</div>
                        {student.assignmentUpdatedAt && <div className="mt-1 text-xs text-slate-400">{formatDateTime(student.assignmentUpdatedAt)}</div>}
                      </div>
                      <div className="text-sm leading-relaxed text-slate-600">{student.recommendedAction || '担当講師と次の介入方針を決める'}</div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                {controller.selectedAssignmentStudent ? (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Assignment Detail</p>
                        <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{controller.selectedAssignmentStudent.name}</h3>
                        <p className="mt-2 text-sm text-slate-500">{controller.selectedAssignmentStudent.email}</p>
                        <div className="mt-3">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${cohortTone(controller.selectedAssignmentStudent.cohortName)}`}>
                            クラス/担当グループ: {cohortLabel(controller.selectedAssignmentStudent.cohortName)}
                          </span>
                        </div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(controller.selectedAssignmentStudent.riskLevel)}`}>
                        {riskLabel(controller.selectedAssignmentStudent.riskLevel)}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終学習</div>
                        <div className="mt-2 text-xl font-black text-slate-950">{formatDays(controller.selectedAssignmentStudent.lastActive)}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">直近7日学習日数</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedAssignmentStudent.activeStudyDays7d || 0}日
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">継続帯</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedAssignmentStudent.continuityBand
                            ? RETENTION_CONTINUITY_BAND_LABELS[controller.selectedAssignmentStudent.continuityBand]
                            : '未集計'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終介入時刻</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedAssignmentStudent.latestInterventionAt
                            ? formatDateTime(controller.selectedAssignmentStudent.latestInterventionAt)
                            : '未介入'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終介入結果</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedAssignmentStudent.latestInterventionOutcome
                            ? INTERVENTION_OUTCOME_LABELS[controller.selectedAssignmentStudent.latestInterventionOutcome]
                            : '未介入'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当更新時刻</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedAssignmentStudent.assignmentUpdatedAt
                            ? formatDateTime(controller.selectedAssignmentStudent.assignmentUpdatedAt)
                            : '未設定'}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習プラン</div>
                        <div className="mt-2 text-xl font-black text-slate-950">{controller.selectedAssignmentStudent.hasLearningPlan ? '設定済み' : '未設定'}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">習得語</div>
                        <div className="mt-2 text-xl font-black text-slate-950">{controller.selectedAssignmentStudent.totalLearned}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今週ミッション</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedStudentMission?.progress.status
                            ? WEEKLY_MISSION_STATUS_LABELS[controller.selectedStudentMission.progress.status]
                            : '未配布'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">トラック</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedStudentMission?.mission.learningTrack
                            ? LEARNING_TRACK_LABELS[controller.selectedStudentMission.mission.learningTrack]
                            : '未設定'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">進捗</div>
                        <div className="mt-2 text-xl font-black text-slate-950">
                          {controller.selectedStudentMission ? `${controller.selectedStudentMission.progress.completionRate}%` : '0%'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当講師を割り当てる</label>
                      <select
                        data-testid={`assignment-select-${controller.selectedAssignmentStudent.uid}`}
                        value={controller.selectedAssignmentStudent.assignedInstructorUid || ''}
                        onChange={(event) => controller.handleAssignmentChange(controller.selectedAssignmentStudent.uid, event.target.value)}
                        disabled={controller.assignmentSavingUid === controller.selectedAssignmentStudent.uid}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100 disabled:opacity-60"
                      >
                        <option value="">未割当</option>
                        {snapshot.instructors.map((instructor) => (
                          <option key={instructor.uid} value={instructor.uid}>
                            {instructor.displayName} {instructor.organizationRole === OrganizationRole.GROUP_ADMIN ? '(管理者)' : ''}
                          </option>
                        ))}
                      </select>
                      {controller.assignmentSavingUid === controller.selectedAssignmentStudent.uid && (
                        <div className="mt-2 text-xs font-medium text-slate-500">担当を更新しています...</div>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">クラス/担当グループを設定する</label>
                      <select
                        data-testid={`student-cohort-select-${controller.selectedAssignmentStudent.uid}`}
                        value={controller.selectedAssignmentStudent.cohortId || ''}
                        onChange={(event) => controller.handleStudentCohortChange(controller.selectedAssignmentStudent.uid, event.target.value)}
                        disabled={controller.studentCohortSavingUid === controller.selectedAssignmentStudent.uid}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100 disabled:opacity-60"
                      >
                        <option value="">未設定</option>
                        {(settingsSnapshot?.cohorts || []).map((cohort) => (
                          <option key={cohort.id} value={cohort.id}>
                            {cohort.name}
                          </option>
                        ))}
                      </select>
                      {controller.studentCohortSavingUid === controller.selectedAssignmentStudent.uid && (
                        <div className="mt-2 text-xs font-medium text-slate-500">クラス/担当グループを更新しています...</div>
                      )}
                    </div>

                    {controller.selectedAssignmentStudent.riskReasons && controller.selectedAssignmentStudent.riskReasons.length > 0 && (
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">介入理由</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {controller.selectedAssignmentStudent.riskReasons.map((reason) => (
                            <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {controller.selectedAssignmentStudent.topWeaknesses && controller.selectedAssignmentStudent.topWeaknesses.length > 0 && (
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">弱点フォーカス</div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {controller.selectedAssignmentStudent.topWeaknesses.slice(0, 2).map((weakness) => (
                            <div key={weakness.dimension} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-bold text-slate-900">{WEAKNESS_DIMENSION_LABELS[weakness.dimension]}</div>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${weaknessTone(weakness.score)}`}>
                                  score {weakness.score}
                                </span>
                              </div>
                              <div className="mt-2 text-sm leading-relaxed text-slate-600">{weakness.reason}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {controller.selectedAssignmentStudent.recommendedAction && (
                      <div className="rounded-3xl border border-medace-100 bg-medace-50/70 px-5 py-5 text-sm leading-relaxed text-medace-900">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-700">推奨アクション</div>
                        <div className="mt-3">{controller.selectedAssignmentStudent.recommendedAction}</div>
                      </div>
                    )}

                    <div data-testid="weekly-mission-form" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Weekly Mission</div>
                          <div className="mt-1 text-lg font-black tracking-tight text-slate-950">今週の主課題を配布する</div>
                          <div className="mt-2 text-sm text-slate-500">生徒に同時表示する主課題は1件だけに絞ります。</div>
                        </div>
                        {controller.selectedStudentMission && (
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                            現在: {controller.selectedStudentMission.mission.title}
                          </span>
                        )}
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">トラック</label>
                          <select
                            data-testid="weekly-mission-track-select"
                            value={controller.missionTrack}
                            onChange={(event) => controller.setMissionTrack(event.target.value as any)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                          >
                            {Object.entries(LEARNING_TRACK_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">教材</label>
                          <select
                            data-testid="weekly-mission-book-select"
                            value={controller.missionBookId}
                            onChange={(event) => controller.setMissionBookId(event.target.value)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                          >
                            <option value="">smart-session に任せる</option>
                            {books.map((book) => (
                              <option key={book.id} value={book.id}>{book.title}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">新規語数</label>
                          <input
                            type="number"
                            value={controller.missionNewWordsTarget}
                            onChange={(event) => controller.setMissionNewWordsTarget(event.target.value)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">復習語数</label>
                          <input
                            type="number"
                            value={controller.missionReviewWordsTarget}
                            onChange={(event) => controller.setMissionReviewWordsTarget(event.target.value)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">確認クイズ</label>
                          <input
                            type="number"
                            value={controller.missionQuizTargetCount}
                            onChange={(event) => controller.setMissionQuizTargetCount(event.target.value)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">締切</label>
                          <input
                            type="date"
                            value={controller.missionDueDate}
                            onChange={(event) => controller.setMissionDueDate(event.target.value)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">任意の英作文課題</label>
                          <select
                            value={controller.missionWritingAssignmentId}
                            onChange={(event) => controller.setMissionWritingAssignmentId(event.target.value)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                          >
                            <option value="">紐づけない</option>
                            {writingAssignments.map((assignment) => (
                              <option key={assignment.id} value={assignment.id}>{assignment.promptTitle}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid="weekly-mission-issue-submit"
                        onClick={controller.handleIssueMission}
                        disabled={controller.missionSavingUid === controller.selectedAssignmentStudent.uid}
                        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:opacity-60"
                      >
                        配布する
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                    左側の一覧から生徒を選んでください。
                  </div>
                )}
              </div>

              <section data-testid="assignment-history-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <BellRing className="h-5 w-5 text-medace-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Assignment History</p>
                    <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">担当変更の履歴</h3>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {recentEvents.length > 0 ? recentEvents.map((event) => (
                    <div key={event.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-950">{event.studentName}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {event.previousInstructorName || '未割当'} → {event.nextInstructorName || '未割当'}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>{formatDateTime(event.createdAt)}</div>
                          <div className="mt-1">変更者: {event.changedByName}</div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
                      まだ担当変更の履歴はありません。
                    </div>
                  )}
                </div>
              </section>
            </section>
          </div>
        </div>
      )}

      {activeView === BusinessAdminWorkspaceView.INSTRUCTORS && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="講師数" value={`${snapshot.totalInstructors}名`} detail="組織内で稼働中の講師" />
            <WorkspaceMetricCard label="未処理 backlog" value={`${snapshot.interventionBacklogCount}名`} detail="講師に割り振るべき要対応件数" tone={snapshot.interventionBacklogCount > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label="48時間介入率" value={`${snapshot.followUpCoverageRate48h}%`} detail="at-risk 生徒への介入進行" tone="accent" />
            <WorkspaceMetricCard label={reactivatedStudentsLabel} value={`${snapshot.reactivatedStudents7d}名`} detail={reactivatedStudentsDetail} tone="success" />
          </div>

          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-medace-600" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Instructor Load</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師ごとの負荷比較</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {instructorLoad.map((instructor) => (
                <div key={instructor.uid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-950">{instructor.displayName}</div>
                      <div className="mt-1 text-xs text-slate-400">{instructor.email}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      instructor.organizationRole === OrganizationRole.GROUP_ADMIN
                        ? 'border-medace-200 bg-medace-50 text-medace-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                      {instructor.organizationRole === OrganizationRole.GROUP_ADMIN ? '管理者' : '講師'}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当生徒</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{instructor.assignedStudentCount}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">要即対応</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{instructor.immediateCount}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">再開待ち</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{instructor.waitingCount}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">再開済み</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{instructor.reactivatedCount}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeView === BusinessAdminWorkspaceView.SETTINGS && settingsSnapshot && (
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-medace-600" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Organization Profile</p>
                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">組織表示名を更新する</h3>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Organization ID</div>
                <div className="mt-2 text-sm font-medium text-slate-700">{settingsSnapshot.organizationId}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                <label htmlFor="organization-settings-name-input" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  Display Name
                </label>
                <input
                  id="organization-settings-name-input"
                  data-testid="organization-settings-name-input"
                  type="text"
                  value={controller.organizationDisplayName}
                  onChange={(event) => controller.setOrganizationDisplayName(event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                />
                <div className="mt-3 text-xs text-slate-500">`organization_id` は固定のまま、表示名だけ更新します。</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-testid="organization-settings-save"
                  onClick={() => void controller.handleOrganizationProfileSave()}
                  disabled={controller.organizationSaving || controller.organizationDisplayName.trim() === ''}
                  className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {controller.organizationSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  表示名を保存する
                </button>
                <div className="text-xs text-slate-500">
                  最終更新: {formatDateTime(settingsSnapshot.updatedAt)}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div data-testid="organization-cohorts-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Cohort Scope</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">クラス/担当グループを管理する</h3>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">新しいクラス/担当グループ</label>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row">
                    <input
                      data-testid="cohort-create-input"
                      type="text"
                      value={controller.newCohortName}
                      onChange={(event) => controller.setNewCohortName(event.target.value)}
                      placeholder="例: 2026春 基礎クラス"
                      className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                    />
                    <button
                      type="button"
                      data-testid="cohort-create-submit"
                      onClick={() => void controller.handleCohortSave()}
                      disabled={controller.cohortSavingKey === 'new' || controller.newCohortName.trim() === ''}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:opacity-60"
                    >
                      {controller.cohortSavingKey === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                      追加する
                    </button>
                  </div>
                </div>

                {settingsSnapshot.cohorts.map((cohort) => (
                  <div key={cohort.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex-1">
                        <label htmlFor={`cohort-name-input-${cohort.id}`} className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                          クラス/担当グループ名
                        </label>
                        <input
                          id={`cohort-name-input-${cohort.id}`}
                          data-testid={`cohort-name-input-${cohort.id}`}
                          type="text"
                          value={controller.cohortDrafts[cohort.id] || ''}
                          onChange={(event) => controller.setCohortDraft(cohort.id, event.target.value)}
                          className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{cohort.studentCount}名</span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">講師 {cohort.instructorCount}名</span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{formatDateTime(cohort.updatedAt)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`cohort-save-${cohort.id}`}
                      onClick={() => void controller.handleCohortSave(cohort.id)}
                      disabled={controller.cohortSavingKey === cohort.id || (controller.cohortDrafts[cohort.id] || '').trim() === ''}
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:opacity-60"
                    >
                      {controller.cohortSavingKey === cohort.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      名前を保存する
                    </button>
                  </div>
                ))}

                {settingsSnapshot.cohorts.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
                    まだクラス/担当グループはありません。先に追加してから、生徒と講師の可視範囲を設定します。
                  </div>
                )}
              </div>
            </div>

            <div data-testid="instructor-cohort-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Instructor Scope</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師ごとの可視クラスを設定する</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {settingsSnapshot.members
                  .filter((member) => member.organizationRole === OrganizationRole.INSTRUCTOR)
                  .map((member) => (
                    <div key={member.userUid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-950">{member.displayName}</div>
                          <div className="mt-1 text-xs text-slate-400">{member.email}</div>
                        </div>
                        <button
                          type="button"
                          data-testid={`instructor-cohort-save-${member.userUid}`}
                          onClick={() => void controller.handleInstructorCohortsSave(member.userUid)}
                          disabled={controller.instructorCohortSavingUid === member.userUid}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:opacity-60"
                        >
                          {controller.instructorCohortSavingUid === member.userUid ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          範囲を保存する
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {settingsSnapshot.cohorts.map((cohort) => {
                          const checked = (controller.instructorCohortDrafts[member.userUid] || []).includes(cohort.id);
                          return (
                            <label key={cohort.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                              <input
                                data-testid={`instructor-cohort-checkbox-${member.userUid}-${cohort.id}`}
                                type="checkbox"
                                checked={checked}
                                onChange={() => controller.toggleInstructorCohort(member.userUid, cohort.id)}
                                className="h-4 w-4 rounded border-slate-300 text-medace-600 focus:ring-medace-500"
                              />
                              <span className="font-medium">{cohort.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      {settingsSnapshot.cohorts.length === 0 && (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                          先にクラス/担当グループを作成してください。
                        </div>
                      )}
                    </div>
                  ))}
                {settingsSnapshot.members.every((member) => member.organizationRole !== OrganizationRole.INSTRUCTOR) && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
                    範囲設定対象の講師はまだいません。
                  </div>
                )}
              </div>
            </div>

            <div data-testid="organization-members-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Membership</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">現メンバー一覧</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {settingsSnapshot.members.map((member) => (
                  <div key={member.userUid} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{member.displayName}</div>
                        <div className="mt-1 text-xs text-slate-400">{member.email}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                        member.organizationRole === OrganizationRole.GROUP_ADMIN
                          ? 'border-medace-200 bg-medace-50 text-medace-800'
                          : member.organizationRole === OrganizationRole.INSTRUCTOR
                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                            : 'border-slate-200 bg-white text-slate-600'
                      }`}>
                        {member.organizationRole === OrganizationRole.GROUP_ADMIN ? '管理者' : member.organizationRole === OrganizationRole.INSTRUCTOR ? '講師' : '生徒'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{SUBSCRIPTION_PLAN_LABELS[member.subscriptionPlan]}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{formatDateTime(member.updatedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div data-testid="organization-audit-section" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <BellRing className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Audit Trail</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">最近の監査履歴</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {settingsSnapshot.auditEvents.length > 0 ? settingsSnapshot.auditEvents.map((event) => (
                  <div key={`${event.id}-${event.createdAt}`} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{event.actionType}</div>
                        <div className="mt-1 text-xs text-slate-500">{event.actorDisplayName}</div>
                      </div>
                      <div className="text-right text-xs text-slate-500">{formatDateTime(event.createdAt)}</div>
                    </div>
                    {event.payload && (
                      <div className="mt-3 rounded-2xl border border-white bg-white px-4 py-3 text-xs leading-relaxed text-slate-600">
                        {Object.entries(event.payload).map(([key, value]) => `${key}: ${String(value)}`).join(' / ')}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-500">
                    まだ監査イベントはありません。
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeView === BusinessAdminWorkspaceView.WRITING && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="配布済み" value={`${writingCounts.issuedCount}件`} detail="まだ提出されていない課題" />
            <WorkspaceMetricCard label="添削待ち" value={`${writingCounts.reviewReadyCount}件`} detail="講師確認待ちの提出" tone={writingCounts.reviewReadyCount > 0 ? 'warning' : 'success'} />
            <WorkspaceMetricCard label="再提出待ち" value={`${writingCounts.revisionRequestedCount}件`} detail="返却後の再提出待ち" tone={writingCounts.revisionRequestedCount > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="完了済み" value={`${writingCounts.completedCount}件`} detail="返却と完了まで終了" />
          </div>
          <WritingOpsPanel user={user} />
        </div>
      )}

      {activeView === BusinessAdminWorkspaceView.WORKSHEETS && (
        <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Worksheet Ops</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">配布用PDF問題を独立して作る</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              組織運用と同じ画面に混ぜず、配布物作成だけをここで処理します。今日の授業や面談で配る問題を短時間で用意できます。
            </p>
          </section>
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <WorksheetPrintLauncher
              user={user}
              buttonLabel="生徒別にPDF問題を作る"
              buttonClassName="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
            />
          </section>
        </div>
      )}

      {activeView === BusinessAdminWorkspaceView.CATALOG && (
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Catalog Access</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">教材カタログは必要なときだけ開く</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
                管理者の主作業は組織運用です。教材閲覧は独立ビューに分け、教材の中身やテスト導線の確認が必要なときだけ使います。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.OVERVIEW)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
            >
              概要へ戻る <ArrowRight className="h-4 w-4" />
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
                title="ビジネス版の既存単語帳を確認する"
                description="学校管理者体験でも、既存の公式単語帳をそのまま開けます。組織運用を見ながら、教材の中身やテスト導線まで確認できます。"
              />
            </Suspense>
          </div>
        </section>
      )}

      {activeView === BusinessAdminWorkspaceView.OVERVIEW && (
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-medace-600" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Plan Fit</p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">この組織向けプランで担保すること</h3>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {policy.featureSummary.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
};

export default BusinessAdminDashboardSections;
