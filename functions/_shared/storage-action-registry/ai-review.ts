import {
  UserRole,
  type AiGeneratedProblemReviewDecision,
  type AiGeneratedProblemReviewQueueStatus,
  type GrammarCurriculumScopeId,
  type WorksheetQuestionMode,
} from '../../../types';
import { WORKSHEET_QUESTION_MODES } from '../../../shared/worksheetQuestionMode';
import type { StorageActionDefinitionMap } from '../storage-action-runtime';
import { defineStorageAction } from '../storage-action-runtime';
import { expectEnum, expectObject, expectOptionalEnum, expectOptionalNumber, expectOptionalString, expectString } from '../request-validation';
import {
  listAiGeneratedProblemReviewQueue,
  reviewAiGeneratedProblem,
} from '../ai-cache-cbt';

const REVIEW_QUEUE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
const REVIEW_DECISIONS = ['APPROVE', 'REJECT', 'NEEDS_REVIEW'] as const;

export const aiReviewStorageActionDefinitions = {
  listAiGeneratedProblemReviewQueue: defineStorageAction({
    parse: (payload) => {
      const record = payload === undefined ? {} : expectObject(payload);
      return {
        status: expectOptionalEnum(record.status, REVIEW_QUEUE_STATUSES, 'status') as AiGeneratedProblemReviewQueueStatus | undefined,
        limit: expectOptionalNumber(record, 'limit'),
        bookId: expectOptionalString(record, 'bookId'),
        questionMode: expectOptionalEnum(record.questionMode, WORKSHEET_QUESTION_MODES, 'questionMode') as WorksheetQuestionMode | undefined,
        grammarScopeId: expectOptionalString(record, 'grammarScopeId') as GrammarCurriculumScopeId | undefined,
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => listAiGeneratedProblemReviewQueue(env, user, payload),
  }),
  reviewAiGeneratedProblem: defineStorageAction({
    parse: (payload) => {
      const record = expectObject(payload);
      return {
        problemId: expectString(record, 'problemId'),
        decision: expectEnum(record.decision, REVIEW_DECISIONS, 'decision') as AiGeneratedProblemReviewDecision,
        reviewNote: expectOptionalString(record, 'reviewNote'),
      };
    },
    roles: [UserRole.ADMIN, UserRole.INSTRUCTOR],
    execute: ({ env, user }, payload) => reviewAiGeneratedProblem(env, user, payload),
  }),
} satisfies Pick<
  StorageActionDefinitionMap,
  | 'listAiGeneratedProblemReviewQueue'
  | 'reviewAiGeneratedProblem'
>;
