import {
  type EnglishPracticeInsight,
  InterventionOutcome,
  OrganizationRole,
  type StudentSummary,
  SubscriptionPlan,
  UserRole,
  WEAKNESS_DIMENSION_LABELS,
  WeeklyMissionStatus,
} from '../../types';
import {
  getEnglishPracticeLaneForWeakness,
  getEnglishPracticeLaneLabel,
  getEnglishPracticeNextActionLabel,
  type EnglishPracticeLaneId,
} from '../../shared/englishPractice';
import {
  getContinuityBand,
  resolveInterventionOutcome,
  resolveNeedsFollowUpNow,
  resolveRecommendedActionType,
} from '../../shared/retention';
import { ORGANIZATION_KPI_REACTIVATION_WINDOW_MS } from './organization-kpi';
import { readMissionAssignmentsByStudent } from './storage-mission-actions';
import { readWeaknessProfilesByUserIds } from './weakness-actions';
import { requireActiveOrganizationContext } from './organization-memberships';
import { buildVisibleStudentFilter, readVisibleStudentIds } from './student-visibility';
import type { AppEnv, DbUserRow } from './types';
import {
  DAY_MS,
  buildInClause,
  canBypassInstructorAssignment,
  getMasteryProgressSql,
  getMasterySourceSql,
  readAll,
  toTokyoDateKeySql,
} from './storage-support';
import { isInterventionKind, isRecommendedActionType } from './organization-support';
import {
  buildRecommendedAction,
  buildStudentRiskReasons,
  resolveStudentRiskLevel,
} from './organization-risk';

interface EnglishPracticeLaneStats {
  lane: EnglishPracticeLaneId;
  total: number;
  correct: number;
  accuracy: number;
  lastPracticedAt: number;
}

const readEnglishPracticeLaneStatsByUserIds = async (
  env: AppEnv,
  userIds: string[],
  since: number,
): Promise<Map<string, EnglishPracticeLaneStats[]>> => {
  if (userIds.length === 0) return new Map();
  const rows = await readAll<{
    user_id: string;
    lane: EnglishPracticeLaneId;
    total: number;
    correct_count: number;
    last_practiced_at: number;
  }>(
    env,
    `SELECT
       user_id,
       lane,
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
       MAX(created_at) AS last_practiced_at
     FROM english_practice_attempts
     WHERE user_id IN (${buildInClause(userIds.length)})
       AND created_at >= ?
     GROUP BY user_id, lane`,
    ...userIds,
    since,
  );

  const statsByUser = new Map<string, EnglishPracticeLaneStats[]>();
  rows.forEach((row) => {
    const total = Number(row.total || 0);
    const correct = Number(row.correct_count || 0);
    const laneStats: EnglishPracticeLaneStats = {
      lane: row.lane,
      total,
      correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      lastPracticedAt: Number(row.last_practiced_at || 0),
    };
    statsByUser.set(row.user_id, [...(statsByUser.get(row.user_id) || []), laneStats]);
  });
  return statsByUser;
};

const buildEnglishPracticeInsight = (
  topWeakness: NonNullable<StudentSummary['topWeaknesses']>[number] | undefined,
  laneStats: EnglishPracticeLaneStats[] | undefined,
): EnglishPracticeInsight | undefined => {
  const weakestPracticeLane = laneStats
    ?.filter((stats) => stats.total > 0)
    .sort((left, right) => left.accuracy - right.accuracy || right.total - left.total)[0];
  if (weakestPracticeLane) {
    const laneLabel = getEnglishPracticeLaneLabel(weakestPracticeLane.lane);
    return {
      lane: weakestPracticeLane.lane,
      laneLabel,
      weaknessLabel: `${laneLabel} ${weakestPracticeLane.accuracy}%`,
      nextActionLabel: getEnglishPracticeNextActionLabel(weakestPracticeLane.lane),
      reason: `${laneLabel}の直近正答率が${weakestPracticeLane.accuracy}%です。次の短い演習として指定できます。`,
      source: 'practice_attempts',
      attemptCount: weakestPracticeLane.total,
      accuracy: weakestPracticeLane.accuracy,
      lastPracticedAt: weakestPracticeLane.lastPracticedAt || undefined,
    };
  }

  const lane = getEnglishPracticeLaneForWeakness(topWeakness);
  if (!lane || !topWeakness) return undefined;
  const laneLabel = getEnglishPracticeLaneLabel(lane);
  const weaknessLabel = WEAKNESS_DIMENSION_LABELS[topWeakness.dimension] || laneLabel;
  return {
    lane,
    laneLabel,
    weaknessLabel,
    nextActionLabel: getEnglishPracticeNextActionLabel(lane),
    reason: `${weaknessLabel}の弱点から、${laneLabel}演習へつなげると次の声かけが具体化します。`,
    source: 'weakness_profile',
  };
};

export const handleGetAllStudentsProgress = async (env: AppEnv, currentUser: DbUserRow): Promise<StudentSummary[]> => {
  const now = Date.now();
  const activeStudyWindowStart = now - 6 * DAY_MS;
  const organization = currentUser.role === UserRole.ADMIN
    ? null
    : await requireActiveOrganizationContext(env, currentUser);
  const organizationId = organization?.organizationId || null;
  const needsScopedVisibility = Boolean(
    organization
    && currentUser.role === UserRole.INSTRUCTOR
    && organization.organizationRole === OrganizationRole.INSTRUCTOR
    && !canBypassInstructorAssignment(currentUser),
  );
  const visibleStudentFilter = needsScopedVisibility
    ? buildVisibleStudentFilter(await readVisibleStudentIds(env, currentUser, organization))
    : { sql: '', bindings: [] as string[] };
  const rows = await readAll<{
    uid: string;
    name: string;
    email: string;
    subscription_plan: string | null;
    organization_name: string | null;
    cohort_id: string | null;
    cohort_name: string | null;
    total_learned: number;
    total_correct: number;
    total_attempts: number;
    last_active: number | null;
    active_study_days_7d: number;
    last_notification_at: number | null;
    last_notification_message: string | null;
    last_intervention_kind: string | null;
    last_recommended_action_type: string | null;
    last_reactivated_at: number | null;
    assigned_instructor_uid: string | null;
    assigned_instructor_name: string | null;
    assignment_updated_at: number | null;
    has_learning_plan: number;
  }>(
    env,
    `SELECT
       u.id AS uid,
       u.display_name AS name,
       u.email AS email,
       COALESCE(org.subscription_plan, u.subscription_plan) AS subscription_plan,
       COALESCE(org.display_name, u.organization_name) AS organization_name,
       cohort.id AS cohort_id,
       cohort.name AS cohort_name,
       COALESCE(SUM(CASE WHEN ${getMasteryProgressSql('h')} THEN 1 ELSE 0 END), 0) AS total_learned,
       COALESCE(SUM(h.correct_count), 0) AS total_correct,
       COALESCE(SUM(h.attempt_count), 0) AS total_attempts,
       MAX(CASE WHEN ${getMasterySourceSql('h')} THEN h.last_studied_at ELSE NULL END) AS last_active,
       COUNT(DISTINCT CASE
         WHEN ${getMasterySourceSql('h')} AND h.last_studied_at >= ? THEN ${toTokyoDateKeySql('h.last_studied_at')}
         ELSE NULL
       END) AS active_study_days_7d,
       (
         SELECT n.created_at
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_notification_at,
       (
         SELECT n.message
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_notification_message,
       (
         SELECT n.intervention_kind
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_intervention_kind,
       (
         SELECT n.recommended_action_type
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_recommended_action_type,
       (
         SELECT MIN(h2.last_studied_at)
         FROM instructor_notifications n
         JOIN learning_histories h2
           ON h2.user_id = n.student_user_id
          AND h2.interaction_source = 'STUDY'
          AND h2.last_studied_at >= n.created_at
          AND h2.last_studied_at <= n.created_at + ?
         WHERE n.student_user_id = u.id
           AND n.created_at = (
             SELECT MAX(n2.created_at)
             FROM instructor_notifications n2
             WHERE n2.student_user_id = u.id
           )
       ) AS last_reactivated_at,
       assign.instructor_user_id AS assigned_instructor_uid,
       assigned.display_name AS assigned_instructor_name,
       assign.updated_at AS assignment_updated_at,
       CASE WHEN lp.user_id IS NULL THEN 0 ELSE 1 END AS has_learning_plan
     FROM users u
     LEFT JOIN learning_histories h ON h.user_id = u.id
     LEFT JOIN learning_plans lp ON lp.user_id = u.id
     LEFT JOIN student_instructor_assignments assign ON assign.student_user_id = u.id
     LEFT JOIN users assigned ON assigned.id = assign.instructor_user_id
     LEFT JOIN organization_cohort_students cohort_student ON cohort_student.student_user_id = u.id
     LEFT JOIN organization_cohorts cohort ON cohort.id = cohort_student.cohort_id
     LEFT JOIN organization_memberships student_membership
       ON student_membership.user_id = u.id
      AND student_membership.status = 'ACTIVE'
     LEFT JOIN organizations org ON org.id = student_membership.organization_id
     WHERE u.role = ?
       AND (? IS NULL OR student_membership.organization_id = ?)
       ${visibleStudentFilter.sql}
     GROUP BY
       u.id,
       u.display_name,
       u.email,
       org.subscription_plan,
       org.display_name,
       cohort.id,
       cohort.name,
       assign.instructor_user_id,
       assigned.display_name,
       assign.updated_at,
       lp.user_id
     ORDER BY last_active DESC, name ASC`,
    activeStudyWindowStart,
    ORGANIZATION_KPI_REACTIVATION_WINDOW_MS,
    UserRole.STUDENT,
    organizationId,
    organizationId,
    ...visibleStudentFilter.bindings,
  );
  const missionAssignmentsByStudent = await readMissionAssignmentsByStudent(env, rows.map((row) => row.uid));
  const weaknessProfilesByStudent = await readWeaknessProfilesByUserIds(env, rows.map((row) => row.uid));
  const englishPracticeStatsByStudent = await readEnglishPracticeLaneStatsByUserIds(
    env,
    rows.map((row) => row.uid),
    now - 30 * DAY_MS,
  );

  return rows.map((row) => {
    const missionAssignment = missionAssignmentsByStudent.get(row.uid);
    const weaknessProfile = weaknessProfilesByStudent.get(row.uid);
    const englishPracticeInsight = buildEnglishPracticeInsight(
      weaknessProfile?.topWeaknesses[0],
      englishPracticeStatsByStudent.get(row.uid),
    );
    const missionProgress = missionAssignment?.progress;
    const missionOverdue = Boolean(
      missionProgress?.overdue
      || missionProgress?.status === WeeklyMissionStatus.OVERDUE,
    );
    const lastActive = Number(row.last_active || 0);
    const daysSinceActive = lastActive > 0 ? Math.floor((now - lastActive) / DAY_MS) : Number.POSITIVE_INFINITY;
    const accuracy = row.total_attempts ? Number(row.total_correct || 0) / Number(row.total_attempts || 1) : 0;
    const activeStudyDays7d = Number(row.active_study_days_7d || 0);
    const continuityBand = getContinuityBand(activeStudyDays7d);
    const latestInterventionAt = Number(row.last_notification_at || 0) || undefined;
    const lastReactivatedAt = Number(row.last_reactivated_at || 0) || undefined;
    const latestInterventionKind = row.last_intervention_kind && isInterventionKind(row.last_intervention_kind)
      ? row.last_intervention_kind
      : undefined;
    const latestInterventionOutcome: InterventionOutcome | undefined = resolveInterventionOutcome({
      latestInterventionAt,
      lastReactivatedAt,
      now,
    });
    const latestRecommendedActionType = row.last_recommended_action_type && isRecommendedActionType(row.last_recommended_action_type)
      ? row.last_recommended_action_type
      : (latestInterventionAt
        ? resolveRecommendedActionType({
            interventionKind: latestInterventionKind,
            hasLearningPlan: Boolean(row.has_learning_plan),
          })
        : undefined);
    const riskLevel = resolveStudentRiskLevel(daysSinceActive);
    const needsFollowUpNow = resolveNeedsFollowUpNow({
      riskLevel,
      latestInterventionAt,
      latestInterventionOutcome,
      missionOverdue,
      now,
    });
    const hasLearningPlan = Boolean(row.has_learning_plan);
    const riskReasons = buildStudentRiskReasons({
      daysSinceActive,
      activeStudyDays7d,
      accuracy,
      hasLearningPlan,
      missionOverdue,
      missionStatus: missionProgress?.status,
      riskLevel,
      latestInterventionAt,
      latestInterventionOutcome,
      now,
    });

    return {
      uid: row.uid,
      name: row.name,
      email: row.email,
      totalLearned: Number(row.total_learned || 0),
      totalAttempts: Number(row.total_attempts || 0),
      lastActive,
      riskLevel,
      accuracy,
      subscriptionPlan: (row.subscription_plan as SubscriptionPlan | null) || SubscriptionPlan.TOC_FREE,
      organizationName: row.organization_name || undefined,
      cohortId: row.cohort_id || undefined,
      cohortName: row.cohort_name || undefined,
      lastNotificationAt: latestInterventionAt,
      lastNotificationMessage: row.last_notification_message || undefined,
      hasReactivatedSinceNotification: latestInterventionOutcome === InterventionOutcome.REACTIVATED,
      lastReactivatedAt,
      assignedInstructorUid: row.assigned_instructor_uid || undefined,
      assignedInstructorName: row.assigned_instructor_name || undefined,
      assignmentUpdatedAt: Number(row.assignment_updated_at || 0) || undefined,
      hasLearningPlan,
      activeStudyDays7d,
      continuityBand,
      latestInterventionAt,
      latestInterventionKind,
      latestInterventionOutcome,
      latestRecommendedActionType,
      needsFollowUpNow,
      primaryMissionStatus: missionProgress?.status,
      primaryMissionTrack: missionAssignment?.mission.learningTrack,
      primaryMissionTitle: missionAssignment?.mission.title,
      primaryMissionCompletionRate: missionProgress?.completionRate,
      missionDueAt: missionAssignment?.mission.dueAt,
      missionOverdue,
      missionLastActivityAt: missionProgress?.lastActivityAt,
      topWeaknesses: weaknessProfile?.topWeaknesses,
      weaknessProfileUpdatedAt: weaknessProfile?.updatedAt,
      englishPracticeInsight,
      riskReasons,
      recommendedAction: buildRecommendedAction({
        riskLevel,
        hasLearningPlan,
        latestInterventionOutcome,
        needsFollowUpNow,
        missionOverdue,
        missionStatus: missionProgress?.status,
      }),
    };
  });
};
