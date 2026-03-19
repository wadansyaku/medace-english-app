import { describe, expect, it } from 'vitest';

import { buildNavigationPath, parseNavigationPath } from '../hooks/useAppNavigation';
import { buildTaskQueryString, createDefaultTaskIntentFromRoute, getTaskRouteBookId } from '../shared/learningTask';
import { PUBLIC_BUSINESS_ROLE_KEYS, getPublicBusinessRolePath } from '../shared/publicBusinessRoles';

describe('app navigation paths', () => {
  it('parses top-level and book detail routes', () => {
    expect(parseNavigationPath('/public')).toEqual({
      currentView: 'publicInfo',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
    });

    expect(parseNavigationPath('/study/book-1')).toEqual({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: createDefaultTaskIntentFromRoute('book-1', 'study'),
      publicRole: null,
    });

    expect(parseNavigationPath('/quiz/book-2')).toEqual({
      currentView: 'quiz',
      returnView: 'dashboard',
      selectedTask: createDefaultTaskIntentFromRoute('book-2', 'quiz'),
      publicRole: null,
    });
  });

  it('builds stable paths for routing-backed views', () => {
    expect(buildNavigationPath({
      currentView: 'dashboard',
      returnView: 'dashboard',
      selectedTask: null,
      publicRole: null,
    })).toBe('/dashboard');

    const task = createDefaultTaskIntentFromRoute('starter 120', 'study');
    expect(buildNavigationPath({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: task,
      publicRole: null,
    })).toBe(`/study/${encodeURIComponent(getTaskRouteBookId(task))}${buildTaskQueryString(task)}`);
  });

  it('round-trips public role detail routes', () => {
    for (const roleKey of PUBLIC_BUSINESS_ROLE_KEYS) {
      const path = getPublicBusinessRolePath(roleKey);
      expect(parseNavigationPath(path)).toEqual({
        currentView: 'publicRole',
        returnView: 'dashboard',
        selectedTask: null,
        publicRole: roleKey,
      });
      expect(buildNavigationPath({
        currentView: 'publicRole',
        returnView: 'dashboard',
        selectedTask: null,
        publicRole: roleKey,
      })).toBe(path);
    }
  });
});
