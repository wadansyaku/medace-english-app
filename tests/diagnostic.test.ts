import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_QUESTIONS, evaluateDiagnostic } from '../data/diagnostic';
import { EnglishLevel, UserGrade } from '../types';

describe('evaluateDiagnostic', () => {
  it('returns a high-band result when all questions are correct', () => {
    const answers = Object.fromEntries(
      DIAGNOSTIC_QUESTIONS.map((question) => [question.id, question.answer]),
    );

    const result = evaluateDiagnostic(answers, 'FOUNDATION', UserGrade.SHS1);

    expect(result.level).toBe(EnglishLevel.C1);
    expect(result.correctCount).toBe(DIAGNOSTIC_QUESTIONS.length);
    expect(result.missedCount).toBe(0);
    expect(result.confidence).toBe('HIGH');
    expect(result.recommendedDailyGoal).toBe(22);
    expect(result.phaseScores.stretch.correct).toBe(4);
    expect(result.skillSummaries.every((summary) => summary.status === 'strong')).toBe(true);
    expect(result.alignmentNote).toContain('自己評価より高め');
  });

  it('keeps the learner in the A2 band when only warmup questions are correct', () => {
    const warmupAnswers = Object.fromEntries(
      DIAGNOSTIC_QUESTIONS
        .filter((question) => question.phase === 'warmup')
        .map((question) => [question.id, question.answer]),
    );

    const result = evaluateDiagnostic(warmupAnswers, 'ADVANCED', UserGrade.JHS2);

    expect(result.level).toBe(EnglishLevel.A2);
    expect(result.correctCount).toBe(4);
    expect(result.confidence).toBe('MEDIUM');
    expect(result.recommendedDailyGoal).toBe(10);
    expect(result.phaseScores.core.correct).toBe(0);
    expect(result.skillSummaries.find((summary) => summary.skill === 'vocabulary')?.status).toBe('developing');
    expect(result.alignmentNote).toContain('基礎の定着');
  });
});
