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

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_MIME_TYPE = 'application/pdf';
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
  if (row.upload_consumed_at) return false;
  return Number(row.upload_expires_at || 0) > now;
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

  const now = Date.now();
  const existingAssets = await readSubmissionAssetRowsForAttempt(env, request.assignmentId, attemptNo);
  const activeAssets = existingAssets.filter((row) => isUploadReservationActive(row, now));
  if (isPdf && activeAssets.length > 0) {
    throw new HttpError(400, 'PDF 提出は1ファイルのみです。');
  }
  if (!isPdf && activeAssets.length >= 4) {
    throw new HttpError(400, '画像提出は最大4枚までです。');
  }

  const assetId = crypto.randomUUID();
  const uploadToken = crypto.randomUUID();
  const safeName = request.fileName.replace(/[^\w.\-]+/g, '_');
  const r2Key = `${assignmentRow.organization_id || 'org-unknown'}/${request.assignmentId}/attempt-${attemptNo}/${assetId}-${safeName}`;
  const expiresAt = now + WRITING_UPLOAD_URL_TTL_MS;

  await env.DB.prepare(`
    INSERT INTO writing_submission_assets (
      id, assignment_id, submission_id, attempt_no, asset_order, file_name, mime_type, byte_size, expected_byte_size,
      expected_sha256_base64, r2_key, upload_token, upload_expires_at, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
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

  const body = await request.arrayBuffer();
  const contentType = request.headers.get('Content-Type');
  if (contentType && contentType !== assetRow.mime_type) {
    throw new HttpError(400, '予約時と異なる MIME type ではアップロードできません。');
  }
  if (assetRow.expected_byte_size && body.byteLength !== Number(assetRow.expected_byte_size || 0)) {
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

  await env.DB.prepare(`
    UPDATE writing_submission_assets
    SET byte_size = ?, uploaded_at = ?, upload_consumed_at = ?, uploaded_etag = ?, uploaded_sha256_base64 = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body.byteLength,
    now,
    now,
    object?.etag || null,
    uploadedSha256Base64,
    now,
    assetRow.id,
  ).run();

  return noContent();
};

export const handleFinalizeWritingSubmission = async (
  env: AppEnv,
  user: DbUserRow,
  request: FinalizeWritingSubmissionRequest & { manualTranscript?: string },
  logContext?: AiUsageLogContext,
): Promise<WritingSubmissionDetailResponse> => {
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

  const assignment = toAssignment(assignmentRow);
  const aiMode = resolveWritingAiMode(env);
  const ocrAssets = aiMode === 'fixture'
    ? []
    : await readAiAssetsForOcr(env, assetRows).catch((error) => {
        if (aiMode === 'live') throw error;
        console.warn('Falling back to fixture OCR because asset loading failed.', error);
        return [];
      });
  const ocrResult = await runWritingOcr(env, user, assignment, ocrAssets, request.manualTranscript, logContext);
  const now = Date.now();
  const submissionId = crypto.randomUUID();
  const assignmentWithSubmission = await readAssignmentResponse(env, request.assignmentId);
  const evaluations = await runWritingEvaluations(
    env,
    user,
    assignmentWithSubmission,
    ocrResult.transcript,
    logContext,
  );
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

  const now = Date.now();
  const reviewId = detail.submission.teacherReview?.id || crypto.randomUUID();
  const nextStatus = resolveAssignmentStatusForTeacherDecision(
    decision,
    detail.submission.attemptNo,
    detail.assignment.maxAttempts,
  );

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
  await recordProductEventForUser(env, user, {
    eventName: 'writing_review_completed',
    subjectType: 'writing_submission',
    subjectId: submissionId,
    status: decision,
    metadata: {
      assignmentId: detail.assignment.id,
      organizationId: detail.assignment.organizationId,
      selectedEvaluationId: payload.selectedEvaluationId,
    },
  });
  const sideEffectJob = await flushWritingActivitySideEffect(env, {
    studentUid: detail.assignment.studentUid,
    writingAssignmentId: detail.assignment.id,
    organizationId: detail.assignment.organizationId,
    activityAt: now,
  });

  const nextDetail = (await readSubmissionContext(env, submissionId)).detail;
  return sideEffectJob ? { ...nextDetail, sideEffectJob } : nextDetail;
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
): Promise<WritingAssignmentMutationResponse> => {
  guardTeacher(user);
  const row = await getAssignmentRowOrThrow(env, assignmentId);
  await ensureAssignmentAccess(env, user, row);
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
