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
    BOOLEAN: 'BOOLEAN',
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
    expect(assertAiActionAllowedMock).toHaveBeenCalledWith(user, 'generateGrammarPracticeQuestions');
    expect(assertBudgetAvailableMock).toHaveBeenCalledWith(env, user, 'generateGrammarPracticeQuestions', 340);
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(env, user, {
      action: 'generateGrammarPracticeQuestions',
      usedAi: true,
      model: 'gemini-3-flash-preview',
      estimatedCostMilliYen: 340,
      estimatedProviderCostMilliYen: 340,
      requestUnits: 1,
      providerInputUnits: 1,
      providerOutputUnits: 1,
    });
  });

  it('scales grammar practice budget to generated AI misses and keeps the result when usage logging fails', async () => {
    recordAiUsageEventMock.mockRejectedValueOnce(new Error('usage write failed'));
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
        {
          wordId: 'word-2',
          mode: 'GRAMMAR_CLOZE',
          promptText: 'Nurses ____ the patient after admission.',
          sourceSentence: 'Nurses monitor the patient after admission.',
          sourceTranslation: '',
          answer: 'monitor',
          options: ['monitor', 'monitored', 'monitors', 'monitoring'],
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
        questionCount: 5,
        targetWords: [
          {
            id: 'word-1',
            bookId: 'book-1',
            number: 1,
            word: 'stabilize',
            definition: '安定させる',
          },
          {
            id: 'word-2',
            bookId: 'book-1',
            number: 2,
            word: 'monitor',
            definition: '観察する',
          },
        ],
      },
    });

    expect(result).toHaveLength(2);
    expect(assertBudgetAvailableMock).toHaveBeenCalledWith(env, user, 'generateGrammarPracticeQuestions', 680);
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(env, user, expect.objectContaining({
      action: 'generateGrammarPracticeQuestions',
      usedAi: true,
      estimatedCostMilliYen: 680,
      estimatedProviderCostMilliYen: 680,
      requestUnits: 5,
      providerInputUnits: 2,
      providerOutputUnits: 2,
    }));
  });

  it('meters Japanese translation feedback and returns exam rubric details', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        isCorrect: false,
        score: 6,
        maxScore: 10,
        verdictLabel: '部分点',
        summaryJa: '意味の中心は取れていますが、受け身の関係が弱いです。',
        strengths: ['主要語を訳せています。'],
        issues: ['誰が何をされたかを補いましょう。'],
        improvedTranslation: 'その語は今日、生徒によって復習される。',
        grammarAdviceJa: 'be動詞 + 過去分詞を受け身として読みます。',
        nextDrillJa: '主語 / be+過去分詞 / by の3ますで確認しましょう。',
        criteria: [
          { label: '意味', score: 3, maxScore: 4, comment: '中心は取れています。' },
          { label: '文法構造', score: 1, maxScore: 3, comment: '受け身が曖昧です。' },
          { label: '受験答案らしさ', score: 2, maxScore: 3, comment: '答案として整えます。' },
        ],
      }),
    });

    const env = {
      GEMINI_API_KEY: 'test-key',
    } as any;
    const user = createUser() as any;

    const result = await handleAiAction(env, user, {
      action: 'evaluateJapaneseTranslationAnswer',
      payload: {
        sourceSentence: 'The term is reviewed by students today.',
        expectedTranslation: 'その語は今日、生徒によって復習される。',
        userTranslation: '生徒は今日その語を復習します。',
        grammarScopeLabel: '受け身',
        examTarget: 'UNIVERSITY_ENTRANCE',
      },
    });

    expect(result).toMatchObject({
      isCorrect: false,
      score: 6,
      maxScore: 10,
      examTarget: 'UNIVERSITY_ENTRANCE',
      sourceSentence: 'The term is reviewed by students today.',
      expectedTranslation: 'その語は今日、生徒によって復習される。',
      userTranslation: '生徒は今日その語を復習します。',
    });
    expect(assertBudgetAvailableMock).toHaveBeenCalledWith(env, user, 'evaluateJapaneseTranslationAnswer', 260);
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(env, user, expect.objectContaining({
      action: 'evaluateJapaneseTranslationAnswer',
      usedAi: true,
      model: 'gemini-3-flash-preview',
      estimatedCostMilliYen: 260,
      requestUnits: 1,
    }));
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
