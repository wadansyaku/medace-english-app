import { useCallback, useEffect, useState } from 'react';
import { storage } from '../services/storage';
import type { CommercialRequestUpdatePayload, ProductAnnouncementUpsertPayload } from '../contracts/storage';
import type { CommercialRequest, ProductAnnouncement } from '../types';

export const useAdminCommercialOps = () => {
  const [requests, setRequests] = useState<CommercialRequest[]>([]);
  const [announcements, setAnnouncements] = useState<ProductAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextRequests, nextAnnouncements] = await Promise.all([
        storage.listCommercialRequests(),
        storage.listProductAnnouncementsAdmin(),
      ]);
      setRequests(nextRequests);
      setAnnouncements(nextAnnouncements);
    } catch (loadError) {
      console.error(loadError);
      setError((loadError as Error).message || '導入・お知らせ情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateRequest = useCallback(async (payload: CommercialRequestUpdatePayload) => {
    await storage.updateCommercialRequest(payload);
    await refresh();
  }, [refresh]);

  const upsertAnnouncement = useCallback(async (payload: ProductAnnouncementUpsertPayload) => {
    await storage.upsertProductAnnouncement(payload);
    await refresh();
  }, [refresh]);

  return {
    requests,
    announcements,
    loading,
    error,
    refresh,
    updateRequest,
    upsertAnnouncement,
  };
};

export default useAdminCommercialOps;
