import { describe, expect, it } from 'vitest';

import { useStudentDashboardViewModel } from '../hooks/useStudentDashboardViewModel';
import { getTodayDateKey } from '../utils/date';
import {
  BookCatalogSource,
  EnglishLevel,
  LearningTrack,
  MissionNextActionType,
  RecommendedActionType,
  SubscriptionPlan,
  type BookMetadata,
  type DashboardSnapshot,
  type PrimaryMissionSnapshot,
  type UserProfile,
  UserGrade,
  UserRole,
  WeaknessDimension,
  WeaknessSignalLevel,
  WeeklyMissionStatus,
} from '../types';

const makeBook = (id: string, title: string): BookMetadata => ({
  id,
  title,
  wordCount: 120,
  isPriority: false,
  catalogSource: BookCatalogSource.LICENSED_PARTNER,
});

const baseUser: UserProfile = {
  uid: 'student-1',
  displayName: 'Learner',
  email: 'learner@example.com',
  role: UserRole.STUDENT,
  grade: UserGrade.JHS3,
  englishLevel: EnglishLevel.B1,
  subscriptionPlan: SubscriptionPlan.TOC_FREE,
  stats: { xp: 0, level: 1, currentStreak: 0, lastLoginDate: '2026-03-28' },
};

const buildSnapshot = (overrides: Partial<DashboardSnapshot>): DashboardSnapshot => ({
  dueCount: 0,
  officialBooks: [],
  myBooks: [],
  progressMap: {},
  learningPlan: null,
  learningPreference: null,
  primaryMission: null,
  weaknessProfile: null,
  leaderboard: [],
  masteryDist: { new: 0, learning: 0, review: 0, graduated: 0, total: 0 },
  activityLogs: [],
  motivationSnapshot: {
    scopes: [],
    insight: {
      title: 'sample',
      body: 'sample',
    },
  },
  coachNotifications: [],
  accountOverview: {
    subscriptionPlan: SubscriptionPlan.TOC_FREE,
    priceLabel: 'free',
    pricingNote: 'note',
    audienceLabel: 'student',
    featureSummary: [],
    aiUsage: {
      monthKey: '2026-03',
      estimatedCostMilliYen: 0,
      budgetMilliYen: 1000,
      remainingMilliYen: 1000,
      generationCount: 0,
      cacheHitCount: 0,
      cacheHitRatio: 0,
      avoidedCostMilliYen: 0,
      actionCounts: {},
    },
  },
  commercialRequests: [],
  ...overrides,
});

const makeMission = (overrides: Partial<PrimaryMissionSnapshot> = {}): PrimaryMissionSnapshot => ({
  assignmentId: 'assignment-1',
  missionId: 'mission-1',
  track: LearningTrack.EIKEN_2,
  title: '英検2級の語彙を進める',
  rationale: '今週の授業に合わせた課題です。',
  dueAt: new Date('2026-05-14T09:00:00+09:00').getTime(),
  dueDate: '2026-05-14',
  sourceBookId: 'book-1',
  sourceBookTitle: 'Core 1',
  isSuggested: false,
  startedAt: undefined,
  restartedAt: undefined,
  lastActivityAt: undefined,
  completedAt: undefined,
  newWordsCompleted: 4,
  newWordsTarget: 10,
  reviewWordsCompleted: 2,
  reviewWordsTarget: 8,
  quizCompletedCount: 0,
  quizTargetCount: 1,
  writingCompleted: false,
  writingRequired: false,
  completionRate: 35,
  overdue: false,
  status: WeeklyMissionStatus.IN_PROGRESS,
  nextActionType: MissionNextActionType.OPEN_STUDY,
  nextActionLabel: 'ミッションの語彙を進める',
  blockers: ['新出語', '復習', '小テスト'],
  ...overrides,
});

describe('useStudentDashboardViewModel', () => {
  it('surfaces a single primary recommended book and keeps the rest secondary', () => {
    const books = [
      makeBook('book-1', 'Core 1'),
      makeBook('book-2', 'Core 2'),
      makeBook('book-3', 'Core 3'),
    ];
    const snapshot = buildSnapshot({
      officialBooks: books,
      learningPlan: {
        uid: 'student-1',
        createdAt: Date.now(),
        targetDate: '2026-04-30',
        goalDescription: 'goal',
        dailyWordGoal: 12,
        selectedBookIds: ['book-2', 'book-1', 'book-3'],
        status: 'ACTIVE',
      },
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });

    expect(viewModel.primaryRecommendedBook?.id).toBe('book-2');
    expect(viewModel.secondaryRecommendedBooks.map((book) => book.id)).toEqual(['book-1', 'book-3']);
  });

  it('prioritizes actionable writing when the mission requires a submission', () => {
    const paidOverview = {
      ...buildSnapshot({}).accountOverview!,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
    };
    const snapshot = buildSnapshot({
      officialBooks: [makeBook('book-1', 'Core 1')],
      accountOverview: paidOverview,
      primaryMission: makeMission({
        nextActionType: MissionNextActionType.OPEN_WRITING,
        nextActionLabel: '作文を提出する',
        writingRequired: true,
        writingCompleted: false,
        writingAssignmentId: 'writing-1',
        writingPromptTitle: 'スマホ学習の意見文',
      }),
    });

    const viewModel = useStudentDashboardViewModel({
      user: {
        ...baseUser,
        subscriptionPlan: SubscriptionPlan.TOB_PAID,
        organizationName: 'MedAce School',
      },
      snapshot,
    });

    expect(viewModel.hasActionableWriting).toBe(true);
    expect(viewModel.primaryLearningRouteId).toBe('writing');
    expect(viewModel.learningRouteCards.map((card) => card.id)).toEqual(['today', 'mission', 'weakness', 'englishPractice', 'writing']);
    expect(viewModel.learningRouteCards.find((card) => card.id === 'writing')).toMatchObject({
      ctaLabel: '作文を提出する',
      isPrimary: true,
      metricLabel: 'スマホ学習の意見文',
      stateLabel: '未提出',
    });
  });

  it('keeps mission ahead of ordinary daily study when a non-writing mission is active', () => {
    const snapshot = buildSnapshot({
      dueCount: 12,
      officialBooks: [makeBook('book-1', 'Core 1')],
      primaryMission: makeMission(),
      weaknessProfile: {
        hasSufficientData: true,
        updatedAt: Date.now(),
        signals: [],
        topWeaknesses: [{
          dimension: WeaknessDimension.SPELLING_RECALL,
          level: WeaknessSignalLevel.HIGH,
          score: 82,
          sampleSize: 18,
          reason: 'スペルの想起で落としやすい単語があります。',
          nextActionLabel: 'スペルを5問だけ確認',
          recommendedActionType: RecommendedActionType.START_REVIEW,
          targetQuestionModes: ['SPELLING_HINT'],
          updatedAt: Date.now(),
        }],
      },
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });

    expect(viewModel.primaryLearningRouteId).toBe('mission');
    expect(viewModel.learningRouteCards.find((card) => card.id === 'mission')).toMatchObject({
      ctaLabel: 'ミッションの語彙を進める',
      isPrimary: true,
      metricLabel: '35%',
      stateLabel: '進行中',
    });
    expect(viewModel.learningRouteCards.find((card) => card.id === 'weakness')?.ctaLabel).toBe('スペルを5問だけ確認');
  });

  it('promotes English practice into the single next action when grammar weakness is strongest', () => {
    const snapshot = buildSnapshot({
      dueCount: 8,
      officialBooks: [makeBook('book-1', 'Core 1')],
      weaknessProfile: {
        hasSufficientData: true,
        updatedAt: Date.now(),
        signals: [],
        topWeaknesses: [{
          dimension: WeaknessDimension.GRAMMAR_APPLICATION,
          level: WeaknessSignalLevel.HIGH,
          score: 88,
          sampleSize: 24,
          reason: '文法の中で単語を使う問題が弱いです。',
          nextActionLabel: '文法演習を5問だけ確認',
          recommendedActionType: RecommendedActionType.START_REVIEW,
          targetQuestionModes: ['GRAMMAR_CLOZE'],
          updatedAt: Date.now(),
        }],
      },
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });

    expect(viewModel.primaryLearningRouteId).toBe('englishPractice');
    expect(viewModel.practiceRecommendation).toMatchObject({
      lane: 'grammar',
      ctaLabel: '文法を5問',
      metricLabel: '5問',
      stateLabel: '文法',
    });
    expect(viewModel.learningRouteCards.find((card) => card.id === 'englishPractice')).toMatchObject({
      isPrimary: true,
      title: '英語演習',
      ctaLabel: '文法を5問',
    });
  });

  it('uses English practice as the follow-up when daily work is done and no stronger signal exists', () => {
    const snapshot = buildSnapshot({
      dueCount: 0,
      officialBooks: [makeBook('book-1', 'Core 1')],
      activityLogs: [{
        date: getTodayDateKey(),
        count: 18,
        intensity: 3,
      }],
      learningPlan: {
        uid: 'student-1',
        createdAt: Date.now(),
        targetDate: '2026-04-30',
        goalDescription: 'goal',
        dailyWordGoal: 12,
        selectedBookIds: ['book-1'],
        status: 'ACTIVE',
      },
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });

    expect(viewModel.primaryLearningRouteId).toBe('englishPractice');
    expect(viewModel.practiceRecommendation.lane).toBe('grammar');
    expect(viewModel.learningRouteCards.map((card) => card.id)).toEqual(['today', 'weakness', 'englishPractice']);
  });

  it('uses the English practice progress recommendation when it is available', () => {
    const snapshot = buildSnapshot({
      dueCount: 0,
      officialBooks: [makeBook('book-1', 'Core 1')],
      activityLogs: [{
        date: getTodayDateKey(),
        count: 20,
        intensity: 3,
      }],
      learningPlan: {
        uid: 'student-1',
        createdAt: Date.now(),
        targetDate: '2026-04-30',
        goalDescription: 'goal',
        dailyWordGoal: 12,
        selectedBookIds: ['book-1'],
        status: 'ACTIVE',
      },
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
      englishPracticeRecommendation: {
        lane: 'translation',
        labelJa: '和訳を1セット',
        reasonJa: '文法の型を受験答案へ戻す練習が少なめです。',
        actionJa: '全文和訳を2問書く',
        scopeIds: [],
        readingQuestionKinds: [],
      },
    });

    expect(viewModel.primaryLearningRouteId).toBe('englishPractice');
    expect(viewModel.practiceRecommendation).toMatchObject({
      lane: 'translation',
      title: '和訳を1セット',
      ctaLabel: '全文和訳を2問書く',
      body: '文法の型を受験答案へ戻す練習が少なめです。',
    });
    expect(viewModel.heroTitle).toBe('和訳を1セット');
    expect(viewModel.questButtonLabel).toBe('全文和訳を2問書く');
  });
});
