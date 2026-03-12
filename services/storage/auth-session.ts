import {
  OrganizationRole,
  SubscriptionPlan,
  UserProfile,
  UserRole,
  UserStats,
} from '../../types';
import { getRelativeDateKey, getTodayDateKey } from '../../utils/date';
import {
  createEphemeralDemoUser,
  IDB_MOCK_USERS,
} from './mockData';
import {
  deleteStoreRecord,
  GetStore,
  putStoreRecord,
  readStoreRecord,
  STORES,
  type StoredSessionRecord,
} from './idb-support';

export interface AuthSessionContext {
  getStore: GetStore;
}

const SESSION_KEY = 'current';

const updateStreak = (user: UserProfile): UserProfile => {
  const today = getTodayDateKey();
  let stats: UserStats = user.stats || { xp: 0, level: 1, currentStreak: 0, lastLoginDate: '' };
  if (stats.lastLoginDate !== today) {
    const yesterday = getRelativeDateKey(-1);
    if (stats.lastLoginDate === yesterday) stats.currentStreak += 1;
    else stats.currentStreak = 1;
    stats.lastLoginDate = today;
  }
  return { ...user, stats };
};

export const login = async (
  context: AuthSessionContext,
  role: UserRole,
  demoPassword?: string,
  organizationRole?: OrganizationRole,
): Promise<UserProfile | null> => {
  if (role === UserRole.ADMIN && demoPassword !== 'admin') return null;
  const demoUser = createEphemeralDemoUser(role, organizationRole);
  await saveSession(context, demoUser);
  return demoUser;
};

export const authenticate = async (
  context: AuthSessionContext,
  email: string,
  _password: string,
  isSignUp: boolean,
  role?: UserRole,
  displayName?: string,
): Promise<UserProfile | null> => {
  if (isSignUp) {
    const createdUser: UserProfile = {
      uid: `mock-user-${Date.now()}`,
      displayName: displayName?.trim() || email.split('@')[0],
      role: role || UserRole.STUDENT,
      email,
      subscriptionPlan: SubscriptionPlan.TOC_FREE,
      needsOnboarding: (role || UserRole.STUDENT) === UserRole.STUDENT,
    };
    await saveSession(context, createdUser);
    return createdUser;
  }

  const matchedUser = IDB_MOCK_USERS.find((candidate) => candidate.email === email) || IDB_MOCK_USERS[0];
  await saveSession(context, matchedUser);
  return matchedUser;
};

export const saveSession = async (context: AuthSessionContext, user: UserProfile): Promise<void> => {
  const store = await context.getStore(STORES.SESSION, 'readwrite');
  await putStoreRecord(store, { key: SESSION_KEY, user: updateStreak(user) });
};

export const updateSessionUser = async (context: AuthSessionContext, user: UserProfile): Promise<void> => {
  const store = await context.getStore(STORES.SESSION, 'readwrite');
  await putStoreRecord(store, { key: SESSION_KEY, user });
};

export const clearSession = async (context: AuthSessionContext): Promise<void> => {
  const store = await context.getStore(STORES.SESSION, 'readwrite');
  await deleteStoreRecord(store, SESSION_KEY);
};

export const getSession = async (context: AuthSessionContext): Promise<UserProfile | null> => {
  const store = await context.getStore(STORES.SESSION);
  const record = await readStoreRecord<StoredSessionRecord>(store, SESSION_KEY);
  return record?.user || null;
};

export const addXP = async (
  context: AuthSessionContext,
  user: UserProfile,
  amount: number,
): Promise<{ user: UserProfile; leveledUp: boolean; }> => {
  if (!user.stats) user.stats = { xp: 0, level: 1, currentStreak: 1, lastLoginDate: getTodayDateKey() };

  let { xp, level } = user.stats;
  xp += amount;
  const xpToNextLevel = level * 100;
  let leveledUp = false;

  if (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    leveledUp = true;
  }

  const updatedUser = {
    ...user,
    stats: {
      ...user.stats,
      xp,
      level,
    },
  };

  await updateSessionUser(context, updatedUser);
  return { user: updatedUser, leveledUp };
};
