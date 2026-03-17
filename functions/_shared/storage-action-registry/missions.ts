import { MissionProgressEventType, UserRole } from '../../../types';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEmptyPayload, expectObject, expectOptionalNumber, expectOptionalString, expectString } from '../request-validation';
import {
  handleAssignWeeklyMission,
  handleCreateWeeklyMission,
  handleGetWeeklyMissionBoard,
  handleUpdateMissionProgress,
} from '../storage-mission-actions';

export const missionStorageActionDefinitions = {
  createWeeklyMission: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        learningTrack: expectString(record, 'learningTrack') as never,
        title: expectOptionalString(record, 'title'),
        rationale: expectOptionalString(record, 'rationale'),
        bookId: expectOptionalString(record, 'bookId'),
        bookTitle: expectOptionalString(record, 'bookTitle'),
        newWordsTarget: Number(record.newWordsTarget || 0),
        reviewWordsTarget: Number(record.reviewWordsTarget || 0),
        quizTargetCount: Number(record.quizTargetCount || 0),
        writingAssignmentId: expectOptionalString(record, 'writingAssignmentId'),
        dueAt: expectOptionalNumber(record, 'dueAt'),
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => handleCreateWeeklyMission(env, user, payload),
  }),
  assignWeeklyMission: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        missionId: expectString(record, 'missionId'),
        studentUid: expectString(record, 'studentUid'),
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => handleAssignWeeklyMission(env, user, payload.missionId, payload.studentUid),
  }),
  getWeeklyMissionBoard: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR, UserRole.STUDENT],
    execute: ({ env, user }) => handleGetWeeklyMissionBoard(env, user),
  }),
  updateMissionProgress: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        assignmentId: expectString(record, 'assignmentId'),
        eventType: expectString(record, 'eventType') as MissionProgressEventType,
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR, UserRole.STUDENT],
    execute: ({ env, user }, payload) => handleUpdateMissionProgress(env, user, payload.assignmentId, payload.eventType),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  'createWeeklyMission' | 'assignWeeklyMission' | 'getWeeklyMissionBoard' | 'updateMissionProgress'
>;
