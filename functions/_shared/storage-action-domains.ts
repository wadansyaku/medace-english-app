import {
  STORAGE_ACTIONS,
  type StorageAction,
} from '../../contracts/storage';
import { aiReviewStorageActionDefinitions } from './storage-action-registry/ai-review';
import { announcementStorageActionDefinitions } from './storage-action-registry/announcements';
import { catalogStorageActionDefinitions } from './storage-action-registry/catalog';
import { commercialStorageActionDefinitions } from './storage-action-registry/commercial';
import { dashboardStorageActionDefinitions } from './storage-action-registry/dashboard';
import { learningStorageActionDefinitions } from './storage-action-registry/learning';
import { missionStorageActionDefinitions } from './storage-action-registry/missions';
import { organizationStorageActionDefinitions } from './storage-action-registry/organization';
import type { StorageActionDefinitionMap } from './storage-action-runtime';

export interface StorageActionDomainGroup {
  name:
    | 'catalog'
    | 'learning'
    | 'dashboard'
    | 'organization'
    | 'missions'
    | 'commercial'
    | 'announcements'
    | 'aiReview';
  definitions: Partial<StorageActionDefinitionMap>;
}

export const storageActionDomainGroups = [
  {
    name: 'catalog',
    definitions: catalogStorageActionDefinitions,
  },
  {
    name: 'learning',
    definitions: learningStorageActionDefinitions,
  },
  {
    name: 'dashboard',
    definitions: dashboardStorageActionDefinitions,
  },
  {
    name: 'organization',
    definitions: organizationStorageActionDefinitions,
  },
  {
    name: 'missions',
    definitions: missionStorageActionDefinitions,
  },
  {
    name: 'commercial',
    definitions: commercialStorageActionDefinitions,
  },
  {
    name: 'announcements',
    definitions: announcementStorageActionDefinitions,
  },
  {
    name: 'aiReview',
    definitions: aiReviewStorageActionDefinitions,
  },
] as const satisfies readonly StorageActionDomainGroup[];

export const storageActionCompatibilityDefinitions = {
  ...catalogStorageActionDefinitions,
  ...learningStorageActionDefinitions,
  ...dashboardStorageActionDefinitions,
  ...organizationStorageActionDefinitions,
  ...missionStorageActionDefinitions,
  ...commercialStorageActionDefinitions,
  ...announcementStorageActionDefinitions,
  ...aiReviewStorageActionDefinitions,
} satisfies StorageActionDefinitionMap;

export const storageActionAliases = Object.freeze(
  Object.fromEntries(STORAGE_ACTIONS.map((action) => [action, action])) as Record<StorageAction, StorageAction>,
);

export const resolveStorageActionDefinition = (
  action: StorageAction,
) => storageActionCompatibilityDefinitions[storageActionAliases[action]];
