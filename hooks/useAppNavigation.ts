import { useCallback, useEffect, useReducer, useRef } from 'react';

import { getHomeViewForUser } from '../config/access';
import { UserRole, type LearningTaskIntent, type UserProfile } from '../types';
import {
  getPublicBusinessRolePath,
  parsePublicBusinessRoleKey,
  type PublicBusinessRoleKey,
} from '../shared/publicBusinessRoles';
import {
  buildTaskQueryString,
  createDefaultTaskIntentFromRoute,
  getTaskRouteBookId,
  parseTaskIntentFromSearch,
} from '../shared/learningTask';

export type AppRoute = 'login' | 'dashboard' | 'study' | 'quiz' | 'englishPractice' | 'instructor' | 'admin' | 'publicInfo' | 'publicRole';
export type HomeAppRoute = Extract<AppRoute, 'dashboard' | 'instructor' | 'admin'>;
export type NavigationHistoryMode = 'push' | 'replace' | 'none';
export type EnglishPracticeRouteLane = 'overview' | 'grammar' | 'translation' | 'reading' | 'writing';

export interface AppNavigationState {
  currentView: AppRoute;
  returnView: HomeAppRoute;
  selectedTask: LearningTaskIntent | null;
  publicRole: PublicBusinessRoleKey | null;
  englishPracticeLane: EnglishPracticeRouteLane | null;
}

export type AppNavigationAction =
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

const parseEnglishPracticeRouteLane = (value?: string): EnglishPracticeRouteLane | null => {
  if (!value) return 'overview';
  if (
    value === 'overview'
    || value === 'grammar'
    || value === 'translation'
    || value === 'reading'
    || value === 'writing'
  ) {
    return value;
  }
  return null;
};

export const isHomeAppRoute = (view: string): view is HomeAppRoute => (
  view === 'dashboard' || view === 'instructor' || view === 'admin'
);

export const getHomeAppRoute = (user: UserProfile): HomeAppRoute => {
  const view = getHomeViewForUser(user);
  return view === 'admin' || view === 'instructor' ? view : 'dashboard';
};

export const canAccessAppView = (user: UserProfile | null, view: AppRoute): boolean => {
  if (view === 'login' || view === 'publicInfo' || view === 'publicRole') {
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

export const parseNavigationPath = (pathname: string, search = ''): AppNavigationState => {
  const normalizedPath = normalizePathname(pathname);
  const segments = normalizedPath.split('/').filter(Boolean);
  const [root, bookId, roleSlug] = segments;
  const taskFromSearch = parseTaskIntentFromSearch(search);

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

  if (normalizedPath === '/dashboard') return buildHomeState('dashboard');
  if (root === 'english-practice') {
    const lane = parseEnglishPracticeRouteLane(bookId);
    if (!lane) return initialNavigationState;
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
    const decodedBookId = decodeURIComponent(bookId);
    return {
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: taskFromSearch || createDefaultTaskIntentFromRoute(decodedBookId, 'study'),
      publicRole: null,
      englishPracticeLane: null,
    };
  }

  if (root === 'quiz' && bookId) {
    const decodedBookId = decodeURIComponent(bookId);
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

export const buildNavigationPath = (state: AppNavigationState): string => {
  switch (state.currentView) {
    case 'publicInfo':
      return '/public';
    case 'publicRole':
      return state.publicRole ? getPublicBusinessRolePath(state.publicRole) : '/public';
    case 'dashboard':
      return '/dashboard';
    case 'englishPractice':
      return state.englishPracticeLane && state.englishPracticeLane !== 'overview'
        ? `/english-practice/${state.englishPracticeLane}`
        : '/english-practice';
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

const getDefaultHistoryMode = (action: AppNavigationAction): NavigationHistoryMode => {
  switch (action.type) {
    case 'reset':
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

const navigationReducer = (
  state: AppNavigationState,
  action: AppNavigationAction,
): AppNavigationState => {
  switch (action.type) {
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
      };
    case 'open-public-role':
      return {
        ...state,
        currentView: 'publicRole',
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
