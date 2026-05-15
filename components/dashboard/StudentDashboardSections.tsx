import React from 'react';

import {
  InterventionKind,
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
import DashboardMobileQuickNav from './DashboardMobileQuickNav';
import DashboardMissionSection from './DashboardMissionSection';
import DashboardPlanSection from './DashboardPlanSection';
import DashboardProgressSection from './DashboardProgressSection';
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
  const coachActionType = viewModel.latestCoachNotification
    ? (
        viewModel.latestCoachNotification.recommendedActionType
        || (
          viewModel.latestCoachNotification.interventionKind === InterventionKind.PLAN_NUDGE
            ? RecommendedActionType.OPEN_PLAN
            : viewModel.learningPlan
              ? RecommendedActionType.OPEN_PLAN
              : RecommendedActionType.START_REVIEW
        )
      )
    : null;
  const primaryMission = viewModel.primaryMission;
  const topWeakness = viewModel.weaknessProfile?.topWeaknesses[0] || null;
  const todayTaskIntent = React.useMemo(() => createTodayFocusTaskIntent(), []);
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

  const handlePrimaryMissionAction = async () => {
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
      const writingSection = document.querySelector('[data-testid="writing-student-section"]');
      if (writingSection instanceof HTMLElement) {
        writingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
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
  };

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
          ? () => {
              if (coachActionType === RecommendedActionType.OPEN_PLAN) {
                controller.setShowPlanEditModal(true);
                return;
              }
              if (coachTaskIntent) {
                onStartTask(coachTaskIntent);
              }
            }
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
        onOpenCreateModal={() => controller.setShowCreateModal(true)}
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
    <div key="progress">
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
    <div key="account">
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

  const primarySupportSections = [
    viewModel.primaryLearningRouteId === 'mission' ? missionSection : null,
    viewModel.primaryLearningRouteId === 'writing' ? writingSection : null,
    weaknessSection,
    viewModel.primaryLearningRouteId !== 'mission' ? missionSection : null,
    viewModel.primaryLearningRouteId !== 'writing' ? writingSection : null,
  ].filter(Boolean);

  const referenceSections = [
    isStudentMobileShell ? null : coachSection,
    planSection,
    librarySection,
    progressSection,
    isStudentMobileShell ? null : (
      <div key="announcement">
        <DashboardAnnouncementSection feed={announcementFeed.feed} />
      </div>
    ),
    !isStudentMobileShell && viewModel.isGameMode && viewModel.hasStudyBooks ? (
      <div key="companion">
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
    ) : null,
    !isStudentMobileShell && viewModel.motivationSnapshot ? (
      <div key="motivation">
        <MotivationBoard snapshot={viewModel.motivationSnapshot} isCompact={isStudentMobileShell} />
      </div>
    ) : null,
    isStudentMobileShell ? null : accountSection,
  ].filter(Boolean);

  const contextualMobileAction = viewModel.hasActionableWriting && writingSection
    ? {
        id: 'writing',
        label: '提出',
        kind: 'writing' as const,
        active: navigation.activeQuickNavId === 'writing',
        onClick: () => navigation.scrollToSection(navigation.writingSectionRef),
      }
    : primaryMission
      ? {
          id: 'mission',
          label: '課題',
          kind: 'mission' as const,
          active: navigation.activeQuickNavId === 'mission',
          onClick: () => navigation.scrollToSection(navigation.missionSectionRef),
        }
      : {
          id: 'weakness',
          label: '弱点',
          kind: 'weakness' as const,
          active: navigation.activeQuickNavId === 'weakness',
          onClick: () => navigation.scrollToSection(navigation.weaknessSectionRef),
        };

  const mobileLauncherItems = [
    {
      id: 'today',
      label: '始める',
      kind: 'today' as const,
      active: navigation.activeQuickNavId === 'today',
      onClick: () => onSelectLearningRoute(viewModel.primaryLearningRouteId),
    },
    viewModel.primaryLearningRouteId === 'englishPractice' ? null : {
      id: 'english-practice',
      label: '演習',
      kind: 'englishPractice' as const,
      active: navigation.activeQuickNavId === 'english-practice',
      onClick: () => onSelectPracticeLane(viewModel.practiceRecommendation.lane),
    },
    contextualMobileAction,
    {
      id: 'library',
      label: '教材',
      kind: 'library' as const,
      active: navigation.activeQuickNavId === 'library',
      onClick: () => navigation.scrollToSection(navigation.librarySectionRef),
    },
  ].filter(Boolean);

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
          primaryLearningRouteId={viewModel.primaryLearningRouteId}
          practiceRecommendation={viewModel.practiceRecommendation}
          gameLeagueBadge={viewModel.isGameMode ? viewModel.userLeague : undefined}
          isMobileCompact={isStudentMobileShell}
          practiceAnchorRef={navigation.englishPracticeSectionRef}
          practiceAnchorStyle={navigation.mobileAnchorStyle}
          onOpenSettings={() => controller.setShowSettingsModal(true)}
          onOpenRecommendedCourse={viewModel.primaryRecommendedBook
            ? () => onSelectBook(viewModel.primaryRecommendedBook!.id, 'study')
            : undefined}
          onStartQuest={() => onSelectLearningRoute(viewModel.primaryLearningRouteId)}
          onSelectPracticeLane={onSelectPracticeLane}
          onOpenPlan={() => controller.setShowPlanEditModal(true)}
          onGeneratePlan={controller.handleGeneratePlan}
        />
      </div>

      <section
        data-testid="dashboard-smart-workspace"
        className="order-2 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(280px,0.32fr)]"
      >
        <div data-testid="dashboard-primary-stack" className="grid min-w-0 content-start gap-4">
          <div className="flex min-w-0 items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-black text-slate-950">次に見るところ</h2>
            <span className="text-xs font-bold text-slate-400">迷ったら上から</span>
          </div>
          {primarySupportSections}
        </div>

        <aside data-testid="dashboard-reference-rail" className="grid min-w-0 content-start gap-4">
          <div className="flex min-w-0 items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-black text-slate-950">あとで確認</h2>
            <span className="text-xs font-bold text-slate-400">教材・記録・設定</span>
          </div>
          {referenceSections}
        </aside>
      </section>

      {isStudentMobileShell && (
        <DashboardMobileQuickNav
          items={mobileLauncherItems}
        />
      )}
    </>
  );
};

export default StudentDashboardSections;
