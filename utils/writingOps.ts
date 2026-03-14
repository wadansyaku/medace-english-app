import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import type { WritingAssignment, WritingQueueItem } from '../types';

export type WritingOpsTab = 'CREATE' | 'PRINT' | 'QUEUE' | 'HISTORY';

export const resolveSelectedAssignmentId = (
  assignments: WritingAssignment[],
  selectedAssignmentId: string,
): string => {
  if (assignments.length === 0) return '';
  if (selectedAssignmentId && assignments.some((assignment) => assignment.id === selectedAssignmentId)) {
    return selectedAssignmentId;
  }
  return assignments[0].id;
};

export const getReviewListForTab = (
  tab: WritingOpsTab,
  queue: WritingQueueItem[],
  history: WritingQueueItem[],
): WritingQueueItem[] => (tab === 'QUEUE' ? queue : history);

export const resolveSelectedSubmissionId = (
  reviewList: WritingQueueItem[],
  selectedSubmissionId: string,
): string => {
  if (reviewList.length === 0) return '';
  if (selectedSubmissionId && reviewList.some((item) => item.submissionId === selectedSubmissionId)) {
    return selectedSubmissionId;
  }
  return reviewList[0].submissionId;
};

export const resolveSelectedEvaluationId = (
  detail: WritingSubmissionDetailResponse,
  selectedEvaluationId?: string,
): string => {
  if (
    selectedEvaluationId
    && detail.submission.evaluations.some((evaluation) => evaluation.id === selectedEvaluationId)
  ) {
    return selectedEvaluationId;
  }

  return (
    detail.submission.teacherReview?.selectedEvaluationId
    || detail.submission.selectedEvaluationId
    || detail.submission.evaluations[0]?.id
    || ''
  );
};
