import React, { Suspense, lazy } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  FileStack,
  Loader2,
  ScanText,
  Search,
  Users,
} from 'lucide-react';

import {
  INTERVENTION_KIND_LABELS,
  INTERVENTION_OUTCOME_LABELS,
  InstructorWorkspaceView,
  LEARNING_TRACK_LABELS,
  RETENTION_CONTINUITY_BAND_LABELS,
  StudentRiskLevel,
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
  hasStudentsData: boolean;
  hasAssignmentsData: boolean;
  hasQueueData: boolean;
  loading: boolean;
}

const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-steady-action px-5 py-3 text-sm font-bold text-steady-on-action transition-colors hover:bg-steady-action-hover';
const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50';
const PANEL = 'rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6';
const getRiskStyle = (risk: StudentRiskLevel) =>
  risk === StudentRiskLevel.DANGER
    ? 'border-red-200 bg-red-50 text-red-800'
    : risk === StudentRiskLevel.WARNING
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
const getRiskLabel = (risk: StudentRiskLevel) =>
  risk === StudentRiskLevel.DANGER
    ? '要フォロー'
    : risk === StudentRiskLevel.WARNING
      ? '見守り'
      : '安定';
const getQueueLabel = (student: StudentSummary) => {
  const segment = getInstructorQueueSegment(student);
  return segment === 'IMMEDIATE'
    ? '今日フォロー'
    : segment === 'REACTIVATED'
      ? '再開を確認'
      : '経過を確認';
};
const getNextActionText = (student: StudentSummary) =>
  student.englishPracticeInsight?.nextActionLabel ||
  student.recommendedAction ||
  (student.riskLevel === StudentRiskLevel.DANGER
    ? '短い復習から再開できるよう声をかける'
    : student.riskLevel === StudentRiskLevel.WARNING
      ? '次の学習開始を後押しする'
      : '現在の学習ペースを応援する');
const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const formatDaysSinceActive = (timestamp: number) => {
  if (timestamp == null || !Number.isFinite(timestamp)) return '未集計';
  if (timestamp === 0) return '未学習';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  return days === 0 ? '今日' : `${days}日前`;
};
const LoadingPanel = ({ label }: { label: string }) => (
  <div
    role="status"
    className={`${PANEL} flex min-h-32 items-center justify-center gap-3 text-sm text-slate-600`}
  >
    <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-medace-700" />
    {label}
  </div>
);
const DetailMetric = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-2xl bg-slate-50 px-4 py-4">
    <dt className="text-xs font-bold text-slate-500">{label}</dt>
    <dd className="mt-2 text-base font-bold text-slate-900">{value}</dd>
  </div>
);

const InstructorDashboardSections: React.FC<InstructorDashboardSectionsProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
  controller,
  students,
  writingAssignments,
  writingQueue,
  hasStudentsData,
  hasAssignmentsData,
  hasQueueData,
  loading,
}) => {
  const immediateStudents = controller.sortedStudents.filter(
    (student) => getInstructorQueueSegment(student) === 'IMMEDIATE',
  );
  const waitingCount = controller.sortedStudents.filter(
    (student) => getInstructorQueueSegment(student) === 'WAITING',
  ).length;
  const reactivatedCount = controller.sortedStudents.filter(
    (student) => getInstructorQueueSegment(student) === 'REACTIVATED',
  ).length;
  const writingCounts = getBusinessAdminWritingCounts(writingAssignments, writingQueue);
  const priorityStudent = immediateStudents[0];
  const focusedStudent = controller.focusedStudent;
  const unknownValue = loading ? '読込中' : '未取得';
  const scopeSwitch = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="表示する生徒の範囲">
      {[
        { key: 'ASSIGNED', label: '自分の担当' },
        { key: 'VISIBLE', label: '閲覧できる生徒すべて' },
      ].map(({ key, label }) => (
        <button
          type="button"
          key={key}
          aria-pressed={controller.studentScope === key}
          onClick={() => controller.setStudentScope(key as 'ASSIGNED' | 'VISIBLE')}
          className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-bold ${controller.studentScope === key ? 'border-medace-200 bg-medace-50 text-medace-900' : 'border-slate-200 bg-white text-slate-600'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const focusStudent = (student: StudentSummary) => {
    controller.setFocusedStudentUid(student.uid);
    if (window.matchMedia('(max-width: 1279px)').matches) {
      const details = document.getElementById('instructor-student-details');
      details?.focus({ preventScroll: true });
      details?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

  return (
    <>
      {activeView === InstructorWorkspaceView.OVERVIEW && (
        <div className="space-y-6">
          <section className={`${PANEL} bg-medace-50/50`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-medace-800">担当生徒から始める</p>
                <h3 className="mt-2 text-xl font-black text-medace-900">今日のフォロー</h3>
              </div>
              {scopeSwitch}
            </div>
            {!hasStudentsData ? (
              <p className="mt-5 text-sm text-slate-600">
                {loading
                  ? '担当生徒の状況を確認しています。'
                  : '担当生徒の状況は未取得です。画面上部から再取得できます。'}
              </p>
            ) : priorityStudent ? (
              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-bold text-medace-900">
                    {priorityStudent.name}さんの次の一歩を確認
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {getNextActionText(priorityStudent)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    最終学習 {formatDaysSinceActive(priorityStudent.lastActive)} ·{' '}
                    {priorityStudent.cohortName || 'クラス未設定'}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`send-notification-${priorityStudent.uid}`}
                  className={`${PRIMARY_BUTTON} flex-shrink-0`}
                  onClick={() => controller.openComposer(priorityStudent)}
                >
                  <Bell aria-hidden="true" className="h-4 w-4" />
                  声かけの通知文を作る
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-slate-900">
                    {controller.sortedStudents.length === 0
                      ? '担当・表示範囲を確認しましょう'
                      : '今日フォローが必要な生徒はいません'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {controller.sortedStudents.length === 0
                      ? '生徒が表示されない場合は閲覧範囲を切り替え、担当設定を管理者に確認してください。'
                      : '生徒一覧から、学習ペースや今週の課題の様子を確かめられます。'}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} flex-shrink-0`}
                  onClick={() => onChangeView(InstructorWorkspaceView.STUDENTS)}
                >
                  <Users aria-hidden="true" className="h-4 w-4" />
                  生徒を確認する
                </button>
              </div>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <WorkspaceMetricCard
              label="自分の担当"
              value={hasStudentsData ? `${controller.assignedStudents.length}名` : unknownValue}
              detail="担当設定に基づく人数"
            />
            <WorkspaceMetricCard
              label="今日フォロー"
              value={hasStudentsData ? `${immediateStudents.length}名` : unknownValue}
              detail="選択中の表示範囲"
              tone={hasStudentsData && immediateStudents.length > 0 ? 'warning' : 'default'}
            />
            <WorkspaceMetricCard
              label="添削待ち"
              value={hasQueueData ? `${writingCounts.reviewReadyCount}件` : unknownValue}
              detail="閲覧できる提出"
              tone={hasQueueData && writingCounts.reviewReadyCount > 0 ? 'warning' : 'default'}
            />
            <WorkspaceMetricCard
              label="再提出待ち"
              value={
                hasAssignmentsData ? `${writingCounts.revisionRequestedCount}件` : unknownValue
              }
              detail="返却後の課題"
            />
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className={PANEL}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-black text-slate-900">担当生徒の様子</h3>
                <button
                  type="button"
                  onClick={() => onChangeView(InstructorWorkspaceView.STUDENTS)}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-medace-800"
                >
                  生徒一覧へ
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {!hasStudentsData ? (
                  <p className="py-5 text-sm text-slate-500">
                    {unknownValue}：生徒一覧は取得後に表示します。
                  </p>
                ) : controller.sortedStudents.length === 0 ? (
                  <p className="py-5 text-sm leading-6 text-slate-500">
                    この表示範囲に生徒はいません。担当設定または閲覧範囲を確認してください。
                  </p>
                ) : (
                  controller.sortedStudents.slice(0, 4).map((student) => (
                    <button
                      key={student.uid}
                      type="button"
                      className="flex min-h-20 w-full items-center justify-between gap-3 py-4 text-left"
                      onClick={() => {
                        controller.setFilter('ALL');
                        controller.setQuery('');
                        controller.setFocusedStudentUid(student.uid);
                        onChangeView(InstructorWorkspaceView.STUDENTS);
                      }}
                    >
                      <div className="min-w-0">
                        <p className="content-safe font-bold text-slate-900">{student.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {student.cohortName || 'クラス未設定'} · 最終学習{' '}
                          {formatDaysSinceActive(student.lastActive)}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {getNextActionText(student)}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(student.riskLevel)}`}
                      >
                        {getRiskLabel(student.riskLevel)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
            <div className="space-y-4">
              <section className={PANEL}>
                <h3 className="text-lg font-black text-slate-900">小テスト・課題を準備</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  授業の単語確認にはプリントを。英作文の課題は配布から返却まで確認できます。
                </p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => onChangeView(InstructorWorkspaceView.WORKSHEETS)}
                    className={SECONDARY_BUTTON}
                  >
                    <FileStack aria-hidden="true" className="h-4 w-4" />
                    単語の小テストを作る
                    <ArrowRight aria-hidden="true" className="ml-auto h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeView(InstructorWorkspaceView.WRITING)}
                    className={SECONDARY_BUTTON}
                  >
                    <ScanText aria-hidden="true" className="h-4 w-4" />
                    英作文の課題・提出を開く
                    <ArrowRight aria-hidden="true" className="ml-auto h-4 w-4" />
                  </button>
                </div>
              </section>
              <section className={PANEL}>
                <h3 className="text-lg font-black text-slate-900">提出への返却</h3>
                {!hasQueueData ? (
                  <p className="mt-3 text-sm text-slate-500">
                    {unknownValue}：添削待ちの有無をまだ確認できません。
                  </p>
                ) : writingQueue.length === 0 ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-700" />
                    現在、添削待ちの提出はありません。
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100">
                    {writingQueue.slice(0, 3).map((item) => (
                      <div key={item.submissionId} className="py-3">
                        <p className="text-sm font-bold text-slate-900">
                          {item.studentName}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {item.attemptNo}回目の提出
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{item.promptTitle}</p>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onChangeView(InstructorWorkspaceView.WRITING)}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-medace-800"
                >
                  添削・返却を開く
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </section>
            </div>
          </div>
        </div>
      )}

      {activeView === InstructorWorkspaceView.STUDENTS && (
        <div className="space-y-5">
          <section className={PANEL}>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              {scopeSwitch}
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 lg:w-80">
                <Search aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-slate-500" />
                <span className="sr-only">生徒名・メールで検索</span>
                <input
                  type="search"
                  value={controller.query}
                  onChange={(event) => controller.setQuery(event.target.value)}
                  placeholder="生徒名・メールで検索"
                  className="min-w-0 w-full bg-transparent text-sm text-slate-800 outline-none"
                />
              </label>
            </div>
            <div
              className="mt-4 flex gap-2 overflow-x-auto"
              role="group"
              aria-label="生徒のフォロー状況"
            >
              {[
                { key: 'ALL', label: 'すべて', count: controller.sortedStudents.length },
                { key: 'IMMEDIATE', label: '今日フォロー', count: immediateStudents.length },
                { key: 'WAITING', label: '経過を確認', count: waitingCount },
                { key: 'REACTIVATED', label: '再開を確認', count: reactivatedCount },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={controller.filter === key}
                  onClick={() =>
                    controller.setFilter(key as InstructorDashboardController['filter'])
                  }
                  className={`min-h-11 flex-shrink-0 rounded-xl px-3 py-2 text-sm font-bold ${controller.filter === key ? 'bg-medace-50 text-medace-900 ring-1 ring-inset ring-medace-200' : 'bg-slate-50 text-slate-600'}`}
                >
                  {label}
                  <span className="ml-2 text-xs">{hasStudentsData ? count : '—'}</span>
                </button>
              ))}
            </div>
          </section>
          <div className="grid items-start gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold text-slate-900">生徒を選ぶ</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {hasStudentsData
                    ? `${controller.filteredStudents.length}名を表示 · 今日フォローが必要な順`
                    : '取得後に表示します'}
                </p>
              </div>
              <div data-testid="instructor-students-list">
                {!hasStudentsData ? (
                  <p className="px-5 py-10 text-sm leading-7 text-slate-500">
                    {loading
                      ? '生徒を読み込んでいます。'
                      : '生徒を取得できませんでした。画面上部から再取得してください。'}
                  </p>
                ) : controller.filteredStudents.length === 0 ? (
                  <div className="px-5 py-10">
                    <p className="text-sm leading-7 text-slate-600">
                      {controller.sortedStudents.length === 0
                        ? 'この表示範囲に生徒はいません。担当設定を確認するか、閲覧範囲を切り替えてください。'
                        : 'この条件に一致する生徒はいません。'}
                    </p>
                    {controller.sortedStudents.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          controller.setQuery('');
                          controller.setFilter('ALL');
                        }}
                        className={`${SECONDARY_BUTTON} mt-4`}
                      >
                        検索と絞り込みを解除
                      </button>
                    )}
                  </div>
                ) : (
                  controller.filteredStudents.map((student) => (
                    <button
                      key={student.uid}
                      type="button"
                      data-testid={`instructor-student-row-${student.uid}`}
                      aria-pressed={focusedStudent?.uid === student.uid}
                      aria-controls="instructor-student-details"
                      onClick={() => focusStudent(student)}
                      className={`w-full border-b border-slate-100 px-5 py-5 text-left transition-colors last:border-b-0 ${focusedStudent?.uid === student.uid ? 'bg-medace-50/70 ring-2 ring-inset ring-medace-200' : 'bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="content-safe font-bold text-slate-900">{student.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {student.cohortName || 'クラス未設定'} ·{' '}
                            {formatDaysSinceActive(student.lastActive)}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${getRiskStyle(student.riskLevel)}`}
                        >
                          {getQueueLabel(student)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {getNextActionText(student)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {student.latestInterventionAt
                          ? `前回フォロー ${formatDateTime(student.latestInterventionAt)}`
                          : 'まだフォローの記録はありません'}{' '}
                        · 詳細を見る
                      </p>
                    </button>
                  ))
                )}
              </div>
            </section>
            <section
              id="instructor-student-details"
              tabIndex={-1}
              aria-label="選択した生徒の詳細"
              className={`${PANEL} scroll-mt-24`}
            >
              {!focusedStudent ? (
                <p className="py-10 text-sm text-slate-500">
                  生徒を選ぶと、学習状況と次のアクションが表示されます。
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-medace-800">生徒の学習状況</p>
                      <h3 className="content-safe mt-2 text-2xl font-black text-slate-900">
                        {focusedStudent.name}
                      </h3>
                      <p className="content-safe mt-2 text-sm text-slate-500">
                        {focusedStudent.email}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {focusedStudent.cohortName || 'クラス未設定'} · 担当{' '}
                        {focusedStudent.assignedInstructorName || '未割当'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${getRiskStyle(focusedStudent.riskLevel)}`}
                    >
                      {getRiskLabel(focusedStudent.riskLevel)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-medace-100 bg-medace-50/60 p-5">
                    <p className="text-xs font-bold text-medace-800">次にできること</p>
                    <p className="mt-2 text-sm leading-7 text-medace-900">
                      {getNextActionText(focusedStudent)}
                    </p>
                    <button
                      type="button"
                      data-testid={`send-notification-${focusedStudent.uid}`}
                      onClick={() => controller.openComposer(focusedStudent)}
                      className={`${PRIMARY_BUTTON} mt-4`}
                    >
                      <Bell aria-hidden="true" className="h-4 w-4" />
                      通知文を作る
                    </button>
                    <p className="mt-3 text-xs leading-6 text-slate-600">
                      内容を確認してからアプリ内通知として保存します。
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <DetailMetric
                      label="最終学習"
                      value={formatDaysSinceActive(focusedStudent.lastActive)}
                    />
                    <DetailMetric
                      label="直近7日の学習"
                      value={
                        focusedStudent.activeStudyDays7d == null
                          ? '未集計'
                          : `${focusedStudent.activeStudyDays7d}日`
                      }
                    />
                    <DetailMetric
                      label="今週の課題"
                      value={
                        focusedStudent.primaryMissionStatus
                          ? WEEKLY_MISSION_STATUS_LABELS[focusedStudent.primaryMissionStatus]
                          : '課題の記録なし'
                      }
                    />
                    <DetailMetric
                      label="課題進捗"
                      value={
                        focusedStudent.primaryMissionCompletionRate == null
                          ? '未集計'
                          : `${focusedStudent.primaryMissionCompletionRate}%`
                      }
                    />
                  </dl>
                  {focusedStudent.primaryMissionTitle && (
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-xs font-bold text-slate-500">今週取り組む課題</p>
                      <p className="mt-2 text-sm font-bold text-slate-900">
                        {focusedStudent.primaryMissionTitle}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {focusedStudent.primaryMissionTrack
                          ? LEARNING_TRACK_LABELS[focusedStudent.primaryMissionTrack]
                          : 'トラック未設定'}
                        {focusedStudent.missionDueAt
                          ? ` · 期限 ${formatDateTime(focusedStudent.missionDueAt)}`
                          : ''}
                      </p>
                    </div>
                  )}
                  {focusedStudent.riskReasons?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">フォローが必要な理由</h4>
                      <ul className="mt-2 space-y-2">
                        {focusedStudent.riskReasons.map((reason) => (
                          <li
                            key={reason}
                            className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600"
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {focusedStudent.topWeaknesses?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">学習のつまずき</h4>
                      <div className="mt-3 space-y-2">
                        {focusedStudent.topWeaknesses.slice(0, 3).map((weakness) => (
                          <div
                            key={weakness.dimension}
                            className="rounded-xl border border-slate-200 p-4"
                          >
                            <p className="text-sm font-bold text-slate-900">
                              {WEAKNESS_DIMENSION_LABELS[weakness.dimension]}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              {weakness.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {focusedStudent.englishPracticeInsight && (
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                      <h4 className="text-sm font-bold text-sky-900">英語演習の様子</h4>
                      <p className="mt-2 text-sm font-bold text-slate-900">
                        {focusedStudent.englishPracticeInsight.nextActionLabel}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {focusedStudent.englishPracticeInsight.reason}
                      </p>
                    </div>
                  )}
                  <details className="rounded-2xl border border-slate-200 p-4">
                    <summary className="min-h-7 cursor-pointer text-sm font-bold text-slate-700">
                      継続・プラン・前回フォロー
                    </summary>
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <DetailMetric
                        label="学習の継続"
                        value={
                          focusedStudent.continuityBand
                            ? RETENTION_CONTINUITY_BAND_LABELS[focusedStudent.continuityBand]
                            : '未集計'
                        }
                      />
                      <DetailMetric
                        label="学習プラン"
                        value={
                          focusedStudent.hasLearningPlan == null
                            ? '未取得'
                            : focusedStudent.hasLearningPlan
                              ? '設定済み'
                              : '未設定'
                        }
                      />
                      <DetailMetric
                        label="前回フォローの結果"
                        value={
                          focusedStudent.latestInterventionOutcome
                            ? INTERVENTION_OUTCOME_LABELS[focusedStudent.latestInterventionOutcome]
                            : '記録なし'
                        }
                      />
                      <DetailMetric
                        label="前回フォローの種類"
                        value={
                          focusedStudent.latestInterventionKind
                            ? INTERVENTION_KIND_LABELS[focusedStudent.latestInterventionKind]
                            : '記録なし'
                        }
                      />
                    </dl>
                    {focusedStudent.lastNotificationMessage ? (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="text-xs text-slate-500">
                          {focusedStudent.lastNotificationAt
                            ? formatDateTime(focusedStudent.lastNotificationAt)
                            : '送信日時未取得'}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                          {focusedStudent.lastNotificationMessage}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">まだ通知の記録はありません。</p>
                    )}
                  </details>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {activeView === InstructorWorkspaceView.WRITING && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <WorkspaceMetricCard
              label="添削待ち"
              value={hasQueueData ? `${writingCounts.reviewReadyCount}件` : unknownValue}
              detail="講師が確認する提出"
              tone={hasQueueData && writingCounts.reviewReadyCount > 0 ? 'warning' : 'default'}
            />
            <WorkspaceMetricCard
              label="再提出待ち"
              value={
                hasAssignmentsData ? `${writingCounts.revisionRequestedCount}件` : unknownValue
              }
              detail="返却後の課題"
            />
            <WorkspaceMetricCard
              label="配布済み課題"
              value={hasAssignmentsData ? `${writingCounts.issuedCount}件` : unknownValue}
              detail="提出前の課題"
            />
            <WorkspaceMetricCard
              label="完了済み"
              value={hasAssignmentsData ? `${writingCounts.completedCount}件` : unknownValue}
              detail="返却・完了した課題"
            />
          </div>
          <Suspense fallback={<LoadingPanel label="課題・提出の機能を読み込んでいます。" />}>
            <WritingOpsPanel user={user} />
          </Suspense>
        </div>
      )}

      {activeView === InstructorWorkspaceView.WORKSHEETS && (
        <div className="grid items-start gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <section className={PANEL}>
            <h3 className="text-xl font-black text-slate-900">授業の確認を、小さく始める</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              単語帳の範囲を指定して、紙の小テストを作れます。作成したプリントを確認し、印刷またはPDF保存してください。
            </p>
            <ol className="mt-5 space-y-3">
              {[
                '単語帳と番号の範囲を選ぶ',
                '問題数・出題形式を確認する',
                'プレビューを確認して印刷する',
              ].map((label, index) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-medace-100 text-xs font-black text-medace-900">
                    {index + 1}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
            <p className="mt-5 text-xs leading-6 text-slate-500">
              この画面はアプリ内のプリント作成です。社内の小テストジェネレーターとの収録照合は別途確認が必要です。
            </p>
          </section>
          <section className={PANEL}>
            <Suspense fallback={<LoadingPanel label="プリント機能を読み込んでいます。" />}>
              <WorksheetPrintLauncher
                user={user}
                buttonLabel="単語帳範囲からPDF問題を作る"
                defaultSourceMode="BOOK_RANGE"
                allowSourceModeSwitch={false}
              />
            </Suspense>
          </section>
        </div>
      )}

      {activeView === InstructorWorkspaceView.CATALOG && (
        <section className={PANEL}>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-xl font-black text-slate-900">教材の内容を確かめる</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                表示される教材は、現在のアカウントで利用できる単語帳です。学習・テスト画面も確認できます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChangeView(InstructorWorkspaceView.STUDENTS)}
              className={`${SECONDARY_BUTTON} flex-shrink-0`}
            >
              担当生徒へ戻る
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6">
            <Suspense fallback={<LoadingPanel label="単語帳を読み込んでいます。" />}>
              <OfficialCatalogAccessPanel
                user={user}
                onSelectBook={onSelectBook}
                eyebrow="教室の教材"
                title="利用できる単語帳"
                description="単語帳を開き、学習内容やテストの出題形式を確認できます。表示件数は取得した教材に基づきます。"
              />
            </Suspense>
          </div>
        </section>
      )}
    </>
  );
};

export default InstructorDashboardSections;
