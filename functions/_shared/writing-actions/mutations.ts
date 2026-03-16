import type {
  ApproveWritingReturnRequest,
  CreateWritingUploadUrlRequest,
  CreateWritingUploadUrlResponse,
  FinalizeWritingSubmissionRequest,
  GenerateWritingAssignmentRequest,
  RequestWritingRevisionRequest,
  WritingSubmissionDetailResponse,
} from '../../../contracts/writing';
import {
  type WritingAssignment,
  type WritingPromptSnapshot,
  type WritingTeacherReview,
  WritingAssignmentStatus as AssignmentStatus,
} from '../../../types';
import {
  createSubmissionCode,
  encodeSubmissionMarker,
} from '../../../utils/writing';
import { HttpError, noContent } from '../http';
import { rebuildOrganizationKpiSnapshots } from '../organization-kpi';
import { touchWeeklyMissionProgressFromWriting } from '../storage-mission-actions';
import { readFirst, toTokyoDateKey } from '../storage-support';
import type { AppEnv, DbUserRow } from '../types';
import {
  generateWritingPrompt,
  resolveWritingAiMode,
  runWritingEvaluations,
  runWritingOcr,
} from '../writing-ai';
import {
  ensureAssignmentAccess,
  getVisibleStudentIds,
  guardTeacher,
  guardWritingAccess,
  requireWritingOrganizationContext,
} from './access';
import {
  type DbWritingAssetRow,
  toAssignment,
  toTemplate,
} from './models';
import {
  readAssignmentRow,
  readSubmissionAssetRowById,
  readSubmissionAssetRowByUploadToken,
  readSubmissionAssetRowsByIdsForAttempt,
  readSubmissionAssetRowsForAttempt,
  readTemplateRow,
} from './repository';
import {
  readAssignmentResponse,
  readSubmissionContext,
} from './reads';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_MIME_TYPE = 'application/pdf';

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

const getTemplateOrThrow = async (env: AppEnv, templateId: string) => {
  const row = await readTemplateRow(env, templateId);
  if (!row) {
    throw new HttpError(404, '自由英作文テンプレートが見つかりません。');
  }
  return row;
};

const getAssignmentRowOrThrow = async (env: AppEnv, assignmentId: string) => {
  const row = await readAssignmentRow(env, assignmentId);
  if (!row) {
    throw new HttpError(404, '自由英作文課題が見つかりません。');
  }
  return row;
};

export const handleGenerateWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  request: GenerateWritingAssignmentRequest,
): Promise<WritingAssignment> => {
  guardTeacher(user);
  const organization = await requireWritingOrganizationContext(env, user);
  const visibleStudentIds = await getVisibleStudentIds(env, user, organization);
  if (!visibleStudentIds.has(request.studentUid)) {
    throw new HttpError(403, '担当範囲の生徒のみ課題作成できます。');
  }
  const student = await readFirst<{ id: string; display_name: string }>(
    env,
    `SELECT u.id AS id, u.display_name AS display_name
     FROM users u
     JOIN organization_memberships m
       ON m.user_id = u.id
      AND m.status = 'ACTIVE'
     WHERE u.id = ?
       AND u.role = ?
       AND m.organization_id = ?`,
    request.studentUid,
    'STUDENT',
    organization.organizationId,
  );
  if (!student) {
    throw new HttpError(404, '対象生徒が見つかりません。');
  }

  const template = await getTemplateOrThrow(env, request.templateId);
  const writingTemplate = toTemplate(template);
  const generated = await generateWritingPrompt(
    env,
    user,
    writingTemplate,
    student.display_name,
    request.topicHint,
    request.notes,
  );
  const submissionCode = createSubmissionCode();
  const assignmentId = crypto.randomUUID();
  const promptSnapshot: WritingPromptSnapshot = {
    templateId: template.id,
    examCategory: writingTemplate.examCategory,
    templateType: template.template_type,
    title: generated.promptTitle,
    promptText: generated.promptText,
    guidance: generated.guidance,
    wordCountMin: Number(template.default_word_count_min || 0),
    wordCountMax: Number(template.default_word_count_max || 0),
    submissionCode,
    markerValue: encodeSubmissionMarker(assignmentId, submissionCode, 1),
  };
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO writing_assignments (
      id, organization_id, organization_name, instructor_user_id, student_user_id, template_id, exam_category, template_type,
      prompt_title, prompt_text, guidance, word_count_min, word_count_max, submission_code, prompt_snapshot,
      status, attempt_count, max_attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 2, ?, ?)
  `).bind(
    assignmentId,
    organization.organizationId,
    organization.organizationName,
    user.id,
    student.id,
    template.id,
    template.exam_category,
    template.template_type,
    generated.promptTitle,
    generated.promptText,
    generated.guidance,
    Number(template.default_word_count_min || 0),
    Number(template.default_word_count_max || 0),
    submissionCode,
    JSON.stringify(promptSnapshot),
    AssignmentStatus.DRAFT,
    now,
    now,
  ).run();

  return readAssignmentResponse(env, assignmentId);
};

export const handleIssueWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  assignmentId: string,
): Promise<WritingAssignment> => {
  guardTeacher(user);
  const row = await getAssignmentRowOrThrow(env, assignmentId);
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

  return readAssignmentResponse(env, assignmentId);
};

export const handleCreateWritingUploadUrl = async (
  env: AppEnv,
  user: DbUserRow,
  request: CreateWritingUploadUrlRequest,
): Promise<CreateWritingUploadUrlResponse> => {
  guardWritingAccess(user);
  const assignmentRow = await getAssignmentRowOrThrow(env, request.assignmentId);
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

  const existingAssets = await readSubmissionAssetRowsForAttempt(env, request.assignmentId, attemptNo);
  if (isPdf && existingAssets.length > 0) {
    throw new HttpError(400, 'PDF 提出は1ファイルのみです。');
  }
  if (!isPdf && existingAssets.length >= 4) {
    throw new HttpError(400, '画像提出は最大4枚までです。');
  }

  const assetId = crypto.randomUUID();
  const uploadToken = crypto.randomUUID();
  const safeName = request.fileName.replace(/[^\w.\-]+/g, '_');
  const r2Key = `${assignmentRow.organization_id || 'org-unknown'}/${request.assignmentId}/attempt-${attemptNo}/${assetId}-${safeName}`;
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
    assetUrl: `/api/writing/assets/${assetId}`,
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
  const assetRow = await readSubmissionAssetRowByUploadToken(env, uploadToken);
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

  const now = Date.now();
  await env.DB.prepare(`
    UPDATE writing_submission_assets
    SET byte_size = ?, uploaded_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body.byteLength,
    now,
    now,
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
  const assignmentRow = await getAssignmentRowOrThrow(env, request.assignmentId);
  await ensureAssignmentAccess(env, user, assignmentRow);

  const attemptNo = Number(request.attemptNo || 0);
  if (!attemptNo || attemptNo > Number(assignmentRow.max_attempts || 2)) {
    throw new HttpError(400, '提出回数が不正です。');
  }
  if (request.assetIds.length === 0) {
    throw new HttpError(400, '提出ファイルを1つ以上選択してください。');
  }

  const assetRows = await readSubmissionAssetRowsByIdsForAttempt(
    env,
    request.assignmentId,
    attemptNo,
    request.assetIds,
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
      AND id IN (${assetRows.map(() => '?').join(', ')})
  `).bind(
    submissionId,
    now,
    now,
    request.assignmentId,
    attemptNo,
    ...assetRows.map((row) => row.id),
  ).run();

  const assignmentWithSubmission = await readAssignmentResponse(env, request.assignmentId);
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
    now,
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

  await touchWeeklyMissionProgressFromWriting(env, {
    studentUid: assignmentRow.student_user_id,
    writingAssignmentId: request.assignmentId,
    activityAt: now,
  });
  if (assignmentRow.organization_id) {
    await rebuildOrganizationKpiSnapshots(env, assignmentRow.organization_id, {
      dateKeys: [toTokyoDateKey(now)],
    });
  }

  return (await readSubmissionContext(env, submissionId)).detail;
};

const applyTeacherReview = async (
  env: AppEnv,
  user: DbUserRow,
  submissionId: string,
  payload: ApproveWritingReturnRequest | RequestWritingRevisionRequest,
  decision: WritingTeacherReview['reviewDecision'],
  existingDetail?: WritingSubmissionDetailResponse,
): Promise<WritingSubmissionDetailResponse> => {
  guardTeacher(user);
  const detail = existingDetail || (await readSubmissionContext(env, submissionId)).detail;
  await ensureAssignmentAccess(env, user, detail.assignment);

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

  await touchWeeklyMissionProgressFromWriting(env, {
    studentUid: detail.assignment.studentUid,
    writingAssignmentId: detail.assignment.id,
    activityAt: now,
  });
  if (detail.assignment.organizationId) {
    await rebuildOrganizationKpiSnapshots(env, detail.assignment.organizationId, {
      dateKeys: [toTokyoDateKey(now)],
    });
  }

  return (await readSubmissionContext(env, submissionId)).detail;
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
  const detail = (await readSubmissionContext(env, submissionId)).detail;
  if (detail.submission.attemptNo >= detail.assignment.maxAttempts) {
    throw new HttpError(400, 'これ以上の再提出は設定できません。');
  }

  return applyTeacherReview(env, user, submissionId, payload, 'REVISION_REQUESTED', detail);
};

export const handleCompleteWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  assignmentId: string,
): Promise<WritingAssignment> => {
  guardTeacher(user);
  const row = await getAssignmentRowOrThrow(env, assignmentId);
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

  await touchWeeklyMissionProgressFromWriting(env, {
    studentUid: row.student_user_id,
    writingAssignmentId: assignmentId,
    activityAt: Date.now(),
  });
  if (row.organization_id) {
    await rebuildOrganizationKpiSnapshots(env, row.organization_id, {
      dateKeys: [toTokyoDateKey(Date.now())],
    });
  }

  return readAssignmentResponse(env, assignmentId);
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

  const asset = await readSubmissionAssetRowById(env, assetId);
  if (!asset) {
    throw new HttpError(404, '提出ファイルが見つかりません。');
  }

  const assignment = await getAssignmentRowOrThrow(env, asset.assignment_id);
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
