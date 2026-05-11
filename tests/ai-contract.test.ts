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

import { validateAiActionRequest } from '../contracts/ai';
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

const createWord = (index: number) => ({
  id: `word-${index}`,
  bookId: 'book-1',
  number: index,
  word: `word${index}`,
  definition: `意味${index}`,
});

const expectPreflightRejection = async (
  body: unknown,
  message: string,
) => {
  await expect(handleAiAction(
    { GEMINI_API_KEY: 'test-key' } as never,
    createUser() as never,
    body,
  )).rejects.toMatchObject({
    name: 'HttpError',
    status: 400,
    message,
  });
  expect(assertAiActionAllowedMock).not.toHaveBeenCalled();
  expect(assertBudgetAvailableMock).not.toHaveBeenCalled();
  expect(recordAiUsageEventMock).not.toHaveBeenCalled();
  expect(generateContentMock).not.toHaveBeenCalled();
};

describe('AI action contract validation', () => {
  beforeEach(() => {
    assertAiActionAllowedMock.mockReset();
    assertBudgetAvailableMock.mockReset();
    recordAiUsageEventMock.mockReset();
    generateContentMock.mockReset();
  });

  it('accepts exact upper-bound payloads at the contract layer', () => {
    expect(validateAiActionRequest({
      action: 'generateGrammarPracticeQuestions',
      payload: {
        targetWords: Array.from({ length: 50 }, (_, index) => createWord(index + 1)),
        mode: 'GRAMMAR_CLOZE',
        questionCount: 10,
      },
    })).toMatchObject({
      action: 'generateGrammarPracticeQuestions',
      payload: {
        questionCount: 10,
        targetWords: expect.arrayContaining([
          expect.objectContaining({ id: 'word-1' }),
        ]),
      },
    });

    expect(validateAiActionRequest({
      action: 'extractVocabularyFromText',
      payload: {
        rawText: 'a'.repeat(20_000),
      },
    })).toMatchObject({
      action: 'extractVocabularyFromText',
      payload: {
        rawText: expect.stringMatching(/^a+$/),
      },
    });
  });

  it('rejects oversized targetWords before metering or provider calls', async () => {
    await expectPreflightRejection({
      action: 'generateAIQuiz',
      payload: {
        targetWords: Array.from({ length: 51 }, (_, index) => createWord(index + 1)),
      },
    }, 'targetWords は50件以内で指定してください。');
  });

  it('rejects oversized grammar question counts before metering or provider calls', async () => {
    await expectPreflightRejection({
      action: 'generateGrammarPracticeQuestions',
      payload: {
        targetWords: [createWord(1)],
        mode: 'GRAMMAR_CLOZE',
        questionCount: 11,
      },
    }, 'questionCount は1以上10以下で指定してください。');
  });

  it('rejects oversized raw text before metering or provider calls', async () => {
    await expectPreflightRejection({
      action: 'extractVocabularyFromText',
      payload: {
        rawText: 'a'.repeat(20_001),
      },
    }, 'rawText は20000文字以内で指定してください。');
  });

  it('rejects oversized advanced-test answer maps before metering or provider calls', async () => {
    await expectPreflightRejection({
      action: 'evaluateAdvancedTest',
      payload: {
        grade: 'JHS3',
        questions: [
          {
            id: 'q1',
            type: 'MCQ',
            question: 'Choose the answer.',
            options: ['a', 'b'],
            answer: 'a',
            level: 'A1',
          },
        ],
        userAnswers: Object.fromEntries(
          Array.from({ length: 51 }, (_, index) => [`q${index + 1}`, 'answer']),
        ),
      },
    }, 'userAnswers は50件以内で指定してください。');
  });
});
