import {
  BusinessAdminWorkspaceView,
  type OrganizationActivationActionTarget,
  type OrganizationActivationRunbookStage,
  type OrganizationActivationRunbookStageId,
  type OrganizationActivationRunbookStageStatus,
  type OrganizationActivationRunbookSummary,
  type OrganizationActivationStep,
} from '../../types';

interface BuildOrganizationActivationRunbookInput {
  organizationId: string;
  totalStudents: number;
  activationSteps: OrganizationActivationStep[];
  historyBasedWorksheetStudentCount?: number;
  fallbackWorksheetStudentCount?: number;
  issuedWritingAssignmentCount?: number;
  submittedWritingAssignmentCount?: number;
  reviewReadyWritingAssignmentCount?: number;
  reviewedWritingAssignmentCount?: number;
}

const STAGE_LABELS: Record<OrganizationActivationRunbookStageId, string> = {
  cohort: 'クラス',
  assignment: '担当割当',
  mission: '初回ミッション',
  notification: '初回通知',
  worksheet: 'PDF問題',
  writing: '初回作文',
  review: '返却レビュー',
};

const STAGE_ACTION_LABELS: Record<OrganizationActivationRunbookStageId, string> = {
  cohort: 'クラスを作成する',
  assignment: '担当講師を決める',
  mission: '初回ミッションを配布する',
  notification: '初回通知を送る',
  worksheet: '履歴ベースのPDF問題を作る',
  writing: '初回作文を配布する',
  review: '作文を返却する',
};

const STAGE_DETAIL: Record<OrganizationActivationRunbookStageId, string> = {
  cohort: '組織運用の受け皿になるクラスを1つ用意します。',
  assignment: '最初の生徒を担当講師に割り当てます。',
  mission: '担当済み生徒へ最初の週次ミッションを配布します。',
  notification: '初回ミッション後に講師からフォロー通知を送ります。',
  worksheet: '学習履歴から紙配布用のPDF問題候補を作れる状態にします。',
  writing: '初回の自由英作文を生徒へ配布します。',
  review: '提出された作文を添削して返却します。',
};

const toStepById = (
  steps: OrganizationActivationStep[],
): Partial<Record<OrganizationActivationStep['id'], OrganizationActivationStep>> => (
  steps.reduce<Partial<Record<OrganizationActivationStep['id'], OrganizationActivationStep>>>((map, step) => {
    map[step.id] = step;
    return map;
  }, {})
);

const buildWorksheetTarget = (organizationId: string): OrganizationActivationActionTarget => ({
  kind: 'WORKSHEET',
  targetView: BusinessAdminWorkspaceView.WORKSHEETS,
  organizationId,
});

const buildReviewTarget = (organizationId: string): OrganizationActivationActionTarget => ({
  kind: 'WRITING_ASSIGNMENT',
  targetView: BusinessAdminWorkspaceView.WRITING,
  organizationId,
});

const getWorksheetSourceLabel = (
  historyBasedWorksheetStudentCount: number,
  fallbackWorksheetStudentCount: number,
): string => (
  fallbackWorksheetStudentCount > 0
    ? `履歴ベース ${historyBasedWorksheetStudentCount}名 / 代替候補 ${fallbackWorksheetStudentCount}名`
    : `履歴ベース ${historyBasedWorksheetStudentCount}名`
);

const getStalledReason = ({
  id,
  totalStudents,
  historyBasedWorksheetStudentCount,
  fallbackWorksheetStudentCount,
  issuedWritingAssignmentCount,
  submittedWritingAssignmentCount,
  reviewReadyWritingAssignmentCount,
}: {
  id: OrganizationActivationRunbookStageId;
  totalStudents: number;
  historyBasedWorksheetStudentCount: number;
  fallbackWorksheetStudentCount: number;
  issuedWritingAssignmentCount: number;
  submittedWritingAssignmentCount: number;
  reviewReadyWritingAssignmentCount: number;
}): string => {
  if (id === 'cohort') return 'クラスがまだ作成されていません。';
  if (id === 'assignment') {
    return totalStudents === 0
      ? '生徒がまだ登録されていません。'
      : '担当講師が決まった生徒がまだいません。';
  }
  if (id === 'mission') return '担当済み生徒に初回ミッションが紐づいていません。';
  if (id === 'notification') return '初回ミッション後のフォロー通知がまだ送られていません。';
  if (id === 'worksheet') {
    if (totalStudents === 0) return '生徒登録後に履歴ベースのPDF問題候補を測れます。';
    if (historyBasedWorksheetStudentCount === 0 && fallbackWorksheetStudentCount > 0) {
      return 'PDF問題は代替候補のみです。学習履歴由来ではありません。';
    }
    return '履歴ベースのPDF問題候補がまだ不足しています。';
  }
  if (id === 'writing') {
    return issuedWritingAssignmentCount > 0
      ? '初回作文は配布済みですが、ランブック上の配布完了判定を確認してください。'
      : '初回作文がまだ生徒へ配布されていません。';
  }
  if (submittedWritingAssignmentCount + reviewReadyWritingAssignmentCount === 0) {
    return issuedWritingAssignmentCount > 0
      ? '初回作文は配布済みですが、提出がまだありません。'
      : '作文配布後に提出と返却レビューを測れます。';
  }
  return reviewReadyWritingAssignmentCount > 0
    ? '添削待ちの作文があります。返却すると導入ランブックが完了します。'
    : '提出済み作文の返却レビューがまだありません。';
};

export const buildOrganizationActivationRunbook = ({
  organizationId,
  totalStudents,
  activationSteps,
  historyBasedWorksheetStudentCount = 0,
  fallbackWorksheetStudentCount = 0,
  issuedWritingAssignmentCount = 0,
  submittedWritingAssignmentCount = 0,
  reviewReadyWritingAssignmentCount = 0,
  reviewedWritingAssignmentCount = 0,
}: BuildOrganizationActivationRunbookInput): OrganizationActivationRunbookSummary => {
  const stepById = toStepById(activationSteps);
  const rawStages: Array<Omit<OrganizationActivationRunbookStage, 'status' | 'stalledReason'>> = [
    {
      id: 'cohort',
      label: STAGE_LABELS.cohort,
      detail: STAGE_DETAIL.cohort,
      done: Boolean(stepById.CREATE_COHORT?.done),
      actionLabel: STAGE_ACTION_LABELS.cohort,
      target: stepById.CREATE_COHORT?.target || null,
      evidenceLabel: stepById.CREATE_COHORT?.done ? 'クラス作成済み' : 'クラス未作成',
    },
    {
      id: 'assignment',
      label: STAGE_LABELS.assignment,
      detail: STAGE_DETAIL.assignment,
      done: Boolean(stepById.ASSIGN_STUDENTS?.done),
      actionLabel: STAGE_ACTION_LABELS.assignment,
      target: stepById.ASSIGN_STUDENTS?.target || null,
      evidenceLabel: stepById.ASSIGN_STUDENTS?.done ? '担当割当あり' : '担当割当なし',
    },
    {
      id: 'mission',
      label: STAGE_LABELS.mission,
      detail: STAGE_DETAIL.mission,
      done: Boolean(stepById.CREATE_FIRST_MISSION?.done),
      actionLabel: STAGE_ACTION_LABELS.mission,
      target: stepById.CREATE_FIRST_MISSION?.target || null,
      evidenceLabel: stepById.CREATE_FIRST_MISSION?.done ? '初回ミッションあり' : '初回ミッションなし',
    },
    {
      id: 'notification',
      label: STAGE_LABELS.notification,
      detail: STAGE_DETAIL.notification,
      done: Boolean(stepById.SEND_FIRST_NOTIFICATION?.done),
      actionLabel: STAGE_ACTION_LABELS.notification,
      target: stepById.SEND_FIRST_NOTIFICATION?.target || null,
      evidenceLabel: stepById.SEND_FIRST_NOTIFICATION?.done ? '初回通知あり' : '初回通知なし',
    },
    {
      id: 'worksheet',
      label: STAGE_LABELS.worksheet,
      detail: STAGE_DETAIL.worksheet,
      done: historyBasedWorksheetStudentCount > 0,
      actionLabel: STAGE_ACTION_LABELS.worksheet,
      target: buildWorksheetTarget(organizationId),
      evidenceLabel: getWorksheetSourceLabel(historyBasedWorksheetStudentCount, fallbackWorksheetStudentCount),
    },
    {
      id: 'writing',
      label: STAGE_LABELS.writing,
      detail: STAGE_DETAIL.writing,
      done: Boolean(stepById.ISSUE_FIRST_WRITING_ASSIGNMENT?.done),
      actionLabel: STAGE_ACTION_LABELS.writing,
      target: stepById.ISSUE_FIRST_WRITING_ASSIGNMENT?.target || null,
      evidenceLabel: issuedWritingAssignmentCount > 0 ? `配布済み作文 ${issuedWritingAssignmentCount}件` : '配布済み作文なし',
    },
    {
      id: 'review',
      label: STAGE_LABELS.review,
      detail: STAGE_DETAIL.review,
      done: reviewedWritingAssignmentCount > 0,
      actionLabel: STAGE_ACTION_LABELS.review,
      target: buildReviewTarget(organizationId),
      evidenceLabel: reviewedWritingAssignmentCount > 0
        ? `返却済み ${reviewedWritingAssignmentCount}件`
        : `提出 ${submittedWritingAssignmentCount}件 / 添削待ち ${reviewReadyWritingAssignmentCount}件`,
    },
  ];

  const firstIncompleteIndex = rawStages.findIndex((stage) => !stage.done);
  const stages = rawStages.map((stage, index): OrganizationActivationRunbookStage => {
    const status: OrganizationActivationRunbookStageStatus = stage.done
      ? 'complete'
      : index === firstIncompleteIndex
        ? 'stalled'
        : 'pending';

    return {
      ...stage,
      status,
      stalledReason: status === 'stalled'
        ? getStalledReason({
          id: stage.id,
          totalStudents,
          historyBasedWorksheetStudentCount,
          fallbackWorksheetStudentCount,
          issuedWritingAssignmentCount,
          submittedWritingAssignmentCount,
          reviewReadyWritingAssignmentCount,
        })
        : null,
    };
  });

  const completedStageCount = stages.filter((stage) => stage.done).length;
  const currentStage = firstIncompleteIndex >= 0 ? stages[firstIncompleteIndex] : null;

  return {
    stages,
    currentStage,
    stalledStage: currentStage?.status === 'stalled' ? currentStage : null,
    completedStageCount,
    totalStageCount: stages.length,
    progressPercent: stages.length > 0 ? Math.round((completedStageCount / stages.length) * 100) : 0,
    worksheet: {
      historyBasedStudentCount: historyBasedWorksheetStudentCount,
      fallbackStudentCount: fallbackWorksheetStudentCount,
      sourceLabel: getWorksheetSourceLabel(historyBasedWorksheetStudentCount, fallbackWorksheetStudentCount),
      hasOnlyFallback: historyBasedWorksheetStudentCount === 0 && fallbackWorksheetStudentCount > 0,
    },
  };
};
