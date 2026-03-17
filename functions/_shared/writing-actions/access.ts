import type { WritingSubmissionDetailResponse } from '../../../contracts/writing';
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
  const visibleStudentIds = await getVisibleStudentIds(env, user);
  if (!visibleStudentIds.has(String(getAssignmentStudentId(assignment) || ''))) {
    throw new HttpError(403, '担当範囲の課題のみ参照できます。');
  }
};

export const ensureSubmissionViewAccess = async (
  env: AppEnv,
  user: DbUserRow,
  detail: WritingSubmissionDetailResponse,
): Promise<void> => {
  await ensureAssignmentAccess(env, user, detail.assignment);

  if (
    user.role === UserRole.STUDENT
    && !detail.submission.teacherReview
    && !isStudentFeedbackVisibleStatus(detail.assignment.status)
  ) {
    throw new HttpError(403, '講師確認後に返却された答案のみ閲覧できます。');
  }
};
