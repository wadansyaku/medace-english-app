import { describe, expect, it } from 'vitest';

import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import {
  InterventionOutcome,
  LearningTrack,
  SubscriptionPlan,
  StudentRiskLevel,
  BusinessAdminWorkspaceView,
  type OrganizationDashboardSnapshot,
  type StudentSummary,
  type WritingAssignment,
  type WritingQueueItem,
} from '../types';
import { buildBusinessActivationProgress } from '../utils/businessActivation';
import {
  buildBusinessAdminDecisionModel,
  filterAssignmentStudents,
  getBusinessAdminRunbookSummary,
  resolveSelectedAssignmentStudentUid,
} from '../utils/businessAdminDashboard';
import {
  filterStudentsForInstructorView,
  resolveFocusedStudentUid,
  sortStudentsByPriority,
} from '../utils/instructorDashboard';
import {
  resolveSelectedAssignmentId,
  resolveSelectedEvaluationId,
  resolveSelectedSubmissionId,
} from '../utils/writingOps';

const makeStudent = (overrides: Partial<StudentSummary>): StudentSummary => ({
  uid: overrides.uid || 'student-1',
  name: overrides.name || 'Alpha',
  email: overrides.email || 'alpha@example.com',
  totalLearned: overrides.totalLearned || 10,
  totalAttempts: overrides.totalAttempts || 12,
  lastActive: overrides.lastActive || 100,
  riskLevel: overrides.riskLevel || StudentRiskLevel.SAFE,
  ...overrides,
});

const makeDashboardSnapshot = (overrides: Partial<OrganizationDashboardSnapshot> = {}): OrganizationDashboardSnapshot => ({
  organizationId: 'org-1',
  organizationName: 'Demo School',
  subscriptionPlan: SubscriptionPlan.TOB_PAID,
  totalMembers: 3,
  totalStudents: 2,
  totalInstructors: 1,
  activeStudents7d: 0,
  atRiskStudents: 1,
  learningPlanCount: 0,
  notifications7d: 0,
  reactivatedStudents7d: 0,
  reactivationRate7d: 0,
  weeklyContinuityRate: 0,
  followUpCoverageRate48h: 0,
  interventionBacklogCount: 1,
  overdueMissionCount: 0,
  missionStartedRate: 0,
  overdueMissionRecoveryRate: 0,
  assignmentCoverageRate: 50,
  planCoverageRate: 0,
  unassignedStudents: 1,
  unassignedAtRiskCount: 1,
  trackCompletion: [],
  writingReturnRateByTrack: [],
  instructors: [
    {
      uid: 'inst-1',
      displayName: 'Oak 先生',
      email: 'oak@example.com',
      notifiedStudentCount: 0,
      notifications7d: 0,
      assignedStudentCount: 1,
    },
  ],
  instructorBacklog: [
    {
      uid: 'inst-1',
      displayName: 'Oak 先生',
      email: 'oak@example.com',
      assignedStudentCount: 1,
      immediateCount: 1,
      waitingCount: 0,
      reactivatedCount: 0,
      backlogCount: 1,
    },
  ],
  atRiskStudentList: [],
  studentAssignments: [
    makeStudent({
      uid: 'student-a',
      name: 'Alpha',
      email: 'alpha@example.com',
      riskLevel: StudentRiskLevel.DANGER,
      needsFollowUpNow: true,
      recommendedAction: '担当講師を決めて初回ミッションを配布する',
    }),
    makeStudent({
      uid: 'student-b',
      name: 'Beta',
      email: 'beta@example.com',
      riskLevel: StudentRiskLevel.SAFE,
      assignedInstructorUid: 'inst-1',
      assignedInstructorName: 'Oak 先生',
    }),
  ],
  assignmentEvents: [],
  trend: [],
  activationState: 'ASSIGN_STUDENTS',
  nextRequiredAction: 'ASSIGN_STUDENTS',
  nextRequiredActionLabel: '最初の生徒担当を決める',
  nextRequiredActionDescription: 'at-risk 生徒を1人だけ担当講師に割り当てます。',
  activationSteps: [
    {
      id: 'CREATE_COHORT',
      label: 'cohort を1つ作成する',
      description: 'sample',
      done: true,
      target: {
        kind: 'ORGANIZATION_SETTINGS',
        targetView: BusinessAdminWorkspaceView.SETTINGS,
        organizationId: 'org-1',
      },
    },
    {
      id: 'ASSIGN_STUDENTS',
      label: '最初の生徒担当を決める',
      description: 'sample',
      done: false,
      target: {
        kind: 'STUDENT_ASSIGNMENT',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        organizationId: 'org-1',
        studentUid: 'student-a',
        studentName: 'Alpha',
      },
    },
    {
      id: 'CREATE_FIRST_MISSION',
      label: '初回ミッションを配布する',
      description: 'sample',
      done: false,
      target: {
        kind: 'MISSION_ASSIGNMENT',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        organizationId: 'org-1',
      },
    },
    {
      id: 'SEND_FIRST_NOTIFICATION',
      label: '最初のフォロー通知を送る',
      description: 'sample',
      done: false,
      target: {
        kind: 'INSTRUCTOR_NOTIFICATION',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        organizationId: 'org-1',
      },
    },
    {
      id: 'ISSUE_FIRST_WRITING_ASSIGNMENT',
      label: '初回作文を配布する',
      description: 'sample',
      done: false,
      target: {
        kind: 'WRITING_ASSIGNMENT',
        targetView: BusinessAdminWorkspaceView.WRITING,
        organizationId: 'org-1',
      },
    },
  ],
  nextRequiredActionTarget: {
    kind: 'STUDENT_ASSIGNMENT',
    targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
    organizationId: 'org-1',
    studentUid: 'student-a',
    studentName: 'Alpha',
  },
  ...overrides,
});

describe('b2b workspace helpers', () => {
  it('filters assignment students by risk, assignment state, and query', () => {
    const students = [
      makeStudent({ uid: 'danger-unassigned', name: 'Danger Uno', email: 'danger@example.com', riskLevel: StudentRiskLevel.DANGER, needsFollowUpNow: true }),
      makeStudent({
        uid: 'warning-assigned',
        name: 'Warning Duo',
        email: 'warning@example.com',
        riskLevel: StudentRiskLevel.WARNING,
        assignedInstructorUid: 'inst-1',
        latestInterventionAt: Date.now(),
        latestInterventionOutcome: InterventionOutcome.PENDING,
      }),
      makeStudent({ uid: 'safe-unassigned', name: 'Safe Trio', email: 'safe@example.com', riskLevel: StudentRiskLevel.SAFE }),
    ];

    expect(filterAssignmentStudents(students, 'IMMEDIATE', '').map((student) => student.uid)).toEqual(['danger-unassigned']);
    expect(filterAssignmentStudents(students, 'UNASSIGNED_AT_RISK', '').map((student) => student.uid)).toEqual(['danger-unassigned']);
    expect(filterAssignmentStudents(students, 'ALL', 'warning').map((student) => student.uid)).toEqual(['warning-assigned']);
  });

  it('repairs assignment and instructor selections when the current row disappears', () => {
    const filteredStudents = [
      makeStudent({ uid: 'student-a' }),
      makeStudent({ uid: 'student-b' }),
    ];

    expect(resolveSelectedAssignmentStudentUid(filteredStudents, 'missing')).toBe('student-a');
    expect(resolveFocusedStudentUid(filteredStudents, 'missing')).toBe('student-a');
    expect(resolveSelectedAssignmentStudentUid([], 'student-a')).toBeNull();
    expect(resolveFocusedStudentUid([], 'student-a')).toBeNull();
  });

  it('sorts instructor student queues by queue segment first and oldest activity next', () => {
    const now = Date.now();
    const students = [
      makeStudent({ uid: 'reactivated', riskLevel: StudentRiskLevel.SAFE, lastActive: 500, latestInterventionOutcome: InterventionOutcome.REACTIVATED }),
      makeStudent({ uid: 'waiting', riskLevel: StudentRiskLevel.WARNING, lastActive: 400, latestInterventionAt: now, latestInterventionOutcome: InterventionOutcome.PENDING }),
      makeStudent({ uid: 'danger-recent', riskLevel: StudentRiskLevel.DANGER, lastActive: 300, needsFollowUpNow: true, latestInterventionOutcome: InterventionOutcome.EXPIRED }),
      makeStudent({ uid: 'danger-oldest', riskLevel: StudentRiskLevel.DANGER, lastActive: 100, needsFollowUpNow: true }),
    ];

    expect(sortStudentsByPriority(students).map((student) => student.uid)).toEqual([
      'danger-recent',
      'danger-oldest',
      'waiting',
      'reactivated',
    ]);

    expect(filterStudentsForInstructorView(sortStudentsByPriority(students), 'IMMEDIATE', '').map((student) => student.uid)).toEqual([
      'danger-recent',
      'danger-oldest',
    ]);
    expect(filterStudentsForInstructorView(sortStudentsByPriority(students), 'WAITING', '').map((student) => student.uid)).toEqual(['waiting']);
    expect(filterStudentsForInstructorView(sortStudentsByPriority(students), 'REACTIVATED', '').map((student) => student.uid)).toEqual(['reactivated']);
  });

  it('repairs writing review selections to the first available item', () => {
    const assignments = [
      { id: 'assignment-a' },
      { id: 'assignment-b' },
    ] as WritingAssignment[];
    const reviewList = [
      { submissionId: 'submission-a' },
      { submissionId: 'submission-b' },
    ] as WritingQueueItem[];

    expect(resolveSelectedAssignmentId(assignments, 'missing')).toBe('assignment-a');
    expect(resolveSelectedSubmissionId(reviewList, 'missing')).toBe('submission-a');
    expect(resolveSelectedAssignmentId([], 'assignment-a')).toBe('');
    expect(resolveSelectedSubmissionId([], 'submission-a')).toBe('');
  });

  it('falls back to the stored teacher-selected evaluation when the current selection disappears', () => {
    const detail = {
      submission: {
        evaluations: [
          { id: 'eval-a', isDefault: false },
          { id: 'eval-b', isDefault: true },
        ],
        teacherReview: {
          selectedEvaluationId: 'eval-a',
        },
        selectedEvaluationId: 'eval-b',
      },
    } as WritingSubmissionDetailResponse;

    expect(resolveSelectedEvaluationId(detail, 'missing')).toBe('eval-a');
    expect(resolveSelectedEvaluationId(detail, 'eval-b')).toBe('eval-b');
  });

  it('builds a direct activation checklist from organization state', () => {
    const progress = buildBusinessActivationProgress({
      snapshot: {
        organizationId: 'org-1',
        organizationName: 'Demo School',
        subscriptionPlan: SubscriptionPlan.TOB_PAID,
        totalMembers: 3,
        totalStudents: 2,
        totalInstructors: 1,
        activeStudents7d: 0,
        atRiskStudents: 1,
        learningPlanCount: 0,
        notifications7d: 0,
        reactivatedStudents7d: 0,
        reactivationRate7d: 0,
        weeklyContinuityRate: 0,
        followUpCoverageRate48h: 0,
        interventionBacklogCount: 1,
        overdueMissionCount: 0,
        missionStartedRate: 0,
        overdueMissionRecoveryRate: 0,
        assignmentCoverageRate: 50,
        planCoverageRate: 0,
        unassignedStudents: 1,
        unassignedAtRiskCount: 1,
        trackCompletion: [
          {
            track: LearningTrack.SCHOOL_TERM,
            assignedCount: 1,
            completedCount: 0,
            overdueCount: 0,
            completionRate: 0,
          },
        ],
        writingReturnRateByTrack: [],
        instructors: [],
        instructorBacklog: [],
        atRiskStudentList: [],
        studentAssignments: [],
        assignmentEvents: [],
        trend: [],
        activationState: 'ISSUE_FIRST_WRITING_ASSIGNMENT',
        nextRequiredAction: 'ISSUE_FIRST_WRITING_ASSIGNMENT',
        nextRequiredActionLabel: '初回作文を配布する',
        nextRequiredActionDescription: 'sample',
        activationSteps: [
          {
            id: 'CREATE_COHORT',
            label: 'cohort を1つ作成する',
            description: 'sample',
            done: true,
            target: {
              kind: 'ORGANIZATION_SETTINGS',
              targetView: BusinessAdminWorkspaceView.SETTINGS,
              organizationId: 'org-1',
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
              organizationId: 'org-1',
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
              organizationId: 'org-1',
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
              organizationId: 'org-1',
            },
          },
          {
            id: 'ISSUE_FIRST_WRITING_ASSIGNMENT',
            label: '初回作文を配布する',
            description: 'sample',
            done: false,
            target: {
              kind: 'WRITING_ASSIGNMENT',
              targetView: BusinessAdminWorkspaceView.WRITING,
              organizationId: 'org-1',
            },
          },
        ],
        nextRequiredActionTarget: {
          kind: 'WRITING_ASSIGNMENT',
          targetView: BusinessAdminWorkspaceView.WRITING,
          organizationId: 'org-1',
        },
      },
    });

    expect(progress.completedCount).toBe(4);
    expect(progress.totalCount).toBe(5);
    expect(progress.currentItem).toMatchObject({
      id: 'ISSUE_FIRST_WRITING_ASSIGNMENT',
      targetView: BusinessAdminWorkspaceView.WRITING,
    });
    expect(progress.progressPercent).toBe(80);
  });

  it('builds an overview decision brief from the activation contract', () => {
    const decision = buildBusinessAdminDecisionModel({
      snapshot: makeDashboardSnapshot(),
      activeView: BusinessAdminWorkspaceView.OVERVIEW,
      writingAssignments: [],
      writingQueue: [{ submissionId: 'submission-1' }] as WritingQueueItem[],
    });

    expect(decision.title).toBe('最初の生徒担当を決める');
    expect(decision.primaryAction).toMatchObject({
      kind: 'OPEN_VIEW',
      targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
    });
    expect(decision.secondaryAction).toMatchObject({
      kind: 'SET_ASSIGNMENT_FILTER',
      assignmentFilter: 'UNASSIGNED_AT_RISK',
    });
    expect(decision.metrics.map((metric) => [metric.label, metric.value])).toContainEqual(['作文滞留', '1件']);
  });

  it('passes the activation runbook stop reason and worksheet source into the overview decision model', () => {
    const snapshot = makeDashboardSnapshot({
      activationRunbook: {
        stages: [
          {
            id: 'worksheet',
            label: 'PDF問題',
            detail: 'sample',
            done: false,
            status: 'stalled',
            stalledReason: 'PDF問題は fallback 候補のみです。学習履歴由来ではありません。',
            actionLabel: '履歴ベースのPDF問題を作る',
            target: {
              kind: 'WORKSHEET',
              targetView: BusinessAdminWorkspaceView.WORKSHEETS,
              organizationId: 'org-1',
            },
            evidenceLabel: '履歴ベース 0名 / fallback候補 2名',
          },
        ],
        currentStage: {
          id: 'worksheet',
          label: 'PDF問題',
          detail: 'sample',
          done: false,
          status: 'stalled',
          stalledReason: 'PDF問題は fallback 候補のみです。学習履歴由来ではありません。',
          actionLabel: '履歴ベースのPDF問題を作る',
          target: {
            kind: 'WORKSHEET',
            targetView: BusinessAdminWorkspaceView.WORKSHEETS,
            organizationId: 'org-1',
          },
          evidenceLabel: '履歴ベース 0名 / fallback候補 2名',
        },
        stalledStage: {
          id: 'worksheet',
          label: 'PDF問題',
          detail: 'sample',
          done: false,
          status: 'stalled',
          stalledReason: 'PDF問題は fallback 候補のみです。学習履歴由来ではありません。',
          actionLabel: '履歴ベースのPDF問題を作る',
          target: {
            kind: 'WORKSHEET',
            targetView: BusinessAdminWorkspaceView.WORKSHEETS,
            organizationId: 'org-1',
          },
          evidenceLabel: '履歴ベース 0名 / fallback候補 2名',
        },
        completedStageCount: 4,
        totalStageCount: 7,
        progressPercent: 57,
        worksheet: {
          historyBasedStudentCount: 0,
          fallbackStudentCount: 2,
          sourceLabel: '履歴ベース 0名 / fallback候補 2名',
          hasOnlyFallback: true,
        },
      },
    });

    const runbookSummary = getBusinessAdminRunbookSummary(snapshot);
    const decision = buildBusinessAdminDecisionModel({
      snapshot,
      activeView: BusinessAdminWorkspaceView.OVERVIEW,
      writingAssignments: [],
      writingQueue: [],
    });

    expect(runbookSummary).toMatchObject({
      title: 'PDF問題で停止',
      targetView: BusinessAdminWorkspaceView.WORKSHEETS,
      tone: 'warning',
    });
    expect(runbookSummary.detail).toContain('学習履歴由来ではありません');
    expect(decision.metrics.map((metric) => [metric.label, metric.value])).toContainEqual(['導入ランブック', '57%']);
    expect(decision.focusItems.find((item) => item.label === '導入ランブック')).toMatchObject({
      value: 'PDF問題で停止',
      tone: 'warning',
    });
  });

  it('points assignment triage at the highest priority student and filter', () => {
    const decision = buildBusinessAdminDecisionModel({
      snapshot: makeDashboardSnapshot(),
      activeView: BusinessAdminWorkspaceView.ASSIGNMENTS,
      writingAssignments: [],
      writingQueue: [],
    });

    expect(decision.title).toContain('Alpha');
    expect(decision.primaryAction).toMatchObject({
      kind: 'SET_ASSIGNMENT_FILTER',
      targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
      assignmentFilter: 'UNASSIGNED_AT_RISK',
    });
    expect(decision.focusItems[0]).toMatchObject({
      label: '最初に見る生徒',
      value: 'Alpha',
    });
  });

  it('switches instructor brief to first notification send when the contract is waiting for notification', () => {
    const decision = buildBusinessAdminDecisionModel({
      snapshot: makeDashboardSnapshot({
        activationState: 'SEND_FIRST_NOTIFICATION',
        nextRequiredAction: 'SEND_FIRST_NOTIFICATION',
        nextRequiredActionLabel: '最初のフォロー通知を送る',
        nextRequiredActionDescription: '通知を送ります。',
        nextRequiredActionTarget: {
          kind: 'INSTRUCTOR_NOTIFICATION',
          targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
          organizationId: 'org-1',
          studentUid: 'student-b',
          studentName: 'Beta',
          instructorUid: 'inst-1',
          instructorName: 'Oak 先生',
          missionTitle: 'Alpha Mission',
        },
      }),
      activeView: BusinessAdminWorkspaceView.INSTRUCTORS,
      writingAssignments: [],
      writingQueue: [],
    });

    expect(decision.primaryAction).toMatchObject({
      kind: 'SEND_FIRST_NOTIFICATION',
      targetView: BusinessAdminWorkspaceView.INSTRUCTORS,
    });
    expect(decision.focusItems.find((item) => item.label === '通知判断')).toMatchObject({
      value: '送信待ち',
    });
  });
});
