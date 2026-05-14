import React from 'react';
import {
  Loader2,
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
  type StudentDashboardLearningRouteId,
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

export type FocusedPracticeLane = 'grammar' | 'translation' | 'reading' | 'writing';

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

      {selectedPracticeLane ? (
        <div
          ref={navigation.englishPracticeSectionRef}
          data-testid="dashboard-english-practice-entry"
          className="order-2 min-w-0"
          style={navigation.mobileAnchorStyle}
        >
          <DashboardPracticeFocus
            user={user}
            lane={selectedPracticeLane}
            onSelectLane={handlePracticeLaneSelect}
            onClose={handlePracticeLaneClose}
            onStartVocabulary={handlePracticeVocabularyStart}
          />
        </div>
      ) : null}

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
          onSelectPracticeLane={handlePracticeLaneSelect}
          onStartTask={onStartTask}
          onSubmitCommercialRequest={handleSubmitCommercialRequest}
        />
      )}
    </div>
  );
};

export default Dashboard;
