import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateInstructorFollowUp, generateLearningPlan } from '../services/gemini';
import { BookCatalogSource, EnglishLevel, StudentRiskLevel, UserGrade, type BookMetadata } from '../types';
import { buildFallbackLearningPlan } from '../utils/learningPlan';

const availableBooks: BookMetadata[] = [
  { id: 'my-book', title: '基礎単語', wordCount: 180, isPriority: true, catalogSource: BookCatalogSource.USER_GENERATED },
];

describe('AI-free compatibility services', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('builds a standard plan without an API request or a fallback claim', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('must not call provider'));
    vi.stubGlobal('fetch', fetchMock);
    const onFallback = vi.fn();
    expect(await generateLearningPlan(UserGrade.JHS3, EnglishLevel.B1, availableBooks, null, onFallback))
      .toEqual(buildFallbackLearningPlan({ uid: '', grade: UserGrade.JHS3, level: EnglishLevel.B1, availableBooks }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('returns no plan for an empty catalog without claiming a saved plan', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateLearningPlan(UserGrade.JHS1, EnglishLevel.A1, [])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never sends instructor or student names, totals, or instructions to a provider', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('must not call provider'));
    vi.stubGlobal('fetch', fetchMock);
    const draft = await generateInstructorFollowUp({
      instructorName: '合成講師', studentName: '合成生徒', riskLevel: StudentRiskLevel.DANGER,
      daysSinceActive: 90, totalLearned: 20, customInstruction: '一緒に復習を再開しましょう。',
    });
    expect(draft?.message).toContain('合成講師より: 合成生徒さん');
    expect(draft?.message).toContain('\n一緒に復習を再開しましょう。');
    expect(draft?.message).not.toContain('90日');
    expect(draft?.message).not.toContain('20語');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
