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
import type { useStudentDashboardViewModel } from '../../hooks/useStudentDashboardViewModel';
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

interface StudentDashboardSectionsProps {
  user: UserProfile;
  announcementFeed: AnnouncementFeedController;
  controller: StudentDashboardController;
  viewModel: StudentDashboardViewModel;
  isStudentMobileShell: boolean;
  navigation: StudentDashboardSectionNavigation;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
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
          gameLeagueBadge={viewModel.isGameMode ? viewModel.userLeague : undefined}
          isMobileCompact={isStudentMobileShell}
          onOpenSettings={() => controller.setShowSettingsModal(true)}
          onOpenRecommendedCourse={viewModel.primaryRecommendedBook
            ? () => onSelectBook(viewModel.primaryRecommendedBook!.id, 'study')
            : undefined}
          onStartQuest={() => {
            if (viewModel.hasStudyBooks) {
              onStartTask(todayTaskIntent);
            } else {
              controller.setShowCreateModal(true);
            }
          }}
          onOpenPlan={() => controller.setShowPlanEditModal(true)}
          onGeneratePlan={controller.handleGeneratePlan}
        />
      </div>

      <div
        ref={navigation.weaknessSectionRef}
        data-testid="dashboard-weakness-anchor"
        className="order-2 md:order-2"
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

      {primaryMission && (
        <div
          ref={navigation.missionSectionRef}
          data-testid="dashboard-mission-anchor"
          className="order-3 md:order-3"
          style={navigation.mobileAnchorStyle}
        >
          <DashboardMissionSection
            mission={primaryMission}
            isCompact={isStudentMobileShell}
            onPrimaryAction={handlePrimaryMissionAction}
          />
        </div>
      )}

      {viewModel.canShowWritingSection && (
        <div
          ref={navigation.writingSectionRef}
          data-testid="dashboard-writing-anchor"
          className="order-4 md:order-6"
          style={navigation.mobileAnchorStyle}
        >
          <WritingStudentSection user={user} />
        </div>
      )}

      {viewModel.latestCoachNotification && (
        <div
          ref={navigation.coachSectionRef}
          data-testid="dashboard-coach-anchor"
          className="order-5 md:order-4"
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
      )}

      <div
        ref={navigation.planSectionRef}
        data-testid="dashboard-plan-anchor"
        className="order-5 md:order-4"
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

      <div className="order-6 md:order-5">
        <DashboardAnnouncementSection feed={announcementFeed.feed} />
      </div>

      {viewModel.isGameMode && viewModel.hasStudyBooks && (
        <div className="order-7 md:order-7">
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
      )}

      <div
        ref={navigation.librarySectionRef}
        data-testid="dashboard-library-section"
        className="order-8 md:order-11"
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

      <div className="order-9 md:order-10">
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

      {viewModel.motivationSnapshot && (
        <div className="order-10 md:order-8">
          <MotivationBoard snapshot={viewModel.motivationSnapshot} isCompact={isStudentMobileShell} />
        </div>
      )}

      {viewModel.canShowAccountDetails && (
        <div className="order-11 md:order-9">
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
      )}

      {isStudentMobileShell && (
        <DashboardMobileQuickNav
          items={navigation.mobileQuickNavItems.map((item) => ({
            id: item.id,
            label: item.label,
            kind: item.kind,
            active: navigation.activeQuickNavId === item.id,
            onClick: () => navigation.scrollToSection(item.ref),
          }))}
        />
      )}
    </>
  );
};

export default StudentDashboardSections;
