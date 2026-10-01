import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { workspaceService } from '../services/workspace';
import { listWritingAssignments, listWritingReviewQueue } from '../services/writing';
import { resolveStorageMode } from '../shared/storageMode';
import type { StudentSummary, WritingAssignment, WritingQueueItem } from '../types';

export interface InstructorDashboardLoaders {
  students: () => Promise<StudentSummary[]>;
  assignments: () => Promise<WritingAssignment[]>;
  queue: () => Promise<WritingQueueItem[]>;
}

interface InstructorDashboardSnapshot {
  students: StudentSummary[] | null;
  writingAssignments: WritingAssignment[] | null;
  writingQueue: WritingQueueItem[] | null;
  loading: boolean;
  errors: { students: string | null; assignments: string | null; queue: string | null };
  updatedAt: number | null;
}

const emptySnapshot = (): InstructorDashboardSnapshot => ({
  students: null,
  writingAssignments: null,
  writingQueue: null,
  loading: false,
  errors: { students: null, assignments: null, queue: null },
  updatedAt: null,
});

// Each collection keeps its own confirmed snapshot. A failed writing request
// cannot hide student follow-up or turn an unknown count into zero.
export const createInstructorDashboardResource = (
  loaders: InstructorDashboardLoaders,
  available = true,
) => {
  let snapshot = emptySnapshot();
  let requestVersion = 0;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: InstructorDashboardSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const refresh = (): Promise<void> => {
    if (pending) return pending;
    if (!available) {
      publish({
        ...emptySnapshot(),
        errors: {
          students: '講師ワークスペースには Cloudflare の接続が必要です。',
          assignments: null,
          queue: null,
        },
      });
      return Promise.resolve();
    }
    const version = ++requestVersion;
    publish({ ...snapshot, loading: true });
    const request = (async () => {
      const [students, assignments, queue] = await Promise.allSettled([
        Promise.resolve().then(loaders.students),
        Promise.resolve().then(loaders.assignments),
        Promise.resolve().then(loaders.queue),
      ]);
      if (version !== requestVersion) return;
      publish({
        students: students.status === 'fulfilled' ? students.value : snapshot.students,
        writingAssignments:
          assignments.status === 'fulfilled' ? assignments.value : snapshot.writingAssignments,
        writingQueue: queue.status === 'fulfilled' ? queue.value : snapshot.writingQueue,
        loading: false,
        errors: {
          students:
            students.status === 'rejected' ? '生徒の学習状況を取得できませんでした。' : null,
          assignments:
            assignments.status === 'rejected' ? '英作文の課題を取得できませんでした。' : null,
          queue: queue.status === 'rejected' ? '添削待ちの提出を取得できませんでした。' : null,
        },
        updatedAt:
          students.status === 'fulfilled' &&
          assignments.status === 'fulfilled' &&
          queue.status === 'fulfilled'
            ? Date.now()
            : snapshot.updatedAt,
      });
    })();
    pending = request;
    void request.finally(() => {
      if (pending === request) pending = null;
    });
    return request;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    refreshAfterMutation: () => {
      requestVersion += 1;
      pending = null;
      return refresh();
    },
    cancel: () => {
      requestVersion += 1;
      pending = null;
    },
  };
};

export const useInstructorDashboardData = (accountKey: string) => {
  const resource = useMemo(
    () =>
      createInstructorDashboardResource(
        {
          students: () => workspaceService.getAllStudentsProgress(),
          assignments: async () => (await listWritingAssignments('organization')).assignments,
          queue: async () => (await listWritingReviewQueue('QUEUE')).items,
        },
        resolveStorageMode(import.meta.env.VITE_STORAGE_MODE).capabilities.organization.available,
      ),
    [accountKey],
  );
  const snapshot = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  useEffect(() => {
    void resource.refresh();
    return resource.cancel;
  }, [resource]);
  const errors = Object.values(snapshot.errors).filter((error): error is string => Boolean(error));
  return {
    students: snapshot.students ?? [],
    writingAssignments: snapshot.writingAssignments ?? [],
    writingQueue: snapshot.writingQueue ?? [],
    hasStudentsData: snapshot.students !== null,
    hasAssignmentsData: snapshot.writingAssignments !== null,
    hasQueueData: snapshot.writingQueue !== null,
    loading:
      snapshot.loading ||
      (!snapshot.updatedAt && errors.length === 0 && snapshot.students === null),
    error: errors.length > 0 ? errors.join(' ') : null,
    resourceErrors: snapshot.errors,
    updatedAt: snapshot.updatedAt,
    refresh: resource.refresh,
    refreshAfterMutation: resource.refreshAfterMutation,
  };
};

export default useInstructorDashboardData;
