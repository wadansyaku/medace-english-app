import {
  EnglishLevel,
  LearningTaskIntentType,
  UserRole,
  type WorksheetQuestionMode,
} from '../../../types';
import { WORKSHEET_QUESTION_MODES } from '../../../shared/worksheetQuestionMode';
import {
  ENGLISH_PRACTICE_ATTEMPT_MODES,
  ENGLISH_PRACTICE_LANE_IDS,
} from '../../../shared/englishPractice';
import { MAX_STUDY_SESSION_XP } from '../../../shared/xp';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectBoolean, expectEmptyPayload, expectEnum, expectNumber, expectObject, expectOptionalEnum, expectOptionalNumber, expectOptionalObject, expectOptionalString, expectString } from '../request-validation';
import { expectIntegerInRange } from '../validators';
import {
  handleAddXP,
  handleGetActivityLogs,
  handleGetBookProgress,
  handleGetDueCount,
  handleGetLearningPlan,
  handleGetLearningPreference,
  handleGetStudiedWordIdsByBook,
  handleRecordQuizAttempt,
  handleRecordEnglishPracticeAttempt,
  handleResetAllData,
  handleSaveLearningPlan,
  handleSaveLearningPreference,
  handleSaveSrsHistory,
} from '../storage-learning-actions';

export const learningStorageActionDefinitions = {
  addXP: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        amount: expectIntegerInRange(record, 'amount', {
          label: 'XP',
          min: 1,
          max: MAX_STUDY_SESSION_XP,
        }) as number,
      };
    },
    execute: ({ env, user }, payload) => handleAddXP(env, user, payload.amount),
  }),
  getDueCount: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetDueCount(env, user),
  }),
  saveSRSHistory: defineStorageAction<'saveSRSHistory'>({
    parse: (payload) => {
      const record = expectObject(payload);
      const word = expectObject(record.word, 'word');
      return {
        word: { id: expectString(word, 'id'), bookId: expectString(word, 'bookId') },
        rating: expectIntegerInRange(record, 'rating', { min: 0, max: 3 }) as number,
        responseTimeMs: expectOptionalNumber(record, 'responseTimeMs') || 0,
        missionAssignmentId: expectOptionalString(record, 'missionAssignmentId'),
        taskIntentType: expectOptionalEnum(record.taskIntentType, Object.values(LearningTaskIntentType), 'taskIntentType'),
        clientAttemptId: record.clientAttemptId === undefined ? undefined : expectString(record, 'clientAttemptId'),
      };
    },
    execute: async ({ env, user }, payload) => {
      await handleSaveSrsHistory(
        env,
        user,
        payload.word,
        payload.rating,
        payload.responseTimeMs,
        payload.missionAssignmentId,
        payload.taskIntentType,
        payload.clientAttemptId,
      );
      return null;
    },
  }),
  recordQuizAttempt: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        wordId: expectString(record, 'wordId'),
        bookId: expectString(record, 'bookId'),
        correct: expectBoolean(record, 'correct'),
        questionMode: expectEnum(record.questionMode, WORKSHEET_QUESTION_MODES, 'questionMode') as WorksheetQuestionMode,
        responseTimeMs: expectOptionalNumber(record, 'responseTimeMs') || 0,
        missionAssignmentId: expectOptionalString(record, 'missionAssignmentId'),
        taskIntentType: expectOptionalEnum(record.taskIntentType, Object.values(LearningTaskIntentType), 'taskIntentType') as never,
        generatedProblemId: expectOptionalString(record, 'generatedProblemId'),
        grammarScopeId: expectOptionalString(record, 'grammarScopeId') as never,
        translationFeedback: expectOptionalObject(record.translationFeedback, 'translationFeedback') as never,
        clientAttemptId: record.clientAttemptId === undefined ? undefined : expectString(record, 'clientAttemptId'),
      };
    },
    execute: async ({ env, user }, payload) => {
      return handleRecordQuizAttempt(
        env,
        user,
        payload.wordId,
        payload.bookId,
        payload.correct,
        payload.questionMode,
        payload.responseTimeMs,
        payload.missionAssignmentId,
        payload.taskIntentType,
        payload.generatedProblemId,
        payload.grammarScopeId,
        payload.translationFeedback,
        payload.clientAttemptId,
      );
    },
  }),
  recordEnglishPracticeAttempt: defineStorageAction<'recordEnglishPracticeAttempt'>({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        clientAttemptId: expectString(record, 'clientAttemptId'),
        lane: expectEnum(record.lane, ENGLISH_PRACTICE_LANE_IDS, 'lane'),
        mode: expectEnum(record.mode, ENGLISH_PRACTICE_ATTEMPT_MODES, 'mode'),
        correct: expectBoolean(record, 'correct'),
        score: expectOptionalNumber(record, 'score'),
        maxScore: expectOptionalNumber(record, 'maxScore'),
        occurredAt: expectOptionalNumber(record, 'occurredAt'),
        responseTimeMs: expectOptionalNumber(record, 'responseTimeMs'),
        wordId: expectOptionalString(record, 'wordId'),
        bookId: expectOptionalString(record, 'bookId'),
        word: expectOptionalString(record, 'word'),
        grammarScopeId: expectOptionalString(record, 'grammarScopeId') as never,
        scopeLabelJa: expectOptionalString(record, 'scopeLabelJa'),
        level: expectOptionalEnum(record.level, Object.values(EnglishLevel), 'level'),
        readingQuestionKind: expectOptionalString(record, 'readingQuestionKind'),
        generatedProblemId: expectOptionalString(record, 'generatedProblemId'),
        translationFeedback: expectOptionalObject(record.translationFeedback, 'translationFeedback') as never,
      };
    },
    execute: ({ env, user }, payload) => handleRecordEnglishPracticeAttempt(env, user, payload),
  }),
  getStudiedWordIdsByBook: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { bookId: expectString(record, 'bookId') };
    },
    execute: ({ env, user }, payload) => handleGetStudiedWordIdsByBook(env, user, payload.bookId),
  }),
  getBookProgress: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return { bookId: expectString(record, 'bookId') };
    },
    execute: ({ env, user }, payload) => handleGetBookProgress(env, user, payload.bookId),
  }),
  resetAllData: defineStorageAction({
    parse: expectEmptyPayload,
    roles: [UserRole.ADMIN],
    requiresDestructiveAdminFlag: true,
    execute: async ({ env }) => {
      await handleResetAllData(env);
      return null;
    },
  }),
  saveLearningPlan: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      expectObject(record.plan, 'plan');
      return { plan: record.plan } as never;
    },
    execute: async ({ env, user }, payload) => {
      await handleSaveLearningPlan(env, user, payload.plan);
      return null;
    },
  }),
  getLearningPlan: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetLearningPlan(env, user),
  }),
  saveLearningPreference: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      expectObject(record.preference, 'preference');
      return { preference: record.preference } as never;
    },
    execute: async ({ env, user }, payload) => {
      await handleSaveLearningPreference(env, user, payload.preference);
      return null;
    },
  }),
  getLearningPreference: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetLearningPreference(env, user),
  }),
  getActivityLogs: defineStorageAction({
    parse: expectEmptyPayload,
    execute: ({ env, user }) => handleGetActivityLogs(env, user.id),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  | 'addXP'
  | 'getDueCount'
  | 'saveSRSHistory'
  | 'recordQuizAttempt'
  | 'recordEnglishPracticeAttempt'
  | 'getStudiedWordIdsByBook'
  | 'getBookProgress'
  | 'resetAllData'
  | 'saveLearningPlan'
  | 'getLearningPlan'
  | 'saveLearningPreference'
  | 'getLearningPreference'
  | 'getActivityLogs'
>;
