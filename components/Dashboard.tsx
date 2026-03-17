import React from 'react';
import { Loader2 } from 'lucide-react';

import { GRADE_LABELS, UserGrade, type LearningTaskIntent, type UserProfile } from '../types';
import Onboarding from './Onboarding';
import { useDashboardData } from '../hooks/useDashboardData';
import type { AnnouncementFeedController } from '../hooks/useAnnouncementFeed';
import { useDashboardSectionNavigation } from '../hooks/useDashboardSectionNavigation';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import useIsStudentMobileShell from '../hooks/useIsStudentMobileShell';
import { useStudentDashboardController } from '../hooks/useStudentDashboardController';
import { useStudentDashboardViewModel } from '../hooks/useStudentDashboardViewModel';
import { storage } from '../services/storage';
import StudentDashboardModals from './dashboard/StudentDashboardModals';
import StudentDashboardSections from './dashboard/StudentDashboardSections';

interface DashboardProps {
  user: UserProfile;
  announcementFeed: AnnouncementFeedController;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onStartTask: (task: LearningTaskIntent) => void;
  onUserUpdate: (user: UserProfile) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  announcementFeed,
  onSelectBook,
  onStartTask,
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
    canShowWritingSection: viewModel.canShowWritingSection,
    hasCoachNotification: Boolean(viewModel.latestCoachNotification),
  });

  const handleSubmitCommercialRequest = React.useCallback(async (payload: Parameters<typeof storage.submitCommercialRequest>[0]) => {
    await storage.submitCommercialRequest(payload);
    await refreshDashboard();
  }, [refreshDashboard]);

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
