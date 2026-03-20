import type {
  ApproveWritingReturnRequest,
  CreateWritingUploadUrlRequest,
  FinalizeWritingSubmissionRequest,
  GenerateWritingAssignmentRequest,
  RequestWritingRevisionRequest,
} from '../../../contracts/writing';
import {
  expectIntegerInRange,
  expectObject,
  expectOptionalSha256Base64,
  expectOptionalString,
  expectString,
  expectStringArray,
  expectTrimmedString,
} from '../validators';

export const parseGenerateWritingAssignmentRequest = (value: unknown): GenerateWritingAssignmentRequest => {
  const record = expectObject(value);
  return {
    studentUid: expectString(record, 'studentUid'),
    templateId: expectString(record, 'templateId'),
    topicHint: expectOptionalString(record, 'topicHint'),
    notes: expectOptionalString(record, 'notes'),
  };
};

export const parseAssignmentMutationRequest = (value: unknown): { assignmentId: string } => {
  const record = expectObject(value);
  return {
    assignmentId: expectString(record, 'assignmentId'),
  };
};

export const parseCreateWritingUploadUrlRequest = (value: unknown): CreateWritingUploadUrlRequest => {
  const record = expectObject(value);
  return {
    assignmentId: expectString(record, 'assignmentId'),
    fileName: expectTrimmedString(record, 'fileName'),
    mimeType: expectTrimmedString(record, 'mimeType'),
    byteSize: expectIntegerInRange(record, 'byteSize', { min: 1, max: 20 * 1024 * 1024 }) as number,
    sha256Base64: expectOptionalSha256Base64(record, 'sha256Base64'),
    assetOrder: expectIntegerInRange(record, 'assetOrder', { min: 1, max: 4 }) as number,
    attemptNo: expectIntegerInRange(record, 'attemptNo', { min: 1, max: 2, optional: true }),
  };
};

export const parseFinalizeWritingSubmissionRequest = (value: unknown): FinalizeWritingSubmissionRequest & { manualTranscript?: string } => {
  const record = expectObject(value);
  return {
    assignmentId: expectString(record, 'assignmentId'),
    source: expectString(record, 'source') as FinalizeWritingSubmissionRequest['source'],
    assetIds: expectStringArray(record, 'assetIds'),
    attemptNo: expectIntegerInRange(record, 'attemptNo', { min: 1, max: 2 }) as number,
    manualTranscript: expectOptionalString(record, 'manualTranscript'),
  };
};

const parseReviewDecisionBase = (value: unknown): { selectedEvaluationId: string; publicComment: string; privateMemo?: string } => {
  const record = expectObject(value);
  return {
    selectedEvaluationId: expectString(record, 'selectedEvaluationId'),
    publicComment: expectTrimmedString(record, 'publicComment'),
    privateMemo: expectOptionalString(record, 'privateMemo'),
  };
};

export const parseApproveWritingReturnRequest = (value: unknown): ApproveWritingReturnRequest => (
  parseReviewDecisionBase(value)
);

export const parseRequestWritingRevisionRequest = (value: unknown): RequestWritingRevisionRequest => (
  parseReviewDecisionBase(value)
);
