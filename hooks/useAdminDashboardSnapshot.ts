import { useCallback, useEffect, useState } from 'react';
import { dashboardService } from '../services/dashboard';
import type { AdminPasswordResetLinkIssueResult } from '../contracts/storage';
import type {
  AdminDashboardSnapshot,
  AdminPasswordRecoveryRequest,
  AdminPasswordRecoveryStatus,
} from '../types';

const sortPasswordRecoveryRequests = (
  requests: AdminPasswordRecoveryRequest[],
): AdminPasswordRecoveryRequest[] => [...requests].sort((left, right) => {
  if (left.status !== right.status) {
    return left.status === 'OPEN' ? -1 : 1;
  }
  return right.createdAt - left.createdAt;
});

export const useAdminDashboardSnapshot = () => {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRecoveryUpdatingId, setPasswordRecoveryUpdatingId] = useState<number | null>(null);
  const [passwordResetIssuingId, setPasswordResetIssuingId] = useState<number | null>(null);
  const [passwordResetLinkByRequestId, setPasswordResetLinkByRequestId] = useState<Record<number, AdminPasswordResetLinkIssueResult>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSnapshot = await dashboardService.getAdminDashboardSnapshot();
      setSnapshot(nextSnapshot);
    } catch (loadError) {
      console.error(loadError);
      setError((loadError as Error).message || '管理者ダッシュボードの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updatePasswordRecoveryRequest = useCallback(async (
    requestId: number,
    status: AdminPasswordRecoveryStatus,
    resolutionNote?: string,
  ) => {
    setPasswordRecoveryUpdatingId(requestId);
    setError(null);

    try {
      const updated = await dashboardService.updatePasswordRecoveryRequest({
        requestId,
        status,
        resolutionNote,
      });

      setSnapshot((current) => {
        if (!current) return current;
        const nextRequests = current.passwordRecoveryRequests.some((request) => request.id === updated.id)
          ? current.passwordRecoveryRequests.map((request) => (request.id === updated.id ? updated : request))
          : [updated, ...current.passwordRecoveryRequests];
        return {
          ...current,
          passwordRecoveryRequests: sortPasswordRecoveryRequests(nextRequests).slice(0, 8),
        };
      });

      return updated;
    } catch (updateError) {
      console.error(updateError);
      setError((updateError as Error).message || '再設定リクエストの更新に失敗しました。');
      throw updateError;
    } finally {
      setPasswordRecoveryUpdatingId(null);
    }
  }, []);

  const issuePasswordResetLink = useCallback(async (requestId: number) => {
    setPasswordResetIssuingId(requestId);
    setError(null);

    try {
      const result = await dashboardService.issuePasswordResetLink({ requestId });
      setPasswordResetLinkByRequestId((current) => ({
        ...current,
        [requestId]: result,
      }));
      setSnapshot((current) => {
        if (!current) return current;
        return {
          ...current,
          passwordRecoveryRequests: current.passwordRecoveryRequests.map((request) => (
            request.id === requestId
              ? {
                  ...request,
                  updatedAt: result.issuedAt,
                  resolutionNote: '再設定リンクを発行済み。本人確認後に手動案内してください。',
                }
              : request
          )),
        };
      });
      return result;
    } catch (issueError) {
      console.error(issueError);
      setError((issueError as Error).message || '再設定リンクの発行に失敗しました。');
      throw issueError;
    } finally {
      setPasswordResetIssuingId(null);
    }
  }, []);

  return {
    snapshot,
    loading,
    error,
    refresh,
    passwordRecoveryUpdatingId,
    updatePasswordRecoveryRequest,
    passwordResetIssuingId,
    passwordResetLinkByRequestId,
    issuePasswordResetLink,
  };
};
