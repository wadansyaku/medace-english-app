import { rebuildOrganizationKpiSnapshots } from '../organization-kpi';
import { touchWeeklyMissionProgressFromWriting } from '../storage-mission-actions';
import { toTokyoDateKey } from '../storage-support';
import type { AppEnv } from '../types';

interface SyncWritingActivityParams {
  studentUid: string;
  writingAssignmentId: string;
  organizationId?: string | null;
  activityAt: number;
}

export const syncWritingActivitySideEffects = async (
  env: AppEnv,
  params: SyncWritingActivityParams,
): Promise<void> => {
  await touchWeeklyMissionProgressFromWriting(env, {
    studentUid: params.studentUid,
    writingAssignmentId: params.writingAssignmentId,
    activityAt: params.activityAt,
  });

  if (!params.organizationId) {
    return;
  }

  await rebuildOrganizationKpiSnapshots(env, params.organizationId, {
    dateKeys: [toTokyoDateKey(params.activityAt)],
  });
};
