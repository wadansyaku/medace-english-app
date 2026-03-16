import { useCallback, useEffect, useReducer, useRef } from 'react';

import { getHomeViewForUser } from '../config/access';
import type { LearningTaskIntent, UserProfile } from '../types';
import {
  buildTaskQueryString,
  createDefaultTaskIntentFromRoute,
  getTaskRouteBookId,
  parseTaskIntentFromSearch,
} from '../shared/learningTask';

export type AppRoute = 'login' | 'dashboard' | 'study' | 'quiz' | 'instructor' | 'admin' | 'publicInfo';
export type HomeAppRoute = Extract<AppRoute, 'dashboard' | 'instructor' | 'admin'>;
export type NavigationHistoryMode = 'push' | 'replace' | 'none';

export interface AppNavigationState {
  currentView: AppRoute;
  returnView: HomeAppRoute;
  selectedTask: LearningTaskIntent | null;
}

export type AppNavigationAction =
  | { type: 'reset'; historyMode?: NavigationHistoryMode }
  | { type: 'go-home'; view: HomeAppRoute; historyMode?: NavigationHistoryMode }
  | { type: 'open-task'; task: LearningTaskIntent; historyMode?: NavigationHistoryMode }
  | { type: 'finish-book-view'; historyMode?: NavigationHistoryMode }
  | { type: 'open-public-info'; historyMode?: NavigationHistoryMode }
  | { type: 'close-public-info'; historyMode?: NavigationHistoryMode }
  | { type: 'sync-from-location'; state: AppNavigationState; historyMode?: NavigationHistoryMode };

const initialNavigationState: AppNavigationState = {
  currentView: 'login',
  returnView: 'dashboard',
  selectedTask: null,
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
});

export const isHomeAppRoute = (view: string): view is HomeAppRoute => (
  view === 'dashboard' || view === 'instructor' || view === 'admin'
);

export const getHomeAppRoute = (user: UserProfile): HomeAppRoute => {
  const view = getHomeViewForUser(user);
  return view === 'admin' || view === 'instructor' ? view : 'dashboard';
};

export const parseNavigationPath = (pathname: string, search = ''): AppNavigationState => {
  const normalizedPath = normalizePathname(pathname);
  const segments = normalizedPath.split('/').filter(Boolean);
  const [root, bookId] = segments;
  const taskFromSearch = parseTaskIntentFromSearch(search);

  if (normalizedPath === '/public') {
    return {
      ...initialNavigationState,
      currentView: 'publicInfo',
    };
  }

  if (normalizedPath === '/dashboard') return buildHomeState('dashboard');
  if (normalizedPath === '/instructor') return buildHomeState('instructor');
  if (normalizedPath === '/admin') return buildHomeState('admin');

  if (root === 'study' && bookId) {
    const decodedBookId = decodeURIComponent(bookId);
    return {
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: taskFromSearch || createDefaultTaskIntentFromRoute(decodedBookId, 'study'),
    };
  }

  if (root === 'quiz' && bookId) {
    const decodedBookId = decodeURIComponent(bookId);
    return {
      currentView: 'quiz',
      returnView: 'dashboard',
      selectedTask: taskFromSearch || createDefaultTaskIntentFromRoute(decodedBookId, 'quiz'),
    };
  }

  return initialNavigationState;
};

export const buildNavigationPath = (state: AppNavigationState): string => {
  switch (state.currentView) {
    case 'publicInfo':
      return '/public';
    case 'dashboard':
      return '/dashboard';
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
      };
    case 'open-task':
      return {
        currentView: action.task.mode,
        returnView: isHomeAppRoute(state.currentView) ? state.currentView : state.returnView,
        selectedTask: action.task,
      };
    case 'finish-book-view':
      return {
        ...state,
        currentView: state.returnView,
        selectedTask: null,
      };
    case 'open-public-info':
      return {
        ...state,
        currentView: 'publicInfo',
      };
    case 'close-public-info':
      return {
        ...state,
        currentView: 'login',
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
