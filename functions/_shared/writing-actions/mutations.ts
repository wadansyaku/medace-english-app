import type {
  ApproveWritingReturnRequest,
  CreateWritingUploadUrlRequest,
  CreateWritingUploadUrlResponse,
  FinalizeWritingSubmissionRequest,
  GenerateWritingAssignmentRequest,
  RequestWritingRevisionRequest,
  WritingAssignmentMutationResponse,
  WritingSideEffectJobResult,
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
import { classifyWritingEvaluation, classifyWritingTranscript } from '../../../shared/writingAiSafety';
import {
  WRITING_UPLOAD_MAX_BYTES,
  WRITING_UPLOAD_MAX_IMAGE_FILES,
  WRITING_UPLOAD_MAX_TOTAL_BYTES,
  WRITING_UPLOAD_PDF_MIME_TYPE,
  resolveWritingUploadMimeType,
  validateWritingUploadPolicy,
} from '../../../shared/writingUploadPolicy';
import type { AiUsageLogContext } from '../ai-metering';
import { HttpError, noContent } from '../http';
import { readFirst } from '../storage-support';
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
  projectWritingDetailForViewer,
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
  readLatestSubmissionRowForAssignment,
  readSubmissionRowByAssignmentAttempt,
  readTemplateRow,
} from './repository';
import {
  readAssignmentResponse,
  readSubmissionContext,
} from './reads';
import {
  commitFinalizedSubmission,
  commitTeacherReviewDecision,
  resolveAssignmentStatusForTeacherDecision,
  setAssignmentCompleted,
} from './mutation-state';
import {
  enqueueWritingActivitySideEffect,
  runSideEffectJobById,
  type SideEffectJobRunResult,
} from '../side-effect-jobs';
import { recordProductEventForUser } from '../product-events';

const WRITING_UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

const encodeBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const parseWritingUploadContentLength = (request: Request): number | null => {
  const rawValue = request.headers.get('Content-Length');
  if (rawValue === null) return null;
  const normalized = rawValue.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new HttpError(400, 'Content-Length が不正です。');
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw new HttpError(400, 'Content-Length が不正です。');
  }
  if (value > WRITING_UPLOAD_MAX_BYTES) {
    throw new HttpError(413, `アップロードは ${WRITING_UPLOAD_MAX_BYTES} bytes 以下にしてください。`);
  }
  return value;
};

const readWritingUploadBody = async (request: Request, maxBytes: number): Promise<ArrayBuffer> => {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes || totalBytes > WRITING_UPLOAD_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, 'アップロードサイズが上限を超えています。');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
};

const flushWritingActivitySideEffect = async (
  env: AppEnv,
  payload: {
    studentUid: string;
    writingAssignmentId: string;
    organizationId?: string | null;
    activityAt: number;
  },
): Promise<WritingSideEffectJobResult | undefined> => {
  const job = await enqueueWritingActivitySideEffect(env, payload);
  const result = await runSideEffectJobById(env, job.id);
  if (result.status === 'FAILED') {
    console.error(JSON.stringify({
      type: 'side_effect_job_failed',
      jobId: result.jobId,
      status: result.status,
      attemptCount: result.attemptCount,
      lastError: result.lastError || null,
      writingAssignmentId: payload.writingAssignmentId,
      studentUid: payload.studentUid,
    }));
    return toFailedWritingSideEffectJob(result);
  }
  return undefined;
};

const toFailedWritingSideEffectJob = (
  result: SideEffectJobRunResult,
): WritingSideEffectJobResult | undefined => {
  if (result.status !== 'FAILED') {
    return undefined;
  }
  return {
    jobId: result.jobId,
    status: result.status,
    attemptCount: result.attemptCount,
    lastError: result.lastError,
  };
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
      base64Data: encodeBase64(bytes),
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

const isUploadReservationActive = (row: DbWritingAssetRow, now: number): boolean => {
  if (row.uploaded_at) return true;
  return Number(row.upload_expires_at || 0) > now;
};

const toWritingUploadPolicyFile = (
  row: DbWritingAssetRow,
  options: { requireUploadedSize?: boolean } = {},
) => ({
  name: row.file_name,
  type: row.mime_type,
  size: options.requireUploadedSize
    ? Number(row.byte_size || 0)
    : Math.max(1, Number(row.expected_byte_size || row.byte_size || 1)),
});

const assertWritingUploadPolicy = (
  files: Array<{ name: string; type: string; size: number }>,
): void => {
  const validation = validateWritingUploadPolicy(files);
  if (!validation.valid) {
    throw new HttpError(400, validation.message);
  }
};

export const handleGenerateWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  request: GenerateWritingAssignmentRequest,
  logContext?: AiUsageLogContext,
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
    logContext,
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
    generationProvenance: generated.provenance,
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
  await recordProductEventForUser(env, user, {
    eventName: 'writing_assignment_created',
    subjectType: 'writing_assignment',
    subjectId: assignmentId,
    status: AssignmentStatus.DRAFT,
    metadata: {
      organizationId: organization.organizationId,
      studentUid: student.id,
      templateId: template.id,
    },
  });

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
  if (row.status === AssignmentStatus.ISSUED && row.issued_at) {
    return readAssignmentResponse(env, assignmentId);
  }
  if (row.status !== AssignmentStatus.DRAFT) {
    throw new HttpError(409, '現在の状態では課題を配布できません。');
  }
  const now = Date.now();

  const updateResult = await env.DB.prepare(`
    UPDATE writing_assignments
    SET status = ?, issued_at = COALESCE(issued_at, ?), updated_at = ?
    WHERE id = ? AND status = ?
  `).bind(
    AssignmentStatus.ISSUED,
    now,
    now,
    assignmentId,
    AssignmentStatus.DRAFT,
  ).run();
  if ((updateResult.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, '課題の状態が別の操作で更新されました。最新状態でやり直してください。');
  }
  await recordProductEventForUser(env, user, {
    eventName: 'writing_assignment_issued',
    subjectType: 'writing_assignment',
    subjectId: assignmentId,
    status: AssignmentStatus.ISSUED,
    metadata: {
      studentUid: row.student_user_id,
      templateId: row.template_id,
    },
  });

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

  const now = Date.now();
  const existingAssets = await readSubmissionAssetRowsForAttempt(env, request.assignmentId, attemptNo);
  const activeAssets = existingAssets.filter((row) => row.draft_retired_at == null && isUploadReservationActive(row, now));
  const mimeType = resolveWritingUploadMimeType({
    name: request.fileName,
    type: String(request.mimeType || ''),
  });
  assertWritingUploadPolicy([
    ...activeAssets.map((row) => toWritingUploadPolicyFile(row)),
    {
      name: request.fileName,
      type: mimeType,
      size: request.byteSize,
    },
  ]);

  const assetId = crypto.randomUUID();
  const uploadToken = crypto.randomUUID();
  const safeName = request.fileName.replace(/[^\w.\-]+/g, '_');
  const r2Key = `writing-submissions/${assignmentRow.organization_id || 'org-unknown'}/${request.assignmentId}/attempt-${attemptNo}/${assetId}-${safeName}`;
  const expiresAt = now + WRITING_UPLOAD_URL_TTL_MS;

  const isPdfUpload = mimeType === WRITING_UPLOAD_PDF_MIME_TYPE ? 1 : 0;
  const insertResult = await env.DB.prepare(`
    INSERT INTO writing_submission_assets (
      id, assignment_id, submission_id, attempt_no, asset_order, file_name, mime_type, byte_size, expected_byte_size,
      expected_sha256_base64, r2_key, upload_token, upload_expires_at, created_at, updated_at
    )
    SELECT ?, ?, NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?
    FROM (
      SELECT
        COUNT(*) AS active_count,
        COALESCE(SUM(
          CASE
            WHEN uploaded_at IS NOT NULL THEN byte_size
            ELSE COALESCE(expected_byte_size, NULLIF(byte_size, 0), 0)
          END
        ), 0) AS active_bytes,
        COALESCE(SUM(CASE WHEN mime_type = ? THEN 1 ELSE 0 END), 0) AS active_pdf_count
      FROM writing_submission_assets
      WHERE assignment_id = ?
        AND attempt_no = ?
        AND draft_retired_at IS NULL
        AND (uploaded_at IS NOT NULL OR COALESCE(upload_expires_at, 0) > ?)
    ) AS active
    WHERE active.active_bytes + ? <= ?
      AND (
        (? = 1 AND active.active_count = 0)
        OR (
          ? = 0
          AND active.active_pdf_count = 0
          AND active.active_count < ?
        )
      )
  `).bind(
    assetId,
    request.assignmentId,
    attemptNo,
    request.assetOrder,
    request.fileName,
    mimeType,
    request.byteSize,
    request.sha256Base64 || null,
    r2Key,
    uploadToken,
    expiresAt,
    now,
    now,
    WRITING_UPLOAD_PDF_MIME_TYPE,
    request.assignmentId,
    attemptNo,
    now,
    request.byteSize,
    WRITING_UPLOAD_MAX_TOTAL_BYTES,
    isPdfUpload,
    isPdfUpload,
    WRITING_UPLOAD_MAX_IMAGE_FILES,
  ).run();
  if ((insertResult.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, '別のアップロード予約が先に更新されました。ファイルを確認してやり直してください。');
  }

  return {
    assetId,
    uploadUrl: `/api/writing/upload/${uploadToken}`,
    assetUrl: `/api/writing/assets/${assetId}`,
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    attemptNo,
    expiresAt,
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
  const now = Date.now();
  if (Number(assetRow.upload_expires_at || 0) <= now) {
    throw new HttpError(410, 'アップロードURLの有効期限が切れています。再度アップロードURLを取得してください。');
  }
  if (assetRow.upload_consumed_at || assetRow.uploaded_at) {
    throw new HttpError(409, 'このアップロードURLはすでに使用済みです。');
  }
  if (!env.WRITING_ASSETS) {
    throw new HttpError(503, 'WRITING_ASSETS が設定されていません。');
  }

  const contentType = request.headers.get('Content-Type');
  if (contentType && contentType !== assetRow.mime_type) {
    throw new HttpError(400, '予約時と異なる MIME type ではアップロードできません。');
  }
  const expectedByteSize = Number(assetRow.expected_byte_size || 0);
  const contentLength = parseWritingUploadContentLength(request);
  if (contentLength !== null && expectedByteSize > 0 && contentLength !== expectedByteSize) {
    throw new HttpError(400, '予約時と異なるファイルサイズではアップロードできません。');
  }

  const reservationResult = await env.DB.prepare(`
    UPDATE writing_submission_assets
    SET upload_consumed_at = ?, updated_at = ?
    WHERE id = ?
      AND upload_consumed_at IS NULL
      AND uploaded_at IS NULL
      AND upload_expires_at > ?
  `).bind(
    now,
    now,
    assetRow.id,
    now,
  ).run();
  if ((reservationResult.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, 'このアップロードURLは使用中または使用済みです。');
  }

  let releaseReservation = true;
  try {
    const bodyLimit = expectedByteSize > 0
      ? Math.min(expectedByteSize, WRITING_UPLOAD_MAX_BYTES)
      : WRITING_UPLOAD_MAX_BYTES;
    const body = await readWritingUploadBody(request, bodyLimit);
    if (body.byteLength === 0 || (expectedByteSize > 0 && body.byteLength !== expectedByteSize)) {
      throw new HttpError(400, '予約時と異なるファイルサイズではアップロードできません。');
    }
    const uploadedSha256Base64 = encodeBase64(await crypto.subtle.digest('SHA-256', body));
    if (
      assetRow.expected_sha256_base64
      && uploadedSha256Base64 !== assetRow.expected_sha256_base64
    ) {
      throw new HttpError(400, 'アップロードファイルのチェックサムが一致しません。');
    }
    const object = await env.WRITING_ASSETS.put(assetRow.r2_key, body, {
      httpMetadata: {
        contentType: assetRow.mime_type,
      },
    });
    const uploadedAt = Date.now();

    const finalizeResult = await env.DB.prepare(`
      UPDATE writing_submission_assets
      SET byte_size = ?, uploaded_at = ?, uploaded_etag = ?, uploaded_sha256_base64 = ?, updated_at = ?
      WHERE id = ?
        AND upload_consumed_at = ?
        AND uploaded_at IS NULL
    `).bind(
      body.byteLength,
      uploadedAt,
      object?.etag || null,
      uploadedSha256Base64,
      uploadedAt,
      assetRow.id,
      now,
    ).run();
    if ((finalizeResult.meta.changes ?? 0) !== 1) {
      releaseReservation = false;
      throw new HttpError(409, 'アップロード状態が別の操作で更新されました。');
    }
    releaseReservation = false;
  } catch (error) {
    if (releaseReservation) {
      await env.DB.prepare(`
        UPDATE writing_submission_assets
        SET upload_consumed_at = NULL, updated_at = ?
        WHERE id = ?
          AND upload_consumed_at = ?
          AND uploaded_at IS NULL
      `).bind(Date.now(), assetRow.id, now).run().catch((releaseError) => {
        console.error('Failed to release writing upload reservation.', releaseError);
      });
    }
    throw error;
  }

  return noContent();
};

export const handleFinalizeWritingSubmission = async (
  env: AppEnv,
  user: DbUserRow,
  request: FinalizeWritingSubmissionRequest & { manualTranscript?: string },
  logContext?: AiUsageLogContext,
): Promise<ReturnType<typeof projectWritingDetailForViewer>> => {
  guardWritingAccess(user);
  const assignmentRow = await getAssignmentRowOrThrow(env, request.assignmentId);
  await ensureAssignmentAccess(env, user, assignmentRow);

  const attemptNo = Number(request.attemptNo || 0);
  if (!attemptNo || attemptNo > Number(assignmentRow.max_attempts || 2)) {
    throw new HttpError(400, '提出回数が不正です。');
  }
  const existingSubmission = await readSubmissionRowByAssignmentAttempt(env, request.assignmentId, attemptNo);
  if (existingSubmission) {
    throw new HttpError(409, 'この提出はすでに処理済みです。');
  }
  if (request.assetIds.length === 0) {
    throw new HttpError(400, '提出ファイルを1つ以上選択してください。');
  }
  if (assignmentRow.status !== AssignmentStatus.ISSUED && assignmentRow.status !== AssignmentStatus.REVISION_REQUESTED) {
    throw new HttpError(400, '現在の状態では提出できません。');
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
  assertWritingUploadPolicy(assetRows.map((row) => toWritingUploadPolicyFile(row, { requireUploadedSize: true })));

  const assignment = toAssignment(assignmentRow);
  const aiMode = resolveWritingAiMode(env);
  const ocrAssets = aiMode === 'fixture' || Boolean(request.manualTranscript?.trim())
    ? []
    : await readAiAssetsForOcr(env, assetRows);
  const ocrResult = await runWritingOcr(env, user, assignment, ocrAssets, request.manualTranscript, logContext);
  if (classifyWritingTranscript(ocrResult.provenance) !== 'real') {
    throw new HttpError(503, '答案の読み取りを確認できませんでした。サンプル本文を実際の答案として保存しません。提出は未確定です。再試行するか、原本の手動確認を講師に依頼してください。');
  }
  const now = Date.now();
  const submissionId = crypto.randomUUID();
  const assignmentWithSubmission = await readAssignmentResponse(env, request.assignmentId);
  const generatedEvaluations = await runWritingEvaluations(
    env,
    user,
    assignmentWithSubmission,
    ocrResult.transcript,
    logContext,
  );
  const evaluations = generatedEvaluations.filter((evaluation) => classifyWritingEvaluation(evaluation, ocrResult.provenance) === 'real');
  if (evaluations.length === 0) {
    throw new HttpError(503, '実際の答案のAI評価を確認できませんでした。サンプル評価で提出完了にしません。提出は未確定です。再試行するか、原本の手動確認を講師に依頼してください。');
  }
  const selectedEvaluation = evaluations.find((evaluation) => evaluation.isDefault) || evaluations[0];

  await commitFinalizedSubmission(env, {
    submissionId,
    assignmentId: request.assignmentId,
    attemptNo,
    source: request.source,
    submittedByUserId: user.id,
    transcript: ocrResult.transcript,
    transcriptConfidence: ocrResult.confidence,
    ocrProvider: ocrResult.provider,
    ocrProvenance: ocrResult.provenance,
    assetRows,
    evaluations,
    selectedEvaluationId: selectedEvaluation.id,
    promptSnapshot: assignmentRow.prompt_snapshot,
    now,
  });
  await recordProductEventForUser(env, user, {
    eventName: 'writing_submission_received',
    subjectType: 'writing_submission',
    subjectId: submissionId,
    status: 'SUBMITTED',
    usedAi: true,
    metadata: {
      assignmentId: request.assignmentId,
      organizationId: assignmentRow.organization_id,
      attemptNo,
      source: request.source,
    },
  });
  const sideEffectJob = await flushWritingActivitySideEffect(env, {
    studentUid: assignmentRow.student_user_id,
    writingAssignmentId: request.assignmentId,
    organizationId: assignmentRow.organization_id,
    activityAt: now,
  });

  const detail = (await readSubmissionContext(env, submissionId)).detail;
  const detailWithSideEffect = sideEffectJob ? { ...detail, sideEffectJob } : detail;
  return projectWritingDetailForViewer(user, detailWithSideEffect, 'receipt');
};

const reconcileTeacherReviewSideEffects = async (
  env: AppEnv,
  detail: WritingSubmissionDetailResponse,
): Promise<WritingSubmissionDetailResponse> => {
  const review = detail.submission.teacherReview;
  if (!review) throw new HttpError(500, '保存済みの講師評価を確認できませんでした。');

  // Recover a missing event after commit without duplicating an event whose
  // response was lost. Attribution and time belong to the committed review,
  // including when another authorized instructor sends the exact retry.
  await env.DB.prepare(`
    INSERT INTO product_events (
      event_name, feature_area, user_id, organization_id, subscription_plan, user_role,
      subject_type, subject_id, status, used_ai, estimated_cost_milli_yen, metadata_json, created_at
    )
    SELECT 'writing_review_completed', 'writing', review.reviewer_user_id, ?,
      reviewer.subscription_plan, reviewer.role, 'writing_submission', review.submission_id,
      review.review_decision, 0, 0, ?, COALESCE(review.released_at, review.updated_at)
    FROM writing_teacher_reviews review
    LEFT JOIN users reviewer ON reviewer.id = review.reviewer_user_id
    WHERE review.id = ? AND review.submission_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM product_events event
        WHERE event.event_name = 'writing_review_completed'
          AND event.subject_type = 'writing_submission'
          AND event.subject_id = review.submission_id
          AND event.status = review.review_decision
      )
  `).bind(
    detail.assignment.organizationId || null,
    JSON.stringify({
      assignmentId: detail.assignment.id,
      organizationId: detail.assignment.organizationId,
      selectedEvaluationId: review.selectedEvaluationId,
    }),
    review.id,
    detail.submission.id,
  ).run();

  const sideEffectJob = await flushWritingActivitySideEffect(env, {
    studentUid: detail.assignment.studentUid,
    writingAssignmentId: detail.assignment.id,
    organizationId: detail.assignment.organizationId,
    activityAt: review.releasedAt ?? review.updatedAt,
  });
  return sideEffectJob ? { ...detail, sideEffectJob } : detail;
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
  if (classifyWritingEvaluation(selectedEvaluation, detail.submission.ocrMeta) !== 'real') {
    throw new HttpError(409, 'サンプルまたは処理元未確認の評価は成績・返却として確定できません。実際の答案を講師が手動確認してください。');
  }

  const latestSubmission = await readLatestSubmissionRowForAssignment(env, detail.assignment.id);
  if (
    !latestSubmission
    || latestSubmission.assignment_id !== detail.assignment.id
    || latestSubmission.id !== submissionId
  ) {
    throw new HttpError(409, 'この提出は最新版ではありません。最新の提出を開き直してください。');
  }

  const nextStatus = resolveAssignmentStatusForTeacherDecision(
    decision,
    detail.submission.attemptNo,
    detail.assignment.maxAttempts,
  );
  const existingReview = detail.submission.teacherReview;
  const isExactRetry = (
    detail.assignment.status === nextStatus
    && existingReview?.reviewDecision === decision
    && existingReview.selectedEvaluationId === payload.selectedEvaluationId
    && existingReview.publicComment === payload.publicComment.trim()
    && (existingReview.privateMemo || '') === (payload.privateMemo?.trim() || '')
  );
  if (detail.assignment.status !== AssignmentStatus.REVIEW_READY) {
    if (isExactRetry) return reconcileTeacherReviewSideEffects(env, detail);
    throw new HttpError(409, '現在の状態では提出を返却できません。');
  }

  const now = Date.now();
  const reviewId = detail.submission.teacherReview?.id || crypto.randomUUID();

  await commitTeacherReviewDecision(env, {
    submissionId,
    reviewId,
    reviewerUserId: user.id,
    payload,
    decision,
    assignmentId: detail.assignment.id,
    assignmentStatus: nextStatus,
    now,
  });
  const nextDetail = (await readSubmissionContext(env, submissionId)).detail;
  return reconcileTeacherReviewSideEffects(env, nextDetail);
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
  guardTeacher(user);
  const detail = (await readSubmissionContext(env, submissionId)).detail;
  await ensureAssignmentAccess(env, user, detail.assignment);
  if (detail.submission.attemptNo >= detail.assignment.maxAttempts) {
    throw new HttpError(400, 'これ以上の再提出は設定できません。');
  }

  return applyTeacherReview(env, user, submissionId, payload, 'REVISION_REQUESTED', detail);
};

export const handleCompleteWritingAssignment = async (
  env: AppEnv,
  user: DbUserRow,
  assignmentId: string,
): Promise<WritingAssignmentMutationResponse> => {
  guardTeacher(user);
  const row = await getAssignmentRowOrThrow(env, assignmentId);
  await ensureAssignmentAccess(env, user, row);
  if (row.status === AssignmentStatus.RETURNED || row.status === AssignmentStatus.COMPLETED) {
    const latestSubmission = await readLatestSubmissionRowForAssignment(env, assignmentId);
    if (!latestSubmission) {
      throw new HttpError(409, '返却済みの答案を確認できませんでした。講師の手動確認をお待ちください。');
    }
    const detail = (await readSubmissionContext(env, latestSubmission.id)).detail;
    const selectedId = detail.submission.teacherReview?.selectedEvaluationId || detail.submission.selectedEvaluationId;
    const selectedEvaluation = detail.submission.evaluations.find((evaluation) => evaluation.id === selectedId);
    if (!selectedEvaluation || classifyWritingEvaluation(selectedEvaluation, detail.submission.ocrMeta) !== 'real') {
      throw new HttpError(409, 'サンプルまたは処理元未確認の評価は課題完了として確定できません。実際の答案を講師が手動確認してください。');
    }
  }
  if (row.status === AssignmentStatus.COMPLETED) {
    return readAssignmentResponse(env, assignmentId);
  }
  if (row.status !== AssignmentStatus.RETURNED) {
    throw new HttpError(409, '現在の状態では課題を完了できません。');
  }
  const now = Date.now();

  await setAssignmentCompleted(env, { assignmentId, now });
  const sideEffectJob = await flushWritingActivitySideEffect(env, {
    studentUid: row.student_user_id,
    writingAssignmentId: assignmentId,
    organizationId: row.organization_id,
    activityAt: now,
  });

  const assignment = await readAssignmentResponse(env, assignmentId);
  return sideEffectJob ? { ...assignment, sideEffectJob } : assignment;
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
