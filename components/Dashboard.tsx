import React from 'react';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import {
  GRADE_LABELS,
  MissionProgressEventType,
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
} from '../hooks/useStudentDashboardViewModel';
import type { StudentDashboardCommand, StudentDashboardSectionId, StudentDashboardTaskId } from '../shared/studentDashboardCommand';
import { workspaceService } from '../services/workspace';
import {
  loadEnglishPracticeProgress,
  summarizeEnglishPracticeProgress,
} from '../utils/englishPracticeProgress';
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
}

const isFocusedPracticeLane = (lane: string): lane is FocusedPracticeLane => (
  lane === 'grammar' || lane === 'translation' || lane === 'reading' || lane === 'writing'
);

const DashboardPracticeFocus: React.FC<DashboardPracticeFocusProps> = ({
  user,
  lane,
  onSelectLane,
  onClose,
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
    error: loadError,
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

  const openDashboardSection = React.useCallback((sectionId: StudentDashboardSectionId) => {
    if (sectionId === 'progress') controller.setShowProgressDetails(true);
    if (sectionId === 'account') controller.setShowAccountDetails(true);
    const refs = {
      mission: navigation.missionSectionRef,
      writing: navigation.writingSectionRef,
      coach: navigation.coachSectionRef,
      weakness: navigation.weaknessSectionRef,
      plan: navigation.planSectionRef,
      library: navigation.librarySectionRef,
    };
    const sectionRef = refs[sectionId as keyof typeof refs];
    if (sectionRef) {
      navigation.scrollToSection(sectionRef);
      return;
    }
    window.requestAnimationFrame(() => {
      const element = document.querySelector(`[data-testid="dashboard-${sectionId}-section"]`);
      if (element instanceof HTMLElement) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [controller, navigation]);

  const executeDashboardCommand = React.useCallback((command: StudentDashboardCommand) => {
    // Opening a task is independent of the optional progress acknowledgement.
    if (command.missionAssignmentId) {
      void workspaceService.updateMissionProgress(command.missionAssignmentId, MissionProgressEventType.OPENED)
        .catch(() => undefined);
    }
    switch (command.type) {
      case 'start_learning':
        onStartTask(command.task);
        return;
      case 'create_book':
        controller.setShowCreateModal(true);
        return;
      case 'open_plan':
        controller.setShowPlanEditModal(true);
        return;
      case 'open_practice':
        handlePracticeLaneSelect(command.lane);
        return;
      case 'open_section':
        openDashboardSection(command.sectionId);
    }
  }, [controller, handlePracticeLaneSelect, onStartTask, openDashboardSection]);

  const handleTaskSelect = React.useCallback((taskId: StudentDashboardTaskId) => {
    const task = viewModel.allTasks.find((candidate) => candidate.id === taskId);
    if (task) executeDashboardCommand(task.command);
  }, [executeDashboardCommand, viewModel.allTasks]);

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

  if (loading && !snapshot) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-medace-500">
        <Loader2 className="mb-2 h-10 w-10 animate-spin" />
        <p className="text-sm font-medium">学習データを読み込んでいます</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <section data-testid="dashboard-load-error" role="alert" className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
        <AlertCircle className="h-9 w-9 text-slate-500" aria-hidden="true" />
        <h1 className="text-xl font-black text-slate-950">学習データを読み込めませんでした</h1>
        <p className="text-sm leading-relaxed text-slate-600">通信状況を確認して、もう一度読み込んでください。</p>
        <button type="button" onClick={() => void refreshDashboard()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-steady-action px-5 py-3 font-bold text-steady-on-action hover:bg-steady-action-hover">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> もう一度読み込む
        </button>
      </section>
    );
  }

  return (
    <div
      data-testid="student-dashboard"
      className={`relative flex min-w-0 flex-col overflow-x-hidden animate-in fade-in duration-500 md:gap-8 md:pb-20 ${
        isStudentMobileShell ? 'gap-4 pb-28' : 'gap-5 pb-24'
      }`}
    >
      {loadError === 'refresh' && (
        <div data-testid="dashboard-refresh-error" role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>最新の状態を確認できません。前回読み込んだ学習データを表示しています。</p>
          <button type="button" disabled={loading} onClick={() => void refreshDashboard()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 font-bold disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? '読み込み中' : '再読み込み'}
          </button>
        </div>
      )}
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
          onSelectTask={handleTaskSelect}
          onOpenSection={openDashboardSection}
          onSelectPracticeLane={handlePracticeLaneSelect}
        />
      )}
    </div>
  );
};

export default Dashboard;
