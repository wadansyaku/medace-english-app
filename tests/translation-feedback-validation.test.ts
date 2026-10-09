import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiPostMock } = vi.hoisted(() => ({ apiPostMock: vi.fn() }));
vi.mock('../services/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiClient')>();
  return { ...actual, apiPost: apiPostMock };
});

import { normalizeTranslationFeedback } from '../functions/_shared/ai-actions';
import { ApiError } from '../services/apiClient';
import { evaluateJapaneseTranslationAnswer } from '../services/gemini';
import { isValidJapaneseTranslationFeedback } from '../shared/translationFeedback';
import type { JapaneseTranslationFeedback } from '../types';

const payload = {
  sourceSentence: 'Students do not read this book.',
  expectedTranslation: '生徒はこの本を読まない。',
  userTranslation: '生徒はこの本を読みません。',
  examTarget: 'GENERAL' as const,
};

const feedback = (): JapaneseTranslationFeedback => ({
  ...payload,
  isCorrect: true,
  score: 10,
  maxScore: 10,
  verdictLabel: '意味が伝わる答案',
  summaryJa: '主語・目的語・否定の意味が保たれています。',
  strengths: ['否定を保っています。'],
  issues: [],
  improvedTranslation: payload.expectedTranslation,
  grammarAdviceJa: 'do not は動詞を否定します。',
  nextDrillJa: '肯定文と否定文を比べましょう。',
  criteria: [
    { label: '意味', score: 4, maxScore: 4, comment: '否定が保持されています。' },
    { label: '文法構造', score: 3, maxScore: 3, comment: '主語と目的語が対応しています。' },
    { label: '自然さ', score: 3, maxScore: 3, comment: '自然な敬体です。' },
  ],
  usedAi: true,
});

const invalidCases: [string, (value: JapaneseTranslationFeedback) => unknown][] = [
  ['correct with zero points', (value) => ({ ...value, score: 0, criteria: value.criteria.map((criterion) => ({ ...criterion, score: 0 })) })],
  ['incorrect above the threshold', (value) => ({ ...value, isCorrect: false })],
  ['criteria worth twenty points', (value) => ({ ...value, criteria: value.criteria.map((criterion) => ({ ...criterion, maxScore: criterion.maxScore * 2 })) })],
  ['a total that differs from its criteria', (value) => ({ ...value, score: 9 })],
  ['an unsupported total maximum', (value) => ({ ...value, maxScore: 20 })],
  ['fractional total', (value) => ({ ...value, score: 9.5 })],
  ['fractional criterion', (value) => ({ ...value, criteria: [{ ...value.criteria[0], score: 3.5 }, ...value.criteria.slice(1)] })],
  ['negative criterion', (value) => ({ ...value, criteria: [{ ...value.criteria[0], score: -1 }, ...value.criteria.slice(1)] })],
  ['criterion above its maximum', (value) => ({ ...value, criteria: [{ ...value.criteria[0], score: 5 }, ...value.criteria.slice(1)] })],
  ['numeric string', (value) => ({ ...value, score: '10' })],
  ['missing criteria', (value) => ({ ...value, criteria: undefined })],
  ['empty criteria', (value) => ({ ...value, criteria: [] })],
  ['missing isCorrect', (value) => ({ ...value, isCorrect: undefined })],
  ['infinite score', (value) => ({ ...value, score: Number.POSITIVE_INFINITY })],
  ['missing summary', (value) => ({ ...value, summaryJa: null })],
  ['non-string criterion label', (value) => ({ ...value, criteria: [{ ...value.criteria[0], label: 2 }, ...value.criteria.slice(1)] })],
];

describe('Japanese translation assessment consistency', () => {
  it('accepts coherent assessed results including the eight-point boundary and zero', () => {
    expect(isValidJapaneseTranslationFeedback(feedback())).toBe(true);
    for (const score of [0, 7, 8]) {
      const value = feedback();
      value.score = score;
      value.isCorrect = score >= 8;
      value.criteria = [
        { ...value.criteria[0], score: Math.min(score, 4) },
        { ...value.criteria[1], score: Math.min(Math.max(score - 4, 0), 3) },
        { ...value.criteria[2], score: Math.max(score - 7, 0) },
      ];
      expect(isValidJapaneseTranslationFeedback(value)).toBe(true);
    }
  });

  it.each(invalidCases)('rejects %s in the shared contract and at server normalization', (_name, invalidate) => {
    const value = invalidate(feedback());
    expect(isValidJapaneseTranslationFeedback(value)).toBe(false);
    expect(() => normalizeTranslationFeedback(value, payload)).toThrowError(expect.objectContaining({ status: 502 }));
  });

  it.each([null, false, '10', [], {}])('rejects a non-assessment response: %j', (value) => {
    expect(isValidJapaneseTranslationFeedback(value)).toBe(false);
    expect(() => normalizeTranslationFeedback(value, payload)).toThrowError(expect.objectContaining({ status: 502 }));
  });

  it('keeps a valid score unchanged and binds its feedback to the submitted context', () => {
    const value = feedback();
    const result = normalizeTranslationFeedback({ ...value, sourceSentence: 'An unrelated sentence.' }, payload);

    expect(result).toEqual(value);
    expect(result.score).toBe(value.criteria.reduce((sum, criterion) => sum + criterion.score, 0));
  });
});

describe('Japanese translation service boundary', () => {
  beforeEach(() => {
    apiPostMock.mockReset();
  });

  it('returns a coherent assessment without modifying it', async () => {
    const value = feedback();
    apiPostMock.mockResolvedValueOnce(value);

    await expect(evaluateJapaneseTranslationAnswer(payload)).resolves.toBe(value);
    expect(apiPostMock).toHaveBeenCalledWith('/api/ai', { action: 'evaluateJapaneseTranslationAnswer', payload }, { signal: expect.any(AbortSignal) });
  });

  it.each(invalidCases)('returns no assessment for %s', async (_name, invalidate) => {
    apiPostMock.mockResolvedValueOnce(invalidate(feedback()));

    await expect(evaluateJapaneseTranslationAnswer(payload)).resolves.toBeNull();
  });

  it.each([403, 429, 500, 502, 503])('returns no score when the API fails with %i', async (status) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      apiPostMock.mockRejectedValueOnce(new ApiError('Synthetic unavailable response', status));
      await expect(evaluateJapaneseTranslationAnswer(payload)).resolves.toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns no score after a transport timeout or a null response', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      apiPostMock.mockRejectedValueOnce(new Error('Synthetic transport timeout'));
      await expect(evaluateJapaneseTranslationAnswer(payload)).resolves.toBeNull();
      apiPostMock.mockResolvedValueOnce(null);
      await expect(evaluateJapaneseTranslationAnswer(payload)).resolves.toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('bounds a stalled request with a 20 second abort signal and returns no score on abort', async () => {
    const controller = new AbortController();
    const deadline = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiPostMock.mockImplementationOnce((_path, _body, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    try {
      const pending = evaluateJapaneseTranslationAnswer(payload);
      expect(deadline).toHaveBeenCalledWith(20_000);
      controller.abort(new DOMException('Synthetic deadline expired', 'TimeoutError'));
      await expect(pending).resolves.toBeNull();
    } finally {
      deadline.mockRestore();
      consoleError.mockRestore();
    }
  });
});
