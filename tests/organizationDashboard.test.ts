import { describe, expect, it } from 'vitest';

import { buildOrganizationActivationRunbook } from '../functions/_shared/organization-activation-runbook';
import { buildOrganizationDashboardSnapshot } from '../functions/_shared/organization-dashboard';
import {
  BusinessAdminWorkspaceView,
  InterventionOutcome,
  LearningTrack,
  MissionNextActionType,
  OrganizationRole,
  StudentRiskLevel,
  SubscriptionPlan,
  WeeklyMissionStatus,
  type MissionAssignment,
  type AssignmentEvent,
  type OrganizationInstructorSummary,
  type OrganizationActivationStep,
  type StudentSummary,
} from '../types';

const instructors: OrganizationInstructorSummary[] = [
  {
    uid: 'inst-1',
    displayName: 'Oak 先生',
    email: 'oak@example.com',
    organizationRole: OrganizationRole.INSTRUCTOR,
    notifiedStudentCount: 2,
    notifications7d: 3,
    assignedStudentCount: 2,
  },
];

const students: StudentSummary[] = [
  {
    uid: 'student-a',
    name: 'Alpha',
    email: 'alpha@example.com',
    totalLearned: 20,
    totalAttempts: 30,
    lastActive: 1_000_000,
    riskLevel: StudentRiskLevel.DANGER,
    assignedInstructorUid: 'inst-1',
    assignedInstructorName: 'Oak 先生',
    activeStudyDays7d: 2,
    latestInterventionAt: 1_100_000,
    latestInterventionOutcome: InterventionOutcome.EXPIRED,
    needsFollowUpNow: true,
  },
  {
    uid: 'student-b',
    name: 'Beta',
    email: 'beta@example.com',
    totalLearned: 12,
    totalAttempts: 20,
    lastActive: 100_000,
    riskLevel: StudentRiskLevel.WARNING,
    activeStudyDays7d: 1,
    needsFollowUpNow: true,
  },
  {
    uid: 'student-c',
    name: 'Gamma',
    email: 'gamma@example.com',
    totalLearned: 42,
    totalAttempts: 55,
    lastActive: 1_200_000,
    riskLevel: StudentRiskLevel.SAFE,
    assignedInstructorUid: 'inst-1',
    assignedInstructorName: 'Oak 先生',
    activeStudyDays7d: 5,
    latestInterventionOutcome: InterventionOutcome.REACTIVATED,
  },
  {
    uid: 'student-d',
    name: 'Delta',
    email: 'delta@example.com',
    totalLearned: 18,
    totalAttempts: 24,
    lastActive: 1_400_000,
    riskLevel: StudentRiskLevel.WARNING,
    assignedInstructorUid: 'inst-1',
    assignedInstructorName: 'Oak 先生',
    activeStudyDays7d: 4,
    latestInterventionAt: 1_900_000,
    latestInterventionOutcome: InterventionOutcome.PENDING,
  },
];

const assignmentEvents: AssignmentEvent[] = [
  {
    id: 1,
    studentUid: 'student-a',
    studentName: 'Alpha',
    nextInstructorUid: 'inst-1',
    nextInstructorName: 'Oak 先生',
    changedByUid: 'admin-1',
    changedByName: 'Manager',
    createdAt: 1_300_000,
  },
];

const missionAssignments: MissionAssignment[] = [
  {
    id: 'mission-a',
    missionId: 'mission-a',
    studentUid: 'student-a',
    studentName: 'Alpha',
    assignedByUid: 'admin-1',
    assignedByName: 'Manager',
    assignedAt: 1_250_000,
    mission: {
      id: 'mission-a',
      organizationId: 'org_demo_academy',
      createdByUid: 'admin-1',
      learningTrack: LearningTrack.EIKEN_2,
      title: 'Alpha Mission',
      rationale: 'Focus',
      newWordsTarget: 20,
      reviewWordsTarget: 12,
      quizTargetCount: 1,
      dueAt: 1_900_000,
      status: WeeklyMissionStatus.OVERDUE,
      createdAt: 1_200_000,
      updatedAt: 1_900_000,
    },
    progress: {
      newWordsCompleted: 8,
      newWordsTarget: 20,
      reviewWordsCompleted: 3,
      reviewWordsTarget: 12,
      quizCompletedCount: 0,
      quizTargetCount: 1,
      writingRequired: false,
      writingCompleted: false,
      completionRate: 31,
      overdue: true,
      status: WeeklyMissionStatus.OVERDUE,
      nextActionType: MissionNextActionType.OPEN_STUDY,
      nextActionLabel: 'ミッションを再開',
      blockers: ['新出 12語'],
    },
  },
  {
    id: 'mission-c',
    missionId: 'mission-c',
    studentUid: 'student-c',
    studentName: 'Gamma',
    assignedByUid: 'admin-1',
    assignedByName: 'Manager',
    assignedAt: 1_260_000,
    mission: {
      id: 'mission-c',
      organizationId: 'org_demo_academy',
      createdByUid: 'admin-1',
      learningTrack: LearningTrack.COMMON_TEST,
      title: 'Gamma Mission',
      rationale: 'Focus',
      newWordsTarget: 20,
      reviewWordsTarget: 12,
      quizTargetCount: 1,
      dueAt: 2_100_000,
      status: WeeklyMissionStatus.COMPLETED,
      createdAt: 1_200_000,
      updatedAt: 2_000_000,
    },
    progress: {
      startedAt: 1_300_000,
      lastActivityAt: 1_900_000,
      completedAt: 2_000_000,
      newWordsCompleted: 20,
      newWordsTarget: 20,
      reviewWordsCompleted: 12,
      reviewWordsTarget: 12,
      quizCompletedCount: 1,
      quizTargetCount: 1,
      writingRequired: false,
      writingCompleted: false,
      completionRate: 100,
      overdue: false,
      status: WeeklyMissionStatus.COMPLETED,
      nextActionType: MissionNextActionType.OPEN_STUDY,
      nextActionLabel: '今週のミッション達成',
      blockers: [],
    },
  },
];

describe('buildOrganizationDashboardSnapshot', () => {
  it('calculates rates and sorts the queue from full student data, not the truncated list', () => {
    const snapshot = buildOrganizationDashboardSnapshot({
      organizationId: 'org_demo_academy',
      organizationName: 'Steady Study Demo Academy',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      totalMembers: 5,
      totalInstructors: 1,
      learningPlanCount: 2,
      cohortCount: 1,
      studentAssignmentCount: 3,
      missionAssignmentCount: 2,
      notifications7d: 4,
      totalNotificationCount: 2,
      writingAssignmentCount: 1,
      issuedWritingAssignmentCount: 1,
      instructors,
      students,
      missionAssignments,
      assignmentEvents,
      reactivatedStudents7d: 2,
      notifiedStudents7d: 4,
      trend: [],
      now: 2_000_000,
    });

    expect(snapshot.totalStudents).toBe(4);
    expect(snapshot.activeStudents7d).toBe(4);
    expect(snapshot.atRiskStudents).toBe(3);
    expect(snapshot.assignmentCoverageRate).toBe(75);
    expect(snapshot.unassignedStudents).toBe(1);
    expect(snapshot.reactivationRate7d).toBe(50);
    expect(snapshot.planCoverageRate).toBe(50);
    expect(snapshot.weeklyContinuityRate).toBe(50);
    expect(snapshot.followUpCoverageRate48h).toBe(67);
    expect(snapshot.interventionBacklogCount).toBe(2);
    expect(snapshot.overdueMissionCount).toBe(1);
    expect(snapshot.missionStartedRate).toBe(100);
    expect(snapshot.overdueMissionRecoveryRate).toBe(0);
    expect(snapshot.unassignedAtRiskCount).toBe(1);
    expect(snapshot.trackCompletion.find((track) => track.track === LearningTrack.EIKEN_2)?.overdueCount).toBe(1);
    expect(snapshot.studentAssignments.map((student) => student.name)).toEqual(['Beta', 'Alpha', 'Delta', 'Gamma']);
    expect(snapshot.atRiskStudentList.map((student) => student.name)).toEqual(['Alpha', 'Beta', 'Delta']);
    expect(snapshot.activationState).toBe('ACTIVE');
    expect(snapshot.nextRequiredAction).toBe('ACTIVE');
    expect(snapshot.nextRequiredActionTarget).toBeNull();
    expect(snapshot.activationSteps.map((step) => [step.id, step.done])).toEqual([
      ['CREATE_COHORT', true],
      ['ASSIGN_STUDENTS', true],
      ['CREATE_FIRST_MISSION', true],
      ['SEND_FIRST_NOTIFICATION', true],
      ['ISSUE_FIRST_WRITING_ASSIGNMENT', true],
    ]);
    expect(snapshot.instructorBacklog[0]).toMatchObject({
      immediateCount: 1,
      waitingCount: 1,
      reactivatedCount: 1,
      backlogCount: 2,
    });
    expect(snapshot.assignmentEvents).toHaveLength(1);
  });

  it('selects exactly one next required activation action in priority order', () => {
    const snapshot = buildOrganizationDashboardSnapshot({
      organizationId: 'org_demo_academy',
      organizationName: 'Steady Study Demo Academy',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      totalMembers: 2,
      totalInstructors: 1,
      learningPlanCount: 0,
      cohortCount: 0,
      studentAssignmentCount: 0,
      missionAssignmentCount: 0,
      notifications7d: 0,
      totalNotificationCount: 0,
      instructors,
      students: students.slice(0, 1).map((student) => ({ ...student, assignedInstructorUid: undefined, assignedInstructorName: undefined })),
      missionAssignments: [],
      assignmentEvents: [],
      reactivatedStudents7d: 0,
      notifiedStudents7d: 0,
      trend: [],
      now: 2_000_000,
    });

    expect(snapshot.activationState).toBe('CREATE_COHORT');
    expect(snapshot.nextRequiredAction).toBe('CREATE_COHORT');
    expect(snapshot.nextRequiredActionLabel).toContain('クラス');
    expect(snapshot.activationSteps.find((step) => step.id === 'CREATE_COHORT')).toMatchObject({
      done: false,
      target: {
        kind: 'ORGANIZATION_SETTINGS',
      },
    });
  });

  it('keeps notification and Writing targets in the server activation contract', () => {
    const notificationSnapshot = buildOrganizationDashboardSnapshot({
      organizationId: 'org_demo_academy',
      organizationName: 'Steady Study Demo Academy',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      totalMembers: 5,
      totalInstructors: 1,
      learningPlanCount: 2,
      cohortCount: 1,
      studentAssignmentCount: 3,
      missionAssignmentCount: 2,
      notifications7d: 0,
      totalNotificationCount: 0,
      writingAssignmentCount: 0,
      issuedWritingAssignmentCount: 0,
      instructors,
      students,
      missionAssignments,
      assignmentEvents,
      reactivatedStudents7d: 0,
      notifiedStudents7d: 0,
      trend: [],
      now: 2_000_000,
    });

    expect(notificationSnapshot.activationState).toBe('SEND_FIRST_NOTIFICATION');
    expect(notificationSnapshot.nextRequiredActionTarget).toMatchObject({
      kind: 'INSTRUCTOR_NOTIFICATION',
      targetView: 'ASSIGNMENTS',
      organizationId: 'org_demo_academy',
      studentUid: 'student-a',
      instructorUid: 'inst-1',
      missionId: 'mission-a',
      missionTitle: 'Alpha Mission',
    });

    const writingSnapshot = buildOrganizationDashboardSnapshot({
      organizationId: 'org_demo_academy',
      organizationName: 'Steady Study Demo Academy',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      totalMembers: 5,
      totalInstructors: 1,
      learningPlanCount: 2,
      cohortCount: 1,
      studentAssignmentCount: 3,
      missionAssignmentCount: 2,
      notifications7d: 1,
      totalNotificationCount: 1,
      writingAssignmentCount: 0,
      issuedWritingAssignmentCount: 0,
      instructors,
      students,
      missionAssignments,
      assignmentEvents,
      reactivatedStudents7d: 0,
      notifiedStudents7d: 0,
      trend: [],
      now: 2_000_000,
    });

    expect(writingSnapshot.activationState).toBe('ISSUE_FIRST_WRITING_ASSIGNMENT');
    expect(writingSnapshot.nextRequiredActionTarget).toMatchObject({
      kind: 'WRITING_ASSIGNMENT',
      targetView: 'WRITING',
      studentUid: 'student-a',
      missionId: 'mission-a',
    });
    expect(writingSnapshot.activationSteps.find((step) => step.id === 'ISSUE_FIRST_WRITING_ASSIGNMENT')).toMatchObject({
      done: false,
      label: '初回作文を配布する',
    });
  });

  it('does not advance to notification when missions are not assigned to instructor-owned students', () => {
    const unownedMission: MissionAssignment = {
      ...missionAssignments[0],
      id: 'mission-unowned',
      missionId: 'mission-unowned',
      studentUid: 'student-b',
      studentName: 'Beta',
      mission: {
        ...missionAssignments[0].mission,
        id: 'mission-unowned',
        title: 'Unowned Mission',
      },
    };

    const snapshot = buildOrganizationDashboardSnapshot({
      organizationId: 'org_demo_academy',
      organizationName: 'Steady Study Demo Academy',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      totalMembers: 5,
      totalInstructors: 1,
      learningPlanCount: 2,
      cohortCount: 1,
      studentAssignmentCount: 3,
      missionAssignmentCount: 1,
      notifications7d: 0,
      totalNotificationCount: 0,
      writingAssignmentCount: 0,
      issuedWritingAssignmentCount: 0,
      instructors,
      students,
      missionAssignments: [unownedMission],
      assignmentEvents,
      reactivatedStudents7d: 0,
      notifiedStudents7d: 0,
      trend: [],
      now: 2_000_000,
    });

    expect(snapshot.activationState).toBe('CREATE_FIRST_MISSION');
    expect(snapshot.nextRequiredActionTarget).toMatchObject({
      kind: 'MISSION_ASSIGNMENT',
      targetView: 'ASSIGNMENTS',
      studentUid: 'student-a',
      instructorUid: 'inst-1',
    });
    expect(snapshot.activationSteps.find((step) => step.id === 'CREATE_FIRST_MISSION')).toMatchObject({
      done: false,
    });
    expect(snapshot.activationSteps.find((step) => step.id === 'SEND_FIRST_NOTIFICATION')).toMatchObject({
      done: false,
    });
  });

  it('converts the activation steps into a seven-stage runbook and calls out non-history worksheet fallback', () => {
    const activationSteps: OrganizationActivationStep[] = [
      {
        id: 'CREATE_COHORT',
        label: 'cohort を1つ作成する',
        description: 'sample',
        done: true,
        target: {
          kind: 'ORGANIZATION_SETTINGS',
          targetView: BusinessAdminWorkspaceView.SETTINGS,
          organizationId: 'org_demo_academy',
        },
      },
      {
        id: 'ASSIGN_STUDENTS',
        label: '最初の生徒担当を決める',
        description: 'sample',
        done: true,
        target: {
          kind: 'STUDENT_ASSIGNMENT',
          targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
          organizationId: 'org_demo_academy',
        },
      },
      {
        id: 'CREATE_FIRST_MISSION',
        label: '初回ミッションを配布する',
        description: 'sample',
        done: true,
        target: {
          kind: 'MISSION_ASSIGNMENT',
          targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
          organizationId: 'org_demo_academy',
        },
      },
      {
        id: 'SEND_FIRST_NOTIFICATION',
        label: '最初のフォロー通知を送る',
        description: 'sample',
        done: true,
        target: {
          kind: 'INSTRUCTOR_NOTIFICATION',
          targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
          organizationId: 'org_demo_academy',
        },
      },
      {
        id: 'ISSUE_FIRST_WRITING_ASSIGNMENT',
        label: '初回作文を配布する',
        description: 'sample',
        done: true,
        target: {
          kind: 'WRITING_ASSIGNMENT',
          targetView: BusinessAdminWorkspaceView.WRITING,
          organizationId: 'org_demo_academy',
        },
      },
    ];

    const runbook = buildOrganizationActivationRunbook({
      organizationId: 'org_demo_academy',
      totalStudents: 2,
      activationSteps,
      historyBasedWorksheetStudentCount: 0,
      fallbackWorksheetStudentCount: 2,
      issuedWritingAssignmentCount: 1,
      submittedWritingAssignmentCount: 0,
      reviewReadyWritingAssignmentCount: 0,
      reviewedWritingAssignmentCount: 0,
    });

    expect(runbook.stages.map((stage) => stage.id)).toEqual([
      'cohort',
      'assignment',
      'mission',
      'notification',
      'worksheet',
      'writing',
      'review',
    ]);
    expect(runbook.currentStage).toMatchObject({
      id: 'worksheet',
      status: 'stalled',
      target: {
        kind: 'WORKSHEET',
        targetView: BusinessAdminWorkspaceView.WORKSHEETS,
      },
    });
    expect(runbook.stalledStage?.stalledReason).toContain('代替候補');
    expect(runbook.worksheet).toMatchObject({
      historyBasedStudentCount: 0,
      fallbackStudentCount: 2,
      hasOnlyFallback: true,
    });
    expect(runbook.stages.find((stage) => stage.id === 'writing')).toMatchObject({
      done: true,
      status: 'complete',
    });
  });
});
