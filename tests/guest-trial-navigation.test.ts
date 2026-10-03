import { describe, expect, it } from 'vitest';
import { buildNavigationPath, canAccessAppView, navigationReducer, parseNavigationPath } from '../hooks/useAppNavigation';
import { shouldPreserveCurrentRoute } from '../hooks/useAuthExperienceController';

describe('anonymous trial navigation', () => {
  it('has one unprivileged route and preserves its auth overlay through copied URLs', () => {
    const guest = navigationReducer(parseNavigationPath('/'), { type: 'open-guest-trial' });
    expect(buildNavigationPath(guest)).toBe('/try');
    expect(canAccessAppView(null, 'guestTrial')).toBe(true);
    expect(canAccessAppView(null, 'study')).toBe(false);
    expect(canAccessAppView(null, 'quiz')).toBe(false);
    const signup = navigationReducer(guest, { type: 'open-auth', mode: 'SIGNUP' });
    expect(buildNavigationPath(signup)).toBe('/try?auth=signup');
    expect(parseNavigationPath('/try', '?auth=signup')).toEqual(signup);
    expect(navigationReducer(signup, { type: 'close-auth' })).toEqual(guest);
  });
  it('restores an authenticated trial but returns a new signup to the onboarding choice', () => {
    const trial = parseNavigationPath('/try');
    expect(shouldPreserveCurrentRoute(trial, 'dashboard')).toBe(true);
    expect(shouldPreserveCurrentRoute(trial, 'instructor')).toBe(false);
    expect(shouldPreserveCurrentRoute(parseNavigationPath('/try', '?auth=signup'), 'dashboard')).toBe(false);
    expect(shouldPreserveCurrentRoute(parseNavigationPath('/try', '?auth=login'), 'dashboard')).toBe(false);
  });
});
