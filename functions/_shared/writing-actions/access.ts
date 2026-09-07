import type {
  WritingStudentEvaluation,
  WritingStudentAssignment,
  WritingStudentSideEffectWarning,
  WritingStudentSubmissionBase,
  WritingStudentSubmissionDetailResponse,
  WritingStudentSubmissionReceiptResponse,
  WritingStudentTeacherReview,
  WritingSubmissionDetailResponse,
  WritingSubmissionViewerResponse,
} from '../../../contracts/writing';
import {
  OrganizationRole,
  SubscriptionPlan,
  UserRole,
  WritingAssignmentStatus as AssignmentStatus,
} from '../../../types';
import { HttpError } from '../http';
import {
  type ActiveOrganizationContext,
  readActiveOrganizationContextForUser,
} from '../organization-memberships';
import {
  readVisibleStudentIds,
} from '../student-visibility';
import type { AppEnv, DbUserRow } from '../types';

interface AssignmentAccessTarget {
  organization_id?: string | null;
  organizationId?: string | null;
  student_user_id?: string;
  studentUid?: string;
}

export const isStudentFeedbackVisibleStatus = (status: string): boolean => (
  status === AssignmentStatus.RETURNED
  || status === AssignmentStatus.REVISION_REQUESTED
  || status === AssignmentStatus.COMPLETED
);

export const guardWritingAccess = (user: DbUserRow): void => {
  if (
    user.role === UserRole.ADMIN
    || user.subscription_plan !== SubscriptionPlan.TOB_PAID
    || (user.role !== UserRole.STUDENT && user.role !== UserRole.INSTRUCTOR)
  ) {
    throw new HttpError(403, 'このワークスペースでは自由英作文機能を利用できません。');
  }
};

export const guardTeacher = (user: DbUserRow): void => {
  guardWritingAccess(user);
  if (user.role !== UserRole.INSTRUCTOR) {
    throw new HttpError(403, '講師のみ操作できます。');
  }
};

export const requireWritingOrganizationContext = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<ActiveOrganizationContext> => {
  guardWritingAccess(user);
  const organization = await readActiveOrganizationContextForUser(env, user.id);
  if (!organization) {
    throw new HttpError(403, '組織所属が確認できないため自由英作文を利用できません。');
  }
  return organization;
};

const getAssignmentStudentId = (assignment: AssignmentAccessTarget): string | undefined => (
  assignment.student_user_id || assignment.studentUid
);

const getAssignmentOrganizationId = (assignment: AssignmentAccessTarget): string | undefined => (
  assignment.organization_id || assignment.organizationId || undefined
);

export const getVisibleStudentIds = async (
  env: AppEnv,
  user: DbUserRow,
  organization?: ActiveOrganizationContext,
): Promise<Set<string>> => {
  const scopedOrganization = organization || (
    user.role === UserRole.STUDENT
      ? undefined
      : await requireWritingOrganizationContext(env, user)
  );
  return readVisibleStudentIds(env, user, scopedOrganization);
};

export const ensureAssignmentAccess = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: AssignmentAccessTarget,
): Promise<void> => {
  guardWritingAccess(user);

  const assignmentStudentId = String(getAssignmentStudentId(assignment) || '');
  if (user.role === UserRole.STUDENT) {
    const visibleStudentIds = await getVisibleStudentIds(env, user);
    if (!visibleStudentIds.has(assignmentStudentId)) {
      throw new HttpError(403, '担当範囲の課題のみ参照できます。');
    }
    return;
  }

  const organization = await requireWritingOrganizationContext(env, user);
  const visibleStudentIds = await getVisibleStudentIds(env, user, organization);
  // Staff access must remain scoped to the assignment's owning organization after student transfers.
  if (
    !visibleStudentIds.has(assignmentStudentId)
    || getAssignmentOrganizationId(assignment) !== organization.organizationId
  ) {
    throw new HttpError(403, '担当範囲の課題のみ参照できます。');
  }
};

export const ensureSubmissionViewAccess = async (
  env: AppEnv,
  user: DbUserRow,
  detail: WritingSubmissionDetailResponse,
): Promise<void> => {
  await ensureAssignmentAccess(env, user, detail.assignment);

  if (user.role !== UserRole.STUDENT) return;

  const review = detail.submission.teacherReview;
  const hasReleasedSelectedEvaluation = Boolean(
    review?.releasedAt
    && detail.submission.evaluations.some((evaluation) => evaluation.id === review.selectedEvaluationId),
  );
  if (!isStudentFeedbackVisibleStatus(detail.assignment.status) || !hasReleasedSelectedEvaluation) {
    throw new HttpError(403, '講師確認後に返却された答案のみ閲覧できます。');
  }
};

const projectStudentSubmissionBase = (
  submission: WritingSubmissionDetailResponse['submission'],
): WritingStudentSubmissionBase => ({
  id: submission.id,
  assignmentId: submission.assignmentId,
  attemptNo: submission.attemptNo,
  submissionSource: submission.submissionSource,
  transcript: submission.transcript,
  submittedAt: submission.submittedAt,
  assets: submission.assets,
});

const projectStudentAssignment = (
  assignment: WritingSubmissionDetailResponse['assignment'],
): WritingStudentAssignment => ({
  id: assignment.id,
  promptTitle: assignment.promptTitle,
  status: assignment.status,
});

const projectStudentEvaluation = (
  evaluation: WritingSubmissionDetailResponse['submission']['evaluations'][number],
): WritingStudentEvaluation => ({
  overallScore: evaluation.overallScore,
  rubric: evaluation.rubric,
  strengths: evaluation.strengths,
  improvementPoints: evaluation.improvementPoints,
  sentenceCorrections: evaluation.sentenceCorrections,
  correctedDraft: evaluation.correctedDraft,
  modelAnswer: evaluation.modelAnswer,
});

const projectStudentTeacherReview = (
  review: NonNullable<WritingSubmissionDetailResponse['submission']['teacherReview']>,
): WritingStudentTeacherReview => ({
  publicComment: review.publicComment,
  releasedAt: review.releasedAt,
});

const projectStudentSideEffectWarning = (
  detail: WritingSubmissionDetailResponse,
): WritingStudentSideEffectWarning | undefined => (
  detail.sideEffectJob?.status === 'FAILED' ? { status: 'FAILED' } : undefined
);

export const projectWritingDetailForViewer = (
  user: DbUserRow,
  detail: WritingSubmissionDetailResponse,
  studentView: 'receipt' | 'released',
): WritingSubmissionViewerResponse => {
  if (user.role !== UserRole.STUDENT) return detail;

  const studentSafeAssignment = projectStudentAssignment(detail.assignment);
  const studentSafeSubmission = projectStudentSubmissionBase(detail.submission);
  const studentSideEffectWarning = projectStudentSideEffectWarning(detail);

  if (studentView === 'receipt') {
    const receipt: WritingStudentSubmissionReceiptResponse = {
      assignment: studentSafeAssignment,
      submission: {
        ...studentSafeSubmission,
        evaluations: [],
      },
      ...(studentSideEffectWarning ? { sideEffectJob: studentSideEffectWarning } : {}),
    };
    return receipt;
  }

  const review = detail.submission.teacherReview;
  const selectedEvaluation = review
    ? detail.submission.evaluations.find((evaluation) => evaluation.id === review.selectedEvaluationId)
    : undefined;
  if (
    !isStudentFeedbackVisibleStatus(detail.assignment.status)
    || !review?.releasedAt
    || !selectedEvaluation
  ) {
    throw new HttpError(403, '講師確認後に返却された答案のみ閲覧できます。');
  }

  const releasedDetail: WritingStudentSubmissionDetailResponse = {
    assignment: studentSafeAssignment,
    submission: {
      ...studentSafeSubmission,
      evaluations: [projectStudentEvaluation(selectedEvaluation)],
      teacherReview: projectStudentTeacherReview(review),
    },
    ...(studentSideEffectWarning ? { sideEffectJob: studentSideEffectWarning } : {}),
  };
  return releasedDetail;
};
