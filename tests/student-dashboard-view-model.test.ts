import { describe, expect, it } from 'vitest';

import { useStudentDashboardViewModel } from '../hooks/useStudentDashboardViewModel';
import { getTodayDateKey } from '../utils/date';
import {
  BookCatalogSource,
  EnglishLevel,
  InterventionKind,
  InterventionOutcome,
  LearningTrack,
  MissionNextActionType,
  RecommendedActionType,
  SubscriptionPlan,
  type BookMetadata,
  type DashboardSnapshot,
  type InstructorNotification,
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

const withQualityGate = (book: BookMetadata, approved: boolean): BookMetadata => ({
  ...book,
  qualityGate: {
    status: approved ? 'approved' : 'source_review_required',
    label: approved ? '承認済み' : '出典確認',
    summary: approved ? 'source ledgerとcontent QAの両方を通過しています。' : 'source ledger確認待ちです。',
    isApprovedForLearner: approved,
    isSelectableForToday: approved,
    blockingReasons: approved ? [] : ['権利確認が pending です。'],
    warnings: [],
  },
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

type CanonicalDashboardTask = {
  id: string;
  routeId?: string;
  title: string;
  body: string;
  ctaLabel: string;
  group?: string;
  isPrimary?: boolean;
  mobileLabel?: string;
};

type CanonicalDashboardTasks = {
  primaryTask: CanonicalDashboardTask | null;
  urgentTasks: CanonicalDashboardTask[];
  supportingTasks: CanonicalDashboardTask[];
  referenceTasks: CanonicalDashboardTask[];
  allTasks: CanonicalDashboardTask[];
};

const asCanonicalTasks = (
  viewModel: ReturnType<typeof useStudentDashboardViewModel>,
): ReturnType<typeof useStudentDashboardViewModel> & CanonicalDashboardTasks => (
  viewModel as ReturnType<typeof useStudentDashboardViewModel> & CanonicalDashboardTasks
);

const taskIds = (tasks: CanonicalDashboardTask[] | undefined): string[] => (
  (tasks ?? []).map((task) => task.id)
);

const getLaneTaskIds = (canonicalTasks: CanonicalDashboardTasks): string[] => [
  ...(canonicalTasks.primaryTask ? [canonicalTasks.primaryTask.id] : []),
  ...taskIds(canonicalTasks.urgentTasks),
  ...taskIds(canonicalTasks.supportingTasks),
  ...taskIds(canonicalTasks.referenceTasks),
];

const expectCanonicalLanesAreExclusive = (canonicalTasks: CanonicalDashboardTasks) => {
  const laneTaskIds = getLaneTaskIds(canonicalTasks);
  const allTaskIds = taskIds(canonicalTasks.allTasks);

  expect(new Set(laneTaskIds).size).toBe(laneTaskIds.length);
  expect(new Set(allTaskIds).size).toBe(allTaskIds.length);
  expect(new Set(allTaskIds)).toEqual(new Set(laneTaskIds));
};

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

const makeCoachNotification = (overrides: Partial<InstructorNotification> = {}): InstructorNotification => ({
  id: 1,
  studentUid: 'student-1',
  studentName: 'Learner',
  instructorUid: 'coach-1',
  instructorName: 'Coach',
  message: '復習を10語だけ再開しましょう。',
  triggerReason: 'missed-review',
  deliveryChannel: 'IN_APP',
  usedAi: true,
  interventionKind: InterventionKind.REVIEW_RESTART,
  recommendedActionType: RecommendedActionType.START_REVIEW,
  createdAt: new Date('2026-05-13T09:00:00+09:00').getTime(),
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

  it('falls back to source-approved material when a saved plan only references review-pending official books', () => {
    const books = [
      withQualityGate(makeBook('pending-book', 'Pending'), false),
      withQualityGate({
        ...makeBook('approved-book', 'Approved'),
        catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
      }, true),
    ];
    const snapshot = buildSnapshot({
      officialBooks: books,
      learningPlan: {
        uid: 'student-1',
        createdAt: Date.now(),
        targetDate: '2026-04-30',
        goalDescription: 'goal',
        dailyWordGoal: 12,
        selectedBookIds: ['pending-book'],
        status: 'ACTIVE',
      },
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });

    expect(viewModel.plannedBooks.map((book) => book.id)).toEqual(['approved-book']);
    expect(viewModel.primaryRecommendedBook?.id).toBe('approved-book');
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
    expect(asCanonicalTasks(viewModel).primaryTask).toMatchObject({ id: 'writing' });
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

  it('places coach notifications in the canonical primary or urgent task lane', () => {
    const snapshot = buildSnapshot({
      dueCount: 12,
      officialBooks: [makeBook('book-1', 'Core 1')],
      coachNotifications: [makeCoachNotification()],
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });
    const canonicalTasks = asCanonicalTasks(viewModel);
    const primaryOrUrgentTaskIds = [
      canonicalTasks.primaryTask?.id,
      ...taskIds(canonicalTasks.urgentTasks),
    ].filter(Boolean);

    expect(viewModel.latestCoachNotification?.recommendedActionType).toBe(RecommendedActionType.START_REVIEW);
    expect(primaryOrUrgentTaskIds).toContain('coach');
    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'coach',
      title: '講師メッセージ',
      ctaLabel: '復習を10語始める',
    });
    expect(viewModel.heroTitle).toBe(canonicalTasks.primaryTask?.title);
    expect(viewModel.heroCopy).toBe(canonicalTasks.primaryTask?.body);
    expect(viewModel.questButtonLabel).toBe(canonicalTasks.primaryTask?.ctaLabel);
    expect([
      ...taskIds(canonicalTasks.supportingTasks),
      ...taskIds(canonicalTasks.referenceTasks),
    ]).not.toContain('coach');
  });

  it('keeps plan library and progress in the canonical reference task lane', () => {
    const snapshot = buildSnapshot({
      dueCount: 12,
      officialBooks: [makeBook('book-1', 'Core 1')],
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });
    const referenceTaskIds = taskIds(asCanonicalTasks(viewModel).referenceTasks);

    expect(referenceTaskIds).toEqual(expect.arrayContaining(['plan', 'library', 'progress']));
  });

  it('keeps canonical task lanes mutually exclusive and ordered for an active mission', () => {
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
    const canonicalTasks = asCanonicalTasks(viewModel);
    const primaryTaskIds = canonicalTasks.primaryTask ? [canonicalTasks.primaryTask.id] : [];
    const urgentTaskIds = taskIds(canonicalTasks.urgentTasks);
    const supportingTaskIds = taskIds(canonicalTasks.supportingTasks);
    const referenceTaskIds = taskIds(canonicalTasks.referenceTasks);

    expect(primaryTaskIds).toEqual(['mission']);
    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'mission',
      routeId: 'mission',
      ctaLabel: 'ミッションの語彙を進める',
    });
    expect(urgentTaskIds).toEqual([]);
    expect(supportingTaskIds).toEqual(['today', 'weakness', 'englishPractice']);
    expect(referenceTaskIds.slice(0, 3)).toEqual(['plan', 'library', 'progress']);
    expect(referenceTaskIds).toEqual(expect.arrayContaining(['plan', 'library', 'progress']));
    expect(referenceTaskIds).not.toEqual(expect.arrayContaining(['mission', 'writing', 'coach']));
    expect(taskIds(canonicalTasks.allTasks).slice(0, 4)).toEqual(['today', 'mission', 'weakness', 'englishPractice']);
    expect(viewModel.coachRecommendedActionType).toBeNull();
    expectCanonicalLanesAreExclusive(canonicalTasks);
  });

  it('keeps an active mission primary while coach notifications stay urgent', () => {
    const snapshot = buildSnapshot({
      dueCount: 12,
      officialBooks: [makeBook('book-1', 'Core 1')],
      primaryMission: makeMission(),
      coachNotifications: [makeCoachNotification({
        interventionKind: InterventionKind.PLAN_NUDGE,
        recommendedActionType: RecommendedActionType.OPEN_PLAN,
        message: '次の週のプランを一緒に整えましょう。',
      })],
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });
    const canonicalTasks = asCanonicalTasks(viewModel);

    expect(viewModel.primaryLearningRouteId).toBe('mission');
    expect(viewModel.latestCoachNotification?.recommendedActionType).toBe(RecommendedActionType.OPEN_PLAN);
    expect(viewModel.coachRecommendedActionType).toBe(RecommendedActionType.OPEN_PLAN);
    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'mission',
      routeId: 'mission',
      ctaLabel: 'ミッションの語彙を進める',
    });
    expect(taskIds(canonicalTasks.urgentTasks)).toEqual(['coach']);
    expect(canonicalTasks.urgentTasks[0]).toMatchObject({
      id: 'coach',
      title: '講師メッセージ',
      ctaLabel: '今日のプランに戻る',
    });
    expect(taskIds(canonicalTasks.supportingTasks)).toEqual(['today', 'englishPractice']);
    expect(taskIds(canonicalTasks.referenceTasks)).toContain('weakness');
    expect(taskIds(canonicalTasks.referenceTasks)).not.toEqual(expect.arrayContaining(['mission', 'coach']));
    expect(taskIds(canonicalTasks.allTasks).slice(0, 6)).toEqual(['today', 'mission', 'weakness', 'englishPractice', 'coach', 'plan']);
    expectCanonicalLanesAreExclusive(canonicalTasks);
  });

  it('does not let a suggested mission outrank an actionable coach notification', () => {
    const snapshot = buildSnapshot({
      dueCount: 12,
      officialBooks: [makeBook('book-1', 'Core 1')],
      primaryMission: makeMission({
        assignmentId: undefined,
        missionId: undefined,
        isSuggested: true,
      }),
      coachNotifications: [makeCoachNotification()],
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });
    const canonicalTasks = asCanonicalTasks(viewModel);

    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'coach',
      ctaLabel: '復習を10語始める',
    });
    expect(taskIds(canonicalTasks.urgentTasks)).not.toContain('mission');
    expect(taskIds(canonicalTasks.referenceTasks)).toContain('mission');
    expectCanonicalLanesAreExclusive(canonicalTasks);
  });

  it('does not promote resolved coach notifications over the next learning task', () => {
    const snapshot = buildSnapshot({
      dueCount: 10,
      officialBooks: [makeBook('book-1', 'Core 1')],
      coachNotifications: [makeCoachNotification({
        interventionOutcome: InterventionOutcome.REACTIVATED,
        recommendedActionType: RecommendedActionType.START_REVIEW,
      })],
    });

    const viewModel = useStudentDashboardViewModel({
      user: baseUser,
      snapshot,
    });
    const canonicalTasks = asCanonicalTasks(viewModel);

    expect(viewModel.latestCoachNotification?.interventionOutcome).toBe(InterventionOutcome.REACTIVATED);
    expect(viewModel.coachRecommendedActionType).toBeNull();
    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'today',
      routeId: 'today',
    });
    expect(taskIds(canonicalTasks.urgentTasks)).not.toContain('coach');
    expect(taskIds(canonicalTasks.supportingTasks)).toEqual(['englishPractice']);
    expect(taskIds(canonicalTasks.referenceTasks)).toContain('weakness');
    expect(taskIds(canonicalTasks.referenceTasks)).not.toContain('coach');
    expectCanonicalLanesAreExclusive(canonicalTasks);
  });

  it('keeps actionable writing primary while the source mission stays urgent', () => {
    const paidOverview = {
      ...buildSnapshot({}).accountOverview!,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
    };
    const snapshot = buildSnapshot({
      dueCount: 9,
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
    const canonicalTasks = asCanonicalTasks(viewModel);

    expect(viewModel.primaryLearningRouteId).toBe('writing');
    expect(viewModel.coachRecommendedActionType).toBeNull();
    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'writing',
      routeId: 'writing',
      title: '英作文: スマホ学習の意見文',
      ctaLabel: '作文を提出する',
    });
    expect(taskIds(canonicalTasks.urgentTasks)).toEqual(['mission']);
    expect(canonicalTasks.urgentTasks[0]).toMatchObject({
      id: 'mission',
      routeId: 'mission',
      ctaLabel: '作文を提出する',
    });
    expect(taskIds(canonicalTasks.supportingTasks)).toEqual(['today', 'englishPractice']);
    expect(taskIds(canonicalTasks.referenceTasks).slice(0, 4)).toEqual(['weakness', 'plan', 'library', 'progress']);
    expect(taskIds(canonicalTasks.referenceTasks)).not.toEqual(expect.arrayContaining(['writing', 'coach']));
    expect(taskIds(canonicalTasks.allTasks).slice(0, 5)).toEqual(['today', 'mission', 'weakness', 'englishPractice', 'writing']);
    expectCanonicalLanesAreExclusive(canonicalTasks);
  });

  it('keeps a coach nudge primary after mission and writing no longer need action', () => {
    const paidOverview = {
      ...buildSnapshot({}).accountOverview!,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
    };
    const snapshot = buildSnapshot({
      dueCount: 6,
      officialBooks: [makeBook('book-1', 'Core 1')],
      accountOverview: paidOverview,
      primaryMission: makeMission({
        completionRate: 100,
        status: WeeklyMissionStatus.COMPLETED,
        writingRequired: true,
        writingCompleted: true,
        writingAssignmentId: 'writing-1',
        writingPromptTitle: 'スマホ学習の意見文',
        nextActionType: MissionNextActionType.OPEN_PLAN,
        nextActionLabel: '次のプランを見る',
        blockers: [],
      }),
      coachNotifications: [makeCoachNotification({
        interventionKind: InterventionKind.PLAN_NUDGE,
        recommendedActionType: RecommendedActionType.OPEN_PLAN,
        message: '次の週のプランを一緒に整えましょう。',
      })],
    });

    const viewModel = useStudentDashboardViewModel({
      user: {
        ...baseUser,
        subscriptionPlan: SubscriptionPlan.TOB_PAID,
        organizationName: 'MedAce School',
      },
      snapshot,
    });
    const canonicalTasks = asCanonicalTasks(viewModel);

    expect(viewModel.primaryLearningRouteId).toBe('today');
    expect(viewModel.coachRecommendedActionType).toBe(RecommendedActionType.OPEN_PLAN);
    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'coach',
      ctaLabel: '今日のプランに戻る',
    });
    expect(canonicalTasks.primaryTask?.routeId).toBeUndefined();
    expect(taskIds(canonicalTasks.urgentTasks)).toEqual([]);
    expect(taskIds(canonicalTasks.supportingTasks)).toEqual(['today', 'englishPractice']);
    expect(taskIds(canonicalTasks.referenceTasks).slice(0, 5)).toEqual(['mission', 'weakness', 'writing', 'plan', 'library']);
    expect(canonicalTasks.referenceTasks.find((task) => task.id === 'writing')).toMatchObject({
      routeId: 'writing',
      ctaLabel: '英作文を確認',
    });
    expect(taskIds(canonicalTasks.allTasks).slice(0, 6)).toEqual(['today', 'mission', 'weakness', 'englishPractice', 'writing', 'coach']);
    expectCanonicalLanesAreExclusive(canonicalTasks);
  });

  it('keeps business writing available as a reference task before assignments exist', () => {
    const paidOverview = {
      ...buildSnapshot({}).accountOverview!,
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
    };
    const snapshot = buildSnapshot({
      accountOverview: paidOverview,
    });

    const viewModel = useStudentDashboardViewModel({
      user: {
        ...baseUser,
        subscriptionPlan: SubscriptionPlan.TOB_PAID,
        organizationName: 'MedAce School',
      },
      snapshot,
    });
    const canonicalTasks = asCanonicalTasks(viewModel);
    const referenceTaskIds = taskIds(canonicalTasks.referenceTasks);
    const allTaskIds = taskIds(canonicalTasks.allTasks);

    expect(viewModel.canShowWritingSection).toBe(true);
    expect(referenceTaskIds).toContain('writing');
    expect(taskIds(canonicalTasks.urgentTasks)).not.toContain('writing');
    expect(taskIds(canonicalTasks.supportingTasks)).not.toContain('writing');
    expect(allTaskIds).toEqual(expect.arrayContaining(getLaneTaskIds(canonicalTasks)));
    expectCanonicalLanesAreExclusive(canonicalTasks);
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
    const canonicalTasks = asCanonicalTasks(viewModel);
    expect(canonicalTasks.primaryTask).toMatchObject({ id: 'englishPractice' });
    expect(taskIds(canonicalTasks.urgentTasks)).not.toContain('weakness');
    expect([
      ...taskIds(canonicalTasks.supportingTasks),
      ...taskIds(canonicalTasks.referenceTasks),
    ]).toContain('weakness');
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
    expect(viewModel.heroCopy).toBe('文法の型を受験答案へ戻す練習が少なめです。');
    expect(viewModel.questButtonLabel).toBe('全文和訳を2問書く');
    const canonicalTasks = asCanonicalTasks(viewModel);
    expect(canonicalTasks.primaryTask).toMatchObject({
      id: 'englishPractice',
      routeId: 'englishPractice',
      title: '和訳を1セット',
      body: '文法の型を受験答案へ戻す練習が少なめです。',
      ctaLabel: '全文和訳を2問書く',
      group: 'primary',
      isPrimary: true,
      mobileLabel: '演習',
    });
  });
});
