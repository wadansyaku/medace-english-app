import { type FormEvent, useEffect, useRef, useState } from 'react';

import { sessionService } from '../services/session';
import { OrganizationRole, UserRole, type UserProfile } from '../types';
import { applyDisplayPreferences, getStoredDisplayPreferences } from '../utils/displayPreferences';
import { isDemoEmail } from '../utils/demo';
import { usePublicMotivationSnapshot } from './usePublicMotivationSnapshot';
import { getHomeAppRoute, type AppNavigationAction, type AppNavigationState } from './useAppNavigation';

type AuthMode = 'LOGIN' | 'SIGNUP';

interface UseAuthExperienceControllerParams {
  navigationState: AppNavigationState;
  dispatchNavigation: (action: AppNavigationAction) => void;
  onLogoutReset?: () => void;
}

const shouldPreserveCurrentRoute = (
  navigationState: AppNavigationState,
  nextHomeView: ReturnType<typeof getHomeAppRoute>,
): boolean => {
  switch (navigationState.currentView) {
    case 'dashboard':
    case 'instructor':
    case 'admin':
      return navigationState.currentView === nextHomeView;
    case 'study':
    case 'quiz':
      return Boolean(navigationState.selectedTask);
    default:
      return false;
  }
};

export const useAuthExperienceController = ({
  navigationState,
  dispatchNavigation,
  onLogoutReset,
}: UseAuthExperienceControllerParams) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAlternateAccess, setShowAlternateAccess] = useState(false);
  const [showAdminDemoPrompt, setShowAdminDemoPrompt] = useState(false);
  const [adminDemoPassword, setAdminDemoPassword] = useState('');
  const [pendingAdminDemoRole, setPendingAdminDemoRole] = useState<{
    role: UserRole;
    organizationRole?: OrganizationRole;
  } | null>(null);
  const {
    snapshot: publicMotivationSnapshot,
    loading: publicMotivationLoading,
    error: publicMotivationError,
  } = usePublicMotivationSnapshot(!user);
  const navigationStateRef = useRef(navigationState);

  useEffect(() => {
    navigationStateRef.current = navigationState;
  }, [navigationState]);

  useEffect(() => {
    const initSession = async () => {
      try {
        const sessionUser = await sessionService.getSession();
        if (sessionUser) {
          setUser(sessionUser);
          const homeView = getHomeAppRoute(sessionUser);
          if (!shouldPreserveCurrentRoute(navigationStateRef.current, homeView)) {
            dispatchNavigation({ type: 'go-home', view: homeView, historyMode: 'replace' });
          }
        }
      } catch (error) {
        console.error('Session restore failed', error);
      } finally {
        setAuthLoading(false);
      }
    };

    void initSession();
  }, [dispatchNavigation]);

  useEffect(() => {
    applyDisplayPreferences(getStoredDisplayPreferences(user?.uid));
  }, [user?.uid]);

  const dismissAdminDemoPrompt = () => {
    setShowAdminDemoPrompt(false);
    setAdminDemoPassword('');
    setPendingAdminDemoRole(null);
  };

  const performDemoLogin = async (
    role: UserRole,
    organizationRole?: OrganizationRole,
    demoPassword?: string,
  ) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const loggedInUser = await sessionService.login(role, demoPassword, organizationRole);
      if (!loggedInUser) {
        setAuthError('ログインに失敗しました。');
        return;
      }
      setUser(loggedInUser);
      const homeView = getHomeAppRoute(loggedInUser);
      if (!shouldPreserveCurrentRoute(navigationState, homeView)) {
        dispatchNavigation({ type: 'go-home', view: homeView, historyMode: 'replace' });
      }
    } catch (error: any) {
      console.error('Login failed', error);
      setAuthError(error?.message || 'ログインエラーが発生しました。');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDemoLogin = async (role: UserRole, organizationRole?: OrganizationRole) => {
    if (role === UserRole.ADMIN) {
      setPendingAdminDemoRole({ role, organizationRole });
      setAdminDemoPassword('');
      setAuthError(null);
      setShowAdminDemoPrompt(true);
      return;
    }

    await performDemoLogin(role, organizationRole);
  };

  const handleAdminDemoSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingAdminDemoRole || !adminDemoPassword.trim()) {
      setAuthError('管理用パスワードを入力してください。');
      return;
    }

    dismissAdminDemoPrompt();
    await performDemoLogin(
      pendingAdminDemoRole.role,
      pendingAdminDemoRole.organizationRole,
      adminDemoPassword.trim(),
    );
  };

  const handleResetDemo = async () => {
    if (!user || !isDemoEmail(user.email)) return;
    await handleDemoLogin(user.role, user.organizationRole);
  };

  const handleEmailAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);

    if (!email || !password) {
      setAuthError('メールアドレスとパスワードを入力してください。');
      return;
    }

    if (authMode === 'SIGNUP') {
      if (!displayName.trim()) {
        setAuthError('表示名を入力してください。');
        return;
      }
      if (password.length < 6) {
        setAuthError('パスワードは6文字以上にしてください。');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('確認用パスワードが一致していません。');
        return;
      }
    }

    setAuthLoading(true);
    try {
      const loggedInUser = await sessionService.authenticate(
        email,
        password,
        authMode === 'SIGNUP',
        undefined,
        authMode === 'SIGNUP' ? displayName.trim() : undefined,
      );
      if (loggedInUser) {
        setUser(loggedInUser);
        const homeView = getHomeAppRoute(loggedInUser);
        if (!shouldPreserveCurrentRoute(navigationState, homeView)) {
          dispatchNavigation({ type: 'go-home', view: homeView, historyMode: 'replace' });
        }
      }
    } catch (error: any) {
      setAuthError(error.message || '認証エラーが発生しました。');
    } finally {
      setAuthLoading(false);
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogout = async () => {
    setUser(null);
    await sessionService.clearSession();
    dispatchNavigation({ type: 'reset' });
    setDisplayName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setAuthError(null);
    setShowAlternateAccess(false);
    dismissAdminDemoPrompt();
    onLogoutReset?.();
  };

  const authExperienceProps = {
    authMode,
    displayName,
    email,
    password,
    confirmPassword,
    authError,
    showAlternateAccess,
    motivationSnapshot: publicMotivationSnapshot,
    motivationLoading: publicMotivationLoading,
    motivationError: publicMotivationError,
    onChangeAuthMode: switchAuthMode,
    onDisplayNameChange: setDisplayName,
    onEmailChange: setEmail,
    onPasswordChange: setPassword,
    onConfirmPasswordChange: setConfirmPassword,
    onSubmitEmailAuth: handleEmailAuth,
    onDemoLogin: handleDemoLogin,
    onToggleAlternateAccess: () => setShowAlternateAccess((previous) => !previous),
  };

  return {
    user,
    setCurrentUser: setUser,
    authLoading,
    authExperienceProps,
    isDemoUser: isDemoEmail(user?.email),
    handleLogout,
    handleResetDemo,
    adminDemoPrompt: {
      open: showAdminDemoPrompt,
      authError,
      password: adminDemoPassword,
      onPasswordChange: setAdminDemoPassword,
      onClose: dismissAdminDemoPrompt,
      onSubmit: handleAdminDemoSubmit,
    },
  };
};

export default useAuthExperienceController;
