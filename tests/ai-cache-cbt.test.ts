import { describe, expect, it, vi } from 'vitest';

import {
  advanceCbtState,
  classifyReusableAiProblemReviewState,
  createAiCacheKey,
  inferProblemDifficultyFromStats,
  isReusableAiProblemReviewState,
  selectCbtDifficultyBand,
} from '../shared/aiCacheCbt';
import {
  listAiGeneratedProblemReviewQueue,
  readReusableAiGrammarQuestions,
  readReusableAiGrammarProblems,
  readCbtLearnerScopeSnapshot,
  recordCbtProblemAttempt,
  recordCbtScopeAttempt,
  recordAiGeneratedProblem,
  reviewAiGeneratedProblem,
} from '../functions/_shared/ai-cache-cbt';
import { UserRole } from '../types';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';

const createStatement = (db: ReturnType<typeof createMockDb>, query: string) => {
  const statement = {
    values: [] as unknown[],
    bind: vi.fn((...values: unknown[]) => {
      statement.values = values;
      db.binds.push({ query, values });
      return statement;
    }),
    run: vi.fn(async () => ({ meta: {} })),
    first: vi.fn(async () => db.firstQueue.shift() ?? null),
    all: vi.fn(async () => ({ meta: {}, results: db.allQueue.shift() ?? [] })),
  };
  return statement;
};

const createMockDb = () => {
  const db = {
    queries: [] as string[],
    binds: [] as Array<{ query: string; values: unknown[] }>,
    firstQueue: [] as unknown[],
    allQueue: [] as unknown[][],
    prepare: vi.fn((query: string) => {
      db.queries.push(query);
      return createStatement(db, query);
    }),
    batch: vi.fn(async (_statements: unknown[]) => []),
  };
  return db;
};

const question: GeneratedWorksheetQuestion = {
  id: 'q-1',
  mode: 'GRAMMAR_CLOZE',
  interactionType: 'CHOICE',
  wordId: 'word-1',
  bookId: 'book-1',
  promptLabel: '文法穴埋め',
  promptText: 'Doctors ____ the patient.',
  answer: 'stabilize',
  options: ['stabilize', 'stabilized', 'stabilizes'],
  sourceSentence: 'Doctors stabilize the patient.',
  grammarFocus: '動詞',
};

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  organization_role: null,
  subscription_plan: null,
} as any;

describe('AI cache and CBT helpers', () => {
  it('creates stable cache keys from normalized source text', () => {
    const first = createAiCacheKey({
      contentKind: 'GRAMMAR_PROBLEM',
      model: 'gemini-2.5-flash',
      promptVersion: 'grammar-v1',
      wordId: 'word-1',
      questionMode: 'GRAMMAR_CLOZE',
      sourceText: 'Doctors   stabilize the patient.',
    });
    const second = createAiCacheKey({
      contentKind: 'GRAMMAR_PROBLEM',
      model: 'gemini-2.5-flash',
      promptVersion: 'grammar-v1',
      wordId: 'word-1',
      questionMode: 'GRAMMAR_CLOZE',
      sourceText: 'Doctors stabilize the patient.',
    });

    expect(first).toEqual(second);
    expect(first.cacheKey).toContain('GRAMMAR_PROBLEM');
  });

  it('advances learner and word CBT levels with bounded confidence', () => {
    const initial = { level: 0.5, confidence: 0, attemptCount: 0, correctCount: 0 };
    const afterCorrect = advanceCbtState(initial, { correct: true, difficultyLevel: 0.7 });
    const afterIncorrect = advanceCbtState(afterCorrect, { correct: false, difficultyLevel: 0.4 });

    expect(afterCorrect.level).toBeGreaterThan(initial.level);
    expect(afterIncorrect.level).toBeLessThan(afterCorrect.level);
    expect(afterIncorrect.confidence).toBeGreaterThan(0);
    expect(afterIncorrect.confidence).toBeLessThanOrEqual(1);
    expect(inferProblemDifficultyFromStats(4, 1)).toBe(0.75);
    expect(selectCbtDifficultyBand(afterCorrect)).toEqual(expect.objectContaining({
      minDifficultyLevel: expect.any(Number),
      maxDifficultyLevel: expect.any(Number),
    }));
  });

  it('classifies approved and legacy-ready generated problems as reusable only after review gating', () => {
    expect(classifyReusableAiProblemReviewState({
      contentQualityStatus: 'READY',
      assessmentReviewStatus: 'APPROVED',
      hasAssessmentMetadata: true,
    })).toBe('APPROVED');
    expect(classifyReusableAiProblemReviewState({
      contentQualityStatus: 'READY',
      hasAssessmentMetadata: false,
    })).toBe('LEGACY_READY');
    expect(isReusableAiProblemReviewState({
      contentQualityStatus: 'READY',
      hasAssessmentMetadata: false,
    })).toBe(false);
    expect(isReusableAiProblemReviewState({
      contentQualityStatus: 'NEEDS_REVIEW',
      assessmentReviewStatus: 'PENDING',
      hasAssessmentMetadata: true,
    })).toBe(false);
  });

  it('records CBT scope attempts separately from the global learner profile', async () => {
    const db = createMockDb();
    db.firstQueue.push(null);

    await recordCbtScopeAttempt({ DB: db } as any, {
      userId: 'user-1',
      grammarScopeId: 'passive-voice',
      questionMode: 'JA_TRANSLATION_INPUT',
      correct: false,
      now: 100,
    });

    expect(db.queries.some((queryText) => queryText.includes('cbt_learner_scope_states'))).toBe(true);
    expect(db.binds.at(-1)?.values.slice(0, 3)).toEqual(['user-1', 'passive-voice', 'JA_TRANSLATION_INPUT']);
  });

  it('writes generated grammar problems through the cache table first', async () => {
    const db = createMockDb();
    db.firstQueue.push({
      id: 'ai-content-abc',
      cache_key: 'cache',
      content_kind: 'GRAMMAR_PROBLEM',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      prompt_version: 'grammar-v1',
      word_id: 'word-1',
      book_id: 'book-1',
      question_mode: 'GRAMMAR_CLOZE',
      grammar_scope_id: null,
      source_hash: 'abc',
      payload_json: '{}',
      quality_status: 'NEEDS_REVIEW',
      usage_count: 0,
      last_used_at: null,
      expires_at: null,
      created_at: 100,
      updated_at: 100,
    });
    db.firstQueue.push({
      id: 'ai-problem-abc',
      content_id: 'ai-content-abc',
      word_id: 'word-1',
      book_id: 'book-1',
      question_mode: 'GRAMMAR_CLOZE',
      grammar_scope_id: null,
      prompt_text: question.promptText,
      answer_text: question.answer,
      options_json: JSON.stringify(question.options),
      ordered_tokens_json: '[]',
      source_sentence: question.sourceSentence,
      source_translation: null,
      grammar_focus: question.grammarFocus,
      difficulty_level: 0.5,
      active: 1,
      created_at: 100,
      updated_at: 100,
    });

    const row = await recordAiGeneratedProblem({ DB: db } as any, {
      question,
      model: 'gemini-2.5-flash',
      promptVersion: 'grammar-v1',
      now: 100,
    });

    expect(row.id).toBe('ai-problem-abc');
    expect(db.queries[0]).toContain('INSERT INTO ai_generated_contents');
    expect(db.queries[0]).toContain("review_status = 'APPROVED'");
    expect(db.queries.some((queryText) => queryText.includes('INSERT INTO ai_generated_problems'))).toBe(true);
    expect(db.queries.find((queryText) => queryText.includes('INSERT INTO ai_generated_problems'))).toContain("review_status = 'APPROVED'");
    const contentInsert = db.binds.find(({ query: queryText }) => queryText.includes('INSERT INTO ai_generated_contents'));
    expect(contentInsert?.values[12]).toBe('NEEDS_REVIEW');
    const metadataInsert = db.binds.find(({ query: queryText }) => queryText.includes('INSERT INTO assessment_item_metadata'));
    expect(metadataInsert?.values[5]).toBe('PENDING');
  });

  it('reads reusable grammar problems with bounded limits and explicit difficulty range', async () => {
    const db = createMockDb();
    db.allQueue.push([
      { id: 'ai-problem-1', word_id: 'word-1' },
      { id: 'ai-problem-duplicate', word_id: 'word-1' },
      { id: 'ai-problem-2', word_id: 'word-2' },
    ]);

    const rows = await readReusableAiGrammarProblems({ DB: db } as any, {
      wordIds: ['word-1', 'word-2'],
      questionMode: 'GRAMMAR_CLOZE',
      grammarScopeId: 'basic-svo',
      limit: 100,
      minDifficultyLevel: 0.2,
      maxDifficultyLevel: 0.8,
    });

    expect(rows).toEqual([
      { id: 'ai-problem-1', word_id: 'word-1' },
      { id: 'ai-problem-2', word_id: 'word-2' },
    ]);
    expect(db.queries.at(-1)).toContain('LEFT JOIN assessment_item_metadata');
    expect(db.queries.at(-1)).toContain("m.review_status = 'APPROVED'");
    expect(db.queries.at(-1)).not.toContain("m.problem_id IS NULL AND c.quality_status = 'READY'");
    expect(db.binds.at(-1)?.values).toEqual(['word-1', 'word-2', 'GRAMMAR_CLOZE', 'basic-svo', 'basic-svo', 0.2, 0.8, 25]);
  });

  it('prefers CBT scope state when reading a scoped learner snapshot', async () => {
    const db = createMockDb();
    db.firstQueue.push({
      mastery_level: 0.2,
      confidence: 0.4,
      attempt_count: 5,
      correct_count: 1,
      last_attempt_at: 100,
      updated_at: 100,
    });

    const snapshot = await readCbtLearnerScopeSnapshot({ DB: db } as any, 'user-1', 'passive-voice', 'JA_TRANSLATION_INPUT');

    expect(snapshot.learner.level).toBeCloseTo(0.2);
    expect(db.queries[0]).toContain('cbt_learner_scope_states');
    expect(db.binds[0]?.values).toEqual(['user-1', 'passive-voice', 'JA_TRANSLATION_INPUT']);
  });

  it('reads one reusable question per word and preserves generated problem ids', async () => {
    const db = createMockDb();
    db.allQueue.push([
      {
        id: 'ai-problem-1',
        content_id: 'ai-content-1',
        word_id: 'word-1',
        question_mode: 'GRAMMAR_CLOZE',
        payload_json: JSON.stringify(question),
      },
      {
        id: 'ai-problem-duplicate',
        content_id: 'ai-content-duplicate',
        word_id: 'word-1',
        question_mode: 'GRAMMAR_CLOZE',
        payload_json: JSON.stringify({ ...question, id: 'q-duplicate' }),
      },
      {
        id: 'ai-problem-2',
        content_id: 'ai-content-2',
        word_id: 'word-2',
        question_mode: 'GRAMMAR_CLOZE',
        payload_json: JSON.stringify({ ...question, id: 'q-2', wordId: 'word-2' }),
      },
    ]);

    const rows = await readReusableAiGrammarQuestions({ DB: db } as any, {
      wordIds: ['word-1', 'word-2'],
      questionMode: 'GRAMMAR_CLOZE',
      grammarScopeId: 'basic-svo',
      limit: 2,
    }, 200);

    expect(rows.map((row) => row.wordId)).toEqual(['word-1', 'word-2']);
    expect(rows[0]).toMatchObject({
      generatedProblemId: 'ai-problem-1',
      aiContentId: 'ai-content-1',
    });
    expect(db.queries[0]).toContain('LEFT JOIN assessment_item_metadata');
    expect(db.queries[0]).toContain("m.review_status = 'APPROVED'");
    expect(db.queries[0]).not.toContain("m.problem_id IS NULL AND c.quality_status = 'READY'");
    expect(db.binds.at(-3)?.values).toEqual(['word-1', 'word-2', 'GRAMMAR_CLOZE', 'basic-svo', 'basic-svo', 200, 0, 1, 8]);
  });

  it('lists pending review queue items with legacy-ready rows surfaced explicitly', async () => {
    const db = createMockDb();
    db.allQueue.push([
      {
        id: 'ai-problem-1',
        content_id: 'ai-content-1',
        word_id: 'word-1',
        book_id: 'book-1',
        book_title: 'Grammar Book',
        word: 'stabilize',
        definition: '安定させる',
        question_mode: 'GRAMMAR_CLOZE',
        grammar_scope_id: 'basic-svo',
        prompt_text: question.promptText,
        answer_text: question.answer,
        options_json: JSON.stringify(question.options),
        ordered_tokens_json: JSON.stringify(['Doctors', 'stabilize', 'the', 'patient']),
        source_sentence: question.sourceSentence,
        source_translation: null,
        grammar_focus: question.grammarFocus,
        difficulty_level: 0.5,
        active: 1,
        created_at: 100,
        updated_at: 150,
        quality_status: 'READY',
        usage_count: 3,
        last_used_at: 140,
        payload_json: JSON.stringify(question),
        metadata_problem_id: null,
        construct_id: null,
        skill_area: null,
        item_format: null,
        cefr_target: null,
        calibration_status: null,
        review_status: null,
        sample_size: null,
        exposure_rate: null,
        version: null,
      },
    ]);

    const queue = await listAiGeneratedProblemReviewQueue({ DB: db } as any, adminUser, {
      status: 'PENDING',
      limit: 10,
      questionMode: 'GRAMMAR_CLOZE',
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      problemId: 'ai-problem-1',
      reviewStatus: 'PENDING',
      isLegacyReady: true,
      reusableBucket: 'LEGACY_READY',
      isReusable: false,
      options: question.options,
    });
    expect(db.queries[0]).toContain('LEFT JOIN assessment_item_metadata');
    expect(db.queries[0]).toContain("m.problem_id IS NULL AND c.quality_status = 'READY'");
    expect(db.binds.at(-1)?.values).toEqual(['GRAMMAR_CLOZE', 10]);
  });

  it('approves generated problems by setting content ready and metadata approved', async () => {
    const db = createMockDb();
    db.firstQueue.push({
      id: 'ai-problem-1',
      content_id: 'ai-content-1',
      word_id: 'word-1',
      book_id: 'book-1',
      book_title: 'Grammar Book',
      word: 'stabilize',
      definition: '安定させる',
      question_mode: 'GRAMMAR_CLOZE',
      grammar_scope_id: 'basic-svo',
      prompt_text: question.promptText,
      answer_text: question.answer,
      options_json: JSON.stringify(question.options),
      ordered_tokens_json: '[]',
      source_sentence: question.sourceSentence,
      source_translation: null,
      grammar_focus: question.grammarFocus,
      difficulty_level: 0.5,
      active: 1,
      created_at: 100,
      updated_at: 150,
      quality_status: 'NEEDS_REVIEW',
      usage_count: 0,
      last_used_at: null,
      payload_json: JSON.stringify(question),
      metadata_problem_id: 'ai-problem-1',
      construct_id: 'basic-svo',
      skill_area: 'grammar-application',
      item_format: 'CHOICE',
      cefr_target: 'A2',
      calibration_status: 'UNREVIEWED',
      review_status: 'PENDING',
      sample_size: 0,
      exposure_rate: 0,
      version: 1,
    });

    const reviewed = await reviewAiGeneratedProblem({ DB: db } as any, adminUser, {
      problemId: 'ai-problem-1',
      decision: 'APPROVE',
      reviewNote: '授業で使える水準です。',
      now: 500,
    });

    expect(reviewed).toMatchObject({
      contentQualityStatus: 'READY',
      reviewStatus: 'APPROVED',
      reusableBucket: 'APPROVED',
      isReusable: true,
    });
    expect(db.batch.mock.calls[0]?.[0]).toHaveLength(3);
    expect(db.binds.find(({ query: queryText }) => queryText.includes('UPDATE ai_generated_contents'))?.values)
      .toEqual(['READY', 500, 'ai-content-1']);
    expect(db.binds.find(({ query: queryText }) => queryText.includes('INSERT INTO assessment_item_metadata'))?.values.slice(5, 7))
      .toEqual(['TEACHER_REVIEWED', 'APPROVED']);
    expect(db.binds.find(({ query: queryText }) => queryText.includes('INSERT INTO assessment_item_metadata'))?.values.slice(8, 11))
      .toEqual(['admin-1', 500, '授業で使える水準です。']);
  });

  it('writes updated CBT problem difficulty back to the generated problem row', async () => {
    const db = createMockDb();
    db.firstQueue.push(
      {
        difficulty_level: 0.4,
        exposure_count: 3,
        correct_count: 1,
        avg_response_time_ms: 900,
      },
      null,
      null,
    );

    const result = await recordCbtProblemAttempt({ DB: db } as any, {
      userId: 'user-1',
      wordId: 'word-1',
      problemId: 'ai-problem-1',
      correct: false,
      responseTimeMs: 1200,
      now: 500,
    });

    expect(result.problemDifficultyLevel).toBe(0.75);
    expect(db.batch.mock.calls[0]?.[0]).toHaveLength(4);
    const problemUpdate = db.binds.find(({ query: queryText }) => queryText.includes('UPDATE ai_generated_problems'));
    expect(problemUpdate?.values).toEqual([0.75, 500, 'ai-problem-1']);
  });
});
