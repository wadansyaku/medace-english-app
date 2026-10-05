import type { SaveWritingInputDraftRequest, WritingInputDraft, WritingInputDraftResponse } from '../../../contracts/writing-ai-drafts';
import { validateWritingUploadPolicy } from '../../../shared/writingUploadPolicy';
import { HttpError } from '../http';
import type { AppEnv, DbUserRow } from '../types';
import { ensureAssignmentAccess } from './access';
import type { DbWritingAssetRow } from './models';
import { readAssignmentRow, readSubmissionAssetRowById } from './repository';

export const draftIdentifier = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new HttpError(400, '識別子が不正です。');
  return value;
};
export const draftInteger = (value: unknown, min: number, max: number): number => {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new HttpError(400, '下書きの版・提出回数が不正です。');
  return Number(value);
};
export const exactDraftObject = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new HttpError(400, '下書きの入力項目が不正です。');
  return value as Record<string, unknown>;
};
export const sha256Draft = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const parseInputDraft = (value: unknown): SaveWritingInputDraftRequest => {
  const record = exactDraftObject(value, ['requestId', 'assignmentId', 'attemptNo', 'expectedRevision', 'assetIds', 'manualTranscript']);
  if (typeof record.manualTranscript !== 'string' || record.manualTranscript.length > 20_000
    || !Array.isArray(record.assetIds) || record.assetIds.length > 4) throw new HttpError(400, '本文は20000文字以内、ファイルは4件以内にしてください。');
  const assetIds = record.assetIds.map(draftIdentifier);
  if (new Set(assetIds).size !== assetIds.length || (!assetIds.length && !record.manualTranscript.trim() && record.expectedRevision === 0)) throw new HttpError(400, '本文または原本ファイルを指定してください。');
  return {
    requestId: draftIdentifier(record.requestId), assignmentId: draftIdentifier(record.assignmentId),
    attemptNo: draftInteger(record.attemptNo, 1, 20), expectedRevision: draftInteger(record.expectedRevision, 0, 1_000_000),
    assetIds, manualTranscript: record.manualTranscript,
  };
};

export const requireDraftAssignment = async (env: AppEnv, user: DbUserRow, assignmentId: string) => {
  const assignment = await readAssignmentRow(env, draftIdentifier(assignmentId));
  if (!assignment) throw new HttpError(404, '課題が見つかりません。');
  await ensureAssignmentAccess(env, user, assignment);
  return assignment;
};

export interface InputDraftRow {
  assignment_id: string; attempt_no: number; student_user_id: string; revision: number;
  manual_transcript: string; asset_ids_json: string; last_request_id: string;
  payload_sha256: string; updated_at: number;
}
export const readInputDraftRow = (env: AppEnv, assignmentId: string, attemptNo: number): Promise<InputDraftRow | null> =>
  env.DB.prepare('SELECT * FROM writing_input_drafts WHERE assignment_id = ? AND attempt_no = ?').bind(assignmentId, attemptNo).first<InputDraftRow>();

export const readDraftAssets = async (env: AppEnv, assignmentId: string, attemptNo: number, assetIds: string[]): Promise<DbWritingAssetRow[]> => {
  const rows = await Promise.all(assetIds.map(id => readSubmissionAssetRowById(env, id)));
  if (rows.some(row => !row || row.assignment_id !== assignmentId || row.attempt_no !== attemptNo || !row.uploaded_at)) throw new HttpError(400, '原本の所有課題・回数・アップロードを確認できません。');
  return rows as DbWritingAssetRow[];
};

const projectInputDraft = async (env: AppEnv, row: InputDraftRow): Promise<WritingInputDraft> => {
  const assetIds: string[] = JSON.parse(row.asset_ids_json);
  const assets = await readDraftAssets(env, row.assignment_id, row.attempt_no, assetIds);
  return {
    assignmentId: row.assignment_id, attemptNo: row.attempt_no, revision: row.revision,
    manualTranscript: row.manual_transcript, assetIds,
    assets: assets.map(asset => ({ id: asset.id, fileName: asset.file_name, mimeType: asset.mime_type, byteSize: asset.byte_size })),
    updatedAt: row.updated_at, assessmentStatus: 'UNASSESSED',
  };
};

export const getWritingInputDraft = async (env: AppEnv, user: DbUserRow, assignmentId: string, attemptNo: number): Promise<WritingInputDraftResponse> => {
  const assignment = await requireDraftAssignment(env, user, assignmentId);
  draftInteger(attemptNo, 1, assignment.max_attempts);
  const row = await readInputDraftRow(env, assignment.id, attemptNo);
  return { draft: row ? await projectInputDraft(env, row) : null };
};

export const saveWritingInputDraft = async (env: AppEnv, user: DbUserRow, request: SaveWritingInputDraftRequest): Promise<WritingInputDraftResponse> => {
  const assignment = await requireDraftAssignment(env, user, request.assignmentId);
  if (!['ISSUED', 'REVISION_REQUESTED'].includes(assignment.status) || request.attemptNo !== assignment.attempt_count + 1
    || request.attemptNo > assignment.max_attempts) throw new HttpError(409, 'この回数の下書きは保存できません。課題を再取得してください。');
  const assets = await readDraftAssets(env, assignment.id, request.attemptNo, request.assetIds);
  if (assets.length) {
    const validation = validateWritingUploadPolicy(assets.map(asset => ({ name: asset.file_name, type: asset.mime_type, size: asset.byte_size })));
    if (!validation.valid) throw new HttpError(400, validation.message);
  }
  const payloadHash = await sha256Draft({ assignmentId: request.assignmentId, attemptNo: request.attemptNo,
    expectedRevision: request.expectedRevision, assetIds: request.assetIds, manualTranscript: request.manualTranscript });
  const existing = await readInputDraftRow(env, assignment.id, request.attemptNo);
  if (existing?.last_request_id === request.requestId) {
    if (existing.payload_sha256 !== payloadHash) throw new HttpError(409, '同じ保存識別子の内容が変わっています。');
    return { draft: await projectInputDraft(env, existing) };
  }
  if (assets.some(asset => asset.draft_retired_at != null)) throw new HttpError(409, '下書きから外した原本です。必要なファイルを再選択してください。');
  const now = Date.now();
  try {
    const statements = [];
    if (request.expectedRevision === 0) statements.push(env.DB.prepare(`INSERT INTO writing_input_drafts
      (assignment_id,attempt_no,student_user_id,revision,manual_transcript,asset_ids_json,last_request_id,payload_sha256,last_saved_by,created_at,updated_at)
      VALUES (?,?,?,1,?,?,?,?,?,?,?) ON CONFLICT(assignment_id,attempt_no) DO NOTHING`)
      .bind(assignment.id, request.attemptNo, assignment.student_user_id, request.manualTranscript, JSON.stringify(request.assetIds),
        request.requestId, payloadHash, user.id, now, now));
    if (request.expectedRevision > 0) statements.push(env.DB.prepare(`UPDATE writing_input_drafts SET revision=revision+1,
      manual_transcript=?,asset_ids_json=?,last_request_id=?,payload_sha256=?,last_saved_by=?,updated_at=?
      WHERE assignment_id=? AND attempt_no=? AND revision=?`)
      .bind(request.manualTranscript, JSON.stringify(request.assetIds), request.requestId, payloadHash, user.id, now,
        assignment.id, request.attemptNo, request.expectedRevision));
    if (existing) statements.push(env.DB.prepare(`UPDATE writing_submission_assets SET draft_retired_at=?
      WHERE assignment_id=? AND attempt_no=? AND submission_id IS NULL AND uploaded_at IS NOT NULL
      AND id IN (SELECT value FROM json_each(?)) AND id NOT IN (SELECT value FROM json_each(?))
      AND EXISTS (SELECT 1 FROM writing_input_drafts WHERE assignment_id=? AND attempt_no=?
        AND last_request_id=? AND payload_sha256=?)`)
      .bind(now, assignment.id, request.attemptNo, existing.asset_ids_json, JSON.stringify(request.assetIds),
        assignment.id, request.attemptNo, request.requestId, payloadHash));
    await env.DB.batch(statements);
  } catch { throw new HttpError(503, '保存結果を確認できません。入力を保持したまま同じ内容で再試行してください。'); }
  const saved = await readInputDraftRow(env, assignment.id, request.attemptNo);
  if (!saved || saved.last_request_id !== request.requestId || saved.payload_sha256 !== payloadHash) throw new HttpError(409, '他の画面で下書きが更新されました。入力を保持したまま再取得してください。');
  return { draft: await projectInputDraft(env, saved) };
};
