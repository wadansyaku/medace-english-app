import { describe, expect, it, vi } from 'vitest';

import {
  advanceCbtState,
  createAiCacheKey,
  inferProblemDifficultyFromStats,
} from '../services/storage/ai-cache-cbt';
import {
  readReusableAiGrammarQuestions,
  readReusableAiGrammarProblems,
  recordAiGeneratedProblem,
} from '../functions/_shared/ai-cache-cbt';
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
    batch: vi.fn(async () => []),
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
      quality_status: 'READY',
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
    expect(db.queries.some((queryText) => queryText.includes('INSERT INTO ai_generated_problems'))).toBe(true);
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
    expect(db.binds.at(-1)?.values).toEqual(['word-1', 'word-2', 'GRAMMAR_CLOZE', 'basic-svo', 'basic-svo', 0.2, 0.8, 25]);
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
    expect(db.binds.at(-3)?.values).toEqual(['word-1', 'word-2', 'GRAMMAR_CLOZE', 'basic-svo', 'basic-svo', 200, 0, 1, 8]);
  });
});
