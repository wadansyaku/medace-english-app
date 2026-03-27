import {
  AnnouncementAudienceRole,
  AnnouncementSeverity,
  CommercialRequestKind,
  CommercialRequestStatus,
  CommercialWorkspaceRole,
  EnglishLevel,
  LearningPreference,
  LearningPreferenceIntensity,
  OrganizationRole,
  ProductAnnouncement,
  SubscriptionPlan,
  TeachingFormat,
  type CommercialRequest,
  UserGrade,
  UserProfile,
  UserRole,
  type BookMetadata,
} from '../../types';
import { getTodayDateKey } from '../../utils/date';
import { buildDemoEmail, getDemoDisplayName } from '../../utils/demo';

export const IDB_MOCK_ORGANIZATION_IDS = {
  DEMO_ACADEMY: 'org_demo_academy',
  HQ: 'org_steady_study_hq',
} as const;

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
    organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
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
    organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    organizationName: 'Steady Study Demo Academy',
  },
  {
    uid: 'mock-group-admin-001',
    displayName: '朝比奈 由奈',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.GROUP_ADMIN,
    email: 'manager@medace-demo.jp',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationId: IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY,
    organizationName: 'Steady Study Demo Academy',
  },
  {
    uid: 'mock-admin-001',
    displayName: 'システム管理者',
    role: UserRole.ADMIN,
    email: 'admin@medace.com',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationId: IDB_MOCK_ORGANIZATION_IDS.HQ,
    organizationName: 'Steady Study HQ',
  },
];

export const IDB_MOCK_ASSIGNMENTS = [
  { studentUid: 'student-biz-1', instructorUid: 'mock-instructor-001' },
  { studentUid: 'student-biz-2', instructorUid: 'mock-instructor-001' },
];

export const IDB_MOCK_COMMERCIAL_REQUESTS: CommercialRequest[] = [
  {
    id: 101,
    kind: CommercialRequestKind.BUSINESS_TRIAL,
    status: CommercialRequestStatus.OPEN,
    contactName: '高木 直人',
    contactEmail: 'school-admin@example.jp',
    organizationName: 'Steady Study Demo Academy',
    teachingFormat: TeachingFormat.ONLINE,
    desiredStartTiming: '来月から試験運用を始めたいです。',
    requestedWorkspaceRole: CommercialWorkspaceRole.GROUP_ADMIN,
    seatEstimate: '31-100名',
    message: '体験導入の進め方を知りたいです。',
    source: 'PUBLIC_GUIDE',
    createdAt: Date.now() - 6 * 3600 * 1000,
    updatedAt: Date.now() - 6 * 3600 * 1000,
  },
];

export const IDB_MOCK_PRODUCT_ANNOUNCEMENTS: ProductAnnouncement[] = [
  {
    id: 'mock-update-free',
    title: '無料プランからの導入相談が分かりやすくなりました',
    body: '設定画面からパーソナル相談と学校・教室導入相談の両方を送れるようになりました。',
    severity: AnnouncementSeverity.UPDATE,
    subscriptionPlans: [SubscriptionPlan.TOC_FREE],
    audienceRoles: [AnnouncementAudienceRole.STUDENT],
    publishedAt: Date.now() - 3 * 3600 * 1000,
    createdAt: Date.now() - 3 * 3600 * 1000,
    updatedAt: Date.now() - 3 * 3600 * 1000,
  },
  {
    id: 'mock-major-business',
    title: '学校・教室向けワークスペースを更新しました',
    body: '講師フォロー、添削キュー、導入相談の運用を 1 つの導線で確認できます。',
    severity: AnnouncementSeverity.UPDATE,
    subscriptionPlans: [SubscriptionPlan.TOB_FREE, SubscriptionPlan.TOB_PAID],
    audienceRoles: [AnnouncementAudienceRole.INSTRUCTOR, AnnouncementAudienceRole.GROUP_ADMIN, AnnouncementAudienceRole.ADMIN],
    publishedAt: Date.now() - 2 * 3600 * 1000,
    createdAt: Date.now() - 2 * 3600 * 1000,
    updatedAt: Date.now() - 2 * 3600 * 1000,
  },
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
  organizationId:
    role === UserRole.ADMIN
      ? IDB_MOCK_ORGANIZATION_IDS.HQ
      : organizationRole
        ? IDB_MOCK_ORGANIZATION_IDS.DEMO_ACADEMY
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
