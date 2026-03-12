import {
  EnglishLevel,
  LearningPreference,
  LearningPreferenceIntensity,
  OrganizationRole,
  SubscriptionPlan,
  UserGrade,
  UserProfile,
  UserRole,
  type BookMetadata,
} from '../../types';
import { getTodayDateKey } from '../../utils/date';
import { buildDemoEmail, getDemoDisplayName } from '../../utils/demo';

export const IDB_MOCK_USERS: UserProfile[] = [
  {
    uid: 'mock-student-free-001',
    displayName: '鈴木 健太',
    role: UserRole.STUDENT,
    email: 'kenta@medace.com',
    grade: UserGrade.JHS2,
    englishLevel: EnglishLevel.A2,
    subscriptionPlan: SubscriptionPlan.TOC_FREE,
    stats: { xp: 1250, level: 12, currentStreak: 5, lastLoginDate: '2023-10-27' },
  },
  {
    uid: 'mock-student-biz-001',
    displayName: '黒田 颯太',
    role: UserRole.STUDENT,
    organizationRole: OrganizationRole.STUDENT,
    email: 'sota@demo-school.jp',
    grade: UserGrade.JHS3,
    englishLevel: EnglishLevel.B1,
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study Demo Academy',
    stats: { xp: 820, level: 8, currentStreak: 3, lastLoginDate: '2023-10-27' },
  },
  {
    uid: 'mock-instructor-001',
    displayName: 'Oak 先生',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.INSTRUCTOR,
    email: 'oak@medace.com',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study Demo Academy',
  },
  {
    uid: 'mock-group-admin-001',
    displayName: '朝比奈 由奈',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.GROUP_ADMIN,
    email: 'manager@medace-demo.jp',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study Demo Academy',
  },
  {
    uid: 'mock-admin-001',
    displayName: 'システム管理者',
    role: UserRole.ADMIN,
    email: 'admin@medace.com',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationName: 'Steady Study HQ',
  },
];

export const IDB_MOCK_ASSIGNMENTS = [
  { studentUid: 'student-biz-1', instructorUid: 'mock-instructor-001' },
  { studentUid: 'student-biz-2', instructorUid: 'mock-instructor-001' },
];

export const defaultLearningPreference = (userUid: string): LearningPreference => ({
  userUid,
  targetExam: '',
  targetScore: '',
  examDate: '',
  weeklyStudyDays: 4,
  dailyStudyMinutes: 20,
  weakSkillFocus: '',
  motivationNote: '',
  intensity: LearningPreferenceIntensity.BALANCED,
  updatedAt: Date.now(),
});

export const createEphemeralDemoUser = (role: UserRole, organizationRole?: OrganizationRole): UserProfile => ({
  uid: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  displayName: getDemoDisplayName(role, organizationRole),
  role,
  organizationRole,
  email: buildDemoEmail(role, organizationRole),
  subscriptionPlan:
    organizationRole
      ? SubscriptionPlan.TOB_PAID
      : role === UserRole.STUDENT
        ? SubscriptionPlan.TOC_FREE
        : SubscriptionPlan.TOB_PAID,
  organizationName:
    role === UserRole.ADMIN
      ? 'Steady Study HQ'
      : organizationRole
        ? 'Steady Study Demo Academy'
        : undefined,
  needsOnboarding: role === UserRole.STUDENT,
  stats: {
    xp: 0,
    level: 1,
    currentStreak: 1,
    lastLoginDate: getTodayDateKey(),
  },
});

export const isBookOwnedByUser = (book: BookMetadata, userUid: string | undefined): boolean => {
  if (!userUid) return false;
  try {
    if (book.description?.includes(userUid)) return true;
    const parsed = JSON.parse(book.description || '{}') as { createdBy?: string };
    return parsed.createdBy === userUid;
  } catch {
    return false;
  }
};
