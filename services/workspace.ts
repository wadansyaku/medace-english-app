import type { MissionProgressEventType } from '../types';
import { resolveStorageMode } from '../shared/storageMode';
import { CloudflareStorageService } from './cloudflare';
import type { IStorageService } from './storage';
import { storage } from './storage';

export type WorkspaceService = Pick<IStorageService,
  | 'assignStudentInstructor'
  | 'assignWeeklyMission'
  | 'createWeeklyMission'
  | 'getAllStudentsProgress'
  | 'getBooks'
  | 'getOrganizationDashboardSnapshot'
  | 'getOrganizationSettingsSnapshot'
  | 'getStudentWorksheetSnapshot'
  | 'getWeeklyMissionBoard'
  | 'sendInstructorNotification'
  | 'setInstructorCohorts'
  | 'setStudentCohort'
  | 'updateMissionProgress'
  | 'updateOrganizationProfile'
  | 'upsertOrganizationCohort'
>;

const storageMode = resolveStorageMode(import.meta.env.VITE_STORAGE_MODE);
const workspaceAvailable = storageMode.capabilities.organization.available
  && storageMode.capabilities.missions.available;
const workspacePreviewAvailable = storageMode.capabilities.organization.usesMockData
  && storageMode.capabilities.missions.usesMockData;

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
  getWeeklyMissionBoard: unavailable,
  sendInstructorNotification: unavailable,
  setInstructorCohorts: unavailable,
  setStudentCohort: unavailable,
  updateMissionProgress: (_assignmentId: string, _eventType: MissionProgressEventType) => unavailable(),
  updateOrganizationProfile: unavailable,
  upsertOrganizationCohort: unavailable,
};

const previewWorkspaceService: WorkspaceService = {
  assignStudentInstructor: (...args) => storage.assignStudentInstructor(...args),
  assignWeeklyMission: (...args) => storage.assignWeeklyMission(...args),
  createWeeklyMission: (...args) => storage.createWeeklyMission(...args),
  getAllStudentsProgress: (...args) => storage.getAllStudentsProgress(...args),
  getBooks: (...args) => storage.getBooks(...args),
  getOrganizationDashboardSnapshot: (...args) => storage.getOrganizationDashboardSnapshot(...args),
  getOrganizationSettingsSnapshot: (...args) => storage.getOrganizationSettingsSnapshot(...args),
  getStudentWorksheetSnapshot: (...args) => storage.getStudentWorksheetSnapshot(...args),
  getWeeklyMissionBoard: (...args) => storage.getWeeklyMissionBoard(...args),
  sendInstructorNotification: (...args) => storage.sendInstructorNotification(...args),
  setInstructorCohorts: (...args) => storage.setInstructorCohorts(...args),
  setStudentCohort: (...args) => storage.setStudentCohort(...args),
  updateMissionProgress: (assignmentId: string, eventType: MissionProgressEventType) => (
    storage.updateMissionProgress(assignmentId, eventType)
  ),
  updateOrganizationProfile: (...args) => storage.updateOrganizationProfile(...args),
  upsertOrganizationCohort: (...args) => storage.upsertOrganizationCohort(...args),
};

export const workspaceService: WorkspaceService = workspaceAvailable
  ? (new CloudflareStorageService() as WorkspaceService)
  : (workspacePreviewAvailable ? previewWorkspaceService : unavailableWorkspaceService);

export default workspaceService;
