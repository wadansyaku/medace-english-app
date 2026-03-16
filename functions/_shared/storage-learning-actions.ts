import { ActivityLog, LearningPlan, LearningPreference, LearningPreferenceIntensity, type LearningTaskIntentType, UserProfile } from '../../types';
import { MASTERY_INTERACTION_SOURCE } from '../../shared/learningHistory';
import { resolveBookProgressionBand, appendLearningInteractionEvent, rebuildWeaknessSignalsForUser } from './weakness-actions';
import { formatDateKey } from '../../utils/date';
import { buildQuizAttemptHistory } from '../../utils/quiz';
import { mapUserRowToProfile } from './auth';
import { readActiveOrganizationContextForUser } from './organization-memberships';
import {
  readMissionAssignmentsByStudent,
  touchWeeklyMissionProgressFromQuiz,
  touchWeeklyMissionProgressFromStudy,
} from './storage-mission-actions';
import { rebuildOrganizationKpiSnapshots } from './organization-kpi';
import {
  AppEnv,
  DbUserRow,
} from './types';
import {
  DAY_MS,
  assertBookReadAccess,
  defaultLearningPreference,
  getBookProgress,
  getLastTokyoDateKeys,
  getMasterySourceSql,
  getVisibleDueCount,
  normalizeHistoryStatus,
  readAll,
  readFirst,
  type DbHistoryRow,
  type DbLearningPreferenceRow,
} from './storage-support';
import { HttpError } from './http';

const rebuildOrganizationKpiForUser = async (env: AppEnv, userId: string, dateKeys: string[]): Promise<void> => {
  const organization = await readActiveOrganizationContextForUser(env, userId);
  if (!organization) return;
  await rebuildOrganizationKpiSnapshots(env, organization.organizationId, { dateKeys });
};

export const handleAddXP = async (
  env: AppEnv,
  user: DbUserRow,
  amount: number,
): Promise<{ user: UserProfile; leveledUp: boolean; }> => {
  let xp = Number(user.stats_xp || 0);
  let level = Number(user.stats_level || 1);
  xp += amount;

  let leveledUp = false;
  while (xp >= level * 100) {
    xp -= level * 100;
    level += 1;
    leveledUp = true;
  }

  await env.DB.prepare(`
    UPDATE users
    SET stats_xp = ?, stats_level = ?, updated_at = ?
    WHERE id = ?
  `).bind(xp, level, Date.now(), user.id).run();

  const updated = await readFirst<DbUserRow>(env, 'SELECT * FROM users WHERE id = ?', user.id);
  if (!updated) throw new HttpError(500, 'XP更新後のユーザー取得に失敗しました。');

  return {
    user: mapUserRowToProfile(updated),
    leveledUp,
  };
};

export const handleGetDueCount = async (env: AppEnv, user: DbUserRow): Promise<number> => (
  getVisibleDueCount(env, user)
);

export const handleSaveSrsHistory = async (
  env: AppEnv,
  user: DbUserRow,
  word: { id: string; bookId: string; },
  rating: number,
  responseTimeMs = 0,
  missionAssignmentId?: string,
  taskIntentType?: LearningTaskIntentType,
): Promise<void> => {
  await assertBookReadAccess(env, user, word.bookId);
  const now = Date.now();
  const existing = await readFirst<DbHistoryRow>(
    env,
    'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?',
    user.id,
    word.id,
  );

  let interval = existing?.interval_days || 0;
  let easeFactor = existing?.ease_factor || 2.5;
  const attemptCount = (existing?.attempt_count || 0) + 1;
  const correctCount = (existing?.correct_count || 0) + (rating >= 2 ? 1 : 0);
  const totalResponseTimeMs = (existing?.total_response_time_ms || 0) + Math.max(0, Math.round(responseTimeMs));

  if (rating === 0) {
    interval = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === 1) {
    interval = 1;
  } else if (rating === 2) {
    interval = interval === 0 ? 1 : Math.ceil(interval * easeFactor);
  } else if (rating === 3) {
    interval = interval === 0 ? 3 : Math.ceil(interval * easeFactor * 1.3);
    easeFactor += 0.15;
  }

  if (interval > 365) interval = 365;

  const nextReviewDate = now + interval * DAY_MS;
  const status = normalizeHistoryStatus(interval);

  await env.DB.prepare(`
    INSERT INTO learning_histories (
      user_id, word_id, book_id, status, last_studied_at, next_review_date,
      interval_days, ease_factor, correct_count, attempt_count, total_response_time_ms, interaction_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, word_id) DO UPDATE SET
      book_id = excluded.book_id,
      status = excluded.status,
      last_studied_at = excluded.last_studied_at,
      next_review_date = excluded.next_review_date,
      interval_days = excluded.interval_days,
      ease_factor = excluded.ease_factor,
      correct_count = excluded.correct_count,
      attempt_count = excluded.attempt_count,
      total_response_time_ms = excluded.total_response_time_ms,
      interaction_source = excluded.interaction_source
  `).bind(
    user.id,
    word.id,
    word.bookId,
    status,
    now,
    nextReviewDate,
    interval,
    easeFactor,
    correctCount,
    attemptCount,
    totalResponseTimeMs,
    MASTERY_INTERACTION_SOURCE,
  ).run();

  const [bookProgressionBand, missionAssignments] = await Promise.all([
    resolveBookProgressionBand(env, word.bookId),
    readMissionAssignmentsByStudent(env, [user.id]),
  ]);
  const missionAssignment = missionAssignments.get(user.id);
  const effectiveMissionAssignmentId = missionAssignmentId || (
    !missionAssignment?.mission.bookId || missionAssignment.mission.bookId === word.bookId
      ? missionAssignment?.id
      : undefined
  );
  await appendLearningInteractionEvent(env, {
    userId: user.id,
    wordId: word.id,
    bookId: word.bookId,
    createdAt: now,
    interactionSource: 'STUDY',
    correct: rating >= 2,
    rating,
    responseTimeMs,
    intervalDaysBefore: existing?.interval_days || 0,
    bookProgressionBand,
    missionAssignmentId: effectiveMissionAssignmentId,
    taskIntentType,
  });
  await rebuildWeaknessSignalsForUser(env, user.id, user);

  await touchWeeklyMissionProgressFromStudy(env, user, {
    wordId: word.id,
    bookId: word.bookId,
    assignmentId: effectiveMissionAssignmentId,
    existingWasStudy: Boolean(existing?.interaction_source === MASTERY_INTERACTION_SOURCE),
    studiedAt: now,
  });

  await rebuildOrganizationKpiForUser(env, user.id, getLastTokyoDateKeys(4));
};

export const handleRecordQuizAttempt = async (
  env: AppEnv,
  user: DbUserRow,
  wordId: string,
  bookId: string,
  correct: boolean,
  questionMode: 'EN_TO_JA' | 'JA_TO_EN' | 'SPELLING_HINT',
  responseTimeMs = 0,
  missionAssignmentId?: string,
  taskIntentType?: LearningTaskIntentType,
): Promise<void> => {
  await assertBookReadAccess(env, user, bookId);
  const now = Date.now();
  const existing = await readFirst<DbHistoryRow>(
    env,
    'SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?',
    user.id,
    wordId,
  );

  const nextHistory = buildQuizAttemptHistory({
    existing: existing
      ? {
          wordId: existing.word_id,
          bookId: existing.book_id,
          status: existing.status,
          lastStudiedAt: existing.last_studied_at,
          nextReviewDate: existing.next_review_date,
          interval: existing.interval_days,
          easeFactor: existing.ease_factor,
          correctCount: existing.correct_count,
          attemptCount: existing.attempt_count,
          totalResponseTimeMs: existing.total_response_time_ms,
          interactionSource: existing.interaction_source || undefined,
        }
      : undefined,
    wordId,
    bookId,
    correct,
    responseTimeMs,
    now,
  });

  await env.DB.prepare(`
    INSERT INTO learning_histories (
      user_id, word_id, book_id, status, last_studied_at, next_review_date,
      interval_days, ease_factor, correct_count, attempt_count, total_response_time_ms, interaction_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, word_id) DO UPDATE SET
      book_id = excluded.book_id,
      status = excluded.status,
      last_studied_at = excluded.last_studied_at,
      next_review_date = excluded.next_review_date,
      interval_days = excluded.interval_days,
      ease_factor = excluded.ease_factor,
      correct_count = excluded.correct_count,
      attempt_count = excluded.attempt_count,
      total_response_time_ms = excluded.total_response_time_ms,
      interaction_source = excluded.interaction_source
  `).bind(
    user.id,
    nextHistory.wordId,
    nextHistory.bookId,
    nextHistory.status,
    nextHistory.lastStudiedAt,
    nextHistory.nextReviewDate,
    nextHistory.interval,
    nextHistory.easeFactor,
    nextHistory.correctCount,
    nextHistory.attemptCount,
    nextHistory.totalResponseTimeMs,
    nextHistory.interactionSource || null,
  ).run();

  const [bookProgressionBand, missionAssignments] = await Promise.all([
    resolveBookProgressionBand(env, bookId),
    readMissionAssignmentsByStudent(env, [user.id]),
  ]);
  const missionAssignment = missionAssignments.get(user.id);
  const effectiveMissionAssignmentId = missionAssignmentId || (
    !missionAssignment?.mission.bookId || missionAssignment.mission.bookId === bookId
      ? missionAssignment?.id
      : undefined
  );
  await appendLearningInteractionEvent(env, {
    userId: user.id,
    wordId,
    bookId,
    createdAt: nextHistory.lastStudiedAt,
    interactionSource: 'QUIZ',
    questionMode,
    correct,
    responseTimeMs,
    intervalDaysBefore: existing?.interval_days || 0,
    bookProgressionBand,
    missionAssignmentId: effectiveMissionAssignmentId,
    taskIntentType,
  });
  await rebuildWeaknessSignalsForUser(env, user.id, user);

  await touchWeeklyMissionProgressFromQuiz(env, user, {
    bookId,
    assignmentId: effectiveMissionAssignmentId,
    dateKey: formatDateKey(nextHistory.lastStudiedAt),
    attemptedAt: nextHistory.lastStudiedAt,
  });
};

export const handleGetStudiedWordIdsByBook = async (
  env: AppEnv,
  user: DbUserRow,
  bookId: string,
): Promise<string[]> => {
  await assertBookReadAccess(env, user, bookId);
  const rows = await readAll<{ word_id: string }>(
    env,
    `SELECT word_id
     FROM learning_histories
     WHERE user_id = ? AND book_id = ? AND ${getMasterySourceSql()}`,
    user.id,
    bookId,
  );
  return Array.from(new Set(rows.map((row) => row.word_id)));
};

export const handleGetBookProgress = async (env: AppEnv, user: DbUserRow, bookId: string) => (
  getBookProgress(env, user.id, bookId)
);

export const handleResetAllData = async (env: AppEnv): Promise<void> => {
  const statements = [
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM writing_teacher_reviews'),
    env.DB.prepare('DELETE FROM writing_ai_evaluations'),
    env.DB.prepare('DELETE FROM writing_submission_assets'),
    env.DB.prepare('DELETE FROM writing_submissions'),
    env.DB.prepare('DELETE FROM writing_assignments'),
    env.DB.prepare('DELETE FROM ai_usage_events'),
    env.DB.prepare('DELETE FROM instructor_notifications'),
    env.DB.prepare('DELETE FROM product_announcement_receipts'),
    env.DB.prepare('DELETE FROM product_announcements'),
    env.DB.prepare('DELETE FROM commercial_requests'),
    env.DB.prepare('DELETE FROM student_instructor_assignment_events'),
    env.DB.prepare('DELETE FROM organization_audit_logs'),
    env.DB.prepare('DELETE FROM organization_memberships'),
    env.DB.prepare('DELETE FROM organization_kpi_daily_snapshots'),
    env.DB.prepare('DELETE FROM weekly_mission_assignments'),
    env.DB.prepare('DELETE FROM weekly_missions'),
    env.DB.prepare('DELETE FROM student_weakness_signals'),
    env.DB.prepare('DELETE FROM learning_interaction_events'),
    env.DB.prepare('DELETE FROM word_reports'),
    env.DB.prepare('DELETE FROM learning_histories'),
    env.DB.prepare('DELETE FROM student_instructor_assignments'),
    env.DB.prepare('DELETE FROM learning_preferences'),
    env.DB.prepare('DELETE FROM learning_plans'),
    env.DB.prepare('DELETE FROM words'),
    env.DB.prepare('DELETE FROM books'),
    env.DB.prepare('DELETE FROM organizations'),
    env.DB.prepare(`
      UPDATE users
      SET stats_xp = 0,
          stats_level = 1,
          stats_current_streak = 0,
          organization_id = NULL,
          organization_name = NULL,
          organization_role = NULL,
          updated_at = ?
    `).bind(Date.now()),
  ];
  await env.DB.batch(statements);
};

export const handleSaveLearningPlan = async (env: AppEnv, user: DbUserRow, plan: LearningPlan): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO learning_plans (
      user_id, created_at, target_date, goal_description, daily_word_goal, selected_book_ids, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      target_date = excluded.target_date,
      goal_description = excluded.goal_description,
      daily_word_goal = excluded.daily_word_goal,
      selected_book_ids = excluded.selected_book_ids,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    user.id,
    plan.createdAt || Date.now(),
    plan.targetDate,
    plan.goalDescription,
    plan.dailyWordGoal,
    JSON.stringify(plan.selectedBookIds || []),
    plan.status,
    Date.now(),
  ).run();

  await rebuildOrganizationKpiForUser(env, user.id, getLastTokyoDateKeys(1));
};

export const handleGetLearningPlan = async (env: AppEnv, user: DbUserRow): Promise<LearningPlan | null> => {
  const row = await readFirst<{
    user_id: string;
    created_at: number;
    target_date: string;
    goal_description: string;
    daily_word_goal: number;
    selected_book_ids: string;
    status: LearningPlan['status'];
  }>(env, 'SELECT * FROM learning_plans WHERE user_id = ?', user.id);

  if (!row) return null;
  return {
    uid: row.user_id,
    createdAt: row.created_at,
    targetDate: row.target_date,
    goalDescription: row.goal_description,
    dailyWordGoal: row.daily_word_goal,
    selectedBookIds: JSON.parse(row.selected_book_ids || '[]'),
    status: row.status,
  };
};

export const handleSaveLearningPreference = async (env: AppEnv, user: DbUserRow, preference: LearningPreference): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO learning_preferences (
      user_id, target_exam, target_score, exam_date, weekly_study_days, daily_study_minutes,
      weak_skill_focus, motivation_note, intensity, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      target_exam = excluded.target_exam,
      target_score = excluded.target_score,
      exam_date = excluded.exam_date,
      weekly_study_days = excluded.weekly_study_days,
      daily_study_minutes = excluded.daily_study_minutes,
      weak_skill_focus = excluded.weak_skill_focus,
      motivation_note = excluded.motivation_note,
      intensity = excluded.intensity,
      updated_at = excluded.updated_at
  `).bind(
    user.id,
    preference.targetExam || null,
    preference.targetScore || null,
    preference.examDate || null,
    preference.weeklyStudyDays || 4,
    preference.dailyStudyMinutes || 20,
    preference.weakSkillFocus || null,
    preference.motivationNote || null,
    preference.intensity || LearningPreferenceIntensity.BALANCED,
    Date.now(),
  ).run();
};

export const handleGetLearningPreference = async (env: AppEnv, user: DbUserRow): Promise<LearningPreference> => {
  const row = await readFirst<DbLearningPreferenceRow>(env, 'SELECT * FROM learning_preferences WHERE user_id = ?', user.id);
  if (!row) return defaultLearningPreference(user.id);

  return {
    userUid: row.user_id,
    targetExam: row.target_exam || '',
    targetScore: row.target_score || '',
    examDate: row.exam_date || '',
    weeklyStudyDays: Number(row.weekly_study_days || 4),
    dailyStudyMinutes: Number(row.daily_study_minutes || 20),
    weakSkillFocus: row.weak_skill_focus || '',
    motivationNote: row.motivation_note || '',
    intensity: (row.intensity as LearningPreferenceIntensity | null) || LearningPreferenceIntensity.BALANCED,
    updatedAt: row.updated_at,
  };
};

export const handleGetActivityLogs = async (env: AppEnv, userId: string): Promise<ActivityLog[]> => {
  const rows = await readAll<{ last_studied_at: number }>(
    env,
    'SELECT last_studied_at FROM learning_histories WHERE user_id = ?',
    userId,
  );

  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const date = formatDateKey(row.last_studied_at);
    counts[date] = (counts[date] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([date, count]) => {
      let intensity: 0 | 1 | 2 | 3 | 4 = 0;
      if (count > 0) intensity = 1;
      if (count > 5) intensity = 2;
      if (count > 15) intensity = 3;
      if (count > 30) intensity = 4;
      return { date, count, intensity };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
};
