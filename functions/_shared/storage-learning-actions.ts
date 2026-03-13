import { ActivityLog, LearningPlan, LearningPreference, LearningPreferenceIntensity, UserProfile } from '../../types';
import { MASTERY_INTERACTION_SOURCE } from '../../shared/learningHistory';
import { formatDateKey } from '../../utils/date';
import { buildQuizAttemptHistory } from '../../utils/quiz';
import { mapUserRowToProfile } from './auth';
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
): Promise<void> => {
  await assertBookReadAccess(env, user, word.bookId);
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

  const nextReviewDate = Date.now() + interval * DAY_MS;
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
    Date.now(),
    nextReviewDate,
    interval,
    easeFactor,
    correctCount,
    attemptCount,
    totalResponseTimeMs,
    MASTERY_INTERACTION_SOURCE,
  ).run();

  if (user.organization_name) {
    await rebuildOrganizationKpiSnapshots(env, user.organization_name, {
      dateKeys: getLastTokyoDateKeys(4),
    });
  }
};

export const handleRecordQuizAttempt = async (
  env: AppEnv,
  user: DbUserRow,
  wordId: string,
  bookId: string,
  correct: boolean,
  responseTimeMs = 0,
): Promise<void> => {
  await assertBookReadAccess(env, user, bookId);
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
    env.DB.prepare('DELETE FROM organization_kpi_daily_snapshots'),
    env.DB.prepare('DELETE FROM word_reports'),
    env.DB.prepare('DELETE FROM learning_histories'),
    env.DB.prepare('DELETE FROM student_instructor_assignments'),
    env.DB.prepare('DELETE FROM learning_preferences'),
    env.DB.prepare('DELETE FROM learning_plans'),
    env.DB.prepare('DELETE FROM words'),
    env.DB.prepare('DELETE FROM books'),
    env.DB.prepare(`
      UPDATE users
      SET stats_xp = 0, stats_level = 1, stats_current_streak = 0, updated_at = ?
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

  if (user.organization_name) {
    await rebuildOrganizationKpiSnapshots(env, user.organization_name, {
      dateKeys: getLastTokyoDateKeys(1),
    });
  }
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
