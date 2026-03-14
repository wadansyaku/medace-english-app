import React from 'react';
import { Loader2 } from 'lucide-react';
import { GRADE_LABELS, UserGrade, type UserProfile } from '../types';
import Onboarding from './Onboarding';
import StudyCompanion from './StudyCompanion';
import MotivationBoard from './MotivationBoard';
import DashboardAccountSection from './dashboard/DashboardAccountSection';
import DashboardAnnouncementSection from './dashboard/DashboardAnnouncementSection';
import DashboardCoachSection from './dashboard/DashboardCoachSection';
import DashboardDeleteBookDialog from './dashboard/DashboardDeleteBookDialog';
import DashboardHeroSection from './dashboard/DashboardHeroSection';
import DashboardLibrarySection from './dashboard/DashboardLibrarySection';
import DashboardPlanSection from './dashboard/DashboardPlanSection';
import DashboardProgressSection from './dashboard/DashboardProgressSection';
import DashboardSettingsModal from './dashboard/DashboardSettingsModal';
import PhrasebookCreateModal from './dashboard/PhrasebookCreateModal';
import PlanEditorModal from './dashboard/PlanEditorModal';
import WritingStudentSection from './WritingStudentSection';
import { useDashboardData } from '../hooks/useDashboardData';
import { useAnnouncementFeed } from '../hooks/useAnnouncementFeed';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import useIsStudentMobileShell from '../hooks/useIsStudentMobileShell';
import { useStudentDashboardController } from '../hooks/useStudentDashboardController';
import { useStudentDashboardViewModel } from '../hooks/useStudentDashboardViewModel';
import { storage } from '../services/storage';

interface DashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onUserUpdate: (user: UserProfile) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onSelectBook, onUserUpdate }) => {
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
  const announcementFeed = useAnnouncementFeed(Boolean(user));
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

  const {
    generatingPlan,
    showLibrary,
    setShowLibrary,
    showProgressDetails,
    setShowProgressDetails,
    showAccountDetails,
    setShowAccountDetails,
    showCreateModal,
    setShowCreateModal,
    showSettingsModal,
    setShowSettingsModal,
    showOnboarding,
    setShowOnboarding,
    showPlanEditModal,
    setShowPlanEditModal,
    pageNotice,
    pendingDeleteBook,
    setPendingDeleteBook,
    editDailyGoal,
    setEditDailyGoal,
    selectedPlanBooks,
    handleGeneratePlan,
    togglePlanBook,
    handleUpdatePlan,
    createMode,
    setCreateMode,
    rawText,
    setRawText,
    uploadFile,
    newBookTitle,
    setNewBookTitle,
    creating,
    errorMsg,
    handleFileChange,
    handleCreatePhrasebook,
    handleDeleteBook,
    confirmDeleteBook,
    editName,
    setEditName,
    editGrade,
    setEditGrade,
    editStudyMode,
    setEditStudyMode,
    editTargetExam,
    setEditTargetExam,
    editTargetScore,
    setEditTargetScore,
    editExamDate,
    setEditExamDate,
    editWeeklyStudyDays,
    setEditWeeklyStudyDays,
    editDailyStudyMinutes,
    setEditDailyStudyMinutes,
    editWeakSkillFocus,
    setEditWeakSkillFocus,
    editMotivationNote,
    setEditMotivationNote,
    editIntensity,
    setEditIntensity,
    editDisplayFontSize,
    setEditDisplayFontSize,
    editDisplayDensity,
    setEditDisplayDensity,
    isSavingProfile,
    handleSaveProfile,
  } = controller;

  if (showOnboarding) {
    return (
      <Onboarding
        user={user}
        isRetake
        historySummary={`現在レベル: ${user.englishLevel}, XP: ${user.stats?.xp}, 学年・属性: ${GRADE_LABELS[user.grade || UserGrade.ADULT]}`}
        onComplete={(updated) => {
          onUserUpdate(updated);
          setShowOnboarding(false);
          refreshDashboard();
        }}
        onCancel={() => {
          setShowOnboarding(false);
          setShowSettingsModal(true);
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

  const canUseSelectedCreateMode = createMode === 'TEXT' ? viewModel.canCreateFromText : viewModel.canCreateFromFile;

  return (
    <div
      data-testid="student-dashboard"
      className={`relative flex flex-col animate-in fade-in duration-500 md:gap-8 md:pb-20 ${
        isStudentMobileShell ? 'gap-4 pb-20' : 'gap-5 pb-24'
      }`}
    >
      {pageNotice && (
        <div className={`sticky z-40 rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm ${
          isStudentMobileShell ? 'top-[calc(0.35rem+var(--safe-top))]' : 'top-[calc(0.75rem+var(--safe-top))]'
        } ${
          pageNotice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {pageNotice.message}
        </div>
      )}

      <DashboardDeleteBookDialog
        pendingDeleteBook={pendingDeleteBook}
        isMobileViewport={isMobileViewport}
        onClose={() => setPendingDeleteBook(null)}
        onConfirm={confirmDeleteBook}
      />

      <PlanEditorModal
        open={showPlanEditModal && Boolean(viewModel.learningPlan)}
        planningBooks={viewModel.planningBooks}
        selectedBookIds={selectedPlanBooks}
        dailyGoal={editDailyGoal}
        onClose={() => setShowPlanEditModal(false)}
        onChangeDailyGoal={setEditDailyGoal}
        onToggleBook={togglePlanBook}
        onSave={handleUpdatePlan}
      />

      <DashboardSettingsModal
        open={showSettingsModal}
        user={user}
        accountOverview={viewModel.accountOverview}
        currentEnglishLevel={user.englishLevel}
        editName={editName}
        editGrade={editGrade}
        editStudyMode={editStudyMode}
        editTargetExam={editTargetExam}
        editTargetScore={editTargetScore}
        editExamDate={editExamDate}
        editWeeklyStudyDays={editWeeklyStudyDays}
        editDailyStudyMinutes={editDailyStudyMinutes}
        editWeakSkillFocus={editWeakSkillFocus}
        editMotivationNote={editMotivationNote}
        editIntensity={editIntensity}
        editDisplayFontSize={editDisplayFontSize}
        editDisplayDensity={editDisplayDensity}
        isSavingProfile={isSavingProfile}
        onClose={() => setShowSettingsModal(false)}
        onRetakeLevel={() => {
          setShowSettingsModal(false);
          setShowOnboarding(true);
        }}
        onSave={handleSaveProfile}
        onEditName={setEditName}
        onEditGrade={setEditGrade}
        onEditStudyMode={setEditStudyMode}
        onEditTargetExam={setEditTargetExam}
        onEditTargetScore={setEditTargetScore}
        onEditExamDate={setEditExamDate}
        onEditWeeklyStudyDays={setEditWeeklyStudyDays}
        onEditDailyStudyMinutes={setEditDailyStudyMinutes}
        onEditWeakSkillFocus={setEditWeakSkillFocus}
        onEditMotivationNote={setEditMotivationNote}
        onEditIntensity={setEditIntensity}
        onEditDisplayFontSize={setEditDisplayFontSize}
        onEditDisplayDensity={setEditDisplayDensity}
        commercialRequests={viewModel.commercialRequests}
        announcementFeed={announcementFeed.feed}
        onSubmitCommercialRequest={async (payload) => {
          await storage.submitCommercialRequest(payload);
          await refreshDashboard();
        }}
      />

      <PhrasebookCreateModal
        open={showCreateModal}
        createMode={createMode}
        rawText={rawText}
        uploadFile={uploadFile}
        newBookTitle={newBookTitle}
        creating={creating}
        errorMsg={errorMsg}
        canUseSelectedCreateMode={canUseSelectedCreateMode}
        currentPlanLabel={viewModel.currentPlanPolicy.label}
        onClose={() => setShowCreateModal(false)}
        onChangeMode={setCreateMode}
        onChangeRawText={setRawText}
        onChangeTitle={setNewBookTitle}
        onFileChange={handleFileChange}
        onCreate={handleCreatePhrasebook}
      />

      <div className="order-1">
        <DashboardHeroSection
          grade={user.grade || UserGrade.ADULT}
          englishLevel={user.englishLevel}
          heroTitle={viewModel.heroTitle}
          heroCopy={viewModel.heroCopy}
          preferenceSummary={viewModel.preferenceSummary}
          hasStudyBooks={viewModel.hasStudyBooks}
          questButtonLabel={viewModel.questButtonLabel}
          learningPlan={viewModel.learningPlan}
          generatingPlan={generatingPlan}
          remainingWords={viewModel.remainingWords}
          dueCount={viewModel.dueCount}
          estimatedMinutes={viewModel.estimatedMinutes}
          todayCount={viewModel.todayCount}
          todayWordGoal={viewModel.todayWordGoal}
          todayProgressPercent={viewModel.todayProgressPercent}
          gameLeagueBadge={viewModel.isGameMode ? viewModel.userLeague : undefined}
          isMobileCompact={isStudentMobileShell}
          onOpenSettings={() => setShowSettingsModal(true)}
          onStartQuest={() => {
            if (viewModel.hasStudyBooks) {
              onSelectBook('smart-session', 'study');
            } else {
              setShowCreateModal(true);
            }
          }}
          onOpenPlan={() => setShowPlanEditModal(true)}
          onGeneratePlan={handleGeneratePlan}
        />
      </div>

      {viewModel.canShowWritingSection && (
        <div className="order-2 md:order-6">
          <WritingStudentSection user={user} />
        </div>
      )}

      {viewModel.latestCoachNotification && (
        <div className="order-3 md:order-2">
          <DashboardCoachSection
            latestNotification={viewModel.latestCoachNotification}
            notifications={viewModel.coachNotifications}
            isCompact={isStudentMobileShell}
          />
        </div>
      )}

      <div className="order-4 md:order-3">
        <DashboardPlanSection
          learningPlan={viewModel.learningPlan}
          learningPreference={viewModel.learningPreference}
          preferenceSummary={viewModel.preferenceSummary}
          plannedBooks={viewModel.plannedBooks}
          canGenerateAiPlan={viewModel.canGenerateAiPlan}
          generatingPlan={generatingPlan}
          hasStudyBooks={viewModel.hasStudyBooks}
          isCompact={isStudentMobileShell}
          onEditPlan={() => setShowPlanEditModal(true)}
          onGeneratePlan={handleGeneratePlan}
          onOpenCreateModal={() => setShowCreateModal(true)}
        />
      </div>

      <div className="order-5 md:order-4">
        <DashboardAnnouncementSection feed={announcementFeed.feed} />
      </div>

      {viewModel.isGameMode && viewModel.hasStudyBooks && (
        <div className="order-6 md:order-5">
          <StudyCompanion
            user={user}
            dueCount={viewModel.dueCount}
            todayCount={viewModel.todayCount}
            weekTotal={viewModel.weekTotal}
            dailyGoal={viewModel.todayWordGoal}
            weeklyGoal={viewModel.weeklyGoal}
            stabilizedWords={viewModel.stabilizedWords}
            onStartQuest={() => onSelectBook('smart-session', 'study')}
          />
        </div>
      )}

      <div className="order-7 md:order-11">
        <DashboardLibrarySection
          books={viewModel.books}
          myBooks={viewModel.myBooks}
          recommendedOfficialBooks={viewModel.recommendedOfficialBooks}
          progressMap={viewModel.progressMap}
          showLibrary={showLibrary}
          isCompact={isStudentMobileShell}
          onToggleLibrary={() => setShowLibrary((previous) => !previous)}
          onOpenCreateModal={() => setShowCreateModal(true)}
          onDelete={handleDeleteBook}
          onSelect={onSelectBook}
        />
      </div>

      <div className="order-8 md:order-10">
        <DashboardProgressSection
          open={showProgressDetails}
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
          onToggle={() => setShowProgressDetails((previous) => !previous)}
        />
      </div>

      {viewModel.motivationSnapshot && (
        <div className="order-9 md:order-6">
          <MotivationBoard snapshot={viewModel.motivationSnapshot} isCompact={isStudentMobileShell} />
        </div>
      )}

      {viewModel.canShowAccountDetails && (
        <div className="order-10 md:order-9">
          <DashboardAccountSection
            open={showAccountDetails}
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
            onSubmitCommercialRequest={async (payload) => {
              await storage.submitCommercialRequest(payload);
              await refreshDashboard();
            }}
            onToggle={() => setShowAccountDetails((previous) => !previous)}
          />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
