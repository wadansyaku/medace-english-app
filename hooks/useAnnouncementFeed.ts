import { useCallback, useEffect, useState } from 'react';
import {
  acknowledgeAnnouncement,
  listProductAnnouncements,
  markAnnouncementSeen,
} from '../services/announcements';
import { resolveStorageMode } from '../shared/storageMode';
import type { ProductAnnouncementFeed } from '../types';

const EMPTY_FEED: ProductAnnouncementFeed = {
  announcements: [],
  highestPriorityModal: null,
  stickyBanner: null,
  unreadCount: 0,
};
const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const canUseAnnouncementFeed = storageMode.capabilities.announcements.available
  || storageMode.capabilities.announcements.usesMockData;

export interface AnnouncementFeedController {
  feed: ProductAnnouncementFeed;
  loading: boolean;
  refresh: () => Promise<void>;
  markSeen: (announcementId: string) => Promise<void>;
  acknowledge: (announcementId: string) => Promise<void>;
}

export const useAnnouncementFeed = (enabled: boolean): AnnouncementFeedController => {
  const [feed, setFeed] = useState<ProductAnnouncementFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setFeed(EMPTY_FEED);
      return;
    }
    if (!canUseAnnouncementFeed) {
      setFeed(EMPTY_FEED);
      return;
    }

    setLoading(true);
    try {
      const nextFeed = await listProductAnnouncements();
      setFeed(nextFeed);
    } catch (error) {
      console.error('Failed to load announcement feed', error);
      setFeed(EMPTY_FEED);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markSeen = useCallback(async (announcementId: string) => {
    if (!canUseAnnouncementFeed) return;
    await markAnnouncementSeen(announcementId);
    await refresh();
  }, [refresh]);

  const acknowledge = useCallback(async (announcementId: string) => {
    if (!canUseAnnouncementFeed) return;
    await acknowledgeAnnouncement(announcementId);
    await refresh();
  }, [refresh]);

  return {
    feed,
    loading,
    refresh,
    markSeen,
    acknowledge,
  };
};

export default useAnnouncementFeed;
