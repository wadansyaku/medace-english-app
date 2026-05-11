import type { MissionProgressEventType } from '../types';
import { resolveStorageMode } from '../shared/storageMode';
import { CloudflareStorageService } from './cloudflare';
import type { CatalogClient, MissionClient, OrganizationClient } from './clients';
import { storage } from './storage';

export type WorkspaceService =
  & Pick<OrganizationClient,
  | 'assignStudentInstructor'
  | 'getAllStudentsProgress'
  | 'getOrganizationDashboardSnapshot'
  | 'getOrganizationSettingsSnapshot'
  | 'getStudentWorksheetSnapshot'
  | 'recordClassroomWorksheetLifecycleEvent'
  | 'sendInstructorNotification'
  | 'setInstructorCohorts'
  | 'setStudentCohort'
  | 'updateOrganizationProfile'
  | 'upsertOrganizationCohort'
>
  & Pick<CatalogClient, 'getBooks'>
  & Pick<MissionClient,
    | 'assignWeeklyMission'
    | 'createWeeklyMission'
    | 'getWeeklyMissionBoard'
    | 'updateMissionProgress'
  >;

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const workspaceAvailable = storageMode.capabilities.organization.available
  && storageMode.capabilities.missions.available;

const unavailableMessage = '組織・ミッション機能は Cloudflare storage mode でのみ利用できます。';
const unavailable = async (): Promise<never> => {
  throw new Error(unavailableMessage);
};

const unavailableWorkspaceService: WorkspaceService = {
  assignStudentInstructor: unavailable,
  assignWeeklyMission: unavailable,
  createWeeklyMission: unavailable,
  getAllStudentsProgress: unavailable,
  getBooks: unavailable,
  getOrganizationDashboardSnapshot: unavailable,
  getOrganizationSettingsSnapshot: unavailable,
  getStudentWorksheetSnapshot: unavailable,
  recordClassroomWorksheetLifecycleEvent: unavailable,
  getWeeklyMissionBoard: unavailable,
  sendInstructorNotification: unavailable,
  setInstructorCohorts: unavailable,
  setStudentCohort: unavailable,
  updateMissionProgress: (_assignmentId: string, _eventType: MissionProgressEventType) => unavailable(),
  updateOrganizationProfile: unavailable,
  upsertOrganizationCohort: unavailable,
};

export const workspaceService: WorkspaceService = workspaceAvailable
  ? (new CloudflareStorageService() as WorkspaceService)
  : unavailableWorkspaceService;

export default workspaceService;
