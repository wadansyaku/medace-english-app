import type { ProductAnnouncementUpsertPayload } from '../contracts/storage';
import type { ProductAnnouncement, ProductAnnouncementFeed } from '../types';
import { resolveStorageMode } from '../shared/storageMode';
import { CloudflareStorageService } from './cloudflare';
import { storage } from './storage';

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const announcementsApiAvailable = storageMode.capabilities.announcements.available;
const announcementsMockAvailable = storageMode.capabilities.announcements.usesMockData;
const unavailableAnnouncementsMessage = 'お知らせ機能はこの storage mode では利用できません。';
const cloudflareStorage = new CloudflareStorageService();
const announcementService = announcementsApiAvailable ? cloudflareStorage : storage;

const assertAnnouncementsAvailable = (): void => {
  if (!announcementsApiAvailable && !announcementsMockAvailable) {
    throw new Error(unavailableAnnouncementsMessage);
  }
};

export const listProductAnnouncements = async (): Promise<ProductAnnouncementFeed> => {
  assertAnnouncementsAvailable();
  return announcementService.listProductAnnouncements();
};

export const markAnnouncementSeen = async (announcementId: string): Promise<void> => {
  assertAnnouncementsAvailable();
  return announcementService.markAnnouncementSeen(announcementId);
};

export const acknowledgeAnnouncement = async (announcementId: string): Promise<void> => {
  assertAnnouncementsAvailable();
  return announcementService.acknowledgeAnnouncement(announcementId);
};

export const listProductAnnouncementsAdmin = async (): Promise<ProductAnnouncement[]> => {
  assertAnnouncementsAvailable();
  return announcementService.listProductAnnouncementsAdmin();
};

export const upsertProductAnnouncement = async (
  payload: ProductAnnouncementUpsertPayload,
): Promise<ProductAnnouncement> => {
  assertAnnouncementsAvailable();
  return announcementService.upsertProductAnnouncement(payload);
};
