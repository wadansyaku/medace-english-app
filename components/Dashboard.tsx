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
  onUserUpdate: (user: UserProfile) => void;
  onOpenPracticeLane: (lane: FocusedPracticeLane) => void;
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

type FocusedPracticeLane = 'grammar' | 'translation' | 'reading' | 'writing';

interface DashboardPracticeDockProps {
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
    body: '範囲を絞って、文構造の弱点だけを確認します。',
    time: '3分',
    icon: Brain,
  },
  {
    id: 'translation',
    label: '和訳',
    title: '和訳を1セット',
    body: '英文全体を日本語に直し、答案としての精度を見ます。',
    time: '5分',
    icon: Languages,
  },
  {
    id: 'reading',
    label: '長文',
    title: '短い長文を読む',
    body: '根拠文を探しながら、内容一致と要旨を確認します。',
    time: '8分',
    icon: LibraryBig,
  },
  {
    id: 'writing',
    label: '英作文',
    title: '英検テーマで書く',
    body: 'Eメール・意見論述・要約を級別テーマで練習します。',
    time: '12分',
    icon: NotebookPen,
  },
];

const DashboardPracticeDock: React.FC<DashboardPracticeDockProps> = ({
  onSelectLane,
}) => (
  <section
    data-testid="dashboard-practice-dock"
    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
  >
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-black text-medace-600">練習</p>
        <h2 className="text-xl font-black text-slate-950">今日の練習</h2>
        <p className="mt-1 max-w-2xl text-sm font-bold leading-relaxed text-slate-600">
          ホームでは選ぶだけ。文法・和訳・長文・英作文は専用画面で進めます。
        </p>
      </div>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {PRACTICE_DOCK_OPTIONS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`dashboard-practice-lane-${item.id}`}
            onClick={() => onSelectLane(item.id)}
            className="min-h-[112px] rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-slate-800 transition-colors hover:border-medace-200 hover:bg-white"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-black">{item.label}</span>
              </div>
              <span className="shrink-0 rounded-full border border-white bg-white px-2 py-1 text-[11px] font-black text-slate-500">
                {item.time}
              </span>
            </div>
            <div className="mt-2 text-base font-black">{item.title}</div>
            <p className="mt-1 text-sm font-bold leading-relaxed text-slate-600">{item.body}</p>
          </button>
        );
      })}
    </div>
  </section>
);

const Dashboard: React.FC<DashboardProps> = ({
  user,
  announcementFeed,
  onSelectBook,
  onStartTask,
  onUserUpdate,
  onOpenPracticeLane,
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

      <div
        ref={navigation.englishPracticeSectionRef}
        data-testid="dashboard-english-practice-entry"
        className="order-3 min-w-0"
        style={navigation.mobileAnchorStyle}
      >
        <DashboardPracticeDock
          onSelectLane={onOpenPracticeLane}
        />
      </div>

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
