import {
  type MissionAssignment,
  StudentRiskLevel,
  SubscriptionPlan,
  WeeklyMissionStatus,
} from '../../types';
import type {
  AssignmentEvent,
  OrganizationDashboardSnapshot,
  OrganizationInstructorBacklogSummary,
  OrganizationInstructorSummary,
  OrganizationKpiTrendPoint,
  StudentSummary,
} from '../../types';
import { FOLLOW_UP_WINDOW_MS } from '../../shared/retention';
import {
  buildMissionTrackCompletion,
  buildMissionWritingReturnRateByTrack,
  calculateMissionOverdueRecoveryRate,
  calculateMissionStartedRate,
} from '../../shared/missions';

const DAY_MS = 86400000;

interface BuildOrganizationDashboardSnapshotInput {
  organizationId: string;
  organizationName: string;
  subscriptionPlan: SubscriptionPlan;
  totalMembers: number;
  totalInstructors: number;
  learningPlanCount: number;
  notifications7d: number;
  instructors: OrganizationInstructorSummary[];
  students: StudentSummary[];
  missionAssignments: MissionAssignment[];
  assignmentEvents: AssignmentEvent[];
  reactivatedStudents7d: number;
  notifiedStudents7d: number;
  trend: OrganizationKpiTrendPoint[];
  now?: number;
}

export const buildOrganizationDashboardSnapshot = ({
  organizationId,
  organizationName,
  subscriptionPlan,
  totalMembers,
  totalInstructors,
  learningPlanCount,
  notifications7d,
  instructors,
  students,
  missionAssignments,
  assignmentEvents,
  reactivatedStudents7d,
  notifiedStudents7d,
  trend,
  now = Date.now(),
}: BuildOrganizationDashboardSnapshotInput): OrganizationDashboardSnapshot => {
  const roundPercentage = (value: number, total: number): number => (
    total > 0 ? Math.round((value / total) * 100) : 0
  );
  const assignedStudents = students.filter((student) => student.assignedInstructorUid).length;
  const activeStudents7d = students.filter((student) => student.lastActive && now - student.lastActive < 7 * DAY_MS).length;
  const atRiskStudents = students.filter((student) => student.riskLevel !== StudentRiskLevel.SAFE);
  const weeklyContinuityStudents = students.filter((student) => (student.activeStudyDays7d || 0) >= 4).length;
  const followedUpAtRiskStudents = atRiskStudents.filter((student) => (
    Boolean(student.latestInterventionAt) && now - Number(student.latestInterventionAt || 0) <= FOLLOW_UP_WINDOW_MS
  )).length;
  const interventionBacklog = students.filter((student) => student.needsFollowUpNow);
  const overdueMissionCount = missionAssignments.filter((assignment) => assignment.progress.status === WeeklyMissionStatus.OVERDUE).length;
  const trackCompletion = buildMissionTrackCompletion(missionAssignments);
  const writingReturnRateByTrack = buildMissionWritingReturnRateByTrack(missionAssignments);
  const missionStartedRate = calculateMissionStartedRate(missionAssignments);
  const overdueMissionRecoveryRate = calculateMissionOverdueRecoveryRate(missionAssignments, now);
  const instructorBacklog: OrganizationInstructorBacklogSummary[] = instructors
    .map((instructor) => {
      const assigned = students.filter((student) => student.assignedInstructorUid === instructor.uid);
      const immediateCount = assigned.filter((student) => student.needsFollowUpNow).length;
      const waitingCount = assigned.filter((student) => (
        !student.needsFollowUpNow && student.latestInterventionOutcome === 'PENDING'
      )).length;
      const reactivatedCount = assigned.filter((student) => student.latestInterventionOutcome === 'REACTIVATED').length;

      return {
        uid: instructor.uid,
        displayName: instructor.displayName,
        email: instructor.email,
        organizationRole: instructor.organizationRole,
        assignedStudentCount: instructor.assignedStudentCount,
        immediateCount,
        waitingCount,
        reactivatedCount,
        backlogCount: immediateCount + waitingCount,
      };
    })
    .sort((left, right) => (
      right.immediateCount - left.immediateCount
      || right.backlogCount - left.backlogCount
      || right.assignedStudentCount - left.assignedStudentCount
      || left.displayName.localeCompare(right.displayName, 'ja')
    ));
  const atRiskStudentList = [...atRiskStudents]
    .sort((left, right) => (
      Number(Boolean(right.missionOverdue)) - Number(Boolean(left.missionOverdue))
      || Number(Boolean(right.primaryMissionStatus === WeeklyMissionStatus.ASSIGNED)) - Number(Boolean(left.primaryMissionStatus === WeeklyMissionStatus.ASSIGNED))
      || Number(Boolean(right.needsFollowUpNow)) - Number(Boolean(left.needsFollowUpNow))
      || Number(Boolean(right.latestInterventionOutcome === 'EXPIRED')) - Number(Boolean(left.latestInterventionOutcome === 'EXPIRED'))
      || left.lastActive - right.lastActive
    ))
    .slice(0, 8);
  const studentAssignments = [...students].sort((left, right) => (
    Number(Boolean(right.missionOverdue)) - Number(Boolean(left.missionOverdue))
    || Number(Boolean(right.needsFollowUpNow)) - Number(Boolean(left.needsFollowUpNow))
    || Number(Boolean(right.primaryMissionStatus === WeeklyMissionStatus.ASSIGNED)) - Number(Boolean(left.primaryMissionStatus === WeeklyMissionStatus.ASSIGNED))
    || Number(Boolean(!right.assignedInstructorUid)) - Number(Boolean(!left.assignedInstructorUid))
    || left.name.localeCompare(right.name)
  ));

  return {
    organizationId,
    organizationName,
    subscriptionPlan,
    totalMembers,
    totalStudents: students.length,
    totalInstructors,
    activeStudents7d,
    atRiskStudents: atRiskStudents.length,
    learningPlanCount,
    notifications7d,
    reactivatedStudents7d,
    reactivationRate7d: notifiedStudents7d > 0
      ? Math.round((reactivatedStudents7d / notifiedStudents7d) * 100)
      : 0,
    weeklyContinuityRate: roundPercentage(weeklyContinuityStudents, students.length),
    followUpCoverageRate48h: roundPercentage(followedUpAtRiskStudents, atRiskStudents.length),
    interventionBacklogCount: interventionBacklog.length,
    overdueMissionCount,
    missionStartedRate,
    overdueMissionRecoveryRate,
    assignmentCoverageRate: roundPercentage(assignedStudents, students.length),
    planCoverageRate: roundPercentage(learningPlanCount, students.length),
    unassignedStudents: students.filter((student) => !student.assignedInstructorUid).length,
    unassignedAtRiskCount: atRiskStudents.filter((student) => !student.assignedInstructorUid).length,
    trackCompletion,
    writingReturnRateByTrack,
    instructors,
    instructorBacklog,
    atRiskStudentList,
    studentAssignments,
    assignmentEvents,
    trend,
  };
};
