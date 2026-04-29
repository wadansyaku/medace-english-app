import {
  BusinessAdminWorkspaceView,
  type MissionAssignment,
  type OrganizationActivationActionTarget,
  type OrganizationActivationState,
  type OrganizationActivationStep,
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
  writingAssignmentCount?: number;
  issuedWritingAssignmentCount?: number;
  instructors: OrganizationInstructorSummary[];
  students: StudentSummary[];
  missionAssignments: MissionAssignment[];
  assignmentEvents: AssignmentEvent[];
  reactivatedStudents7d: number;
  notifiedStudents7d: number;
  trend: OrganizationKpiTrendPoint[];
  now?: number;
}

const toStudentTarget = (
  organizationId: string,
  kind: OrganizationActivationActionTarget['kind'],
  targetView: BusinessAdminWorkspaceView,
  student?: StudentSummary,
  missionAssignment?: MissionAssignment,
): OrganizationActivationActionTarget => ({
  kind,
  targetView,
  organizationId,
  studentUid: student?.uid || missionAssignment?.studentUid,
  studentName: student?.name || missionAssignment?.studentName,
  instructorUid: student?.assignedInstructorUid,
  instructorName: student?.assignedInstructorName,
  missionAssignmentId: missionAssignment?.id,
  missionId: missionAssignment?.missionId || missionAssignment?.mission.id,
  missionTitle: missionAssignment?.mission.title,
  writingAssignmentId: missionAssignment?.mission.writingAssignmentId,
});

const buildActivationContract = ({
  organizationId,
  cohortCount,
  studentAssignmentCount,
  missionAssignmentCount,
  totalNotificationCount,
  writingAssignmentCount,
  issuedWritingAssignmentCount,
  students,
  missionAssignments,
}: {
  organizationId: string;
  cohortCount: number;
  studentAssignmentCount: number;
  missionAssignmentCount: number;
  totalNotificationCount: number;
  writingAssignmentCount: number;
  issuedWritingAssignmentCount: number;
  students: StudentSummary[];
  missionAssignments: MissionAssignment[];
}): {
  activationState: OrganizationActivationState;
  nextRequiredActionLabel: string;
  nextRequiredActionDescription: string;
  activationSteps: OrganizationActivationStep[];
  nextRequiredActionTarget: OrganizationActivationActionTarget | null;
} => {
  const assignedStudents = students.filter((student) => student.assignedInstructorUid);
  const unassignedStudents = students.filter((student) => !student.assignedInstructorUid);
  const unassignedAtRiskStudent = unassignedStudents.find((student) => student.riskLevel !== StudentRiskLevel.SAFE);
  const assignmentTargetStudent = unassignedAtRiskStudent || unassignedStudents[0] || students[0];
  const missionTargetStudent = assignedStudents.find((student) => student.riskLevel !== StudentRiskLevel.SAFE)
    || assignedStudents[0]
    || students[0];
  const assignedStudentMission = missionAssignments.find((assignment) => {
    const student = students.find((candidate) => candidate.uid === assignment.studentUid);
    return Boolean(student?.assignedInstructorUid);
  });
  const notificationTargetMission = assignedStudentMission;
  const notificationTargetStudent = notificationTargetMission
    ? students.find((student) => student.uid === notificationTargetMission.studentUid)
    : missionTargetStudent;
  const writingTargetMission = missionAssignments.find((assignment) => {
    if (!assignment.mission.writingAssignmentId) {
      return false;
    }
    const student = students.find((candidate) => candidate.uid === assignment.studentUid);
    return Boolean(student?.assignedInstructorUid);
  })
    || notificationTargetMission;
  const writingTargetStudent = writingTargetMission
    ? students.find((student) => student.uid === writingTargetMission.studentUid)
    : notificationTargetStudent || missionTargetStudent;
  const hasAssignedStudent = studentAssignmentCount > 0 && assignedStudents.length > 0;
  const hasMissionAssignment = Boolean(assignedStudentMission);
  const hasNotification = totalNotificationCount > 0;
  const hasIssuedWritingAssignment = issuedWritingAssignmentCount > 0;

  const steps: OrganizationActivationStep[] = [
    {
      id: 'CREATE_COHORT',
      label: 'cohort を1つ作成する',
      description: 'まずは学年・クラス・講座のどれかで1つだけ cohort を作ると、その後の割当と配布が迷いません。',
      done: cohortCount > 0,
      target: {
        kind: 'ORGANIZATION_SETTINGS',
        targetView: BusinessAdminWorkspaceView.SETTINGS,
        organizationId,
      },
    },
    {
      id: 'ASSIGN_STUDENTS',
      label: '最初の生徒担当を決める',
      description: '最初は at-risk 生徒か直近で止まっている生徒を1人だけ担当講師に割り当ててください。',
      done: hasAssignedStudent,
      target: toStudentTarget(
        organizationId,
        'STUDENT_ASSIGNMENT',
        BusinessAdminWorkspaceView.ASSIGNMENTS,
        assignmentTargetStudent,
      ),
    },
    {
      id: 'CREATE_FIRST_MISSION',
      label: '初回ミッションを配布する',
      description: '最初の1週間分だけで十分です。新出語と復習語を少なく固定して配布してください。',
      done: hasMissionAssignment,
      target: toStudentTarget(
        organizationId,
        'MISSION_ASSIGNMENT',
        BusinessAdminWorkspaceView.ASSIGNMENTS,
        missionTargetStudent,
      ),
    },
    {
      id: 'SEND_FIRST_NOTIFICATION',
      label: '最初のフォロー通知を送る',
      description: '担当講師から最初の一言を送ると、運用導線が実データで回り始めます。',
      done: hasNotification,
      target: toStudentTarget(
        organizationId,
        'INSTRUCTOR_NOTIFICATION',
        BusinessAdminWorkspaceView.ASSIGNMENTS,
        notificationTargetStudent,
        notificationTargetMission,
      ),
    },
    {
      id: 'ISSUE_FIRST_WRITING_ASSIGNMENT',
      label: '初回作文を配布する',
      description: writingAssignmentCount > 0
        ? '作文の下書きがあります。最初の1件を生徒へ配布して提出・返却導線を確認してください。'
        : '最初の自由英作文を1件配布すると、提出から返却までの運用確認ができます。',
      done: hasIssuedWritingAssignment,
      target: toStudentTarget(
        organizationId,
        'WRITING_ASSIGNMENT',
        BusinessAdminWorkspaceView.WRITING,
        writingTargetStudent,
        writingTargetMission,
      ),
    },
  ];
  const nextStep = steps.find((step) => !step.done) || null;

  return {
    activationState: nextStep?.id as OrganizationActivationState || 'ACTIVE',
    nextRequiredActionLabel: nextStep?.label || '導入完了',
    nextRequiredActionDescription: nextStep?.description || '基本の導入導線は完了しています。次は継続率と再開率を見ながら運用を整えます。',
    activationSteps: steps,
    nextRequiredActionTarget: nextStep?.target || null,
  };
};

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
  writingAssignmentCount = 0,
  issuedWritingAssignmentCount = 0,
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
  const activationContract = buildActivationContract({
    organizationId,
    cohortCount,
    studentAssignmentCount,
    missionAssignmentCount,
    totalNotificationCount,
    writingAssignmentCount,
    issuedWritingAssignmentCount,
    students,
    missionAssignments,
  });

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
    activationState: activationContract.activationState,
    nextRequiredAction: activationContract.activationState,
    nextRequiredActionLabel: activationContract.nextRequiredActionLabel,
    nextRequiredActionDescription: activationContract.nextRequiredActionDescription,
    activationSteps: activationContract.activationSteps,
    nextRequiredActionTarget: activationContract.nextRequiredActionTarget,
  };
};
