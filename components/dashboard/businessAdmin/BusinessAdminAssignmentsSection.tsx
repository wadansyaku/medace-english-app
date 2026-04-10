import React from 'react';
import { BellRing, Search } from 'lucide-react';

import {
  INTERVENTION_OUTCOME_LABELS,
  LEARNING_TRACK_LABELS,
  RETENTION_CONTINUITY_BAND_LABELS,
  WEAKNESS_DIMENSION_LABELS,
  WEEKLY_MISSION_STATUS_LABELS,
  OrganizationRole,
  type BookMetadata,
  type OrganizationDashboardSnapshot,
  type OrganizationSettingsSnapshot,
  type WritingAssignment,
} from '../../../types';
import WorkspaceMetricCard from '../../workspace/WorkspaceMetricCard';
import type { BusinessAdminDashboardController } from './shared';
import {
  cohortLabel,
  cohortTone,
  formatDateTime,
  formatDays,
  riskLabel,
  riskTone,
  weaknessTone,
} from './shared';

interface BusinessAdminAssignmentsSectionProps {
  controller: BusinessAdminDashboardController;
  snapshot: OrganizationDashboardSnapshot;
  settingsSnapshot: OrganizationSettingsSnapshot | null;
  books: BookMetadata[];
  writingAssignments: WritingAssignment[];
}

const BusinessAdminAssignmentsSection: React.FC<BusinessAdminAssignmentsSectionProps> = ({
  controller,
  snapshot,
  settingsSnapshot,
  books,
  writingAssignments,
}) => {
  const recentEvents = snapshot.assignmentEvents.slice(0, 6);

  return (
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
                    onChange={(event) => controller.handleAssignmentChange(controller.selectedAssignmentStudent!.uid, event.target.value)}
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
                    onChange={(event) => controller.handleStudentCohortChange(controller.selectedAssignmentStudent!.uid, event.target.value)}
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
  );
};

export default BusinessAdminAssignmentsSection;
