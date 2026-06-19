import type {
  AdminActivationFunnel,
  AdminActivationFunnelGap,
  AdminActivationFunnelStep,
  AdminActivationFunnelStepId,
  ProductKpiDailySnapshot,
} from '../types';

const calculateRatio = (numerator: number, denominator: number): number => (
  denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
);

const boundedRatio = (numerator: number, denominator: number): number => (
  calculateRatio(Math.min(Math.max(0, numerator), Math.max(0, denominator)), denominator)
);

const getFunnelGapSeverity = (
  dropOffRate: number,
  dropOffCount: number,
): AdminActivationFunnelGap['severity'] => {
  if (dropOffCount <= 0) return 'ok';
  if (dropOffRate >= 50) return 'blocked';
  return 'watch';
};

const buildFunnelStep = (
  id: AdminActivationFunnelStepId,
  label: string,
  count: number,
  baseCount: number,
): AdminActivationFunnelStep => {
  const safeCount = Math.max(0, count);
  const safeBase = Math.max(0, baseCount);
  const dropOffCount = Math.max(0, safeBase - safeCount);

  return {
    id,
    label,
    count: safeCount,
    baseCount: safeBase,
    conversionRate: id === 'organization' ? boundedRatio(safeCount, safeCount) : boundedRatio(safeCount, safeBase),
    dropOffCount,
    dropOffRate: boundedRatio(dropOffCount, safeBase),
  };
};

const buildFunnelGap = (
  from: AdminActivationFunnelStep,
  to: AdminActivationFunnelStep,
): AdminActivationFunnelGap => ({
  fromStepId: from.id,
  toStepId: to.id,
  label: `${from.label} -> ${to.label}`,
  dropOffCount: to.dropOffCount,
  dropOffRate: to.dropOffRate,
  severity: getFunnelGapSeverity(to.dropOffRate, to.dropOffCount),
});

const resolveWeakestGap = (gaps: AdminActivationFunnelGap[]): AdminActivationFunnelGap | null => (
  [...gaps]
    .filter((gap) => gap.dropOffCount > 0)
    .sort((left, right) => (
      right.dropOffRate - left.dropOffRate
      || right.dropOffCount - left.dropOffCount
      || gaps.indexOf(left) - gaps.indexOf(right)
    ))[0] || null
);

export const buildActivationFunnel = (snapshot: ProductKpiDailySnapshot): AdminActivationFunnel => {
  const steps: AdminActivationFunnelStep[] = [
    buildFunnelStep('organization', '対象組織', snapshot.totalOrganizations, snapshot.totalOrganizations),
    buildFunnelStep('cohort', 'クラス作成', snapshot.organizationsWithCohortCount, snapshot.totalOrganizations),
    buildFunnelStep('assignment', '担当割当', snapshot.organizationsWithAssignmentCount, snapshot.organizationsWithCohortCount),
    buildFunnelStep('mission', 'ミッション配布', snapshot.organizationsWithMissionCount, snapshot.organizationsWithAssignmentCount),
    buildFunnelStep('notification', '初回通知', snapshot.organizationsWithNotificationCount, snapshot.organizationsWithMissionCount),
    buildFunnelStep('writing', '作文配布', snapshot.organizationsWithWritingAssignmentCount, snapshot.organizationsWithNotificationCount),
  ];
  const gaps = steps.slice(1).map((step, index) => buildFunnelGap(steps[index], step));

  return {
    totalOrganizations: snapshot.totalOrganizations,
    organizationsWithCohortCount: snapshot.organizationsWithCohortCount,
    organizationsWithAssignmentCount: snapshot.organizationsWithAssignmentCount,
    organizationsWithMissionCount: snapshot.organizationsWithMissionCount,
    organizationsWithNotificationCount: snapshot.organizationsWithNotificationCount,
    organizationsWithWritingAssignmentCount: snapshot.organizationsWithWritingAssignmentCount,
    activationVelocity30d: {
      organizationsCreatedCohort: snapshot.organizationsCreatedCohort30d,
      organizationsAssignedStudent: snapshot.organizationsAssignedStudent30d,
      organizationsCreatedFirstMission: snapshot.organizationsCreatedFirstMission30d,
      organizationsSentNotification: snapshot.organizationsSentNotification30d,
      organizationsWithWritingAssignment: snapshot.organizationsWithWritingAssignment30d,
      organizationsWithWritingSubmission: snapshot.organizationsWithWritingSubmission30d,
      organizationsWithWritingReview: snapshot.organizationsWithWritingReview30d,
    },
    writingAssignmentsCreated30d: snapshot.writingAssignmentsCreated30d,
    writingSubmissionsReceived30d: snapshot.writingSubmissionsReceived30d,
    writingReviewsCompleted30d: snapshot.writingReviewsCompleted30d,
    commercialFormOpenCount30d: snapshot.commercialFormOpenCount30d,
    commercialRequestCount30d: snapshot.commercialRequestCount30d,
    completionRate: boundedRatio(snapshot.organizationsWithWritingAssignmentCount, snapshot.totalOrganizations),
    weakestGap: resolveWeakestGap(gaps),
    steps,
    gaps,
  };
};
