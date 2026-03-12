import type { WritingSubmissionDetailResponse } from '../../../contracts/writing';
import {
  SubscriptionPlan,
  UserRole,
  WritingAssignmentStatus as AssignmentStatus,
} from '../../../types';
import { handleGetAllStudentsProgress } from '../storage-organization-actions';
import { HttpError } from '../http';
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
    || !user.organization_name
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

export const getVisibleStudentIds = async (env: AppEnv, user: DbUserRow): Promise<Set<string>> => {
  if (user.role === UserRole.STUDENT) {
    return new Set([user.id]);
  }

  const students = await handleGetAllStudentsProgress(env, user);
  return new Set(students.map((student) => student.uid));
};

const getAssignmentStudentId = (assignment: AssignmentAccessTarget): string | undefined => (
  assignment.student_user_id || assignment.studentUid
);

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
