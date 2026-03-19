import { useCallback, useEffect, useState } from 'react';
import type { CommercialRequestUpdatePayload, ProductAnnouncementUpsertPayload } from '../contracts/storage';
import { listCommercialRequests, updateCommercialRequest } from '../services/commercial';
import { listProductAnnouncementsAdmin, upsertProductAnnouncement } from '../services/announcements';
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
        listCommercialRequests(),
        listProductAnnouncementsAdmin(),
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
    await updateCommercialRequest(payload);
    await refresh();
  }, [refresh]);

  const upsertAnnouncement = useCallback(async (payload: ProductAnnouncementUpsertPayload) => {
    await upsertProductAnnouncement(payload);
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
