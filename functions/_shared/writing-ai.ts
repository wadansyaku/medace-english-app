import type { WritingAssignment, WritingEvaluation, WritingPromptTemplate } from '../../types';
import type { AiUsageLogContext } from './ai-metering';
import type { AppEnv, DbUserRow } from './types';
import {
  createWritingAiAdapter,
  resolveWritingAiMode,
  type WritingAiInputAsset,
} from './writing-ai-adapter';

export { resolveWritingAiMode };

export const generateWritingPrompt = async (
  env: AppEnv,
  user: DbUserRow,
  template: WritingPromptTemplate,
  studentName: string,
  topicHint?: string,
  notes?: string,
  logContext?: AiUsageLogContext,
) => {
  return createWritingAiAdapter(env, user, logContext).generatePrompt(template, studentName, topicHint, notes);
};

export const runWritingOcr = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: Pick<WritingAssignment, 'promptText' | 'guidance' | 'wordCountMin'>,
  assets: WritingAiInputAsset[],
  manualTranscript?: string,
  logContext?: AiUsageLogContext,
) => {
  return createWritingAiAdapter(env, user, logContext).runOcr(assignment, assets, manualTranscript);
};

export const runWritingEvaluations = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: WritingAssignment,
  transcript: string,
  logContext?: AiUsageLogContext,
): Promise<WritingEvaluation[]> => {
  return createWritingAiAdapter(env, user, logContext).runEvaluations(assignment, transcript);
};
