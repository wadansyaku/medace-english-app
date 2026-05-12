import { describe, expect, it } from 'vitest';

import { buildNavigationPath, canAccessAppView, parseNavigationPath } from '../hooks/useAppNavigation';
import { shouldPreserveCurrentRoute } from '../hooks/useAuthExperienceController';
import {
  buildTaskQueryString,
  createDefaultTaskIntentFromRoute,
  createTodayFocusTaskIntent,
  getTaskRouteBookId,
} from '../shared/learningTask';
import { PUBLIC_BUSINESS_ROLE_KEYS, getPublicBusinessRolePath } from '../shared/publicBusinessRoles';
import { UserRole, type UserProfile } from '../types';

const createUser = (role: UserRole): UserProfile => ({
  uid: `user-${role.toLowerCase()}`,
  displayName: role,
  role,
  email: `${role.toLowerCase()}@example.test`,
});

describe('app navigation paths', () => {
  it('parses top-level and book detail routes', () => {
    expect(parseNavigationPath('/public')).toEqual({
      currentView: 'publicInfo',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: null,
    });

    expect(parseNavigationPath('/study/book-1')).toEqual({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: createDefaultTaskIntentFromRoute('book-1', 'study'),
      publicRole: null,
      englishPracticeLane: null,
    });

    expect(parseNavigationPath('/quiz/book-2')).toEqual({
      currentView: 'quiz',
      returnView: 'dashboard',
      selectedTask: createDefaultTaskIntentFromRoute('book-2', 'quiz'),
      publicRole: null,
      englishPracticeLane: null,
    });

    expect(parseNavigationPath('/english-practice')).toEqual({
      currentView: 'dashboard',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: null,
    });

    expect(parseNavigationPath('/english-practice/overview')).toEqual({
      currentView: 'dashboard',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: null,
    });

    expect(parseNavigationPath('/english-practice/grammar')).toEqual({
      currentView: 'englishPractice',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: 'grammar',
    });

    expect(parseNavigationPath('/english-practice/writing')).toEqual({
      currentView: 'englishPractice',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: 'writing',
    });
  });

  it('builds stable paths for routing-backed views', () => {
    expect(buildNavigationPath({
      currentView: 'dashboard',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: null,
    })).toBe('/dashboard');

    const task = createDefaultTaskIntentFromRoute('starter 120', 'study');
    expect(buildNavigationPath({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: task,
      publicRole: null,
      englishPracticeLane: null,
    })).toBe(`/study/${encodeURIComponent(getTaskRouteBookId(task))}${buildTaskQueryString(task)}`);

    expect(buildNavigationPath({
      currentView: 'englishPractice',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: 'grammar',
    })).toBe('/english-practice/grammar');

    expect(buildNavigationPath({
      currentView: 'englishPractice',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: 'overview',
    })).toBe('/dashboard');
  });

  it('keeps the english practice workspace student-only even for direct URLs', () => {
    expect(canAccessAppView(createUser(UserRole.STUDENT), 'englishPractice')).toBe(true);
    expect(canAccessAppView(createUser(UserRole.INSTRUCTOR), 'englishPractice')).toBe(false);
    expect(canAccessAppView(createUser(UserRole.ADMIN), 'englishPractice')).toBe(false);
  });

  it('preserves a direct english practice URL only for student home sessions', () => {
    expect(shouldPreserveCurrentRoute({
      currentView: 'englishPractice',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: null,
    }, 'dashboard')).toBe(true);

    expect(shouldPreserveCurrentRoute({
      currentView: 'englishPractice',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
      englishPracticeLane: null,
    }, 'instructor')).toBe(false);
  });

  it('round-trips task query state for smart study routes', () => {
    const task = createTodayFocusTaskIntent();
    const path = buildNavigationPath({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: task,
      publicRole: null,
      englishPracticeLane: null,
    });
    const url = new URL(path, 'https://example.test');

    expect(parseNavigationPath(url.pathname, url.search)).toEqual({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: task,
      publicRole: null,
      englishPracticeLane: null,
    });
  });

  it('round-trips public role detail routes', () => {
    for (const roleKey of PUBLIC_BUSINESS_ROLE_KEYS) {
      const path = getPublicBusinessRolePath(roleKey);
      expect(parseNavigationPath(path)).toEqual({
        currentView: 'publicRole',
        returnView: 'dashboard',
        selectedTask: null,
        publicRole: roleKey,
        englishPracticeLane: null,
      });
      expect(buildNavigationPath({
        currentView: 'publicRole',
        returnView: 'dashboard',
        selectedTask: null,
        publicRole: roleKey,
        englishPracticeLane: null,
      })).toBe(path);
    }
  });
});
