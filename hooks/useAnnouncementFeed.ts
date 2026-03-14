import { useCallback, useEffect, useState } from 'react';
import { storage } from '../services/storage';
import type { ProductAnnouncementFeed } from '../types';

const EMPTY_FEED: ProductAnnouncementFeed = {
  announcements: [],
  highestPriorityModal: null,
  stickyBanner: null,
  unreadCount: 0,
};

export const useAnnouncementFeed = (enabled: boolean) => {
  const [feed, setFeed] = useState<ProductAnnouncementFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setFeed(EMPTY_FEED);
      return;
    }

    setLoading(true);
    try {
      const nextFeed = await storage.listProductAnnouncements();
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
    await storage.markAnnouncementSeen(announcementId);
    await refresh();
  }, [refresh]);

  const acknowledge = useCallback(async (announcementId: string) => {
    await storage.acknowledgeAnnouncement(announcementId);
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
