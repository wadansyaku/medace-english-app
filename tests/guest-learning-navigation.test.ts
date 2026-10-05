import { describe, expect, it } from 'vitest';
import { buildNavigationPath, canAccessAppView, navigationReducer, parseNavigationPath } from '../hooks/useAppNavigation';
import { shouldPreserveCurrentRoute } from '../hooks/useAuthExperienceController';

describe('anonymous Naru navigation', () => {
  it('keeps the legacy trial separate and preserves a guest lesson beneath authentication', () => {
    expect(buildNavigationPath(navigationReducer(parseNavigationPath('/'), { type: 'open-guest-learning' }))).toBe('/start');
    const lesson = parseNavigationPath('/start', '?guest=study');
    const signup = navigationReducer(lesson, { type: 'open-auth', mode: 'SIGNUP' });
    expect(buildNavigationPath(signup)).toBe('/start?guest=study&auth=signup');
    expect(parseNavigationPath('/start', '?guest=study&auth=signup')).toEqual(signup);
    expect(navigationReducer(signup, { type: 'close-auth' })).toEqual(lesson);
    expect(buildNavigationPath(parseNavigationPath('/try'))).toBe('/try');
    expect(parseNavigationPath('/start', '?guest=unknown').guestView).toBeUndefined();
  });
  it('never grants access to authenticated lesson routes and returns signup to onboarding', () => {
    expect(canAccessAppView(null, 'guestLearning')).toBe(true);
    expect(canAccessAppView(null, 'study')).toBe(false);
    expect(canAccessAppView(null, 'quiz')).toBe(false);
    expect(shouldPreserveCurrentRoute(parseNavigationPath('/start'), 'dashboard')).toBe(true);
    expect(shouldPreserveCurrentRoute(parseNavigationPath('/start', '?auth=signup'), 'dashboard')).toBe(false);
    expect(shouldPreserveCurrentRoute(parseNavigationPath('/start'), 'instructor')).toBe(false);
  });
});
