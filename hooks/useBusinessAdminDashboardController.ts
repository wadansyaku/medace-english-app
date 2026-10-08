import { useMemo, useState } from 'react';

import type {
  BusinessAdminWorkspaceView,
  BookMetadata,
  OrganizationDashboardSnapshot,
  OrganizationSettingsSnapshot,
  WeeklyMissionBoard,
  WritingAssignment,
  WritingQueueItem,
} from '../types';
import { useAssignmentManagement } from './businessAdmin/useAssignmentManagement';
import { useActivationBootstrap } from './businessAdmin/useActivationBootstrap';
import { useFirstNotificationAction } from './businessAdmin/useFirstNotificationAction';
import { useOrganizationSettingsForm } from './businessAdmin/useOrganizationSettingsForm';
import { useWeeklyMissionComposer } from './businessAdmin/useWeeklyMissionComposer';
import { buildBusinessAdminDecisionModel } from '../utils/businessAdminDashboard';

import type { BusinessAdminWritingState } from '../shared/businessAdminWritingState';

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
  writingQueue: WritingQueueItem[];
  writingState: BusinessAdminWritingState;
  activeView: BusinessAdminWorkspaceView;
  refresh: () => Promise<void>;
}

export const useBusinessAdminDashboardController = ({
  snapshot,
  settingsSnapshot,
  missionBoard,
  books,
  writingAssignments,
  writingQueue,
  writingState,
  activeView,
  refresh,
}: UseBusinessAdminDashboardControllerParams) => {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const activationBootstrap = useActivationBootstrap({
    refresh,
    setNotice,
  });
  const firstNotificationAction = useFirstNotificationAction({
    snapshot,
    onSent: async () => {
      await refresh();
    },
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
  const decisionModel = useMemo(() => (
    snapshot
      ? buildBusinessAdminDecisionModel({
        snapshot,
        activeView,
        writingAssignments,
        writingQueue,
        writingState,
      })
      : null
  ), [activeView, snapshot, writingAssignments, writingQueue, writingState]);

  return {
    notice: firstNotificationAction.firstNotificationNotice || notice,
    decisionModel,
    activationNotificationPending: firstNotificationAction.firstNotificationSending,
    firstNotificationNotice: firstNotificationAction.firstNotificationNotice,
    firstNotificationTarget: firstNotificationAction.firstNotificationTarget,
    handleSendActivationNotification: firstNotificationAction.sendFirstNotification,
    ...activationBootstrap,
    ...assignment,
    ...organizationSettings,
    ...missionComposer,
  };
};

export default useBusinessAdminDashboardController;
