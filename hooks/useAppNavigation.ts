import { useCallback, useEffect, useReducer, useRef } from 'react';

import { getHomeViewForUser } from '../config/access';
import type { UserProfile } from '../types';

export type AppRoute = 'login' | 'dashboard' | 'study' | 'quiz' | 'instructor' | 'admin' | 'publicInfo';
export type HomeAppRoute = Extract<AppRoute, 'dashboard' | 'instructor' | 'admin'>;
export type NavigationHistoryMode = 'push' | 'replace' | 'none';

export interface AppNavigationState {
  currentView: AppRoute;
  returnView: HomeAppRoute;
  selectedBook: { bookId: string } | null;
}

export type AppNavigationAction =
  | { type: 'reset'; historyMode?: NavigationHistoryMode }
  | { type: 'go-home'; view: HomeAppRoute; historyMode?: NavigationHistoryMode }
  | { type: 'open-book'; bookId: string; mode: Extract<AppRoute, 'study' | 'quiz'>; historyMode?: NavigationHistoryMode }
  | { type: 'finish-book-view'; historyMode?: NavigationHistoryMode }
  | { type: 'open-public-info'; historyMode?: NavigationHistoryMode }
  | { type: 'close-public-info'; historyMode?: NavigationHistoryMode }
  | { type: 'sync-from-location'; state: AppNavigationState; historyMode?: NavigationHistoryMode };

const initialNavigationState: AppNavigationState = {
  currentView: 'login',
  returnView: 'dashboard',
  selectedBook: null,
};

const normalizePathname = (pathname: string): string => {
  const trimmed = pathname.trim();
  if (!trimmed) return '/';
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
};

const buildHomeState = (view: HomeAppRoute): AppNavigationState => ({
  currentView: view,
  returnView: view,
  selectedBook: null,
});

export const isHomeAppRoute = (view: string): view is HomeAppRoute => (
  view === 'dashboard' || view === 'instructor' || view === 'admin'
);

export const getHomeAppRoute = (user: UserProfile): HomeAppRoute => {
  const view = getHomeViewForUser(user);
  return view === 'admin' || view === 'instructor' ? view : 'dashboard';
};

export const parseNavigationPath = (pathname: string): AppNavigationState => {
  const normalizedPath = normalizePathname(pathname);
  const segments = normalizedPath.split('/').filter(Boolean);
  const [root, bookId] = segments;

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
    return {
      currentView: 'study',
      returnView: 'dashboard',
      selectedBook: { bookId: decodeURIComponent(bookId) },
    };
  }

  if (root === 'quiz' && bookId) {
    return {
      currentView: 'quiz',
      returnView: 'dashboard',
      selectedBook: { bookId: decodeURIComponent(bookId) },
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
      return state.selectedBook ? `/study/${encodeURIComponent(state.selectedBook.bookId)}` : '/dashboard';
    case 'quiz':
      return state.selectedBook ? `/quiz/${encodeURIComponent(state.selectedBook.bookId)}` : '/dashboard';
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
        selectedBook: null,
      };
    case 'open-book':
      return {
        currentView: action.mode,
        returnView: isHomeAppRoute(state.currentView) ? state.currentView : state.returnView,
        selectedBook: { bookId: action.bookId },
      };
    case 'finish-book-view':
      return {
        ...state,
        currentView: state.returnView,
        selectedBook: null,
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
    () => (typeof window === 'undefined' ? initialNavigationState : parseNavigationPath(window.location.pathname)),
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
    const currentPath = normalizePathname(window.location.pathname);
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
        state: parseNavigationPath(window.location.pathname),
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
