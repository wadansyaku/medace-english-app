import type { GeneratedWorksheetQuestion } from '../../utils/worksheet';
import {
  advanceCbtState,
  createAiCacheKey,
  getInitialCbtState,
  inferProblemDifficultyFromStats,
  type AiGeneratedContentKind,
  type CbtState,
} from '../../services/storage/ai-cache-cbt';
import type { AppEnv } from './types';

type QualityStatus = 'READY' | 'NEEDS_REVIEW' | 'REJECTED';

interface AiContentRow {
  id: string;
  cache_key: string;
  content_kind: AiGeneratedContentKind;
  provider: string;
  model: string;
  prompt_version: string;
  word_id: string | null;
  book_id: string | null;
  question_mode: string | null;
  grammar_scope_id: string | null;
  source_hash: string;
  payload_json: string;
  quality_status: QualityStatus;
  usage_count: number;
  last_used_at: number | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

interface AiGeneratedProblemRow {
  id: string;
  content_id: string;
  word_id: string;
  book_id: string;
  question_mode: string;
  grammar_scope_id: string | null;
  prompt_text: string;
  answer_text: string;
  options_json: string;
  ordered_tokens_json: string;
  source_sentence: string | null;
  source_translation: string | null;
  grammar_focus: string | null;
  difficulty_level: number;
  active: number;
  created_at: number;
  updated_at: number;
}

interface ReusableAiGeneratedQuestionRow extends AiGeneratedProblemRow {
  content_usage_count: number;
  payload_json: string;
}

export interface AiGeneratedContentInput {
  contentKind: AiGeneratedContentKind;
  model: string;
  promptVersion: string;
  payload: unknown;
  sourceText: string;
  wordId?: string | null;
  bookId?: string | null;
  questionMode?: string | null;
  grammarScopeId?: string | null;
  provider?: string;
  qualityStatus?: QualityStatus;
  now?: number;
  expiresAt?: number | null;
}

export interface AiGeneratedProblemInput {
  question: GeneratedWorksheetQuestion;
  model: string;
  promptVersion: string;
  sourceText?: string;
  provider?: string;
  qualityStatus?: QualityStatus;
  difficultyLevel?: number;
  now?: number;
}

export interface AiGeneratedExampleInput {
  wordId: string;
  bookId: string;
  sentence: string;
  translation: string;
  model: string;
  promptVersion: string;
  provider?: string;
  cefrLevel?: string | null;
  qualityStatus?: QualityStatus;
  now?: number;
}

export interface ReusableGrammarProblemQuery {
  wordIds: string[];
  questionMode: string;
  grammarScopeId?: string | null;
  limit?: number;
  maxDifficultyLevel?: number;
  minDifficultyLevel?: number;
}

const clampLimit = (value: number | undefined, fallback: number): number => (
  Math.max(1, Math.min(25, Math.trunc(value || fallback)))
);

const clampReadAheadLimit = (query: ReusableGrammarProblemQuery, fallback: number): number => (
  Math.max(
    clampLimit(query.limit, fallback),
    Math.min(25, Math.max(1, query.wordIds.length) * 4),
  )
);

const createContentId = (cacheKey: string): string => `ai-content-${createAiCacheKey({
  contentKind: 'GRAMMAR_PROBLEM',
  model: 'id',
  promptVersion: 'v1',
  sourceText: cacheKey,
}).sourceHash}`;

export const upsertAiGeneratedContent = async (
  env: AppEnv,
  input: AiGeneratedContentInput,
): Promise<AiContentRow> => {
  const now = input.now ?? Date.now();
  const key = createAiCacheKey({
    contentKind: input.contentKind,
    model: input.model,
    promptVersion: input.promptVersion,
    wordId: input.wordId,
    questionMode: input.questionMode,
    grammarScopeId: input.grammarScopeId,
    sourceText: input.sourceText,
  });
  const id = createContentId(key.cacheKey);
  const payloadJson = JSON.stringify(input.payload);

  await env.DB.prepare(`
    INSERT INTO ai_generated_contents (
      id, cache_key, content_kind, provider, model, prompt_version, word_id, book_id,
      question_mode, grammar_scope_id, source_hash, payload_json, quality_status, usage_count, last_used_at,
      expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      quality_status = excluded.quality_status,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).bind(
    id,
    key.cacheKey,
    input.contentKind,
    input.provider || 'gemini',
    input.model,
    input.promptVersion,
    input.wordId || null,
    input.bookId || null,
    input.questionMode || null,
    input.grammarScopeId || null,
    key.sourceHash,
    payloadJson,
    input.qualityStatus || 'READY',
    input.expiresAt ?? null,
    now,
    now,
  ).run();

  const row = await env.DB.prepare('SELECT * FROM ai_generated_contents WHERE cache_key = ?')
    .bind(key.cacheKey)
    .first<AiContentRow>();
  if (!row) throw new Error('AI生成キャッシュの保存後取得に失敗しました。');
  return row;
};

export const markAiGeneratedContentUsed = async (
  env: AppEnv,
  contentId: string,
  now = Date.now(),
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE ai_generated_contents
    SET usage_count = usage_count + 1, last_used_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, now, contentId).run();
};

export const recordAiGeneratedProblem = async (
  env: AppEnv,
  input: AiGeneratedProblemInput,
): Promise<AiGeneratedProblemRow> => {
  const question = input.question;
  const content = await upsertAiGeneratedContent(env, {
    contentKind: 'GRAMMAR_PROBLEM',
    model: input.model,
    promptVersion: input.promptVersion,
    provider: input.provider,
    wordId: question.wordId,
    bookId: question.bookId,
    questionMode: question.mode,
    grammarScopeId: question.grammarScope?.scopeId || null,
    sourceText: input.sourceText || `${question.promptText}\n${question.answer}`,
    payload: question,
    qualityStatus: input.qualityStatus,
    now: input.now,
  });
  const now = input.now ?? Date.now();
  const problemId = `ai-problem-${content.id.replace(/^ai-content-/, '')}`;

  await env.DB.prepare(`
    INSERT INTO ai_generated_problems (
      id, content_id, word_id, book_id, question_mode, grammar_scope_id, prompt_text, answer_text,
      options_json, ordered_tokens_json, source_sentence, source_translation, grammar_focus,
      difficulty_level, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(content_id) DO UPDATE SET
      grammar_scope_id = excluded.grammar_scope_id,
      prompt_text = excluded.prompt_text,
      answer_text = excluded.answer_text,
      options_json = excluded.options_json,
      ordered_tokens_json = excluded.ordered_tokens_json,
      source_sentence = excluded.source_sentence,
      source_translation = excluded.source_translation,
      grammar_focus = excluded.grammar_focus,
      difficulty_level = excluded.difficulty_level,
      active = 1,
      updated_at = excluded.updated_at
  `).bind(
    problemId,
    content.id,
    question.wordId,
    question.bookId,
    question.mode,
    question.grammarScope?.scopeId || null,
    question.promptText,
    question.answer,
    JSON.stringify(question.options || []),
    JSON.stringify(question.tokens?.map((token) => token.text) || []),
    question.sourceSentence || null,
    question.sourceTranslation || null,
    question.grammarFocus || null,
    input.difficultyLevel ?? 0.5,
    now,
    now,
  ).run();

  const row = await env.DB.prepare('SELECT * FROM ai_generated_problems WHERE content_id = ?')
    .bind(content.id)
    .first<AiGeneratedProblemRow>();
  if (!row) throw new Error('AI生成問題の保存後取得に失敗しました。');
  return row;
};

export const recordAiGeneratedExample = async (
  env: AppEnv,
  input: AiGeneratedExampleInput,
): Promise<void> => {
  const content = await upsertAiGeneratedContent(env, {
    contentKind: 'EXAMPLE_SENTENCE',
    model: input.model,
    promptVersion: input.promptVersion,
    provider: input.provider,
    wordId: input.wordId,
    bookId: input.bookId,
    sourceText: `${input.sentence}\n${input.translation}`,
    payload: {
      sentence: input.sentence,
      translation: input.translation,
      cefrLevel: input.cefrLevel || null,
    },
    qualityStatus: input.qualityStatus,
    now: input.now,
  });
  const now = input.now ?? Date.now();
  const exampleId = `ai-example-${content.id.replace(/^ai-content-/, '')}`;

  await env.DB.prepare(`
    INSERT INTO ai_generated_examples (
      id, content_id, word_id, book_id, sentence, translation, cefr_level, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(content_id) DO UPDATE SET
      sentence = excluded.sentence,
      translation = excluded.translation,
      cefr_level = excluded.cefr_level,
      active = 1,
      updated_at = excluded.updated_at
  `).bind(
    exampleId,
    content.id,
    input.wordId,
    input.bookId,
    input.sentence,
    input.translation,
    input.cefrLevel || null,
    now,
    now,
  ).run();
};

export const readReusableAiGrammarProblems = async (
  env: AppEnv,
  query: ReusableGrammarProblemQuery,
): Promise<AiGeneratedProblemRow[]> => {
  if (query.wordIds.length === 0) return [];
  const placeholders = query.wordIds.map(() => '?').join(', ');
  const limit = clampReadAheadLimit(query, 10);
  const minDifficulty = query.minDifficultyLevel ?? 0;
  const maxDifficulty = query.maxDifficultyLevel ?? 1;
  const rows = await env.DB.prepare(`
    SELECT p.*
    FROM ai_generated_problems p
    JOIN ai_generated_contents c ON c.id = p.content_id
    WHERE p.word_id IN (${placeholders})
      AND p.question_mode = ?
      AND (? IS NULL OR p.grammar_scope_id = ?)
      AND p.active = 1
      AND c.quality_status = 'READY'
      AND p.difficulty_level BETWEEN ? AND ?
    ORDER BY c.usage_count ASC, p.updated_at DESC
    LIMIT ?
  `).bind(
    ...query.wordIds,
    query.questionMode,
    query.grammarScopeId || null,
    query.grammarScopeId || null,
    minDifficulty,
    maxDifficulty,
    limit,
  ).all<AiGeneratedProblemRow>();

  const byWordId = new Map<string, AiGeneratedProblemRow>();
  (rows.results || []).forEach((row) => {
    if (!byWordId.has(row.word_id)) byWordId.set(row.word_id, row);
  });
  return [...byWordId.values()].slice(0, clampLimit(query.limit, 10));
};

export const readReusableAiGrammarQuestions = async (
  env: AppEnv,
  query: ReusableGrammarProblemQuery,
  now = Date.now(),
): Promise<GeneratedWorksheetQuestion[]> => {
  if (query.wordIds.length === 0) return [];
  const placeholders = query.wordIds.map(() => '?').join(', ');
  const limit = clampReadAheadLimit(query, 10);
  const minDifficulty = query.minDifficultyLevel ?? 0;
  const maxDifficulty = query.maxDifficultyLevel ?? 1;
  const rows = await env.DB.prepare(`
    SELECT p.*, c.usage_count AS content_usage_count, c.payload_json
    FROM ai_generated_problems p
    JOIN ai_generated_contents c ON c.id = p.content_id
    WHERE p.word_id IN (${placeholders})
      AND p.question_mode = ?
      AND (? IS NULL OR p.grammar_scope_id = ?)
      AND p.active = 1
      AND c.quality_status = 'READY'
      AND (c.expires_at IS NULL OR c.expires_at > ?)
      AND p.difficulty_level BETWEEN ? AND ?
    ORDER BY c.usage_count ASC, p.updated_at DESC
    LIMIT ?
  `).bind(
    ...query.wordIds,
    query.questionMode,
    query.grammarScopeId || null,
    query.grammarScopeId || null,
    now,
    minDifficulty,
    maxDifficulty,
    limit,
  ).all<ReusableAiGeneratedQuestionRow>();

  const questions: GeneratedWorksheetQuestion[] = [];
  const seenWordIds = new Set<string>();
  const contentIds: string[] = [];
  (rows.results || []).forEach((row) => {
    try {
      const parsed = JSON.parse(row.payload_json) as GeneratedWorksheetQuestion;
      if (parsed?.wordId && parsed?.mode === query.questionMode && !seenWordIds.has(parsed.wordId)) {
        seenWordIds.add(parsed.wordId);
        questions.push({
          ...parsed,
          generatedProblemId: row.id,
          aiContentId: row.content_id,
        });
        contentIds.push(row.content_id);
      }
    } catch {
      // Ignore malformed historical cache rows.
    }
  });

  await Promise.all(contentIds.map((contentId) => markAiGeneratedContentUsed(env, contentId, now)));
  return questions.slice(0, clampLimit(query.limit, 10));
};

interface CbtRow {
  ability_level?: number;
  mastery_level?: number;
  confidence: number;
  attempt_count: number;
  correct_count: number;
}

const toCbtState = (row: CbtRow | null, levelColumn: 'ability_level' | 'mastery_level'): CbtState => (
  row
    ? {
        level: Number(row[levelColumn] ?? 0.5),
        confidence: Number(row.confidence || 0),
        attemptCount: Number(row.attempt_count || 0),
        correctCount: Number(row.correct_count || 0),
      }
    : getInitialCbtState()
);

export const recordCbtProblemAttempt = async (
  env: AppEnv,
  input: {
    userId: string;
    wordId: string;
    problemId: string;
    correct: boolean;
    responseTimeMs?: number;
    now?: number;
  },
): Promise<{ learner: CbtState; word: CbtState; problemDifficultyLevel: number }> => {
  const now = input.now ?? Date.now();
  const responseTimeMs = Math.max(0, Math.round(input.responseTimeMs || 0));
  const problem = await env.DB.prepare('SELECT * FROM cbt_problem_stats WHERE problem_id = ?')
    .bind(input.problemId)
    .first<{ difficulty_level: number; exposure_count: number; correct_count: number; avg_response_time_ms: number }>();
  const difficultyLevel = Number(problem?.difficulty_level ?? 0.5);

  const [learnerRow, wordRow] = await Promise.all([
    env.DB.prepare('SELECT * FROM cbt_learner_profiles WHERE user_id = ?').bind(input.userId).first<CbtRow>(),
    env.DB.prepare('SELECT * FROM cbt_learner_word_states WHERE user_id = ? AND word_id = ?').bind(input.userId, input.wordId).first<CbtRow>(),
  ]);

  const learner = advanceCbtState(toCbtState(learnerRow, 'ability_level'), {
    correct: input.correct,
    difficultyLevel,
  });
  const word = advanceCbtState(toCbtState(wordRow, 'mastery_level'), {
    correct: input.correct,
    difficultyLevel,
  });
  const exposureCount = Number(problem?.exposure_count || 0) + 1;
  const correctCount = Number(problem?.correct_count || 0) + (input.correct ? 1 : 0);
  const avgResponseTimeMs = Math.round(
    ((Number(problem?.avg_response_time_ms || 0) * (exposureCount - 1)) + responseTimeMs) / exposureCount,
  );
  const nextDifficulty = inferProblemDifficultyFromStats(exposureCount, correctCount);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO cbt_learner_profiles (
        user_id, ability_level, confidence, attempt_count, correct_count, last_attempt_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        ability_level = excluded.ability_level,
        confidence = excluded.confidence,
        attempt_count = excluded.attempt_count,
        correct_count = excluded.correct_count,
        last_attempt_at = excluded.last_attempt_at,
        updated_at = excluded.updated_at
    `).bind(input.userId, learner.level, learner.confidence, learner.attemptCount, learner.correctCount, now, now),
    env.DB.prepare(`
      INSERT INTO cbt_learner_word_states (
        user_id, word_id, mastery_level, confidence, attempt_count, correct_count,
        last_problem_id, last_attempt_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, word_id) DO UPDATE SET
        mastery_level = excluded.mastery_level,
        confidence = excluded.confidence,
        attempt_count = excluded.attempt_count,
        correct_count = excluded.correct_count,
        last_problem_id = excluded.last_problem_id,
        last_attempt_at = excluded.last_attempt_at,
        updated_at = excluded.updated_at
    `).bind(input.userId, input.wordId, word.level, word.confidence, word.attemptCount, word.correctCount, input.problemId, now, now),
    env.DB.prepare(`
      INSERT INTO cbt_problem_stats (
        problem_id, difficulty_level, discrimination, exposure_count, correct_count, avg_response_time_ms, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(problem_id) DO UPDATE SET
        difficulty_level = excluded.difficulty_level,
        exposure_count = excluded.exposure_count,
        correct_count = excluded.correct_count,
        avg_response_time_ms = excluded.avg_response_time_ms,
        updated_at = excluded.updated_at
    `).bind(input.problemId, nextDifficulty, exposureCount, correctCount, avgResponseTimeMs, now),
  ]);

  return { learner, word, problemDifficultyLevel: nextDifficulty };
};
