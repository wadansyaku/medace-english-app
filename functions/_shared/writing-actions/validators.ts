import type {
  ApproveWritingReturnRequest,
  CreateWritingUploadUrlRequest,
  FinalizeWritingSubmissionRequest,
  GenerateWritingAssignmentRequest,
  RequestWritingRevisionRequest,
} from '../../../contracts/writing';
import { expectObject, expectOptionalString, expectString, expectStringArray, expectTrimmedString } from '../request-validation';

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
    byteSize: Number(record.byteSize || 0),
    assetOrder: Number(record.assetOrder || 0),
    attemptNo: typeof record.attemptNo === 'number' ? record.attemptNo : undefined,
  };
};

export const parseFinalizeWritingSubmissionRequest = (value: unknown): FinalizeWritingSubmissionRequest & { manualTranscript?: string } => {
  const record = expectObject(value);
  return {
    assignmentId: expectString(record, 'assignmentId'),
    source: expectString(record, 'source') as FinalizeWritingSubmissionRequest['source'],
    assetIds: expectStringArray(record, 'assetIds'),
    attemptNo: Number(record.attemptNo || 0),
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
