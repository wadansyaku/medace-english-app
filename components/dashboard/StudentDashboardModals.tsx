import React from 'react';

import type { UserProfile } from '../../types';
import type { AnnouncementFeedController } from '../../hooks/useAnnouncementFeed';
import type { useStudentDashboardController } from '../../hooks/useStudentDashboardController';
import type { useStudentDashboardViewModel } from '../../hooks/useStudentDashboardViewModel';
import DashboardDeleteBookDialog from './DashboardDeleteBookDialog';
import DashboardSettingsModal from './DashboardSettingsModal';
import PhrasebookCreateModal from './PhrasebookCreateModal';
import PlanEditorModal from './PlanEditorModal';

type StudentDashboardController = ReturnType<typeof useStudentDashboardController>;
type StudentDashboardViewModel = ReturnType<typeof useStudentDashboardViewModel>;

interface StudentDashboardModalsProps {
  user: UserProfile;
  announcementFeed: AnnouncementFeedController;
  controller: StudentDashboardController;
  viewModel: StudentDashboardViewModel;
  isMobileViewport: boolean;
  onUserUpdate: (user: UserProfile) => void;
  onStartPersonalBook: (bookId: string) => void;
}

export const StudentDashboardModals: React.FC<StudentDashboardModalsProps> = ({
  user,
  announcementFeed,
  controller,
  viewModel,
  isMobileViewport,
  onUserUpdate,
  onStartPersonalBook,
}) => {
  return (
    <>
      <DashboardDeleteBookDialog
        pendingDeleteBook={controller.pendingDeleteBook}
        isMobileViewport={isMobileViewport}
        onClose={() => controller.setPendingDeleteBook(null)}
        onConfirm={controller.confirmDeleteBook}
      />

      <PlanEditorModal
        open={controller.showPlanEditModal && Boolean(viewModel.learningPlan)}
        planningBooks={viewModel.planningBooks}
        selectedBookIds={controller.selectedPlanBooks}
        dailyGoal={controller.editDailyGoal}
        onClose={() => controller.setShowPlanEditModal(false)}
        onChangeDailyGoal={controller.setEditDailyGoal}
        onToggleBook={controller.togglePlanBook}
        onSave={controller.handleUpdatePlan}
      />

      <DashboardSettingsModal
        open={controller.showSettingsModal}
        accountOverview={viewModel.accountOverview}
        currentEnglishLevel={user.englishLevel}
        editName={controller.editName}
        editGrade={controller.editGrade}
        editStudyMode={controller.editStudyMode}
        editTargetExam={controller.editTargetExam}
        editTargetScore={controller.editTargetScore}
        editExamDate={controller.editExamDate}
        editWeeklyStudyDays={controller.editWeeklyStudyDays}
        editDailyStudyMinutes={controller.editDailyStudyMinutes}
        editWeakSkillFocus={controller.editWeakSkillFocus}
        editMotivationNote={controller.editMotivationNote}
        editIntensity={controller.editIntensity}
        editDisplayFontSize={controller.editDisplayFontSize}
        editDisplayDensity={controller.editDisplayDensity}
        isSavingProfile={controller.isSavingProfile}
        onClose={() => controller.setShowSettingsModal(false)}
        onRetakeLevel={() => {
          controller.setShowSettingsModal(false);
          controller.setShowOnboarding(true);
        }}
        onSave={controller.handleSaveProfile}
        onEditName={controller.setEditName}
        onEditGrade={controller.setEditGrade}
        onEditStudyMode={controller.setEditStudyMode}
        onEditTargetExam={controller.setEditTargetExam}
        onEditTargetScore={controller.setEditTargetScore}
        onEditExamDate={controller.setEditExamDate}
        onEditWeeklyStudyDays={controller.setEditWeeklyStudyDays}
        onEditDailyStudyMinutes={controller.setEditDailyStudyMinutes}
        onEditWeakSkillFocus={controller.setEditWeakSkillFocus}
        onEditMotivationNote={controller.setEditMotivationNote}
        onEditIntensity={controller.setEditIntensity}
        onEditDisplayFontSize={controller.setEditDisplayFontSize}
        onEditDisplayDensity={controller.setEditDisplayDensity}
        commercialRequests={viewModel.commercialRequests}
        announcementFeed={announcementFeed.feed}
      />

      <PhrasebookCreateModal
        key={user.uid}
        open={controller.showCreateModal}
        ownerUid={user.uid}
        creating={controller.creating}
        canUseSelectedCreateMode={viewModel.canCreateFromText}
        currentPlanLabel={viewModel.currentPlanPolicy.label}
        onClose={() => {
          if (!controller.creating) controller.setShowCreateModal(false);
        }}
        onCreate={controller.handleCreatePhrasebook}
        onStartStudy={onStartPersonalBook}
      />
    </>
  );
};

export default StudentDashboardModals;
