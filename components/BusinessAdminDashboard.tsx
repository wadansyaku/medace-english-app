import React, { Suspense, lazy, useMemo } from 'react';
import { getSubscriptionPolicy } from '../config/subscription';
import {
  BusinessAdminWorkspaceView,
  OrganizationRole,
  StudentRiskLevel,
  SUBSCRIPTION_PLAN_LABELS,
  type UserProfile,
} from '../types';
import {
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  Loader2,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useBusinessAdminDashboardData } from '../hooks/useBusinessAdminDashboardData';
import { useBusinessAdminDashboardController } from '../hooks/useBusinessAdminDashboardController';
import { resolveStorageMode } from '../shared/storageMode';
import {
  getBusinessAdminWritingCounts,
  getPlanCoverageRate,
  sortInstructorsByAssignedLoad,
} from '../utils/businessAdminDashboard';
import B2BStorageModeBanner from './workspace/B2BStorageModeBanner';
import WorkspaceMetricCard from './workspace/WorkspaceMetricCard';

const OfficialCatalogAccessPanel = lazy(() => import('./OfficialCatalogAccessPanel'));
const WorksheetPrintLauncher = lazy(() => import('./WorksheetPrintLauncher'));
const WritingOpsPanel = lazy(() => import('./WritingOpsPanel'));

interface BusinessAdminDashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: BusinessAdminWorkspaceView;
  onChangeView: (view: BusinessAdminWorkspaceView) => void;
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

const VIEW_COPY: Record<BusinessAdminWorkspaceView, { eyebrow: string; title: string; body: string }> = {
  [BusinessAdminWorkspaceView.OVERVIEW]: {
    eyebrow: 'Organization Overview',
    title: '組織運用の詰まりを先に掴む',
    body: '要フォロー生徒、担当割当の滞留、講師負荷、自由英作文の滞留を分けて見ながら、今優先する作業を決めます。',
  },
  [BusinessAdminWorkspaceView.ASSIGNMENTS]: {
    eyebrow: 'Assignments',
    title: '担当割当だけを一覧と詳細で更新する',
    body: '生徒一覧から対象を絞り、右側で担当講師、要フォロー理由、最新履歴を見ながら割当を調整します。',
  },
  [BusinessAdminWorkspaceView.INSTRUCTORS]: {
    eyebrow: 'Instructor Load',
    title: '講師ごとの負荷と稼働を比較する',
    body: '通知数、担当生徒数、接触生徒数を並べて、偏りや詰まりを確認します。',
  },
  [BusinessAdminWorkspaceView.WRITING]: {
    eyebrow: 'Writing Management',
    title: '自由英作文の進行状況と返却滞留を確認する',
    body: '問題作成、配布、添削キュー、返却履歴を学校運用の流れとして見える化します。',
  },
  [BusinessAdminWorkspaceView.WORKSHEETS]: {
    eyebrow: 'Worksheet Ops',
    title: '配布用PDF問題の作成に集中する',
    body: '生徒向け配布物は他の情報と切り離し、紙問題作成だけを素早く進めます。',
  },
  [BusinessAdminWorkspaceView.CATALOG]: {
    eyebrow: 'Catalog Access',
    title: '教材カタログは必要時だけ確認する',
    body: '運用画面を整理するため、教材確認は独立ビューで必要な時だけ開きます。',
  },
};

const BusinessAdminDashboard: React.FC<BusinessAdminDashboardProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
}) => {
  const {
    snapshot,
    writingAssignments,
    writingQueue,
    loading,
    error,
    refresh,
  } = useBusinessAdminDashboardData();
  const controller = useBusinessAdminDashboardController({
    snapshot,
    refresh,
  });
  const storageMode = useMemo(() => resolveStorageMode(import.meta.env.VITE_STORAGE_MODE), []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-500">
        <Loader2 className="h-10 w-10 animate-spin text-medace-500" />
        <p className="mt-3 text-sm font-medium">組織データを集計中...</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        {error || '組織データがありません。'}
      </div>
    );
  }

  const policy = getSubscriptionPolicy(snapshot.subscriptionPlan);
  const planCoverageRate = getPlanCoverageRate(snapshot);
  const instructorLoad = sortInstructorsByAssignedLoad(snapshot.instructors);
  const writingCounts = getBusinessAdminWritingCounts(writingAssignments, writingQueue);
  const recentEvents = snapshot.assignmentEvents.slice(0, 6);
  const viewCopy = VIEW_COPY[activeView];
  const isLocalMockData = storageMode.isLocalMockData;
  const assignmentCoverageLabel = isLocalMockData ? '担当割当率 (参考)' : '担当割当率';
  const assignmentCoverageDetail = isLocalMockData
    ? 'ローカル擬似データのため参考値です'
    : `未割当 ${snapshot.unassignedStudents}名`;
  const reactivatedStudentsLabel = isLocalMockData ? '通知後再開 (参考)' : '通知後再開';
  const reactivatedStudentsDetail = isLocalMockData
    ? 'ローカル擬似データ上の参考値'
    : '72時間以内に学習再開';

  return (
    <div data-testid="business-admin-dashboard" className="space-y-8 pb-12">
      {controller.notice && (
        <div className={`rounded-[24px] border px-5 py-4 text-sm font-medium ${
          controller.notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.notice.message}
        </div>
      )}

      {isLocalMockData && <B2BStorageModeBanner />}

      <section className="relative overflow-hidden rounded-[32px] bg-medace-500 p-8 text-white shadow-[0_24px_60px_rgba(255,130,22,0.22)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.26),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_22%)]"></div>
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
                {SUBSCRIPTION_PLAN_LABELS[snapshot.subscriptionPlan]}
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
                グループ管理者
              </span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
              {user.displayName}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3 text-medace-100">
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-bold">{snapshot.organizationName}</span>
          </div>
          <div className="mt-6 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{viewCopy.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">{viewCopy.title}</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/75">{viewCopy.body}</p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.ASSIGNMENTS)}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-medace-900 transition-colors hover:bg-medace-50"
            >
              <Users className="h-4 w-4" />
              割当を確認する
            </button>
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.INSTRUCTORS)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <ShieldCheck className="h-4 w-4" />
              講師負荷を見る
            </button>
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.WRITING)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <CheckCircle2 className="h-4 w-4" />
              作文進捗を見る
            </button>
          </div>
        </div>
      </section>

      {activeView === BusinessAdminWorkspaceView.OVERVIEW && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="登録生徒" value={`${snapshot.totalStudents}名`} detail="組織内の学習対象生徒数" />
            <WorkspaceMetricCard label="要フォロー" value={`${snapshot.atRiskStudents}名`} detail="学習が止まりかけている生徒" tone={snapshot.atRiskStudents > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label={assignmentCoverageLabel} value={`${snapshot.assignmentCoverageRate}%`} detail={assignmentCoverageDetail} tone={snapshot.unassignedStudents > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="プラン浸透" value={`${planCoverageRate}%`} detail={`${snapshot.learningPlanCount}名が設定済み`} tone="accent" />
          </div>

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
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">未割当</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{snapshot.unassignedStudents}</div>
                  <div className="mt-1 text-sm text-slate-600">担当講師がまだ決まっていない生徒</div>
                </div>
                <div className="rounded-2xl border border-medace-200 bg-medace-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-700">未設定プラン</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{snapshot.totalStudents - snapshot.learningPlanCount}</div>
                  <div className="mt-1 text-sm text-slate-600">学習プランが未設定の生徒</div>
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
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white bg-white px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当生徒</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{instructor.assignedStudentCount}</div>
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">接触生徒</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{instructor.notifiedStudentCount}</div>
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">7日通知</div>
                        <div className="mt-2 text-2xl font-black text-slate-950">{instructor.notifications7d}</div>
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
          </div>
        </div>
      )}

      {activeView === BusinessAdminWorkspaceView.ASSIGNMENTS && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="割当対象" value={`${controller.filteredAssignments.length}名`} detail="現在の条件に一致する生徒" />
            <WorkspaceMetricCard label="未割当" value={`${snapshot.unassignedStudents}名`} detail="担当講師が決まっていない生徒" tone={snapshot.unassignedStudents > 0 ? 'warning' : 'default'} />
            <WorkspaceMetricCard label="要フォロー" value={`${snapshot.atRiskStudents}名`} detail="リスク高の生徒" tone={snapshot.atRiskStudents > 0 ? 'danger' : 'success'} />
            <WorkspaceMetricCard label={isLocalMockData ? '割当済み率 (参考)' : '割当済み率'} value={`${snapshot.assignmentCoverageRate}%`} detail={isLocalMockData ? 'ローカル擬似データのため参考値です' : '組織全体の割当進行'} tone="accent" />
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
                  { key: 'DANGER', label: '要フォロー' },
                  { key: 'UNASSIGNED', label: '未割当' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => controller.setAssignmentFilter(option.key as 'ALL' | 'DANGER' | 'UNASSIGNED')}
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
                      onClick={() => controller.setSelectedStudentUid(student.uid)}
                      className={`grid w-full grid-cols-[0.72fr_1.14fr_0.88fr_1.1fr] gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-b-0 ${
                        controller.selectedAssignmentStudent?.uid === student.uid ? 'bg-medace-50/70' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(student.riskLevel)}`}>
                          {riskLabel(student.riskLevel)}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-950">{student.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{student.email}</div>
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
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(controller.selectedAssignmentStudent.riskLevel)}`}>
                        {riskLabel(controller.selectedAssignmentStudent.riskLevel)}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終学習</div>
                        <div className="mt-2 text-xl font-black text-slate-950">{formatDays(controller.selectedAssignmentStudent.lastActive)}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習プラン</div>
                        <div className="mt-2 text-xl font-black text-slate-950">{controller.selectedAssignmentStudent.hasLearningPlan ? '設定済み' : '未設定'}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">習得語</div>
                        <div className="mt-2 text-xl font-black text-slate-950">{controller.selectedAssignmentStudent.totalLearned}</div>
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

                    {controller.selectedAssignmentStudent.recommendedAction && (
                      <div className="rounded-3xl border border-medace-100 bg-medace-50/70 px-5 py-5 text-sm leading-relaxed text-medace-900">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-medace-700">推奨アクション</div>
                        <div className="mt-3">{controller.selectedAssignmentStudent.recommendedAction}</div>
                      </div>
                    )}
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
            <WorkspaceMetricCard label={assignmentCoverageLabel} value={`${snapshot.assignmentCoverageRate}%`} detail={isLocalMockData ? 'ローカル擬似データのため参考値です' : '講師に明示的に割り当て済み'} tone="accent" />
            <WorkspaceMetricCard label={reactivatedStudentsLabel} value={`${snapshot.reactivatedStudents7d}名`} detail={reactivatedStudentsDetail} tone="success" />
            <WorkspaceMetricCard label="7日通知" value={`${snapshot.notifications7d}件`} detail="組織全体のフォロー通知数" />
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
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当生徒</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{instructor.assignedStudentCount}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">接触生徒</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{instructor.notifiedStudentCount}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">7日通知</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{instructor.notifications7d}</div>
                    </div>
                  </div>
                </div>
              ))}
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
    </div>
  );
};

export default BusinessAdminDashboard;
