import {
  type MissionAssignment,
  type OrganizationActivationState,
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
  cohortCount: number;
  studentAssignmentCount: number;
  missionAssignmentCount: number;
  notifications7d: number;
  totalNotificationCount: number;
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
  cohortCount,
  studentAssignmentCount,
  missionAssignmentCount,
  notifications7d,
  totalNotificationCount,
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
  let activationState: OrganizationActivationState = 'ACTIVE';
  let nextRequiredActionLabel = '導入完了';
  let nextRequiredActionDescription = '基本の導入導線は完了しています。次は継続率と再開率を見ながら運用を整えます。';

  if (cohortCount === 0) {
    activationState = 'CREATE_COHORT';
    nextRequiredActionLabel = 'cohort を1つ作成する';
    nextRequiredActionDescription = 'まずは学年・クラス・講座のどれかで1つだけ cohort を作ると、その後の割当と配布が迷いません。';
  } else if (studentAssignmentCount === 0 || assignedStudents === 0) {
    activationState = 'ASSIGN_STUDENTS';
    nextRequiredActionLabel = '最初の生徒担当を決める';
    nextRequiredActionDescription = '最初は at-risk 生徒か直近で止まっている生徒を1人だけ担当講師に割り当ててください。';
  } else if (missionAssignmentCount === 0) {
    activationState = 'CREATE_FIRST_MISSION';
    nextRequiredActionLabel = '初回ミッションを配布する';
    nextRequiredActionDescription = '最初の1週間分だけで十分です。新出語と復習語を少なく固定して配布してください。';
  } else if (totalNotificationCount === 0) {
    activationState = 'SEND_FIRST_NOTIFICATION';
    nextRequiredActionLabel = '最初のフォロー通知を送る';
    nextRequiredActionDescription = '担当講師から最初の一言を送ると、運用導線が実データで回り始めます。';
  }

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
    activationState,
    nextRequiredAction: activationState,
    nextRequiredActionLabel,
    nextRequiredActionDescription,
  };
};
