import type { ProductAnnouncementUpsertPayload } from '../contracts/storage';
import type { ProductAnnouncement, ProductAnnouncementFeed } from '../types';
import { resolveStorageMode } from '../shared/storageMode';
import { CloudflareStorageService } from './cloudflare';

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const announcementsApiAvailable = storageMode.capabilities.announcements.available;
const unavailableAnnouncementsMessage = 'お知らせ機能は Cloudflare storage mode でのみ利用できます。';
const cloudflareStorage = new CloudflareStorageService();

const assertAnnouncementsAvailable = (): void => {
  if (!announcementsApiAvailable) {
    throw new Error(unavailableAnnouncementsMessage);
  }
};

export const listProductAnnouncements = async (): Promise<ProductAnnouncementFeed> => {
  assertAnnouncementsAvailable();
  return cloudflareStorage.listProductAnnouncements();
};

export const markAnnouncementSeen = async (announcementId: string): Promise<void> => {
  assertAnnouncementsAvailable();
  return cloudflareStorage.markAnnouncementSeen(announcementId);
};

export const acknowledgeAnnouncement = async (announcementId: string): Promise<void> => {
  assertAnnouncementsAvailable();
  return cloudflareStorage.acknowledgeAnnouncement(announcementId);
};

export const listProductAnnouncementsAdmin = async (): Promise<ProductAnnouncement[]> => {
  assertAnnouncementsAvailable();
  return cloudflareStorage.listProductAnnouncementsAdmin();
};

export const upsertProductAnnouncement = async (
  payload: ProductAnnouncementUpsertPayload,
): Promise<ProductAnnouncement> => {
  assertAnnouncementsAvailable();
  return cloudflareStorage.upsertProductAnnouncement(payload);
};
