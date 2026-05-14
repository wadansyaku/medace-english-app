import React from 'react';
import {
  ArrowRight,
  Brain,
  Flag,
  LibraryBig,
  Languages,
  Loader2,
  NotebookPen,
  Play,
  Target,
  type LucideIcon,
} from 'lucide-react';

import {
  GRADE_LABELS,
  MissionNextActionType,
  MissionProgressEventType,
  RecommendedActionType,
  UserGrade,
  type LearningTaskIntent,
  type UserProfile,
} from '../types';
import Onboarding from './Onboarding';
import { useDashboardData } from '../hooks/useDashboardData';
import type { AnnouncementFeedController } from '../hooks/useAnnouncementFeed';
import { useDashboardSectionNavigation } from '../hooks/useDashboardSectionNavigation';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import useIsStudentMobileShell from '../hooks/useIsStudentMobileShell';
import { useStudentDashboardController } from '../hooks/useStudentDashboardController';
import {
  useStudentDashboardViewModel,
  type StudentDashboardLearningRouteCard,
  type StudentDashboardLearningRouteId,
  type StudentDashboardPracticeRecommendation,
} from '../hooks/useStudentDashboardViewModel';
import { submitCommercialRequest } from '../services/commercial';
import { workspaceService } from '../services/workspace';
import type { CommercialRequestPayload } from '../contracts/storage';
import {
  loadEnglishPracticeProgress,
  summarizeEnglishPracticeProgress,
} from '../utils/englishPracticeProgress';
import {
  createMissionTaskIntent,
  createTodayFocusTaskIntent,
  createWeaknessTaskIntent,
} from '../shared/learningTask';
import StudentDashboardModals from './dashboard/StudentDashboardModals';
import StudentDashboardSections from './dashboard/StudentDashboardSections';

const EnglishPracticeHub = React.lazy(() => import('./practice/EnglishPracticeHub'));

interface DashboardProps {
  user: UserProfile;
  announcementFeed: AnnouncementFeedController;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onStartTask: (task: LearningTaskIntent) => void;
  onUserUpdate: (user: UserProfile) => void;
  activePracticeLane?: FocusedPracticeLane | null;
  onOpenPracticeLane: (lane: FocusedPracticeLane) => void;
  onClosePracticeLane?: () => void;
}

const LEARNING_ROUTE_ICON: Record<StudentDashboardLearningRouteId, LucideIcon> = {
  today: Play,
  mission: Flag,
  weakness: Target,
  englishPractice: Brain,
  writing: NotebookPen,
};

const LEARNING_ROUTE_TONE: Record<StudentDashboardLearningRouteCard['tone'], string> = {
  primary: 'border-medace-200 bg-medace-50 text-medace-900',
  mission: 'border-sky-200 bg-sky-50 text-sky-900',
  weakness: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  practice: 'border-orange-200 bg-orange-50 text-orange-900',
  writing: 'border-violet-200 bg-violet-50 text-violet-900',
};

interface StudentLearningLaunchPanelProps {
  cards: StudentDashboardLearningRouteCard[];
  onSelectRoute: (routeId: StudentDashboardLearningRouteId) => void;
}

const StudentLearningLaunchPanel: React.FC<StudentLearningLaunchPanelProps> = ({
  cards,
  onSelectRoute,
}) => {
  const secondaryCards = React.useMemo(
    () => cards.filter((card) => !card.isPrimary && card.id !== 'englishPractice'),
    [cards],
  );
  if (secondaryCards.length === 0) return null;

  return (
    <section
      data-testid="dashboard-learning-launch-panel"
      className="order-2 min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-black text-slate-500">必要なら切り替え</div>
        <div className="text-[11px] font-bold text-slate-400">迷ったら上の1つだけ</div>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {secondaryCards.map((card) => {
          const Icon = LEARNING_ROUTE_ICON[card.id];
          return (
            <div key={card.id} data-testid={`dashboard-learning-route-${card.id}`} className="min-w-0">
              <button
                type="button"
                data-testid={`dashboard-learning-route-${card.id}-cta`}
                onClick={() => onSelectRoute(card.id)}
                className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-slate-300 hover:bg-white"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${LEARNING_ROUTE_TONE[card.tone]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">{card.title}</span>
                  <span className="block truncate text-xs font-bold text-slate-500">{card.ctaLabel}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export type FocusedPracticeLane = 'grammar' | 'translation' | 'reading' | 'writing';

interface DashboardPracticeDockProps {
  recommendation: StudentDashboardPracticeRecommendation;
  onSelectLane: (lane: FocusedPracticeLane) => void;
}

const PRACTICE_DOCK_OPTIONS: Array<{
  id: FocusedPracticeLane;
  label: string;
  title: string;
  body: string;
  time: string;
  icon: LucideIcon;
}> = [
  {
    id: 'grammar',
    label: '文法',
    title: '文法を5問',
    body: '文の形を5問だけ練習します。',
    time: '3分',
    icon: Brain,
  },
  {
    id: 'translation',
    label: '和訳',
    title: '和訳を1セット',
    body: '英文を訳して、意味の抜けを見直します。',
    time: '5分',
    icon: Languages,
  },
  {
    id: 'reading',
    label: '長文',
    title: '短い長文を読む',
    body: '根拠になる文を探しながら答えます。',
    time: '8分',
    icon: LibraryBig,
  },
  {
    id: 'writing',
    label: '英検英作文',
    title: '英検ライティング',
    body: '級ごとのテーマで、短く書く練習をします。',
    time: '12分',
    icon: NotebookPen,
  },
];

const DashboardPracticeDock: React.FC<DashboardPracticeDockProps> = ({
  recommendation,
  onSelectLane,
}) => {
  const item = PRACTICE_DOCK_OPTIONS.find((option) => option.id === recommendation.lane) ?? PRACTICE_DOCK_OPTIONS[0];
  const Icon = item.icon;

  return (
    <section
      data-testid="dashboard-practice-dock"
      className="rounded-lg border border-orange-100 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="grid min-w-0 gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-black text-medace-600">英語演習</p>
          <h2 className="text-xl font-black text-slate-950">{recommendation.title}</h2>
          <p className="mt-1 max-w-2xl text-sm font-bold leading-relaxed text-slate-600">
            {item.body}
          </p>
        </div>
        <button
          type="button"
          data-testid={`dashboard-practice-lane-${recommendation.lane}`}
          onClick={() => onSelectLane(recommendation.lane)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800 lg:w-auto"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 whitespace-normal leading-snug">{recommendation.ctaLabel}</span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </button>
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs font-black text-slate-500">
        <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-orange-700">{recommendation.metricLabel}</span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{item.time}</span>
      </div>
    </section>
  );
};

interface DashboardPracticeFocusProps {
  user: UserProfile;
  lane: FocusedPracticeLane;
  onSelectLane: (lane: FocusedPracticeLane) => void;
  onClose: () => void;
  onStartVocabulary: () => void;
}

const isFocusedPracticeLane = (lane: string): lane is FocusedPracticeLane => (
  lane === 'grammar' || lane === 'translation' || lane === 'reading' || lane === 'writing'
);

const DashboardPracticeFocus: React.FC<DashboardPracticeFocusProps> = ({
  user,
  lane,
  onSelectLane,
  onClose,
  onStartVocabulary,
}) => (
  <section
    data-testid="dashboard-practice-focus"
    className="rounded-lg border border-medace-100 bg-white p-2 shadow-sm sm:p-3"
  >
    <React.Suspense
      fallback={
        <div className="flex min-h-[320px] flex-col items-center justify-center text-medace-500">
          <Loader2 className="mb-2 h-8 w-8 animate-spin" />
          <p className="text-sm font-bold">演習を開いています...</p>
        </div>
      }
    >
      <EnglishPracticeHub
        user={user}
        variant="embedded"
        embeddedMode="drill"
        initialLane={lane}
        closeLabel="今日の画面へ戻る"
        onClose={onClose}
        onStartVocabulary={onStartVocabulary}
        onActiveLaneChange={(nextLane) => {
          if (isFocusedPracticeLane(nextLane)) {
            onSelectLane(nextLane);
          }
        }}
      />
    </React.Suspense>
  </section>
);

const Dashboard: React.FC<DashboardProps> = ({
  user,
  announcementFeed,
  onSelectBook,
  onStartTask,
  onUserUpdate,
  activePracticeLane,
  onOpenPracticeLane,
  onClosePracticeLane,
}) => {
  const {
    snapshot,
    loading,
    refresh: refreshDashboard,
    updateLearningPlan,
    updateLearningPreference,
    removeMyBook,
  } = useDashboardData(user.uid);
  const isMobileViewport = useIsMobileViewport();
  const isStudentMobileShell = useIsStudentMobileShell(user);
  const [englishPracticeSummary, setEnglishPracticeSummary] = React.useState(() => (
    summarizeEnglishPracticeProgress(loadEnglishPracticeProgress(user.uid))
  ));
  const refreshEnglishPracticeSummary = React.useCallback(() => {
    setEnglishPracticeSummary(summarizeEnglishPracticeProgress(loadEnglishPracticeProgress(user.uid)));
  }, [user.uid]);
  React.useEffect(() => {
    refreshEnglishPracticeSummary();
  }, [refreshEnglishPracticeSummary]);
  const viewModel = useStudentDashboardViewModel({
    user,
    snapshot,
    englishPracticeRecommendation: englishPracticeSummary.recommendation,
  });
  const controller = useStudentDashboardController({
    user,
    learningPlan: viewModel.learningPlan,
    learningPreference: viewModel.learningPreference,
    planningBooks: viewModel.planningBooks,
    canGenerateAiPlan: viewModel.canGenerateAiPlan,
    onUserUpdate,
    refreshDashboard,
    updateLearningPlan,
    updateLearningPreference,
    removeMyBook,
  });

  const navigation = useDashboardSectionNavigation({
    isStudentMobileShell,
    hasPrimaryMission: Boolean(viewModel.primaryMission),
    hasActionableWriting: viewModel.hasActionableWriting,
    canShowWritingSection: viewModel.canShowWritingSection,
    hasCoachNotification: Boolean(viewModel.latestCoachNotification),
  });

  const todayTaskIntent = React.useMemo(() => createTodayFocusTaskIntent(), []);
  const weaknessTaskIntent = React.useMemo(
    () => createWeaknessTaskIntent(viewModel.topWeakness),
    [viewModel.topWeakness],
  );
  const missionTaskIntent = React.useMemo(
    () => (
      viewModel.primaryMission?.nextTaskIntent
      || (viewModel.primaryMission ? createMissionTaskIntent(viewModel.primaryMission) : null)
    ),
    [viewModel.primaryMission],
  );
  const [localPracticeLane, setLocalPracticeLane] = React.useState<FocusedPracticeLane | null>(null);
  const selectedPracticeLane = activePracticeLane !== undefined ? activePracticeLane : localPracticeLane;

  const handlePracticeLaneSelect = React.useCallback((lane: FocusedPracticeLane) => {
    setLocalPracticeLane(lane);
    onOpenPracticeLane(lane);
  }, [onOpenPracticeLane]);

  const handlePracticeLaneClose = React.useCallback(() => {
    setLocalPracticeLane(null);
    refreshEnglishPracticeSummary();
    onClosePracticeLane?.();
  }, [onClosePracticeLane, refreshEnglishPracticeSummary]);

  const handlePracticeVocabularyStart = React.useCallback(() => {
    if (viewModel.hasStudyBooks) {
      onStartTask(todayTaskIntent);
      return;
    }
    controller.setShowCreateModal(true);
  }, [controller, onStartTask, todayTaskIntent, viewModel.hasStudyBooks]);

  const handleSubmitCommercialRequest = React.useCallback(async (payload: CommercialRequestPayload) => {
    await submitCommercialRequest(payload);
    await refreshDashboard();
  }, [refreshDashboard]);

  const handleLearningRouteSelect = React.useCallback(async (routeId: StudentDashboardLearningRouteId) => {
    if (routeId === 'today') {
      if (viewModel.hasStudyBooks) {
        onStartTask(todayTaskIntent);
        return;
      }
      controller.setShowCreateModal(true);
      return;
    }

    if (routeId === 'mission') {
      const mission = viewModel.primaryMission;
      if (!mission) return;
      if (mission.assignmentId) {
        try {
          await workspaceService.updateMissionProgress(mission.assignmentId, MissionProgressEventType.OPENED);
        } catch (missionError) {
          console.error(missionError);
        }
      }
      if (mission.nextActionType === MissionNextActionType.OPEN_PLAN) {
        controller.setShowPlanEditModal(true);
        return;
      }
      if (mission.nextActionType === MissionNextActionType.OPEN_WRITING && viewModel.canShowWritingSection) {
        navigation.scrollToSection(navigation.writingSectionRef);
        return;
      }
      if (mission.nextActionType === MissionNextActionType.OPEN_WRITING) {
        controller.setShowPlanEditModal(true);
        return;
      }
      if (!viewModel.hasStudyBooks) {
        controller.setShowCreateModal(true);
        return;
      }
      if (missionTaskIntent) {
        onStartTask(missionTaskIntent);
        return;
      }
      navigation.scrollToSection(navigation.missionSectionRef);
      return;
    }

    if (routeId === 'weakness') {
      if (viewModel.topWeakness?.recommendedActionType === RecommendedActionType.OPEN_PLAN) {
        controller.setShowPlanEditModal(true);
        return;
      }
      if (viewModel.hasStudyBooks) {
        onStartTask(weaknessTaskIntent);
        return;
      }
      controller.setShowCreateModal(true);
      return;
    }

    if (routeId === 'englishPractice') {
      handlePracticeLaneSelect(viewModel.practiceRecommendation.lane);
      return;
    }

    if (routeId === 'writing') {
      navigation.scrollToSection(navigation.writingSectionRef);
    }
  }, [
    controller,
    handlePracticeLaneSelect,
    missionTaskIntent,
    navigation,
    onStartTask,
    todayTaskIntent,
    viewModel.hasStudyBooks,
    viewModel.canShowWritingSection,
    viewModel.primaryMission,
    viewModel.practiceRecommendation.lane,
    viewModel.topWeakness,
    weaknessTaskIntent,
  ]);

  if (controller.showOnboarding) {
    return (
      <Onboarding
        user={user}
        isRetake
        historySummary={`現在レベル: ${user.englishLevel}, XP: ${user.stats?.xp}, 学年・属性: ${GRADE_LABELS[user.grade || UserGrade.ADULT]}`}
        onComplete={(updated) => {
          onUserUpdate(updated);
          controller.setShowOnboarding(false);
          refreshDashboard();
        }}
        onCancel={() => {
          controller.setShowOnboarding(false);
          controller.setShowSettingsModal(true);
        }}
      />
    );
  }

  if (loading && viewModel.planningBooks.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-medace-500">
        <Loader2 className="mb-2 h-10 w-10 animate-spin" />
        <p className="text-sm font-medium">学習データを読み込んでいます</p>
      </div>
    );
  }

  return (
    <div
      data-testid="student-dashboard"
      className={`relative flex flex-col animate-in fade-in duration-500 md:gap-8 md:pb-20 ${
        isStudentMobileShell ? 'gap-4 pb-28' : 'gap-5 pb-24'
      }`}
    >
      {controller.pageNotice && (
        <div className={`sticky z-40 rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm ${
          isStudentMobileShell ? 'top-[calc(0.35rem+var(--safe-top))]' : 'top-[calc(0.75rem+var(--safe-top))]'
        } ${
          controller.pageNotice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.pageNotice.message}
        </div>
      )}

      <StudentDashboardModals
        user={user}
        announcementFeed={announcementFeed}
        controller={controller}
        viewModel={viewModel}
        isMobileViewport={isMobileViewport}
        onUserUpdate={onUserUpdate}
        onSubmitCommercialRequest={handleSubmitCommercialRequest}
      />

      {!selectedPracticeLane && (
        <StudentLearningLaunchPanel
          cards={viewModel.learningRouteCards}
          onSelectRoute={(routeId) => {
            void handleLearningRouteSelect(routeId);
          }}
        />
      )}

      <div
        ref={navigation.englishPracticeSectionRef}
        data-testid="dashboard-english-practice-entry"
        className={selectedPracticeLane ? 'order-2 min-w-0' : 'order-3 min-w-0'}
        style={navigation.mobileAnchorStyle}
      >
        {selectedPracticeLane ? (
          <DashboardPracticeFocus
            user={user}
            lane={selectedPracticeLane}
            onSelectLane={handlePracticeLaneSelect}
            onClose={handlePracticeLaneClose}
            onStartVocabulary={handlePracticeVocabularyStart}
          />
        ) : (
          <DashboardPracticeDock
            recommendation={viewModel.practiceRecommendation}
            onSelectLane={handlePracticeLaneSelect}
          />
        )}
      </div>

      {!selectedPracticeLane && (
        <StudentDashboardSections
          user={user}
          announcementFeed={announcementFeed}
          controller={controller}
          viewModel={viewModel}
          isStudentMobileShell={isStudentMobileShell}
          navigation={navigation}
          onSelectBook={onSelectBook}
          onSelectLearningRoute={(routeId) => {
            void handleLearningRouteSelect(routeId);
          }}
          onStartTask={onStartTask}
          onSubmitCommercialRequest={handleSubmitCommercialRequest}
        />
      )}
    </div>
  );
};

export default Dashboard;
