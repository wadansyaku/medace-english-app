import {
  type StudentWeaknessProfile,
  type UserGrade,
  type WeaknessSignalSummary,
  type WorksheetQuestionMode,
  type EnglishLevel,
} from '../../types';
import {
  buildWeaknessProfile,
  deriveWeaknessSignals,
  type WeaknessInteractionEvent,
} from '../../shared/weakness';
import { getBookProgressionIndex } from '../../shared/bookProgression';
import type { AppEnv, DbUserRow } from './types';
import {
  readAll,
  readFirst,
  toBookMetadata,
  toLearningHistory,
  type DbBookRow,
  type DbHistoryRow,
} from './storage-support';

interface DbWeaknessEventRow {
  user_id: string;
  word_id: string;
  book_id: string;
  created_at: number;
  interaction_source: 'STUDY' | 'QUIZ';
  question_mode: WorksheetQuestionMode | null;
  correct: number | null;
  rating: number | null;
  response_time_ms: number;
  interval_days_before: number | null;
  book_progression_band: number | null;
  mission_assignment_id: string | null;
}

interface DbWeaknessSignalRow {
  user_id: string;
  dimension: WeaknessSignalSummary['dimension'];
  level: WeaknessSignalSummary['level'];
  score: number;
  sample_size: number;
  reason: string;
  next_action_label: string;
  recommended_action_type: WeaknessSignalSummary['recommendedActionType'];
  target_question_modes_json: string;
  target_band_index: number | null;
  updated_at: number;
}

const mapEventRow = (row: DbWeaknessEventRow): WeaknessInteractionEvent => ({
  userId: row.user_id,
  wordId: row.word_id,
  bookId: row.book_id,
  createdAt: row.created_at,
  interactionSource: row.interaction_source,
  questionMode: row.question_mode || undefined,
  correct: row.correct === null ? undefined : Boolean(row.correct),
  rating: row.rating === null ? undefined : Number(row.rating),
  responseTimeMs: Number(row.response_time_ms || 0),
  intervalDaysBefore: row.interval_days_before === null ? undefined : Number(row.interval_days_before),
  bookProgressionBand: row.book_progression_band === null ? undefined : Number(row.book_progression_band),
  missionAssignmentId: row.mission_assignment_id || undefined,
});

const mapSignalRow = (row: DbWeaknessSignalRow): WeaknessSignalSummary => {
  let targetQuestionModes: WeaknessSignalSummary['targetQuestionModes'] = ['EN_TO_JA', 'JA_TO_EN'];
  try {
    const parsed = JSON.parse(row.target_question_modes_json) as unknown;
    if (Array.isArray(parsed)) {
      targetQuestionModes = parsed.filter((value): value is WeaknessSignalSummary['targetQuestionModes'][number] => (
        value === 'EN_TO_JA' || value === 'JA_TO_EN' || value === 'SPELLING_HINT'
      ));
    }
  } catch {
    targetQuestionModes = ['EN_TO_JA', 'JA_TO_EN'];
  }
  return {
    dimension: row.dimension,
    level: row.level,
    score: Number(row.score || 0),
    sampleSize: Number(row.sample_size || 0),
    reason: row.reason,
    nextActionLabel: row.next_action_label,
    recommendedActionType: row.recommended_action_type,
    targetQuestionModes,
    targetBandIndex: row.target_band_index === null ? undefined : Number(row.target_band_index),
    updatedAt: Number(row.updated_at || 0),
  };
};

const resolveUserDifficultyContext = async (
  env: AppEnv,
  userId: string,
  user?: Pick<DbUserRow, 'grade' | 'english_level'>,
): Promise<{ grade?: UserGrade; level?: EnglishLevel }> => {
  if (user) {
    return {
      grade: (user.grade as UserGrade | null) || undefined,
      level: (user.english_level as EnglishLevel | null) || undefined,
    };
  }

  const row = await readFirst<Pick<DbUserRow, 'grade' | 'english_level'>>(
    env,
    'SELECT grade, english_level FROM users WHERE id = ?',
    userId,
  );
  return {
    grade: (row?.grade as UserGrade | null) || undefined,
    level: (row?.english_level as EnglishLevel | null) || undefined,
  };
};

export const appendLearningInteractionEvent = async (
  env: AppEnv,
  event: WeaknessInteractionEvent,
): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO learning_interaction_events (
      user_id,
      word_id,
      book_id,
      created_at,
      interaction_source,
      question_mode,
      correct,
      rating,
      response_time_ms,
      interval_days_before,
      book_progression_band,
      mission_assignment_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    event.userId,
    event.wordId,
    event.bookId,
    event.createdAt,
    event.interactionSource,
    event.questionMode || null,
    typeof event.correct === 'boolean' ? (event.correct ? 1 : 0) : null,
    typeof event.rating === 'number' ? event.rating : null,
    Math.max(0, Math.round(event.responseTimeMs || 0)),
    typeof event.intervalDaysBefore === 'number' ? event.intervalDaysBefore : null,
    typeof event.bookProgressionBand === 'number' ? event.bookProgressionBand : null,
    event.missionAssignmentId || null,
  ).run();
};

export const resolveBookProgressionBand = async (
  env: AppEnv,
  bookId: string,
): Promise<number | null> => {
  const row = await readFirst<DbBookRow>(env, 'SELECT * FROM books WHERE id = ?', bookId);
  return row ? getBookProgressionIndex(toBookMetadata(row)) : null;
};

export const rebuildWeaknessSignalsForUser = async (
  env: AppEnv,
  userId: string,
  user?: Pick<DbUserRow, 'grade' | 'english_level'>,
): Promise<StudentWeaknessProfile | null> => {
  const [difficultyContext, eventRows, historyRows] = await Promise.all([
    resolveUserDifficultyContext(env, userId, user),
    readAll<DbWeaknessEventRow>(
      env,
      `SELECT *
       FROM learning_interaction_events
       WHERE user_id = ?
         AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 120`,
      userId,
      Date.now() - 30 * 86400000,
    ),
    readAll<DbHistoryRow>(
      env,
      'SELECT * FROM learning_histories WHERE user_id = ? ORDER BY last_studied_at DESC LIMIT 120',
      userId,
    ),
  ]);

  const signals = deriveWeaknessSignals({
    events: eventRows.map(mapEventRow),
    histories: historyRows.map(toLearningHistory),
    grade: difficultyContext.grade,
    level: difficultyContext.level,
  });

  const statements = signals.map((signal) => env.DB.prepare(`
    INSERT INTO student_weakness_signals (
      user_id,
      dimension,
      level,
      score,
      sample_size,
      reason,
      next_action_label,
      recommended_action_type,
      target_question_modes_json,
      target_band_index,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, dimension) DO UPDATE SET
      level = excluded.level,
      score = excluded.score,
      sample_size = excluded.sample_size,
      reason = excluded.reason,
      next_action_label = excluded.next_action_label,
      recommended_action_type = excluded.recommended_action_type,
      target_question_modes_json = excluded.target_question_modes_json,
      target_band_index = excluded.target_band_index,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    signal.dimension,
    signal.level,
    signal.score,
    signal.sampleSize,
    signal.reason,
    signal.nextActionLabel,
    signal.recommendedActionType,
    JSON.stringify(signal.targetQuestionModes),
    signal.targetBandIndex ?? null,
    signal.updatedAt,
  ));

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return buildWeaknessProfile(signals);
};

export const readWeaknessProfile = async (
  env: AppEnv,
  userId: string,
): Promise<StudentWeaknessProfile | null> => {
  const rows = await readAll<DbWeaknessSignalRow>(
    env,
    `SELECT *
     FROM student_weakness_signals
     WHERE user_id = ?
     ORDER BY updated_at DESC, score DESC`,
    userId,
  );
  return buildWeaknessProfile(rows.map(mapSignalRow));
};

export const readWeaknessProfilesByUserIds = async (
  env: AppEnv,
  userIds: string[],
): Promise<Map<string, StudentWeaknessProfile>> => {
  if (userIds.length === 0) return new Map();
  const placeholders = userIds.map(() => '?').join(', ');
  const rows = await readAll<DbWeaknessSignalRow>(
    env,
    `SELECT *
     FROM student_weakness_signals
     WHERE user_id IN (${placeholders})
     ORDER BY updated_at DESC, score DESC`,
    ...userIds,
  );
  const grouped = new Map<string, WeaknessSignalSummary[]>();
  rows.forEach((row) => {
    const list = grouped.get(row.user_id) || [];
    list.push(mapSignalRow(row));
    grouped.set(row.user_id, list);
  });
  const profiles = new Map<string, StudentWeaknessProfile>();
  grouped.forEach((signals, userId) => {
    const profile = buildWeaknessProfile(signals);
    if (profile) {
      profiles.set(userId, profile);
    }
  });
  return profiles;
};
