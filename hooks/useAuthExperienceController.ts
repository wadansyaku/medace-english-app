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

export const shouldPreserveCurrentRoute = (
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
    case 'englishPractice':
      return nextHomeView === 'dashboard';
    case 'guestTrial':
    case 'guestLearning':
      return nextHomeView === 'dashboard' && !navigationState.authPanelMode;
    case 'resetPassword':
      return true;
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
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const authRequestInFlightRef = useRef(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>(navigationState.authPanelMode || 'LOGIN');
  const [authError, setAuthError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [passwordRecoveryLoading, setPasswordRecoveryLoading] = useState(false);
  const [passwordRecoveryMessage, setPasswordRecoveryMessage] = useState<string | null>(null);
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

  navigationStateRef.current = navigationState;

  useEffect(() => {
    if (navigationState.authPanelMode) setAuthMode(navigationState.authPanelMode);
    setAuthError(null);
    setShowPasswordRecovery(false);
    setPasswordRecoveryMessage(null);
    setPassword('');
    setConfirmPassword('');
  }, [navigationState.authPanelMode]);

  const navigateAfterAuthentication = (loggedInUser: UserProfile) => {
    const currentNavigation = navigationStateRef.current;
    const homeView = getHomeAppRoute(loggedInUser);
    if (shouldPreserveCurrentRoute(currentNavigation, homeView)) {
      if (currentNavigation.authPanelMode) dispatchNavigation({ type: 'close-auth', historyMode: 'replace' });
    } else {
      dispatchNavigation({ type: 'go-home', view: homeView, historyMode: 'replace' });
    }
  };


  useEffect(() => {
    const initSession = async () => {
      try {
        const sessionUser = await sessionService.getSession();
        if (sessionUser) {
          setUser(sessionUser);
          navigateAfterAuthentication(sessionUser);
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
    if (authRequestInFlightRef.current) return;
    authRequestInFlightRef.current = true;
    setAuthError(null);
    const blocksExistingWorkspace = Boolean(user);
    if (blocksExistingWorkspace) setAuthLoading(true);
    setAuthSubmitting(true);
    try {
      const loggedInUser = await sessionService.login(role, demoPassword, organizationRole);
      if (!loggedInUser) {
        setAuthError('ログインに失敗しました。');
        return;
      }
      setUser(loggedInUser);
      navigateAfterAuthentication(loggedInUser);
    } catch (error: any) {
      console.error('Login failed', error);
      setAuthError(error?.message || 'ログインエラーが発生しました。');
    } finally {
      authRequestInFlightRef.current = false;
      setAuthSubmitting(false);
      if (blocksExistingWorkspace) setAuthLoading(false);
    }
  };

  const handleDemoLogin = async (role: UserRole, organizationRole?: OrganizationRole) => {
    if (authRequestInFlightRef.current) return;
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
    if (authRequestInFlightRef.current) return;
    setAuthError(null);
    setPasswordRecoveryMessage(null);

    if (!email.trim() || !password) {
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

    authRequestInFlightRef.current = true;
    setAuthSubmitting(true);
    try {
      const loggedInUser = await sessionService.authenticate(
        email.trim(),
        password,
        authMode === 'SIGNUP',
        undefined,
        authMode === 'SIGNUP' ? displayName.trim() : undefined,
      );
      if (loggedInUser) {
        setUser(loggedInUser);
        navigateAfterAuthentication(loggedInUser);
      } else {
        setAuthError('ログインに失敗しました。入力内容を確認してもう一度お試しください。');
      }
    } catch (error: any) {
      setAuthError(error?.message || '認証エラーが発生しました。');
    } finally {
      authRequestInFlightRef.current = false;
      setAuthSubmitting(false);
    }
  };

  const handleOpenPasswordRecovery = () => {
    if (authRequestInFlightRef.current) return;
    setAuthMode('LOGIN');
    setAuthError(null);
    setPasswordRecoveryMessage(null);
    setShowPasswordRecovery(true);
  };

  const handleClosePasswordRecovery = () => {
    if (authRequestInFlightRef.current) return;
    setAuthError(null);
    setPasswordRecoveryMessage(null);
    setShowPasswordRecovery(false);
  };

  const handleRequestPasswordRecovery = async () => {
    if (authRequestInFlightRef.current) return;
    const recoveryEmail = email.trim();
    setAuthError(null);
    setPasswordRecoveryMessage(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      setAuthError('再設定に使うメールアドレスを入力してください。');
      setShowPasswordRecovery(true);
      return;
    }

    authRequestInFlightRef.current = true;
    setPasswordRecoveryLoading(true);
    try {
      const result = await sessionService.requestPasswordRecovery(recoveryEmail, 'login');
      setPasswordRecoveryMessage(result.message);
      setPassword('');
      setConfirmPassword('');
      setShowPasswordRecovery(true);
    } catch (error: any) {
      setAuthError(error?.message || '再設定リクエストを受け付けられませんでした。');
      setShowPasswordRecovery(true);
    } finally {
      authRequestInFlightRef.current = false;
      setPasswordRecoveryLoading(false);
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    if (authRequestInFlightRef.current) return;
    if (navigationState.authPanelMode === mode) return;
    dispatchNavigation({ type: 'open-auth', mode, historyMode: navigationState.authPanelMode ? 'replace' : 'push' });
    setAuthMode(mode);
    setAuthError(null);
    setPasswordRecoveryMessage(null);
    setShowPasswordRecovery(false);
    setPassword('');
    setConfirmPassword('');
  };

  const closeAuthPanel = () => {
    if (authRequestInFlightRef.current) return;
    dispatchNavigation({ type: 'close-auth', historyMode: 'replace' });
    setAuthError(null);
    setShowPasswordRecovery(false);
    setPasswordRecoveryMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogout = async () => {
    if (authRequestInFlightRef.current) return;
    authRequestInFlightRef.current = true;
    setAuthLoading(true);
    setLogoutError(null);
    try {
      // Keep account switching behind the server session deletion. Otherwise
      // its late completion can close a new form or clear a newer session.
      await sessionService.clearSession();
      setUser(null);
      dispatchNavigation({ type: 'reset' });
      setDisplayName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setAuthError(null);
      setShowPasswordRecovery(false);
      setPasswordRecoveryMessage(null);
      setPasswordRecoveryLoading(false);
      setShowAlternateAccess(false);
      dismissAdminDemoPrompt();
      onLogoutReset?.();
    } catch {
      setLogoutError('ログアウトを確認できませんでした。通信を確認して、もう一度お試しください。');
    } finally {
      authRequestInFlightRef.current = false;
      setAuthLoading(false);
    }
  };

  const authExperienceProps = {
    authMode,
    authPanelMode: navigationState.authPanelMode,
    authSubmitting,
    onOpenAuth: switchAuthMode,
    onCloseAuth: closeAuthPanel,
    displayName,
    email,
    password,
    confirmPassword,
    authError,
    showPasswordRecovery,
    passwordRecoveryLoading,
    passwordRecoveryMessage,
    showAlternateAccess,
    motivationSnapshot: publicMotivationSnapshot,
    motivationLoading: publicMotivationLoading,
    motivationError: publicMotivationError,
    onChangeAuthMode: switchAuthMode,
    onDisplayNameChange: (value: string) => { if (!authRequestInFlightRef.current) setDisplayName(value); },
    onEmailChange: (value: string) => { if (!authRequestInFlightRef.current) setEmail(value); },
    onPasswordChange: (value: string) => { if (!authRequestInFlightRef.current) setPassword(value); },
    onConfirmPasswordChange: (value: string) => { if (!authRequestInFlightRef.current) setConfirmPassword(value); },
    onSubmitEmailAuth: handleEmailAuth,
    onOpenPasswordRecovery: handleOpenPasswordRecovery,
    onClosePasswordRecovery: handleClosePasswordRecovery,
    onRequestPasswordRecovery: handleRequestPasswordRecovery,
    onDemoLogin: handleDemoLogin,
    onToggleAlternateAccess: () => setShowAlternateAccess((previous) => !previous),
  };

  return {
    user,
    setCurrentUser: setUser,
    authLoading,
    logoutError,
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
