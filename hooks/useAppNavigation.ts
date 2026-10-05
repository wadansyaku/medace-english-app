import { useCallback, useEffect, useReducer, useRef } from 'react';

import { getHomeViewForUser } from '../config/access';
import { UserRole, type LearningTaskIntent, type UserProfile } from '../types';
import {
  getPublicBusinessRoleDirectPath,
  parsePublicBusinessRoleDirectPath,
  parsePublicBusinessRoleKey,
  SERVICE_ADMIN_ACCESS_PATH,
  type PublicBusinessRoleKey,
} from '../shared/publicBusinessRoles';
import {
  buildTaskQueryString,
  createDefaultTaskIntentFromRoute,
  getTaskRouteBookId,
  parseTaskIntentFromSearch,
} from '../shared/learningTask';
import {
  ENGLISH_PRACTICE_LANE_IDS,
  type EnglishPracticeRouteLaneId,
} from '../utils/englishPracticeProgress';

export type AppRoute = 'login' | 'guestLearning' | 'guestTrial' | 'resetPassword' | 'dashboard' | 'study' | 'quiz' | 'englishPractice' | 'instructor' | 'admin' | 'publicInfo' | 'publicRole';
export type HomeAppRoute = Extract<AppRoute, 'dashboard' | 'instructor' | 'admin'>;
export type AuthPanelMode = 'LOGIN' | 'SIGNUP';
export type NavigationHistoryMode = 'push' | 'replace' | 'none';
export type EnglishPracticeRouteLane = EnglishPracticeRouteLaneId;

export interface AppNavigationState {
  guestView?: 'study' | 'practice' | 'books';
  authPanelMode?: AuthPanelMode;
  currentView: AppRoute;
  returnView: HomeAppRoute;
  selectedTask: LearningTaskIntent | null;
  publicRole: PublicBusinessRoleKey | null;
  englishPracticeLane: EnglishPracticeRouteLane | null;
  passwordResetToken?: string | null;
}

export type AppNavigationAction =
  | { type: 'open-guest-learning'; historyMode?: NavigationHistoryMode }
  | { type: 'open-guest-trial'; historyMode?: NavigationHistoryMode }
  | { type: 'open-auth'; mode: AuthPanelMode; historyMode?: NavigationHistoryMode }
  | { type: 'close-auth'; historyMode?: NavigationHistoryMode }
  | { type: 'reset'; historyMode?: NavigationHistoryMode }
  | { type: 'go-home'; view: HomeAppRoute; historyMode?: NavigationHistoryMode }
  | { type: 'open-english-practice'; lane?: EnglishPracticeRouteLane; historyMode?: NavigationHistoryMode }
  | { type: 'open-task'; task: LearningTaskIntent; historyMode?: NavigationHistoryMode }
  | { type: 'finish-book-view'; historyMode?: NavigationHistoryMode }
  | { type: 'open-public-info'; historyMode?: NavigationHistoryMode }
  | { type: 'open-public-role'; role: PublicBusinessRoleKey; historyMode?: NavigationHistoryMode }
  | { type: 'close-public-info'; historyMode?: NavigationHistoryMode }
  | { type: 'close-public-role'; historyMode?: NavigationHistoryMode }
  | { type: 'sync-from-location'; state: AppNavigationState; historyMode?: NavigationHistoryMode };

const initialNavigationState: AppNavigationState = {
  currentView: 'login',
  returnView: 'dashboard',
  selectedTask: null,
  publicRole: null,
  englishPracticeLane: null,
};

const normalizePathname = (pathname: string): string => {
  const trimmed = pathname.trim();
  if (!trimmed) return '/';
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
};

const buildHomeState = (view: HomeAppRoute): AppNavigationState => ({
  currentView: view,
  returnView: view,
  selectedTask: null,
  publicRole: null,
  englishPracticeLane: null,
});

const ENGLISH_PRACTICE_ROUTE_LANE_IDS = ['overview', ...ENGLISH_PRACTICE_LANE_IDS] as const;

export const isEnglishPracticeRouteLane = (value: string): value is EnglishPracticeRouteLane => (
  (ENGLISH_PRACTICE_ROUTE_LANE_IDS as readonly string[]).includes(value)
);

const parseEnglishPracticeRouteLane = (value?: string): EnglishPracticeRouteLane | null => {
  if (!value) return 'overview';
  return isEnglishPracticeRouteLane(value) ? value : null;
};

export const isHomeAppRoute = (view: string): view is HomeAppRoute => (
  view === 'dashboard' || view === 'instructor' || view === 'admin'
);

export const getHomeAppRoute = (user: UserProfile): HomeAppRoute => {
  const view = getHomeViewForUser(user);
  return view === 'admin' || view === 'instructor' ? view : 'dashboard';
};

export const canAccessAppView = (user: UserProfile | null, view: AppRoute): boolean => {
  if (view === 'login' || view === 'guestLearning' || view === 'guestTrial' || view === 'resetPassword' || view === 'publicInfo' || view === 'publicRole') {
    return true;
  }
  if (!user) {
    return false;
  }
  if (view === 'admin') {
    return user.role === UserRole.ADMIN;
  }
  if (view === 'instructor') {
    return user.role === UserRole.INSTRUCTOR;
  }
  if (view === 'englishPractice') {
    return user.role === UserRole.STUDENT;
  }
  return true;
};

const parseBaseNavigationPath = (pathname: string, search = ''): AppNavigationState => {
  const normalizedPath = normalizePathname(pathname);
  const segments = normalizedPath.split('/').filter(Boolean);
  const [root, bookId, roleSlug] = segments;
  const taskFromSearch = parseTaskIntentFromSearch(search);
  const directPublicRole = parsePublicBusinessRoleDirectPath(normalizedPath);

  if (directPublicRole) {
    return {
      ...initialNavigationState,
      currentView: 'publicRole',
      publicRole: directPublicRole,
    };
  }

  if (root === 'public' && bookId === 'roles' && roleSlug) {
    const publicRole = parsePublicBusinessRoleKey(roleSlug);
    if (publicRole) {
      return {
        ...initialNavigationState,
        currentView: 'publicRole',
        publicRole,
      };
    }
    return {
      ...initialNavigationState,
      currentView: 'publicInfo',
    };
  }

  if (normalizedPath === '/public') {
    return {
      ...initialNavigationState,
      currentView: 'publicInfo',
    };
  }

  if (normalizedPath === SERVICE_ADMIN_ACCESS_PATH) {
    return {
      ...initialNavigationState,
      currentView: 'publicRole',
      publicRole: 'service-admin',
    };
  }

  if (normalizedPath === '/reset-password') {
    const params = new URLSearchParams(search);
    return {
      ...initialNavigationState,
      currentView: 'resetPassword',
      passwordResetToken: params.get('token') || null,
    };
  }

  if (normalizedPath === '/dashboard') return buildHomeState('dashboard');
  if (normalizedPath === '/try') return { ...initialNavigationState, currentView: 'guestTrial' };
  if (normalizedPath === '/start') {
    const guestView = new URLSearchParams(search).get('guest');
    return { ...initialNavigationState, currentView: 'guestLearning',
      ...(guestView === 'study' || guestView === 'practice' || guestView === 'books' ? { guestView } : {}) };
  }
  if (root === 'english-practice') {
    const lane = parseEnglishPracticeRouteLane(bookId);
    if (!lane) return initialNavigationState;
    if (lane === 'overview') return buildHomeState('dashboard');
    return {
      currentView: 'englishPractice',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: lane,
    };
  }
  if (normalizedPath === '/instructor') return buildHomeState('instructor');
  if (normalizedPath === '/admin') return buildHomeState('admin');

  if (root === 'study' && bookId) {
    let decodedBookId: string;
    try { decodedBookId = decodeURIComponent(bookId); } catch { return initialNavigationState; }
    return {
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: taskFromSearch || createDefaultTaskIntentFromRoute(decodedBookId, 'study'),
      publicRole: null,
      englishPracticeLane: null,
    };
  }

  if (root === 'quiz' && bookId) {
    let decodedBookId: string;
    try { decodedBookId = decodeURIComponent(bookId); } catch { return initialNavigationState; }
    return {
      currentView: 'quiz',
      returnView: 'dashboard',
      selectedTask: taskFromSearch || createDefaultTaskIntentFromRoute(decodedBookId, 'quiz'),
      publicRole: null,
      englishPracticeLane: null,
    };
  }

  return initialNavigationState;
};

const buildBaseNavigationPath = (state: AppNavigationState): string => {
  switch (state.currentView) {
    case 'guestLearning':
      return state.guestView ? `/start?guest=${state.guestView}` : '/start';
    case 'guestTrial':
      return '/try';
    case 'publicInfo':
      return '/public';
    case 'publicRole':
      return state.publicRole ? getPublicBusinessRoleDirectPath(state.publicRole) : '/public';
    case 'resetPassword': {
      const token = state.passwordResetToken ? `?token=${encodeURIComponent(state.passwordResetToken)}` : '';
      return `/reset-password${token}`;
    }
    case 'dashboard':
      return '/dashboard';
    case 'englishPractice':
      return state.englishPracticeLane && state.englishPracticeLane !== 'overview'
        ? `/english-practice/${state.englishPracticeLane}`
        : '/dashboard';
    case 'instructor':
      return '/instructor';
    case 'admin':
      return '/admin';
    case 'study':
      return state.selectedTask
        ? `/study/${encodeURIComponent(getTaskRouteBookId(state.selectedTask))}${buildTaskQueryString(state.selectedTask)}`
        : '/dashboard';
    case 'quiz':
      return state.selectedTask
        ? `/quiz/${encodeURIComponent(getTaskRouteBookId(state.selectedTask))}${buildTaskQueryString(state.selectedTask)}`
        : '/dashboard';
    case 'login':
    default:
      return '/';
  }
};

// The auth form is a routed overlay. Preserve the intended lesson and its query
// when opening it so Back/Forward and a copied auth link reconstruct the same UI.
export const parseNavigationPath = (pathname: string, search = ''): AppNavigationState => {
  const state = parseBaseNavigationPath(pathname, search);
  if (state.currentView === 'resetPassword') return state;
  const mode = new URLSearchParams(search).get('auth');
  return mode === 'login' || mode === 'signup'
    ? { ...state, authPanelMode: mode === 'login' ? 'LOGIN' : 'SIGNUP' }
    : state;
};

export const buildNavigationPath = (state: AppNavigationState): string => {
  const path = buildBaseNavigationPath(state);
  if (!state.authPanelMode || state.currentView === 'resetPassword') return path;
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set('auth', state.authPanelMode === 'LOGIN' ? 'login' : 'signup');
  return `${pathname}?${params.toString()}`;
};

const getDefaultHistoryMode = (action: AppNavigationAction): NavigationHistoryMode => {
  switch (action.type) {
    case 'reset':
    case 'close-auth':
    case 'finish-book-view':
    case 'close-public-info':
    case 'close-public-role':
      return 'replace';
    case 'sync-from-location':
      return 'none';
    default:
      return 'push';
  }
};

export const navigationReducer = (
  state: AppNavigationState,
  action: AppNavigationAction,
): AppNavigationState => {
  switch (action.type) {
    case 'open-guest-learning':
      return { ...initialNavigationState, currentView: 'guestLearning' };
    case 'open-guest-trial':
      return { ...initialNavigationState, currentView: 'guestTrial' };
    case 'open-auth':
      return { ...state, authPanelMode: action.mode };
    case 'close-auth': {
      const { authPanelMode: _authPanelMode, ...rest } = state;
      return rest;
    }
    case 'reset':
      return initialNavigationState;
    case 'go-home':
      return {
        currentView: action.view,
        returnView: action.view,
        selectedTask: null,
        publicRole: null,
        englishPracticeLane: null,
      };
    case 'open-english-practice':
      if (!action.lane || action.lane === 'overview') {
        return buildHomeState('dashboard');
      }
      return {
        currentView: 'englishPractice',
        returnView: isHomeAppRoute(state.currentView) ? state.currentView : state.returnView,
        selectedTask: null,
        publicRole: null,
        englishPracticeLane: action.lane ?? 'overview',
      };
    case 'open-task':
      return {
        currentView: action.task.mode,
        returnView: isHomeAppRoute(state.currentView) ? state.currentView : state.returnView,
        selectedTask: action.task,
        publicRole: null,
        englishPracticeLane: null,
      };
    case 'finish-book-view':
      return {
        ...state,
        currentView: state.returnView,
        selectedTask: null,
        publicRole: null,
        englishPracticeLane: null,
      };
    case 'open-public-info':
      return {
        ...state,
        currentView: 'publicInfo',
        publicRole: null,
        englishPracticeLane: null,
        authPanelMode: undefined,
      };
    case 'open-public-role':
      return {
        ...state,
        currentView: 'publicRole',
        authPanelMode: undefined,
        publicRole: action.role,
        englishPracticeLane: null,
      };
    case 'close-public-info':
      return {
        ...initialNavigationState,
      };
    case 'close-public-role':
      return {
        ...state,
        currentView: 'publicInfo',
        publicRole: null,
        englishPracticeLane: null,
        authPanelMode: undefined,
      };
    case 'sync-from-location':
      return action.state;
    default:
      return state;
  }
};

export const useAppNavigation = () => {
  const [navigationState, baseDispatchNavigation] = useReducer(
    navigationReducer,
    initialNavigationState,
    () => (typeof window === 'undefined'
      ? initialNavigationState
      : parseNavigationPath(window.location.pathname, window.location.search)),
  );
  const pendingHistoryModeRef = useRef<NavigationHistoryMode>('replace');
  const hasBoundHistoryRef = useRef(false);

  const dispatchNavigation = useCallback((action: AppNavigationAction) => {
    pendingHistoryModeRef.current = action.historyMode ?? getDefaultHistoryMode(action);
    baseDispatchNavigation(action);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nextPath = buildNavigationPath(navigationState);
    const currentPath = `${normalizePathname(window.location.pathname)}${window.location.search}`;
    const historyMode = hasBoundHistoryRef.current ? pendingHistoryModeRef.current : 'replace';

    hasBoundHistoryRef.current = true;
    pendingHistoryModeRef.current = 'none';

    if (historyMode === 'none') return;
    if (historyMode === 'replace') {
      window.history.replaceState(null, '', nextPath);
      return;
    }
    if (currentPath !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
  }, [navigationState]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncFromLocation = () => {
      pendingHistoryModeRef.current = 'none';
      baseDispatchNavigation({
        type: 'sync-from-location',
        state: parseNavigationPath(window.location.pathname, window.location.search),
      });
    };

    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, []);

  return {
    navigationState,
    dispatchNavigation,
  };
};

export default useAppNavigation;
