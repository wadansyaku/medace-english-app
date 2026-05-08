import { getSubscriptionPolicy, isAdSupportedPlan } from '../config/subscription';
import { getTodayDateKey } from '../utils/date';
import { buildFallbackLearningPlan } from '../utils/learningPlan';
import { buildWeaknessEmptyStateLabel, WEAKNESS_MIN_SAMPLE } from '../shared/weakness';
import {
  EnglishLevel,
  MissionNextActionType,
  SubscriptionPlan,
  type DashboardSnapshot,
  type UserProfile,
  UserGrade,
  UserStudyMode,
  WEAKNESS_DIMENSION_LABELS,
  WEEKLY_MISSION_STATUS_LABELS,
  WeeklyMissionStatus,
} from '../types';

interface UseStudentDashboardViewModelParams {
  user: UserProfile;
  snapshot: DashboardSnapshot | null;
}

export type StudentDashboardLearningRouteId = 'today' | 'mission' | 'weakness' | 'writing';

export interface StudentDashboardLearningRouteCard {
  id: StudentDashboardLearningRouteId;
  title: string;
  body: string;
  ctaLabel: string;
  metricLabel: string;
  stateLabel: string;
  tone: 'primary' | 'mission' | 'weakness' | 'writing';
  isPrimary: boolean;
}

const getLeague = (level: number) => {
  if (level >= 20) return { name: 'ゴールド', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
  if (level >= 10) return { name: 'シルバー', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  return { name: 'ブロンズ', color: 'bg-orange-50 text-orange-800 border-orange-200' };
};

const orderBooksByIds = <T extends { id: string }>(books: T[], orderedIds: string[]): T[] => {
  const bookMap = new Map(books.map((book) => [book.id, book]));
  return orderedIds
    .map((id) => bookMap.get(id))
    .filter((book): book is T => Boolean(book));
};

export const useStudentDashboardViewModel = ({
  user,
  snapshot,
}: UseStudentDashboardViewModelParams) => {
  const dueCount = snapshot?.dueCount ?? 0;
  const books = snapshot?.officialBooks ?? [];
  const myBooks = snapshot?.myBooks ?? [];
  const progressMap = snapshot?.progressMap ?? {};
  const learningPlan = snapshot?.learningPlan ?? null;
  const learningPreference = snapshot?.learningPreference ?? null;
  const weaknessProfile = snapshot?.weaknessProfile ?? null;
  const leaderboard = snapshot?.leaderboard ?? [];
  const masteryDist = snapshot?.masteryDist ?? null;
  const activityLogs = snapshot?.activityLogs ?? [];
  const motivationSnapshot = snapshot?.motivationSnapshot ?? null;
  const coachNotifications = snapshot?.coachNotifications ?? [];
  const primaryMission = snapshot?.primaryMission ?? null;
  const accountOverview = snapshot?.accountOverview ?? null;
  const commercialRequests = snapshot?.commercialRequests ?? [];

  const planningBooks = [...books, ...myBooks];
  const hasStudyBooks = planningBooks.length > 0;
  const studyMode = user.studyMode || UserStudyMode.FOCUS;
  const isGameMode = studyMode === UserStudyMode.GAME;

  const todayKey = getTodayDateKey();
  const todayCount = activityLogs.find((log) => log.date === todayKey)?.count ?? 0;
  const weekTotal = activityLogs.reduce((sum, log) => sum + log.count, 0);
  const stabilizedWords = (masteryDist?.graduated ?? 0) + (masteryDist?.review ?? 0);
  const userLeague = getLeague(user.stats?.level || 1);
  const preferenceDailyWordGoal = learningPreference?.dailyStudyMinutes
    ? Math.min(40, Math.max(10, learningPreference.dailyStudyMinutes * 4))
    : null;
  const todayWordGoal = learningPlan?.dailyWordGoal ?? preferenceDailyWordGoal ?? Math.min(Math.max(dueCount, 10), 20);
  const weeklyGoal = todayWordGoal * 7;
  const weeklyRemaining = Math.max(weeklyGoal - weekTotal, 0);
  const remainingWords = Math.max(todayWordGoal - todayCount, 0);
  const reviewFirstCount = dueCount > 0 ? Math.min(dueCount, Math.max(remainingWords, Math.min(todayWordGoal, 8))) : 0;
  const estimatedMinutes = Math.max(3, Math.ceil((remainingWords > 0 ? remainingWords : Math.max(6, Math.min(todayWordGoal, 10))) / 4));
  const todayProgressPercent = todayWordGoal > 0 ? Math.min(100, Math.round((todayCount / todayWordGoal) * 100)) : 0;

  const currentPlan = accountOverview?.subscriptionPlan || user.subscriptionPlan || SubscriptionPlan.TOC_FREE;
  const currentPlanPolicy = getSubscriptionPolicy(currentPlan);
  const showAdSlots = isAdSupportedPlan(currentPlan);
  const canGenerateAiPlan = currentPlanPolicy.allowedAiActions.includes('generateLearningPlan');
  const canCreateFromText = currentPlanPolicy.allowedAiActions.includes('extractVocabularyFromText');
  const canCreateFromFile = currentPlanPolicy.allowedAiActions.includes('extractVocabularyFromMedia');

  const fallbackPlanSuggestion = hasStudyBooks
    ? buildFallbackLearningPlan({
        uid: user.uid,
        grade: user.grade || UserGrade.ADULT,
        level: user.englishLevel || EnglishLevel.B1,
        availableBooks: planningBooks,
        learningPreference,
      })
    : null;

  const plannedBooks = learningPlan && learningPlan.selectedBookIds.length > 0
    ? orderBooksByIds(planningBooks, learningPlan.selectedBookIds)
    : (() => {
        const prioritized = planningBooks.filter((book) => book.isPriority);
        return (prioritized.length > 0 ? prioritized : planningBooks).slice(0, 3);
      })();

  const recommendedOfficialBooks = learningPlan && learningPlan.selectedBookIds.length > 0
    ? orderBooksByIds(books, learningPlan.selectedBookIds)
    : (() => {
        const fallbackIds = fallbackPlanSuggestion?.selectedBookIds ?? [];
        const suggested = orderBooksByIds(books, fallbackIds);
        if (suggested.length > 0) return suggested;
        const prioritized = books.filter((book) => book.isPriority);
        return (prioritized.length > 0 ? prioritized : books).slice(0, 3);
      })();
  const primaryRecommendedBook = recommendedOfficialBooks[0] || null;
  const secondaryRecommendedBooks = recommendedOfficialBooks.slice(1);

  const heroTitle = !hasStudyBooks
    ? '最初の教材を 1 冊つくる'
    : remainingWords > 0
      ? `あと${remainingWords}語で今日の目標です`
      : '今日はここまでで十分です';

  const heroCopy = !hasStudyBooks
    ? '写真・PDF・テキストから My単語帳 を作れば、そのままスマホ学習を始められます。まずは教科書 1 ページ分で十分です。'
    : remainingWords > 0
      ? dueCount > 0
        ? `まずは復習待ちの ${reviewFirstCount} 語から始めれば、そのまま今日のノルマに入れます。`
        : '今日は短く区切って進めれば十分です。まずはクエストを1回だけ始めましょう。'
      : '余力があればテストかMy単語帳に進み、無理ならここで終えても流れは崩れません。';

  const questButtonLabel = !hasStudyBooks
    ? 'My単語帳を作る'
    : remainingWords > 0
      ? '今日のクエストを開始'
      : '復習をもう1セットやる';

  const aiBudgetPercent = accountOverview
    ? Math.min(100, Math.round((accountOverview.aiUsage.estimatedCostMilliYen / Math.max(accountOverview.aiUsage.budgetMilliYen, 1)) * 100))
    : 0;

  const aiUsageLabel = aiBudgetPercent >= 85 ? '控えめに利用中' : aiBudgetPercent >= 55 ? '通常利用中' : 'ゆとりあり';
  const aiUsageCopy = aiBudgetPercent >= 85
    ? '今月は軽いAIサポートを中心にご利用いただく想定です。'
    : aiBudgetPercent >= 55
      ? '今月のAIサポートは通常どおりご利用いただけます。'
      : '今月のAIサポートは十分な余裕があります。';

  const preferenceSummaryParts = [
    learningPreference?.targetExam ? `目標: ${learningPreference.targetExam}` : null,
    learningPreference?.targetScore ? `目標点: ${learningPreference.targetScore}` : null,
    learningPreference?.examDate ? `試験日: ${learningPreference.examDate}` : null,
    learningPreference?.weakSkillFocus ? `重点: ${learningPreference.weakSkillFocus}` : null,
  ].filter(Boolean);

  const preferenceSummary = preferenceSummaryParts.length > 0
    ? preferenceSummaryParts.join(' / ')
    : '目標試験・学習時間・苦手分野を設定すると、プラン提案の精度が上がります。';

  const canShowAccountDetails = Boolean(accountOverview || showAdSlots);
  const latestCoachNotification = coachNotifications[0] || null;
  const canShowWritingSection = currentPlan === SubscriptionPlan.TOB_PAID && Boolean(user.organizationName);
  const topWeakness = weaknessProfile?.topWeaknesses[0] || null;
  const hasWeaknessSignals = Boolean(weaknessProfile?.hasSufficientData && topWeakness);
  const hasActionableWriting = Boolean(
    canShowWritingSection
      && primaryMission
      && (
        primaryMission.nextActionType === MissionNextActionType.OPEN_WRITING
        || (primaryMission.writingRequired && !primaryMission.writingCompleted)
      ),
  );
  const hasActiveMission = Boolean(
    primaryMission
      && primaryMission.status !== WeeklyMissionStatus.COMPLETED
      && primaryMission.completionRate < 100,
  );
  const primaryLearningRouteId: StudentDashboardLearningRouteId = !hasStudyBooks
    ? 'today'
    : hasActionableWriting
      ? 'writing'
      : hasActiveMission
        ? 'mission'
        : remainingWords > 0
          ? 'today'
          : hasWeaknessSignals
            ? 'weakness'
            : canShowWritingSection
              ? 'writing'
              : 'today';

  const learningRouteCardDrafts: Array<Omit<StudentDashboardLearningRouteCard, 'isPrimary'> | null> = [
    {
      id: 'today' as const,
      title: '今日の学習',
      body: !hasStudyBooks
        ? '最初のMy単語帳を作ると、今日の学習をすぐ始められます。'
        : remainingWords > 0
          ? dueCount > 0
            ? `復習待ちを先に消化してから、残り${remainingWords}語を進めます。`
            : `短いセッションで残り${remainingWords}語を進めます。`
          : '今日の目標は達成済みです。余力があれば追加復習だけ進めます。',
      ctaLabel: questButtonLabel,
      metricLabel: hasStudyBooks ? `${remainingWords}語` : '教材未作成',
      stateLabel: hasStudyBooks ? `${estimatedMinutes}分目安` : '準備',
      tone: 'primary' as const,
    },
    primaryMission ? {
      id: 'mission' as const,
      title: 'ミッション',
      body: primaryMission.blockers.length > 0
        ? `残り: ${primaryMission.blockers.join(' / ')}。次に押すべき操作をここにまとめています。`
        : '今週のミッションは完了済みです。必要なら追加の復習へ進めます。',
      ctaLabel: primaryMission.nextActionLabel,
      metricLabel: `${primaryMission.completionRate}%`,
      stateLabel: WEEKLY_MISSION_STATUS_LABELS[primaryMission.status],
      tone: 'mission' as const,
    } : null,
    {
      id: 'weakness' as const,
      title: hasWeaknessSignals ? '弱点集中' : '弱点診断',
      body: hasWeaknessSignals && topWeakness
        ? topWeakness.reason
        : `まず${WEAKNESS_MIN_SAMPLE}問以上の学習ログを作ると、苦手だけを絞って復習できます。`,
      ctaLabel: topWeakness?.nextActionLabel || buildWeaknessEmptyStateLabel(),
      metricLabel: topWeakness ? WEAKNESS_DIMENSION_LABELS[topWeakness.dimension] : 'ログ収集中',
      stateLabel: hasWeaknessSignals ? '優先' : `${WEAKNESS_MIN_SAMPLE}問から判定`,
      tone: 'weakness' as const,
    },
    canShowWritingSection ? {
      id: 'writing' as const,
      title: 'Writing',
      body: hasActionableWriting
        ? 'ミッションに紐づくWritingが残っています。提出画面まで迷わず移動できます。'
        : '配布済み課題、提出、返却コメントをまとめて確認できます。',
      ctaLabel: hasActionableWriting ? (primaryMission?.nextActionLabel || 'Writingを提出') : 'Writingを確認',
      metricLabel: primaryMission?.writingPromptTitle || '講師課題',
      stateLabel: hasActionableWriting ? '未提出' : '確認',
      tone: 'writing' as const,
    } : null,
  ];
  const learningRouteCards = learningRouteCardDrafts
    .filter((card): card is Omit<StudentDashboardLearningRouteCard, 'isPrimary'> => card !== null)
    .map((card) => ({
      ...card,
      isPrimary: card.id === primaryLearningRouteId,
    }));

  return {
    dueCount,
    books,
    myBooks,
    progressMap,
    learningPlan,
    learningPreference,
    weaknessProfile,
    leaderboard,
    masteryDist,
    activityLogs,
    motivationSnapshot,
    coachNotifications,
    primaryMission,
    accountOverview,
    commercialRequests,
    planningBooks,
    hasStudyBooks,
    isGameMode,
    todayCount,
    weekTotal,
    stabilizedWords,
    userLeague,
    todayWordGoal,
    weeklyGoal,
    weeklyRemaining,
    remainingWords,
    estimatedMinutes,
    todayProgressPercent,
    currentPlanPolicy,
    showAdSlots,
    canGenerateAiPlan,
    canCreateFromText,
    canCreateFromFile,
    plannedBooks,
    recommendedOfficialBooks,
    primaryRecommendedBook,
    secondaryRecommendedBooks,
    heroTitle,
    heroCopy,
    questButtonLabel,
    aiBudgetPercent,
    aiUsageLabel,
    aiUsageCopy,
    preferenceSummary,
    canShowAccountDetails,
    latestCoachNotification,
    canShowWritingSection,
    topWeakness,
    hasWeaknessSignals,
    hasActionableWriting,
    primaryLearningRouteId,
    learningRouteCards,
  };
};
