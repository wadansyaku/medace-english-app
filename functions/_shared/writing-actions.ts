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
} from '../../contracts/writing';
import {
  OrganizationRole,
  SubscriptionPlan,
  UserRole,
  type WritingAiExecutionProvenance,
  type WritingAiProvider,
  type WritingAssignment,
  type WritingAssignmentStatus,
  type WritingEvaluation,
  type WritingPromptSnapshot,
  type WritingPromptTemplate,
  type WritingQueueItem,
  type WritingSubmission,
  type WritingTeacherReview,
  type WritingSubmissionAsset,
  type WritingExamCategory,
  WritingAssignmentStatus as AssignmentStatus,
  WritingSubmissionSource,
} from '../../types';
import {
  buildPrintableFeedbackHtml,
  createSubmissionCode,
  encodeSubmissionMarker,
} from '../../utils/writing';
import { findUserById } from './auth';
import { HttpError, json, noContent } from './http';
import { handleGetAllStudentsProgress } from './storage-organization-actions';
import { readAll, readFirst } from './storage-support';
import type { AppEnv, DbUserRow } from './types';
import {
  generateWritingPrompt,
  resolveWritingAiMode,
  runWritingEvaluations,
  runWritingOcr,
} from './writing-ai';

interface DbWritingTemplateRow {
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

interface DbWritingAssignmentRow {
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
}

interface DbWritingSubmissionRow {
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

interface DbWritingAssetRow {
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

interface DbWritingEvaluationRow {
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

interface DbWritingReviewRow {
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

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_MIME_TYPE = 'application/pdf';

const guardWritingAccess = (user: DbUserRow): void => {
  if (
    user.role === UserRole.ADMIN
    || user.subscription_plan !== SubscriptionPlan.TOB_PAID
    || !user.organization_name
    || (user.role !== UserRole.STUDENT && user.role !== UserRole.INSTRUCTOR)
  ) {
    throw new HttpError(403, 'このワークスペースでは自由英作文機能を利用できません。');
  }
};

const guardTeacher = (user: DbUserRow): void => {
  guardWritingAccess(user);
  if (user.role !== UserRole.INSTRUCTOR) {
    throw new HttpError(403, '講師のみ操作できます。');
  }
};

const toTemplate = (row: DbWritingTemplateRow): WritingPromptTemplate => ({
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

const buildAssetUrl = (assetId: string): string => `/api/writing/assets/${assetId}`;

const toAsset = (row: DbWritingAssetRow): WritingSubmissionAsset => ({
  id: row.id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  assetOrder: Number(row.asset_order || 0),
  assetUrl: buildAssetUrl(row.id),
});

const parseAiProvenance = (raw: string | null | undefined): WritingAiExecutionProvenance | undefined => {
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

const toEvaluation = (row: DbWritingEvaluationRow): WritingEvaluation => ({
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

const toTeacherReview = (row: DbWritingReviewRow): WritingTeacherReview => ({
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

const toAssignment = (
  row: DbWritingAssignmentRow,
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
  latestSubmissionId: options.latestSubmissionId || options.latestSubmission?.id,
  latestSubmission: options.latestSubmission,
});

const readTemplate = async (env: AppEnv, templateId: string): Promise<WritingPromptTemplate> => {
  const row = await readFirst<DbWritingTemplateRow>(
    env,
    `SELECT *
     FROM writing_prompt_templates
     WHERE id = ?
       AND is_active = 1`,
    templateId,
  );

  if (!row) {
    throw new HttpError(404, '自由英作文テンプレートが見つかりません。');
  }
  return toTemplate(row);
};

const getVisibleStudentIds = async (env: AppEnv, user: DbUserRow): Promise<Set<string>> => {
  if (user.role === UserRole.STUDENT) {
    return new Set([user.id]);
  }
  const students = await handleGetAllStudentsProgress(env, user);
  return new Set(students.map((student) => student.uid));
};

const readAssignmentRow = async (env: AppEnv, assignmentId: string): Promise<DbWritingAssignmentRow> => {
  const row = await readFirst<DbWritingAssignmentRow>(
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

  if (!row) {
    throw new HttpError(404, '自由英作文課題が見つかりません。');
  }
  return row;
};

const readLatestSubmissionRow = async (
  env: AppEnv,
  assignmentId: string,
): Promise<DbWritingSubmissionRow | null> => readFirst<DbWritingSubmissionRow>(
  env,
  `SELECT *
   FROM writing_submissions
   WHERE assignment_id = ?
   ORDER BY submitted_at DESC
  LIMIT 1`,
  assignmentId,
);

const readLatestSubmissionRowsForAssignments = async (
  env: AppEnv,
  assignmentIds: string[],
): Promise<Map<string, DbWritingSubmissionRow>> => {
  if (assignmentIds.length === 0) return new Map();

  const placeholders = assignmentIds.map(() => '?').join(', ');
  const rows = await readAll<DbWritingSubmissionRow>(
    env,
    `SELECT s.*
     FROM writing_submissions s
     JOIN (
       SELECT assignment_id, MAX(submitted_at) AS submitted_at
       FROM writing_submissions
       WHERE assignment_id IN (${placeholders})
       GROUP BY assignment_id
     ) latest
       ON latest.assignment_id = s.assignment_id
      AND latest.submitted_at = s.submitted_at`,
    ...assignmentIds,
  );

  return new Map(rows.map((row) => [row.assignment_id, row]));
};

const readSubmissionRow = async (env: AppEnv, submissionId: string): Promise<DbWritingSubmissionRow> => {
  const row = await readFirst<DbWritingSubmissionRow>(
    env,
    `SELECT *
     FROM writing_submissions
     WHERE id = ?`,
    submissionId,
  );
  if (!row) {
    throw new HttpError(404, '提出データが見つかりません。');
  }
  return row;
};

const readSubmissionAssets = async (env: AppEnv, submissionId: string): Promise<WritingSubmissionAsset[]> => {
  const rows = await readAll<DbWritingAssetRow>(
    env,
    `SELECT *
     FROM writing_submission_assets
     WHERE submission_id = ?
     ORDER BY asset_order ASC`,
    submissionId,
  );
  return rows.map(toAsset);
};

const readSubmissionEvaluations = async (env: AppEnv, submissionId: string): Promise<WritingEvaluation[]> => {
  const rows = await readAll<DbWritingEvaluationRow>(
    env,
    `SELECT
       id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
       sentence_corrections_json, corrected_draft, model_answer, confidence, transcript_alignment,
       rubric_consistency, structure_score, selection_score, cost_milli_yen, latency_ms, raw_payload, is_default
     FROM writing_ai_evaluations
     WHERE submission_id = ?
     ORDER BY created_at ASC`,
    submissionId,
  );
  return rows.map(toEvaluation);
};

const readTeacherReview = async (env: AppEnv, submissionId: string): Promise<WritingTeacherReview | undefined> => {
  const row = await readFirst<DbWritingReviewRow>(
    env,
    `SELECT
       review.*,
       reviewer.display_name AS reviewer_name
     FROM writing_teacher_reviews review
     JOIN users reviewer ON reviewer.id = review.reviewer_user_id
     WHERE review.submission_id = ?`,
    submissionId,
  );

  return row ? toTeacherReview(row) : undefined;
};

const readPromptSnapshot = (assignment: DbWritingAssignmentRow): WritingPromptSnapshot => JSON.parse(assignment.prompt_snapshot);

const readSubmissionDetail = async (
  env: AppEnv,
  submissionId: string,
): Promise<WritingSubmissionDetailResponse> => {
  const submissionRow = await readSubmissionRow(env, submissionId);
  const assignmentRow = await readAssignmentRow(env, submissionRow.assignment_id);
  const [assets, evaluations, teacherReview] = await Promise.all([
    readSubmissionAssets(env, submissionId),
    readSubmissionEvaluations(env, submissionId),
    readTeacherReview(env, submissionId),
  ]);

  const submission: WritingSubmission = {
    id: submissionRow.id,
    assignmentId: submissionRow.assignment_id,
    attemptNo: Number(submissionRow.attempt_no || 0),
    submissionSource: submissionRow.submission_source as WritingSubmissionSource,
    submittedByUid: submissionRow.submitted_by_user_id,
    transcript: submissionRow.transcript || '',
    transcriptConfidence: Number(submissionRow.transcript_confidence || 0),
    ocrProvider: (submissionRow.ocr_provider as WritingAiProvider | null) || undefined,
    ocrMeta: parseAiProvenance(submissionRow.ocr_meta),
    processingState: submissionRow.processing_state,
    submittedAt: Number(submissionRow.submitted_at || 0),
    assets,
    evaluations,
    selectedEvaluationId: submissionRow.selected_evaluation_id || undefined,
    teacherReview,
  };

  return {
    assignment: toAssignment(assignmentRow, {
      latestSubmissionId: submission.id,
      latestSubmission: submission,
    }),
    submission,
  };
};

const ensureAssignmentAccess = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: DbWritingAssignmentRow,
): Promise<void> => {
  guardWritingAccess(user);
  const visibleStudentIds = await getVisibleStudentIds(env, user);
  if (!visibleStudentIds.has(assignment.student_user_id)) {
    throw new HttpError(403, '担当範囲の課題のみ参照できます。');
  }
};

const ensureSubmissionViewAccess = async (
  env: AppEnv,
  user: DbUserRow,
  detail: WritingSubmissionDetailResponse,
): Promise<void> => {
  const assignment = detail.assignment;
  const submission = detail.submission;
  const row = await readAssignmentRow(env, assignment.id);
  await ensureAssignmentAccess(env, user, row);

  if (
    user.role === UserRole.STUDENT
    && !submission.teacherReview
    && ![AssignmentStatus.RETURNED, AssignmentStatus.REVISION_REQUESTED, AssignmentStatus.COMPLETED].includes(assignment.status)
  ) {
    throw new HttpError(403, '講師確認後に返却された答案のみ閲覧できます。');
  }
};

const readAiAssetsForOcr = async (
  env: AppEnv,
  rows: DbWritingAssetRow[],
): Promise<Array<{ fileName: string; mimeType: string; base64Data: string }>> => {
  if (!env.WRITING_ASSETS) {
    throw new HttpError(503, 'WRITING_ASSETS が設定されていません。');
  }

  const assets = [];
  for (const row of rows) {
    const object = await env.WRITING_ASSETS.get(row.r2_key);
    if (!object) {
      throw new HttpError(404, `OCR 用資産が見つかりません: ${row.file_name}`);
    }
    const bytes = await object.arrayBuffer();
    assets.push({
      fileName: row.file_name,
      mimeType: row.mime_type,
      base64Data: Buffer.from(bytes).toString('base64'),
    });
  }
  return assets;
};

export const handleListWritingTemplates = async (
  env: AppEnv,
  user: DbUserRow,
  examCategory?: string,
): Promise<WritingTemplateListResponse> => {
  guardWritingAccess(user);
  const rows = await readAll<DbWritingTemplateRow>(
    env,
    `SELECT *
     FROM writing_prompt_templates
     WHERE is_active = 1
       AND (? IS NULL OR exam_category = ?)
     ORDER BY exam_category ASC, title ASC`,
    examCategory || null,
    examCategory || null,
  );
  return { templates: rows.map(toTemplate) };
};

export const handleListWritingAssignments = async (
  env: AppEnv,
  user: DbUserRow,
  scope: 'mine' | 'organization',
): Promise<WritingAssignmentListResponse> => {
  guardWritingAccess(user);
  const visibleStudentIds = await getVisibleStudentIds(env, user);
  const rows = await readAll<DbWritingAssignmentRow>(
    env,
    `SELECT
       a.*,
       instructor.display_name AS instructor_name,
       student.display_name AS student_name
     FROM writing_assignments a
     JOIN users instructor ON instructor.id = a.instructor_user_id
     JOIN users student ON student.id = a.student_user_id
     WHERE a.organization_name = ?
       AND (? = 1 OR a.student_user_id = ?)
     ORDER BY a.updated_at DESC`,
    user.organization_name,
    user.role === UserRole.STUDENT ? 0 : 1,
    user.id,
  );

  const assignments = await Promise.all(
    rows.filter((row) => visibleStudentIds.has(row.student_user_id)),
  );
  const latestSubmissionRows = await readLatestSubmissionRowsForAssignments(
    env,
    assignments.map((row) => row.id),
  );

  return {
    assignments: assignments
      .map((row) => {
        if (user.role === UserRole.STUDENT && scope === 'organization') return null;
        const latestSubmissionRow = latestSubmissionRows.get(row.id);
        if (!latestSubmissionRow) return toAssignment(row);
        if (
          user.role === UserRole.STUDENT
          && ![AssignmentStatus.RETURNED, AssignmentStatus.REVISION_REQUESTED, AssignmentStatus.COMPLETED].includes(row.status)
        ) {
          return toAssignment(row);
        }
        return toAssignment(row, { latestSubmissionId: latestSubmissionRow.id });
      })
      .filter(Boolean) as WritingAssignment[],
  };
};

export const handleGenerateWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  request: GenerateWritingAssignmentRequest,
): Promise<WritingAssignment> => {
  guardTeacher(user);
  const visibleStudents = await handleGetAllStudentsProgress(env, user);
  const student = visibleStudents.find((candidate) => candidate.uid === request.studentUid);
  if (!student) {
    throw new HttpError(403, '担当範囲の生徒のみ課題作成できます。');
  }
  const template = await readTemplate(env, request.templateId);
  const generated = await generateWritingPrompt(env, user, template, student.name, request.topicHint, request.notes);
  const submissionCode = createSubmissionCode();
  const assignmentId = crypto.randomUUID();
  const promptSnapshot: WritingPromptSnapshot = {
    templateId: template.id,
    examCategory: template.examCategory,
    templateType: template.templateType,
    title: generated.promptTitle,
    promptText: generated.promptText,
    guidance: generated.guidance,
    wordCountMin: template.defaultWordCountMin,
    wordCountMax: template.defaultWordCountMax,
    submissionCode,
    markerValue: encodeSubmissionMarker(assignmentId, submissionCode, 1),
  };
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO writing_assignments (
      id, organization_name, instructor_user_id, student_user_id, template_id, exam_category, template_type,
      prompt_title, prompt_text, guidance, word_count_min, word_count_max, submission_code, prompt_snapshot,
      status, attempt_count, max_attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 2, ?, ?)
  `).bind(
    assignmentId,
    user.organization_name,
    user.id,
    student.uid,
    template.id,
    template.examCategory,
    template.templateType,
    generated.promptTitle,
    generated.promptText,
    generated.guidance,
    template.defaultWordCountMin,
    template.defaultWordCountMax,
    submissionCode,
    JSON.stringify(promptSnapshot),
    AssignmentStatus.DRAFT,
    now,
    now,
  ).run();

  return toAssignment(await readAssignmentRow(env, assignmentId));
};

export const handleIssueWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  assignmentId: string,
): Promise<WritingAssignment> => {
  guardTeacher(user);
  const row = await readAssignmentRow(env, assignmentId);
  await ensureAssignmentAccess(env, user, row);
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, issued_at = COALESCE(issued_at, ?), updated_at = ?
    WHERE id = ?
  `).bind(
    AssignmentStatus.ISSUED,
    now,
    now,
    assignmentId,
  ).run();
  return toAssignment(await readAssignmentRow(env, assignmentId));
};

export const handleCreateWritingUploadUrl = async (
  env: AppEnv,
  user: DbUserRow,
  request: CreateWritingUploadUrlRequest,
): Promise<CreateWritingUploadUrlResponse> => {
  guardWritingAccess(user);
  const assignmentRow = await readAssignmentRow(env, request.assignmentId);
  await ensureAssignmentAccess(env, user, assignmentRow);

  const attemptNo = request.attemptNo || Number(assignmentRow.attempt_count || 0) + 1;
  if (attemptNo < 1 || attemptNo > Number(assignmentRow.max_attempts || 2)) {
    throw new HttpError(400, '再提出可能回数を超えています。');
  }
  if (assignmentRow.status !== AssignmentStatus.ISSUED && assignmentRow.status !== AssignmentStatus.REVISION_REQUESTED) {
    throw new HttpError(400, '現在の状態では提出できません。');
  }

  const mimeType = String(request.mimeType || '');
  const isPdf = mimeType === PDF_MIME_TYPE;
  const isImage = IMAGE_MIME_TYPES.has(mimeType);
  if (!isPdf && !isImage) {
    throw new HttpError(400, 'PDF または画像のみ提出できます。');
  }

  const existingAssets = await readAll<DbWritingAssetRow>(
    env,
    `SELECT *
     FROM writing_submission_assets
     WHERE assignment_id = ?
       AND attempt_no = ?`,
    request.assignmentId,
    attemptNo,
  );
  if (isPdf && existingAssets.length > 0) {
    throw new HttpError(400, 'PDF 提出は1ファイルのみです。');
  }
  if (!isPdf && existingAssets.length >= 4) {
    throw new HttpError(400, '画像提出は最大4枚までです。');
  }

  const assetId = crypto.randomUUID();
  const uploadToken = crypto.randomUUID();
  const safeName = request.fileName.replace(/[^\w.\-]+/g, '_');
  const r2Key = `${assignmentRow.organization_name}/${request.assignmentId}/attempt-${attemptNo}/${assetId}-${safeName}`;
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO writing_submission_assets (
      id, assignment_id, submission_id, attempt_no, asset_order, file_name, mime_type, byte_size, r2_key, upload_token,
      created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `).bind(
    assetId,
    request.assignmentId,
    attemptNo,
    request.assetOrder,
    request.fileName,
    mimeType,
    r2Key,
    uploadToken,
    now,
    now,
  ).run();

  return {
    assetId,
    uploadUrl: `/api/writing/upload/${uploadToken}`,
    assetUrl: buildAssetUrl(assetId),
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    attemptNo,
  };
};

export const handleWritingAssetUpload = async (
  env: AppEnv,
  uploadToken: string,
  request: Request,
): Promise<Response> => {
  const assetRow = await readFirst<DbWritingAssetRow>(
    env,
    `SELECT *
     FROM writing_submission_assets
     WHERE upload_token = ?`,
    uploadToken,
  );
  if (!assetRow) {
    throw new HttpError(404, 'アップロードトークンが無効です。');
  }
  if (!env.WRITING_ASSETS) {
    throw new HttpError(503, 'WRITING_ASSETS が設定されていません。');
  }

  const body = await request.arrayBuffer();
  await env.WRITING_ASSETS.put(assetRow.r2_key, body, {
    httpMetadata: {
      contentType: assetRow.mime_type,
    },
  });

  await env.DB.prepare(`
    UPDATE writing_submission_assets
    SET byte_size = ?, uploaded_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body.byteLength,
    Date.now(),
    Date.now(),
    assetRow.id,
  ).run();

  return noContent();
};

export const handleFinalizeWritingSubmission = async (
  env: AppEnv,
  user: DbUserRow,
  request: FinalizeWritingSubmissionRequest & { manualTranscript?: string },
): Promise<WritingSubmissionDetailResponse> => {
  guardWritingAccess(user);
  const assignmentRow = await readAssignmentRow(env, request.assignmentId);
  await ensureAssignmentAccess(env, user, assignmentRow);

  const attemptNo = Number(request.attemptNo || 0);
  if (!attemptNo || attemptNo > Number(assignmentRow.max_attempts || 2)) {
    throw new HttpError(400, '提出回数が不正です。');
  }

  const assetRows = await readAll<DbWritingAssetRow>(
    env,
    `SELECT *
     FROM writing_submission_assets
     WHERE assignment_id = ?
       AND attempt_no = ?
       AND id IN (${request.assetIds.map(() => '?').join(',')})
     ORDER BY asset_order ASC`,
    request.assignmentId,
    attemptNo,
    ...request.assetIds,
  );

  if (assetRows.length !== request.assetIds.length) {
    throw new HttpError(400, '提出ファイルの整合性を確認できませんでした。');
  }
  if (assetRows.some((row) => !row.uploaded_at)) {
    throw new HttpError(400, 'アップロードが完了していないファイルがあります。');
  }

  const assignment = toAssignment(assignmentRow);
  const aiMode = resolveWritingAiMode(env);
  const ocrAssets = aiMode === 'fixture'
    ? []
    : await readAiAssetsForOcr(env, assetRows).catch((error) => {
        if (aiMode === 'live') throw error;
        console.warn('Falling back to fixture OCR because asset loading failed.', error);
        return [];
      });
  const ocrResult = await runWritingOcr(env, user, assignment, ocrAssets, request.manualTranscript);
  const submissionId = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO writing_submissions (
      id, assignment_id, attempt_no, submission_source, submitted_by_user_id, transcript,
      transcript_confidence, ocr_provider, ocr_meta, processing_state, created_at, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EVALUATED', ?, ?, ?)
  `).bind(
    submissionId,
    request.assignmentId,
    attemptNo,
    request.source,
    user.id,
    ocrResult.transcript,
    ocrResult.confidence,
    ocrResult.provider,
    JSON.stringify({ provenance: ocrResult.provenance }),
    now,
    now,
    now,
  ).run();

  await env.DB.prepare(`
    UPDATE writing_submission_assets
    SET submission_id = ?, finalized_at = ?, updated_at = ?
    WHERE assignment_id = ?
      AND attempt_no = ?
      AND id IN (${assetRows.map(() => '?').join(',')})
  `).bind(
    submissionId,
    now,
    now,
    request.assignmentId,
    attemptNo,
    ...assetRows.map((row) => row.id),
  ).run();

  const assignmentWithSubmission = toAssignment(await readAssignmentRow(env, request.assignmentId));
  const evaluations = await runWritingEvaluations(env, user, assignmentWithSubmission, ocrResult.transcript);
  const selectedEvaluation = evaluations.find((evaluation) => evaluation.isDefault) || evaluations[0];

  for (const evaluation of evaluations) {
    await env.DB.prepare(`
      INSERT INTO writing_ai_evaluations (
        id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
        sentence_corrections_json, corrected_draft, model_answer, confidence, transcript_alignment,
        rubric_consistency, structure_score, selection_score, cost_milli_yen, latency_ms, prompt_snapshot,
        raw_payload, is_default, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      evaluation.id,
      submissionId,
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
      assignmentRow.prompt_snapshot,
      JSON.stringify({ provenance: evaluation.provenance }),
      evaluation.isDefault ? 1 : 0,
      now,
    ).run();
  }

  await env.DB.prepare(`
    UPDATE writing_submissions
    SET selected_evaluation_id = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    selectedEvaluation.id,
    Date.now(),
    submissionId,
  ).run();

  await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, attempt_count = ?, last_submitted_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    AssignmentStatus.REVIEW_READY,
    attemptNo,
    now,
    now,
    request.assignmentId,
  ).run();

  return readSubmissionDetail(env, submissionId);
};

export const handleListWritingReviewQueue = async (
  env: AppEnv,
  user: DbUserRow,
  scope: 'QUEUE' | 'HISTORY',
): Promise<WritingReviewQueueResponse> => {
  guardTeacher(user);
  const visibleStudentIds = await getVisibleStudentIds(env, user);
  const statuses = scope === 'QUEUE'
    ? [AssignmentStatus.REVIEW_READY]
    : [AssignmentStatus.RETURNED, AssignmentStatus.REVISION_REQUESTED, AssignmentStatus.COMPLETED];

  const placeholders = statuses.map(() => '?').join(',');
  const rows = await readAll<DbWritingAssignmentRow>(
    env,
    `SELECT
       a.*,
       instructor.display_name AS instructor_name,
       student.display_name AS student_name
     FROM writing_assignments a
     JOIN users instructor ON instructor.id = a.instructor_user_id
     JOIN users student ON student.id = a.student_user_id
     WHERE a.organization_name = ?
       AND a.status IN (${placeholders})
     ORDER BY COALESCE(a.last_submitted_at, a.updated_at) DESC`,
    user.organization_name,
    ...statuses,
  );

  const items: WritingQueueItem[] = [];
  for (const row of rows) {
    if (!visibleStudentIds.has(row.student_user_id)) continue;
    const latestSubmission = await readLatestSubmissionRow(env, row.id);
    if (!latestSubmission) continue;
    const evaluations = await readSubmissionEvaluations(env, latestSubmission.id);
    const recommended = evaluations.find((evaluation) => evaluation.isDefault) || evaluations[0];
    items.push({
      assignmentId: row.id,
      submissionId: latestSubmission.id,
      studentUid: row.student_user_id,
      studentName: row.student_name,
      examCategory: row.exam_category as WritingExamCategory,
      promptTitle: row.prompt_title,
      status: row.status,
      attemptNo: Number(latestSubmission.attempt_no || 0),
      submittedAt: Number(latestSubmission.submitted_at || 0),
      transcriptConfidence: Number(latestSubmission.transcript_confidence || 0),
      recommendedProvider: recommended?.provider,
      instructorName: row.instructor_name,
    });
  }

  return { items };
};

export const handleGetWritingSubmissionDetail = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
): Promise<WritingSubmissionDetailResponse> => {
  guardWritingAccess(user);
  const detail = await readSubmissionDetail(env, submissionId);
  await ensureSubmissionViewAccess(env, user, detail);
  return detail;
};

const applyTeacherReview = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
  payload: ApproveWritingReturnRequest | RequestWritingRevisionRequest,
  decision: WritingTeacherReview['reviewDecision'],
): Promise<WritingSubmissionDetailResponse> => {
  guardTeacher(user);
  const detail = await readSubmissionDetail(env, submissionId);
  const assignmentRow = await readAssignmentRow(env, detail.assignment.id);
  await ensureAssignmentAccess(env, user, assignmentRow);

  const selectedEvaluation = detail.submission.evaluations.find((evaluation) => evaluation.id === payload.selectedEvaluationId);
  if (!selectedEvaluation) {
    throw new HttpError(400, '選択したAI評価が見つかりません。');
  }

  const now = Date.now();
  const reviewId = detail.submission.teacherReview?.id || crypto.randomUUID();
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
    reviewId,
    submissionId,
    user.id,
    payload.selectedEvaluationId,
    payload.publicComment.trim(),
    payload.privateMemo?.trim() || null,
    decision,
    now,
    now,
    now,
  ).run();

  const nextStatus =
    decision === 'REVISION_REQUESTED'
      ? AssignmentStatus.REVISION_REQUESTED
      : detail.submission.attemptNo >= detail.assignment.maxAttempts
        ? AssignmentStatus.COMPLETED
        : AssignmentStatus.RETURNED;

  await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, last_returned_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    nextStatus,
    now,
    now,
    detail.assignment.id,
  ).run();

  return readSubmissionDetail(env, submissionId);
};

export const handleApproveWritingReturn = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
  payload: ApproveWritingReturnRequest,
): Promise<WritingSubmissionDetailResponse> => applyTeacherReview(env, user, submissionId, payload, 'APPROVED_RETURN');

export const handleRequestWritingRevision = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
  payload: RequestWritingRevisionRequest,
): Promise<WritingSubmissionDetailResponse> => {
  const detail = await readSubmissionDetail(env, submissionId);
  if (detail.submission.attemptNo >= detail.assignment.maxAttempts) {
    throw new HttpError(400, 'これ以上の再提出は設定できません。');
  }
  return applyTeacherReview(env, user, submissionId, payload, 'REVISION_REQUESTED');
};

export const handleCompleteWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  assignmentId: string,
): Promise<WritingAssignment> => {
  guardTeacher(user);
  const row = await readAssignmentRow(env, assignmentId);
  await ensureAssignmentAccess(env, user, row);
  await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    AssignmentStatus.COMPLETED,
    Date.now(),
    assignmentId,
  ).run();
  return toAssignment(await readAssignmentRow(env, assignmentId));
};

export const handleGetWritingPrintableFeedback = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
): Promise<PrintableWritingFeedbackResponse> => {
  const detail = await readSubmissionDetail(env, submissionId);
  await ensureSubmissionViewAccess(env, user, detail);

  const selectedEvaluation = detail.submission.evaluations.find((evaluation) => (
    evaluation.id === (detail.submission.teacherReview?.selectedEvaluationId || detail.submission.selectedEvaluationId)
  )) || detail.submission.evaluations[0];
  if (!selectedEvaluation) {
    throw new HttpError(404, '印刷できる添削結果がありません。');
  }

  const promptSnapshot = readPromptSnapshot(await readAssignmentRow(env, detail.assignment.id));
  return {
    title: `${detail.assignment.studentName}-${detail.assignment.promptTitle}-feedback`,
    html: buildPrintableFeedbackHtml(
      promptSnapshot,
      selectedEvaluation,
      detail.submission.teacherReview?.publicComment || '次回は理由と具体例のつながりを意識しましょう。',
      detail.submission.transcript,
      detail.assignment.studentName,
    ),
  };
};

export const handleGetWritingAsset = async (
  env: AppEnv,
  user: DbUserRow,
  assetId: string,
): Promise<Response> => {
  guardWritingAccess(user);
  if (!env.WRITING_ASSETS) {
    throw new HttpError(503, 'WRITING_ASSETS が設定されていません。');
  }

  const asset = await readFirst<DbWritingAssetRow>(
    env,
    `SELECT *
     FROM writing_submission_assets
     WHERE id = ?`,
    assetId,
  );
  if (!asset) {
    throw new HttpError(404, '提出ファイルが見つかりません。');
  }

  const assignment = await readAssignmentRow(env, asset.assignment_id);
  await ensureAssignmentAccess(env, user, assignment);
  const object = await env.WRITING_ASSETS.get(asset.r2_key);
  if (!object) {
    throw new HttpError(404, 'ファイル本体が見つかりません。');
  }

  const headers = new Headers();
  headers.set('Content-Type', asset.mime_type);
  headers.set('Cache-Control', 'private, max-age=60');
  return new Response(object.body, { headers });
};

export const handleWritingRequest = async (
  env: AppEnv,
  user: DbUserRow,
  request: Request,
  writingPath: string,
): Promise<Response> => {
  const pathname = writingPath.replace(/^\/+/, '');
  const segments = pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && segments[0] === 'templates') {
    const url = new URL(request.url);
    return json(await handleListWritingTemplates(env, user, url.searchParams.get('examCategory') || undefined));
  }

  if (request.method === 'GET' && segments[0] === 'assignments') {
    const url = new URL(request.url);
    const scope = (url.searchParams.get('scope') as 'mine' | 'organization' | null) || 'mine';
    return json(await handleListWritingAssignments(env, user, scope));
  }

  if (request.method === 'POST' && segments[0] === 'assignments' && segments[1] === 'generate') {
    const body = await request.json() as GenerateWritingAssignmentRequest;
    return json(await handleGenerateWritingAssignment(env, user, body));
  }

  if (request.method === 'POST' && segments[0] === 'assignments' && segments[1] === 'issue') {
    const body = await request.json() as { assignmentId?: string };
    return json(await handleIssueWritingAssignment(env, user, String(body.assignmentId || '')));
  }

  if (request.method === 'POST' && segments[0] === 'assignments' && segments[1] === 'complete') {
    const body = await request.json() as { assignmentId?: string };
    return json(await handleCompleteWritingAssignment(env, user, String(body.assignmentId || '')));
  }

  if (request.method === 'POST' && segments[0] === 'upload-url') {
    const body = await request.json() as CreateWritingUploadUrlRequest;
    return json(await handleCreateWritingUploadUrl(env, user, body));
  }

  if (request.method === 'PUT' && segments[0] === 'upload' && segments[1]) {
    return handleWritingAssetUpload(env, segments[1], request);
  }

  if (request.method === 'GET' && segments[0] === 'review-queue') {
    const url = new URL(request.url);
    const scope = (url.searchParams.get('scope') as 'QUEUE' | 'HISTORY' | null) || 'QUEUE';
    return json(await handleListWritingReviewQueue(env, user, scope));
  }

  if (request.method === 'POST' && segments[0] === 'submissions' && segments[1] === 'finalize') {
    const body = await request.json() as FinalizeWritingSubmissionRequest & { manualTranscript?: string };
    return json(await handleFinalizeWritingSubmission(env, user, body));
  }

  if (request.method === 'GET' && segments[0] === 'submissions' && segments[1] && !segments[2]) {
    return json(await handleGetWritingSubmissionDetail(env, user, segments[1]));
  }

  if (request.method === 'POST' && segments[0] === 'submissions' && segments[1] && segments[2] === 'approve-return') {
    const body = await request.json() as ApproveWritingReturnRequest;
    return json(await handleApproveWritingReturn(env, user, segments[1], body));
  }

  if (request.method === 'POST' && segments[0] === 'submissions' && segments[1] && segments[2] === 'request-revision') {
    const body = await request.json() as RequestWritingRevisionRequest;
    return json(await handleRequestWritingRevision(env, user, segments[1], body));
  }

  if (request.method === 'GET' && segments[0] === 'submissions' && segments[1] && segments[2] === 'printable-feedback') {
    return json(await handleGetWritingPrintableFeedback(env, user, segments[1]));
  }

  if (request.method === 'GET' && segments[0] === 'assets' && segments[1]) {
    return handleGetWritingAsset(env, user, segments[1]);
  }

  throw new HttpError(404, 'Writing API エンドポイントが見つかりません。');
};
