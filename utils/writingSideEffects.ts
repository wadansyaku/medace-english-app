import type {
  WritingAssignmentMutationResponse,
  WritingSubmissionDetailResponse,
  WritingSideEffectJobResult,
} from '../contracts/writing';

type WritingSideEffectAwareResponse =
  | Pick<WritingSubmissionDetailResponse, 'sideEffectJob'>
  | Pick<WritingAssignmentMutationResponse, 'sideEffectJob'>
  | null
  | undefined;

const hasFailedWritingSideEffectJob = (
  job: WritingSideEffectJobResult | null | undefined,
): job is WritingSideEffectJobResult => Boolean(job && job.status === 'FAILED');

export const getWritingSideEffectWarningMessage = (
  response: WritingSideEffectAwareResponse,
): string | null => {
  if (!hasFailedWritingSideEffectJob(response?.sideEffectJob)) {
    return null;
  }
  return 'ただし、学習反映の後処理が失敗したため、ダッシュボード反映が遅れる可能性があります。';
};

export const appendWritingSideEffectWarning = (
  successMessage: string,
  response: WritingSideEffectAwareResponse,
): string => {
  const warning = getWritingSideEffectWarningMessage(response);
  return warning ? `${successMessage} ${warning}` : successMessage;
};
