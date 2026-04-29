import React from 'react';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react';

import {
  BusinessAdminWorkspaceView,
  LEARNING_TRACK_LABELS,
  OrganizationRole,
  type OrganizationActivationActionTarget,
  type OrganizationDashboardSnapshot,
  type WritingAssignment,
  type WritingQueueItem,
} from '../../../types';
import {
  buildBusinessActivationProgress,
  type BusinessActivationChecklistItem,
} from '../../../utils/businessActivation';
import {
  getBusinessAdminWritingCounts,
  sortInstructorBacklogByLoad,
} from '../../../utils/businessAdminDashboard';
import WorkspaceMetricCard from '../../workspace/WorkspaceMetricCard';
import {
  cohortLabel,
  cohortTone,
  formatTrendDate,
  riskLabel,
  riskTone,
} from './shared';

interface BusinessAdminOverviewSectionProps {
  snapshot: OrganizationDashboardSnapshot;
  writingAssignments: WritingAssignment[];
  writingQueue: WritingQueueItem[];
  isLocalMockData: boolean;
  nextActionView: BusinessAdminWorkspaceView;
  onChangeView: (view: BusinessAdminWorkspaceView) => void;
  activationNotificationPending: boolean;
  onSendActivationNotification: (target: OrganizationActivationActionTarget) => void;
  policyFeatureSummary: string[];
  canBootstrap: boolean;
  bootstrapPending: boolean;
  onBootstrap: () => void;
}

const BusinessAdminOverviewSection: React.FC<BusinessAdminOverviewSectionProps> = ({
  snapshot,
  writingAssignments,
  writingQueue,
  isLocalMockData,
  nextActionView,
  onChangeView,
  activationNotificationPending,
  onSendActivationNotification,
  policyFeatureSummary,
  canBootstrap,
  bootstrapPending,
  onBootstrap,
}) => {
  const instructorLoad = sortInstructorBacklogByLoad(snapshot.instructorBacklog);
  const writingCounts = getBusinessAdminWritingCounts(writingAssignments, writingQueue);
  const activationProgress = buildBusinessActivationProgress({
    snapshot,
  });
  const latestTrendPoint = snapshot.trend[snapshot.trend.length - 1];
  const canSendActivationNotification = snapshot.nextRequiredActionTarget?.kind === 'INSTRUCTOR_NOTIFICATION'
    && Boolean(snapshot.nextRequiredActionTarget.studentUid);
  const renderChecklistItem = (item: BusinessActivationChecklistItem) => (
    <div key={item.id} className={`flex h-full flex-col justify-between rounded-3xl border px-4 py-4 ${item.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <div>
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
          <CheckCircle2 className={`h-4 w-4 ${item.done ? 'text-emerald-600' : 'text-slate-300'}`} />
          {item.label}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.detail}</p>
      </div>
      <button
        type="button"
        onClick={() => onChangeView(item.targetView)}
        className={`mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-colors ${
          item.done
            ? 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100'
            : 'border-slate-200 bg-white text-slate-600 hover:border-medace-200 hover:text-medace-700'
        }`}
      >
        開く <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-medace-200 bg-medace-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">Next Required Action</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{snapshot.nextRequiredActionLabel}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700">{snapshot.nextRequiredActionDescription}</p>
            {canBootstrap && (
              <p className="mt-3 text-xs font-medium text-medace-800/80">
                demo 組織では導入セットを自動投入して、cohort から初回通知までをまとめて確認できます。
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {canSendActivationNotification && snapshot.nextRequiredActionTarget ? (
              <button
                type="button"
                data-testid="business-admin-send-first-notification"
                onClick={() => onSendActivationNotification(snapshot.nextRequiredActionTarget!)}
                disabled={activationNotificationPending}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-60"
              >
                {activationNotificationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                最初の通知を送る
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onChangeView(nextActionView)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800"
              >
                次の一手へ進む <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {canBootstrap && (
              <button
                type="button"
                data-testid="bootstrap-demo-organization"
                onClick={onBootstrap}
                disabled={bootstrapPending}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-medace-200 bg-white px-5 py-3 text-sm font-bold text-medace-800 transition-colors hover:border-medace-300 hover:bg-medace-100 disabled:opacity-60"
              >
                {bootstrapPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                導入セットを用意する
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkspaceMetricCard label="週4日継続率" value={`${snapshot.weeklyContinuityRate}%`} detail="直近7日で4日以上学習した生徒" tone="accent" />
        <WorkspaceMetricCard label="48時間介入率" value={`${snapshot.followUpCoverageRate48h}%`} detail="at-risk 生徒への48時間以内フォロー" tone={snapshot.followUpCoverageRate48h >= 80 ? 'success' : 'warning'} />
        <WorkspaceMetricCard label="未処理 backlog" value={`${snapshot.interventionBacklogCount}名`} detail="いま介入順を決めるべき生徒" tone={snapshot.interventionBacklogCount > 0 ? 'danger' : 'success'} />
        <WorkspaceMetricCard label="未割当 at-risk" value={`${snapshot.unassignedAtRiskCount}名`} detail="担当再設定が必要な生徒" tone={snapshot.unassignedAtRiskCount > 0 ? 'warning' : 'default'} />
      </div>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-medace-600" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">導入スタートチェック</p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">最初の運用ループ {activationProgress.completedCount}/{activationProgress.totalCount}</h3>
              {activationProgress.currentItem && (
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  次は「{activationProgress.currentItem.label}」を進めると、導入ループが次の段階に移ります。
                </p>
              )}
            </div>
          </div>
          <div className="min-w-48 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              <span>Progress</span>
              <span>{activationProgress.progressPercent}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-medace-600 transition-all"
                style={{ width: `${activationProgress.progressPercent}%` }}
              />
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {activationProgress.items.map(renderChecklistItem)}
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

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-medace-600" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Plan Fit</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">この組織向けプランで担保すること</h3>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {policyFeatureSummary.map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default BusinessAdminOverviewSection;
