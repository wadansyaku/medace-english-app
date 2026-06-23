import {
  AI_ACTION_ESTIMATES,
} from '../../config/subscription';
import type {
  AdminAiEconomicsSummary,
  ProductKpiDailySnapshot,
} from '../../types';
export { buildActivationFunnel } from '../../shared/adminActivationFunnel';
import { formatDateKey, formatMonthKey, getTokyoMonthRange } from '../../utils/date';
import { rebuildOrganizationKpiSnapshots } from './organization-kpi';
import { readAll, readFirst, DAY_MS } from './storage-support';
import type { AppEnv } from './types';

const ACTIVE_USER_FILTER = `email NOT GLOB 'demo_*@medace.app'`;

interface DbProductKpiDailySnapshotRow {
  date_key: string;
  total_users: number;
  active_students_1d: number;
  active_students_7d: number;
  active_students_30d: number;
  total_organizations: number;
  active_organizations_30d: number;
  study_sessions_started_30d: number;
  study_sessions_finished_30d: number;
  quiz_sessions_started_30d: number;
  spelling_checks_started_30d: number;
  commercial_form_open_count_30d: number;
  commercial_request_count_30d: number;
  organizations_with_cohort_count: number;
  organizations_with_assignment_count: number;
  organizations_with_mission_count: number;
  organizations_with_notification_count: number;
  organizations_with_writing_assignment_count: number;
  organizations_with_writing_submission_count: number;
  organizations_with_writing_review_count: number;
  organizations_created_cohort_30d: number;
  organizations_assigned_student_30d: number;
  organizations_created_first_mission_30d: number;
  organizations_sent_notification_30d: number;
  organizations_with_writing_assignment_30d: number;
  organizations_with_writing_submission_30d: number;
  organizations_with_writing_review_30d: number;
  writing_assignments_created_30d: number;
  writing_submissions_received_30d: number;
  writing_reviews_completed_30d: number;
  generation_count_30d: number;
  cache_hit_count_30d: number;
  example_generation_count_30d: number;
  example_cache_hit_count_30d: number;
  image_generation_count_30d: number;
  image_cache_hit_count_30d: number;
  estimated_ai_cost_milli_yen_30d: number;
  estimated_provider_ai_cost_milli_yen_30d: number;
  estimated_avoided_cost_milli_yen_30d: number;
  created_at: number;
  updated_at: number;
}

export interface ProductAnalyticsSnapshotRunResult {
  dateKey: string;
  organizationSnapshotsUpdated: number;
  snapshot: ProductKpiDailySnapshot;
}

const toProductKpiDailySnapshot = (row?: Partial<DbProductKpiDailySnapshotRow> | null): ProductKpiDailySnapshot => ({
  dateKey: row?.date_key || formatDateKey(Date.now()),
  totalUsers: Number(row?.total_users || 0),
  activeStudents1d: Number(row?.active_students_1d || 0),
  activeStudents7d: Number(row?.active_students_7d || 0),
  activeStudents30d: Number(row?.active_students_30d || 0),
  totalOrganizations: Number(row?.total_organizations || 0),
  activeOrganizations30d: Number(row?.active_organizations_30d || 0),
  studySessionsStarted30d: Number(row?.study_sessions_started_30d || 0),
  studySessionsFinished30d: Number(row?.study_sessions_finished_30d || 0),
  quizSessionsStarted30d: Number(row?.quiz_sessions_started_30d || 0),
  spellingChecksStarted30d: Number(row?.spelling_checks_started_30d || 0),
  commercialFormOpenCount30d: Number(row?.commercial_form_open_count_30d || 0),
  commercialRequestCount30d: Number(row?.commercial_request_count_30d || 0),
  organizationsWithCohortCount: Number(row?.organizations_with_cohort_count || 0),
  organizationsWithAssignmentCount: Number(row?.organizations_with_assignment_count || 0),
  organizationsWithMissionCount: Number(row?.organizations_with_mission_count || 0),
  organizationsWithNotificationCount: Number(row?.organizations_with_notification_count || 0),
  organizationsWithWritingAssignmentCount: Number(row?.organizations_with_writing_assignment_count || 0),
  organizationsWithWritingSubmissionCount: Number(row?.organizations_with_writing_submission_count || 0),
  organizationsWithWritingReviewCount: Number(row?.organizations_with_writing_review_count || 0),
  organizationsCreatedCohort30d: Number(row?.organizations_created_cohort_30d || 0),
  organizationsAssignedStudent30d: Number(row?.organizations_assigned_student_30d || 0),
  organizationsCreatedFirstMission30d: Number(row?.organizations_created_first_mission_30d || 0),
  organizationsSentNotification30d: Number(row?.organizations_sent_notification_30d || 0),
  organizationsWithWritingAssignment30d: Number(row?.organizations_with_writing_assignment_30d || 0),
  organizationsWithWritingSubmission30d: Number(row?.organizations_with_writing_submission_30d || 0),
  organizationsWithWritingReview30d: Number(row?.organizations_with_writing_review_30d || 0),
  writingAssignmentsCreated30d: Number(row?.writing_assignments_created_30d || 0),
  writingSubmissionsReceived30d: Number(row?.writing_submissions_received_30d || 0),
  writingReviewsCompleted30d: Number(row?.writing_reviews_completed_30d || 0),
  generationCount30d: Number(row?.generation_count_30d || 0),
  cacheHitCount30d: Number(row?.cache_hit_count_30d || 0),
  exampleGenerationCount30d: Number(row?.example_generation_count_30d || 0),
  exampleCacheHitCount30d: Number(row?.example_cache_hit_count_30d || 0),
  imageGenerationCount30d: Number(row?.image_generation_count_30d || 0),
  imageCacheHitCount30d: Number(row?.image_cache_hit_count_30d || 0),
  estimatedAiCostMilliYen30d: Number(row?.estimated_ai_cost_milli_yen_30d || 0),
  estimatedProviderAiCostMilliYen30d: Number(row?.estimated_provider_ai_cost_milli_yen_30d || 0),
  estimatedAvoidedCostMilliYen30d: Number(row?.estimated_avoided_cost_milli_yen_30d || 0),
  createdAt: Number(row?.created_at || 0),
  updatedAt: Number(row?.updated_at || 0),
});

const readCount = async (env: AppEnv, sql: string, ...bindings: unknown[]): Promise<number> => {
  const row = await readFirst<{ count: number }>(env, sql, ...bindings);
  return Number(row?.count || 0);
};

const calculateRatio = (numerator: number, denominator: number): number => (
  denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
);

export const buildAdminAiEconomicsSummary = (
  monthKey: string,
  values: {
    generationCount: number;
    cacheHitCount: number;
    exampleGenerationCount: number;
    exampleCacheHitCount: number;
    imageGenerationCount: number;
    imageCacheHitCount: number;
    estimatedCostMilliYen: number;
    estimatedProviderCostMilliYen: number;
    avoidedCostMilliYen: number;
  },
): AdminAiEconomicsSummary => ({
  monthKey,
  generationCount: values.generationCount,
  cacheHitCount: values.cacheHitCount,
  cacheHitRatio: calculateRatio(values.cacheHitCount, values.cacheHitCount + values.generationCount),
  exampleCacheHitRatio: calculateRatio(values.exampleCacheHitCount, values.exampleCacheHitCount + values.exampleGenerationCount),
  imageCacheHitRatio: calculateRatio(values.imageCacheHitCount, values.imageCacheHitCount + values.imageGenerationCount),
  estimatedCostMilliYen: values.estimatedCostMilliYen,
  estimatedProviderCostMilliYen: values.estimatedProviderCostMilliYen,
  avoidedCostMilliYen: values.avoidedCostMilliYen,
});

export const readLatestProductKpiSnapshot = async (
  env: AppEnv,
): Promise<ProductKpiDailySnapshot> => {
  const row = await readFirst<DbProductKpiDailySnapshotRow>(
    env,
    `SELECT *
     FROM product_kpi_daily_snapshots
     ORDER BY date_key DESC
     LIMIT 1`,
  );
  return toProductKpiDailySnapshot(row);
};

export const readCurrentMonthAiEconomics = async (
  env: AppEnv,
  monthKey = formatMonthKey(Date.now()),
): Promise<AdminAiEconomicsSummary> => {
  const { start: monthStart, end: monthEnd } = getTokyoMonthRange(monthKey);

  const aiUsageRow = await readFirst<{
    generation_count: number;
    estimated_cost: number;
    estimated_provider_cost: number;
  }>(
    env,
    `SELECT
       COUNT(*) AS generation_count,
       COALESCE(SUM(estimated_cost_milli_yen), 0) AS estimated_cost,
       COALESCE(SUM(estimated_provider_cost_milli_yen), 0) AS estimated_provider_cost
     FROM ai_usage_events
     WHERE month_key = ?`,
    monthKey,
  );
  const hintRow = await readFirst<{
    cache_hit_count: number;
    example_generation_count: number;
    example_cache_hit_count: number;
    image_generation_count: number;
    image_cache_hit_count: number;
  }>(
    env,
    `SELECT
       SUM(CASE WHEN event_name IN ('word_hint_example_cache_hit', 'word_hint_image_cache_hit') THEN 1 ELSE 0 END) AS cache_hit_count,
       SUM(CASE WHEN event_name = 'word_hint_example_generated' THEN 1 ELSE 0 END) AS example_generation_count,
       SUM(CASE WHEN event_name = 'word_hint_example_cache_hit' THEN 1 ELSE 0 END) AS example_cache_hit_count,
       SUM(CASE WHEN event_name = 'word_hint_image_generated' THEN 1 ELSE 0 END) AS image_generation_count,
       SUM(CASE WHEN event_name = 'word_hint_image_cache_hit' THEN 1 ELSE 0 END) AS image_cache_hit_count
     FROM product_events
     WHERE created_at >= ?
       AND created_at < ?`,
    monthStart,
    monthEnd,
  );

  const exampleCacheHitCount = Number(hintRow?.example_cache_hit_count || 0);
  const imageCacheHitCount = Number(hintRow?.image_cache_hit_count || 0);
  const avoidedCostMilliYen = (
    exampleCacheHitCount * AI_ACTION_ESTIMATES.generateGeminiSentence.estimatedCostMilliYen
    + imageCacheHitCount * AI_ACTION_ESTIMATES.generateWordImage.estimatedCostMilliYen
  );

  return buildAdminAiEconomicsSummary(monthKey, {
    generationCount: Number(aiUsageRow?.generation_count || 0),
    cacheHitCount: Number(hintRow?.cache_hit_count || 0),
    exampleGenerationCount: Number(hintRow?.example_generation_count || 0),
    exampleCacheHitCount,
    imageGenerationCount: Number(hintRow?.image_generation_count || 0),
    imageCacheHitCount,
    estimatedCostMilliYen: Number(aiUsageRow?.estimated_cost || 0),
    estimatedProviderCostMilliYen: Number(aiUsageRow?.estimated_provider_cost || 0),
    avoidedCostMilliYen,
  });
};

export const runProductAnalyticsSnapshotJob = async (
  env: AppEnv,
  now = Date.now(),
): Promise<ProductAnalyticsSnapshotRunResult> => {
  const dateKey = formatDateKey(now);
  const currentMonthKey = formatMonthKey(now);
  const active1dSince = now - DAY_MS;
  const active7dSince = now - 7 * DAY_MS;
  const active30dSince = now - 30 * DAY_MS;
  const organizationRows = await readAll<{ id: string }>(env, 'SELECT id FROM organizations ORDER BY id ASC');

  await Promise.all(
    organizationRows.map(({ id }) => rebuildOrganizationKpiSnapshots(env, id, { dateKeys: [dateKey] })),
  );

  const [
    totalUsers,
    activeStudents1d,
    activeStudents7d,
    activeStudents30d,
    totalOrganizations,
    activeOrganizations30d,
    organizationsWithCohortCount,
    organizationsWithAssignmentCount,
    organizationsWithMissionCount,
    organizationsWithNotificationCount,
    organizationsWithWritingAssignmentCount,
    organizationsWithWritingSubmissionCount,
    organizationsWithWritingReviewCount,
    organizationsCreatedCohort30d,
    organizationsAssignedStudent30d,
    organizationsCreatedFirstMission30d,
    organizationsSentNotification30d,
    organizationsWithWritingAssignment30d,
    organizationsWithWritingSubmission30d,
    organizationsWithWritingReview30d,
    writingAssignmentsCreated30d,
    writingSubmissionsReceived30d,
    writingReviewsCompleted30d,
    studySessionsStarted30d,
    studySessionsFinished30d,
    quizSessionsStarted30d,
    spellingChecksStarted30d,
    commercialFormOpenCount30d,
    commercialRequestCount30d,
    generationCount30d,
    estimatedAiCostMilliYen30d,
    estimatedProviderAiCostMilliYen30d,
  ] = await Promise.all([
    readCount(env, `SELECT COUNT(*) AS count FROM users WHERE ${ACTIVE_USER_FILTER}`),
    readCount(
      env,
      `SELECT COUNT(DISTINCT e.user_id) AS count
       FROM learning_interaction_events e
       JOIN users u ON u.id = e.user_id
       WHERE u.role = 'STUDENT'
         AND ${ACTIVE_USER_FILTER}
         AND e.created_at >= ?`,
      active1dSince,
    ),
    readCount(
      env,
      `SELECT COUNT(DISTINCT e.user_id) AS count
       FROM learning_interaction_events e
       JOIN users u ON u.id = e.user_id
       WHERE u.role = 'STUDENT'
         AND ${ACTIVE_USER_FILTER}
         AND e.created_at >= ?`,
      active7dSince,
    ),
    readCount(
      env,
      `SELECT COUNT(DISTINCT e.user_id) AS count
       FROM learning_interaction_events e
       JOIN users u ON u.id = e.user_id
       WHERE u.role = 'STUDENT'
         AND ${ACTIVE_USER_FILTER}
         AND e.created_at >= ?`,
      active30dSince,
    ),
    readCount(env, 'SELECT COUNT(*) AS count FROM organizations'),
    readCount(
      env,
      `SELECT COUNT(DISTINCT organization_id) AS count
       FROM (
         SELECT membership.organization_id AS organization_id
         FROM learning_interaction_events e
         JOIN organization_memberships membership
           ON membership.user_id = e.user_id
          AND membership.status = 'ACTIVE'
         WHERE e.created_at >= ?
         UNION
         SELECT organization_id
         FROM product_events
         WHERE organization_id IS NOT NULL
           AND created_at >= ?
         UNION
         SELECT membership.organization_id AS organization_id
         FROM instructor_notifications n
         JOIN organization_memberships membership
           ON membership.user_id = n.student_user_id
          AND membership.status = 'ACTIVE'
         WHERE n.created_at >= ?
       )`,
      active30dSince,
      active30dSince,
      active30dSince,
    ),
    readCount(env, 'SELECT COUNT(DISTINCT organization_id) AS count FROM organization_cohorts'),
    readCount(
      env,
      `SELECT COUNT(DISTINCT membership.organization_id) AS count
       FROM student_instructor_assignments a
       JOIN organization_memberships membership
         ON membership.user_id = a.student_user_id
        AND membership.status = 'ACTIVE'`,
    ),
    readCount(
      env,
      `SELECT COUNT(DISTINCT m.organization_id) AS count
       FROM weekly_mission_assignments a
       JOIN weekly_missions m ON m.id = a.mission_id
       WHERE m.organization_id IS NOT NULL`,
    ),
    readCount(
      env,
      `SELECT COUNT(DISTINCT membership.organization_id) AS count
       FROM instructor_notifications n
       JOIN organization_memberships membership
         ON membership.user_id = n.student_user_id
        AND membership.status = 'ACTIVE'`,
    ),
    readCount(
      env,
      `SELECT COUNT(DISTINCT resolved_organization_id) AS count
       FROM (
         SELECT COALESCE(w.organization_id, o.id) AS resolved_organization_id
         FROM writing_assignments w
         LEFT JOIN organizations o
           ON w.organization_id IS NULL
          AND LOWER(TRIM(w.organization_name)) = o.name_key
         WHERE w.status != 'DRAFT'
       )
       WHERE resolved_organization_id IS NOT NULL`,
    ),
    readCount(
      env,
      `SELECT COUNT(DISTINCT resolved_organization_id) AS count
       FROM (
         SELECT COALESCE(w.organization_id, o.id) AS resolved_organization_id
         FROM writing_submissions s
         JOIN writing_assignments w ON w.id = s.assignment_id
         LEFT JOIN organizations o
           ON w.organization_id IS NULL
          AND LOWER(TRIM(w.organization_name)) = o.name_key
       )
       WHERE resolved_organization_id IS NOT NULL`,
    ),
    readCount(
      env,
      `SELECT COUNT(DISTINCT resolved_organization_id) AS count
       FROM (
         SELECT COALESCE(w.organization_id, o.id) AS resolved_organization_id
         FROM writing_teacher_reviews r
         JOIN writing_submissions s ON s.id = r.submission_id
         JOIN writing_assignments w ON w.id = s.assignment_id
         LEFT JOIN organizations o
           ON w.organization_id IS NULL
          AND LOWER(TRIM(w.organization_name)) = o.name_key
       )
       WHERE resolved_organization_id IS NOT NULL`,
    ),
    readCount(env, `SELECT COUNT(DISTINCT organization_id) AS count FROM product_events WHERE event_name = 'group_admin_created_cohort' AND organization_id IS NOT NULL AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(DISTINCT organization_id) AS count FROM product_events WHERE event_name = 'group_admin_assigned_student' AND organization_id IS NOT NULL AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(DISTINCT organization_id) AS count FROM product_events WHERE event_name = 'group_admin_created_first_mission' AND organization_id IS NOT NULL AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(DISTINCT organization_id) AS count FROM product_events WHERE event_name = 'instructor_notification_sent' AND organization_id IS NOT NULL AND created_at >= ?`, active30dSince),
    readCount(
      env,
      `SELECT COUNT(DISTINCT resolved_organization_id) AS count
       FROM (
         SELECT COALESCE(w.organization_id, o.id) AS resolved_organization_id
         FROM writing_assignments w
         LEFT JOIN organizations o
           ON w.organization_id IS NULL
          AND LOWER(TRIM(w.organization_name)) = o.name_key
         WHERE w.status != 'DRAFT'
           AND COALESCE(w.issued_at, w.updated_at) >= ?
       )
       WHERE resolved_organization_id IS NOT NULL`,
      active30dSince,
    ),
    readCount(env, `SELECT COUNT(DISTINCT organization_id) AS count FROM product_events WHERE event_name = 'writing_submission_received' AND organization_id IS NOT NULL AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(DISTINCT organization_id) AS count FROM product_events WHERE event_name = 'writing_review_completed' AND organization_id IS NOT NULL AND created_at >= ?`, active30dSince),
    readCount(
      env,
      `SELECT COUNT(*) AS count
       FROM writing_assignments
       WHERE status != 'DRAFT'
         AND COALESCE(issued_at, updated_at) >= ?`,
      active30dSince,
    ),
    readCount(env, `SELECT COUNT(*) AS count FROM product_events WHERE event_name = 'writing_submission_received' AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM product_events WHERE event_name = 'writing_review_completed' AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM product_events WHERE event_name = 'study_session_started' AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM product_events WHERE event_name = 'study_session_finished' AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM product_events WHERE event_name = 'quiz_session_started' AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM product_events WHERE event_name = 'spelling_check_started' AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM product_events WHERE event_name = 'commercial_form_opened' AND created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM commercial_requests WHERE created_at >= ?`, active30dSince),
    readCount(env, `SELECT COUNT(*) AS count FROM ai_usage_events WHERE created_at >= ?`, active30dSince),
    readCount(env, `SELECT COALESCE(SUM(estimated_cost_milli_yen), 0) AS count FROM ai_usage_events WHERE created_at >= ?`, active30dSince),
    readCount(env, `SELECT COALESCE(SUM(estimated_provider_cost_milli_yen), 0) AS count FROM ai_usage_events WHERE created_at >= ?`, active30dSince),
  ]);

  const hintEventRow = await readFirst<{
    cache_hit_count: number;
    example_generation_count: number;
    example_cache_hit_count: number;
    image_generation_count: number;
    image_cache_hit_count: number;
  }>(
    env,
    `SELECT
       SUM(CASE WHEN event_name IN ('word_hint_example_cache_hit', 'word_hint_image_cache_hit') THEN 1 ELSE 0 END) AS cache_hit_count,
       SUM(CASE WHEN event_name = 'word_hint_example_generated' THEN 1 ELSE 0 END) AS example_generation_count,
       SUM(CASE WHEN event_name = 'word_hint_example_cache_hit' THEN 1 ELSE 0 END) AS example_cache_hit_count,
       SUM(CASE WHEN event_name = 'word_hint_image_generated' THEN 1 ELSE 0 END) AS image_generation_count,
       SUM(CASE WHEN event_name = 'word_hint_image_cache_hit' THEN 1 ELSE 0 END) AS image_cache_hit_count
     FROM product_events
     WHERE created_at >= ?`,
    active30dSince,
  );

  const exampleGenerationCount30d = Number(hintEventRow?.example_generation_count || 0);
  const exampleCacheHitCount30d = Number(hintEventRow?.example_cache_hit_count || 0);
  const imageGenerationCount30d = Number(hintEventRow?.image_generation_count || 0);
  const imageCacheHitCount30d = Number(hintEventRow?.image_cache_hit_count || 0);
  const cacheHitCount30d = Number(hintEventRow?.cache_hit_count || 0);
  const estimatedAvoidedCostMilliYen30d = (
    exampleCacheHitCount30d * AI_ACTION_ESTIMATES.generateGeminiSentence.estimatedCostMilliYen
    + imageCacheHitCount30d * AI_ACTION_ESTIMATES.generateWordImage.estimatedCostMilliYen
  );

  await env.DB.prepare(`
    INSERT INTO product_kpi_daily_snapshots (
      date_key,
      total_users,
      active_students_1d,
      active_students_7d,
      active_students_30d,
      total_organizations,
      active_organizations_30d,
      study_sessions_started_30d,
      study_sessions_finished_30d,
      quiz_sessions_started_30d,
      spelling_checks_started_30d,
      commercial_form_open_count_30d,
      commercial_request_count_30d,
      organizations_with_cohort_count,
      organizations_with_assignment_count,
      organizations_with_mission_count,
      organizations_with_notification_count,
      organizations_with_writing_assignment_count,
      organizations_with_writing_submission_count,
      organizations_with_writing_review_count,
      organizations_created_cohort_30d,
      organizations_assigned_student_30d,
      organizations_created_first_mission_30d,
      organizations_sent_notification_30d,
      organizations_with_writing_assignment_30d,
      organizations_with_writing_submission_30d,
      organizations_with_writing_review_30d,
      writing_assignments_created_30d,
      writing_submissions_received_30d,
      writing_reviews_completed_30d,
      generation_count_30d,
      cache_hit_count_30d,
      example_generation_count_30d,
      example_cache_hit_count_30d,
      image_generation_count_30d,
      image_cache_hit_count_30d,
      estimated_ai_cost_milli_yen_30d,
      estimated_provider_ai_cost_milli_yen_30d,
      estimated_avoided_cost_milli_yen_30d,
      created_at,
      updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(date_key) DO UPDATE SET
      total_users = excluded.total_users,
      active_students_1d = excluded.active_students_1d,
      active_students_7d = excluded.active_students_7d,
      active_students_30d = excluded.active_students_30d,
      total_organizations = excluded.total_organizations,
      active_organizations_30d = excluded.active_organizations_30d,
      study_sessions_started_30d = excluded.study_sessions_started_30d,
      study_sessions_finished_30d = excluded.study_sessions_finished_30d,
      quiz_sessions_started_30d = excluded.quiz_sessions_started_30d,
      spelling_checks_started_30d = excluded.spelling_checks_started_30d,
      commercial_form_open_count_30d = excluded.commercial_form_open_count_30d,
      commercial_request_count_30d = excluded.commercial_request_count_30d,
      organizations_with_cohort_count = excluded.organizations_with_cohort_count,
      organizations_with_assignment_count = excluded.organizations_with_assignment_count,
      organizations_with_mission_count = excluded.organizations_with_mission_count,
      organizations_with_notification_count = excluded.organizations_with_notification_count,
      organizations_with_writing_assignment_count = excluded.organizations_with_writing_assignment_count,
      organizations_with_writing_submission_count = excluded.organizations_with_writing_submission_count,
      organizations_with_writing_review_count = excluded.organizations_with_writing_review_count,
      organizations_created_cohort_30d = excluded.organizations_created_cohort_30d,
      organizations_assigned_student_30d = excluded.organizations_assigned_student_30d,
      organizations_created_first_mission_30d = excluded.organizations_created_first_mission_30d,
      organizations_sent_notification_30d = excluded.organizations_sent_notification_30d,
      organizations_with_writing_assignment_30d = excluded.organizations_with_writing_assignment_30d,
      organizations_with_writing_submission_30d = excluded.organizations_with_writing_submission_30d,
      organizations_with_writing_review_30d = excluded.organizations_with_writing_review_30d,
      writing_assignments_created_30d = excluded.writing_assignments_created_30d,
      writing_submissions_received_30d = excluded.writing_submissions_received_30d,
      writing_reviews_completed_30d = excluded.writing_reviews_completed_30d,
      generation_count_30d = excluded.generation_count_30d,
      cache_hit_count_30d = excluded.cache_hit_count_30d,
      example_generation_count_30d = excluded.example_generation_count_30d,
      example_cache_hit_count_30d = excluded.example_cache_hit_count_30d,
      image_generation_count_30d = excluded.image_generation_count_30d,
      image_cache_hit_count_30d = excluded.image_cache_hit_count_30d,
      estimated_ai_cost_milli_yen_30d = excluded.estimated_ai_cost_milli_yen_30d,
      estimated_provider_ai_cost_milli_yen_30d = excluded.estimated_provider_ai_cost_milli_yen_30d,
      estimated_avoided_cost_milli_yen_30d = excluded.estimated_avoided_cost_milli_yen_30d,
      updated_at = excluded.updated_at
  `).bind(
    dateKey,
    totalUsers,
    activeStudents1d,
    activeStudents7d,
    activeStudents30d,
    totalOrganizations,
    activeOrganizations30d,
    studySessionsStarted30d,
    studySessionsFinished30d,
    quizSessionsStarted30d,
    spellingChecksStarted30d,
    commercialFormOpenCount30d,
    commercialRequestCount30d,
    organizationsWithCohortCount,
    organizationsWithAssignmentCount,
    organizationsWithMissionCount,
    organizationsWithNotificationCount,
    organizationsWithWritingAssignmentCount,
    organizationsWithWritingSubmissionCount,
    organizationsWithWritingReviewCount,
    organizationsCreatedCohort30d,
    organizationsAssignedStudent30d,
    organizationsCreatedFirstMission30d,
    organizationsSentNotification30d,
    organizationsWithWritingAssignment30d,
    organizationsWithWritingSubmission30d,
    organizationsWithWritingReview30d,
    writingAssignmentsCreated30d,
    writingSubmissionsReceived30d,
    writingReviewsCompleted30d,
    generationCount30d,
    cacheHitCount30d,
    exampleGenerationCount30d,
    exampleCacheHitCount30d,
    imageGenerationCount30d,
    imageCacheHitCount30d,
    estimatedAiCostMilliYen30d,
    estimatedProviderAiCostMilliYen30d,
    estimatedAvoidedCostMilliYen30d,
    now,
    now,
  ).run();

  const snapshot = toProductKpiDailySnapshot({
    date_key: dateKey,
    total_users: totalUsers,
    active_students_1d: activeStudents1d,
    active_students_7d: activeStudents7d,
    active_students_30d: activeStudents30d,
    total_organizations: totalOrganizations,
    active_organizations_30d: activeOrganizations30d,
    study_sessions_started_30d: studySessionsStarted30d,
    study_sessions_finished_30d: studySessionsFinished30d,
    quiz_sessions_started_30d: quizSessionsStarted30d,
    spelling_checks_started_30d: spellingChecksStarted30d,
    commercial_form_open_count_30d: commercialFormOpenCount30d,
    commercial_request_count_30d: commercialRequestCount30d,
    organizations_with_cohort_count: organizationsWithCohortCount,
    organizations_with_assignment_count: organizationsWithAssignmentCount,
    organizations_with_mission_count: organizationsWithMissionCount,
    organizations_with_notification_count: organizationsWithNotificationCount,
    organizations_with_writing_assignment_count: organizationsWithWritingAssignmentCount,
    organizations_with_writing_submission_count: organizationsWithWritingSubmissionCount,
    organizations_with_writing_review_count: organizationsWithWritingReviewCount,
    organizations_created_cohort_30d: organizationsCreatedCohort30d,
    organizations_assigned_student_30d: organizationsAssignedStudent30d,
    organizations_created_first_mission_30d: organizationsCreatedFirstMission30d,
    organizations_sent_notification_30d: organizationsSentNotification30d,
    organizations_with_writing_assignment_30d: organizationsWithWritingAssignment30d,
    organizations_with_writing_submission_30d: organizationsWithWritingSubmission30d,
    organizations_with_writing_review_30d: organizationsWithWritingReview30d,
    writing_assignments_created_30d: writingAssignmentsCreated30d,
    writing_submissions_received_30d: writingSubmissionsReceived30d,
    writing_reviews_completed_30d: writingReviewsCompleted30d,
    generation_count_30d: generationCount30d,
    cache_hit_count_30d: cacheHitCount30d,
    example_generation_count_30d: exampleGenerationCount30d,
    example_cache_hit_count_30d: exampleCacheHitCount30d,
    image_generation_count_30d: imageGenerationCount30d,
    image_cache_hit_count_30d: imageCacheHitCount30d,
    estimated_ai_cost_milli_yen_30d: estimatedAiCostMilliYen30d,
    estimated_provider_ai_cost_milli_yen_30d: estimatedProviderAiCostMilliYen30d,
    estimated_avoided_cost_milli_yen_30d: estimatedAvoidedCostMilliYen30d,
    created_at: now,
    updated_at: now,
  });

  return {
    dateKey,
    organizationSnapshotsUpdated: organizationRows.length,
    snapshot,
  };
};
