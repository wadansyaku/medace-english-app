import { useCallback, useEffect, useState } from 'react';

import { storage } from '../../services/storage';
import type { OrganizationSettingsSnapshot } from '../../types';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

interface UseOrganizationSettingsFormParams {
  settingsSnapshot: OrganizationSettingsSnapshot | null;
  refresh: () => Promise<void>;
  setNotice: (notice: NoticeState | null) => void;
}

export const useOrganizationSettingsForm = ({
  settingsSnapshot,
  refresh,
  setNotice,
}: UseOrganizationSettingsFormParams) => {
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [organizationDisplayName, setOrganizationDisplayName] = useState('');

  useEffect(() => {
    if (settingsSnapshot?.displayName) {
      setOrganizationDisplayName(settingsSnapshot.displayName);
    }
  }, [settingsSnapshot?.displayName]);

  const handleOrganizationProfileSave = useCallback(async () => {
    if (!settingsSnapshot) return;

    setOrganizationSaving(true);
    setNotice(null);

    try {
      await storage.updateOrganizationProfile(organizationDisplayName);
      setNotice({
        tone: 'success',
        message: '組織表示名を更新しました。',
      });
      await refresh();
    } catch (profileError) {
      console.error(profileError);
      setNotice({
        tone: 'error',
        message: (profileError as Error).message || '組織表示名の更新に失敗しました。',
      });
    } finally {
      setOrganizationSaving(false);
    }
  }, [organizationDisplayName, refresh, setNotice, settingsSnapshot]);

  return {
    organizationDisplayName,
    organizationSaving,
    setOrganizationDisplayName,
    handleOrganizationProfileSave,
  };
};
