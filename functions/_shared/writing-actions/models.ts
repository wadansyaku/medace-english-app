import {
  type WritingAiExecutionProvenance,
  type WritingAiProvider,
  type WritingAssignment,
  type WritingAssignmentStatus,
  type WritingEvaluation,
  type WritingPromptSnapshot,
  type WritingPromptTemplate,
  type WritingSubmission,
  type WritingSubmissionAsset,
  type WritingTeacherReview,
  type WritingExamCategory,
  WritingSubmissionSource,
} from '../../../types';

export interface DbWritingTemplateRow {
  id: string;
  exam_category: string;
  template_type: string;
  title: string;
  prompt_base: string;
  guidance: string;
  default_word_count_min: number;
  default_word_count_max: number;
  sample_topic: string | null;
  tags: string;
}

export interface DbWritingAssignmentLikeRow {
  id: string;
  organization_name: string;
  instructor_user_id: string;
  student_user_id: string;
  template_id: string | null;
  exam_category: string;
  template_type: string;
  prompt_title: string;
  prompt_text: string;
  guidance: string;
  word_count_min: number;
  word_count_max: number;
  submission_code: string;
  prompt_snapshot: string;
  status: WritingAssignmentStatus;
  attempt_count: number;
  max_attempts: number;
  created_at: number;
  issued_at: number | null;
  last_submitted_at: number | null;
  last_returned_at: number | null;
  updated_at: number;
  instructor_name: string;
  student_name: string;
  latest_submission_id?: string | null;
}

export interface DbWritingAssignmentRow extends DbWritingAssignmentLikeRow {}

export interface DbWritingSubmissionRow {
  id: string;
  assignment_id: string;
  attempt_no: number;
  submission_source: string;
  submitted_by_user_id: string;
  transcript: string | null;
  transcript_confidence: number;
  ocr_provider: string | null;
  ocr_meta: string | null;
  selected_evaluation_id: string | null;
  processing_state: 'UPLOADED' | 'OCR_DONE' | 'EVALUATED';
  submitted_at: number;
}

export interface DbWritingSubmissionDetailBaseRow extends DbWritingAssignmentLikeRow {
  submission_id: string;
  submission_attempt_no: number;
  submission_source: string;
  submitted_by_user_id: string;
  transcript: string | null;
  transcript_confidence: number;
  ocr_provider: string | null;
  ocr_meta: string | null;
  selected_evaluation_id: string | null;
  processing_state: 'UPLOADED' | 'OCR_DONE' | 'EVALUATED';
  submitted_at: number;
}

export interface DbWritingAssetRow {
  id: string;
  assignment_id: string;
  submission_id: string | null;
  attempt_no: number;
  asset_order: number;
  file_name: string;
  mime_type: string;
  byte_size: number;
  r2_key: string;
  upload_token: string | null;
  uploaded_at: number | null;
}

export interface DbWritingEvaluationRow {
  id: string;
  submission_id: string;
  provider: WritingAiProvider;
  overall_score: number;
  rubric_json: string;
  strengths_json: string;
  improvement_points_json: string;
  sentence_corrections_json: string;
  corrected_draft: string;
  model_answer: string;
  confidence: number;
  transcript_alignment: number;
  rubric_consistency: number;
  structure_score: number;
  selection_score: number;
  cost_milli_yen: number;
  latency_ms: number;
  raw_payload: string | null;
  is_default: number;
}

export interface DbWritingRecommendedEvaluationRow {
  submission_id: string;
  provider: WritingAiProvider;
}

export interface DbWritingReviewRow {
  id: string;
  submission_id: string;
  reviewer_user_id: string;
  reviewer_name: string;
  selected_evaluation_id: string;
  public_comment: string;
  private_memo: string | null;
  review_decision: 'APPROVED_RETURN' | 'REVISION_REQUESTED' | 'COMPLETED';
  created_at: number;
  updated_at: number;
  released_at: number | null;
}

const buildAssetUrl = (assetId: string): string => `/api/writing/assets/${assetId}`;

export const parseAiProvenance = (raw: string | null | undefined): WritingAiExecutionProvenance | undefined => {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as {
      provenance?: WritingAiExecutionProvenance;
      provider?: WritingAiProvider;
      fallback?: boolean;
    };
    if (parsed.provenance) return parsed.provenance;
    if (parsed.provider) {
      return {
        mode: parsed.fallback ? 'fixture' : 'live',
        provider: parsed.provider,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const toTemplate = (row: DbWritingTemplateRow): WritingPromptTemplate => ({
  id: row.id,
  examCategory: row.exam_category as WritingExamCategory,
  templateType: row.template_type,
  title: row.title,
  promptBase: row.prompt_base,
  guidance: row.guidance,
  defaultWordCountMin: Number(row.default_word_count_min || 0),
  defaultWordCountMax: Number(row.default_word_count_max || 0),
  sampleTopic: row.sample_topic || undefined,
  tags: JSON.parse(row.tags || '[]') as string[],
});

export const toAsset = (row: DbWritingAssetRow): WritingSubmissionAsset => ({
  id: row.id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  assetOrder: Number(row.asset_order || 0),
  assetUrl: buildAssetUrl(row.id),
});

export const toEvaluation = (row: DbWritingEvaluationRow): WritingEvaluation => ({
  id: row.id,
  provider: row.provider,
  overallScore: Number(row.overall_score || 0),
  rubric: JSON.parse(row.rubric_json || '[]'),
  strengths: JSON.parse(row.strengths_json || '[]'),
  improvementPoints: JSON.parse(row.improvement_points_json || '[]'),
  sentenceCorrections: JSON.parse(row.sentence_corrections_json || '[]'),
  correctedDraft: row.corrected_draft,
  modelAnswer: row.model_answer,
  confidence: Number(row.confidence || 0),
  transcriptAlignment: Number(row.transcript_alignment || 0),
  rubricConsistency: Number(row.rubric_consistency || 0),
  structureScore: Number(row.structure_score || 0),
  selectionScore: Number(row.selection_score || 0),
  costMilliYen: Number(row.cost_milli_yen || 0),
  latencyMs: Number(row.latency_ms || 0),
  isDefault: Boolean(row.is_default),
  provenance: parseAiProvenance(row.raw_payload),
});

export const toTeacherReview = (row: DbWritingReviewRow): WritingTeacherReview => ({
  id: row.id,
  submissionId: row.submission_id,
  reviewerUid: row.reviewer_user_id,
  reviewerName: row.reviewer_name,
  selectedEvaluationId: row.selected_evaluation_id,
  publicComment: row.public_comment,
  privateMemo: row.private_memo || undefined,
  reviewDecision: row.review_decision,
  createdAt: Number(row.created_at || 0),
  updatedAt: Number(row.updated_at || 0),
  releasedAt: Number(row.released_at || 0) || undefined,
});

export const toAssignment = (
  row: DbWritingAssignmentLikeRow,
  options: {
    latestSubmissionId?: string;
    latestSubmission?: WritingSubmission;
  } = {},
): WritingAssignment => ({
  id: row.id,
  organizationName: row.organization_name,
  instructorUid: row.instructor_user_id,
  instructorName: row.instructor_name,
  studentUid: row.student_user_id,
  studentName: row.student_name,
  examCategory: row.exam_category as WritingExamCategory,
  templateId: row.template_id || undefined,
  templateType: row.template_type,
  promptTitle: row.prompt_title,
  promptText: row.prompt_text,
  guidance: row.guidance,
  wordCountMin: Number(row.word_count_min || 0),
  wordCountMax: Number(row.word_count_max || 0),
  submissionCode: row.submission_code,
  status: row.status,
  attemptCount: Number(row.attempt_count || 0),
  maxAttempts: Number(row.max_attempts || 2),
  createdAt: Number(row.created_at || 0),
  issuedAt: Number(row.issued_at || 0) || undefined,
  updatedAt: Number(row.updated_at || 0),
  lastSubmittedAt: Number(row.last_submitted_at || 0) || undefined,
  lastReturnedAt: Number(row.last_returned_at || 0) || undefined,
  latestSubmissionId: options.latestSubmissionId || options.latestSubmission?.id || row.latest_submission_id || undefined,
  latestSubmission: options.latestSubmission,
});

export const toSubmission = (
  row: DbWritingSubmissionRow,
  options: {
    assets: WritingSubmissionAsset[];
    evaluations: WritingEvaluation[];
    teacherReview?: WritingTeacherReview;
  },
): WritingSubmission => ({
  id: row.id,
  assignmentId: row.assignment_id,
  attemptNo: Number(row.attempt_no || 0),
  submissionSource: row.submission_source as WritingSubmissionSource,
  submittedByUid: row.submitted_by_user_id,
  transcript: row.transcript || '',
  transcriptConfidence: Number(row.transcript_confidence || 0),
  ocrProvider: (row.ocr_provider as WritingAiProvider | null) || undefined,
  ocrMeta: parseAiProvenance(row.ocr_meta),
  processingState: row.processing_state,
  submittedAt: Number(row.submitted_at || 0),
  assets: options.assets,
  evaluations: options.evaluations,
  selectedEvaluationId: row.selected_evaluation_id || undefined,
  teacherReview: options.teacherReview,
});

export const toSubmissionFromDetailRow = (
  row: DbWritingSubmissionDetailBaseRow,
  options: {
    assets: WritingSubmissionAsset[];
    evaluations: WritingEvaluation[];
    teacherReview?: WritingTeacherReview;
  },
): WritingSubmission => ({
  id: row.submission_id,
  assignmentId: row.id,
  attemptNo: Number(row.submission_attempt_no || 0),
  submissionSource: row.submission_source as WritingSubmissionSource,
  submittedByUid: row.submitted_by_user_id,
  transcript: row.transcript || '',
  transcriptConfidence: Number(row.transcript_confidence || 0),
  ocrProvider: (row.ocr_provider as WritingAiProvider | null) || undefined,
  ocrMeta: parseAiProvenance(row.ocr_meta),
  processingState: row.processing_state,
  submittedAt: Number(row.submitted_at || 0),
  assets: options.assets,
  evaluations: options.evaluations,
  selectedEvaluationId: row.selected_evaluation_id || undefined,
  teacherReview: options.teacherReview,
});

export const parsePromptSnapshot = (
  row: Pick<DbWritingAssignmentLikeRow, 'prompt_snapshot'>,
): WritingPromptSnapshot => JSON.parse(row.prompt_snapshot);
