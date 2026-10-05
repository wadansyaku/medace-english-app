import { describe, expect, it } from 'vitest';

import { BookAccessScope, BookCatalogSource, EnglishLevel, LearningPreferenceIntensity, type BookMetadata, type LearningPreference, UserGrade } from '../types';
import { buildFallbackLearningPlan, normalizeGeneratedLearningPlan } from '../utils/learningPlan';
import { NARU_BOOK_ID } from '../shared/naruBook';

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
  const naru: BookMetadata = { id: NARU_BOOK_ID, title: 'Naruシスト', wordCount: 1530,
    isPriority: false, catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
    qualityGate: { status: 'approved', label: '承認済み', summary: '', isApprovedForLearner: true,
      isSelectableForToday: true, blockingReasons: [], warnings: [] } };
  const defaultInput = { uid: 'new-student', grade: UserGrade.JHS1, level: EnglishLevel.A1,
    availableBooks: [...availableBooks, naru] };

  it('defaults to the single approved Naru book without an explicit selection', () => {
    expect(buildFallbackLearningPlan(defaultInput).selectedBookIds).toEqual([NARU_BOOK_ID]);
    expect(normalizeGeneratedLearningPlan({ ...defaultInput, plan: null }).selectedBookIds).toEqual([NARU_BOOK_ID]);
  });

  it('preserves an explicit selection and the existing fallback for an unavailable selection', () => {
    expect(normalizeGeneratedLearningPlan({ ...defaultInput, plan: { selectedBookIds: ['b1-reading', 'jhs1-core'] } })
      .selectedBookIds).toEqual(['b1-reading', 'jhs1-core']);
    expect(normalizeGeneratedLearningPlan({ ...defaultInput, plan: { selectedBookIds: ['missing-book'] } })
      .selectedBookIds).toEqual(buildFallbackLearningPlan({ ...defaultInput, useNaruDefault: false }).selectedBookIds);
  });

  it('preserves selected book IDs and their order when rebuilding a standard plan', () => {
    const plan = buildFallbackLearningPlan({ ...defaultInput, preferredBookIds: ['b1-reading', 'jhs1-core', 'b1-reading', 'missing'] });
    expect(plan.selectedBookIds).toEqual(['b1-reading', 'jhs1-core']);
    expect(plan.selectedBookIds).not.toContain(NARU_BOOK_ID);
  });

  it('does not introduce Naru when it is unavailable or unapproved', () => {
    expect(buildFallbackLearningPlan({ ...defaultInput, availableBooks }).selectedBookIds).not.toContain(NARU_BOOK_ID);
    const blocked = { ...naru, qualityGate: { ...naru.qualityGate!, isSelectableForToday: false } };
    expect(buildFallbackLearningPlan({ ...defaultInput, availableBooks: [...availableBooks, blocked] }).selectedBookIds)
      .not.toEqual([NARU_BOOK_ID]);
  });

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

  it('normalizes generated plans to available book ids only', () => {
    const businessBooks: BookMetadata[] = [
      {
        id: 'system-v5',
        title: 'システム英単語 5訂版',
        wordCount: 2027,
        isPriority: false,
        catalogSource: BookCatalogSource.LICENSED_PARTNER,
        accessScope: BookAccessScope.BUSINESS_ONLY,
      },
      {
        id: 'target-1900',
        title: '英単語ターゲット1900 6訂版',
        wordCount: 1900,
        isPriority: false,
        catalogSource: BookCatalogSource.LICENSED_PARTNER,
        accessScope: BookAccessScope.BUSINESS_ONLY,
      },
    ];

    const plan = normalizeGeneratedLearningPlan({
      uid: 'student-business',
      grade: UserGrade.SHS2,
      level: EnglishLevel.B1,
      availableBooks: businessBooks,
      learningPreference: buildPreference({ weakSkillFocus: 'システム英単語を進める' }),
      now: new Date('2026-06-06T00:00:00+09:00'),
      plan: {
        createdAt: 1,
        targetDate: '2026-07-01',
        goalDescription: 'AI generated',
        dailyWordGoal: 999,
        selectedBookIds: ['missing-book', 'system-v5', 'system-v5', 'target-1900'],
        status: 'ACTIVE',
      },
    });

    expect(plan.uid).toBe('student-business');
    expect(plan.dailyWordGoal).toBe(36);
    expect(plan.selectedBookIds).toEqual(['system-v5', 'target-1900']);
  });

  it('falls back when generated plans do not contain any usable book ids', () => {
    const plan = normalizeGeneratedLearningPlan({
      uid: 'student-business',
      grade: UserGrade.SHS2,
      level: EnglishLevel.B1,
      availableBooks: [
        {
          id: 'system-v5',
          title: 'システム英単語 5訂版',
          wordCount: 2027,
          isPriority: false,
          description: '大学受験 語彙',
          catalogSource: BookCatalogSource.LICENSED_PARTNER,
          accessScope: BookAccessScope.BUSINESS_ONLY,
        },
      ],
      learningPreference: buildPreference({ weakSkillFocus: '大学受験の語彙を増やす' }),
      now: new Date('2026-06-06T00:00:00+09:00'),
      plan: {
        goalDescription: '',
        dailyWordGoal: Number.NaN,
        selectedBookIds: ['not-visible'],
      },
    });

    expect(plan.selectedBookIds).toEqual(['system-v5']);
    expect(plan.goalDescription).toContain('1冊を軸に');
    expect(plan.status).toBe('ACTIVE');
  });
});
