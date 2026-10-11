import { useEffect, useRef, useState } from 'react';
import { getWorkspaceContextKey, type WorkspaceId } from '../contracts/workspaceAccess';
import { sessionService } from '../services/session';
import { clearWorkspaceContext, selectWorkspaceForSession, subscribeWorkspaceRevocation } from '../services/workspaceContext';
import type { UserProfile } from '../types';

interface WorkspaceSwitchOptions {
  user: UserProfile | null;
  onUserChange: (user: UserProfile | null) => void;
  onComplete: (user: UserProfile) => void;
}

export const useStaffWorkspaceSwitch = ({ user, onUserChange, onComplete }: WorkspaceSwitchOptions) => {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const recoveryVersion = useRef(0);
  const latest = useRef({ user, onUserChange, onComplete });
  latest.current = { user, onUserChange, onComplete };

  useEffect(() => {
    const unsubscribe = subscribeWorkspaceRevocation(context => {
      const active = latest.current;
      if (!active.user?.workspaceAccess || getWorkspaceContextKey(active.user.uid, active.user.workspaceAccess)
        !== getWorkspaceContextKey(context.uid, { ...active.user.workspaceAccess, workspace: context.workspace,
          organizationId: context.organizationId || undefined, grantVersion: context.grantVersion })) return;
      const version = ++recoveryVersion.current;
      inFlight.current = true;
      setSwitching(true);
      setError('業務画面の権限が更新されました。以前の画面と未保存の入力を閉じました。本人の画面を確認しています。');
      // Unmount old PII, queue, answers and in-memory upload/draft state now.
      active.onUserChange(null);
      void sessionService.getSession().then(next => {
        if (version !== recoveryVersion.current) return;
        if (!next || next.uid !== context.uid || next.workspaceAccess) throw new Error('本人の画面を確認できませんでした。もう一度ログインしてください。');
        latest.current.onUserChange(next);
        latest.current.onComplete(next);
        setError('業務画面の権限が更新されました。以前の画面と未保存の入力を閉じ、自分の画面に戻りました。');
      }).catch(cause => {
        if (version === recoveryVersion.current) setError(cause instanceof Error ? cause.message : '本人の画面を確認できませんでした。通信を確認してログインしてください。');
      }).finally(() => {
        if (version === recoveryVersion.current) { inFlight.current = false; setSwitching(false); }
      });
    });
    return () => { unsubscribe(); recoveryVersion.current += 1; };
  }, []);

  const switchWorkspace = async (workspace: WorkspaceId) => {
    if (!user || inFlight.current) return;
    if (workspace !== 'personal' && !user.workspaceAccess?.availableWorkspaces.includes(workspace)) return;
    inFlight.current = true;
    setSwitching(true);
    setError(null);
    const expectedUid = user.uid;
    selectWorkspaceForSession(workspace, expectedUid);
    // Unmount all old scope state before a new permission profile is requested.
    onUserChange(null);
    try {
      const next = await sessionService.getSession();
      if (!next || next.uid !== expectedUid || (next.workspaceAccess?.workspace || 'personal') !== workspace) {
        throw new Error('業務画面の権限を確認できませんでした。もう一度ログインしてください。');
      }
      onUserChange(next);
      onComplete(next);
    } catch (cause) {
      clearWorkspaceContext();
      setError(cause instanceof Error ? cause.message : '画面を切り替えられませんでした。通信を確認してログインしてください。');
    } finally {
      inFlight.current = false;
      setSwitching(false);
    }
  };

  return { switching, error, switchWorkspace };
};
