import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assertAiActionAllowedMock,
  assertBudgetAvailableMock,
  generateContentMock,
  recordAiUsageEventMock,
} = vi.hoisted(() => ({
  assertAiActionAllowedMock: vi.fn(),
  assertBudgetAvailableMock: vi.fn(),
  generateContentMock: vi.fn(),
  recordAiUsageEventMock: vi.fn(),
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
    NUMBER: 'NUMBER',
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
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

describe('handleAiAction metering integration', () => {
  beforeEach(() => {
    assertAiActionAllowedMock.mockReset();
    assertBudgetAvailableMock.mockReset();
    recordAiUsageEventMock.mockReset();
    generateContentMock.mockReset();
  });

  it('uses shared metering helpers for metered actions', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify([
        {
          wordId: 'word-1',
          options: ['a', 'b', 'c', 'd'],
          correctOption: 'a',
        },
      ]),
    });

    const env = {
      GEMINI_API_KEY: 'test-key',
    } as any;
    const user = createUser() as any;
    const logContext = {
      requestId: 'req-1',
      pathname: 'ai',
      method: 'POST',
      deployment: 'preview',
      deploymentSha: 'sha-1',
      source: 'api.ai',
    } as const;

    const result = await handleAiAction(env, user, {
      action: 'generateAIQuiz',
      payload: {
        targetWords: [
          {
            id: 'word-1',
            word: 'apple',
            definition: 'りんご',
          },
        ],
      },
    }, logContext as any);

    expect(Array.isArray(result)).toBe(true);
    expect(assertBudgetAvailableMock).toHaveBeenCalledWith(env, user, 'generateAIQuiz');
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(env, user, {
      action: 'generateAIQuiz',
      usedAi: true,
      logContext,
    });
  });

  it('generates grammar practice questions through the metered AI route', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify([
        {
          wordId: 'word-1',
          mode: 'GRAMMAR_CLOZE',
          promptText: 'Doctors ____ the patient before surgery.',
          sourceSentence: 'Doctors stabilize the patient before surgery.',
          sourceTranslation: '',
          answer: 'stabilize',
          options: ['stabilize', 'stabilized', 'stabilizes', 'stabilizing'],
          orderedTokens: [],
          grammarFocus: '時を表す副詞句',
          instruction: '空所に入る語形を選びます。',
        },
      ]),
    });

    const env = {
      GEMINI_API_KEY: 'test-key',
    } as any;
    const user = createUser() as any;

    const result = await handleAiAction(env, user, {
      action: 'generateGrammarPracticeQuestions',
      payload: {
        mode: 'GRAMMAR_CLOZE',
        questionCount: 1,
        targetWords: [
          {
            id: 'word-1',
            bookId: 'book-1',
            number: 1,
            word: 'stabilize',
            definition: '安定させる',
          },
        ],
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        mode: 'GRAMMAR_CLOZE',
        promptText: 'Doctors ____ the patient before surgery.',
        answer: 'stabilize',
      }),
    ]);
    expect(assertBudgetAvailableMock).toHaveBeenCalledWith(env, user, 'generateGrammarPracticeQuestions');
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(env, user, {
      action: 'generateGrammarPracticeQuestions',
      usedAi: true,
      model: 'gemini-2.5-flash',
      providerInputUnits: 1,
      providerOutputUnits: 1,
    });
  });

  it('keeps learning-plan fallback on access check only when GEMINI_API_KEY is missing', async () => {
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
    expect(assertAiActionAllowedMock).toHaveBeenCalledWith(user, 'generateLearningPlan');
    expect(assertBudgetAvailableMock).not.toHaveBeenCalled();
    expect(recordAiUsageEventMock).not.toHaveBeenCalled();
  });
});
