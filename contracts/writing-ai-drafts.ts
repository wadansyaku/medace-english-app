export type WritingDraftOperation = 'OCR' | 'WRITING_FEEDBACK';

export interface WritingAiCapabilities {
  provider: 'OPENAI';
  model: string;
  state: 'DISABLED' | 'REQUIRES_DATA_APPROVAL' | 'ENABLED';
  ocrEnabled: boolean;
  feedbackEnabled: boolean;
  pdfOcrEnabled: false;
  gradingEnabled: boolean;
  draftSavingEnabled: true;
  message: string;
  monthlyPlanLimitMicroUsd: number;
  dispatchLimitMicroUsd: number;
}

export interface WritingInputDraft {
  assignmentId: string;
  attemptNo: number;
  revision: number;
  manualTranscript: string;
  assetIds: string[];
  assets: Array<{ id: string; fileName: string; mimeType: string; byteSize: number }>;
  updatedAt: number;
  assessmentStatus: 'UNASSESSED';
}

export interface SaveWritingInputDraftRequest {
  /** Reserve a new draft revision before uploads; unattached uploaded originals remain archived. */
  prepareUpload?: true;
  requestId: string;
  assignmentId: string;
  attemptNo: number;
  expectedRevision: number;
  assetIds: string[];
  manualTranscript: string;
}

export interface WritingInputDraftResponse {
  draft: WritingInputDraft | null;
}

export interface GenerateWritingAiDraftRequest {
  requestId: string;
  assignmentId: string;
  attemptNo: number;
  operation: WritingDraftOperation;
  inputDraftRevision: number;
}

export type WritingAiDraftResult =
  | { operation: 'OCR'; transcript: string; confidence: number }
  | {
      operation: 'WRITING_FEEDBACK'; strengths: string[]; improvementPoints: string[];
      correctedDraft: string;
      sentenceCorrections: Array<{ before: string; after: string; reason: string }>;
    };

export interface WritingAiDraftResponse {
  requestId: string;
  assignmentId: string;
  attemptNo: number;
  operation: WritingDraftOperation;
  status: 'PENDING' | 'READY' | 'UNASSESSED';
  assessmentStatus: 'UNASSESSED';
  requiresHumanReview: true;
  result?: WritingAiDraftResult;
  reason?: string;
  updatedAt: number;
  /** Present on recovery-aware servers; verify before adopting a canonical ID. */
  inputDraftRevision?: number;
  /** GET never dispatches. Resume only with an explicit POST of the same request. */
  recoveryAction?: 'RESEND_SAME_REQUEST' | 'CHECK_RESULT' | 'NONE';
}
