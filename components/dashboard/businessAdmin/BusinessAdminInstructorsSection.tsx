import React from 'react';
import { BellRing, Loader2, Send, Users } from 'lucide-react';

import {
  OrganizationRole,
  type OrganizationDashboardSnapshot,
} from '../../../types';
import type { BusinessAdminFirstNotificationTarget } from '../../../hooks/businessAdmin/useFirstNotificationAction';
import { sortInstructorBacklogByLoad } from '../../../utils/businessAdminDashboard';
import WorkspaceMetricCard from '../../workspace/WorkspaceMetricCard';
import { formatDateTime } from './shared';

interface FirstNotificationNotice {
  tone: 'success' | 'error';
  message: string;
}

interface BusinessAdminInstructorsSectionProps {
  snapshot: OrganizationDashboardSnapshot;
  isLocalMockData: boolean;
  activationNotificationPending: boolean;
  firstNotificationNotice: FirstNotificationNotice | null;
  firstNotificationTarget: BusinessAdminFirstNotificationTarget | null;
  onSendFirstNotification: () => void;
}

const BusinessAdminInstructorsSection: React.FC<BusinessAdminInstructorsSectionProps> = ({
  snapshot,
  isLocalMockData,
  activationNotificationPending,
  firstNotificationNotice,
  firstNotificationTarget,
  onSendFirstNotification,
}) => {
  const instructorLoad = sortInstructorBacklogByLoad(snapshot.instructorBacklog);
  const reactivatedStudentsLabel = isLocalMockData ? '通知後再開 (参考)' : '通知後再開';
  const reactivatedStudentsDetail = isLocalMockData
    ? 'ローカル擬似データ上の参考値'
    : '72時間以内に学習再開';
  const showFirstNotificationCard = snapshot.activationState === 'SEND_FIRST_NOTIFICATION' || Boolean(firstNotificationNotice);

  return (
    <div className="space-y-6">
      {showFirstNotificationCard && (
        <section data-testid="business-admin-first-notification-card" className="rounded-[32px] border border-medace-200 bg-medace-50 p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-medace-700 shadow-sm">
                <BellRing className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">Step 4 / First notification</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">対象を確認して初回フォロー通知を送る</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700">
                  cohort、担当割当、初回ミッションが揃った生徒だけを対象にします。送信先の生徒・担当講師・ミッションを固定し、通知記録は現在の管理者として保存します。
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="business-admin-first-notification-send"
              onClick={onSendFirstNotification}
              disabled={!firstNotificationTarget || activationNotificationPending || firstNotificationNotice?.tone === 'success'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {activationNotificationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              初回通知を送る
            </button>
          </div>

          {firstNotificationTarget ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white bg-white px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">対象生徒</div>
                <div data-testid="first-notification-target-student" className="mt-2 text-sm font-black text-slate-950">
                  {firstNotificationTarget.studentName}
                </div>
                <div className="mt-1 break-all text-xs text-slate-500">{firstNotificationTarget.studentUid}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当講師</div>
                <div data-testid="first-notification-target-instructor" className="mt-2 text-sm font-black text-slate-950">
                  {firstNotificationTarget.instructorName}
                </div>
                <div className="mt-1 break-all text-xs text-slate-500">{firstNotificationTarget.instructorUid}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">初回ミッション</div>
                <div data-testid="first-notification-target-mission" className="mt-2 text-sm font-black text-slate-950">
                  {firstNotificationTarget.missionTitle}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {firstNotificationTarget.missionStatus || '未着手'} / {firstNotificationTarget.missionDueAt ? formatDateTime(firstNotificationTarget.missionDueAt) : '期限未設定'}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              担当講師と初回ミッションが揃った未通知の生徒が見つかりません。割当ビューで対象を固定してください。
            </div>
          )}

          {firstNotificationNotice && (
            <div
              data-testid="first-notification-status"
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${
                firstNotificationNotice.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {firstNotificationNotice.message}
            </div>
          )}
        </section>
      )}

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
  );
};

export default BusinessAdminInstructorsSection;
