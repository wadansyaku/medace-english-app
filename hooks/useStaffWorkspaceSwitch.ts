import { useRef, useState } from 'react';
import type { WorkspaceId } from '../contracts/workspaceAccess';
import { sessionService } from '../services/session';
import { clearWorkspaceContext, selectWorkspaceForSession } from '../services/workspaceContext';
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
