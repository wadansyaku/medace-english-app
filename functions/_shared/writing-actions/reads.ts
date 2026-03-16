import type {
  PrintableWritingFeedbackResponse,
  WritingAssignmentListResponse,
  WritingReviewQueueResponse,
  WritingSubmissionDetailResponse,
  WritingTemplateListResponse,
} from '../../../contracts/writing';
import {
  type WritingAssignment,
  type WritingPromptSnapshot,
  type WritingQueueItem,
  type WritingSubmissionAsset,
  type WritingEvaluation,
  type WritingTeacherReview,
  type WritingExamCategory,
  UserRole,
  WritingAssignmentStatus as AssignmentStatus,
} from '../../../types';
import { buildPrintableFeedbackHtml } from '../../../utils/writing';
import { HttpError } from '../http';
import type { AppEnv, DbUserRow } from '../types';
import {
  ensureSubmissionViewAccess,
  getVisibleStudentIds,
  guardTeacher,
  guardWritingAccess,
  isStudentFeedbackVisibleStatus,
  requireWritingOrganizationContext,
} from './access';
import {
  parsePromptSnapshot,
  toAsset,
  toAssignment,
  toEvaluation,
  toSubmissionFromDetailRow,
  toTeacherReview,
  toTemplate,
} from './models';
import {
  listTemplateRows,
  readAssignmentRow,
  readAssignmentRowsForScope,
  readLatestSubmissionRowsForAssignments,
  readRecommendedEvaluationProviders,
  readReviewQueueAssignmentRows,
  readSubmissionAssetRowsBySubmissionIds,
  readSubmissionDetailBaseRow,
  readSubmissionEvaluationRowsBySubmissionIds,
  readTeacherReviewRowsBySubmissionIds,
} from './repository';

interface WritingSubmissionContext {
  detail: WritingSubmissionDetailResponse;
  promptSnapshot: WritingPromptSnapshot;
}

const toSubmissionParts = (
  assets: WritingSubmissionAsset[],
  evaluations: WritingEvaluation[],
  teacherReview?: WritingTeacherReview,
) => ({
  assets,
  evaluations,
  teacherReview,
});

export const readAssignmentResponse = async (
  env: AppEnv,
  assignmentId: string,
): Promise<WritingAssignment> => {
  const row = await readAssignmentRow(env, assignmentId);
  if (!row) {
    throw new HttpError(404, '自由英作文課題が見つかりません。');
  }
  return toAssignment(row);
};

export const readSubmissionContext = async (
  env: AppEnv,
  submissionId: string,
): Promise<WritingSubmissionContext> => {
  const baseRow = await readSubmissionDetailBaseRow(env, submissionId);
  if (!baseRow) {
    throw new HttpError(404, '提出データが見つかりません。');
  }

  const submissionIds = [baseRow.submission_id];
  const [assetRowsBySubmissionId, evaluationRowsBySubmissionId, reviewRowsBySubmissionId] = await Promise.all([
    readSubmissionAssetRowsBySubmissionIds(env, submissionIds),
    readSubmissionEvaluationRowsBySubmissionIds(env, submissionIds),
    readTeacherReviewRowsBySubmissionIds(env, submissionIds),
  ]);

  const assets = (assetRowsBySubmissionId.get(baseRow.submission_id) || []).map(toAsset);
  const evaluations = (evaluationRowsBySubmissionId.get(baseRow.submission_id) || []).map(toEvaluation);
  const teacherReviewRow = reviewRowsBySubmissionId.get(baseRow.submission_id);
  const teacherReview = teacherReviewRow ? toTeacherReview(teacherReviewRow) : undefined;
  const submission = toSubmissionFromDetailRow(baseRow, toSubmissionParts(assets, evaluations, teacherReview));
  const assignment = toAssignment(baseRow, {
    latestSubmissionId: submission.id,
    latestSubmission: submission,
  });

  return {
    detail: {
      assignment,
      submission,
    },
    promptSnapshot: parsePromptSnapshot(baseRow),
  };
};

export const handleListWritingTemplates = async (
  env: AppEnv,
  user: DbUserRow,
  examCategory?: string,
): Promise<WritingTemplateListResponse> => {
  await requireWritingOrganizationContext(env, user);
  const rows = await listTemplateRows(env, examCategory);
  return { templates: rows.map(toTemplate) };
};

export const handleListWritingAssignments = async (
  env: AppEnv,
  user: DbUserRow,
  scope: 'mine' | 'organization',
): Promise<WritingAssignmentListResponse> => {
  const organization = await requireWritingOrganizationContext(env, user);
  const visibleStudentIds = await getVisibleStudentIds(env, user, organization);
  const rows = await readAssignmentRowsForScope(
    env,
    organization.organizationId,
    user.role !== UserRole.STUDENT,
    user.id,
  );

  return {
    assignments: rows
      .map((row) => {
        if (!visibleStudentIds.has(row.student_user_id)) return null;
        if (user.role === UserRole.STUDENT && scope === 'organization') return null;
        if (!row.latest_submission_id) return toAssignment(row);
        if (user.role === UserRole.STUDENT && !isStudentFeedbackVisibleStatus(row.status)) {
          return toAssignment(row);
        }
        return toAssignment(row, { latestSubmissionId: row.latest_submission_id });
      })
      .filter(Boolean) as WritingAssignment[],
  };
};

export const handleListWritingReviewQueue = async (
  env: AppEnv,
  user: DbUserRow,
  scope: 'QUEUE' | 'HISTORY',
): Promise<WritingReviewQueueResponse> => {
  guardTeacher(user);
  const organization = await requireWritingOrganizationContext(env, user);
  const visibleStudentIds = await getVisibleStudentIds(env, user, organization);
  const statuses = scope === 'QUEUE'
    ? [AssignmentStatus.REVIEW_READY]
    : [AssignmentStatus.RETURNED, AssignmentStatus.REVISION_REQUESTED, AssignmentStatus.COMPLETED];
  const rows = await readReviewQueueAssignmentRows(env, organization.organizationId, statuses);
  const visibleRows = rows.filter((row) => visibleStudentIds.has(row.student_user_id));
  const latestSubmissionRows = await readLatestSubmissionRowsForAssignments(env, visibleRows.map((row) => row.id));

  const submissionIds = visibleRows
    .map((row) => latestSubmissionRows.get(row.id)?.id)
    .filter(Boolean) as string[];
  const recommendedProviders = await readRecommendedEvaluationProviders(env, submissionIds);

  const items: WritingQueueItem[] = [];
  for (const row of visibleRows) {
    const latestSubmission = latestSubmissionRows.get(row.id);
    if (!latestSubmission) continue;

    items.push({
      assignmentId: row.id,
      submissionId: latestSubmission.id,
      studentUid: row.student_user_id,
      studentName: row.student_name,
      examCategory: row.exam_category as WritingExamCategory,
      promptTitle: row.prompt_title,
      status: row.status,
      attemptNo: Number(latestSubmission.attempt_no || 0),
      submittedAt: Number(latestSubmission.submitted_at || 0),
      transcriptConfidence: Number(latestSubmission.transcript_confidence || 0),
      recommendedProvider: recommendedProviders.get(latestSubmission.id),
      instructorName: row.instructor_name,
    });
  }

  return { items };
};

export const handleGetWritingSubmissionDetail = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
): Promise<WritingSubmissionDetailResponse> => {
  guardWritingAccess(user);
  const context = await readSubmissionContext(env, submissionId);
  await ensureSubmissionViewAccess(env, user, context.detail);
  return context.detail;
};

export const handleGetWritingPrintableFeedback = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
): Promise<PrintableWritingFeedbackResponse> => {
  guardWritingAccess(user);
  const context = await readSubmissionContext(env, submissionId);
  await ensureSubmissionViewAccess(env, user, context.detail);

  const selectedEvaluation = context.detail.submission.evaluations.find((evaluation) => (
    evaluation.id === (context.detail.submission.teacherReview?.selectedEvaluationId || context.detail.submission.selectedEvaluationId)
  )) || context.detail.submission.evaluations[0];
  if (!selectedEvaluation) {
    throw new HttpError(404, '印刷できる添削結果がありません。');
  }

  return {
    title: `${context.detail.assignment.studentName}-${context.detail.assignment.promptTitle}-feedback`,
    html: buildPrintableFeedbackHtml(
      context.promptSnapshot,
      selectedEvaluation,
      context.detail.submission.teacherReview?.publicComment || '次回は理由と具体例のつながりを意識しましょう。',
      context.detail.submission.transcript,
      context.detail.assignment.studentName,
    ),
  };
};
