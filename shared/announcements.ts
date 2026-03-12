import {
  type AnnouncementReceipt,
  AnnouncementAudienceRole,
  AnnouncementSeverity,
  type ProductAnnouncementFeed,
  type ProductAnnouncementWithReceipt,
  type SubscriptionPlan,
  type UserProfile,
  UserRole,
} from '../types';

const SEVERITY_RANK: Record<AnnouncementSeverity, number> = {
  [AnnouncementSeverity.INFO]: 1,
  [AnnouncementSeverity.UPDATE]: 2,
  [AnnouncementSeverity.MAJOR]: 3,
  [AnnouncementSeverity.CRITICAL]: 4,
};

export const getEffectiveAudienceRole = (user: UserProfile): AnnouncementAudienceRole => {
  if (user.role === UserRole.ADMIN) return AnnouncementAudienceRole.ADMIN;
  if (user.role === UserRole.INSTRUCTOR) {
    return user.organizationRole === 'GROUP_ADMIN'
      ? AnnouncementAudienceRole.GROUP_ADMIN
      : AnnouncementAudienceRole.INSTRUCTOR;
  }
  return AnnouncementAudienceRole.STUDENT;
};

export const isAnnouncementVisibleToUser = (
  announcement: Pick<ProductAnnouncementWithReceipt, 'subscriptionPlans' | 'audienceRoles' | 'startsAt' | 'endsAt'>,
  plan: SubscriptionPlan | undefined,
  audienceRole: AnnouncementAudienceRole,
  now = Date.now(),
): boolean => {
  const planMatched = announcement.subscriptionPlans.length === 0
    || (plan ? announcement.subscriptionPlans.includes(plan) : false);
  const roleMatched = announcement.audienceRoles.length === 0
    || announcement.audienceRoles.includes(audienceRole);
  const withinWindow = (!announcement.startsAt || announcement.startsAt <= now)
    && (!announcement.endsAt || announcement.endsAt > now);
  return planMatched && roleMatched && withinWindow;
};

const isAcknowledged = (receipt?: AnnouncementReceipt): boolean => Boolean(receipt?.acknowledgedAt);
const isSeen = (receipt?: AnnouncementReceipt): boolean => Boolean(receipt?.seenAt);

const compareAnnouncements = (left: ProductAnnouncementWithReceipt, right: ProductAnnouncementWithReceipt): number => {
  const severityDiff = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severityDiff !== 0) return severityDiff;
  const publishDiff = (right.publishedAt || right.createdAt) - (left.publishedAt || left.createdAt);
  if (publishDiff !== 0) return publishDiff;
  return right.updatedAt - left.updatedAt;
};

export const selectHighestPriorityModal = (
  announcements: ProductAnnouncementWithReceipt[],
): ProductAnnouncementWithReceipt | null => {
  return announcements
    .filter((announcement) => {
      if (announcement.severity === AnnouncementSeverity.INFO || announcement.severity === AnnouncementSeverity.UPDATE) {
        return false;
      }
      if (announcement.severity === AnnouncementSeverity.MAJOR) {
        return !isSeen(announcement.receipt);
      }
      return !isAcknowledged(announcement.receipt);
    })
    .sort(compareAnnouncements)[0] || null;
};

export const selectStickyBanner = (
  announcements: ProductAnnouncementWithReceipt[],
): ProductAnnouncementWithReceipt | null => {
  return announcements
    .filter((announcement) => (
      announcement.severity === AnnouncementSeverity.CRITICAL
      && !isAcknowledged(announcement.receipt)
    ))
    .sort(compareAnnouncements)[0] || null;
};

export const buildAnnouncementFeed = (
  announcements: ProductAnnouncementWithReceipt[],
): ProductAnnouncementFeed => {
  const sorted = [...announcements].sort(compareAnnouncements);
  return {
    announcements: sorted,
    highestPriorityModal: selectHighestPriorityModal(sorted),
    stickyBanner: selectStickyBanner(sorted),
    unreadCount: sorted.filter((announcement) => !isSeen(announcement.receipt)).length,
  };
};
