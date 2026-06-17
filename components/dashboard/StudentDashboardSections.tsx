import React from 'react';

import {
  MissionNextActionType,
  MissionProgressEventType,
  RECOMMENDED_ACTION_TYPE_LABELS,
  RecommendedActionType,
  UserGrade,
  type LearningTaskIntent,
  type UserProfile,
} from '../../types';
import type { AnnouncementFeedController } from '../../hooks/useAnnouncementFeed';
import type { useDashboardSectionNavigation } from '../../hooks/useDashboardSectionNavigation';
import type { useStudentDashboardController } from '../../hooks/useStudentDashboardController';
import type {
  StudentDashboardLearningRouteId,
  StudentDashboardTaskId,
  useStudentDashboardViewModel,
} from '../../hooks/useStudentDashboardViewModel';
import type { CommercialRequestPayload } from '../../contracts/storage';
import { workspaceService } from '../../services/workspace';
import StudyCompanion from '../StudyCompanion';
import MotivationBoard from '../MotivationBoard';
import WritingStudentSection from '../WritingStudentSection';
import DashboardAccountSection from './DashboardAccountSection';
import DashboardAnnouncementSection from './DashboardAnnouncementSection';
import DashboardCoachSection from './DashboardCoachSection';
import DashboardHeroSection from './DashboardHeroSection';
import DashboardLibrarySection from './DashboardLibrarySection';
import DashboardMobileQuickNav, { type DashboardMobileQuickNavItem } from './DashboardMobileQuickNav';
import DashboardMissionSection from './DashboardMissionSection';
import DashboardPlanSection from './DashboardPlanSection';
import DashboardProgressSection from './DashboardProgressSection';
import DashboardTaskOverviewRail from './DashboardTaskOverviewRail';
import DashboardWeaknessSection from './DashboardWeaknessSection';
import {
  createCoachTaskIntent,
  createMissionTaskIntent,
  createTodayFocusTaskIntent,
  createWeaknessTaskIntent,
} from '../../shared/learningTask';

type StudentDashboardController = ReturnType<typeof useStudentDashboardController>;
type StudentDashboardViewModel = ReturnType<typeof useStudentDashboardViewModel>;
type StudentDashboardSectionNavigation = ReturnType<typeof useDashboardSectionNavigation>;
type FocusedPracticeLane = 'grammar' | 'translation' | 'reading' | 'writing';

interface StudentDashboardSectionsProps {
  user: UserProfile;
  announcementFeed: AnnouncementFeedController;
  controller: StudentDashboardController;
  viewModel: StudentDashboardViewModel;
  isStudentMobileShell: boolean;
  navigation: StudentDashboardSectionNavigation;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onSelectLearningRoute: (routeId: StudentDashboardLearningRouteId) => void;
  onSelectPracticeLane: (lane: FocusedPracticeLane) => void;
  onStartTask: (task: LearningTaskIntent) => void;
  onSubmitCommercialRequest: (payload: CommercialRequestPayload) => Promise<void>;
}

export const StudentDashboardSections: React.FC<StudentDashboardSectionsProps> = ({
  user,
  announcementFeed,
  controller,
  viewModel,
  isStudentMobileShell,
  navigation,
  onSelectBook,
  onSelectLearningRoute,
  onSelectPracticeLane,
  onStartTask,
  onSubmitCommercialRequest,
}) => {
  const coachActionType = viewModel.coachRecommendedActionType;
  const primaryMission = viewModel.primaryMission;
  const topWeakness = viewModel.weaknessProfile?.topWeaknesses[0] || null;
  const todayPreferredBookIds = React.useMemo(
    () => viewModel.plannedBooks.map((book) => book.id),
    [viewModel.plannedBooks],
  );
  const todayTaskIntent = React.useMemo(
    () => createTodayFocusTaskIntent({ preferredBookIds: todayPreferredBookIds }),
    [todayPreferredBookIds],
  );
  const weaknessTaskIntent = React.useMemo(() => createWeaknessTaskIntent(topWeakness), [topWeakness]);
  const missionTaskIntent = React.useMemo(
    () => (primaryMission?.nextTaskIntent || (primaryMission ? createMissionTaskIntent(primaryMission) : null)),
    [primaryMission],
  );
  const coachTaskIntent = React.useMemo(() => (
    createCoachTaskIntent({
      recommendedActionType: coachActionType,
      hasLearningPlan: Boolean(viewModel.learningPlan),
    })
  ), [coachActionType, viewModel.learningPlan]);

  const handlePrimaryMissionAction = React.useCallback(async () => {
    if (primaryMission?.assignmentId) {
      try {
        await workspaceService.updateMissionProgress(primaryMission.assignmentId, MissionProgressEventType.OPENED);
      } catch (missionError) {
        console.error(missionError);
      }
    }

    if (primaryMission?.nextActionType === MissionNextActionType.OPEN_PLAN) {
      controller.setShowPlanEditModal(true);
      return;
    }
    if (primaryMission?.nextActionType === MissionNextActionType.OPEN_WRITING) {
      if (viewModel.canShowWritingSection) {
        navigation.scrollToSection(navigation.writingSectionRef);
        return;
      }
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
    controller.setShowPlanEditModal(true);
  }, [
    controller,
    missionTaskIntent,
    navigation,
    onStartTask,
    primaryMission,
    viewModel.canShowWritingSection,
    viewModel.hasStudyBooks,
  ]);

  const handleCoachPrimaryAction = React.useCallback(() => {
    if (coachActionType === RecommendedActionType.OPEN_PLAN) {
      controller.setShowPlanEditModal(true);
      return;
    }
    if (coachTaskIntent) {
      onStartTask(coachTaskIntent);
    }
  }, [coachActionType, coachTaskIntent, controller, onStartTask]);

  const scrollToDashboardElement = React.useCallback((testId: string) => {
    const element = document.querySelector(`[data-testid="${testId}"]`);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);
  const scrollToDashboardElementAfterRender = React.useCallback((testId: string) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => scrollToDashboardElement(testId));
      return;
    }
    scrollToDashboardElement(testId);
  }, [scrollToDashboardElement]);

  const handlePrimaryTaskAction = React.useCallback(() => {
    const primaryTask = viewModel.primaryTask;
    if (!primaryTask) {
      onSelectLearningRoute(viewModel.primaryLearningRouteId);
      return;
    }

    if (primaryTask.id === 'coach') {
      handleCoachPrimaryAction();
      return;
    }
    if (primaryTask.id === 'mission') {
      void handlePrimaryMissionAction();
      return;
    }
    if (primaryTask.id === 'writing' && viewModel.hasActionableWriting) {
      void handlePrimaryMissionAction();
      return;
    }

    if (primaryTask.routeId) {
      onSelectLearningRoute(primaryTask.routeId);
      return;
    }

    if (primaryTask.id === 'plan') {
      controller.setShowPlanEditModal(true);
      return;
    }
    if (primaryTask.id === 'library') {
      navigation.scrollToSection(navigation.librarySectionRef);
      return;
    }
    if (primaryTask.id === 'progress') {
      controller.setShowProgressDetails(true);
      scrollToDashboardElementAfterRender('dashboard-progress-section');
      return;
    }
    if (primaryTask.id === 'account') {
      controller.setShowAccountDetails(true);
      scrollToDashboardElementAfterRender('dashboard-account-section');
      return;
    }

    onSelectLearningRoute(viewModel.primaryLearningRouteId);
  }, [
    controller,
    handleCoachPrimaryAction,
    handlePrimaryMissionAction,
    navigation,
    onSelectLearningRoute,
    scrollToDashboardElementAfterRender,
    viewModel.hasActionableWriting,
    viewModel.primaryLearningRouteId,
    viewModel.primaryTask,
  ]);

  const weaknessSection = (
    <div
      key="weakness"
      ref={navigation.weaknessSectionRef}
      data-testid="dashboard-weakness-anchor"
      style={navigation.mobileAnchorStyle}
    >
      <DashboardWeaknessSection
        weaknessProfile={viewModel.weaknessProfile}
        onStartFocusQuest={() => {
          if (viewModel.hasStudyBooks) {
            onStartTask(weaknessTaskIntent);
            return;
          }
          controller.setShowCreateModal(true);
        }}
        onOpenPlan={() => controller.setShowPlanEditModal(true)}
      />
    </div>
  );

  const missionSection = primaryMission ? (
    <div
      key="mission"
      ref={navigation.missionSectionRef}
      data-testid="dashboard-mission-anchor"
      style={navigation.mobileAnchorStyle}
    >
      <DashboardMissionSection
        mission={primaryMission}
        isCompact={isStudentMobileShell}
        onPrimaryAction={handlePrimaryMissionAction}
      />
    </div>
  ) : null;

  const writingSection = viewModel.canShowWritingSection ? (
    <div
      key="writing"
      ref={navigation.writingSectionRef}
      data-testid="dashboard-writing-anchor"
      style={navigation.mobileAnchorStyle}
    >
      <WritingStudentSection user={user} />
    </div>
  ) : null;

  const coachSection = viewModel.latestCoachNotification ? (
    <div
      key="coach"
      ref={navigation.coachSectionRef}
      data-testid="dashboard-coach-anchor"
      style={navigation.mobileAnchorStyle}
    >
      <DashboardCoachSection
        latestNotification={viewModel.latestCoachNotification}
        notifications={viewModel.coachNotifications}
        isCompact={isStudentMobileShell}
        primaryActionLabel={coachTaskIntent?.label || (coachActionType
          ? RECOMMENDED_ACTION_TYPE_LABELS[coachActionType]
          : null)}
        onPrimaryAction={coachActionType
          ? handleCoachPrimaryAction
          : null}
      />
    </div>
  ) : null;

  const planSection = (
    <div
      key="plan"
      ref={navigation.planSectionRef}
      data-testid="dashboard-plan-anchor"
      style={navigation.mobileAnchorStyle}
    >
      <DashboardPlanSection
        learningPlan={viewModel.learningPlan}
        learningPreference={viewModel.learningPreference}
        preferenceSummary={viewModel.preferenceSummary}
        plannedBooks={viewModel.plannedBooks}
        canGenerateAiPlan={viewModel.canGenerateAiPlan}
        generatingPlan={controller.generatingPlan}
        hasStudyBooks={viewModel.hasStudyBooks}
        isCompact={isStudentMobileShell}
        onEditPlan={() => controller.setShowPlanEditModal(true)}
        onGeneratePlan={controller.handleGeneratePlan}
      />
    </div>
  );

  const librarySection = (
    <div
      key="library"
      ref={navigation.librarySectionRef}
      data-testid="dashboard-library-section"
      style={navigation.mobileAnchorStyle}
    >
      <DashboardLibrarySection
        books={viewModel.books}
        myBooks={viewModel.myBooks}
        primaryRecommendedBook={viewModel.primaryRecommendedBook}
        secondaryRecommendedBooks={viewModel.secondaryRecommendedBooks}
        blockedOfficialBookCount={viewModel.blockedOfficialBookCount}
        progressMap={viewModel.progressMap}
        showLibrary={controller.showLibrary}
        isCompact={isStudentMobileShell}
        preparingExamplesBookId={controller.preparingExamplesBookId}
        onToggleLibrary={() => controller.setShowLibrary((previous) => !previous)}
        onOpenCreateModal={() => controller.setShowCreateModal(true)}
        onDelete={controller.handleDeleteBook}
        onPrepareExamples={controller.handlePrepareBookExamples}
        onSelect={onSelectBook}
      />
    </div>
  );

  const progressSection = (
    <div key="progress" data-testid="dashboard-progress-section">
      <DashboardProgressSection
        open={controller.showProgressDetails}
        activityLogs={viewModel.activityLogs}
        dailyGoal={viewModel.learningPlan?.dailyWordGoal}
        masteryDist={viewModel.masteryDist}
        isGameMode={viewModel.isGameMode}
        leaderboard={viewModel.leaderboard}
        todayCount={viewModel.todayCount}
        todayWordGoal={viewModel.todayWordGoal}
        todayProgressPercent={viewModel.todayProgressPercent}
        weekTotal={viewModel.weekTotal}
        weeklyGoal={viewModel.weeklyGoal}
        weeklyRemaining={viewModel.weeklyRemaining}
        currentStreak={user.stats?.currentStreak || 0}
        isCompact={isStudentMobileShell}
        onToggle={() => controller.setShowProgressDetails((previous) => !previous)}
      />
    </div>
  );

  const accountSection = viewModel.canShowAccountDetails ? (
    <div key="account" data-testid="dashboard-account-section">
      <DashboardAccountSection
        open={controller.showAccountDetails}
        user={user}
        accountOverview={viewModel.accountOverview}
        commercialRequests={viewModel.commercialRequests}
        aiBudgetPercent={viewModel.aiBudgetPercent}
        aiUsageLabel={viewModel.aiUsageLabel}
        aiUsageCopy={viewModel.aiUsageCopy}
        plannedBookCount={viewModel.plannedBooks.length}
        coachNotificationCount={viewModel.coachNotifications.length}
        showAdSlots={viewModel.showAdSlots}
        isCompact={isStudentMobileShell}
        onSubmitCommercialRequest={onSubmitCommercialRequest}
        onToggle={() => controller.setShowAccountDetails((previous) => !previous)}
      />
    </div>
  ) : null;
  const announcementSection = !isStudentMobileShell ? (
    <div key="announcement" data-testid="dashboard-announcements-section">
      <DashboardAnnouncementSection feed={announcementFeed.feed} />
    </div>
  ) : null;
  const companionSection = !isStudentMobileShell && viewModel.isGameMode && viewModel.hasStudyBooks ? (
    <div key="companion" data-testid="dashboard-companion-section">
      <StudyCompanion
        user={user}
        dueCount={viewModel.dueCount}
        todayCount={viewModel.todayCount}
        weekTotal={viewModel.weekTotal}
        dailyGoal={viewModel.todayWordGoal}
        weeklyGoal={viewModel.weeklyGoal}
        stabilizedWords={viewModel.stabilizedWords}
        onStartQuest={() => onStartTask(todayTaskIntent)}
      />
    </div>
  ) : null;
  const motivationSection = !isStudentMobileShell && viewModel.motivationSnapshot ? (
    <div key="motivation" data-testid="dashboard-motivation-section">
      <MotivationBoard snapshot={viewModel.motivationSnapshot} isCompact={isStudentMobileShell} />
    </div>
  ) : null;

  const sectionByTaskId: Partial<Record<StudentDashboardTaskId, React.ReactNode>> = {
    coach: coachSection,
    mission: missionSection,
    weakness: weaknessSection,
    writing: writingSection,
  };
  const usedPrimarySectionIds = new Set<StudentDashboardTaskId>();
  const orderedPrimaryTasks = [
    ...(viewModel.primaryTask ? [viewModel.primaryTask] : []),
    ...viewModel.urgentTasks,
    ...viewModel.supportingTasks,
  ];
  const primarySupportSections = orderedPrimaryTasks.flatMap((task) => {
    const section = sectionByTaskId[task.id];
    if (!section || usedPrimarySectionIds.has(task.id)) return [];
    usedPrimarySectionIds.add(task.id);
    return [section];
  });
  const sectionByReferenceTaskId: Partial<Record<StudentDashboardTaskId, React.ReactNode>> = {
    weakness: weaknessSection,
    writing: writingSection,
    plan: planSection,
    library: librarySection,
    progress: progressSection,
    announcements: announcementSection,
    companion: companionSection,
    motivation: motivationSection,
    account: isStudentMobileShell ? null : accountSection,
  };
  const referenceShortcutTasks = viewModel.referenceTasks.filter((task) => (
    Boolean(sectionByReferenceTaskId[task.id])
      && !usedPrimarySectionIds.has(task.id)
  ));
  const usedReferenceSectionIds = new Set<StudentDashboardTaskId>();
  const referenceSections = viewModel.referenceTasks.flatMap((task) => {
    const section = sectionByReferenceTaskId[task.id];
    if (!section || usedPrimarySectionIds.has(task.id) || usedReferenceSectionIds.has(task.id)) return [];
    usedReferenceSectionIds.add(task.id);
    return [section];
  });
  const hasReferenceSections = referenceSections.length > 0;

  const getTaskLauncherKind = (taskId: StudentDashboardTaskId): DashboardMobileQuickNavItem['kind'] => {
    switch (taskId) {
      case 'englishPractice':
        return 'englishPractice';
      case 'mission':
        return 'mission';
      case 'writing':
        return 'writing';
      case 'coach':
        return 'coach';
      case 'plan':
        return 'plan';
      case 'library':
        return 'library';
      case 'weakness':
        return 'weakness';
      case 'today':
      default:
        return 'today';
    }
  };

  const scrollToTaskSection = (taskId: StudentDashboardTaskId) => {
    switch (taskId) {
      case 'coach':
        navigation.scrollToSection(navigation.coachSectionRef);
        return;
      case 'mission':
        navigation.scrollToSection(navigation.missionSectionRef);
        return;
      case 'writing':
        navigation.scrollToSection(navigation.writingSectionRef);
        return;
      case 'weakness':
        navigation.scrollToSection(navigation.weaknessSectionRef);
        return;
      case 'plan':
        navigation.scrollToSection(navigation.planSectionRef);
        return;
      case 'library':
        navigation.scrollToSection(navigation.librarySectionRef);
        return;
      case 'englishPractice':
        onSelectPracticeLane(viewModel.practiceRecommendation.lane);
        return;
      case 'progress':
        controller.setShowProgressDetails(true);
        scrollToDashboardElementAfterRender('dashboard-progress-section');
        return;
      case 'account':
        controller.setShowAccountDetails(true);
        scrollToDashboardElementAfterRender('dashboard-account-section');
        return;
      case 'announcements':
        scrollToDashboardElement('dashboard-announcements-section');
        return;
      case 'companion':
        scrollToDashboardElement('dashboard-companion-section');
        return;
      case 'motivation':
        scrollToDashboardElement('dashboard-motivation-section');
        return;
      case 'today':
        onSelectLearningRoute('today');
        return;
      default:
        return;
    }
  };

  const runOverviewTaskAction = (taskId: StudentDashboardTaskId) => {
    const task = viewModel.allTasks.find((candidate) => candidate.id === taskId);
    if (taskId === 'coach') {
      handleCoachPrimaryAction();
      return;
    }
    if (taskId === 'mission') {
      void handlePrimaryMissionAction();
      return;
    }
    if (task?.routeId) {
      onSelectLearningRoute(task.routeId);
      return;
    }
    if (taskId === 'plan') {
      controller.setShowPlanEditModal(true);
      return;
    }
    if (taskId === 'progress') {
      scrollToTaskSection(taskId);
      return;
    }
    if (taskId === 'account') {
      scrollToTaskSection(taskId);
      return;
    }
    scrollToTaskSection(taskId);
  };

  const contextualTask = [
    ...viewModel.urgentTasks,
    ...viewModel.supportingTasks,
  ].find((task) => (
    task.id !== viewModel.primaryTask?.id
      && task.id !== 'today'
      && task.id !== 'englishPractice'
      && Boolean(sectionByTaskId[task.id] || task.id === 'plan')
  )) || viewModel.referenceTasks.find((task) => task.id === 'weakness');

  const contextualMobileAction: DashboardMobileQuickNavItem = contextualTask
    ? {
        id: contextualTask.id,
        label: contextualTask.mobileLabel,
        kind: getTaskLauncherKind(contextualTask.id),
        active: navigation.activeQuickNavId === contextualTask.id,
        onClick: () => scrollToTaskSection(contextualTask.id),
      }
    : {
        id: 'weakness',
        label: '弱点',
        kind: 'weakness',
        active: navigation.activeQuickNavId === 'weakness',
        onClick: () => navigation.scrollToSection(navigation.weaknessSectionRef),
      };

  const primaryLauncherId = viewModel.primaryTask?.id || 'today';
  const primaryQuickNavId = primaryLauncherId === 'englishPractice' ? 'english-practice' : primaryLauncherId;
  const dedupeLauncherItems = (items: DashboardMobileQuickNavItem[]): DashboardMobileQuickNavItem[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const mobileLauncherItems: DashboardMobileQuickNavItem[] = dedupeLauncherItems([
    {
      id: primaryQuickNavId,
      label: viewModel.primaryTask?.mobileLabel || '始める',
      kind: viewModel.primaryTask ? getTaskLauncherKind(viewModel.primaryTask.id) : 'today',
      active: navigation.activeQuickNavId === primaryQuickNavId || navigation.activeQuickNavId === 'today',
      onClick: handlePrimaryTaskAction,
    },
    contextualMobileAction,
    {
      id: 'library',
      label: '教材',
      kind: 'library' as const,
      active: navigation.activeQuickNavId === 'library',
      onClick: () => navigation.scrollToSection(navigation.librarySectionRef),
    },
  ]);
  const heroPrimaryLearningRouteId = viewModel.primaryTask?.id === 'coach'
    ? 'today'
    : viewModel.primaryLearningRouteId;
  const hasPrimarySupportSections = primarySupportSections.length > 0;
  return (
    <>
      <div
        ref={navigation.heroSectionRef}
        data-testid="dashboard-hero-section"
        className="order-1"
        style={navigation.mobileAnchorStyle}
      >
        <DashboardHeroSection
          grade={user.grade || UserGrade.ADULT}
          englishLevel={user.englishLevel}
          heroTitle={viewModel.heroTitle}
          heroCopy={viewModel.heroCopy}
          heroEyebrow={viewModel.heroEyebrow}
          heroMetrics={viewModel.heroMetrics}
          primaryRecommendedBookTitle={viewModel.primaryRecommendedBook?.title || null}
          primaryRecommendedBookWordCount={viewModel.primaryRecommendedBook?.wordCount}
          preferenceSummary={viewModel.preferenceSummary}
          hasStudyBooks={viewModel.hasStudyBooks}
          questButtonLabel={viewModel.questButtonLabel}
          learningPlan={viewModel.learningPlan}
          generatingPlan={controller.generatingPlan}
          remainingWords={viewModel.remainingWords}
          dueCount={viewModel.dueCount}
          estimatedMinutes={viewModel.estimatedMinutes}
          todayCount={viewModel.todayCount}
          todayWordGoal={viewModel.todayWordGoal}
          todayProgressPercent={viewModel.todayProgressPercent}
          primaryLearningRouteId={heroPrimaryLearningRouteId}
          practiceRecommendation={viewModel.practiceRecommendation}
          gameLeagueBadge={viewModel.isGameMode ? viewModel.userLeague : undefined}
          isMobileCompact={isStudentMobileShell}
          practiceAnchorRef={navigation.englishPracticeSectionRef}
          practiceAnchorStyle={navigation.mobileAnchorStyle}
          onOpenSettings={() => controller.setShowSettingsModal(true)}
          onOpenRecommendedCourse={viewModel.primaryRecommendedBook
            ? () => onSelectBook(viewModel.primaryRecommendedBook!.id, 'study')
            : undefined}
          onStartQuest={handlePrimaryTaskAction}
          onSelectPracticeLane={onSelectPracticeLane}
          onOpenPlan={() => controller.setShowPlanEditModal(true)}
          onGeneratePlan={controller.handleGeneratePlan}
        />
      </div>

      <section
        data-testid="dashboard-smart-workspace"
        className={`order-2 grid min-w-0 gap-4 ${
          hasPrimarySupportSections ? 'xl:grid-cols-[minmax(0,0.68fr)_minmax(280px,0.32fr)]' : 'xl:grid-cols-1'
        }`}
      >
        {hasPrimarySupportSections && (
          <div data-testid="dashboard-primary-stack" className="grid min-w-0 content-start gap-4">
            <div className="flex min-w-0 items-center justify-between gap-3 px-1">
              <h2 className="text-sm font-black text-slate-950">今やること</h2>
              <span className="text-xs font-bold text-slate-400">優先順</span>
            </div>
            {primarySupportSections}
          </div>
        )}

        <aside data-testid="dashboard-reference-rail" className="grid min-w-0 content-start gap-4">
          <div className="flex min-w-0 items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-black text-slate-950">記録と教材</h2>
            <span className="text-xs font-bold text-slate-400">必要なときだけ</span>
          </div>
          <DashboardTaskOverviewRail
            primaryTask={viewModel.primaryTask}
            urgentTasks={viewModel.urgentTasks}
            supportingTasks={viewModel.supportingTasks}
            referenceTasks={referenceShortcutTasks}
            showPrimaryAction={false}
            onSelectTask={runOverviewTaskAction}
            onSelectReferenceTask={scrollToTaskSection}
            onStartPrimary={handlePrimaryTaskAction}
          />
        </aside>
      </section>

      {hasReferenceSections && (
        <section
          data-testid="dashboard-reference-sections"
          className="order-3 grid min-w-0 gap-4"
        >
          {referenceSections}
        </section>
      )}

      {isStudentMobileShell && (
        <DashboardMobileQuickNav
          items={mobileLauncherItems}
        />
      )}
    </>
  );
};

export default StudentDashboardSections;
