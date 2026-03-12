import { describe, expect, it } from 'vitest';

import { buildNavigationPath, parseNavigationPath } from '../hooks/useAppNavigation';

describe('app navigation paths', () => {
  it('parses top-level and book detail routes', () => {
    expect(parseNavigationPath('/public')).toEqual({
      currentView: 'publicInfo',
      returnView: 'dashboard',
      selectedBook: null,
    });

    expect(parseNavigationPath('/study/book-1')).toEqual({
      currentView: 'study',
      returnView: 'dashboard',
      selectedBook: { bookId: 'book-1' },
    });

    expect(parseNavigationPath('/quiz/book-2')).toEqual({
      currentView: 'quiz',
      returnView: 'dashboard',
      selectedBook: { bookId: 'book-2' },
    });
  });

  it('builds stable paths for routing-backed views', () => {
    expect(buildNavigationPath({
      currentView: 'dashboard',
      returnView: 'dashboard',
      selectedBook: null,
    })).toBe('/dashboard');

    expect(buildNavigationPath({
      currentView: 'study',
      returnView: 'dashboard',
      selectedBook: { bookId: 'starter 120' },
    })).toBe('/study/starter%20120');
  });
});
