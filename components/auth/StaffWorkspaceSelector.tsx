import type { WorkspaceId } from '../../contracts/workspaceAccess';
import { UserRole, type UserProfile } from '../../types';

const LABELS = { instructor: '講師', 'group-admin': '学校管理者', 'service-admin': 'サービス管理者' } as const;

interface Props {
  user: UserProfile;
  switching: boolean;
  onSwitch: (workspace: WorkspaceId) => void;
}

const StaffWorkspaceSelector = ({ user, switching, onSwitch }: Props) => {
  const access = user.workspaceAccess;
  if (user.role === UserRole.STUDENT || !access || access.availableWorkspaces.length < 2) return null;
  return <section aria-label="業務画面の切替" className="mb-4 rounded-2xl border border-medace-200 bg-medace-50 p-3 text-medace-950" data-testid="staff-workspace-selector">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-bold">現在の画面：{LABELS[access.workspace]}</p>
        <p className="break-words text-xs">{access.workspace === 'service-admin' ? 'すべての教室' : user.organizationName}</p>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-bold">
        <span>業務画面を切り替える</span>
        <select aria-label="業務画面を切り替える" value={access.workspace} disabled={switching}
          onChange={event => onSwitch(event.target.value as WorkspaceId)}
          className="min-h-11 w-full rounded-lg border border-medace-300 bg-white px-3 text-medace-950 sm:min-w-48">
          {access.availableWorkspaces.map(workspace => <option key={workspace} value={workspace}>{LABELS[workspace]}</option>)}
          <option value="personal">自分の学習に戻る</option>
        </select>
      </label>
    </div>
    <p className="mt-2 text-xs">切り替えると未保存の入力を閉じます。</p>
  </section>;
};

export default StaffWorkspaceSelector;
