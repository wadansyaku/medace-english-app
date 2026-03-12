import type { WritingAssignment, WritingEvaluation, WritingPromptTemplate } from '../../types';
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
) => {
  return createWritingAiAdapter(env, user).generatePrompt(template, studentName, topicHint, notes);
};

export const runWritingOcr = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: Pick<WritingAssignment, 'promptText' | 'guidance' | 'wordCountMin'>,
  assets: WritingAiInputAsset[],
  manualTranscript?: string,
) => {
  return createWritingAiAdapter(env, user).runOcr(assignment, assets, manualTranscript);
};

export const runWritingEvaluations = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: WritingAssignment,
  transcript: string,
): Promise<WritingEvaluation[]> => {
  return createWritingAiAdapter(env, user).runEvaluations(assignment, transcript);
};
