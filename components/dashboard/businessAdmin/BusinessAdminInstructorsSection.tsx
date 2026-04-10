import React from 'react';
import { Users } from 'lucide-react';

import {
  OrganizationRole,
  type OrganizationDashboardSnapshot,
} from '../../../types';
import { sortInstructorBacklogByLoad } from '../../../utils/businessAdminDashboard';
import WorkspaceMetricCard from '../../workspace/WorkspaceMetricCard';

interface BusinessAdminInstructorsSectionProps {
  snapshot: OrganizationDashboardSnapshot;
  isLocalMockData: boolean;
}

const BusinessAdminInstructorsSection: React.FC<BusinessAdminInstructorsSectionProps> = ({
  snapshot,
  isLocalMockData,
}) => {
  const instructorLoad = sortInstructorBacklogByLoad(snapshot.instructorBacklog);
  const reactivatedStudentsLabel = isLocalMockData ? '通知後再開 (参考)' : '通知後再開';
  const reactivatedStudentsDetail = isLocalMockData
    ? 'ローカル擬似データ上の参考値'
    : '72時間以内に学習再開';

  return (
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
  );
};

export default BusinessAdminInstructorsSection;
