import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLearningPlan } from '../services/gemini';
import { BookCatalogSource, EnglishLevel, LearningPreferenceIntensity, UserGrade, type BookMetadata, type LearningPreference } from '../types';
import { buildFallbackLearningPlan } from '../utils/learningPlan';

const availableBooks: BookMetadata[] = [
  { id: 'original-book', title: '基礎単語', wordCount: 180, isPriority: true, catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL },
];
const preference: LearningPreference = {
  userUid: 'student', targetExam: '英検準2級', targetScore: '', examDate: '',
  weeklyStudyDays: 5, dailyStudyMinutes: 30, weakSkillFocus: '読解', motivationNote: '',
  intensity: LearningPreferenceIntensity.REVIEW_HEAVY, updatedAt: 1,
};
const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('learning plan service fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the established standard plan after a provider 502 and reports the switch once without retrying AI', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(502, { error: '学習プラン生成に失敗しました。' }));
    vi.stubGlobal('fetch', fetchMock);
    const onFallback = vi.fn();

    const plan = await generateLearningPlan(UserGrade.JHS3, EnglishLevel.B1, availableBooks, preference, onFallback);

    expect(plan).toEqual(buildFallbackLearningPlan({
      uid: '', grade: UserGrade.JHS3, level: EnglishLevel.B1, availableBooks, learningPreference: preference,
    }));
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/ai', expect.objectContaining({
      credentials: 'include', method: 'POST',
      body: JSON.stringify({ action: 'generateLearningPlan', payload: {
        grade: UserGrade.JHS3, level: EnglishLevel.B1, availableBooks, learningPreference: preference,
      } }),
    }));
  });

  it.each([403, 429, 503])('also reports the existing standard fallback for status %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, { error: 'AI利用不可' })));
    const onFallback = vi.fn();
    expect(await generateLearningPlan(UserGrade.JHS1, EnglishLevel.A1, availableBooks, null, onFallback))
      .toEqual(buildFallbackLearningPlan({ uid: '', grade: UserGrade.JHS1, level: EnglishLevel.A1, availableBooks }));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 404, 500])('keeps status %i as a failure without a new fallback', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, { error: 'API request failed' })));
    const onFallback = vi.fn();
    expect(await generateLearningPlan(UserGrade.JHS1, EnglishLevel.A1, availableBooks, null, onFallback)).toBeNull();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('keeps a network failure as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const onFallback = vi.fn();
    expect(await generateLearningPlan(UserGrade.JHS1, EnglishLevel.A1, availableBooks, null, onFallback)).toBeNull();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('preserves a successful API plan and does not report a fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, {
      goalDescription: '読解の目標', dailyWordGoal: 22, targetDate: '2026-11-05', selectedBookIds: ['original-book'],
    })));
    const onFallback = vi.fn();
    const plan = await generateLearningPlan(UserGrade.JHS3, EnglishLevel.B1, availableBooks, preference, onFallback);
    expect(plan).toMatchObject({ goalDescription: '読解の目標', dailyWordGoal: 22, targetDate: '2026-11-05', selectedBookIds: ['original-book'] });
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('leaves existing normalization of an empty successful response unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, null)));
    const onFallback = vi.fn();
    expect(await generateLearningPlan(UserGrade.JHS1, EnglishLevel.A1, availableBooks, null, onFallback))
      .toEqual(buildFallbackLearningPlan({ uid: '', grade: UserGrade.JHS1, level: EnglishLevel.A1, availableBooks }));
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('does not call AI or report a switch when no books are available', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onFallback = vi.fn();
    expect(await generateLearningPlan(UserGrade.JHS1, EnglishLevel.A1, [], null, onFallback)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });
});
