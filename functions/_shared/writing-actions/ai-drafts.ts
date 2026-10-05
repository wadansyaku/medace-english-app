import type { GenerateWritingAiDraftRequest, WritingAiDraftResponse } from '../../../contracts/writing-ai-drafts';
import { createOpenAiWritingProvider, OPENAI_WRITING_PRICING_VERSION, quoteOpenAiWritingRequest, type OpenAiWritingRequest } from '../openai-writing-provider';
import { createD1AiBudgetStore } from '../ai-provider-budget-d1';
import { isWritingOpenAiConfigured, writingAiCapabilities } from '../writing-ai-capabilities';
import { HttpError } from '../http';
import type { AppEnv, DbUserRow } from '../types';
import { guardTeacher, guardWritingAccess } from './access';
import { draftIdentifier, draftInteger, exactDraftObject, readDraftAssets, readInputDraftRow, requireDraftAssignment, sha256Draft } from './input-drafts';

export const parseWritingAiDraftRequest = (value: unknown): GenerateWritingAiDraftRequest => {
  const record = exactDraftObject(value, ['requestId', 'assignmentId', 'attemptNo', 'operation', 'inputDraftRevision']);
  if (record.operation !== 'OCR' && record.operation !== 'WRITING_FEEDBACK') throw new HttpError(400, 'GPT下書きの種類が不正です。');
  return { requestId: draftIdentifier(record.requestId), assignmentId: draftIdentifier(record.assignmentId),
    attemptNo: draftInteger(record.attemptNo, 1, 20), operation: record.operation,
    inputDraftRevision: draftInteger(record.inputDraftRevision, 1, 1_000_000) };
};

const hasDataApproval = async (env: AppEnv, assignmentId: string, operation: string): Promise<boolean> => {
  const approval = await env.DB.prepare(`SELECT a.assignment_id FROM writing_ai_data_approvals a
    JOIN users u ON u.id=a.approved_by AND u.role='ADMIN'
    WHERE a.assignment_id=? AND a.revoked_at IS NULL AND a.expires_at>?
    AND a.data_scope IN ('SYNTHETIC_ONLY','ADULT_CONSENTED')
    AND a.operation_scope IN (?, 'BOTH') AND length(trim(a.policy_reference))>0`)
    .bind(assignmentId, Date.now(), operation).first();
  return Boolean(approval);
};

export const getWritingAiCapabilities = async (env: AppEnv, user: DbUserRow, assignmentId?: string) => {
  guardWritingAccess(user);
  if (!assignmentId) return writingAiCapabilities(env);
  await requireDraftAssignment(env, user, assignmentId);
  if (user.role !== 'INSTRUCTOR' || !isWritingOpenAiConfigured(env)) return writingAiCapabilities(env);
  const [ocr, feedback] = await Promise.all([hasDataApproval(env, assignmentId, 'OCR'), hasDataApproval(env, assignmentId, 'WRITING_FEEDBACK')]);
  return { ...writingAiCapabilities(env, ocr || feedback), ocrEnabled: ocr, feedbackEnabled: feedback };
};

interface AiDraftRow {
  request_id: string; assignment_id: string; attempt_no: number; input_revision: number; requested_by: string;
  fingerprint: string; operation: 'OCR' | 'WRITING_FEEDBACK'; status: 'PENDING' | 'READY' | 'UNASSESSED';
  result_json: string | null; reason: string | null; updated_at: number;
}
const readAiDraft = (env: AppEnv, requestId: string) => env.DB.prepare('SELECT * FROM writing_ai_drafts WHERE request_id=?').bind(requestId).first<AiDraftRow>();
const projectAiDraft = (row: AiDraftRow): WritingAiDraftResponse => ({
  requestId: row.request_id, assignmentId: row.assignment_id, attemptNo: row.attempt_no, operation: row.operation,
  status: row.status, assessmentStatus: 'UNASSESSED', requiresHumanReview: true,
  ...(row.status === 'READY' && row.result_json ? { result: JSON.parse(row.result_json) } : {}),
  ...(row.reason ? { reason: row.reason } : {}), updatedAt: row.updated_at,
});

export const getWritingAiDraft = async (env: AppEnv, user: DbUserRow, requestId: string): Promise<WritingAiDraftResponse> => {
  guardTeacher(user);
  const row = await readAiDraft(env, draftIdentifier(requestId));
  if (!row) throw new HttpError(404, 'GPT下書きが見つかりません。');
  await requireDraftAssignment(env, user, row.assignment_id);
  return projectAiDraft(row);
};

const toBase64 = (bytes: ArrayBuffer): string => {
  const input = new Uint8Array(bytes); let binary = '';
  for (let i = 0; i < input.length; i += 0x8000) binary += String.fromCharCode(...input.subarray(i, i + 0x8000));
  return btoa(binary);
};

export const generateWritingAiDraft = async (env: AppEnv, user: DbUserRow, request: GenerateWritingAiDraftRequest): Promise<WritingAiDraftResponse> => {
  guardTeacher(user);
  const assignment = await requireDraftAssignment(env, user, request.assignmentId);
  const fingerprint = await sha256Draft({ ...request, requestedBy: user.id });
  const previous = await readAiDraft(env, request.requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new HttpError(409, '同じ処理識別子の対象・入力版が変わっています。');
    return projectAiDraft(previous); // Never dispatch this ID twice, even if costs/results remain unknown.
  }
  if (!isWritingOpenAiConfigured(env)) throw new HttpError(503, writingAiCapabilities(env).message);
  if (!await hasDataApproval(env, assignment.id, request.operation)) throw new HttpError(403, 'この課題の外部送信条件・成人同意または合成データ確認が未承認です。原本下書きは保存できます。');
  const input = await readInputDraftRow(env, assignment.id, request.attemptNo);
  if (!input || input.revision !== request.inputDraftRevision) throw new HttpError(409, '下書きの版が変わりました。保存内容を確認してから実行してください。');
  const promptText = `${assignment.prompt_text}\n${assignment.guidance}`;
  let providerRequest: OpenAiWritingRequest;
  if (request.operation === 'WRITING_FEEDBACK') {
    providerRequest = { operation: request.operation, payload: { transcript: input.manual_transcript, promptText } };
  } else {
    const rows = await readDraftAssets(env, assignment.id, request.attemptNo, JSON.parse(input.asset_ids_json));
    if (!rows.length || rows.some(row => !['image/png', 'image/jpeg', 'image/webp'].includes(row.mime_type))
      || rows.reduce((sum, row) => sum + row.byte_size, 0) > 20 * 1024 * 1024) throw new HttpError(400, 'GPT画像読み取りは画像4件・合計20MBまでです。PDFは未有効です。原本を保持して手入力してください。');
    if (!env.WRITING_ASSETS) throw new HttpError(503, '原本保管を確認できません。下書きは保持しています。');
    const assets = [];
    for (const row of rows) {
      const object = await env.WRITING_ASSETS.get(row.r2_key);
      if (!object) throw new HttpError(404, '保存済み原本を確認できません。');
      const bytes = await object.arrayBuffer();
      if (bytes.byteLength !== row.byte_size) throw new HttpError(409, '原本のサイズを確認できません。');
      assets.push({ mimeType: row.mime_type, base64Data: toBase64(bytes) });
    }
    providerRequest = { operation: request.operation, payload: { assets, promptText } };
  }
  const quote = quoteOpenAiWritingRequest(providerRequest);
  if (!quote) throw new HttpError(400, 'GPT下書きの入力上限・費用上限を確認できません。原本を保持しています。');
  const contentFingerprint = await sha256Draft({ fingerprint, providerRequest, quote });
  const budgetRequestId = `wa_${await sha256Draft(request.requestId)}`;
  const store = createD1AiBudgetStore(env.DB, { approvedPricingVersions: [OPENAI_WRITING_PRICING_VERSION] });
  const now = Date.now();
  // Persist the single dispatch identity before reserving or sending any data.
  const claimed = await env.DB.prepare(`INSERT INTO writing_ai_drafts
    (request_id,assignment_id,attempt_no,input_revision,requested_by,fingerprint,operation,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'PENDING',?,?) ON CONFLICT(request_id) DO NOTHING`)
    .bind(request.requestId, assignment.id, request.attemptNo, input.revision, user.id, fingerprint, request.operation, now, now).run();
  if (claimed.meta.changes !== 1) {
    const winner = await readAiDraft(env, request.requestId);
    if (!winner || winner.fingerprint !== fingerprint) throw new HttpError(409, '処理識別子が競合しました。');
    return projectAiDraft(winner);
  }
  const reserved = await store.reserveWithMetadata({ requestId: budgetRequestId, fingerprint: contentFingerprint,
    monthKey: new Date(now).toISOString().slice(0, 7), upperBoundMicroUsd: quote.upperBoundMicroUsd,
    pricingVersion: quote.pricingVersion, provider: 'OPENAI', model: quote.model, operation: request.operation });
  const finish = async (status: 'READY' | 'UNASSESSED', reason?: string, result?: unknown) => {
    await env.DB.prepare(`UPDATE writing_ai_drafts SET status=?,reason=?,result_json=?,updated_at=? WHERE request_id=? AND status='PENDING'`)
      .bind(status, reason || null, result ? JSON.stringify(result) : null, Date.now(), request.requestId).run();
    const saved = await readAiDraft(env, request.requestId);
    if (!saved) throw new HttpError(503, 'GPT下書きの保存を確認できません。再送で生成を増やさないでください。');
    return projectAiDraft(saved);
  };
  if (reserved.reserved === false) return finish('UNASSESSED', reserved.reason);
  // Only the reservation winner reaches the fixed provider endpoint.
  const response = await createOpenAiWritingProvider({ apiKey: env.OPENAI_API_KEY }).execute(providerRequest);
  if (response.metering) {
    const measured = response.metering;
    await store.settleUsage({ requestId: budgetRequestId, fingerprint: contentFingerprint,
      chargedMicroUsd: measured.estimatedCostMicroUsd,
      usage: { providerResponseId: measured.responseId, provider: 'OPENAI', model: measured.model,
        operation: request.operation, pricingVersion: measured.pricingVersion, inputTokens: measured.inputTokens,
        outputTokens: measured.outputTokens, cachedInputTokens: measured.cachedInputTokens, totalTokens: measured.totalTokens },
      outcome: response.status === 'DRAFT' ? 'COMPLETED' : response.reason === 'PROVIDER_REFUSAL' ? 'REFUSAL'
        : response.reason === 'INCOMPLETE' ? 'INCOMPLETE' : 'INVALID_OUTPUT' });
  } else {
    await store.recordUnknownOutcome({ requestId: budgetRequestId, fingerprint: contentFingerprint, eventId: request.requestId,
      reason: response.status === 'UNASSESSED' && response.reason === 'TIMEOUT' ? 'TIMEOUT'
        : response.status === 'UNASSESSED' && response.reason === 'UNKNOWN_USAGE' ? 'INVALID_USAGE' : 'PROVIDER_FAILED' });
  }
  if (response.status !== 'DRAFT') return finish('UNASSESSED', response.reason);
  return finish('READY', undefined, { operation: response.operation, ...response.draft });
};

export const getWritingAiBudget = async (env: AppEnv, user: DbUserRow, monthKey: string) => {
  if (user.role !== 'ADMIN') throw new HttpError(403, 'AI利用額は管理者のみ確認できます。');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new HttpError(400, '月の指定が不正です。');
  const store = createD1AiBudgetStore(env.DB, { approvedPricingVersions: [OPENAI_WRITING_PRICING_VERSION] });
  return { monthKey, snapshot: await store.snapshot(monthKey), audit: await store.exportAudit(monthKey),
    providerInvoiceConfirmed: false, scope: 'THIS_APPLICATION_ONLY', configured: isWritingOpenAiConfigured(env) };
};
