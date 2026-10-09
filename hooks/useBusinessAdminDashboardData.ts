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
  const writingRequestSequence = useRef(0);
  const writingState: BusinessAdminWritingState = !canUseWritingApi
    ? 'UNAVAILABLE'
    : !writingEnabled ? 'NOT_INCLUDED'
      : writingRequest.enabled === writingEnabled ? writingRequest.state : 'LOADING';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshWriting = useCallback(async () => {
    const request = ++writingRequestSequence.current;
    const isCurrent = () => writingRequestSequence.current === request;
    setWritingRequest({ enabled: writingEnabled, state: 'LOADING' });
    if (!writingEnabled) {
      setWritingAssignments([]);
      setWritingQueue([]);
      setWritingRequest({ enabled: writingEnabled, state: 'READY' });
      return;
    }
    try {
      const [nextAssignments, nextQueue] = await Promise.all([
        listWritingAssignments('organization').then((response) => response.assignments),
        listWritingReviewQueue('QUEUE').then((response) => response.items),
      ]);
      if (!isCurrent()) return;
      setWritingAssignments(nextAssignments);
      setWritingQueue(nextQueue);
      setWritingRequest({ enabled: writingEnabled, state: 'READY' });
    } catch (loadError) {
      if (!isCurrent()) return;
      console.error(loadError);
      setWritingRequest({ enabled: writingEnabled, state: 'ERROR' });
    }
  }, [writingEnabled]);

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current;
    const isCurrent = () => requestSequence.current === request;
    setLoading(true);
    setError(null);

    if (!canUseBusinessWorkspaceApi) {
      writingRequestSequence.current += 1;
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

    // Optional writing must not delay confirmed base resources or their refresh.
    void refreshWriting();
    try {
      const [nextSnapshot, nextSettingsSnapshot, nextMissionBoard, nextBooks] = await Promise.all([
        workspaceService.getOrganizationDashboardSnapshot(),
        workspaceService.getOrganizationSettingsSnapshot(),
        workspaceService.getWeeklyMissionBoard(),
        workspaceService.getBooks(),
      ]);

      if (!isCurrent()) return;
      setSnapshot(nextSnapshot);
      setSettingsSnapshot(nextSettingsSnapshot);
      setMissionBoard(nextMissionBoard);
      setBooks(nextBooks);
    } catch (loadError) {
      if (!isCurrent()) return;
      console.error(loadError);
      setError((loadError as Error).message || '組織ダッシュボードの取得に失敗しました。');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [refreshWriting]);

  useEffect(() => {
    void refresh();
    return () => {
      requestSequence.current += 1;
      writingRequestSequence.current += 1;
    };
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
    refreshWriting,
  };
};

export default useBusinessAdminDashboardData;
