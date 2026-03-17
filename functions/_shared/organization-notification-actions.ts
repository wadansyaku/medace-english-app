import {
  InterventionKind,
  type InstructorNotification,
  UserRole,
} from '../../types';
import {
  resolveInterventionOutcome,
  resolveRecommendedActionType,
} from '../../shared/retention';
import { ORGANIZATION_KPI_REACTIVATION_WINDOW_MS, rebuildOrganizationKpiSnapshots } from './organization-kpi';
import { HttpError } from './http';
import { appendOrganizationAuditLog, requireActiveOrganizationContext } from './organization-memberships';
import { readVisibleStudentIds } from './student-visibility';
import type { AppEnv, DbUserRow } from './types';
import { readAll, readFirst, toTokyoDateKey } from './storage-support';
import {
  isInterventionKind,
  isRecommendedActionType,
  readActiveOrganizationMember,
} from './organization-support';

export const handleSendInstructorNotification = async (
  env: AppEnv,
  instructor: DbUserRow,
  studentUid: string,
  message: string,
  triggerReason: string,
  usedAi: boolean,
  interventionKind: string,
  recommendedActionType?: string,
): Promise<void> => {
  const trimmedMessage = message.trim();
  const trimmedReason = triggerReason.trim() || '学習フォローアップ';
  if (!trimmedMessage) {
    throw new HttpError(400, '通知メッセージを入力してください。');
  }
  if (!isInterventionKind(interventionKind)) {
    throw new HttpError(400, '介入種別が不正です。');
  }
  if (recommendedActionType && !isRecommendedActionType(recommendedActionType)) {
    throw new HttpError(400, '推奨アクションが不正です。');
  }

  const instructorOrganization = instructor.role === UserRole.ADMIN
    ? null
    : await requireActiveOrganizationContext(env, instructor);

  const student = await readFirst<{
    id: string;
    role: string;
    organization_id: string | null;
    organization_name: string | null;
    has_learning_plan: number;
  }>(
    env,
    `SELECT
       u.id AS id,
       u.role AS role,
       membership.organization_id AS organization_id,
       org.display_name AS organization_name,
       CASE WHEN lp.user_id IS NULL THEN 0 ELSE 1 END AS has_learning_plan
     FROM users u
     LEFT JOIN learning_plans lp ON lp.user_id = u.id
     LEFT JOIN organization_memberships membership
       ON membership.user_id = u.id
      AND membership.status = 'ACTIVE'
     LEFT JOIN organizations org ON org.id = membership.organization_id
     WHERE u.id = ?`,
    studentUid,
  );
  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '通知対象の生徒が見つかりません。');
  }
  if (instructorOrganization && instructorOrganization.organizationId !== student.organization_id) {
    throw new HttpError(403, '同じ組織の生徒にのみ通知できます。');
  }
  if (instructorOrganization) {
    const visibleStudentIds = await readVisibleStudentIds(env, instructor, instructorOrganization);
    if (!visibleStudentIds.has(studentUid)) {
      throw new HttpError(403, '担当範囲の生徒にのみ通知できます。');
    }
  }

  const resolvedRecommendedActionType = recommendedActionType || resolveRecommendedActionType({
    interventionKind,
    hasLearningPlan: Boolean(student.has_learning_plan),
  });

  await env.DB.prepare(`
    INSERT INTO instructor_notifications (
      student_user_id, instructor_user_id, message, trigger_reason, delivery_channel, used_ai,
      intervention_kind, recommended_action_type, created_at
    ) VALUES (?, ?, ?, ?, 'IN_APP', ?, ?, ?, ?)
  `).bind(
    studentUid,
    instructor.id,
    trimmedMessage,
    trimmedReason,
    usedAi ? 1 : 0,
    interventionKind,
    resolvedRecommendedActionType,
    Date.now(),
  ).run();

  if (student.organization_id) {
    await appendOrganizationAuditLog(env, {
      organizationId: student.organization_id,
      actorUserId: instructor.id,
      actionType: 'INSTRUCTOR_NOTIFICATION_SAVED',
      targetType: 'student',
      targetId: studentUid,
      payload: {
        interventionKind,
        recommendedActionType: resolvedRecommendedActionType,
        usedAi,
      },
    });
    await rebuildOrganizationKpiSnapshots(env, student.organization_id, {
      dateKeys: [toTokyoDateKey(Date.now())],
    });
  }
};

export const handleGetCoachNotifications = async (env: AppEnv, userId: string): Promise<InstructorNotification[]> => {
  const rows = await readAll<{
    id: number;
    student_user_id: string;
    student_name: string;
    instructor_user_id: string;
    instructor_name: string;
    message: string;
    trigger_reason: string;
    delivery_channel: 'IN_APP';
    used_ai: number;
    intervention_kind: string;
    recommended_action_type: string | null;
    has_learning_plan: number;
    reactivated_at: number | null;
    created_at: number;
  }>(
    env,
    `SELECT
       n.id,
       n.student_user_id,
       s.display_name AS student_name,
       n.instructor_user_id,
       i.display_name AS instructor_name,
       n.message,
       n.trigger_reason,
       n.delivery_channel,
       n.used_ai,
       n.intervention_kind,
       n.recommended_action_type,
       CASE WHEN EXISTS(
         SELECT 1
         FROM learning_plans lp
         WHERE lp.user_id = n.student_user_id
       ) THEN 1 ELSE 0 END AS has_learning_plan,
       (
         SELECT MIN(h.last_studied_at)
         FROM learning_histories h
         WHERE h.user_id = n.student_user_id
           AND h.interaction_source = 'STUDY'
           AND h.last_studied_at >= n.created_at
           AND h.last_studied_at <= n.created_at + ?
       ) AS reactivated_at,
       n.created_at
     FROM instructor_notifications n
     JOIN users s ON s.id = n.student_user_id
     JOIN users i ON i.id = n.instructor_user_id
     WHERE n.student_user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 3`,
    ORGANIZATION_KPI_REACTIVATION_WINDOW_MS,
    userId,
  );

  return rows.map((row) => {
    const interventionKind = isInterventionKind(row.intervention_kind) ? row.intervention_kind : InterventionKind.MANUAL_OTHER;
    const recommendedActionType = row.recommended_action_type && isRecommendedActionType(row.recommended_action_type)
      ? row.recommended_action_type
      : resolveRecommendedActionType({
          interventionKind,
          hasLearningPlan: Boolean(row.has_learning_plan),
        });

    return {
      id: row.id,
      studentUid: row.student_user_id,
      studentName: row.student_name,
      instructorUid: row.instructor_user_id,
      instructorName: row.instructor_name,
      message: row.message,
      triggerReason: row.trigger_reason,
      deliveryChannel: row.delivery_channel,
      usedAi: Boolean(row.used_ai),
      interventionKind,
      recommendedActionType,
      interventionOutcome: resolveInterventionOutcome({
        latestInterventionAt: row.created_at,
        lastReactivatedAt: Number(row.reactivated_at || 0) || undefined,
      }),
      createdAt: row.created_at,
    };
  });
};
