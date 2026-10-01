import React from 'react';

import {
  RECOMMENDED_ACTION_TYPE_LABELS,
  UserGrade,
  type UserProfile,
} from '../../types';
import type { AnnouncementFeedController } from '../../hooks/useAnnouncementFeed';
import type { useDashboardSectionNavigation } from '../../hooks/useDashboardSectionNavigation';
import type { useStudentDashboardController } from '../../hooks/useStudentDashboardController';
import type {
  StudentDashboardTaskId,
  useStudentDashboardViewModel,
} from '../../hooks/useStudentDashboardViewModel';
import type { StudentDashboardSectionId } from '../../shared/studentDashboardCommand';
import StudyCompanion from '../StudyCompanion';
import MotivationBoard from '../MotivationBoard';
import WritingStudentSection from '../WritingStudentSection';
import DashboardAccountSection from './DashboardAccountSection';
import DashboardAnnouncementSection from './DashboardAnnouncementSection';
import DashboardCoachSection from './DashboardCoachSection';
import DashboardHeroSection from './DashboardHeroSection';
import DashboardStudyShortcuts from './DashboardStudyShortcuts';
import DashboardLibrarySection from './DashboardLibrarySection';
import DashboardMobileQuickNav, { type DashboardMobileQuickNavItem } from './DashboardMobileQuickNav';
import DashboardMissionSection from './DashboardMissionSection';
import DashboardPlanSection from './DashboardPlanSection';
import DashboardProgressSection from './DashboardProgressSection';
import DashboardTaskOverviewRail from './DashboardTaskOverviewRail';
import DashboardWeaknessSection from './DashboardWeaknessSection';


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
  onSelectTask: (taskId: StudentDashboardTaskId) => void;
  onOpenSection: (sectionId: StudentDashboardSectionId) => void;
  onSelectPracticeLane: (lane: FocusedPracticeLane) => void;
}

export const StudentDashboardSections: React.FC<StudentDashboardSectionsProps> = ({
  user,
  announcementFeed,
  controller,
  viewModel,
  isStudentMobileShell,
  navigation,
  onSelectBook,
  onSelectTask,
  onOpenSection,
  onSelectPracticeLane,
}) => {
  const coachActionType = viewModel.coachRecommendedActionType;
  const primaryMission = viewModel.primaryMission;
  const handlePrimaryMissionAction = () => onSelectTask('mission');
  const handleCoachPrimaryAction = () => onSelectTask('coach');
  const handlePrimaryTaskAction = () => onSelectTask(viewModel.primaryTask?.id || 'today');

  const weaknessSection = (
    <div
      key="weakness"
      ref={navigation.weaknessSectionRef}
      data-testid="dashboard-weakness-anchor"
      style={navigation.mobileAnchorStyle}
    >
      <DashboardWeaknessSection
        weaknessProfile={viewModel.weaknessProfile}
        onStartFocusQuest={() => onSelectTask('weakness')}
        onOpenPlan={() => onSelectTask('plan')}
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
        primaryActionLabel={coachActionType ? RECOMMENDED_ACTION_TYPE_LABELS[coachActionType] : null}
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
        onEditPlan={() => onSelectTask('plan')}
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
        onToggle={() => controller.setShowAccountDetails((previous) => !previous)}
      />
    </div>
  ) : null;
  const announcementSection = !isStudentMobileShell && announcementFeed.feed.announcements.length > 0 ? (
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
        onStartQuest={() => onSelectTask('today')}
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
    weakness: viewModel.hasStudyBooks ? weaknessSection : null,
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
    if (task.id === viewModel.primaryTask?.id) return [section];
    return [
      <details key={task.id} data-testid={`dashboard-task-details-${task.id}`} className="group min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-bold text-slate-800">
          <span>{task.title}</span>
          <span className="shrink-0 text-xs text-slate-500">{task.stateLabel}</span>
        </summary>
        <div className="mt-3">{section}</div>
      </details>,
    ];
  });
  const sectionByReferenceTaskId: Partial<Record<StudentDashboardTaskId, React.ReactNode>> = {
    weakness: viewModel.hasStudyBooks ? weaknessSection : null,
    writing: writingSection,
    plan: viewModel.hasStudyBooks ? planSection : null,
    library: librarySection,
    progress: viewModel.hasStudyBooks || viewModel.weekTotal > 0 ? progressSection : null,
    announcements: announcementSection,
    companion: companionSection,
    motivation: viewModel.hasStudyBooks ? motivationSection : null,
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
    if (taskId === 'today' || taskId === 'englishPractice') {
      onSelectTask(taskId);
      return;
    }
    onOpenSection(taskId);
  };

  const contextualTask = [
    ...viewModel.urgentTasks,
    ...viewModel.supportingTasks,
  ].find((task) => (
    task.id !== viewModel.primaryTask?.id
      && task.id !== 'today'
      && task.id !== 'englishPractice'
      && Boolean(sectionByTaskId[task.id] || task.id === 'plan')
  )) || viewModel.referenceTasks.find((task) => task.id === 'weakness' && viewModel.hasStudyBooks);

  const contextualMobileAction: DashboardMobileQuickNavItem = contextualTask
    ? {
        id: contextualTask.id,
        label: contextualTask.mobileLabel,
        kind: getTaskLauncherKind(contextualTask.id),
        active: navigation.activeQuickNavId === contextualTask.id,
        onClick: () => scrollToTaskSection(contextualTask.id),
      }
    : {
        id: 'library',
        label: '教材',
        kind: 'library',
        active: navigation.activeQuickNavId === 'library',
        onClick: () => navigation.scrollToSection(navigation.librarySectionRef),
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
  const quickQuizBook = viewModel.plannedBooks[0] || viewModel.primaryRecommendedBook;
  return (
    <>
      <div className="order-1 flex min-w-0 items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-black tracking-[0.16em] text-medace-800">LEARNING HOME</p>
          <h1 className="mt-1 text-lg font-black text-steady-ink sm:text-xl">{user.displayName}さん、今日も一歩ずつ。</h1>
        </div>
        <span className="hidden rounded-full border border-medace-200 bg-white px-3 py-1.5 text-xs font-bold text-steady-muted sm:block">学びを、自分の力に</span>
      </div>
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
          onOpenPlan={() => onSelectTask('plan')}
          onGeneratePlan={controller.handleGeneratePlan}
        />
      </div>

      <DashboardStudyShortcuts
        quizBook={quickQuizBook}
        hasProgress={viewModel.hasStudyBooks || viewModel.weekTotal > 0}
        onSelectBook={onSelectBook}
        onOpenLibrary={() => onOpenSection('library')}
        onOpenProgress={() => onOpenSection('progress')}
      />

      <section
        data-testid="dashboard-smart-workspace"
        className={`order-3 grid min-w-0 gap-4 ${
          hasPrimarySupportSections ? 'xl:grid-cols-[minmax(0,0.68fr)_minmax(280px,0.32fr)]' : 'xl:grid-cols-1'
        }`}
      >
        {hasPrimarySupportSections && (
          <div data-testid="dashboard-primary-stack" className="grid min-w-0 content-start gap-4">
            <div className="flex min-w-0 items-center justify-between gap-3 px-1">
              <h2 className="text-sm font-black text-slate-950">課題とサポート</h2>
              <span className="text-xs font-bold text-slate-500">必要な内容を開く</span>
            </div>
            {primarySupportSections}
          </div>
        )}

        <aside data-testid="dashboard-reference-rail" className="grid min-w-0 content-start gap-4">
          <div className="flex min-w-0 items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-black text-steady-ink">次の学びとサポート</h2>
            <span className="text-xs font-bold text-steady-muted">自分のペースで</span>
          </div>
          <DashboardTaskOverviewRail
            primaryTask={viewModel.primaryTask}
            urgentTasks={viewModel.urgentTasks}
            supportingTasks={viewModel.supportingTasks.filter((task) => (
              isStudentMobileShell || task.id !== 'englishPractice'
            ))}
            referenceTasks={referenceShortcutTasks}
            showPrimaryAction={false}
            onSelectTask={onSelectTask}
            onSelectReferenceTask={scrollToTaskSection}
            onStartPrimary={handlePrimaryTaskAction}
          />
        </aside>
      </section>

      {hasReferenceSections && (
        <section
          data-testid="dashboard-reference-sections"
          className="order-4 grid min-w-0 gap-6"
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
