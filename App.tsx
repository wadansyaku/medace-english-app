
import React, { Suspense, lazy, useState } from 'react';
import Layout from './components/Layout';
import { OrganizationRole, UserRole, UserProfile } from './types';
import { BusinessAdminWorkspaceView, InstructorWorkspaceView } from './types';
import { isGroupAdmin } from './config/access';
import { BUSINESS_ADMIN_WORKSPACE_SECTIONS, INSTRUCTOR_WORKSPACE_SECTIONS } from './config/workspace';
import { Loader2 } from 'lucide-react';
import AuthExperienceScreen from './components/auth/AuthExperienceScreen';
import AdminDemoPrompt from './components/auth/AdminDemoPrompt';
import { getHomeAppRoute, isHomeAppRoute, type HomeAppRoute, useAppNavigation } from './hooks/useAppNavigation';
import { useAuthExperienceController } from './hooks/useAuthExperienceController';

const Dashboard = lazy(() => import('./components/Dashboard'));
const StudyMode = lazy(() => import('./components/StudyMode'));
const QuizMode = lazy(() => import('./components/QuizMode'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const InstructorDashboard = lazy(() => import('./components/InstructorDashboard'));
const BusinessAdminDashboard = lazy(() => import('./components/BusinessAdminDashboard'));
const Onboarding = lazy(() => import('./components/Onboarding'));

const App: React.FC = () => {
  const { navigationState, dispatchNavigation } = useAppNavigation();
  const [instructorWorkspaceView, setInstructorWorkspaceView] = useState<InstructorWorkspaceView>(InstructorWorkspaceView.OVERVIEW);
  const [businessAdminWorkspaceView, setBusinessAdminWorkspaceView] = useState<BusinessAdminWorkspaceView>(BusinessAdminWorkspaceView.OVERVIEW);
  const { currentView, selectedBook } = navigationState;
  const {
    user,
    setCurrentUser,
    authLoading,
    authExperienceProps,
    isDemoUser,
    handleLogout,
    handleResetDemo,
    adminDemoPrompt,
  } = useAuthExperienceController({
    dispatchNavigation,
    onLogoutReset: () => {
      setInstructorWorkspaceView(InstructorWorkspaceView.OVERVIEW);
      setBusinessAdminWorkspaceView(BusinessAdminWorkspaceView.OVERVIEW);
    },
  });

  const handleBookSelect = (bookId: string, mode: 'study' | 'quiz') => {
    dispatchNavigation({ type: 'open-book', bookId, mode });
  };

  const handleSessionComplete = (updatedUser: UserProfile) => {
    setCurrentUser(updatedUser);
    dispatchNavigation({ type: 'finish-book-view' });
  };

  // --- Render Views ---
  const renderContent = () => {
    if (authLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-12 h-12 text-medace-500 animate-spin mb-4" />
          <p className="text-slate-500">認証中...</p>
        </div>
      );
    }

    if (!user) {
      return (
        <AuthExperienceScreen
          currentView={currentView === 'publicInfo' ? 'publicInfo' : 'login'}
          {...authExperienceProps}
          onOpenPublicInfo={() => dispatchNavigation({ type: 'open-public-info' })}
          onClosePublicInfo={() => dispatchNavigation({ type: 'close-public-info' })}
        />
      );
    }

    // --- Onboarding Check ---
    if (user.needsOnboarding) {
      return (
        <Onboarding 
          user={user} 
          onComplete={(updated) => {
            setCurrentUser(updated);
            dispatchNavigation({ type: 'go-home', view: 'dashboard' });
          }} 
        />
      );
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={user} onSelectBook={handleBookSelect} onUserUpdate={setCurrentUser} />;
      case 'study':
        return selectedBook ? (
          <StudyMode 
            user={user} 
            bookId={selectedBook.bookId} 
            onBack={() => dispatchNavigation({ type: 'finish-book-view' })}
            onSessionComplete={handleSessionComplete}
          />
        ) : null;
      case 'quiz':
        return selectedBook ? (
          <QuizMode 
            user={user} 
            bookId={selectedBook.bookId} 
            onBack={() => dispatchNavigation({ type: 'finish-book-view' })} 
          />
        ) : null;
      case 'admin':
        return user.role === UserRole.ADMIN ? <AdminPanel /> : <div className="p-8 text-center text-red-500">アクセス権限がありません</div>;
      case 'instructor':
        return user.role === UserRole.INSTRUCTOR
          ? (isGroupAdmin(user)
            ? <BusinessAdminDashboard user={user} onSelectBook={handleBookSelect} activeView={businessAdminWorkspaceView} onChangeView={setBusinessAdminWorkspaceView} />
            : <InstructorDashboard user={user} onSelectBook={handleBookSelect} activeView={instructorWorkspaceView} onChangeView={setInstructorWorkspaceView} />)
          : <div className="p-8 text-center text-red-500">アクセス権限がありません</div>;
      default:
        return <Dashboard user={user} onSelectBook={handleBookSelect} onUserUpdate={setCurrentUser} />;
    }
  };

  const workspaceSections = user && currentView === 'instructor'
    ? (isGroupAdmin(user) ? BUSINESS_ADMIN_WORKSPACE_SECTIONS : INSTRUCTOR_WORKSPACE_SECTIONS)
    : [];
  const activeWorkspaceSection = user && currentView === 'instructor'
    ? (isGroupAdmin(user) ? businessAdminWorkspaceView : instructorWorkspaceView)
    : undefined;
  const handleSelectWorkspaceSection = (section: string) => {
    if (!user || currentView !== 'instructor') return;
    if (isGroupAdmin(user)) {
      setBusinessAdminWorkspaceView(section as BusinessAdminWorkspaceView);
      return;
    }
    setInstructorWorkspaceView(section as InstructorWorkspaceView);
  };
  const handleChangeView = (view: string) => {
    if (view === 'login') {
      dispatchNavigation({ type: 'close-public-info' });
      return;
    }
    if (!isHomeAppRoute(view)) return;
    dispatchNavigation({ type: 'go-home', view });
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
      >
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-medace-500" />
              <p className="mt-3 text-sm font-medium">画面を準備中...</p>
            </div>
          }
        >
          {renderContent()}
        </Suspense>
      </Layout>

      {adminDemoPrompt.open && <AdminDemoPrompt {...adminDemoPrompt} />}
    </>
  );
};

export default App;
