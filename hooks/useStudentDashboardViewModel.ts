import { getSubscriptionPolicy, isAdSupportedPlan } from '../config/subscription';
import { getTodayDateKey } from '../utils/date';
import { buildFallbackLearningPlan } from '../utils/learningPlan';
import { buildWeaknessEmptyStateLabel, WEAKNESS_MIN_SAMPLE } from '../shared/weakness';
import { getEnglishPracticeLaneForWeakness } from '../shared/englishPractice';
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
import type {
  EnglishPracticeLaneId,
  EnglishPracticeRecommendation,
} from '../utils/englishPracticeProgress';

interface UseStudentDashboardViewModelParams {
  user: UserProfile;
  snapshot: DashboardSnapshot | null;
  englishPracticeRecommendation?: EnglishPracticeRecommendation | null;
}

export type StudentDashboardLearningRouteId = 'today' | 'mission' | 'weakness' | 'englishPractice' | 'writing';

export interface StudentDashboardLearningRouteCard {
  id: StudentDashboardLearningRouteId;
  title: string;
  body: string;
  ctaLabel: string;
  metricLabel: string;
  stateLabel: string;
  tone: 'primary' | 'mission' | 'weakness' | 'practice' | 'writing';
  isPrimary: boolean;
}

export interface StudentDashboardPracticeRecommendation {
  lane: EnglishPracticeLaneId;
  title: string;
  body: string;
  ctaLabel: string;
  metricLabel: string;
  stateLabel: string;
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

const PRACTICE_LANE_COPY: Record<EnglishPracticeLaneId, Pick<StudentDashboardPracticeRecommendation, 'title' | 'ctaLabel' | 'metricLabel' | 'stateLabel'>> = {
  grammar: {
    title: '文法演習',
    ctaLabel: '文法を5問',
    metricLabel: '5問',
    stateLabel: '文法',
  },
  translation: {
    title: '和訳演習',
    ctaLabel: '全文和訳を始める',
    metricLabel: '1セット',
    stateLabel: '和訳',
  },
  reading: {
    title: '長文読解',
    ctaLabel: '短い長文を読む',
    metricLabel: '1本文',
    stateLabel: '長文',
  },
  writing: {
    title: '英検英作文',
    ctaLabel: '英作文を1テーマ書く',
    metricLabel: '1テーマ',
    stateLabel: '英作文',
  },
};

export const useStudentDashboardViewModel = ({
  user,
  snapshot,
  englishPracticeRecommendation,
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
    ? '最初の教材を1冊つくる'
    : remainingWords > 0
      ? `今日はあと${remainingWords}語`
      : '今日はここまでで十分です';

  const heroCopy = !hasStudyBooks
    ? '教科書の写真やPDFからMy単語帳を作れます。まずは1ページ分で始めましょう。'
    : remainingWords > 0
      ? dueCount > 0
        ? `復習待ちの${reviewFirstCount}語から始めると、そのまま今日の分まで進められます。`
        : 'まずは1セットだけ進めましょう。続きはあとで足せます。'
      : '今日は目標達成です。余力があれば復習を1セットだけ足しましょう。';

  const questButtonLabel = !hasStudyBooks
    ? 'My単語帳を作る'
    : remainingWords > 0
      ? '今日の学習を始める'
      : '復習を1セット足す';

  const aiBudgetPercent = accountOverview
    ? Math.min(100, Math.round((accountOverview.aiUsage.estimatedCostMilliYen / Math.max(accountOverview.aiUsage.budgetMilliYen, 1)) * 100))
    : 0;

  const aiUsageLabel = aiBudgetPercent >= 85 ? '控えめに利用中' : aiBudgetPercent >= 55 ? '通常利用中' : 'ゆとりあり';
  const aiUsageCopy = aiBudgetPercent >= 85
    ? '今月は軽めの教材作成と添削に絞るのがよさそうです。'
    : aiBudgetPercent >= 55
      ? '今月は通常どおり教材作成と添削に使えます。'
      : '今月は教材作成や添削にまだ余裕があります。';

  const preferenceSummaryParts = [
    learningPreference?.targetExam ? `目標: ${learningPreference.targetExam}` : null,
    learningPreference?.targetScore ? `目標点: ${learningPreference.targetScore}` : null,
    learningPreference?.examDate ? `試験日: ${learningPreference.examDate}` : null,
    learningPreference?.weakSkillFocus ? `重点: ${learningPreference.weakSkillFocus}` : null,
  ].filter(Boolean);

  const preferenceSummary = preferenceSummaryParts.length > 0
    ? preferenceSummaryParts.join(' / ')
    : '目標と使える時間を入れると、今日やる量を決めやすくなります。';

  const canShowAccountDetails = Boolean(accountOverview || showAdSlots);
  const latestCoachNotification = coachNotifications[0] || null;
  const canShowWritingSection = currentPlan === SubscriptionPlan.TOB_PAID && Boolean(user.organizationName);
  const topWeakness = weaknessProfile?.topWeaknesses[0] || null;
  const hasWeaknessSignals = Boolean(weaknessProfile?.hasSufficientData && topWeakness);
  const recommendedPracticeLane = englishPracticeRecommendation?.lane
    || getEnglishPracticeLaneForWeakness(topWeakness)
    || 'grammar';
  const recommendedPracticeCopy = PRACTICE_LANE_COPY[recommendedPracticeLane];
  const practiceRecommendation: StudentDashboardPracticeRecommendation = {
    lane: recommendedPracticeLane,
    title: englishPracticeRecommendation?.labelJa || recommendedPracticeCopy.title,
    ctaLabel: englishPracticeRecommendation?.actionJa || recommendedPracticeCopy.ctaLabel,
    metricLabel: recommendedPracticeCopy.metricLabel,
    stateLabel: recommendedPracticeCopy.stateLabel,
    body: topWeakness && getEnglishPracticeLaneForWeakness(topWeakness)
      ? `${WEAKNESS_DIMENSION_LABELS[topWeakness.dimension]}を5分だけ練習します。`
      : englishPracticeRecommendation?.reasonJa
        ? englishPracticeRecommendation.reasonJa
      : remainingWords > 0
        ? '単語のあとに、文法か和訳を1つだけ足します。'
        : '語彙の目標が終わったので、文法・和訳・長文から1つ進めます。',
  };
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
  const hasEnglishPracticeWeakness = Boolean(getEnglishPracticeLaneForWeakness(topWeakness));
  const shouldPrioritizePractice = Boolean(
    hasStudyBooks
      && !hasActionableWriting
      && !hasActiveMission
      && (hasEnglishPracticeWeakness || (!hasWeaknessSignals && remainingWords <= 0)),
  );
  const primaryLearningRouteId: StudentDashboardLearningRouteId = !hasStudyBooks
    ? 'today'
    : hasActionableWriting
      ? 'writing'
      : hasActiveMission
        ? 'mission'
        : shouldPrioritizePractice
          ? 'englishPractice'
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
        ? 'My単語帳を1冊作ると、今日の学習を始められます。'
        : remainingWords > 0
          ? dueCount > 0
            ? `復習待ちを先に見直してから、残り${remainingWords}語を進めます。`
            : `残り${remainingWords}語を1セットで進めます。`
          : '今日の目標は達成済みです。余力があれば復習を追加します。',
      ctaLabel: questButtonLabel,
      metricLabel: hasStudyBooks ? `${remainingWords}語` : '教材未作成',
      stateLabel: hasStudyBooks ? `${estimatedMinutes}分目安` : '準備',
      tone: 'primary' as const,
    },
    primaryMission ? {
      id: 'mission' as const,
      title: 'ミッション',
      body: primaryMission.blockers.length > 0
        ? `残り: ${primaryMission.blockers.join(' / ')}。次の操作をここから始められます。`
        : '今週のミッションは完了済みです。必要なら復習を追加できます。',
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
        : `${WEAKNESS_MIN_SAMPLE}問ほど解くと、苦手な型が見えてきます。`,
      ctaLabel: topWeakness?.nextActionLabel || buildWeaknessEmptyStateLabel(),
      metricLabel: topWeakness ? WEAKNESS_DIMENSION_LABELS[topWeakness.dimension] : 'ログ収集中',
      stateLabel: hasWeaknessSignals ? '優先' : `${WEAKNESS_MIN_SAMPLE}問から判定`,
      tone: 'weakness' as const,
    },
    hasStudyBooks ? {
      id: 'englishPractice' as const,
      title: '英語演習',
      body: practiceRecommendation.body,
      ctaLabel: practiceRecommendation.ctaLabel,
      metricLabel: practiceRecommendation.metricLabel,
      stateLabel: practiceRecommendation.stateLabel,
      tone: 'practice' as const,
    } : null,
    canShowWritingSection ? {
      id: 'writing' as const,
      title: '英作文',
      body: hasActionableWriting
        ? 'ミッションの英作文が残っています。提出画面をすぐ開けます。'
        : '配布済み課題、提出、返却コメントをまとめて確認できます。',
      ctaLabel: hasActionableWriting ? (primaryMission?.nextActionLabel || '英作文を提出') : '英作文を確認',
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
  const primaryLearningRouteCard = learningRouteCards.find((card) => card.isPrimary) || null;
  const heroRouteTitle = primaryLearningRouteId === 'today' || !primaryLearningRouteCard
    ? heroTitle
    : primaryLearningRouteId === 'englishPractice'
      ? practiceRecommendation.title
    : `${primaryLearningRouteCard.title}: ${primaryLearningRouteCard.metricLabel}`;
  const heroRouteCopy = primaryLearningRouteId === 'today' || !primaryLearningRouteCard
    ? heroCopy
    : primaryLearningRouteCard.body;
  const heroRouteButtonLabel = primaryLearningRouteCard?.ctaLabel || questButtonLabel;

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
    heroTitle: heroRouteTitle,
    heroCopy: heroRouteCopy,
    questButtonLabel: heroRouteButtonLabel,
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
    practiceRecommendation,
    primaryLearningRouteId,
    learningRouteCards,
  };
};
