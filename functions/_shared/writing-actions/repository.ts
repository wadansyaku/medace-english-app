import type { WritingAiProvider, WritingAssignmentStatus } from '../../../types';
import { readAll, readFirst } from '../storage-support';
import type { AppEnv } from '../types';
import type {
  DbWritingAssetRow,
  DbWritingAssignmentRow,
  DbWritingEvaluationRow,
  DbWritingRecommendedEvaluationRow,
  DbWritingReviewRow,
  DbWritingSubmissionDetailBaseRow,
  DbWritingSubmissionRow,
  DbWritingTemplateRow,
} from './models';

const toGroupedMap = <TRow>(
  rows: TRow[],
  keyOf: (row: TRow) => string | null | undefined,
): Map<string, TRow[]> => {
  const grouped = new Map<string, TRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(key, [row]);
  }
  return grouped;
};

export const readTemplateRow = async (env: AppEnv, templateId: string): Promise<DbWritingTemplateRow | null> => readFirst(
  env,
  `SELECT *
   FROM writing_prompt_templates
   WHERE id = ?
     AND is_active = 1`,
  templateId,
);

export const listTemplateRows = async (env: AppEnv, examCategory?: string): Promise<DbWritingTemplateRow[]> => readAll(
  env,
  `SELECT *
   FROM writing_prompt_templates
   WHERE is_active = 1
     AND (? IS NULL OR exam_category = ?)
   ORDER BY exam_category ASC, title ASC`,
  examCategory || null,
  examCategory || null,
);

export const readAssignmentRow = async (env: AppEnv, assignmentId: string): Promise<DbWritingAssignmentRow | null> => readFirst(
  env,
  `SELECT
     a.*,
     instructor.display_name AS instructor_name,
     student.display_name AS student_name
   FROM writing_assignments a
   JOIN users instructor ON instructor.id = a.instructor_user_id
   JOIN users student ON student.id = a.student_user_id
   WHERE a.id = ?`,
  assignmentId,
);

export const readAssignmentRowsForScope = async (
  env: AppEnv,
  organizationId: string,
  includeAllStudents: boolean,
  studentId: string,
): Promise<DbWritingAssignmentRow[]> => readAll(
  env,
  `SELECT
     a.*,
     instructor.display_name AS instructor_name,
     student.display_name AS student_name,
     (
       SELECT s.id
       FROM writing_submissions s
       WHERE s.assignment_id = a.id
       ORDER BY s.submitted_at DESC, s.attempt_no DESC, s.id DESC
       LIMIT 1
     ) AS latest_submission_id
   FROM writing_assignments a
   JOIN users instructor ON instructor.id = a.instructor_user_id
   JOIN users student ON student.id = a.student_user_id
   WHERE a.organization_id = ?
     AND (? = 1 OR a.student_user_id = ?)
   ORDER BY a.updated_at DESC`,
  organizationId,
  includeAllStudents ? 1 : 0,
  studentId,
);

export const readReviewQueueAssignmentRows = async (
  env: AppEnv,
  organizationId: string,
  statuses: WritingAssignmentStatus[],
): Promise<DbWritingAssignmentRow[]> => {
  const placeholders = statuses.map(() => '?').join(', ');
  return readAll(
    env,
    `SELECT
       a.*,
       instructor.display_name AS instructor_name,
       student.display_name AS student_name
     FROM writing_assignments a
     JOIN users instructor ON instructor.id = a.instructor_user_id
     JOIN users student ON student.id = a.student_user_id
     WHERE a.organization_id = ?
       AND a.status IN (${placeholders})
     ORDER BY COALESCE(a.last_submitted_at, a.updated_at) DESC`,
    organizationId,
    ...statuses,
  );
};

export const readSubmissionRow = async (env: AppEnv, submissionId: string): Promise<DbWritingSubmissionRow | null> => readFirst(
  env,
  `SELECT *
   FROM writing_submissions
   WHERE id = ?`,
  submissionId,
);

export const readSubmissionRowByAssignmentAttempt = async (
  env: AppEnv,
  assignmentId: string,
  attemptNo: number,
): Promise<DbWritingSubmissionRow | null> => readFirst(
  env,
  `SELECT *
   FROM writing_submissions
   WHERE assignment_id = ?
     AND attempt_no = ?`,
  assignmentId,
  attemptNo,
);

export const readSubmissionDetailBaseRow = async (
  env: AppEnv,
  submissionId: string,
): Promise<DbWritingSubmissionDetailBaseRow | null> => readFirst(
  env,
  `SELECT
     s.id AS submission_id,
     s.attempt_no AS submission_attempt_no,
     s.submission_source,
     s.submitted_by_user_id,
     s.transcript,
     s.transcript_confidence,
     s.ocr_provider,
     s.ocr_meta,
     s.selected_evaluation_id,
     s.processing_state,
     s.submitted_at,
     a.*,
     instructor.display_name AS instructor_name,
     student.display_name AS student_name
   FROM writing_submissions s
   JOIN writing_assignments a ON a.id = s.assignment_id
   JOIN users instructor ON instructor.id = a.instructor_user_id
   JOIN users student ON student.id = a.student_user_id
   WHERE s.id = ?`,
  submissionId,
);

export const readLatestSubmissionRowsForAssignments = async (
  env: AppEnv,
  assignmentIds: string[],
): Promise<Map<string, DbWritingSubmissionRow>> => {
  if (assignmentIds.length === 0) return new Map();

  const placeholders = assignmentIds.map(() => '?').join(', ');
  const rows = await readAll<DbWritingSubmissionRow>(
    env,
    `SELECT s.*
     FROM writing_submissions s
     WHERE s.assignment_id IN (${placeholders})
       AND s.id = (
         SELECT latest.id
         FROM writing_submissions latest
         WHERE latest.assignment_id = s.assignment_id
         ORDER BY latest.submitted_at DESC, latest.attempt_no DESC, latest.id DESC
         LIMIT 1
       )`,
    ...assignmentIds,
  );

  return new Map(rows.map((row) => [row.assignment_id, row]));
};

export const readSubmissionAssetRowsBySubmissionIds = async (
  env: AppEnv,
  submissionIds: string[],
): Promise<Map<string, DbWritingAssetRow[]>> => {
  if (submissionIds.length === 0) return new Map();

  const placeholders = submissionIds.map(() => '?').join(', ');
  const rows = await readAll<DbWritingAssetRow>(
    env,
    `SELECT *
     FROM writing_submission_assets
     WHERE submission_id IN (${placeholders})
     ORDER BY submission_id ASC, asset_order ASC`,
    ...submissionIds,
  );

  return toGroupedMap(rows, (row) => row.submission_id);
};

export const readSubmissionEvaluationRowsBySubmissionIds = async (
  env: AppEnv,
  submissionIds: string[],
): Promise<Map<string, DbWritingEvaluationRow[]>> => {
  if (submissionIds.length === 0) return new Map();

  const placeholders = submissionIds.map(() => '?').join(', ');
  const rows = await readAll<DbWritingEvaluationRow>(
    env,
    `SELECT
       id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
       sentence_corrections_json, corrected_draft, model_answer, confidence, transcript_alignment,
       rubric_consistency, structure_score, selection_score, cost_milli_yen, latency_ms, raw_payload, is_default
     FROM writing_ai_evaluations
     WHERE submission_id IN (${placeholders})
     ORDER BY submission_id ASC, created_at ASC, id ASC`,
    ...submissionIds,
  );

  return toGroupedMap(rows, (row) => row.submission_id);
};

export const readTeacherReviewRowsBySubmissionIds = async (
  env: AppEnv,
  submissionIds: string[],
): Promise<Map<string, DbWritingReviewRow>> => {
  if (submissionIds.length === 0) return new Map();

  const placeholders = submissionIds.map(() => '?').join(', ');
  const rows = await readAll<DbWritingReviewRow>(
    env,
    `SELECT
       review.*,
       reviewer.display_name AS reviewer_name
     FROM writing_teacher_reviews review
     JOIN users reviewer ON reviewer.id = review.reviewer_user_id
     WHERE review.submission_id IN (${placeholders})`,
    ...submissionIds,
  );

  return new Map(rows.map((row) => [row.submission_id, row]));
};

export const readRecommendedEvaluationProviders = async (
  env: AppEnv,
  submissionIds: string[],
): Promise<Map<string, WritingAiProvider>> => {
  if (submissionIds.length === 0) return new Map();

  const placeholders = submissionIds.map(() => '?').join(', ');
  const rows = await readAll<DbWritingRecommendedEvaluationRow>(
    env,
    `SELECT e.submission_id, e.provider
     FROM writing_ai_evaluations e
     WHERE e.submission_id IN (${placeholders})
       AND e.id = (
         SELECT selected.id
         FROM writing_ai_evaluations selected
         WHERE selected.submission_id = e.submission_id
         ORDER BY selected.is_default DESC, selected.created_at ASC, selected.id ASC
         LIMIT 1
       )`,
    ...submissionIds,
  );

  return new Map(rows.map((row) => [row.submission_id, row.provider]));
};

export const readSubmissionAssetRowsForAttempt = async (
  env: AppEnv,
  assignmentId: string,
  attemptNo: number,
): Promise<DbWritingAssetRow[]> => readAll(
  env,
  `SELECT *
   FROM writing_submission_assets
   WHERE assignment_id = ?
     AND attempt_no = ?
   ORDER BY asset_order ASC`,
  assignmentId,
  attemptNo,
);

export const readSubmissionAssetRowsByIdsForAttempt = async (
  env: AppEnv,
  assignmentId: string,
  attemptNo: number,
  assetIds: string[],
): Promise<DbWritingAssetRow[]> => {
  if (assetIds.length === 0) return [];

  const placeholders = assetIds.map(() => '?').join(', ');
  return readAll(
    env,
    `SELECT *
     FROM writing_submission_assets
     WHERE assignment_id = ?
       AND attempt_no = ?
       AND id IN (${placeholders})
     ORDER BY asset_order ASC`,
    assignmentId,
    attemptNo,
    ...assetIds,
  );
};

export const readSubmissionAssetRowByUploadToken = async (
  env: AppEnv,
  uploadToken: string,
): Promise<DbWritingAssetRow | null> => readFirst(
  env,
  `SELECT *
   FROM writing_submission_assets
   WHERE upload_token = ?`,
  uploadToken,
);

export const readSubmissionAssetRowById = async (env: AppEnv, assetId: string): Promise<DbWritingAssetRow | null> => readFirst(
  env,
  `SELECT *
   FROM writing_submission_assets
   WHERE id = ?`,
  assetId,
);
