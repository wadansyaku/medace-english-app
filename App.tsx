
import React, { Suspense, lazy, useState } from 'react';
import Layout from './components/Layout';
import { UserRole, type LearningTaskIntent, type UserProfile } from './types';
import { BusinessAdminWorkspaceView, InstructorWorkspaceView } from './types';
import { isGroupAdmin } from './config/access';
import { BUSINESS_ADMIN_WORKSPACE_SECTIONS, INSTRUCTOR_WORKSPACE_SECTIONS } from './config/workspace';
import { Loader2 } from 'lucide-react';
import AuthExperienceScreen from './components/auth/AuthExperienceScreen';
import StaffEntryStatus from './components/auth/StaffEntryStatus';
import { isStaffLoginEntry } from './shared/staffLogin';
import AdminDemoPrompt from './components/auth/AdminDemoPrompt';
import PasswordResetScreen from './components/auth/PasswordResetScreen';
import AnnouncementOverlay from './components/announcements/AnnouncementOverlay';
import {
  canAccessAppView,
  isHomeAppRoute,
  useAppNavigation,
  parseNavigationPath,
} from './hooks/useAppNavigation';
import { useAnnouncementFeed } from './hooks/useAnnouncementFeed';
import { useAuthExperienceController } from './hooks/useAuthExperienceController';
import { recordDashboardStartTaskEvent } from './services/productEvents';
import { createTaskIntentFromBookSelection, getTaskRouteBookId } from './shared/learningTask';
import { NARU_BOOK_ID } from './shared/naruBook';
import { createNaruChapterReturnTask } from './shared/naruStudy';

const Dashboard = lazy(() => import('./components/Dashboard'));
const EnglishPracticeHub = lazy(() => import('./components/practice/EnglishPracticeHub'));
const StudyMode = lazy(() => import('./components/StudyMode'));
const QuizMode = lazy(() => import('./components/QuizMode'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const InstructorDashboard = lazy(() => import('./components/InstructorDashboard'));
const BusinessAdminDashboard = lazy(() => import('./components/BusinessAdminDashboard'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const GuestTrialScreen = lazy(() => import('./components/guest/GuestTrialScreen'));
const GuestTrialImportNotice = lazy(() => import('./components/guest/GuestTrialImportNotice'));
const GuestLearningScreen = lazy(() => import('./components/guest/GuestLearningScreen'));
const GuestLearningImportNotice = lazy(() => import('./components/guest/GuestLearningImportNotice'));

const App: React.FC = () => {
  const { navigationState, dispatchNavigation } = useAppNavigation();
  const [instructorWorkspaceView, setInstructorWorkspaceView] = useState<InstructorWorkspaceView>(InstructorWorkspaceView.OVERVIEW);
  const [businessAdminWorkspaceView, setBusinessAdminWorkspaceView] = useState<BusinessAdminWorkspaceView>(BusinessAdminWorkspaceView.OVERVIEW);
  const { currentView, publicRole, selectedTask, englishPracticeLane, passwordResetToken } = navigationState;
  const {
    user,
    setCurrentUser,
    authLoading,
    staffLoginCompletionPending,
    openAuthenticatedHome,
    logoutError,
    authExperienceProps,
    isDemoUser,
    handleLogout,
    handleResetDemo,
    adminDemoPrompt,
  } = useAuthExperienceController({
    navigationState,
    dispatchNavigation,
    onLogoutReset: () => {
      setInstructorWorkspaceView(InstructorWorkspaceView.OVERVIEW);
      setBusinessAdminWorkspaceView(BusinessAdminWorkspaceView.OVERVIEW);
    },
  });
  const announcementFeed = useAnnouncementFeed(Boolean(user));
  const suppressAnnouncementModal = Boolean(user && user.role === UserRole.STUDENT && user.needsOnboarding);
  const isGroupAdminUser = isGroupAdmin(user);
  const isInstructorWorkspace = Boolean(user && currentView === 'instructor');
  const workspaceSections = isInstructorWorkspace
    ? (isGroupAdminUser ? BUSINESS_ADMIN_WORKSPACE_SECTIONS : INSTRUCTOR_WORKSPACE_SECTIONS)
    : [];
  const activeWorkspaceSection = isInstructorWorkspace
    ? (isGroupAdminUser ? businessAdminWorkspaceView : instructorWorkspaceView)
    : undefined;

  const openBookTask = (bookId: string, mode: 'study' | 'quiz') => {
    dispatchNavigation({
      type: 'open-task',
      task: createTaskIntentFromBookSelection(bookId, mode),
    });
  };
  const openGuestAuth = (mode: 'LOGIN' | 'SIGNUP') => {
    dispatchNavigation({ type: 'sync-from-location', state: parseNavigationPath(window.location.pathname, window.location.search), historyMode: 'none' });
    dispatchNavigation({ type: 'open-auth', mode });
  };

  const handleDashboardBookSelect = (bookId: string, mode: 'study' | 'quiz') => {
    const task = createTaskIntentFromBookSelection(bookId, mode);
    recordDashboardStartTaskEvent(task);
    dispatchNavigation({
      type: 'open-task',
      task,
    });
  };

  const openLearningTask = (task: LearningTaskIntent) => {
    dispatchNavigation({ type: 'open-task', task });
  };

  const handleDashboardTaskSelect = (task: LearningTaskIntent) => {
    recordDashboardStartTaskEvent(task);
    openLearningTask(task);
  };

  const handleSessionComplete = (updatedUser: UserProfile) => {
    setCurrentUser(updatedUser);
    dispatchNavigation({ type: 'finish-book-view' });
  };

  const handleFollowUpTask = (updatedUser: UserProfile, task: LearningTaskIntent) => {
    setCurrentUser(updatedUser);
    dispatchNavigation({ type: 'open-task', task });
  };

  const handleSelectWorkspaceSection = (section: string) => {
    if (!user || currentView !== 'instructor') return;
    if (isGroupAdminUser) {
      setBusinessAdminWorkspaceView(section as BusinessAdminWorkspaceView);
      return;
    }
    setInstructorWorkspaceView(section as InstructorWorkspaceView);
  };

  const handleChangeView = (view: string) => {
    if (!user) {
      dispatchNavigation({ type: 'close-public-info' });
      return;
    }
    if (view === 'login') {
      dispatchNavigation({ type: 'close-public-info' });
      return;
    }
    if (view === 'englishPractice') {
      dispatchNavigation({ type: 'open-english-practice', lane: 'overview' });
      return;
    }
    if (!isHomeAppRoute(view)) return;
    dispatchNavigation({ type: 'go-home', view });
  };

  const renderHomeContent = () => {
    if (!user) {
      return null;
    }

    if (user.needsOnboarding) {
      return (
        <Onboarding
          user={user}
          onComplete={(updated) => {
            setCurrentUser(updated);
            dispatchNavigation({ type: 'go-home', view: 'dashboard', historyMode: 'replace' });
          }}
        />
      );
    }

    if (!canAccessAppView(user, currentView)) {
      return <div className="p-8 text-center text-red-500">アクセス権限がありません</div>;
    }

    switch (currentView) {
      case 'guestTrial':
        return <GuestTrialScreen
          onBack={() => handleChangeView(user.role === UserRole.STUDENT ? 'dashboard' : user.role === UserRole.INSTRUCTOR ? 'instructor' : 'admin')}
          onOpenAuth={() => handleChangeView('dashboard')}
          onReturnToAccount={() => handleChangeView(user.role === UserRole.STUDENT ? 'dashboard' : user.role === UserRole.INSTRUCTOR ? 'instructor' : 'admin')}
        />;
      case 'guestLearning':
        return <GuestLearningScreen
          onBack={() => handleChangeView(user.role === UserRole.STUDENT ? 'dashboard' : user.role === UserRole.INSTRUCTOR ? 'instructor' : 'admin')}
          onOpenAuth={() => handleChangeView('dashboard')}
          onReturnToAccount={() => handleChangeView(user.role === UserRole.STUDENT ? 'dashboard' : user.role === UserRole.INSTRUCTOR ? 'instructor' : 'admin')}
          onOpenLegacy={() => dispatchNavigation({ type: 'open-guest-trial' })}
        />;
      case 'dashboard':
        return (
          <Dashboard
            user={user}
            announcementFeed={announcementFeed}
            onSelectBook={handleDashboardBookSelect}
            onStartTask={handleDashboardTaskSelect}
            onUserUpdate={setCurrentUser}
            activePracticeLane={null}
            onOpenPracticeLane={(lane) => dispatchNavigation({ type: 'open-english-practice', lane })}
          />
        );
      case 'englishPractice':
        return (
          <EnglishPracticeHub
            user={user}
            initialLane={englishPracticeLane && englishPracticeLane !== 'overview' ? englishPracticeLane : 'grammar'}
            onBack={() => dispatchNavigation({ type: 'go-home', view: 'dashboard' })}
            onActiveLaneChange={(lane) => {
              if (lane !== 'overview') {
                dispatchNavigation({ type: 'open-english-practice', lane, historyMode: 'replace' });
              }
            }}
          />
        );
      case 'study':
        return selectedTask ? (
          <StudyMode
            user={user}
            bookId={getTaskRouteBookId(selectedTask)}
            taskIntent={selectedTask}
            onBack={() => dispatchNavigation({ type: 'finish-book-view' })}
            onSessionComplete={handleSessionComplete}
            onStartTask={handleFollowUpTask}
          />
        ) : null;
      case 'quiz':
        return selectedTask ? (
          <QuizMode
            user={user}
            bookId={getTaskRouteBookId(selectedTask)}
            taskIntent={selectedTask}
            onBack={() => {
              if (selectedTask.bookId === NARU_BOOK_ID && selectedTask.wordRange && !selectedTask.missionAssignmentId) {
                openLearningTask(createNaruChapterReturnTask(selectedTask));
              } else dispatchNavigation({ type: 'finish-book-view' });
            }}
          />
        ) : null;
      case 'admin':
        return <AdminPanel />;
      case 'instructor':
        return isGroupAdminUser ? (
          <BusinessAdminDashboard
            user={user}
            onSelectBook={openBookTask}
            activeView={businessAdminWorkspaceView}
            onChangeView={setBusinessAdminWorkspaceView}
          />
        ) : (
          <InstructorDashboard
            user={user}
            onSelectBook={openBookTask}
            activeView={instructorWorkspaceView}
            onChangeView={setInstructorWorkspaceView}
          />
        );
      default:
        return (
          <Dashboard
            user={user}
            announcementFeed={announcementFeed}
            onSelectBook={handleDashboardBookSelect}
            onStartTask={handleDashboardTaskSelect}
            onUserUpdate={setCurrentUser}
            onOpenPracticeLane={(lane) => dispatchNavigation({ type: 'open-english-practice', lane })}
          />
        );
    }
  };

  const renderContent = () => {
    if (authLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-12 h-12 text-medace-500 animate-spin mb-4" />
          <p className="text-slate-500">認証中...</p>
        </div>
      );
    }

    if (currentView === 'resetPassword') {
      return (
        <PasswordResetScreen
          token={passwordResetToken || null}
          onBackToLogin={() => {
            dispatchNavigation({ type: 'reset', historyMode: 'replace' });
            dispatchNavigation({ type: 'open-auth', mode: 'LOGIN', historyMode: 'replace' });
          }}
        />
      );
    }

    if (!user) {
      return (
        <AuthExperienceScreen
          currentView={currentView === 'guestLearning' ? 'guestLearning' : currentView === 'guestTrial' ? 'guestTrial' : currentView === 'publicRole' ? 'publicRole' : currentView === 'publicInfo' ? 'publicInfo' : 'login'}
          publicRole={publicRole}
          {...authExperienceProps}
          onClosePublicInfo={() => dispatchNavigation({ type: 'close-public-info' })}
          onOpenPublicRole={(roleKey) => dispatchNavigation({ type: 'open-public-role', role: roleKey })}
          onClosePublicRole={() => dispatchNavigation({ type: isStaffLoginEntry(publicRole) ? 'reset' : 'close-public-role' })}
          onStartGuestTrial={() => dispatchNavigation({ type: 'open-guest-learning' })}
          guestTrialContent={currentView === 'guestTrial' ? <GuestTrialScreen
            onBack={() => dispatchNavigation({ type: 'reset' })}
            onOpenAuth={(mode) => dispatchNavigation({ type: 'open-auth', mode })}
          /> : currentView === 'guestLearning' ? <GuestLearningScreen
            onBack={() => dispatchNavigation({ type: 'reset' })}
            onOpenAuth={openGuestAuth}
            onOpenLegacy={() => dispatchNavigation({ type: 'open-guest-trial' })}
          /> : undefined}
        />
      );
    }
    if (staffLoginCompletionPending || (currentView === 'publicRole' && isStaffLoginEntry(publicRole))) {
      return <StaffEntryStatus user={user} entry={isStaffLoginEntry(publicRole) ? publicRole : undefined}
        completedAfterNavigation={staffLoginCompletionPending} onOpenHome={openAuthenticatedHome} />;
    }
    return renderHomeContent();
  };

  return (
    <>
      <Layout 
        user={user} 
        onLogout={handleLogout}
        onResetDemo={isDemoUser ? handleResetDemo : undefined}
        currentView={currentView}
        onChangeView={handleChangeView}
        workspaceSections={workspaceSections}
        activeWorkspaceSection={activeWorkspaceSection}
        onSelectWorkspaceSection={workspaceSections.length > 0 ? handleSelectWorkspaceSection : undefined}
        forceNoIndex={currentView === 'publicRole'}
        immersiveContent={currentView === 'resetPassword'}
      >
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-medace-500" />
              <p className="mt-3 text-sm font-medium">画面を準備中...</p>
            </div>
          }
        >
          {user && !authLoading && logoutError && <div role="alert" data-testid="logout-error" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>{logoutError}</p>
            <button type="button" onClick={handleLogout} className="mt-2 min-h-11 rounded-lg border border-red-300 px-3 font-bold">ログアウトを再試行</button>
          </div>}
          {user && !authLoading && currentView === 'dashboard' && <>
            <GuestLearningImportNotice key={`naru:${user.uid}`} user={user} />
            <GuestTrialImportNotice key={user.uid} user={user} onContinueTrial={() => dispatchNavigation({ type: 'open-guest-trial' })} />
          </>}
          {renderContent()}
        </Suspense>
      </Layout>

      {user && !authLoading && currentView !== 'publicRole' && !staffLoginCompletionPending && (
        <AnnouncementOverlay
          feed={announcementFeed.feed}
          suppressModal={suppressAnnouncementModal}
          onAcknowledge={(announcementId) => {
            void announcementFeed.acknowledge(announcementId);
          }}
          onDismissMajor={(announcementId) => {
            void announcementFeed.markSeen(announcementId);
          }}
        />
      )}

      {adminDemoPrompt.open && <AdminDemoPrompt {...adminDemoPrompt} />}
    </>
  );
};

export default App;
