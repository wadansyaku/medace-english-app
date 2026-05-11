import { UserRole } from '../../../types';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectBoolean, expectEmptyPayload, expectEnum, expectObject, expectOptionalNumber, expectOptionalObject, expectOptionalString, expectString, expectStringArray, expectTrimmedString } from '../request-validation';
import {
  CLASSROOM_WORKSHEET_LIFECYCLE_STATUSES,
  CLASSROOM_WORKSHEET_SOURCES,
} from '../organization-activation-events';
import {
  handleAssignStudentInstructor,
  handleGetAllStudentsProgress,
  handleGetOrganizationDashboardSnapshot,
  handleGetOrganizationSettingsSnapshot,
  handleGetStudentWorksheetSnapshot,
  handleRecordClassroomWorksheetLifecycleEvent,
  handleSetInstructorCohorts,
  handleSetStudentCohort,
  handleSendInstructorNotification,
  handleUpsertOrganizationCohort,
  handleUpdateOrganizationProfile,
} from '../storage-organization-actions';

export const organizationStorageActionDefinitions = {
  getAllStudentsProgress: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }) => handleGetAllStudentsProgress(env, user),
  }),
  getStudentWorksheetSnapshot: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { studentUid: expectString(record, 'studentUid') };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => handleGetStudentWorksheetSnapshot(env, user, payload.studentUid),
  }),
  recordClassroomWorksheetLifecycleEvent: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        studentUid: expectString(record, 'studentUid'),
        worksheetSource: expectEnum(record.worksheetSource, CLASSROOM_WORKSHEET_SOURCES, 'worksheetSource'),
        lifecycleStatus: expectEnum(record.lifecycleStatus, CLASSROOM_WORKSHEET_LIFECYCLE_STATUSES, 'lifecycleStatus'),
        cohortId: expectOptionalString(record, 'cohortId'),
        payload: expectOptionalObject(record.payload, 'payload.payload'),
        occurredAt: expectOptionalNumber(record, 'occurredAt'),
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => handleRecordClassroomWorksheetLifecycleEvent(env, user, payload),
  }),
  sendInstructorNotification: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        studentUid: expectString(record, 'studentUid'),
        message: expectTrimmedString(record, 'message'),
        triggerReason: expectTrimmedString(record, 'triggerReason'),
        usedAi: expectBoolean(record, 'usedAi'),
        interventionKind: expectString(record, 'interventionKind') as never,
        recommendedActionType: expectOptionalString(record, 'recommendedActionType') as never,
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: async ({ env, user }, payload) => {
      await handleSendInstructorNotification(
        env,
        user,
        payload.studentUid,
        payload.message,
        payload.triggerReason,
        payload.usedAi,
        payload.interventionKind,
        payload.recommendedActionType,
      );
      return null;
    },
  }),
  assignStudentInstructor: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        studentUid: expectString(record, 'studentUid'),
        instructorUid: expectOptionalString(record, 'instructorUid') ?? null,
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: async ({ env, user }, payload) => {
      await handleAssignStudentInstructor(env, user, payload.studentUid, payload.instructorUid);
      return null;
    },
  }),
  getOrganizationDashboardSnapshot: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }) => handleGetOrganizationDashboardSnapshot(env, user),
  }),
  getOrganizationSettingsSnapshot: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }) => handleGetOrganizationSettingsSnapshot(env, user),
  }),
  updateOrganizationProfile: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { displayName: expectTrimmedString(record, 'displayName') };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => handleUpdateOrganizationProfile(env, user, payload.displayName),
  }),
  upsertOrganizationCohort: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        cohortId: expectOptionalString(record, 'cohortId'),
        name: expectTrimmedString(record, 'name'),
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => handleUpsertOrganizationCohort(env, user, payload.cohortId, payload.name),
  }),
  setStudentCohort: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        studentUid: expectString(record, 'studentUid'),
        cohortId: expectOptionalString(record, 'cohortId') ?? null,
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: async ({ env, user }, payload) => {
      await handleSetStudentCohort(env, user, payload.studentUid, payload.cohortId);
      return null;
    },
  }),
  setInstructorCohorts: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        instructorUid: expectString(record, 'instructorUid'),
        cohortIds: expectStringArray(record, 'cohortIds'),
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: async ({ env, user }, payload) => {
      await handleSetInstructorCohorts(env, user, payload.instructorUid, payload.cohortIds);
      return null;
    },
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  | 'getAllStudentsProgress'
  | 'getStudentWorksheetSnapshot'
  | 'recordClassroomWorksheetLifecycleEvent'
  | 'sendInstructorNotification'
  | 'assignStudentInstructor'
  | 'getOrganizationDashboardSnapshot'
  | 'getOrganizationSettingsSnapshot'
  | 'updateOrganizationProfile'
  | 'upsertOrganizationCohort'
  | 'setStudentCohort'
  | 'setInstructorCohorts'
>;
