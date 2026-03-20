import {
  adminStorage,
  announcementStorage,
  catalogStorage,
  commercialStorage,
  dashboardStorage,
  learningStorage,
  missionStorage,
  organizationOpsStorage,
  sessionStorage,
} from './storage';
import type {
  AdminClient,
  AnnouncementClient,
  CatalogClient,
  CommercialClient,
  DashboardClient,
  LearningClient,
  MissionClient,
  OrganizationClient,
  SessionClient,
  StorageClientMap,
} from './storage/types';

export type {
  AdminClient,
  AnnouncementClient,
  CatalogClient,
  CommercialClient,
  DashboardClient,
  LearningClient,
  MissionClient,
  OrganizationClient,
  SessionClient,
  StorageClientMap,
} from './storage/types';

export const storageClients: StorageClientMap = {
  announcements: announcementStorage,
  catalog: catalogStorage,
  commercial: commercialStorage,
  dashboard: dashboardStorage,
  learning: learningStorage,
  missions: missionStorage,
  organization: organizationOpsStorage,
  session: sessionStorage,
};

export const sessionClient: SessionClient = storageClients.session;
export const catalogClient: CatalogClient = storageClients.catalog;
export const learningClient: LearningClient = storageClients.learning;
export const dashboardClient: DashboardClient = storageClients.dashboard;
export const organizationClient: OrganizationClient = storageClients.organization;
export const missionClient: MissionClient = storageClients.missions;
export const commercialClient: CommercialClient = storageClients.commercial;
export const announcementClient: AnnouncementClient = storageClients.announcements;
export const adminClient: AdminClient = adminStorage;
