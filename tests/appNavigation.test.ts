import { describe, expect, it } from 'vitest';

import { buildNavigationPath, parseNavigationPath } from '../hooks/useAppNavigation';
import { buildTaskQueryString, createDefaultTaskIntentFromRoute, getTaskRouteBookId } from '../shared/learningTask';

describe('app navigation paths', () => {
  it('parses top-level and book detail routes', () => {
    expect(parseNavigationPath('/public')).toEqual({
      currentView: 'publicInfo',
      returnView: 'dashboard',
      selectedTask: null,
    });

    expect(parseNavigationPath('/study/book-1')).toEqual({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: createDefaultTaskIntentFromRoute('book-1', 'study'),
    });

    expect(parseNavigationPath('/quiz/book-2')).toEqual({
      currentView: 'quiz',
      returnView: 'dashboard',
      selectedTask: createDefaultTaskIntentFromRoute('book-2', 'quiz'),
    });
  });

  it('builds stable paths for routing-backed views', () => {
    expect(buildNavigationPath({
      currentView: 'dashboard',
      returnView: 'dashboard',
      selectedTask: null,
    })).toBe('/dashboard');

    const task = createDefaultTaskIntentFromRoute('starter 120', 'study');
    expect(buildNavigationPath({
      currentView: 'study',
      returnView: 'dashboard',
      selectedTask: task,
    })).toBe(`/study/${encodeURIComponent(getTaskRouteBookId(task))}${buildTaskQueryString(task)}`);
  });
});
