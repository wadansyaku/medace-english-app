import type { GeneratedWorksheetQuestion } from '../../utils/worksheet';
import {
  advanceCbtState,
  createAiCacheKey,
  DEFAULT_AI_GENERATED_PROBLEM_QUALITY_STATUS,
  DEFAULT_ASSESSMENT_ITEM_REVIEW_STATUS,
  classifyReusableAiProblemReviewState,
  getInitialCbtState,
  inferProblemDifficultyFromStats,
  selectCbtDifficultyBand,
  type AiGeneratedContentQualityStatus,
  type AiGeneratedContentKind,
  type AssessmentItemReviewStatus,
  type CbtDifficultyBand,
  type CbtState,
} from '../../shared/aiCacheCbt';
import {
  OrganizationRole,
  UserRole,
  type AiGeneratedProblemReviewDecision,
  type AiGeneratedProblemReviewQueueItem,
  type AiGeneratedProblemReviewQueueResponse,
  type AiGeneratedProblemReviewQueueStatus,
  type GrammarCurriculumScopeId,
  type JapaneseTranslationFeedback,
} from '../../types';
import { buildGrammarScopeExplanation } from '../../utils/grammarScope';
import { HttpError } from './http';
import { requireActiveOrganizationContext } from './organization-memberships';
import { assertBookReadAccess, buildInClause, readVisibleBookRows } from './storage-support';
import type { AppEnv, DbUserRow } from './types';

type QualityStatus = AiGeneratedContentQualityStatus;
type ReviewStatus = AssessmentItemReviewStatus;

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

interface AiGeneratedProblemReviewQueueRow {
  id: string;
  content_id: string;
  word_id: string;
  book_id: string;
  book_title: string | null;
  word: string | null;
  definition: string | null;
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
  quality_status: QualityStatus;
  usage_count: number;
  last_used_at: number | null;
  payload_json: string;
  metadata_problem_id: string | null;
  construct_id: string | null;
  skill_area: string | null;
  item_format: string | null;
  cefr_target: string | null;
  calibration_status: string | null;
  review_status: ReviewStatus | null;
  sample_size: number | null;
  exposure_rate: number | null;
  version: number | null;
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

export interface CbtLearnerSnapshot {
  learner: CbtState;
  difficultyBand: CbtDifficultyBand;
}

export interface AiGeneratedProblemReviewQueueQuery {
  status?: AiGeneratedProblemReviewQueueStatus;
  limit?: number;
  bookId?: string | null;
  questionMode?: string | null;
  grammarScopeId?: GrammarCurriculumScopeId | null;
}

export interface AiGeneratedProblemReviewInput {
  problemId: string;
  decision: AiGeneratedProblemReviewDecision;
  reviewNote?: string;
  now?: number;
}

const APPROVED_REVIEW_STATUS: ReviewStatus = 'APPROVED';
const REUSABLE_CONTENT_QUALITY_STATUS: QualityStatus = 'READY';
const REJECTED_CONTENT_QUALITY_STATUS: QualityStatus = 'REJECTED';
const REVIEW_REQUIRED_CONTENT_QUALITY_STATUS: QualityStatus = DEFAULT_AI_GENERATED_PROBLEM_QUALITY_STATUS;
const REJECTED_REVIEW_STATUS: ReviewStatus = 'REJECTED';
const NEEDS_REVIEW_STATUS: ReviewStatus = 'NEEDS_REVIEW';
const LEGACY_READY_REVIEW_STATUS: ReviewStatus = DEFAULT_ASSESSMENT_ITEM_REVIEW_STATUS;

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

const safeJsonStringArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const toReviewQueueItem = (row: AiGeneratedProblemReviewQueueRow): AiGeneratedProblemReviewQueueItem => {
  const hasAssessmentMetadata = Boolean(row.metadata_problem_id);
  const reviewStatus = row.review_status || LEGACY_READY_REVIEW_STATUS;
  const contentQualityStatus = row.quality_status;
  const reviewBucket = classifyReusableAiProblemReviewState({
    contentQualityStatus,
    assessmentReviewStatus: reviewStatus,
    hasAssessmentMetadata,
  });
  return {
    problemId: row.id,
    contentId: row.content_id,
    wordId: row.word_id,
    bookId: row.book_id,
    bookTitle: row.book_title || '',
    word: row.word || '',
    definition: row.definition || '',
    questionMode: row.question_mode as AiGeneratedProblemReviewQueueItem['questionMode'],
    grammarScopeId: row.grammar_scope_id as GrammarCurriculumScopeId | null,
    promptText: row.prompt_text,
    answerText: row.answer_text,
    options: safeJsonStringArray(row.options_json),
    orderedTokens: safeJsonStringArray(row.ordered_tokens_json),
    sourceSentence: row.source_sentence,
    sourceTranslation: row.source_translation,
    grammarFocus: row.grammar_focus,
    difficultyLevel: Number(row.difficulty_level ?? 0.5),
    contentQualityStatus,
    reviewStatus,
    calibrationStatus: row.calibration_status || 'UNREVIEWED',
    constructId: row.construct_id || 'grammar-general',
    skillArea: row.skill_area || 'grammar-application',
    itemFormat: row.item_format || '',
    cefrTarget: row.cefr_target,
    usageCount: Number(row.usage_count || 0),
    lastUsedAt: row.last_used_at,
    sampleSize: Number(row.sample_size || 0),
    exposureRate: Number(row.exposure_rate || 0),
    version: Number(row.version || 1),
    isActive: Boolean(row.active),
    hasAssessmentMetadata,
    isLegacyReady: reviewBucket === 'LEGACY_READY',
    reusableBucket: reviewBucket,
    isReusable: reviewBucket === 'APPROVED',
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
};

const buildReviewQueueSql = (
  query: AiGeneratedProblemReviewQueueQuery,
  visibleBookIds: string[] | null,
): { sql: string; bindings: unknown[] } => {
  const status = query.status || 'PENDING';
  const bindings: unknown[] = [];
  const filters: string[] = ['p.active IN (0, 1)'];

  if (visibleBookIds) {
    if (visibleBookIds.length === 0) {
      filters.push('1 = 0');
    } else {
      filters.push(`p.book_id IN (${buildInClause(visibleBookIds.length)})`);
      bindings.push(...visibleBookIds);
    }
  }
  if (query.bookId) {
    filters.push('p.book_id = ?');
    bindings.push(query.bookId);
  }
  if (query.questionMode) {
    filters.push('p.question_mode = ?');
    bindings.push(query.questionMode);
  }
  if (query.grammarScopeId) {
    filters.push('p.grammar_scope_id = ?');
    bindings.push(query.grammarScopeId);
  }

  if (status === 'PENDING') {
    filters.push(`(
      c.quality_status = '${REVIEW_REQUIRED_CONTENT_QUALITY_STATUS}'
      OR (m.problem_id IS NULL AND c.quality_status = '${REUSABLE_CONTENT_QUALITY_STATUS}')
      OR (m.review_status IN ('${LEGACY_READY_REVIEW_STATUS}', '${NEEDS_REVIEW_STATUS}') AND c.quality_status != '${REJECTED_CONTENT_QUALITY_STATUS}')
    )`);
  } else if (status === 'APPROVED') {
    filters.push(`m.review_status = '${APPROVED_REVIEW_STATUS}' AND c.quality_status = '${REUSABLE_CONTENT_QUALITY_STATUS}'`);
  } else if (status === 'REJECTED') {
    filters.push(`(m.review_status = '${REJECTED_REVIEW_STATUS}' OR c.quality_status = '${REJECTED_CONTENT_QUALITY_STATUS}')`);
  }

  bindings.push(clampLimit(query.limit, 50));

  return {
    sql: `
      SELECT
        p.id, p.content_id, p.word_id, p.book_id, b.title AS book_title, w.word, w.definition,
        p.question_mode, p.grammar_scope_id, p.prompt_text, p.answer_text,
        p.options_json, p.ordered_tokens_json, p.source_sentence, p.source_translation,
        p.grammar_focus, p.difficulty_level, p.active, p.created_at, p.updated_at,
        c.quality_status, c.usage_count, c.last_used_at, c.payload_json,
        m.problem_id AS metadata_problem_id, m.construct_id, m.skill_area, m.item_format,
        m.cefr_target, m.calibration_status, m.review_status, m.sample_size, m.exposure_rate, m.version
      FROM ai_generated_problems p
      JOIN ai_generated_contents c ON c.id = p.content_id
      LEFT JOIN assessment_item_metadata m ON m.problem_id = p.id
      LEFT JOIN words w ON w.id = p.word_id
      LEFT JOIN books b ON b.id = p.book_id
      WHERE ${filters.join('\n        AND ')}
      ORDER BY
        CASE
          WHEN c.quality_status = '${REVIEW_REQUIRED_CONTENT_QUALITY_STATUS}' THEN 0
          WHEN m.review_status = '${NEEDS_REVIEW_STATUS}' THEN 1
          WHEN m.problem_id IS NULL THEN 2
          WHEN m.review_status = '${LEGACY_READY_REVIEW_STATUS}' THEN 3
          ELSE 4
        END,
        p.updated_at DESC
      LIMIT ?
    `,
    bindings,
  };
};

const getVisibleAiReviewBookIds = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<string[] | null> => {
  if (user.role === UserRole.ADMIN) return null;
  await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN, OrganizationRole.INSTRUCTOR]);
  const rows = await readVisibleBookRows(env, user);
  return rows.map((row) => row.id);
};

const readAiGeneratedProblemReviewRow = async (
  env: AppEnv,
  problemId: string,
): Promise<AiGeneratedProblemReviewQueueRow | null> => {
  return env.DB.prepare(`
    SELECT
      p.id, p.content_id, p.word_id, p.book_id, b.title AS book_title, w.word, w.definition,
      p.question_mode, p.grammar_scope_id, p.prompt_text, p.answer_text,
      p.options_json, p.ordered_tokens_json, p.source_sentence, p.source_translation,
      p.grammar_focus, p.difficulty_level, p.active, p.created_at, p.updated_at,
      c.quality_status, c.usage_count, c.last_used_at, c.payload_json,
      m.problem_id AS metadata_problem_id, m.construct_id, m.skill_area, m.item_format,
      m.cefr_target, m.calibration_status, m.review_status, m.sample_size, m.exposure_rate, m.version
    FROM ai_generated_problems p
    JOIN ai_generated_contents c ON c.id = p.content_id
    LEFT JOIN assessment_item_metadata m ON m.problem_id = p.id
    LEFT JOIN words w ON w.id = p.word_id
    LEFT JOIN books b ON b.id = p.book_id
    WHERE p.id = ?
  `).bind(problemId).first<AiGeneratedProblemReviewQueueRow>();
};

const assertAiGeneratedProblemReviewAccess = async (
  env: AppEnv,
  user: DbUserRow,
  row: AiGeneratedProblemReviewQueueRow,
): Promise<void> => {
  if (user.role === UserRole.ADMIN) return;
  await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN, OrganizationRole.INSTRUCTOR]);
  await assertBookReadAccess(env, user, row.book_id);
};

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
  const qualityStatus = input.qualityStatus ?? (
    input.contentKind === 'GRAMMAR_PROBLEM'
      ? DEFAULT_AI_GENERATED_PROBLEM_QUALITY_STATUS
      : REUSABLE_CONTENT_QUALITY_STATUS
  );

  await env.DB.prepare(`
    INSERT INTO ai_generated_contents (
      id, cache_key, content_kind, provider, model, prompt_version, word_id, book_id,
      question_mode, grammar_scope_id, source_hash, payload_json, quality_status, usage_count, last_used_at,
      expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      payload_json = CASE
        WHEN ai_generated_contents.quality_status = 'READY'
         AND EXISTS (
           SELECT 1
           FROM ai_generated_problems p
           JOIN assessment_item_metadata m ON m.problem_id = p.id
           WHERE p.content_id = ai_generated_contents.id
             AND m.review_status = 'APPROVED'
         )
        THEN ai_generated_contents.payload_json
        ELSE excluded.payload_json
      END,
      quality_status = CASE
        WHEN ai_generated_contents.quality_status = 'READY'
         AND EXISTS (
           SELECT 1
           FROM ai_generated_problems p
           JOIN assessment_item_metadata m ON m.problem_id = p.id
           WHERE p.content_id = ai_generated_contents.id
             AND m.review_status = 'APPROVED'
         )
        THEN ai_generated_contents.quality_status
        ELSE excluded.quality_status
      END,
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
    qualityStatus,
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
    qualityStatus: input.qualityStatus ?? DEFAULT_AI_GENERATED_PROBLEM_QUALITY_STATUS,
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
      grammar_scope_id = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.grammar_scope_id ELSE excluded.grammar_scope_id END,
      prompt_text = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.prompt_text ELSE excluded.prompt_text END,
      answer_text = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.answer_text ELSE excluded.answer_text END,
      options_json = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.options_json ELSE excluded.options_json END,
      ordered_tokens_json = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.ordered_tokens_json ELSE excluded.ordered_tokens_json END,
      source_sentence = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.source_sentence ELSE excluded.source_sentence END,
      source_translation = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.source_translation ELSE excluded.source_translation END,
      grammar_focus = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.grammar_focus ELSE excluded.grammar_focus END,
      difficulty_level = CASE
        WHEN EXISTS (SELECT 1 FROM assessment_item_metadata m WHERE m.problem_id = ai_generated_problems.id AND m.review_status = 'APPROVED')
        THEN ai_generated_problems.difficulty_level ELSE excluded.difficulty_level END,
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
  try {
    await env.DB.prepare(`
      INSERT INTO assessment_item_metadata (
        problem_id, construct_id, skill_area, item_format, cefr_target,
        calibration_status, review_status, irt_model, difficulty,
        discrimination, fit, sample_size, exposure_rate, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'UNREVIEWED', ?, 'NONE', ?, NULL, NULL, 0, 0, 1, ?, ?)
      ON CONFLICT(problem_id) DO UPDATE SET
        construct_id = excluded.construct_id,
        skill_area = excluded.skill_area,
        item_format = excluded.item_format,
        cefr_target = excluded.cefr_target,
        difficulty = excluded.difficulty,
        updated_at = excluded.updated_at
    `).bind(
      row.id,
      question.grammarScope?.scopeId || 'grammar-general',
      question.mode === 'JA_TRANSLATION_INPUT'
        ? 'translation-input'
        : question.mode === 'JA_TRANSLATION_ORDER'
          ? 'translation-order'
          : question.mode === 'EN_WORD_ORDER'
            ? 'english-word-order'
            : 'grammar-application',
      question.interactionType,
      question.grammarScope?.cefrLevel || null,
      DEFAULT_ASSESSMENT_ITEM_REVIEW_STATUS,
      row.difficulty_level,
      now,
      now,
    ).run();
  } catch (metadataError) {
    console.warn('Assessment item metadata write skipped:', metadataError);
  }
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

export const listAiGeneratedProblemReviewQueue = async (
  env: AppEnv,
  user: DbUserRow,
  query: AiGeneratedProblemReviewQueueQuery = {},
): Promise<AiGeneratedProblemReviewQueueResponse> => {
  const visibleBookIds = await getVisibleAiReviewBookIds(env, user);
  const { sql, bindings } = buildReviewQueueSql(query, visibleBookIds);
  const rows = await env.DB.prepare(sql).bind(...bindings).all<AiGeneratedProblemReviewQueueRow>();
  return {
    items: (rows.results || []).map(toReviewQueueItem),
  };
};

const getSkillAreaForQuestionMode = (questionMode: string): string => {
  if (questionMode === 'JA_TRANSLATION_INPUT') return 'translation-input';
  if (questionMode === 'JA_TRANSLATION_ORDER') return 'translation-order';
  if (questionMode === 'EN_WORD_ORDER') return 'english-word-order';
  return 'grammar-application';
};

const resolveReviewDecisionState = (
  decision: AiGeneratedProblemReviewDecision,
): {
  qualityStatus: QualityStatus;
  reviewStatus: ReviewStatus;
  calibrationStatus: 'UNREVIEWED' | 'TEACHER_REVIEWED' | 'REJECTED';
  active: 0 | 1;
} => {
  if (decision === 'APPROVE') {
    return {
      qualityStatus: REUSABLE_CONTENT_QUALITY_STATUS,
      reviewStatus: APPROVED_REVIEW_STATUS,
      calibrationStatus: 'TEACHER_REVIEWED',
      active: 1,
    };
  }
  if (decision === 'REJECT') {
    return {
      qualityStatus: REJECTED_CONTENT_QUALITY_STATUS,
      reviewStatus: REJECTED_REVIEW_STATUS,
      calibrationStatus: 'REJECTED',
      active: 0,
    };
  }
  return {
    qualityStatus: REVIEW_REQUIRED_CONTENT_QUALITY_STATUS,
    reviewStatus: NEEDS_REVIEW_STATUS,
    calibrationStatus: 'UNREVIEWED',
    active: 1,
  };
};

export const reviewAiGeneratedProblem = async (
  env: AppEnv,
  user: DbUserRow,
  input: AiGeneratedProblemReviewInput,
): Promise<AiGeneratedProblemReviewQueueItem> => {
  const row = await readAiGeneratedProblemReviewRow(env, input.problemId);
  if (!row) {
    throw new HttpError(404, 'AI生成問題が見つかりません。');
  }
  await assertAiGeneratedProblemReviewAccess(env, user, row);

  const now = input.now ?? Date.now();
  const next = resolveReviewDecisionState(input.decision);

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE ai_generated_contents
      SET quality_status = ?, updated_at = ?
      WHERE id = ?
    `).bind(next.qualityStatus, now, row.content_id),
    env.DB.prepare(`
      UPDATE ai_generated_problems
      SET active = ?, updated_at = ?
      WHERE id = ?
    `).bind(next.active, now, row.id),
    env.DB.prepare(`
      INSERT INTO assessment_item_metadata (
        problem_id, construct_id, skill_area, item_format, cefr_target,
        calibration_status, review_status, irt_model, difficulty,
        discrimination, fit, sample_size, exposure_rate, version,
        reviewed_by, reviewed_at, review_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'NONE', ?, NULL, NULL, 0, 0, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(problem_id) DO UPDATE SET
        calibration_status = excluded.calibration_status,
        review_status = excluded.review_status,
        difficulty = excluded.difficulty,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        review_note = excluded.review_note,
        updated_at = excluded.updated_at
    `).bind(
      row.id,
      row.construct_id || row.grammar_scope_id || 'grammar-general',
      row.skill_area || getSkillAreaForQuestionMode(row.question_mode),
      row.item_format || row.question_mode,
      row.cefr_target,
      next.calibrationStatus,
      next.reviewStatus,
      row.difficulty_level,
      user.id,
      now,
      input.reviewNote || null,
      now,
      now,
    ),
  ]);

  return toReviewQueueItem({
    ...row,
    active: next.active,
    quality_status: next.qualityStatus,
    metadata_problem_id: row.metadata_problem_id || row.id,
    construct_id: row.construct_id || row.grammar_scope_id || 'grammar-general',
    skill_area: row.skill_area || getSkillAreaForQuestionMode(row.question_mode),
    item_format: row.item_format || row.question_mode,
    calibration_status: next.calibrationStatus,
    review_status: next.reviewStatus,
    updated_at: now,
  });
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
    LEFT JOIN assessment_item_metadata m ON m.problem_id = p.id
    WHERE p.word_id IN (${placeholders})
      AND p.question_mode = ?
      AND (? IS NULL OR p.grammar_scope_id = ?)
      AND p.active = 1
      AND (
        (m.review_status = '${APPROVED_REVIEW_STATUS}' AND c.quality_status = '${REUSABLE_CONTENT_QUALITY_STATUS}')
      )
      AND p.difficulty_level BETWEEN ? AND ?
    ORDER BY
      CASE WHEN m.review_status = '${APPROVED_REVIEW_STATUS}' THEN 0 ELSE 1 END,
      c.usage_count ASC,
      p.updated_at DESC
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
    LEFT JOIN assessment_item_metadata m ON m.problem_id = p.id
    WHERE p.word_id IN (${placeholders})
      AND p.question_mode = ?
      AND (? IS NULL OR p.grammar_scope_id = ?)
      AND p.active = 1
      AND (
        (m.review_status = '${APPROVED_REVIEW_STATUS}' AND c.quality_status = '${REUSABLE_CONTENT_QUALITY_STATUS}')
      )
      AND (c.expires_at IS NULL OR c.expires_at > ?)
      AND p.difficulty_level BETWEEN ? AND ?
    ORDER BY
      CASE WHEN m.review_status = '${APPROVED_REVIEW_STATUS}' THEN 0 ELSE 1 END,
      c.usage_count ASC,
      p.updated_at DESC
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
          grammarExplanation: parsed.grammarExplanation || buildGrammarScopeExplanation(parsed.grammarScope),
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

export const readCbtLearnerSnapshot = async (
  env: AppEnv,
  userId: string | null | undefined,
): Promise<CbtLearnerSnapshot> => {
  if (!userId) {
    const learner = getInitialCbtState();
    return { learner, difficultyBand: selectCbtDifficultyBand(learner, 0.28) };
  }
  const row = await env.DB.prepare('SELECT * FROM cbt_learner_profiles WHERE user_id = ?')
    .bind(userId)
    .first<CbtRow>();
  const learner = toCbtState(row, 'ability_level');
  return {
    learner,
    difficultyBand: selectCbtDifficultyBand(learner),
  };
};

export const readCbtLearnerScopeSnapshot = async (
  env: AppEnv,
  userId: string | null | undefined,
  grammarScopeId: GrammarCurriculumScopeId | null | undefined,
  questionMode: string | null | undefined,
): Promise<CbtLearnerSnapshot> => {
  if (!userId || !grammarScopeId || !questionMode) {
    return readCbtLearnerSnapshot(env, userId);
  }
  const row = await env.DB.prepare(`
    SELECT * FROM cbt_learner_scope_states
    WHERE user_id = ? AND grammar_scope_id = ? AND question_mode = ?
  `).bind(userId, grammarScopeId, questionMode).first<CbtRow>();
  if (!row) return readCbtLearnerSnapshot(env, userId);
  const learner = toCbtState(row, 'mastery_level');
  return {
    learner,
    difficultyBand: selectCbtDifficultyBand(learner),
  };
};

export const recordCbtScopeAttempt = async (
  env: AppEnv,
  input: {
    userId: string;
    grammarScopeId: GrammarCurriculumScopeId;
    questionMode: string;
    correct: boolean;
    difficultyLevel?: number | null;
    responseTimeMs?: number;
    now?: number;
  },
): Promise<CbtState> => {
  const now = input.now ?? Date.now();
  const row = await env.DB.prepare(`
    SELECT * FROM cbt_learner_scope_states
    WHERE user_id = ? AND grammar_scope_id = ? AND question_mode = ?
  `).bind(input.userId, input.grammarScopeId, input.questionMode).first<CbtRow>();
  const state = advanceCbtState(toCbtState(row, 'mastery_level'), {
    correct: input.correct,
    difficultyLevel: input.difficultyLevel ?? 0.5,
  });
  await env.DB.prepare(`
    INSERT INTO cbt_learner_scope_states (
      user_id, grammar_scope_id, question_mode, mastery_level, confidence,
      attempt_count, correct_count, last_attempt_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, grammar_scope_id, question_mode) DO UPDATE SET
      mastery_level = excluded.mastery_level,
      confidence = excluded.confidence,
      attempt_count = excluded.attempt_count,
      correct_count = excluded.correct_count,
      last_attempt_at = excluded.last_attempt_at,
      updated_at = excluded.updated_at
  `).bind(
    input.userId,
    input.grammarScopeId,
    input.questionMode,
    state.level,
    state.confidence,
    state.attemptCount,
    state.correctCount,
    now,
    now,
  ).run();
  return state;
};

export const recordJapaneseTranslationFeedbackEvent = async (
  env: AppEnv,
  input: {
    userId: string;
    wordId: string;
    bookId: string;
    questionMode: string;
    grammarScopeId?: GrammarCurriculumScopeId | null;
    sourceSentence: string;
    expectedTranslation: string;
    userTranslation: string;
    feedback: JapaneseTranslationFeedback;
    examTarget?: string | null;
    organizationId?: string | null;
    model?: string | null;
    promptVersion?: string | null;
    now?: number;
  },
): Promise<void> => {
  const now = input.now ?? Date.now();
  const id = `translation-feedback-${createAiCacheKey({
    contentKind: 'GRAMMAR_PROBLEM',
    model: 'feedback',
    promptVersion: 'v1',
    wordId: input.wordId,
    questionMode: input.questionMode,
    grammarScopeId: input.grammarScopeId,
    sourceText: `${input.userId}:${input.sourceSentence}:${input.userTranslation}:${now}`,
  }).sourceHash}-${now}`;
  await env.DB.prepare(`
    INSERT INTO japanese_translation_feedback_events (
      id, user_id, word_id, book_id, question_mode, grammar_scope_id,
      source_sentence, expected_translation, user_translation, score, max_score,
      is_correct, verdict_label, feedback_json, created_at,
      exam_target, organization_id, model, prompt_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.userId,
    input.wordId,
    input.bookId,
    input.questionMode,
    input.grammarScopeId || null,
    input.sourceSentence,
    input.expectedTranslation,
    input.userTranslation,
    input.feedback.score,
    input.feedback.maxScore,
    input.feedback.isCorrect ? 1 : 0,
    input.feedback.verdictLabel,
    JSON.stringify(input.feedback),
    now,
    input.examTarget || input.feedback.examTarget || null,
    input.organizationId || null,
    input.model || null,
    input.promptVersion || null,
  ).run();
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
    env.DB.prepare(`
      UPDATE ai_generated_problems
      SET difficulty_level = ?, updated_at = ?
      WHERE id = ?
    `).bind(nextDifficulty, now, input.problemId),
  ]);

  return { learner, word, problemDifficultyLevel: nextDifficulty };
};
