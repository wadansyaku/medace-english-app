import { useCallback, useEffect, useRef, useState } from 'react';

import { workspaceService } from '../services/workspace';
import { listWritingAssignments, listWritingReviewQueue } from '../services/writing';
import { resolveStorageMode } from '../shared/storageMode';
import type { BusinessAdminWritingState } from '../shared/businessAdminWritingState';
import { SubscriptionPlan, type UserProfile } from '../types';
import type {
  BookMetadata,
  WeeklyMissionBoard,
  OrganizationDashboardSnapshot,
  OrganizationSettingsSnapshot,
  WritingAssignment,
  WritingQueueItem,
} from '../types';

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const canUseWritingApi = storageMode.capabilities.writing.available;
const canUseBusinessWorkspaceApi = storageMode.capabilities.organization.available
  && storageMode.capabilities.missions.available;

export const useBusinessAdminDashboardData = (user: Pick<UserProfile, 'subscriptionPlan'>) => {
  const writingEnabled = canUseWritingApi && user.subscriptionPlan === SubscriptionPlan.TOB_PAID;
  const [snapshot, setSnapshot] = useState<OrganizationDashboardSnapshot | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<OrganizationSettingsSnapshot | null>(null);
  const [missionBoard, setMissionBoard] = useState<WeeklyMissionBoard | null>(null);
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [writingAssignments, setWritingAssignments] = useState<WritingAssignment[]>([]);
  const [writingQueue, setWritingQueue] = useState<WritingQueueItem[]>([]);
  const [writingRequest, setWritingRequest] = useState<{ enabled: boolean; state: 'LOADING' | 'READY' | 'ERROR' }>({ enabled: writingEnabled, state: 'LOADING' });
  const requestSequence = useRef(0);
  const writingState: BusinessAdminWritingState = !canUseWritingApi
    ? 'UNAVAILABLE'
    : !writingEnabled ? 'NOT_INCLUDED'
      : writingRequest.enabled === writingEnabled ? writingRequest.state : 'LOADING';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    const isCurrent = () => requestSequence.current === request;
    setLoading(true);
    setError(null);
    setWritingRequest({ enabled: writingEnabled, state: 'LOADING' });

    if (!canUseBusinessWorkspaceApi) {
      setSnapshot(null);
      setSettingsSnapshot(null);
      setMissionBoard(null);
      setBooks([]);
      setWritingAssignments([]);
      setWritingQueue([]);
      setLoading(false);
      setError('組織ダッシュボードとミッション機能は Cloudflare storage mode でのみ利用できます。');
      return;
    }

    try {
      const [nextSnapshot, nextSettingsSnapshot, nextMissionBoard, nextBooks, nextWritingAssignments, nextWritingQueue] = await Promise.all([
        workspaceService.getOrganizationDashboardSnapshot(),
        workspaceService.getOrganizationSettingsSnapshot(),
        workspaceService.getWeeklyMissionBoard(),
        workspaceService.getBooks(),
        !writingEnabled
          ? Promise.resolve<WritingAssignment[]>([])
          : listWritingAssignments('organization').then((response) => response.assignments),
        !writingEnabled
          ? Promise.resolve<WritingQueueItem[]>([])
          : listWritingReviewQueue('QUEUE').then((response) => response.items),
      ]);

      if (!isCurrent()) return;
      setSnapshot(nextSnapshot);
      setSettingsSnapshot(nextSettingsSnapshot);
      setMissionBoard(nextMissionBoard);
      setBooks(nextBooks);
      setWritingAssignments(nextWritingAssignments);
      setWritingQueue(nextWritingQueue);
      setWritingRequest({ enabled: writingEnabled, state: 'READY' });
    } catch (loadError) {
      if (!isCurrent()) return;
      console.error(loadError);
      setWritingRequest({ enabled: writingEnabled, state: 'ERROR' });
      setError((loadError as Error).message || '組織ダッシュボードの取得に失敗しました。');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [writingEnabled]);

  useEffect(() => {
    void refresh();
    return () => { requestSequence.current += 1; };
  }, [refresh]);

  return {
    snapshot,
    settingsSnapshot,
    missionBoard,
    books,
    writingAssignments,
    writingQueue,
    writingState,
    loading,
    error,
    refresh,
  };
};

export default useBusinessAdminDashboardData;
