import {
  InterventionKind,
  InterventionOutcome,
  RecommendedActionType,
  RetentionContinuityBand,
  StudentRiskLevel,
  type StudentSummary,
} from '../types';

export const FOLLOW_UP_WINDOW_MS = 48 * 60 * 60 * 1000;
export const REACTIVATION_WINDOW_MS = 72 * 60 * 60 * 1000;

export type InstructorQueueSegment = 'IMMEDIATE' | 'WAITING' | 'REACTIVATED';

export const getContinuityBand = (activeStudyDays7d: number): RetentionContinuityBand => {
  if (activeStudyDays7d >= 4) return RetentionContinuityBand.STEADY;
  if (activeStudyDays7d >= 2) return RetentionContinuityBand.BUILDING;
  return RetentionContinuityBand.LOW;
};

export const resolveInterventionOutcome = ({
  latestInterventionAt,
  lastReactivatedAt,
  now = Date.now(),
}: {
  latestInterventionAt?: number;
  lastReactivatedAt?: number;
  now?: number;
}): InterventionOutcome | undefined => {
  if (!latestInterventionAt) return undefined;
  if (
    lastReactivatedAt
    && lastReactivatedAt >= latestInterventionAt
    && lastReactivatedAt <= latestInterventionAt + REACTIVATION_WINDOW_MS
  ) {
    return InterventionOutcome.REACTIVATED;
  }
  if (now - latestInterventionAt > REACTIVATION_WINDOW_MS) {
    return InterventionOutcome.EXPIRED;
  }
  return InterventionOutcome.PENDING;
};

export const resolveRecommendedActionType = ({
  interventionKind,
  hasLearningPlan,
}: {
  interventionKind?: InterventionKind;
  hasLearningPlan?: boolean;
}): RecommendedActionType => {
  if (interventionKind === InterventionKind.PLAN_NUDGE && hasLearningPlan) {
    return RecommendedActionType.OPEN_PLAN;
  }
  if (interventionKind === InterventionKind.REVIEW_RESTART) {
    return RecommendedActionType.START_REVIEW;
  }
  return hasLearningPlan ? RecommendedActionType.OPEN_PLAN : RecommendedActionType.START_REVIEW;
};

export const resolveNeedsFollowUpNow = ({
  riskLevel,
  latestInterventionAt,
  latestInterventionOutcome,
  missionOverdue = false,
  now = Date.now(),
}: {
  riskLevel: StudentRiskLevel;
  latestInterventionAt?: number;
  latestInterventionOutcome?: InterventionOutcome;
  missionOverdue?: boolean;
  now?: number;
}): boolean => {
  if (missionOverdue) return true;
  if (riskLevel === StudentRiskLevel.SAFE) return false;
  if (latestInterventionOutcome === InterventionOutcome.REACTIVATED) return false;
  if (!latestInterventionAt) return true;
  if (latestInterventionOutcome === InterventionOutcome.EXPIRED) return true;
  return now - latestInterventionAt > FOLLOW_UP_WINDOW_MS;
};

export const getInstructorQueueSegment = (
  student: Pick<
    StudentSummary,
    | 'riskLevel'
    | 'latestInterventionAt'
    | 'latestInterventionOutcome'
    | 'needsFollowUpNow'
    | 'primaryMissionStatus'
    | 'missionOverdue'
    | 'missionDueAt'
  >,
  now = Date.now(),
): InstructorQueueSegment => {
  const missionOverdue = Boolean(student.missionOverdue || student.primaryMissionStatus === 'OVERDUE');
  const missionUnstarted = student.primaryMissionStatus === 'ASSIGNED';
  if (missionOverdue) {
    return 'IMMEDIATE';
  }
  if (student.latestInterventionOutcome === InterventionOutcome.REACTIVATED) {
    return missionUnstarted ? 'WAITING' : 'REACTIVATED';
  }
  if (
    student.needsFollowUpNow
    || (
      student.riskLevel !== StudentRiskLevel.SAFE
      && (!student.latestInterventionAt || now - student.latestInterventionAt > FOLLOW_UP_WINDOW_MS)
    )
  ) {
    return 'IMMEDIATE';
  }
  if (missionUnstarted) {
    return 'WAITING';
  }
  return 'WAITING';
};
