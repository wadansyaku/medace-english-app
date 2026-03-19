import { useCallback, useEffect, useState } from 'react';

import { workspaceService } from '../../services/workspace';
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
  const [newCohortName, setNewCohortName] = useState('');
  const [cohortDrafts, setCohortDrafts] = useState<Record<string, string>>({});
  const [cohortSavingKey, setCohortSavingKey] = useState<string | null>(null);
  const [instructorCohortDrafts, setInstructorCohortDrafts] = useState<Record<string, string[]>>({});
  const [instructorCohortSavingUid, setInstructorCohortSavingUid] = useState<string | null>(null);

  useEffect(() => {
    if (settingsSnapshot?.displayName) {
      setOrganizationDisplayName(settingsSnapshot.displayName);
    }
  }, [settingsSnapshot?.displayName]);

  useEffect(() => {
    setCohortDrafts(Object.fromEntries(
      (settingsSnapshot?.cohorts || []).map((cohort) => [cohort.id, cohort.name]),
    ));
    setInstructorCohortDrafts(settingsSnapshot?.instructorCohorts || {});
  }, [settingsSnapshot?.cohorts, settingsSnapshot?.instructorCohorts]);

  const handleOrganizationProfileSave = useCallback(async () => {
    if (!settingsSnapshot) return;

    setOrganizationSaving(true);
    setNotice(null);

    try {
      await workspaceService.updateOrganizationProfile(organizationDisplayName);
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

  const setCohortDraft = useCallback((cohortId: string, name: string) => {
    setCohortDrafts((current) => ({
      ...current,
      [cohortId]: name,
    }));
  }, []);

  const handleCohortSave = useCallback(async (cohortId?: string) => {
    if (!settingsSnapshot) return;

    const draftName = (cohortId ? cohortDrafts[cohortId] : newCohortName).trim();
    if (!draftName) return;

    setCohortSavingKey(cohortId || 'new');
    setNotice(null);

    try {
      await workspaceService.upsertOrganizationCohort(cohortId, draftName);
      if (!cohortId) {
        setNewCohortName('');
      }
      setNotice({
        tone: 'success',
        message: cohortId
          ? 'クラス/担当グループ名を更新しました。'
          : 'クラス/担当グループを追加しました。',
      });
      await refresh();
    } catch (cohortError) {
      console.error(cohortError);
      setNotice({
        tone: 'error',
        message: (cohortError as Error).message || 'クラス/担当グループの保存に失敗しました。',
      });
    } finally {
      setCohortSavingKey(null);
    }
  }, [cohortDrafts, newCohortName, refresh, setNotice, settingsSnapshot]);

  const toggleInstructorCohort = useCallback((instructorUid: string, cohortId: string) => {
    setInstructorCohortDrafts((current) => {
      const currentIds = new Set(current[instructorUid] || []);
      if (currentIds.has(cohortId)) {
        currentIds.delete(cohortId);
      } else {
        currentIds.add(cohortId);
      }
      return {
        ...current,
        [instructorUid]: [...currentIds].sort(),
      };
    });
  }, []);

  const handleInstructorCohortsSave = useCallback(async (instructorUid: string) => {
    if (!settingsSnapshot) return;

    setInstructorCohortSavingUid(instructorUid);
    setNotice(null);

    try {
      await workspaceService.setInstructorCohorts(instructorUid, instructorCohortDrafts[instructorUid] || []);
      setNotice({
        tone: 'success',
        message: '講師のクラス/担当グループ範囲を更新しました。',
      });
      await refresh();
    } catch (cohortError) {
      console.error(cohortError);
      setNotice({
        tone: 'error',
        message: (cohortError as Error).message || '講師のクラス/担当グループ更新に失敗しました。',
      });
    } finally {
      setInstructorCohortSavingUid(null);
    }
  }, [instructorCohortDrafts, refresh, setNotice, settingsSnapshot]);

  return {
    cohortDrafts,
    cohortSavingKey,
    instructorCohortDrafts,
    instructorCohortSavingUid,
    newCohortName,
    organizationDisplayName,
    organizationSaving,
    setCohortDraft,
    setNewCohortName,
    setOrganizationDisplayName,
    toggleInstructorCohort,
    handleCohortSave,
    handleInstructorCohortsSave,
    handleOrganizationProfileSave,
  };
};
