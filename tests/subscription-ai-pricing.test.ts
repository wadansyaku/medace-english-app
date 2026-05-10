import { describe, expect, it } from 'vitest';

import { AI_PRICING_VERSION, getAiActionEstimate } from '../config/subscription';

describe('AI pricing configuration', () => {
  it('exposes a stable pricing version and action estimate', () => {
    expect(AI_PRICING_VERSION).toBe('2026-05-10');
    expect(getAiActionEstimate('generateWordImage')).toMatchObject({
      estimatedCostMilliYen: 2400,
      model: 'imagen-4.0-generate-001',
    });
    expect(getAiActionEstimate('generateGrammarPracticeQuestions')).toMatchObject({
      estimatedCostMilliYen: 340,
      model: 'gemini-3-flash-preview',
    });
    expect(getAiActionEstimate('evaluateJapaneseTranslationAnswer')).toMatchObject({
      estimatedCostMilliYen: 260,
      model: 'gemini-3-flash-preview',
    });
  });
});
