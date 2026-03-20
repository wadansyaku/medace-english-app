import type {
  WritingAssignment,
  WritingPromptTemplate,
  WritingQueueItem,
  WritingSubmission,
  WritingSubmissionSource,
  WritingExamCategory,
} from '../types';

export interface GenerateWritingAssignmentRequest {
  studentUid: string;
  templateId: string;
  topicHint?: string;
  notes?: string;
}

export interface IssueWritingAssignmentRequest {
  assignmentId: string;
}

export interface CreateWritingUploadUrlRequest {
  assignmentId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256Base64?: string;
  assetOrder: number;
  attemptNo?: number;
}

export interface CreateWritingUploadUrlResponse {
  assetId: string;
  uploadUrl: string;
  assetUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  attemptNo: number;
  expiresAt: number;
}

export interface FinalizeWritingSubmissionRequest {
  assignmentId: string;
  source: WritingSubmissionSource;
  assetIds: string[];
  attemptNo: number;
  manualTranscript?: string;
}

export interface ApproveWritingReturnRequest {
  selectedEvaluationId: string;
  publicComment: string;
  privateMemo?: string;
}

export interface RequestWritingRevisionRequest {
  selectedEvaluationId: string;
  publicComment: string;
  privateMemo?: string;
}

export interface WritingTemplateListResponse {
  templates: WritingPromptTemplate[];
}

export interface WritingAssignmentListResponse {
  assignments: WritingAssignment[];
}

export interface WritingReviewQueueResponse {
  items: WritingQueueItem[];
}

export interface PrintableWritingFeedbackResponse {
  title: string;
  html: string;
}

export interface WritingSideEffectJobResult {
  jobId: string;
  status: 'FAILED';
  attemptCount: number;
  lastError?: string;
}

export interface WritingSubmissionDetailResponse {
  assignment: WritingAssignment;
  submission: WritingSubmission;
  sideEffectJob?: WritingSideEffectJobResult;
}

export interface WritingListTemplateQuery {
  examCategory?: WritingExamCategory;
}

export interface WritingGetReviewQueueQuery {
  scope?: 'QUEUE' | 'HISTORY';
}

export type WritingAssignmentMutationResponse = WritingAssignment & {
  sideEffectJob?: WritingSideEffectJobResult;
};
