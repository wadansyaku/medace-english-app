import {
  BusinessAdminWorkspaceView,
  StudentRiskLevel,
  type OrganizationDashboardSnapshot,
  type OrganizationInstructorBacklogSummary,
  type OrganizationInstructorSummary,
  type StudentSummary,
  type WritingAssignment,
  type WritingQueueItem,
} from '../types';
import { getInstructorQueueSegment } from '../shared/retention';

export type AssignmentFilter = 'ALL' | 'IMMEDIATE' | 'UNASSIGNED_AT_RISK';

export type BusinessAdminDecisionTone = 'default' | 'accent' | 'warning' | 'danger' | 'success';

export type BusinessAdminDecisionActionKind = 'OPEN_VIEW' | 'SET_ASSIGNMENT_FILTER' | 'SEND_FIRST_NOTIFICATION';

export interface BusinessAdminDecisionAction {
  kind: BusinessAdminDecisionActionKind;
  label: string;
  targetView: BusinessAdminWorkspaceView;
  assignmentFilter?: AssignmentFilter;
}

export interface BusinessAdminDecisionMetric {
  label: string;
  value: string;
  detail: string;
  tone: BusinessAdminDecisionTone;
}

export interface BusinessAdminDecisionFocusItem {
  label: string;
  value: string;
  detail: string;
  tone: BusinessAdminDecisionTone;
}

export interface BusinessAdminDecisionModel {
  eyebrow: string;
  title: string;
  body: string;
  tone: BusinessAdminDecisionTone;
  primaryAction: BusinessAdminDecisionAction;
  secondaryAction: BusinessAdminDecisionAction | null;
  metrics: BusinessAdminDecisionMetric[];
  focusItems: BusinessAdminDecisionFocusItem[];
  emptyState: {
    title: string;
    body: string;
  } | null;
}

export interface BusinessAdminWritingCounts {
  completedCount: number;
  issuedCount: number;
  reviewReadyCount: number;
  revisionRequestedCount: number;
}

const matchesStudentKeyword = (student: StudentSummary, query: string): boolean => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;

  return student.name.toLowerCase().includes(keyword) || student.email.toLowerCase().includes(keyword);
};

export const filterAssignmentStudents = (
  students: StudentSummary[],
  filter: AssignmentFilter,
  query: string,
): StudentSummary[] => students.filter((student) => {
  if (filter === 'IMMEDIATE' && getInstructorQueueSegment(student) !== 'IMMEDIATE') return false;
  if (filter === 'UNASSIGNED_AT_RISK' && (student.assignedInstructorUid || student.riskLevel === StudentRiskLevel.SAFE)) return false;
  return matchesStudentKeyword(student, query);
});

export const sortAssignmentStudentsByPriority = (
  students: StudentSummary[],
): StudentSummary[] => [...students].sort((left, right) => (
  Number(Boolean(right.needsFollowUpNow)) - Number(Boolean(left.needsFollowUpNow))
  || Number(Boolean(!right.assignedInstructorUid)) - Number(Boolean(!left.assignedInstructorUid))
  || Number(Boolean(getInstructorQueueSegment(right) === 'IMMEDIATE')) - Number(Boolean(getInstructorQueueSegment(left) === 'IMMEDIATE'))
  || Number(Boolean(right.latestInterventionOutcome === 'EXPIRED')) - Number(Boolean(left.latestInterventionOutcome === 'EXPIRED'))
  || ((left.lastActive || 0) - (right.lastActive || 0))
  || left.name.localeCompare(right.name, 'ja')
));

export const resolveSelectedAssignmentStudentUid = (
  students: StudentSummary[],
  selectedStudentUid: string | null,
): string | null => {
  if (students.length === 0) return null;
  if (selectedStudentUid && students.some((student) => student.uid === selectedStudentUid)) {
    return selectedStudentUid;
  }
  return students[0].uid;
};

export const selectAssignmentStudent = (
  students: StudentSummary[],
  selectedStudentUid: string | null,
): StudentSummary | null => students.find((student) => student.uid === selectedStudentUid) || students[0] || null;

export const sortInstructorsByAssignedLoad = (
  instructors: OrganizationInstructorSummary[],
): OrganizationInstructorSummary[] => [...instructors].sort((left, right) => {
  if (right.assignedStudentCount !== left.assignedStudentCount) {
    return right.assignedStudentCount - left.assignedStudentCount;
  }
  if (right.notifications7d !== left.notifications7d) {
    return right.notifications7d - left.notifications7d;
  }
  return left.displayName.localeCompare(right.displayName, 'ja');
});

export const sortInstructorBacklogByLoad = (
  instructors: OrganizationInstructorBacklogSummary[],
): OrganizationInstructorBacklogSummary[] => [...instructors].sort((left, right) => (
  right.immediateCount - left.immediateCount
  || right.backlogCount - left.backlogCount
  || right.assignedStudentCount - left.assignedStudentCount
  || left.displayName.localeCompare(right.displayName, 'ja')
));

export const getPlanCoverageRate = (
  snapshot: Pick<OrganizationDashboardSnapshot, 'totalStudents' | 'learningPlanCount'>,
): number => {
  if (snapshot.totalStudents <= 0) return 0;
  return Math.round((snapshot.learningPlanCount / snapshot.totalStudents) * 100);
};

export const getBusinessAdminWritingCounts = (
  assignments: WritingAssignment[],
  queue: WritingQueueItem[],
): BusinessAdminWritingCounts => ({
  completedCount: assignments.filter((assignment) => assignment.status === 'COMPLETED').length,
  issuedCount: assignments.filter((assignment) => assignment.status === 'ISSUED').length,
  reviewReadyCount: queue.length,
  revisionRequestedCount: assignments.filter((assignment) => assignment.status === 'REVISION_REQUESTED').length,
});

const resolveNextRequiredActionView = (
  snapshot: OrganizationDashboardSnapshot,
): BusinessAdminWorkspaceView => {
  if (snapshot.nextRequiredActionTarget?.targetView) return snapshot.nextRequiredActionTarget.targetView;
  if (snapshot.nextRequiredAction === 'CREATE_COHORT') return BusinessAdminWorkspaceView.SETTINGS;
  if (snapshot.nextRequiredAction === 'ISSUE_FIRST_WRITING_ASSIGNMENT') return BusinessAdminWorkspaceView.WRITING;
  return BusinessAdminWorkspaceView.ASSIGNMENTS;
};

const formatCount = (value: number, unit: string): string => `${value}${unit}`;

const getActivationProgressMetric = (
  snapshot: OrganizationDashboardSnapshot,
): BusinessAdminDecisionMetric => {
  const totalCount = snapshot.activationSteps.length;
  const completedCount = snapshot.activationSteps.filter((step) => step.done).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    label: '導入ループ',
    value: `${progressPercent}%`,
    detail: `${completedCount}/${totalCount} ステップ完了`,
    tone: progressPercent >= 100 ? 'success' : progressPercent >= 60 ? 'accent' : 'warning',
  };
};

const resolveAssignmentPriorityFilter = (
  snapshot: OrganizationDashboardSnapshot,
): AssignmentFilter => {
  if (snapshot.unassignedAtRiskCount > 0) return 'UNASSIGNED_AT_RISK';
  if (snapshot.interventionBacklogCount > 0) return 'IMMEDIATE';
  return 'ALL';
};

const getPriorityStudent = (
  snapshot: OrganizationDashboardSnapshot,
): StudentSummary | null => {
  const sortedStudents = sortAssignmentStudentsByPriority(snapshot.studentAssignments);
  const filter = resolveAssignmentPriorityFilter(snapshot);
  return filterAssignmentStudents(sortedStudents, filter, '')[0] || sortedStudents[0] || null;
};

const getTopInstructorLoad = (
  snapshot: OrganizationDashboardSnapshot,
): OrganizationInstructorBacklogSummary | null => (
  sortInstructorBacklogByLoad(snapshot.instructorBacklog)[0] || null
);

const getWritingDecisionMetric = (
  writingAssignments: WritingAssignment[],
  writingQueue: WritingQueueItem[],
): BusinessAdminDecisionMetric => {
  const writingCounts = getBusinessAdminWritingCounts(writingAssignments, writingQueue);
  const pendingCount = writingCounts.reviewReadyCount + writingCounts.revisionRequestedCount;

  return {
    label: '作文滞留',
    value: formatCount(pendingCount, '件'),
    detail: `添削待ち ${writingCounts.reviewReadyCount} / 再提出待ち ${writingCounts.revisionRequestedCount}`,
    tone: pendingCount > 0 ? 'warning' : 'success',
  };
};

const buildBaseMetrics = (
  snapshot: OrganizationDashboardSnapshot,
  writingAssignments: WritingAssignment[],
  writingQueue: WritingQueueItem[],
): BusinessAdminDecisionMetric[] => [
  getActivationProgressMetric(snapshot),
  {
    label: '未割当 at-risk',
    value: formatCount(snapshot.unassignedAtRiskCount, '名'),
    detail: '担当講師を先に固定したい生徒',
    tone: snapshot.unassignedAtRiskCount > 0 ? 'warning' : 'success',
  },
  {
    label: '要即対応',
    value: formatCount(snapshot.interventionBacklogCount, '名'),
    detail: '48時間以内に介入順を決めたい生徒',
    tone: snapshot.interventionBacklogCount > 0 ? 'danger' : 'success',
  },
  getWritingDecisionMetric(writingAssignments, writingQueue),
];

const buildOverviewDecision = (
  snapshot: OrganizationDashboardSnapshot,
  writingAssignments: WritingAssignment[],
  writingQueue: WritingQueueItem[],
): BusinessAdminDecisionModel => {
  const nextActionView = resolveNextRequiredActionView(snapshot);
  const topInstructor = getTopInstructorLoad(snapshot);
  const priorityStudent = getPriorityStudent(snapshot);
  const shouldSendNotification = snapshot.nextRequiredActionTarget?.kind === 'INSTRUCTOR_NOTIFICATION'
    && Boolean(snapshot.nextRequiredActionTarget.studentUid);

  return {
    eyebrow: 'Decision Brief',
    title: snapshot.nextRequiredActionLabel,
    body: snapshot.nextRequiredActionDescription,
    tone: snapshot.nextRequiredAction === 'ACTIVE' ? 'success' : 'accent',
    primaryAction: shouldSendNotification
      ? {
        kind: 'SEND_FIRST_NOTIFICATION',
        label: '初回通知を送る',
        targetView: BusinessAdminWorkspaceView.INSTRUCTORS,
      }
      : {
        kind: 'OPEN_VIEW',
        label: snapshot.nextRequiredAction === 'ACTIVE' ? '割当状況を確認する' : '次の一手へ進む',
        targetView: nextActionView,
      },
    secondaryAction: {
      kind: 'SET_ASSIGNMENT_FILTER',
      label: snapshot.interventionBacklogCount > 0 ? '要対応生徒を見る' : '割当一覧を見る',
      targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
      assignmentFilter: resolveAssignmentPriorityFilter(snapshot),
    },
    metrics: buildBaseMetrics(snapshot, writingAssignments, writingQueue),
    focusItems: [
      {
        label: '次に実行',
        value: snapshot.nextRequiredActionLabel,
        detail: snapshot.nextRequiredActionDescription,
        tone: snapshot.nextRequiredAction === 'ACTIVE' ? 'success' : 'accent',
      },
      {
        label: '優先生徒',
        value: priorityStudent?.name || '対象なし',
        detail: priorityStudent?.recommendedAction || '今すぐ割当を直す対象はありません。',
        tone: priorityStudent?.needsFollowUpNow ? 'danger' : priorityStudent ? 'warning' : 'success',
      },
      {
        label: '講師負荷',
        value: topInstructor?.displayName || '講師なし',
        detail: topInstructor
          ? `要即対応 ${topInstructor.immediateCount} / 再開待ち ${topInstructor.waitingCount} / 担当 ${topInstructor.assignedStudentCount}`
          : '講師を追加すると担当負荷を比較できます。',
        tone: topInstructor && topInstructor.immediateCount > 0 ? 'warning' : 'default',
      },
    ],
    emptyState: snapshot.totalStudents === 0
      ? {
        title: 'まだ生徒がいません',
        body: 'cohort とメンバーを揃えると、担当割当、初回ミッション、通知までの判断材料が表示されます。',
      }
      : null,
  };
};

const buildAssignmentsDecision = (
  snapshot: OrganizationDashboardSnapshot,
  writingAssignments: WritingAssignment[],
  writingQueue: WritingQueueItem[],
): BusinessAdminDecisionModel => {
  const priorityFilter = resolveAssignmentPriorityFilter(snapshot);
  const priorityStudent = getPriorityStudent(snapshot);
  const hasPriorityStudent = Boolean(priorityStudent);

  return {
    eyebrow: 'Assignment Triage',
    title: hasPriorityStudent ? `${priorityStudent!.name} から確認する` : '割当対象は落ち着いています',
    body: hasPriorityStudent
      ? priorityStudent!.recommendedAction || '担当講師、cohort、今週ミッションの順に詰まりを外してください。'
      : '未割当や即対応の生徒はいません。必要に応じて全生徒の担当更新履歴を確認します。',
    tone: snapshot.interventionBacklogCount > 0 ? 'danger' : snapshot.unassignedAtRiskCount > 0 ? 'warning' : 'success',
    primaryAction: {
      kind: 'SET_ASSIGNMENT_FILTER',
      label: priorityFilter === 'UNASSIGNED_AT_RISK'
        ? '未割当 at-risk に絞る'
        : priorityFilter === 'IMMEDIATE'
          ? '要即対応に絞る'
          : '全生徒を見る',
      targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
      assignmentFilter: priorityFilter,
    },
    secondaryAction: {
      kind: 'OPEN_VIEW',
      label: '講師負荷を比較する',
      targetView: BusinessAdminWorkspaceView.INSTRUCTORS,
    },
    metrics: [
      {
        label: '割当カバー率',
        value: `${snapshot.assignmentCoverageRate}%`,
        detail: `${snapshot.totalStudents - snapshot.unassignedStudents}/${snapshot.totalStudents}名に担当あり`,
        tone: snapshot.assignmentCoverageRate >= 90 ? 'success' : snapshot.assignmentCoverageRate >= 60 ? 'accent' : 'warning',
      },
      ...buildBaseMetrics(snapshot, writingAssignments, writingQueue).slice(1, 4),
    ],
    focusItems: [
      {
        label: '最初に見る生徒',
        value: priorityStudent?.name || '対象なし',
        detail: priorityStudent
          ? `${priorityStudent.assignedInstructorName || '未割当'} / ${priorityStudent.cohortName || 'cohort 未設定'}`
          : '割当対象の一覧は空です。',
        tone: priorityStudent?.needsFollowUpNow ? 'danger' : priorityStudent ? 'warning' : 'success',
      },
      {
        label: '詰まりの理由',
        value: snapshot.unassignedAtRiskCount > 0 ? '担当未設定' : snapshot.interventionBacklogCount > 0 ? '介入待ち' : '大きな詰まりなし',
        detail: snapshot.unassignedAtRiskCount > 0
          ? 'at-risk 生徒に担当講師がいません。先に担当を固定します。'
          : snapshot.interventionBacklogCount > 0
            ? '直近の声かけ・ミッション状況を見て介入順を決めます。'
            : '履歴確認とミッション配布に進めます。',
        tone: snapshot.unassignedAtRiskCount > 0 ? 'warning' : snapshot.interventionBacklogCount > 0 ? 'danger' : 'success',
      },
    ],
    emptyState: snapshot.totalStudents === 0
      ? {
        title: '割当対象の生徒がいません',
        body: 'メンバーと cohort を用意すると、このビューで担当講師と初回ミッションを固定できます。',
      }
      : null,
  };
};

const buildInstructorsDecision = (
  snapshot: OrganizationDashboardSnapshot,
  writingAssignments: WritingAssignment[],
  writingQueue: WritingQueueItem[],
): BusinessAdminDecisionModel => {
  const topInstructor = getTopInstructorLoad(snapshot);
  const shouldSendNotification = snapshot.nextRequiredActionTarget?.kind === 'INSTRUCTOR_NOTIFICATION'
    && Boolean(snapshot.nextRequiredActionTarget.studentUid);

  return {
    eyebrow: 'Instructor Load Brief',
    title: shouldSendNotification
      ? '初回通知の対象を固定する'
      : topInstructor
        ? `${topInstructor.displayName} の負荷を先に確認する`
        : '講師負荷を比較する準備が必要です',
    body: shouldSendNotification
      ? 'cohort、担当割当、初回ミッションが揃った対象に最初のフォロー通知を送ると、通知後再開率を測れます。'
      : topInstructor
        ? `要即対応 ${topInstructor.immediateCount}、再開待ち ${topInstructor.waitingCount}、担当 ${topInstructor.assignedStudentCount} の順に偏りを見ます。`
        : '講師または担当割当が揃うと、講師ごとの backlog と通知後再開を比較できます。',
    tone: shouldSendNotification ? 'accent' : topInstructor && topInstructor.immediateCount > 0 ? 'warning' : 'success',
    primaryAction: shouldSendNotification
      ? {
        kind: 'SEND_FIRST_NOTIFICATION',
        label: '初回通知を送る',
        targetView: BusinessAdminWorkspaceView.INSTRUCTORS,
      }
      : {
        kind: 'SET_ASSIGNMENT_FILTER',
        label: snapshot.interventionBacklogCount > 0 ? '要対応生徒を割り振る' : '割当一覧を確認する',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        assignmentFilter: resolveAssignmentPriorityFilter(snapshot),
      },
    secondaryAction: {
      kind: 'OPEN_VIEW',
      label: 'Overview に戻る',
      targetView: BusinessAdminWorkspaceView.OVERVIEW,
    },
    metrics: [
      {
        label: '講師数',
        value: formatCount(snapshot.totalInstructors, '名'),
        detail: '稼働中の講師と管理者',
        tone: snapshot.totalInstructors > 0 ? 'default' : 'warning',
      },
      {
        label: '最大要即対応',
        value: formatCount(topInstructor?.immediateCount || 0, '件'),
        detail: topInstructor ? `${topInstructor.displayName} の即対応件数` : '比較対象がありません',
        tone: topInstructor && topInstructor.immediateCount > 0 ? 'danger' : 'success',
      },
      {
        label: '48時間介入率',
        value: `${snapshot.followUpCoverageRate48h}%`,
        detail: 'at-risk 生徒へのフォロー進行',
        tone: snapshot.followUpCoverageRate48h >= 80 ? 'success' : snapshot.followUpCoverageRate48h >= 50 ? 'accent' : 'warning',
      },
      getWritingDecisionMetric(writingAssignments, writingQueue),
    ],
    focusItems: [
      {
        label: '最初に見る講師',
        value: topInstructor?.displayName || '対象なし',
        detail: topInstructor
          ? `担当 ${topInstructor.assignedStudentCount} / backlog ${topInstructor.backlogCount} / 再開済み ${topInstructor.reactivatedCount}`
          : '担当割当が入ると比較できます。',
        tone: topInstructor && topInstructor.backlogCount > 0 ? 'warning' : 'success',
      },
      {
        label: '通知判断',
        value: shouldSendNotification ? '送信待ち' : `${snapshot.reactivatedStudents7d}名再開`,
        detail: shouldSendNotification
          ? '初回通知を入れて、通知後72時間の再開を測ります。'
          : `直近7日の通知 ${snapshot.notifications7d}件 / 再開率 ${snapshot.reactivationRate7d}%`,
        tone: shouldSendNotification ? 'accent' : snapshot.reactivationRate7d > 0 ? 'success' : 'default',
      },
    ],
    emptyState: snapshot.totalInstructors === 0
      ? {
        title: '講師がまだ登録されていません',
        body: '講師アカウントと cohort を用意すると、負荷比較と通知後再開率を使えます。',
      }
      : null,
  };
};

export const buildBusinessAdminDecisionModel = ({
  snapshot,
  activeView,
  writingAssignments,
  writingQueue,
}: {
  snapshot: OrganizationDashboardSnapshot;
  activeView: BusinessAdminWorkspaceView;
  writingAssignments: WritingAssignment[];
  writingQueue: WritingQueueItem[];
}): BusinessAdminDecisionModel => {
  if (activeView === BusinessAdminWorkspaceView.ASSIGNMENTS) {
    return buildAssignmentsDecision(snapshot, writingAssignments, writingQueue);
  }

  if (activeView === BusinessAdminWorkspaceView.INSTRUCTORS) {
    return buildInstructorsDecision(snapshot, writingAssignments, writingQueue);
  }

  return buildOverviewDecision(snapshot, writingAssignments, writingQueue);
};
