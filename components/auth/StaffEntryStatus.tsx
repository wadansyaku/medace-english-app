import React from 'react';
import type { UserProfile } from '../../types';
import { UserRole } from '../../types';
import { getPublicBusinessRoleConfig } from '../../shared/publicBusinessRoles';
import { matchesStaffEntryRole, type StaffLoginEntry } from '../../shared/staffLogin';

interface Props {
  user: UserProfile;
  entry?: StaffLoginEntry;
  completedAfterNavigation?: boolean;
  onOpenHome: () => void;
}

const StaffEntryStatus: React.FC<Props> = ({ user, entry, completedAfterNavigation = false, onOpenHome }) => {
  const matched = entry ? matchesStaffEntryRole(entry, user) : true;
  const title = completedAfterNavigation ? 'ログインが完了しました' : matched ? 'ログイン済みです' : 'この入口は利用できません';
  const description = completedAfterNavigation ? '移動先の画面を保っています。自分の画面へ進めます。'
    : matched && entry ? `${getPublicBusinessRoleConfig(entry).title}の画面へ進めます。`
    : '現在のアカウントでは、このログイン入口を利用できません。';
  return <section data-testid="staff-entry-status" className="mx-auto my-4 max-w-lg rounded-panel border border-medace-200 bg-white p-5 shadow-sm sm:my-8 sm:p-7">
    <h1 className="text-2xl font-black text-steady-ink">{title}</h1>
    <p className="mt-3 text-sm leading-relaxed text-slate-600" role={completedAfterNavigation ? 'status' : undefined}>{description}</p>
    <button type="button" data-testid="staff-entry-open-home" onClick={onOpenHome}
      className="mt-5 min-h-12 w-full rounded-xl bg-steady-action px-4 py-3 font-bold text-steady-on-action hover:bg-steady-action-hover">
      {user.role === UserRole.STUDENT ? '自分の学習へ戻る' : '自分の画面へ進む'}
    </button>
  </section>;
};

export default StaffEntryStatus;
