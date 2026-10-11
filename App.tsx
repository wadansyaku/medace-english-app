
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Layout from './components/Layout';
import { UserRole, type LearningTaskIntent, type UserProfile } from './types';
import { BusinessAdminWorkspaceView, InstructorWorkspaceView } from './types';
import { isGroupAdmin } from './config/access';
import { BUSINESS_ADMIN_WORKSPACE_SECTIONS, INSTRUCTOR_WORKSPACE_SECTIONS } from './config/workspace';
import { Loader2 } from 'lucide-react';
import AuthExperienceScreen from './components/auth/AuthExperienceScreen';
import StaffEntryStatus from './components/auth/StaffEntryStatus';
import StaffWorkspaceSelector from './components/auth/StaffWorkspaceSelector';
import { isStaffLoginEntry } from './shared/staffLogin';
import AdminDemoPrompt from './components/auth/AdminDemoPrompt';
import PasswordResetScreen from './components/auth/PasswordResetScreen';
import AnnouncementOverlay from './components/announcements/AnnouncementOverlay';
import {
  canAccessAppView,
  getHomeAppRoute,
  isHomeAppRoute,
  useAppNavigation,
  parseNavigationPath,
} from './hooks/useAppNavigation';
import { useAnnouncementFeed } from './hooks/useAnnouncementFeed';
import { useAuthExperienceController } from './hooks/useAuthExperienceController';
import { useStaffWorkspaceSwitch } from './hooks/useStaffWorkspaceSwitch';
import { getWorkspaceContextKey } from './contracts/workspaceAccess';
import { recordDashboardStartTaskEvent } from './services/productEvents';
import { createTaskIntentFromBookSelection, getTaskRouteBookId } from './shared/learningTask';
import { NARU_BOOK_ID } from './shared/naruBook';
import { createNaruChapterReturnTask } from './shared/naruStudy';
import ProductSupportDialog from './components/ProductSupportDialog';
import ProductSupportSourcePage, { buildProductSupportSourcePath, readProductSupportSourceLocation } from './components/ProductSupportSourcePage';
import { requestProductSupport } from './services/productSupport';
import type { ProductSupportRole } from './shared/productSupportKnowledge';

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
  const [supportSource, setSupportSource] = useState(readProductSupportSourceLocation);
  const [supportDialog, setSupportDialog] = useState<{ contextKey: string; historyId: string } | null>(null);
  const supportDialogRef = useRef<typeof supportDialog>(null);
  const [supportDraft, setSupportDraft] = useState<{ contextKey: string; question: string } | null>(null);
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
      supportDialogRef.current = null;
      setSupportDialog(null);
      setSupportDraft(null);
      setInstructorWorkspaceView(InstructorWorkspaceView.OVERVIEW);
      setBusinessAdminWorkspaceView(BusinessAdminWorkspaceView.OVERVIEW);
    },
  });
  const workspaceContextKey = getWorkspaceContextKey(user?.uid || 'guest', user?.workspaceAccess);
  const workspaceSwitch = useStaffWorkspaceSwitch({ user, onUserChange: setCurrentUser, onComplete: next => {
    supportDialogRef.current = null;
    setSupportDialog(null); setSupportDraft(null); setSupportSource(null);
    setInstructorWorkspaceView(InstructorWorkspaceView.OVERVIEW);
    setBusinessAdminWorkspaceView(BusinessAdminWorkspaceView.OVERVIEW);
    dispatchNavigation({ type: 'go-home', view: getHomeAppRoute(next), historyMode: 'replace' });
  } });
  const wasWorkspaceSwitching = useRef(false);
  useEffect(() => {
    const finished = wasWorkspaceSwitching.current && !workspaceSwitch.switching;
    wasWorkspaceSwitching.current = workspaceSwitch.switching;
    if (!finished) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[data-testid="workspace-switch-error"]')
        || document.querySelector<HTMLElement>('[data-testid="staff-workspace-selector"] select')
        || document.getElementById('study-main-content');
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceSwitch.switching, workspaceContextKey]);
  const announcementFeed = useAnnouncementFeed(Boolean(user), workspaceContextKey);
  const suppressAnnouncementModal = Boolean(user && user.role === UserRole.STUDENT && user.needsOnboarding);
  const isGroupAdminUser = isGroupAdmin(user);
  const supportRole: ProductSupportRole = !user ? 'GUEST' : isGroupAdminUser ? 'GROUP_ADMIN' : user.role;
  const feedbackContextKey = JSON.stringify([user?.uid ?? 'guest', supportRole, user?.organizationId, user?.organizationRole,
    user?.role === UserRole.ADMIN ? 'admin' : isGroupAdminUser ? 'business-admin' : 'instructor', workspaceContextKey]);
  const supportContextKey = JSON.stringify([user?.uid ?? 'guest', supportRole, user?.organizationId, user?.organizationRole,
    currentView, instructorWorkspaceView, businessAdminWorkspaceView, supportSource, workspaceContextKey]);
  const feedbackDraft = supportDraft?.contextKey === feedbackContextKey ? supportDraft.question : undefined;
  const isInstructorWorkspace = Boolean(user && currentView === 'instructor' && !supportSource);
  const workspaceSections = isInstructorWorkspace
    ? (isGroupAdminUser ? BUSINESS_ADMIN_WORKSPACE_SECTIONS : INSTRUCTOR_WORKSPACE_SECTIONS)
    : [];
  const activeWorkspaceSection = isInstructorWorkspace
    ? (isGroupAdminUser ? businessAdminWorkspaceView : instructorWorkspaceView)
    : undefined;

  useEffect(() => {
    const syncSupportLocation = () => {
      setSupportSource(readProductSupportSourceLocation());
      supportDialogRef.current = null;
      setSupportDialog(null);
    };
    window.addEventListener('popstate', syncSupportLocation);
    return () => window.removeEventListener('popstate', syncSupportLocation);
  }, []);
  useEffect(() => {
    // The navigation/auth hooks normalize /public to an app route. Preserve
    // the separately captured evidence URL until the user leaves this page.
    if (supportSource) window.history.replaceState(window.history.state, '', buildProductSupportSourcePath(supportSource));
  }, [supportSource, navigationState]);
  useEffect(() => {
    if (authLoading || supportDialog && supportDialog.contextKey !== supportContextKey) {
      supportDialogRef.current = null;
      setSupportDialog(null);
    }
    if (supportDraft && supportDraft.contextKey !== feedbackContextKey) setSupportDraft(null);
  }, [authLoading, supportContextKey, feedbackContextKey]);

  const openSupportDialog = () => {
    if (authLoading || workspaceSwitch.switching || supportDialogRef.current) return;
    const historyId = crypto.randomUUID();
    const prior = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.pushState({ ...prior, productSupportDialog: historyId }, '', `${window.location.pathname}${window.location.search}`);
    supportDialogRef.current = { contextKey: supportContextKey, historyId };
    setSupportDialog(supportDialogRef.current);
  };
  const closeSupportDialog = () => {
    const dialog = supportDialogRef.current;
    supportDialogRef.current = null;
    setSupportDialog(null);
    if (dialog && window.history.state?.productSupportDialog === dialog.historyId) window.history.back();
  };
  const prepareSupportDraft = (question: string) => {
    if (!user || (user.role !== UserRole.INSTRUCTOR && user.role !== UserRole.ADMIN)) return;
    setSupportDraft({ contextKey: feedbackContextKey, question });
    supportDialogRef.current = null;
    setSupportDialog(null); setSupportSource(null);
    dispatchNavigation({ type: 'go-home', view: user.role === UserRole.ADMIN ? 'admin' : 'instructor', historyMode: 'replace' });
  };
  const leaveSupportSource = () => {
    setSupportSource(null);
    if (user) dispatchNavigation({ type: 'go-home', view: user.role === UserRole.ADMIN ? 'admin' : user.role === UserRole.INSTRUCTOR ? 'instructor' : 'dashboard', historyMode: 'replace' });
    else dispatchNavigation({ type: 'open-public-info', historyMode: 'replace' });
  };
  const logoutAndCloseSupport = () => {
    supportDialogRef.current = null;
    setSupportDialog(null); setSupportDraft(null);
    void handleLogout();
  };

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
    supportDialogRef.current = null;
    setSupportSource(null); setSupportDialog(null);
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
        return <AdminPanel user={user} productFeedbackDraft={feedbackDraft}
          productFeedbackContextKey={feedbackContextKey} onProductFeedbackDraftConsumed={() => setSupportDraft(null)} />;
      case 'instructor':
        return isGroupAdminUser ? (
          <BusinessAdminDashboard
            user={user}
            onSelectBook={openBookTask}
            activeView={businessAdminWorkspaceView}
            onChangeView={setBusinessAdminWorkspaceView}
            productFeedbackDraft={feedbackDraft}
            productFeedbackContextKey={feedbackContextKey}
            onProductFeedbackDraftConsumed={() => setSupportDraft(null)}
          />
        ) : (
          <InstructorDashboard
            user={user}
            onSelectBook={openBookTask}
            activeView={instructorWorkspaceView}
            onChangeView={setInstructorWorkspaceView}
            productFeedbackDraft={feedbackDraft}
            productFeedbackContextKey={feedbackContextKey}
            onProductFeedbackDraftConsumed={() => setSupportDraft(null)}
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
    if (authLoading || workspaceSwitch.switching) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-12 h-12 text-medace-500 animate-spin mb-4" />
          <p role="status" className="text-slate-500">{workspaceSwitch.switching ? '業務画面の権限を確認中...' : '認証中...'}</p>
        </div>
      );
    }

    if (supportSource) return <ProductSupportSourcePage {...supportSource} role={supportRole} onBack={leaveSupportSource} />;

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
        onLogout={logoutAndCloseSupport}
        onResetDemo={isDemoUser ? handleResetDemo : undefined}
        currentView={supportSource ? 'publicInfo' : currentView}
        onChangeView={handleChangeView}
        workspaceSections={workspaceSections}
        activeWorkspaceSection={activeWorkspaceSection}
        onSelectWorkspaceSection={workspaceSections.length > 0 ? handleSelectWorkspaceSection : undefined}
        forceNoIndex={currentView === 'publicRole'}
        immersiveContent={currentView === 'resetPassword'}
        onOpenProductSupport={!authLoading && !workspaceSwitch.switching && currentView !== 'resetPassword' ? openSupportDialog : undefined}
      >
        {workspaceSwitch.error && <p role="alert" tabIndex={-1} data-testid="workspace-switch-error" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{workspaceSwitch.error}</p>}
        {user && !authLoading && !workspaceSwitch.switching && !supportSource && <StaffWorkspaceSelector user={user}
          switching={workspaceSwitch.switching} onSwitch={workspace => { void workspaceSwitch.switchWorkspace(workspace); }} />}
        <Suspense
          key={workspaceContextKey}
          fallback={
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-medace-500" />
              <p className="mt-3 text-sm font-medium">画面を準備中...</p>
            </div>
          }
        >
          {user && !authLoading && logoutError && <div role="alert" data-testid="logout-error" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>{logoutError}</p>
            <button type="button" onClick={logoutAndCloseSupport} className="mt-2 min-h-11 rounded-lg border border-red-300 px-3 font-bold">ログアウトを再試行</button>
          </div>}
          {user && !authLoading && !supportSource && currentView === 'dashboard' && <>
            <GuestLearningImportNotice key={`naru:${user.uid}`} user={user} />
            <GuestTrialImportNotice key={user.uid} user={user} onContinueTrial={() => dispatchNavigation({ type: 'open-guest-trial' })} />
          </>}
          {renderContent()}
        </Suspense>
      </Layout>

      <ProductSupportDialog open={!authLoading && supportDialog?.contextKey === supportContextKey}
        contextKey={supportContextKey} role={supportRole} ready onAsk={requestProductSupport}
        onClose={closeSupportDialog}
        onDraft={user && (user.role === UserRole.INSTRUCTOR || user.role === UserRole.ADMIN) ? prepareSupportDraft : undefined} />

      {user && !authLoading && !supportSource && currentView !== 'publicRole' && !staffLoginCompletionPending && (
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
