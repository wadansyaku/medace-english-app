import React from 'react';
import {
  ArrowRight,
  Flag,
  GraduationCap,
  Languages,
  LibraryBig,
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
} from '../hooks/useStudentDashboardViewModel';
import { submitCommercialRequest } from '../services/commercial';
import { workspaceService } from '../services/workspace';
import type { CommercialRequestPayload } from '../contracts/storage';
import {
  createMissionTaskIntent,
  createTodayFocusTaskIntent,
  createWeaknessTaskIntent,
} from '../shared/learningTask';
import StudentDashboardModals from './dashboard/StudentDashboardModals';
import StudentDashboardSections from './dashboard/StudentDashboardSections';

interface DashboardProps {
  user: UserProfile;
  announcementFeed: AnnouncementFeedController;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onStartTask: (task: LearningTaskIntent) => void;
  onOpenEnglishPractice: () => void;
  onUserUpdate: (user: UserProfile) => void;
}

const LEARNING_ROUTE_ICON: Record<StudentDashboardLearningRouteId, LucideIcon> = {
  today: Play,
  mission: Flag,
  weakness: Target,
  writing: NotebookPen,
};

const LEARNING_ROUTE_TONE: Record<StudentDashboardLearningRouteCard['tone'], string> = {
  primary: 'border-medace-200 bg-medace-50 text-medace-900',
  mission: 'border-sky-200 bg-sky-50 text-sky-900',
  weakness: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  writing: 'border-violet-200 bg-violet-50 text-violet-900',
};

interface EnglishPracticeEntryPanelProps {
  onOpenEnglishPractice: () => void;
}

const EnglishPracticeEntryPanel: React.FC<EnglishPracticeEntryPanelProps> = ({
  onOpenEnglishPractice,
}) => (
  <section
    data-testid="dashboard-english-practice-entry"
    className="order-3 overflow-hidden rounded-lg border border-orange-200 bg-white shadow-sm"
  >
    <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="bg-medace-600 px-5 py-5 text-white md:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black text-white/72">
          英語演習
        </div>
        <h2 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">今日やることは1つだけ</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-white/78">
          単語テストとは別に、文法・和訳・長文から今必要な演習を選んで始めます。
        </p>
        <button
          type="button"
          data-testid="dashboard-open-english-practice"
          onClick={onOpenEnglishPractice}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-black text-medace-900 transition-colors hover:bg-orange-50"
        >
          演習を始める <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 px-5 py-5 md:grid-cols-3 md:px-6">
        {[
          { icon: GraduationCap, title: '文法演習', body: '参考書型の範囲を複数選択し、ランダムにも固定にもできます。' },
          { icon: Languages, title: '和訳', body: '文法範囲を選ばず、英文全体を読む力を受験答案として鍛えます。' },
          { icon: LibraryBig, title: '長文読解', body: '短い英文から、内容一致・要旨・根拠探しまで進めます。' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-lg border border-orange-100 bg-orange-50/55 px-4 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-medace-700 shadow-sm">
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-sm font-black text-slate-950">{item.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

interface StudentLearningLaunchPanelProps {
  cards: StudentDashboardLearningRouteCard[];
  isMobileCompact: boolean;
  onSelectRoute: (routeId: StudentDashboardLearningRouteId) => void;
}

const StudentLearningLaunchPanel: React.FC<StudentLearningLaunchPanelProps> = ({
  cards,
  isMobileCompact,
  onSelectRoute,
}) => {
  const orderedCards = React.useMemo(
    () => [...cards].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary)),
    [cards],
  );

  return (
    <section data-testid="dashboard-learning-launch-panel" className="order-2 min-w-0">
      <div className="mb-3 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-400">開始</p>
          <h2 className="text-xl font-black text-slate-950">次に始める場所</h2>
        </div>
        <p className="text-sm font-medium text-slate-500">重要タスクを一列で確認</p>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {orderedCards.map((card) => {
          const Icon = LEARNING_ROUTE_ICON[card.id];
          const isPrimary = card.isPrimary;
          return (
            <article
              key={card.id}
              data-testid={`dashboard-learning-route-${card.id}`}
              aria-current={isPrimary ? 'step' : undefined}
              className={`flex min-w-[78vw] flex-col rounded-lg border p-4 shadow-sm sm:min-w-0 ${
                isPrimary
                  ? `${LEARNING_ROUTE_TONE[card.tone]} shadow-[0_12px_28px_rgba(15,23,42,0.10)]`
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className={`rounded-lg border p-2 ${
                  isPrimary ? 'border-white/70 bg-white/70' : LEARNING_ROUTE_TONE[card.tone]
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  isPrimary ? 'border-white/70 bg-white/70' : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  {card.stateLabel}
                </span>
              </div>

              <div className="mt-3 min-w-0">
                <div className="text-sm font-black">{card.title}</div>
                <div className={`mt-1 min-w-0 font-black ${isMobileCompact ? 'text-lg' : 'text-xl'}`}>
                  {card.metricLabel}
                </div>
                <p className={`mt-2 min-h-[2.6rem] text-sm leading-relaxed ${
                  isPrimary ? 'text-slate-700' : 'text-slate-600'
                }`}>
                  {card.body}
                </p>
              </div>

              <button
                type="button"
                data-testid={`dashboard-learning-route-${card.id}-cta`}
                onClick={() => onSelectRoute(card.id)}
                className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
                  isPrimary
                    ? 'bg-slate-950 text-white hover:bg-slate-800'
                    : 'border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 whitespace-normal leading-snug">{card.ctaLabel}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
};

const Dashboard: React.FC<DashboardProps> = ({
  user,
  announcementFeed,
  onSelectBook,
  onStartTask,
  onOpenEnglishPractice,
  onUserUpdate,
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
  const viewModel = useStudentDashboardViewModel({ user, snapshot });
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

    if (routeId === 'writing') {
      navigation.scrollToSection(navigation.writingSectionRef);
    }
  }, [
    controller,
    missionTaskIntent,
    navigation,
    onStartTask,
    todayTaskIntent,
    viewModel.hasStudyBooks,
    viewModel.canShowWritingSection,
    viewModel.primaryMission,
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
        <p className="text-sm font-medium">学習データを解析中...</p>
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

      <StudentLearningLaunchPanel
        cards={viewModel.learningRouteCards}
        isMobileCompact={isStudentMobileShell}
        onSelectRoute={(routeId) => {
          void handleLearningRouteSelect(routeId);
        }}
      />

      <EnglishPracticeEntryPanel onOpenEnglishPractice={onOpenEnglishPractice} />

      <StudentDashboardSections
        user={user}
        announcementFeed={announcementFeed}
        controller={controller}
        viewModel={viewModel}
        isStudentMobileShell={isStudentMobileShell}
        navigation={navigation}
        onSelectBook={onSelectBook}
        onStartTask={onStartTask}
        onSubmitCommercialRequest={handleSubmitCommercialRequest}
      />
    </div>
  );
};

export default Dashboard;
