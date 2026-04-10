import type {
  ProductAnnouncement,
  ProductAnnouncementFeed,
  UserProfile,
} from '../../types';
import type { ProductAnnouncementUpsertPayload } from '../../contracts/storage';
import {
  buildAnnouncementFeed,
  getEffectiveAudienceRole,
  isAnnouncementVisibleToUser,
} from '../../shared/announcements';
import { IDB_MOCK_PRODUCT_ANNOUNCEMENTS } from './mockData';
import {
  readAllStoreRecords,
  readStoreRecord,
  requestToPromise,
  STORES,
  type GetStore,
  type StoredAnnouncementReceiptRecord,
  type StoredProductAnnouncementRecord,
} from './idb-support';

interface LocalAnnouncementStorageContext {
  getStore: GetStore;
  getSession: () => Promise<UserProfile | null>;
  now?: () => number;
}

const mergeSeededRecordsById = <T extends { id: string | number }>(seed: T[], stored: T[]): T[] => {
  const merged = new Map<string, T>();
  seed.forEach((record) => merged.set(String(record.id), record));
  stored.forEach((record) => merged.set(String(record.id), record));
  return [...merged.values()];
};

const buildAnnouncementReceiptId = (announcementId: string, userUid: string): string => `${announcementId}:${userUid}`;

export const listStoredAnnouncements = async (
  context: Pick<LocalAnnouncementStorageContext, 'getStore'>,
): Promise<ProductAnnouncement[]> => {
  const store = await context.getStore(STORES.PRODUCT_ANNOUNCEMENTS);
  const stored = await readAllStoreRecords<StoredProductAnnouncementRecord>(store);
  return mergeSeededRecordsById(IDB_MOCK_PRODUCT_ANNOUNCEMENTS, stored)
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

export const listStoredAnnouncementReceipts = async (
  context: Pick<LocalAnnouncementStorageContext, 'getStore'>,
  userUid: string,
): Promise<StoredAnnouncementReceiptRecord[]> => {
  const store = await context.getStore(STORES.ANNOUNCEMENT_RECEIPTS);
  const receipts = await readAllStoreRecords<StoredAnnouncementReceiptRecord>(store);
  return receipts.filter((receipt) => receipt.userUid === userUid);
};

export const listProductAnnouncements = async (
  context: Pick<LocalAnnouncementStorageContext, 'getStore' | 'getSession'>,
): Promise<ProductAnnouncementFeed> => {
  const sessionUser = await context.getSession();
  if (!sessionUser) {
    return buildAnnouncementFeed([]);
  }
  const announcements = await listStoredAnnouncements(context);
  const receipts = await listStoredAnnouncementReceipts(context, sessionUser.uid);
  const receiptMap = new Map(receipts.map((receipt) => [receipt.announcementId, receipt]));
  const effectiveRole = getEffectiveAudienceRole(sessionUser);
  const visible = announcements
    .map((announcement) => ({
      ...announcement,
      receipt: receiptMap.get(announcement.id),
    }))
    .filter((announcement) => isAnnouncementVisibleToUser(announcement, sessionUser.subscriptionPlan, effectiveRole));
  return buildAnnouncementFeed(visible);
};

export const markAnnouncementSeen = async (
  context: Pick<LocalAnnouncementStorageContext, 'getStore' | 'getSession' | 'now'>,
  announcementId: string,
): Promise<void> => {
  const sessionUser = await context.getSession();
  if (!sessionUser) return;
  const receiptId = buildAnnouncementReceiptId(announcementId, sessionUser.uid);
  const current = await readStoreRecord<StoredAnnouncementReceiptRecord>(
    await context.getStore(STORES.ANNOUNCEMENT_RECEIPTS),
    receiptId,
  );
  const now = context.now?.() ?? Date.now();
  const nextSeenAt = current?.seenAt || now;
  const store = await context.getStore(STORES.ANNOUNCEMENT_RECEIPTS, 'readwrite');
  await requestToPromise(store.put({
    id: receiptId,
    announcementId,
    userUid: sessionUser.uid,
    seenAt: nextSeenAt,
    acknowledgedAt: current?.acknowledgedAt,
    updatedAt: now,
  }));
};

export const acknowledgeAnnouncement = async (
  context: Pick<LocalAnnouncementStorageContext, 'getStore' | 'getSession' | 'now'>,
  announcementId: string,
): Promise<void> => {
  const sessionUser = await context.getSession();
  if (!sessionUser) return;
  const receiptId = buildAnnouncementReceiptId(announcementId, sessionUser.uid);
  const current = await readStoreRecord<StoredAnnouncementReceiptRecord>(
    await context.getStore(STORES.ANNOUNCEMENT_RECEIPTS),
    receiptId,
  );
  const now = context.now?.() ?? Date.now();
  const store = await context.getStore(STORES.ANNOUNCEMENT_RECEIPTS, 'readwrite');
  await requestToPromise(store.put({
    id: receiptId,
    announcementId,
    userUid: sessionUser.uid,
    seenAt: current?.seenAt || now,
    acknowledgedAt: now,
    updatedAt: now,
  }));
};

export const listProductAnnouncementsAdmin = async (
  context: Pick<LocalAnnouncementStorageContext, 'getStore'>,
): Promise<ProductAnnouncement[]> => listStoredAnnouncements(context);

export const upsertProductAnnouncement = async (
  context: Pick<LocalAnnouncementStorageContext, 'getStore' | 'now'>,
  payload: ProductAnnouncementUpsertPayload,
): Promise<ProductAnnouncement> => {
  const now = context.now?.() ?? Date.now();
  const store = await context.getStore(STORES.PRODUCT_ANNOUNCEMENTS, 'readwrite');
  const nextAnnouncement: ProductAnnouncement = {
    id: payload.id || `local-announcement-${now.toString(36)}`,
    title: payload.title.trim(),
    body: payload.body.trim(),
    severity: payload.severity,
    subscriptionPlans: payload.subscriptionPlans,
    audienceRoles: payload.audienceRoles,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await requestToPromise(store.put(nextAnnouncement));
  return nextAnnouncement;
};
