import type {
  ApproveWritingReturnRequest,
  RequestWritingRevisionRequest,
} from '../../../contracts/writing';
import {
  type WritingEvaluation,
  type WritingTeacherReview,
  WritingAssignmentStatus as AssignmentStatus,
} from '../../../types';
import type { AppEnv } from '../types';
import type { DbWritingAssetRow } from './models';

interface CreateSubmissionRecordParams {
  assignmentId: string;
  attemptNo: number;
  source: string;
  submittedByUserId: string;
  transcript: string;
  transcriptConfidence: number;
  ocrProvider: string;
  ocrProvenance: unknown;
  now: number;
}

export const createSubmissionRecord = async (
  env: AppEnv,
  params: CreateSubmissionRecordParams,
): Promise<string> => {
  const submissionId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO writing_submissions (
      id, assignment_id, attempt_no, submission_source, submitted_by_user_id, transcript,
      transcript_confidence, ocr_provider, ocr_meta, processing_state, created_at, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EVALUATED', ?, ?, ?)
  `).bind(
    submissionId,
    params.assignmentId,
    params.attemptNo,
    params.source,
    params.submittedByUserId,
    params.transcript,
    params.transcriptConfidence,
    params.ocrProvider,
    JSON.stringify({ provenance: params.ocrProvenance }),
    params.now,
    params.now,
    params.now,
  ).run();
  return submissionId;
};

export const linkSubmissionAssets = async (
  env: AppEnv,
  params: {
    submissionId: string;
    assignmentId: string;
    attemptNo: number;
    assetRows: DbWritingAssetRow[];
    now: number;
  },
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE writing_submission_assets
    SET submission_id = ?, finalized_at = ?, updated_at = ?
    WHERE assignment_id = ?
      AND attempt_no = ?
      AND id IN (${params.assetRows.map(() => '?').join(', ')})
  `).bind(
    params.submissionId,
    params.now,
    params.now,
    params.assignmentId,
    params.attemptNo,
    ...params.assetRows.map((row) => row.id),
  ).run();
};

export const insertSubmissionEvaluations = async (
  env: AppEnv,
  params: {
    submissionId: string;
    evaluations: WritingEvaluation[];
    promptSnapshot: string;
    now: number;
  },
): Promise<void> => {
  for (const evaluation of params.evaluations) {
    await env.DB.prepare(`
      INSERT INTO writing_ai_evaluations (
        id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
        sentence_corrections_json, corrected_draft, model_answer, confidence, transcript_alignment,
        rubric_consistency, structure_score, selection_score, cost_milli_yen, latency_ms, prompt_snapshot,
        raw_payload, is_default, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      evaluation.id,
      params.submissionId,
      evaluation.provider,
      evaluation.overallScore,
      JSON.stringify(evaluation.rubric),
      JSON.stringify(evaluation.strengths),
      JSON.stringify(evaluation.improvementPoints),
      JSON.stringify(evaluation.sentenceCorrections),
      evaluation.correctedDraft,
      evaluation.modelAnswer,
      evaluation.confidence,
      evaluation.transcriptAlignment,
      evaluation.rubricConsistency,
      evaluation.structureScore,
      evaluation.selectionScore,
      evaluation.costMilliYen,
      evaluation.latencyMs,
      params.promptSnapshot,
      JSON.stringify({ provenance: evaluation.provenance }),
      evaluation.isDefault ? 1 : 0,
      params.now,
    ).run();
  }
};

export const setSubmissionSelectedEvaluation = async (
  env: AppEnv,
  params: {
    submissionId: string;
    selectedEvaluationId: string;
    now: number;
  },
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE writing_submissions
    SET selected_evaluation_id = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    params.selectedEvaluationId,
    params.now,
    params.submissionId,
  ).run();
};

export const setAssignmentReviewReady = async (
  env: AppEnv,
  params: {
    assignmentId: string;
    attemptNo: number;
    now: number;
  },
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, attempt_count = ?, last_submitted_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    AssignmentStatus.REVIEW_READY,
    params.attemptNo,
    params.now,
    params.now,
    params.assignmentId,
  ).run();
};

export const upsertTeacherReviewRecord = async (
  env: AppEnv,
  params: {
    submissionId: string;
    reviewId: string;
    reviewerUserId: string;
    payload: ApproveWritingReturnRequest | RequestWritingRevisionRequest;
    decision: WritingTeacherReview['reviewDecision'];
    now: number;
  },
): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO writing_teacher_reviews (
      id, submission_id, reviewer_user_id, selected_evaluation_id, public_comment, private_memo, review_decision,
      created_at, updated_at, released_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id) DO UPDATE SET
      reviewer_user_id = excluded.reviewer_user_id,
      selected_evaluation_id = excluded.selected_evaluation_id,
      public_comment = excluded.public_comment,
      private_memo = excluded.private_memo,
      review_decision = excluded.review_decision,
      updated_at = excluded.updated_at,
      released_at = excluded.released_at
  `).bind(
    params.reviewId,
    params.submissionId,
    params.reviewerUserId,
    params.payload.selectedEvaluationId,
    params.payload.publicComment.trim(),
    params.payload.privateMemo?.trim() || null,
    params.decision,
    params.now,
    params.now,
    params.now,
  ).run();
};

export const resolveAssignmentStatusForTeacherDecision = (
  decision: WritingTeacherReview['reviewDecision'],
  attemptNo: number,
  maxAttempts: number,
): AssignmentStatus => {
  if (decision === 'REVISION_REQUESTED') {
    return AssignmentStatus.REVISION_REQUESTED;
  }
  if (attemptNo >= maxAttempts) {
    return AssignmentStatus.COMPLETED;
  }
  return AssignmentStatus.RETURNED;
};

export const setAssignmentTeacherDecision = async (
  env: AppEnv,
  params: {
    assignmentId: string;
    status: AssignmentStatus;
    now: number;
  },
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, last_returned_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    params.status,
    params.now,
    params.now,
    params.assignmentId,
  ).run();
};

export const setAssignmentCompleted = async (
  env: AppEnv,
  params: {
    assignmentId: string;
    now: number;
  },
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    AssignmentStatus.COMPLETED,
    params.now,
    params.assignmentId,
  ).run();
};
