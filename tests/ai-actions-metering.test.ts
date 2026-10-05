import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assertAiActionAllowedMock,
  assertBudgetAvailableMock,
  generateContentMock,
  recordAiUsageEventMock,
  runCloudflareAiMock,
  readReviewedQuestionsMock,
} = vi.hoisted(() => ({
  assertAiActionAllowedMock: vi.fn(),
  assertBudgetAvailableMock: vi.fn(),
  generateContentMock: vi.fn(),
  recordAiUsageEventMock: vi.fn(),
  runCloudflareAiMock: vi.fn(),
  readReviewedQuestionsMock: vi.fn(),
}));

vi.mock('../functions/_shared/ai-metering', () => ({
  assertAiActionAllowed: assertAiActionAllowedMock,
  assertBudgetAvailable: assertBudgetAvailableMock,
  recordAiUsageEvent: recordAiUsageEventMock,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
    };
  },
  Type: {
    ARRAY: 'ARRAY',
    BOOLEAN: 'BOOLEAN',
    NUMBER: 'NUMBER',
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

vi.mock('../functions/_shared/ai-cache-cbt', () => ({
  readCbtLearnerScopeSnapshot: vi.fn().mockResolvedValue(null),
  readCbtLearnerSnapshot: vi.fn().mockResolvedValue(null),
  readReusableAiGrammarQuestions: readReviewedQuestionsMock,
  recordAiGeneratedProblem: vi.fn(),
}));

import { handleAiAction } from '../functions/_shared/ai-actions';

const createUser = () => ({
  id: 'user-1',
  email: 'user@example.com',
  password_hash: null,
  display_name: 'User',
  role: 'STUDENT',
  grade: null,
  english_level: null,
  subscription_plan: 'TOB_PAID',
  organization_id: null,
  organization_name: null,
  organization_role: null,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 0,
  updated_at: 0,
});

describe('legacy live AI disabled and reviewed cache integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readReviewedQuestionsMock.mockResolvedValue([]);
  });

  it.each(['AUTO', 'GEMINI', 'CLOUDFLARE'])('never infers or charges missing grammar with %s configuration', async (provider) => {
    const env = { GEMINI_API_KEY: 'synthetic-test-key', AI: { run: runCloudflareAiMock }, AI_GRAMMAR_PROVIDER: provider } as any;
    const user = createUser() as any;
    const result = await handleAiAction(env, user, {
      action: 'generateGrammarPracticeQuestions', payload: {
        mode: 'GRAMMAR_CLOZE', questionCount: 2,
        targetWords: [{ id: 'word-1', bookId: 'book-1', number: 1, word: 'stabilize', definition: '安定させる' }],
      },
    });
    expect(result).toEqual([]);
    expect(assertAiActionAllowedMock).toHaveBeenCalledWith(user, 'generateGrammarPracticeQuestions');
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(runCloudflareAiMock).not.toHaveBeenCalled();
    expect(assertBudgetAvailableMock).not.toHaveBeenCalled();
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(env, user, expect.objectContaining({ usedAi: false, estimatedCostMilliYen: 0, estimatedProviderCostMilliYen: 0 }));
  });

  it('preserves a partial reviewed cache without generating the missing word', async () => {
    const reviewed = { wordId: 'word-1', mode: 'GRAMMAR_CLOZE', qualityStatus: 'APPROVED' };
    readReviewedQuestionsMock.mockResolvedValue([reviewed]);
    const env = { DB: {}, GEMINI_API_KEY: 'synthetic-test-key', AI: { run: runCloudflareAiMock } } as any;
    const result = await handleAiAction(env, createUser() as any, {
      action: 'generateGrammarPracticeQuestions', payload: {
        mode: 'GRAMMAR_CLOZE', questionCount: 2,
        targetWords: [
          { id: 'word-1', bookId: 'book-1', number: 1, word: 'stabilize', definition: '安定させる' },
          { id: 'word-2', bookId: 'book-1', number: 2, word: 'monitor', definition: '観察する' },
        ],
      },
    });
    expect(result).toEqual([reviewed]);
    expect(readReviewedQuestionsMock).toHaveBeenCalledWith(env, expect.objectContaining({ wordIds: ['word-1', 'word-2'], limit: 2 }));
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(runCloudflareAiMock).not.toHaveBeenCalled();
    expect(assertBudgetAvailableMock).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'generateAIQuiz', payload: { targetWords: [{ id: 'word-1', word: 'apple', definition: 'りんご' }] } },
    { action: 'extractVocabularyFromText', payload: { rawText: 'A synthetic sentence.' } },
    { action: 'evaluateJapaneseTranslationAnswer', payload: { sourceSentence: 'A term is reviewed.', expectedTranslation: '語が復習される。', userTranslation: '語を復習する。', examTarget: 'UNIVERSITY_ENTRANCE' } },
  ])('rejects $action with present credentials before budget or provider execution', async (request) => {
    await expect(handleAiAction({ GEMINI_API_KEY: 'synthetic-test-key', AI: { run: runCloudflareAiMock } } as any, createUser() as any, request)).rejects.toMatchObject({ status: 503 });
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(runCloudflareAiMock).not.toHaveBeenCalled();
    expect(assertBudgetAvailableMock).not.toHaveBeenCalled();
    expect(recordAiUsageEventMock).not.toHaveBeenCalled();
  });

  it('keeps access denial before the disabled provider notice', async () => {
    assertAiActionAllowedMock.mockImplementationOnce(() => { throw Object.assign(new Error('access denied'), { status: 403 }); });
    await expect(handleAiAction({} as any, createUser() as any, { action: 'generateAIQuiz', payload: { targetWords: [{ id: 'word-1', word: 'apple', definition: 'りんご' }] } })).rejects.toMatchObject({ status: 403 });
    expect(recordAiUsageEventMock).not.toHaveBeenCalled();
  });

  it('uses an authenticated standard learning plan without provider, budget, or usage calls', async () => {
    const env = {} as any;
    const user = createUser() as any;

    const result = await handleAiAction(env, user, {
      action: 'generateLearningPlan',
      payload: {
        grade: 'ADULT',
        level: 'B1',
        availableBooks: [],
      },
    });

    expect(result).toEqual(expect.objectContaining({
      uid: user.id,
      status: 'ACTIVE',
    }));
    expect(assertAiActionAllowedMock).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(assertBudgetAvailableMock).not.toHaveBeenCalled();
    expect(recordAiUsageEventMock).not.toHaveBeenCalled();
  });
});
