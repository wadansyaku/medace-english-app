import { UserRole } from '../../../types';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEmptyPayload, expectObject, expectString } from '../request-validation';
import {
  handleAcknowledgeAnnouncement,
  handleListProductAnnouncements,
  handleListProductAnnouncementsAdmin,
  handleMarkAnnouncementSeen,
  handleUpsertProductAnnouncement,
} from '../announcement-actions';

export const announcementStorageActionDefinitions = {
  listProductAnnouncements: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleListProductAnnouncements(env, user),
  }),
  markAnnouncementSeen: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { announcementId: expectString(record, 'announcementId') };
    },
    execute: async ({ env, user }, payload) => {
      await handleMarkAnnouncementSeen(env, user, payload.announcementId);
      return null;
    },
  }),
  acknowledgeAnnouncement: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { announcementId: expectString(record, 'announcementId') };
    },
    execute: async ({ env, user }, payload) => {
      await handleAcknowledgeAnnouncement(env, user, payload.announcementId);
      return null;
    },
  }),
  listProductAnnouncementsAdmin: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN],
    execute: ({ env }) => handleListProductAnnouncementsAdmin(env),
  }),
  upsertProductAnnouncement: defineStorageAction({
    parse: (payload) => expectObject(payload) as never,
    roles: [UserRole.ADMIN],
    execute: ({ env, user }, payload) => handleUpsertProductAnnouncement(env, user, payload),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  | 'listProductAnnouncements'
  | 'markAnnouncementSeen'
  | 'acknowledgeAnnouncement'
  | 'listProductAnnouncementsAdmin'
  | 'upsertProductAnnouncement'
>;
