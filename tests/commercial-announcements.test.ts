import { describe, expect, it } from 'vitest';

import { buildAnnouncementFeed, getEffectiveAudienceRole, isAnnouncementVisibleToUser } from '../shared/announcements';
import { hasDuplicateOpenRequest } from '../shared/commercial';
import {
  AnnouncementAudienceRole,
  AnnouncementSeverity,
  CommercialRequestKind,
  CommercialRequestStatus,
  OrganizationRole,
  SubscriptionPlan,
  UserRole,
  type CommercialRequest,
  type ProductAnnouncementWithReceipt,
  type UserProfile,
} from '../types';

const baseRequest: CommercialRequest = {
  id: 1,
  kind: CommercialRequestKind.BUSINESS_TRIAL,
  status: CommercialRequestStatus.OPEN,
  contactName: '田中 直人',
  contactEmail: 'teacher@example.com',
  organizationName: 'Steady Study Academy',
  requestedWorkspaceRole: undefined,
  message: '体験導入を相談したいです。',
  source: 'PUBLIC_GUIDE',
  createdAt: 100,
  updatedAt: 100,
};

const makeAnnouncement = (overrides: Partial<ProductAnnouncementWithReceipt>): ProductAnnouncementWithReceipt => ({
  id: overrides.id || 'announcement-1',
  title: overrides.title || 'Update',
  body: overrides.body || 'Body',
  severity: overrides.severity || AnnouncementSeverity.UPDATE,
  subscriptionPlans: overrides.subscriptionPlans || [SubscriptionPlan.TOC_FREE],
  audienceRoles: overrides.audienceRoles || [AnnouncementAudienceRole.STUDENT],
  publishedAt: overrides.publishedAt || 200,
  createdAt: overrides.createdAt || 200,
  updatedAt: overrides.updatedAt || 200,
  ...overrides,
});

describe('commercial request helpers', () => {
  it('blocks duplicate open requests by user or normalized email', () => {
    expect(hasDuplicateOpenRequest([baseRequest], 'TEACHER@example.com', CommercialRequestKind.BUSINESS_TRIAL)).toBe(true);
    expect(hasDuplicateOpenRequest([baseRequest], 'other@example.com', CommercialRequestKind.BUSINESS_TRIAL)).toBe(false);
    expect(hasDuplicateOpenRequest([
      { ...baseRequest, requestedByUid: 'user-1' },
    ], 'other@example.com', CommercialRequestKind.BUSINESS_TRIAL, 'user-1')).toBe(true);
    expect(hasDuplicateOpenRequest([
      { ...baseRequest, status: CommercialRequestStatus.DECLINED },
    ], 'teacher@example.com', CommercialRequestKind.BUSINESS_TRIAL)).toBe(false);
  });
});

describe('announcement helpers', () => {
  it('resolves effective audience role from workspace role', () => {
    const groupAdmin: UserProfile = {
      uid: 'admin-1',
      displayName: 'Mgr',
      role: UserRole.INSTRUCTOR,
      organizationRole: OrganizationRole.GROUP_ADMIN,
      email: 'mgr@example.com',
    };
    expect(getEffectiveAudienceRole(groupAdmin)).toBe(AnnouncementAudienceRole.GROUP_ADMIN);
  });

  it('filters announcements by plan, audience, and time window', () => {
    const announcement = makeAnnouncement({
      subscriptionPlans: [SubscriptionPlan.TOB_PAID],
      audienceRoles: [AnnouncementAudienceRole.GROUP_ADMIN],
      startsAt: 100,
      endsAt: 300,
    });

    expect(isAnnouncementVisibleToUser(announcement, SubscriptionPlan.TOB_PAID, AnnouncementAudienceRole.GROUP_ADMIN, 200)).toBe(true);
    expect(isAnnouncementVisibleToUser(announcement, SubscriptionPlan.TOC_FREE, AnnouncementAudienceRole.GROUP_ADMIN, 200)).toBe(false);
    expect(isAnnouncementVisibleToUser(announcement, SubscriptionPlan.TOB_PAID, AnnouncementAudienceRole.INSTRUCTOR, 200)).toBe(false);
    expect(isAnnouncementVisibleToUser(announcement, SubscriptionPlan.TOB_PAID, AnnouncementAudienceRole.GROUP_ADMIN, 400)).toBe(false);
  });

  it('selects only unseen major updates and unacknowledged critical alerts for modal delivery', () => {
    const feed = buildAnnouncementFeed([
      makeAnnouncement({
        id: 'major-seen',
        severity: AnnouncementSeverity.MAJOR,
        receipt: { announcementId: 'major-seen', userUid: 'user-1', seenAt: 150, updatedAt: 150 },
      }),
      makeAnnouncement({
        id: 'major-unseen',
        severity: AnnouncementSeverity.MAJOR,
        publishedAt: 210,
      }),
      makeAnnouncement({
        id: 'critical-unacked',
        severity: AnnouncementSeverity.CRITICAL,
        publishedAt: 220,
      }),
    ]);

    expect(feed.highestPriorityModal?.id).toBe('critical-unacked');
    expect(feed.stickyBanner?.id).toBe('critical-unacked');
  });
});
