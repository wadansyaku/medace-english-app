import type {
  ApproveWritingReturnRequest,
  CreateWritingUploadUrlRequest,
  CreateWritingUploadUrlResponse,
  FinalizeWritingSubmissionRequest,
  GenerateWritingAssignmentRequest,
  PrintableWritingFeedbackResponse,
  RequestWritingRevisionRequest,
  WritingAssignmentListResponse,
  WritingReviewQueueResponse,
  WritingSubmissionDetailResponse,
  WritingTemplateListResponse,
} from '../contracts/writing';
import type { WritingExamCategory } from '../types';
import { apiGet, apiPost } from './apiClient';

const buildQuery = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const listWritingTemplates = async (examCategory?: WritingExamCategory): Promise<WritingTemplateListResponse> => {
  return apiGet(`/api/writing/templates${buildQuery({ examCategory })}`);
};

export const listWritingAssignments = async (scope: 'mine' | 'organization' = 'mine'): Promise<WritingAssignmentListResponse> => {
  return apiGet(`/api/writing/assignments${buildQuery({ scope })}`);
};

export const generateWritingAssignment = async (
  request: GenerateWritingAssignmentRequest,
): Promise<WritingSubmissionDetailResponse['assignment']> => {
  return apiPost('/api/writing/assignments/generate', request);
};

export const issueWritingAssignment = async (assignmentId: string): Promise<WritingSubmissionDetailResponse['assignment']> => {
  return apiPost('/api/writing/assignments/issue', { assignmentId });
};

export const createWritingUploadUrl = async (
  request: CreateWritingUploadUrlRequest,
): Promise<CreateWritingUploadUrlResponse> => {
  return apiPost('/api/writing/upload-url', request);
};

export const uploadWritingAsset = async (
  upload: CreateWritingUploadUrlResponse,
  file: File,
): Promise<void> => {
  const response = await fetch(upload.uploadUrl, {
    method: upload.method,
    headers: upload.headers,
    body: file,
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`アップロードに失敗しました: ${response.status}`);
  }
};

export const finalizeWritingSubmission = async (
  request: FinalizeWritingSubmissionRequest,
): Promise<WritingSubmissionDetailResponse> => {
  return apiPost('/api/writing/submissions/finalize', request);
};

export const listWritingReviewQueue = async (
  scope: 'QUEUE' | 'HISTORY' = 'QUEUE',
): Promise<WritingReviewQueueResponse> => {
  return apiGet(`/api/writing/review-queue${buildQuery({ scope })}`);
};

export const getWritingSubmissionDetail = async (submissionId: string): Promise<WritingSubmissionDetailResponse> => {
  return apiGet(`/api/writing/submissions/${submissionId}`);
};

export const approveWritingReturn = async (
  submissionId: string,
  request: ApproveWritingReturnRequest,
): Promise<WritingSubmissionDetailResponse> => {
  return apiPost(`/api/writing/submissions/${submissionId}/approve-return`, request);
};

export const requestWritingRevision = async (
  submissionId: string,
  request: RequestWritingRevisionRequest,
): Promise<WritingSubmissionDetailResponse> => {
  return apiPost(`/api/writing/submissions/${submissionId}/request-revision`, request);
};

export const completeWritingAssignment = async (
  assignmentId: string,
): Promise<WritingSubmissionDetailResponse['assignment']> => {
  return apiPost('/api/writing/assignments/complete', { assignmentId });
};

export const getWritingPrintableFeedback = async (
  submissionId: string,
): Promise<PrintableWritingFeedbackResponse> => {
  return apiGet(`/api/writing/submissions/${submissionId}/printable-feedback`);
};
