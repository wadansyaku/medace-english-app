import { AI_ACTION_ESTIMATES, getSubscriptionPolicy } from '../../config/subscription';
import { buildMasteryDistribution } from '../../shared/learningHistory';
import {
  AccountOverview,
  AdminAiActionSummary,
  AdminBookInsight,
  AdminDashboardSnapshot,
  AdminOrganizationInsight,
  AdminPlanBreakdownItem,
  AdminRiskBreakdownItem,
  AdminTrendPoint,
  AdminWordReportSummary,
  BookMetadata,
  BookProgress,
  DashboardSnapshot,
  LeaderboardEntry,
  MasteryDistribution,
  MotivationScopeStats,
  MotivationSnapshot,
  PublicMotivationSnapshot,
  StudentRiskLevel,
  SubscriptionPlan,
  UserRole,
} from '../../types';
import { buildPublicMotivationSnapshot } from './public-motivation';
import { handleGetCommercialRequestStatus } from './commercial-actions';
import { handleGetActivityLogs, handleGetLearningPlan, handleGetLearningPreference } from './storage-learning-actions';
import { handleGetAllStudentsProgress, handleGetCoachNotifications } from './storage-organization-actions';
import type { AppEnv, DbUserRow } from './types';
import {
  canAccessOfficialBook,
  currentMonthKey,
  getBookProgress,
  getLastTokyoDateKeys,
  getMasteryProgressSql,
  getMasterySourceSql,
  getUserOrganizationRole,
  getUserSubscriptionPlan,
  getVisibleDueCount,
  isPaidPlan,
  readAll,
  readFirst,
  readVisibleBookRows,
  toLearningHistory,
  toBookMetadata,
  toTokyoDateKey,
  type DbHistoryRow,
} from './storage-support';

interface MotivationAggregateTotals {
  totalAnswers: number;
  totalCorrect: number;
  totalResponseTimeMs: number;
}

const toAccuracyRate = (totalCorrect: number, totalAnswers: number): number => (
  totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0
);

const toAverageResponseTimeMs = (totalResponseTimeMs: number, totalAnswers: number): number | null => {
  if (totalAnswers <= 0 || totalResponseTimeMs <= 0) return null;
  return Math.round(totalResponseTimeMs / totalAnswers);
};

const createMotivationScope = (
  scope: MotivationScopeStats['scope'],
  label: string,
  description: string,
  totals: MotivationAggregateTotals,
  registeredUsers: number,
): MotivationScopeStats => ({
  scope,
  label,
  description,
  totalAnswers: totals.totalAnswers,
  totalCorrect: totals.totalCorrect,
  accuracyRate: toAccuracyRate(totals.totalCorrect, totals.totalAnswers),
  totalStudyTimeMs: totals.totalResponseTimeMs,
  averageResponseTimeMs: toAverageResponseTimeMs(totals.totalResponseTimeMs, totals.totalAnswers),
  registeredUsers,
});

const createMotivationInsight = (scopes: MotivationScopeStats[]): MotivationSnapshot['insight'] => {
  const personal = scopes.find((scope) => scope.scope === 'PERSONAL');
  const comparison = scopes.find((scope) => scope.scope === 'GROUP') || scopes.find((scope) => scope.scope === 'GLOBAL');

  if (!personal || personal.totalAnswers === 0) {
    return {
      title: '最初の5問でモチベーションボードが動きます',
      body: '学習かテストを1セット進めると、総回答数・正解数・解答時間の集計がここから育ち始めます。',
    };
  }

  if (comparison && comparison.totalAnswers > 0) {
    const answerShare = Math.max(1, Math.round((personal.totalAnswers / comparison.totalAnswers) * 100));
    const timingCopy = personal.averageResponseTimeMs
      ? `平均解答時間は ${Math.round(personal.averageResponseTimeMs / 100) / 10} 秒です。`
      : '平均解答時間はこの更新以降の回答から集計します。';

    return {
      title: `あなたの回答が${comparison.label}の ${answerShare}% を占めています`,
      body: `正答率は ${personal.accuracyRate}% です。${timingCopy}`,
    };
  }

  return {
    title: `総回答数 ${personal.totalAnswers} 問まで積み上がりました`,
    body: `総正解数は ${personal.totalCorrect} 問、累計学習時間は ${Math.round(personal.totalStudyTimeMs / 60000)} 分です。`,
  };
};

const readMotivationTotals = async (
  env: AppEnv,
  sql: string,
  ...bindings: unknown[]
): Promise<MotivationAggregateTotals> => {
  const row = await readFirst<{
    total_answers: number;
    total_correct: number;
    total_response_time_ms: number;
  }>(env, sql, ...bindings);

  return {
    totalAnswers: Number(row?.total_answers || 0),
    totalCorrect: Number(row?.total_correct || 0),
    totalResponseTimeMs: Number(row?.total_response_time_ms || 0),
  };
};

export const handleGetAdminDashboardSnapshot = async (env: AppEnv, user: DbUserRow): Promise<AdminDashboardSnapshot> => {
  const students = await handleGetAllStudentsProgress(env, user);
  const todayKey = toTokyoDateKey(Date.now());
  const recentKeys = new Set(getLastTokyoDateKeys(7));
  const trendKeys = getLastTokyoDateKeys(14);
  const trendStart = Date.now() - 15 * 86400000;

  const [
    planCountRow,
    bookSummaryRow,
    reportCountRow,
    notifications7dRow,
    aiUsageRows,
    topBookRows,
    recentNotificationRows,
    recentReportRows,
    historyTrendRows,
    notificationTrendRows,
    signupTrendRows,
  ] = await Promise.all([
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM learning_plans lp
       JOIN users u ON u.id = lp.user_id
       WHERE u.role = ?`,
      UserRole.STUDENT,
    ),
    readFirst<{ official_book_count: number; custom_book_count: number; total_word_count: number }>(
      env,
      `SELECT
         SUM(CASE WHEN created_by IS NULL THEN 1 ELSE 0 END) AS official_book_count,
         SUM(CASE WHEN created_by IS NOT NULL THEN 1 ELSE 0 END) AS custom_book_count,
         COALESCE(SUM(word_count), 0) AS total_word_count
       FROM books`,
    ),
    readFirst<{ count: number }>(env, 'SELECT COUNT(*) AS count FROM word_reports'),
    readFirst<{ count: number }>(
      env,
      'SELECT COUNT(*) AS count FROM instructor_notifications WHERE created_at >= ?',
      Date.now() - 7 * 86400000,
    ),
    readAll<{ action: string; request_count: number; estimated_cost_milli_yen: number }>(
      env,
      `SELECT
         action,
         COUNT(*) AS request_count,
         COALESCE(SUM(estimated_cost_milli_yen), 0) AS estimated_cost_milli_yen
       FROM ai_usage_events
       WHERE month_key = ?
       GROUP BY action
       ORDER BY estimated_cost_milli_yen DESC, request_count DESC`,
      currentMonthKey(),
    ),
    readAll<{
      book_id: string;
      title: string;
      word_count: number;
      created_by: string | null;
      learner_count: number;
      learned_entries: number;
      average_progress: number;
    }>(
      env,
      `SELECT
         b.id AS book_id,
         b.title AS title,
         b.word_count AS word_count,
         b.created_by AS created_by,
         COUNT(DISTINCT h.user_id) AS learner_count,
         COUNT(h.word_id) AS learned_entries,
         CASE
           WHEN COUNT(DISTINCT h.user_id) = 0 OR b.word_count = 0 THEN 0
           ELSE ROUND((COUNT(h.word_id) * 100.0) / (b.word_count * COUNT(DISTINCT h.user_id)), 1)
         END AS average_progress
       FROM books b
       LEFT JOIN learning_histories h
         ON h.book_id = b.id
        AND ${getMasteryProgressSql('h')}
       GROUP BY b.id, b.title, b.word_count, b.created_by
       ORDER BY learner_count DESC, average_progress DESC, learned_entries DESC, b.title ASC
       LIMIT 6`,
    ),
    readAll<{
      id: number;
      student_user_id: string;
      student_name: string;
      instructor_user_id: string;
      instructor_name: string;
      message: string;
      trigger_reason: string;
      delivery_channel: 'IN_APP';
      used_ai: number;
      created_at: number;
    }>(
      env,
      `SELECT
         n.id,
         n.student_user_id,
         s.display_name AS student_name,
         n.instructor_user_id,
         i.display_name AS instructor_name,
         n.message,
         n.trigger_reason,
         n.delivery_channel,
         n.used_ai,
         n.created_at
       FROM instructor_notifications n
       JOIN users s ON s.id = n.student_user_id
       JOIN users i ON i.id = n.instructor_user_id
       ORDER BY n.created_at DESC
       LIMIT 6`,
    ),
    readAll<{
      id: number;
      word_id: string;
      word: string;
      book_title: string;
      reporter_name: string;
      reason: string;
      created_at: number;
    }>(
      env,
      `SELECT
         r.id,
         r.word_id,
         w.word AS word,
         b.title AS book_title,
         u.display_name AS reporter_name,
         r.reason,
         r.created_at
       FROM word_reports r
       JOIN words w ON w.id = r.word_id
       JOIN books b ON b.id = w.book_id
       JOIN users u ON u.id = r.reporter_user_id
       ORDER BY r.created_at DESC
       LIMIT 6`,
    ),
    readAll<{ user_id: string; last_studied_at: number }>(
      env,
      'SELECT user_id, last_studied_at FROM learning_histories WHERE last_studied_at >= ?',
      trendStart,
    ),
    readAll<{ created_at: number }>(
      env,
      'SELECT created_at FROM instructor_notifications WHERE created_at >= ?',
      trendStart,
    ),
    readAll<{ created_at: number }>(
      env,
      'SELECT created_at FROM users WHERE role = ? AND created_at >= ?',
      UserRole.STUDENT,
      trendStart,
    ),
  ]);

  const aiActions: AdminAiActionSummary[] = aiUsageRows.map((row) => ({
    action: row.action,
    label: AI_ACTION_ESTIMATES[row.action as keyof typeof AI_ACTION_ESTIMATES]?.label || row.action,
    requestCount: Number(row.request_count || 0),
    estimatedCostMilliYen: Number(row.estimated_cost_milli_yen || 0),
  }));

  const trendMap = new Map<string, { activeUsers: Set<string>; studiedWords: number; notifications: number; newStudents: number }>();
  trendKeys.forEach((key) => {
    trendMap.set(key, {
      activeUsers: new Set<string>(),
      studiedWords: 0,
      notifications: 0,
      newStudents: 0,
    });
  });

  historyTrendRows.forEach((row) => {
    const key = toTokyoDateKey(Number(row.last_studied_at || 0));
    const bucket = trendMap.get(key);
    if (!bucket) return;
    bucket.activeUsers.add(row.user_id);
    bucket.studiedWords += 1;
  });

  notificationTrendRows.forEach((row) => {
    const key = toTokyoDateKey(Number(row.created_at || 0));
    const bucket = trendMap.get(key);
    if (!bucket) return;
    bucket.notifications += 1;
  });

  signupTrendRows.forEach((row) => {
    const key = toTokyoDateKey(Number(row.created_at || 0));
    const bucket = trendMap.get(key);
    if (!bucket) return;
    bucket.newStudents += 1;
  });

  const trend: AdminTrendPoint[] = trendKeys.map((key) => {
    const bucket = trendMap.get(key)!;
    return {
      date: key,
      activeStudents: bucket.activeUsers.size,
      studiedWords: bucket.studiedWords,
      notifications: bucket.notifications,
      newStudents: bucket.newStudents,
    };
  });

  const topBooks: AdminBookInsight[] = topBookRows.map((row) => ({
    bookId: row.book_id,
    title: row.title,
    wordCount: Number(row.word_count || 0),
    learnerCount: Number(row.learner_count || 0),
    learnedEntries: Number(row.learned_entries || 0),
    averageProgress: Number(row.average_progress || 0),
    isOfficial: !row.created_by,
  }));

  const recentNotifications = recentNotificationRows.map((row) => ({
    id: row.id,
    studentUid: row.student_user_id,
    studentName: row.student_name,
    instructorUid: row.instructor_user_id,
    instructorName: row.instructor_name,
    message: row.message,
    triggerReason: row.trigger_reason,
    deliveryChannel: row.delivery_channel,
    usedAi: Boolean(row.used_ai),
    createdAt: row.created_at,
  }));

  const recentReports: AdminWordReportSummary[] = recentReportRows.map((row) => ({
    id: row.id,
    wordId: row.word_id,
    word: row.word,
    bookTitle: row.book_title,
    reporterName: row.reporter_name,
    reason: row.reason,
    createdAt: row.created_at,
  }));

  const planBreakdown: AdminPlanBreakdownItem[] = Object.values(SubscriptionPlan).map((plan) => ({
    plan,
    count: students.filter((student) => (student.subscriptionPlan || SubscriptionPlan.TOC_FREE) === plan).length,
  }));

  const riskBreakdown: AdminRiskBreakdownItem[] = [
    { riskLevel: StudentRiskLevel.SAFE, count: students.filter((student) => student.riskLevel === StudentRiskLevel.SAFE).length },
    { riskLevel: StudentRiskLevel.WARNING, count: students.filter((student) => student.riskLevel === StudentRiskLevel.WARNING).length },
    { riskLevel: StudentRiskLevel.DANGER, count: students.filter((student) => student.riskLevel === StudentRiskLevel.DANGER).length },
  ];

  const allAtRiskStudents = [...students]
    .filter((student) => student.riskLevel !== StudentRiskLevel.SAFE)
    .sort((left, right) => {
      if (left.riskLevel !== right.riskLevel) {
        if (left.riskLevel === StudentRiskLevel.DANGER) return -1;
        if (right.riskLevel === StudentRiskLevel.DANGER) return 1;
      }
      return left.lastActive - right.lastActive;
    });
  const atRiskStudents = allAtRiskStudents.slice(0, 8);

  const organizationsMap = new Map<string, { studentCount: number; active7dCount: number; paidCount: number; totalLearned: number }>();
  students.forEach((student) => {
    const key = student.organizationName || '個人利用';
    if (!organizationsMap.has(key)) {
      organizationsMap.set(key, { studentCount: 0, active7dCount: 0, paidCount: 0, totalLearned: 0 });
    }

    const bucket = organizationsMap.get(key)!;
    bucket.studentCount += 1;
    bucket.totalLearned += student.totalLearned;
    if (student.lastActive && recentKeys.has(toTokyoDateKey(student.lastActive))) {
      bucket.active7dCount += 1;
    }
    if (isPaidPlan(student.subscriptionPlan || SubscriptionPlan.TOC_FREE)) {
      bucket.paidCount += 1;
    }
  });

  const organizations: AdminOrganizationInsight[] = [...organizationsMap.entries()]
    .map(([organizationName, value]) => ({
      organizationName,
      studentCount: value.studentCount,
      active7dCount: value.active7dCount,
      paidCount: value.paidCount,
      averageLearnedWords: value.studentCount ? Math.round(value.totalLearned / value.studentCount) : 0,
    }))
    .sort((left, right) => right.studentCount - left.studentCount || right.active7dCount - left.active7dCount)
    .slice(0, 6);

  const overview = {
    totalStudents: students.length,
    activeToday: students.filter((student) => student.lastActive && toTokyoDateKey(student.lastActive) === todayKey).length,
    active7d: students.filter((student) => student.lastActive && recentKeys.has(toTokyoDateKey(student.lastActive))).length,
    atRiskCount: allAtRiskStudents.length,
    studentsWithPlan: Number(planCountRow?.count || 0),
    averageLearnedWords: students.length ? Math.round(students.reduce((sum, student) => sum + student.totalLearned, 0) / students.length) : 0,
    averageAccuracyRate: students.length ? Math.round((students.reduce((sum, student) => sum + (student.accuracy || 0), 0) / students.length) * 100) : 0,
    officialBookCount: Number(bookSummaryRow?.official_book_count || 0),
    customBookCount: Number(bookSummaryRow?.custom_book_count || 0),
    totalWordCount: Number(bookSummaryRow?.total_word_count || 0),
    reportedWordCount: Number(reportCountRow?.count || 0),
    notifications7d: Number(notifications7dRow?.count || 0),
    aiRequestsThisMonth: aiActions.reduce((sum, action) => sum + action.requestCount, 0),
    aiCostThisMonthMilliYen: aiActions.reduce((sum, action) => sum + action.estimatedCostMilliYen, 0),
  };

  return {
    overview,
    planBreakdown,
    riskBreakdown,
    trend,
    topBooks,
    aiActions,
    recentNotifications,
    recentReports,
    organizations,
    atRiskStudents,
  };
};

export const handleGetAiUsageSummary = async (env: AppEnv, user: DbUserRow): Promise<AccountOverview['aiUsage']> => {
  const plan = getSubscriptionPolicy(getUserSubscriptionPlan(user));
  const monthKey = currentMonthKey();
  const rows = await readAll<{
    action: string;
    estimated_cost_milli_yen: number;
    request_count: number;
  }>(
    env,
    `SELECT
       action,
       COALESCE(SUM(estimated_cost_milli_yen), 0) AS estimated_cost_milli_yen,
       COUNT(*) AS request_count
     FROM ai_usage_events
     WHERE user_id = ? AND month_key = ?
     GROUP BY action`,
    user.id,
    monthKey,
  );

  const actionCounts: Record<string, number> = {};
  const estimatedCostMilliYen = rows.reduce((total, row) => {
    actionCounts[row.action] = Number(row.request_count || 0);
    return total + Number(row.estimated_cost_milli_yen || 0);
  }, 0);

  return {
    monthKey,
    estimatedCostMilliYen,
    budgetMilliYen: plan.monthlyAiBudgetMilliYen,
    remainingMilliYen: Math.max(0, plan.monthlyAiBudgetMilliYen - estimatedCostMilliYen),
    actionCounts,
  };
};

export const handleGetAccountOverview = async (env: AppEnv, user: DbUserRow): Promise<AccountOverview> => {
  const plan = getSubscriptionPolicy(getUserSubscriptionPlan(user));
  return {
    subscriptionPlan: plan.plan,
    organizationRole: getUserOrganizationRole(user),
    organizationName: user.organization_name || undefined,
    priceLabel: plan.priceLabel,
    pricingNote: plan.pricingNote,
    audienceLabel: plan.audienceLabel,
    featureSummary: plan.featureSummary,
    aiUsage: await handleGetAiUsageSummary(env, user),
  };
};

export const handleGetLeaderboard = async (env: AppEnv, currentUserId: string): Promise<LeaderboardEntry[]> => {
  const users = await readAll<DbUserRow>(
    env,
    `SELECT * FROM users
     WHERE role = ?
     ORDER BY stats_level DESC, stats_xp DESC, display_name ASC`,
    UserRole.STUDENT,
  );

  const topTen = users.slice(0, 10);
  const currentIndex = users.findIndex((user) => user.id === currentUserId);

  if (currentIndex >= 10) {
    topTen.push(users[currentIndex]);
  }

  return topTen.map((row, index) => ({
    uid: row.id,
    displayName: row.display_name,
    xp: Number(row.stats_xp || 0),
    level: Number(row.stats_level || 1),
    rank: users.findIndex((candidate) => candidate.id === row.id) + 1 || index + 1,
    isCurrentUser: row.id === currentUserId,
  }));
};

export const handleGetMasteryDistribution = async (env: AppEnv, userId: string): Promise<MasteryDistribution> => {
  const rows = await readAll<DbHistoryRow>(
    env,
    `SELECT *
     FROM learning_histories
     WHERE user_id = ? AND ${getMasterySourceSql()}`,
    userId,
  );
  return buildMasteryDistribution(rows.map(toLearningHistory));
};

export const handleGetMotivationSnapshot = async (env: AppEnv, user: DbUserRow): Promise<MotivationSnapshot> => {
  const [personalTotals, globalTotals, globalRegisteredRow] = await Promise.all([
    readMotivationTotals(
      env,
      `SELECT
         COALESCE(SUM(attempt_count), 0) AS total_answers,
         COALESCE(SUM(correct_count), 0) AS total_correct,
         COALESCE(SUM(total_response_time_ms), 0) AS total_response_time_ms
       FROM learning_histories
       WHERE user_id = ?`,
      user.id,
    ),
    readMotivationTotals(
      env,
      `SELECT
         COALESCE(SUM(h.attempt_count), 0) AS total_answers,
         COALESCE(SUM(h.correct_count), 0) AS total_correct,
         COALESCE(SUM(h.total_response_time_ms), 0) AS total_response_time_ms
       FROM learning_histories h
       JOIN users u ON u.id = h.user_id
       WHERE u.role = ?`,
      UserRole.STUDENT,
    ),
    readFirst<{ count: number }>(
      env,
      'SELECT COUNT(*) AS count FROM users WHERE role = ?',
      UserRole.STUDENT,
    ),
  ]);

  const scopes: MotivationScopeStats[] = [
    createMotivationScope(
      'PERSONAL',
      'あなた',
      'あなた自身の累計です。',
      personalTotals,
      1,
    ),
  ];

  if (user.organization_name) {
    const [groupTotals, groupRegisteredRow] = await Promise.all([
      readMotivationTotals(
        env,
        `SELECT
           COALESCE(SUM(h.attempt_count), 0) AS total_answers,
           COALESCE(SUM(h.correct_count), 0) AS total_correct,
           COALESCE(SUM(h.total_response_time_ms), 0) AS total_response_time_ms
         FROM learning_histories h
         JOIN users u ON u.id = h.user_id
         WHERE u.role = ? AND u.organization_name = ?`,
        UserRole.STUDENT,
        user.organization_name,
      ),
      readFirst<{ count: number }>(
        env,
        'SELECT COUNT(*) AS count FROM users WHERE role = ? AND organization_name = ?',
        UserRole.STUDENT,
        user.organization_name,
      ),
    ]);

    scopes.push(
      createMotivationScope(
        'GROUP',
        'グループ内',
        `${user.organization_name} の学習者全体です。`,
        groupTotals,
        Math.max(1, Number(groupRegisteredRow?.count || 0)),
      ),
    );
  }

  scopes.push(
    createMotivationScope(
      'GLOBAL',
      'アプリ全体',
      '現在の利用者全体の累計です。',
      globalTotals,
      Math.max(1, Number(globalRegisteredRow?.count || 0)),
    ),
  );

  return {
    scopes,
    insight: createMotivationInsight(scopes),
  };
};

export const handleGetPublicMotivationSnapshot = async (env: AppEnv): Promise<PublicMotivationSnapshot> => {
  const now = Date.now();
  const [globalTotals, globalRegisteredRow, liveRow] = await Promise.all([
    readMotivationTotals(
      env,
      `SELECT
         COALESCE(SUM(h.attempt_count), 0) AS total_answers,
         COALESCE(SUM(h.correct_count), 0) AS total_correct,
         COALESCE(SUM(h.total_response_time_ms), 0) AS total_response_time_ms
       FROM learning_histories h
       JOIN users u ON u.id = h.user_id
       WHERE u.role = ?`,
      UserRole.STUDENT,
    ),
    readFirst<{ count: number }>(
      env,
      'SELECT COUNT(*) AS count FROM users WHERE role = ?',
      UserRole.STUDENT,
    ),
    readFirst<{
      active_learners_15m: number;
      active_learners_24h: number;
      words_touched_24h: number;
    }>(
      env,
      `SELECT
         COUNT(DISTINCT CASE WHEN h.last_studied_at >= ? THEN h.user_id ELSE NULL END) AS active_learners_15m,
         COUNT(DISTINCT CASE WHEN h.last_studied_at >= ? THEN h.user_id ELSE NULL END) AS active_learners_24h,
         COUNT(CASE WHEN h.last_studied_at >= ? THEN 1 ELSE NULL END) AS words_touched_24h
       FROM learning_histories h
       JOIN users u ON u.id = h.user_id
       WHERE u.role = ?`,
      now - 15 * 60 * 1000,
      now - 24 * 60 * 60 * 1000,
      now - 24 * 60 * 60 * 1000,
      UserRole.STUDENT,
    ),
  ]);

  const globalScope = createMotivationScope(
    'GLOBAL',
    'アプリ全体',
    '現在の利用者全体の累計です。',
    globalTotals,
    Math.max(1, Number(globalRegisteredRow?.count || 0)),
  );

  return buildPublicMotivationSnapshot({
    globalScope,
    activeLearners15m: Number(liveRow?.active_learners_15m || 0),
    activeLearners24h: Number(liveRow?.active_learners_24h || 0),
    wordsTouched24h: Number(liveRow?.words_touched_24h || 0),
    updatedAt: now,
  });
};

export const handleGetDashboardSnapshot = async (env: AppEnv, user: DbUserRow): Promise<DashboardSnapshot> => {
  const allBooks = await readVisibleBookRows(env, user);

  const officialBooks: BookMetadata[] = [];
  const myBooks: BookMetadata[] = [];

  allBooks.forEach((row) => {
    const mapped = toBookMetadata(row);
    if (row.created_by === user.id) myBooks.push(mapped);
    else if (canAccessOfficialBook(user, mapped)) officialBooks.push(mapped);
  });

  officialBooks.sort((left, right) => (left.isPriority === right.isPriority ? left.title.localeCompare(right.title) : left.isPriority ? -1 : 1));
  myBooks.sort((left, right) => right.id.localeCompare(left.id));

  const [progressResults, dueCount, learningPlan, learningPreference, leaderboard, masteryDist, activityLogs, motivationSnapshot, coachNotifications, accountOverview, commercialRequests] = await Promise.all([
    Promise.all([...officialBooks, ...myBooks].map((book) => getBookProgress(env, user.id, book.id))),
    getVisibleDueCount(env, user),
    handleGetLearningPlan(env, user),
    handleGetLearningPreference(env, user),
    handleGetLeaderboard(env, user.id),
    handleGetMasteryDistribution(env, user.id),
    handleGetActivityLogs(env, user.id),
    handleGetMotivationSnapshot(env, user),
    handleGetCoachNotifications(env, user.id),
    handleGetAccountOverview(env, user),
    handleGetCommercialRequestStatus(env, user),
  ]);

  const progressMap: Record<string, BookProgress> = {};
  progressResults.forEach((progress) => {
    progressMap[progress.bookId] = progress;
  });

  return {
    dueCount,
    officialBooks,
    myBooks,
    progressMap,
    learningPlan,
    learningPreference,
    leaderboard,
    masteryDist,
    activityLogs,
    motivationSnapshot,
    coachNotifications,
    accountOverview,
    commercialRequests,
  };
};
