import { describe, expect, it } from 'vitest';

import { BookCatalogSource, EnglishLevel, LearningPreferenceIntensity, type BookMetadata, type LearningPreference, UserGrade } from '../types';
import { buildFallbackLearningPlan } from '../utils/learningPlan';

const availableBooks: BookMetadata[] = [
  {
    id: 'jhs1-core',
    title: '中1 基礎単語',
    wordCount: 180,
    isPriority: true,
    catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  },
  {
    id: 'jhs2-school',
    title: '中2 標準単語',
    wordCount: 220,
    isPriority: false,
    catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
  },
  {
    id: 'eiken-pre2',
    title: '英検準2級 頻出',
    wordCount: 380,
    isPriority: false,
    description: '英検準2級 対策',
    catalogSource: BookCatalogSource.LICENSED_PARTNER,
  },
  {
    id: 'b1-reading',
    title: '高校基礎 長文語彙',
    wordCount: 420,
    isPriority: false,
    description: '読解と語彙を同時に強化',
    catalogSource: BookCatalogSource.LICENSED_PARTNER,
  },
  {
    id: 'b2-logic',
    title: '高校発展 論理語彙',
    wordCount: 520,
    isPriority: false,
    description: '英検準2級 以降の長文対策',
    catalogSource: BookCatalogSource.LICENSED_PARTNER,
  },
];

const buildPreference = (overrides: Partial<LearningPreference> = {}): LearningPreference => ({
  userUid: 'student-1',
  targetExam: '',
  targetScore: '',
  examDate: '',
  weeklyStudyDays: 4,
  dailyStudyMinutes: 20,
  weakSkillFocus: '',
  motivationNote: '',
  intensity: LearningPreferenceIntensity.BALANCED,
  updatedAt: Date.now(),
  ...overrides,
});

describe('buildFallbackLearningPlan', () => {
  it('raises the goal for intensive short-horizon exam prep and caps the target date by the exam date', () => {
    const plan = buildFallbackLearningPlan({
      uid: 'student-1',
      grade: UserGrade.JHS3,
      level: EnglishLevel.B1,
      availableBooks,
      learningPreference: buildPreference({
        targetExam: '英検準2級',
        dailyStudyMinutes: 40,
        weeklyStudyDays: 6,
        intensity: LearningPreferenceIntensity.INTENSIVE,
        examDate: '2026-03-20',
      }),
      now: new Date('2026-03-09T00:00:00+09:00'),
    });

    expect(plan.dailyWordGoal).toBe(32);
    expect(plan.targetDate).toBe('2026-03-20');
    expect(plan.goalDescription).toContain('英検準2級');
    expect(plan.selectedBookIds).toHaveLength(5);
    expect(plan.selectedBookIds).toContain('eiken-pre2');
    expect(plan.selectedBookIds).toContain('b1-reading');
  });

  it('keeps early-grade plans moderate and prioritizes grade-matched books', () => {
    const plan = buildFallbackLearningPlan({
      uid: 'student-2',
      grade: UserGrade.JHS1,
      level: EnglishLevel.A1,
      availableBooks,
      learningPreference: buildPreference({
        userUid: 'student-2',
        dailyStudyMinutes: 15,
      }),
      now: new Date('2026-03-09T00:00:00+09:00'),
    });

    expect(plan.dailyWordGoal).toBe(9);
    expect(plan.selectedBookIds[0]).toBe('jhs1-core');
    expect(plan.selectedBookIds).toContain('jhs2-school');
    expect(plan.selectedBookIds).not.toContain('b2-logic');
  });
});
