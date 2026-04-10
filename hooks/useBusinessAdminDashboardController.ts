import { useState } from 'react';

import type {
  BookMetadata,
  OrganizationDashboardSnapshot,
  OrganizationSettingsSnapshot,
  WeeklyMissionBoard,
  WritingAssignment,
} from '../types';
import { useAssignmentManagement } from './businessAdmin/useAssignmentManagement';
import { useActivationBootstrap } from './businessAdmin/useActivationBootstrap';
import { useOrganizationSettingsForm } from './businessAdmin/useOrganizationSettingsForm';
import { useWeeklyMissionComposer } from './businessAdmin/useWeeklyMissionComposer';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

interface UseBusinessAdminDashboardControllerParams {
  snapshot: OrganizationDashboardSnapshot | null;
  settingsSnapshot: OrganizationSettingsSnapshot | null;
  missionBoard: WeeklyMissionBoard | null;
  books: BookMetadata[];
  writingAssignments: WritingAssignment[];
  refresh: () => Promise<void>;
}

export const useBusinessAdminDashboardController = ({
  snapshot,
  settingsSnapshot,
  missionBoard,
  books,
  writingAssignments,
  refresh,
}: UseBusinessAdminDashboardControllerParams) => {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const activationBootstrap = useActivationBootstrap({
    refresh,
    setNotice,
  });

  const assignment = useAssignmentManagement({
    snapshot,
    refresh,
    setNotice,
  });
  const organizationSettings = useOrganizationSettingsForm({
    settingsSnapshot,
    refresh,
    setNotice,
  });
  const missionComposer = useWeeklyMissionComposer({
    books,
    missionBoard,
    refresh,
    selectedAssignmentStudent: assignment.selectedAssignmentStudent,
    setNotice,
    writingAssignments,
  });

  return {
    notice,
    ...activationBootstrap,
    ...assignment,
    ...organizationSettings,
    ...missionComposer,
  };
};

export default useBusinessAdminDashboardController;
