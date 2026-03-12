import {
  ActivityLog,
  AdminDashboardSnapshot,
  BookMetadata,
  BookProgress,
  DashboardSnapshot,
  LeaderboardEntry,
  LearningPlan,
  LearningPreference,
  MasteryDistribution,
  MotivationSnapshot,
  MotivationScopeStats,
  StudentSummary,
  StudentRiskLevel,
  SubscriptionPlan,
  UserProfile,
  UserRole,
} from '../../types';
import { getSubscriptionPolicy } from '../../config/subscription';
import { formatDateKey, formatMonthKey } from '../../utils/date';
import { canAccessOfficialBook } from '../../utils/bookAccess';
import {
  createMotivationInsight,
  createMotivationScope,
  type MotivationAggregateTotals,
  buildMockMotivationTotals,
} from './motivation';
import { IDB_MOCK_USERS, isBookOwnedByUser } from './mockData';
import {
  GetStore,
  readAllStoreRecords,
  STORES,
  type StoredLearningHistoryRecord,
} from './idb-support';
import {
  getMasteryDistributionFromHistoryRecords,
  getUserLearningHistories,
} from './learning-history';

export interface DashboardReadModelContext {
  getStore: GetStore;
  getSession: () => Promise<UserProfile | null>;
  getBooks: () => Promise<BookMetadata[]>;
  getBookProgress: (uid: string, bookId: string) => Promise<BookProgress>;
  getDueCount: (uid: string) => Promise<number>;
  getLearningPlan: (uid: string) => Promise<LearningPlan | null>;
  getLearningPreference: (uid: string) => Promise<LearningPreference | null>;
  getAllStudentsProgress: () => Promise<StudentSummary[]>;
  getCoachNotifications: (uid: string, sessionUser: UserProfile | null) => Promise<DashboardSnapshot['coachNotifications']>;
}

export const getHistoryTotalsFromHistoryRecords = (
  records: StoredLearningHistoryRecord[],
  uid: string,
): MotivationAggregateTotals => {
  const totals: MotivationAggregateTotals = {
    totalAnswers: 0,
    totalCorrect: 0,
    totalResponseTimeMs: 0,
  };

  getUserLearningHistories(records, uid).forEach((history) => {
    totals.totalAnswers += Number(history.attemptCount || 0);
    totals.totalCorrect += Number(history.correctCount || 0);
    totals.totalResponseTimeMs += Number(history.totalResponseTimeMs || 0);
  });

  return totals;
};

export const getActivityLogsFromHistoryRecords = (
  records: StoredLearningHistoryRecord[],
  uid: string,
): ActivityLog[] => {
  const counts: Record<string, number> = {};
  getUserLearningHistories(records, uid).forEach((history) => {
    const date = formatDateKey(history.lastStudiedAt);
    counts[date] = (counts[date] || 0) + 1;
  });

  return Object.keys(counts).map((date) => {
    const count = counts[date];
    let intensity: ActivityLog['intensity'] = 0;
    if (count > 0) intensity = 1;
    if (count > 5) intensity = 2;
    if (count > 15) intensity = 3;
    if (count > 30) intensity = 4;
    return { date, count, intensity };
  });
};

export const getMasteryDistribution = async (
  context: Pick<DashboardReadModelContext, 'getStore'>,
  uid: string,
): Promise<MasteryDistribution> => {
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return getMasteryDistributionFromHistoryRecords(records, uid);
};

export const getActivityLogs = async (
  context: Pick<DashboardReadModelContext, 'getStore'>,
  uid: string,
): Promise<ActivityLog[]> => {
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  return getActivityLogsFromHistoryRecords(records, uid);
};

export const getLeaderboard = async (
  context: Pick<DashboardReadModelContext, 'getSession'>,
  currentUid: string,
): Promise<LeaderboardEntry[]> => {
  const user = await context.getSession();
  const entries: LeaderboardEntry[] = [
    { uid: 'rival-1', displayName: '田中 陽葵', xp: (user?.stats?.xp || 0) + 500, level: 15, rank: 1, isCurrentUser: false },
    { uid: 'rival-2', displayName: '佐藤 翔太', xp: (user?.stats?.xp || 0) + 200, level: 14, rank: 2, isCurrentUser: false },
    { uid: currentUid, displayName: user?.displayName || 'Me', xp: user?.stats?.xp || 0, level: user?.stats?.level || 1, rank: 3, isCurrentUser: true },
    { uid: 'rival-3', displayName: '高橋 優子', xp: Math.max(0, (user?.stats?.xp || 0) - 300), level: 10, rank: 4, isCurrentUser: false },
  ];

  return entries
    .sort((left, right) => right.xp - left.xp)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
};

export const getMotivationSnapshot = async (
  context: Pick<DashboardReadModelContext, 'getStore' | 'getSession'>,
  uid: string,
): Promise<MotivationSnapshot> => {
  const historyStore = await context.getStore(STORES.HISTORY);
  const records = await readAllStoreRecords<StoredLearningHistoryRecord>(historyStore);
  const sessionUser = await context.getSession();
  const personalTotals = getHistoryTotalsFromHistoryRecords(records, uid);
  const studentUsers = IDB_MOCK_USERS.filter((candidate) => candidate.role === UserRole.STUDENT);
  const includeCurrentStudent = sessionUser?.role === UserRole.STUDENT
    && !studentUsers.some((candidate) => candidate.uid === sessionUser.uid);
  const globalRegisteredUsers = studentUsers.length + (includeCurrentStudent ? 1 : 0);

  const scopes: MotivationScopeStats[] = [
    createMotivationScope('PERSONAL', 'あなた', 'あなた自身の累計です。', personalTotals, 1),
  ];

  if (sessionUser?.organizationName) {
    const groupRegisteredUsers = studentUsers.filter(
      (candidate) => candidate.organizationName === sessionUser.organizationName,
    ).length + (includeCurrentStudent ? 1 : 0);

    scopes.push(
      createMotivationScope(
        'GROUP',
        'グループ内',
        `${sessionUser.organizationName} の学習者全体です。`,
        buildMockMotivationTotals(personalTotals, Math.max(groupRegisteredUsers, 1), 0.81, 9800),
        Math.max(groupRegisteredUsers, 1),
      ),
    );
  }

  scopes.push(
    createMotivationScope(
      'GLOBAL',
      'アプリ全体',
      '現在の利用者全体の累計です。',
      buildMockMotivationTotals(personalTotals, Math.max(globalRegisteredUsers, 1), 0.78, 10800),
      Math.max(globalRegisteredUsers, 1),
    ),
  );

  return {
    scopes,
    insight: createMotivationInsight(scopes),
  };
};

export const getDashboardSnapshot = async (
  context: DashboardReadModelContext,
  uid: string,
): Promise<DashboardSnapshot> => {
  const sessionUser = await context.getSession();
  const plan = getSubscriptionPolicy(sessionUser?.subscriptionPlan || SubscriptionPlan.TOC_FREE);
  const allBooks = await context.getBooks();
  const officialBooks: BookMetadata[] = [];
  const myBooks: BookMetadata[] = [];

  allBooks.forEach((book) => {
    if (isBookOwnedByUser(book, uid)) myBooks.push(book);
    else officialBooks.push(book);
  });

  const accessibleOfficial = officialBooks.filter((book) => canAccessOfficialBook(sessionUser?.subscriptionPlan, book));
  accessibleOfficial.sort((left, right) => (
    left.isPriority === right.isPriority
      ? left.title.localeCompare(right.title)
      : left.isPriority ? -1 : 1
  ));
  myBooks.sort((left, right) => right.id.localeCompare(left.id));

  const progressResults = await Promise.all(
    [...accessibleOfficial, ...myBooks].map((book) => context.getBookProgress(uid, book.id)),
  );
  const progressMap: Record<string, BookProgress> = {};
  progressResults.forEach((progress) => {
    progressMap[progress.bookId] = progress;
  });

  const [
    dueCount,
    learningPlan,
    learningPreference,
    leaderboard,
    masteryDist,
    activityLogs,
    motivationSnapshot,
    coachNotifications,
  ] = await Promise.all([
    context.getDueCount(uid),
    context.getLearningPlan(uid),
    context.getLearningPreference(uid),
    getLeaderboard(context, uid),
    getMasteryDistribution(context, uid),
    getActivityLogs(context, uid),
    getMotivationSnapshot(context, uid),
    context.getCoachNotifications(uid, sessionUser),
  ]);

  return {
    dueCount,
    officialBooks: accessibleOfficial,
    myBooks,
    progressMap,
    learningPlan,
    learningPreference,
    leaderboard,
    masteryDist,
    activityLogs,
    motivationSnapshot,
    coachNotifications,
    accountOverview: {
      subscriptionPlan: sessionUser?.subscriptionPlan || SubscriptionPlan.TOC_FREE,
      organizationRole: sessionUser?.organizationRole,
      organizationName: sessionUser?.organizationName,
      priceLabel: plan.priceLabel,
      pricingNote: plan.pricingNote,
      audienceLabel: plan.audienceLabel,
      featureSummary: plan.featureSummary,
      aiUsage: {
        monthKey: formatMonthKey(new Date()),
        estimatedCostMilliYen: 240,
        budgetMilliYen: plan.monthlyAiBudgetMilliYen,
        remainingMilliYen: Math.max(0, plan.monthlyAiBudgetMilliYen - 240),
        actionCounts: {
          generateGeminiSentence: 2,
        },
      },
    },
    commercialRequests: [],
  };
};

export const getAdminDashboardSnapshot = async (
  context: Pick<DashboardReadModelContext, 'getAllStudentsProgress'>,
): Promise<AdminDashboardSnapshot> => {
  const students = await context.getAllStudentsProgress();
  const totalStudents = students.length;
  const atRiskStudents = students
    .filter((student) => student.riskLevel !== StudentRiskLevel.SAFE)
    .sort((left, right) => left.lastActive - right.lastActive)
    .slice(0, 6);

  return {
    overview: {
      totalStudents,
      activeToday: students.filter((student) => Date.now() - student.lastActive < 86400000).length,
      active7d: students.filter((student) => Date.now() - student.lastActive < 7 * 86400000).length,
      atRiskCount: atRiskStudents.length,
      studentsWithPlan: Math.max(0, totalStudents - 1),
      averageLearnedWords: totalStudents ? Math.round(students.reduce((sum, student) => sum + student.totalLearned, 0) / totalStudents) : 0,
      averageAccuracyRate: totalStudents ? Math.round(students.reduce((sum, student) => sum + (student.accuracy || 0), 0) / totalStudents * 100) : 0,
      officialBookCount: 0,
      customBookCount: 0,
      totalWordCount: 0,
      reportedWordCount: 0,
      notifications7d: 0,
      aiRequestsThisMonth: 0,
      aiCostThisMonthMilliYen: 0,
    },
    planBreakdown: Object.values(SubscriptionPlan).map((plan) => ({
      plan,
      count: students.filter((student) => student.subscriptionPlan === plan).length,
    })),
    riskBreakdown: [
      { riskLevel: StudentRiskLevel.SAFE, count: students.filter((student) => student.riskLevel === StudentRiskLevel.SAFE).length },
      { riskLevel: StudentRiskLevel.WARNING, count: students.filter((student) => student.riskLevel === StudentRiskLevel.WARNING).length },
      { riskLevel: StudentRiskLevel.DANGER, count: students.filter((student) => student.riskLevel === StudentRiskLevel.DANGER).length },
    ],
    trend: [],
    topBooks: [],
    aiActions: [],
    recentNotifications: [],
    recentReports: [],
    organizations: [],
    atRiskStudents,
  };
};
