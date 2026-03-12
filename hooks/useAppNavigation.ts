import { useReducer } from 'react';

import { getHomeViewForUser } from '../config/access';
import type { UserProfile } from '../types';

export type AppRoute = 'login' | 'dashboard' | 'study' | 'quiz' | 'instructor' | 'admin' | 'publicInfo';
export type HomeAppRoute = Extract<AppRoute, 'dashboard' | 'instructor' | 'admin'>;

export interface AppNavigationState {
  currentView: AppRoute;
  returnView: HomeAppRoute;
  selectedBook: { bookId: string } | null;
}

export type AppNavigationAction =
  | { type: 'reset' }
  | { type: 'go-home'; view: HomeAppRoute }
  | { type: 'open-book'; bookId: string; mode: Extract<AppRoute, 'study' | 'quiz'> }
  | { type: 'finish-book-view' }
  | { type: 'open-public-info' }
  | { type: 'close-public-info' };

const initialNavigationState: AppNavigationState = {
  currentView: 'login',
  returnView: 'dashboard',
  selectedBook: null,
};

export const isHomeAppRoute = (view: string): view is HomeAppRoute => (
  view === 'dashboard' || view === 'instructor' || view === 'admin'
);

export const getHomeAppRoute = (user: UserProfile): HomeAppRoute => {
  const view = getHomeViewForUser(user);
  return view === 'admin' || view === 'instructor' ? view : 'dashboard';
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
    default:
      return state;
  }
};

export const useAppNavigation = () => {
  const [navigationState, dispatchNavigation] = useReducer(navigationReducer, initialNavigationState);

  return {
    navigationState,
    dispatchNavigation,
  };
};

export default useAppNavigation;
