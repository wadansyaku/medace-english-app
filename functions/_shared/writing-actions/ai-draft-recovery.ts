import type { GenerateWritingAiDraftRequest, WritingAiDraftResponse } from '../../../contracts/writing-ai-drafts';
import { createD1AiBudgetStore } from '../ai-provider-budget-d1';
import { AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD } from '../ai-provider-budget';
import { validateCandidateOcrDraft, validateCandidateWritingFeedbackDraft } from '../ai-provider-boundary';
import { createOpenAiWritingProvider, OPENAI_WRITING_PRICING_VERSION, parseOpenAiWritingMetering,
  quoteOpenAiWritingRequest, type OpenAiWritingQuote, type OpenAiWritingRequest, type OpenAiWritingResult } from '../openai-writing-provider';
import { isWritingOpenAiConfigured } from '../writing-ai-capabilities';
import { HttpError } from '../http';
import type { AppEnv, DbUserRow } from '../types';
import { readDraftAssets, readInputDraftRow, requireDraftAssignment, sha256Draft } from './input-drafts';

export const AI_DRAFT_LEASE_MS = 60_000;
export interface AiDraftRow {
  request_id: string; assignment_id: string; attempt_no: number; input_revision: number; requested_by: string | null;
  fingerprint: string; operation: 'OCR' | 'WRITING_FEEDBACK'; status: 'PENDING' | 'READY' | 'UNASSESSED';
  result_json: string | null; reason: string | null; updated_at: number;
}
interface ExecutionRow {
  request_id: string; phase: 'PREPARING' | 'DISPATCHING' | 'RESPONSE_STORED' | 'FINISHED' | 'LEGACY_UNKNOWN';
  lease_token: string | null; lease_expires_at: number; budget_request_id: string | null;
  content_fingerprint: string | null; reservation_month: string | null; quote_json: string | null;
  provider_response_json: string | null;
}
interface ReservationRow {
  request_id: string; fingerprint: string; month_key: string; upper_bound_micro_usd: number; pricing_version: string;
  provider: string | null; model: string | null; operation: string | null; state: 'RESERVED' | 'SETTLED';
}
const budgetStore = (env: AppEnv) => createD1AiBudgetStore(env.DB, { approvedPricingVersions: [OPENAI_WRITING_PRICING_VERSION] });
export const readAiDraft = (env: AppEnv, id: string) => env.DB.prepare('SELECT * FROM writing_ai_drafts WHERE request_id=?').bind(id).first<AiDraftRow>();
const readExecution = (env: AppEnv, id: string) => env.DB.prepare('SELECT * FROM writing_ai_draft_execution WHERE request_id=?').bind(id).first<ExecutionRow>();
const readReservation = (env: AppEnv, id: string) => env.DB.prepare('SELECT * FROM ai_provider_budget_reservations WHERE request_id=?').bind(id).first<ReservationRow>();

export const hasDataApproval = async (env: AppEnv, assignmentId: string, operation: string): Promise<boolean> => Boolean(await env.DB.prepare(`SELECT a.assignment_id FROM writing_ai_data_approvals a
  JOIN users u ON u.id=a.approved_by AND u.role='ADMIN'
  WHERE a.assignment_id=? AND a.revoked_at IS NULL AND a.expires_at>?
  AND a.data_scope IN ('SYNTHETIC_ONLY','ADULT_CONSENTED')
  AND a.operation_scope IN (?, 'BOTH') AND length(trim(a.policy_reference))>0`)
  .bind(assignmentId, Date.now(), operation).first());

export const readCanonicalAiDraft = (env: AppEnv, target: Pick<GenerateWritingAiDraftRequest, 'assignmentId' | 'attemptNo' | 'inputDraftRevision' | 'operation'>) =>
  env.DB.prepare(`SELECT d.* FROM writing_ai_draft_canonical_claims c JOIN writing_ai_drafts d ON d.request_id=c.request_id
    WHERE c.assignment_id=? AND c.attempt_no=? AND c.input_revision=? AND c.operation=?`)
    .bind(target.assignmentId, target.attemptNo, target.inputDraftRevision, target.operation).first<AiDraftRow>();

export const readAiDraftByClientId = async (env: AppEnv, id: string): Promise<{ row: AiDraftRow; clientFingerprint: string } | null> => {
  const direct = await readAiDraft(env, id);
  if (direct) return { row: direct, clientFingerprint: direct.fingerprint };
  const alias = await env.DB.prepare(`SELECT d.*,a.fingerprint AS client_fingerprint FROM writing_ai_draft_request_aliases a
    JOIN writing_ai_drafts d ON d.request_id=a.request_id WHERE a.alias_request_id=?`).bind(id).first<AiDraftRow & { client_fingerprint: string }>();
  return alias ? { row: alias, clientFingerprint: alias.client_fingerprint } : null;
};

export const bindAiDraftAlias = async (env: AppEnv, id: string, fingerprint: string, canonical: AiDraftRow) => {
  if (id === canonical.request_id) return;
  await env.DB.prepare(`INSERT INTO writing_ai_draft_request_aliases(alias_request_id,request_id,fingerprint,created_at)
    SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM writing_ai_drafts WHERE request_id=?)
    ON CONFLICT(alias_request_id) DO NOTHING`).bind(id, canonical.request_id, fingerprint, Date.now(), id).run();
  const saved = await readAiDraftByClientId(env, id);
  if (!saved || saved.row.request_id !== canonical.request_id || saved.clientFingerprint !== fingerprint) throw new HttpError(409, '処理識別子が競合しました。');
};

export const projectAiDraft = async (env: AppEnv, row: AiDraftRow): Promise<WritingAiDraftResponse> => {
  const execution = row.status === 'PENDING' ? await readExecution(env, row.request_id) : null;
  return { requestId: row.request_id, assignmentId: row.assignment_id, attemptNo: row.attempt_no,
    inputDraftRevision: row.input_revision, operation: row.operation, status: row.status,
    assessmentStatus: 'UNASSESSED', requiresHumanReview: true,
    recoveryAction: row.status !== 'PENDING' ? 'NONE' : execution?.phase === 'PREPARING' ? 'RESEND_SAME_REQUEST' : 'CHECK_RESULT',
    ...(row.status === 'READY' && row.result_json ? { result: JSON.parse(row.result_json) } : {}),
    ...(row.reason ? { reason: row.reason } : {}), updatedAt: row.updated_at };
};

const toBase64 = (bytes: ArrayBuffer): string => {
  const input = new Uint8Array(bytes); let binary = '';
  for (let i = 0; i < input.length; i += 0x8000) binary += String.fromCharCode(...input.subarray(i, i + 0x8000));
  return btoa(binary);
};
export const loadAiProviderRequest = async (env: AppEnv, user: DbUserRow, target: Pick<GenerateWritingAiDraftRequest, 'assignmentId' | 'attemptNo' | 'inputDraftRevision' | 'operation'>): Promise<OpenAiWritingRequest> => {
  const assignment = await requireDraftAssignment(env, user, target.assignmentId);
  const input = await readInputDraftRow(env, assignment.id, target.attemptNo);
  if (!input || input.revision !== target.inputDraftRevision) throw new HttpError(409, '下書きの版が変わりました。保存内容を確認してください。');
  const promptText = `${assignment.prompt_text}\n${assignment.guidance}`;
  if (target.operation === 'WRITING_FEEDBACK') return { operation: target.operation, payload: { transcript: input.manual_transcript, promptText } };
  const rows = await readDraftAssets(env, assignment.id, target.attemptNo, JSON.parse(input.asset_ids_json));
  if (!rows.length || rows.length > 4 || rows.some(row => !['image/png', 'image/jpeg', 'image/webp'].includes(row.mime_type))
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
  return { operation: target.operation, payload: { assets, promptText } };
};

export const claimAiDraft = async (env: AppEnv, user: DbUserRow, request: GenerateWritingAiDraftRequest,
  fingerprint: string, providerRequest: OpenAiWritingRequest, quote: OpenAiWritingQuote) => {
  const token = crypto.randomUUID(); const now = Date.now();
  const contentFingerprint = await sha256Draft({ fingerprint, providerRequest, quote });
  const budgetId = `wa_${await sha256Draft(request.requestId)}`;
  // Identity, version canonical claim, dispatch proof and quote commit together.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO writing_ai_drafts(request_id,assignment_id,attempt_no,input_revision,requested_by,fingerprint,operation,status,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,'PENDING',?,? WHERE NOT EXISTS
        (SELECT 1 FROM writing_ai_draft_canonical_claims WHERE assignment_id=? AND attempt_no=? AND input_revision=? AND operation=?)
        AND NOT EXISTS (SELECT 1 FROM writing_ai_draft_request_aliases WHERE alias_request_id=?)
      ON CONFLICT(request_id) DO NOTHING`).bind(request.requestId, request.assignmentId, request.attemptNo,
        request.inputDraftRevision, user.id, fingerprint, request.operation, now, now,
        request.assignmentId, request.attemptNo, request.inputDraftRevision, request.operation, request.requestId),
    env.DB.prepare(`INSERT INTO writing_ai_draft_canonical_claims(assignment_id,attempt_no,input_revision,operation,request_id)
      SELECT assignment_id,attempt_no,input_revision,operation,request_id FROM writing_ai_drafts WHERE request_id=? AND fingerprint=?
      ON CONFLICT(assignment_id,attempt_no,input_revision,operation) DO NOTHING`).bind(request.requestId, fingerprint),
    env.DB.prepare(`INSERT INTO writing_ai_draft_execution(request_id,phase,lease_token,lease_expires_at,budget_request_id,content_fingerprint,reservation_month,quote_json,created_at,updated_at)
      SELECT request_id,'PREPARING',?,?,?,?,?,?,?,? FROM writing_ai_draft_canonical_claims WHERE request_id=?
      ON CONFLICT(request_id) DO NOTHING`).bind(token, now + AI_DRAFT_LEASE_MS, budgetId, contentFingerprint,
        new Date(now).toISOString().slice(0, 7), JSON.stringify(quote), now, now, request.requestId),
  ]);
  const row = await readCanonicalAiDraft(env, request);
  if (!row) throw new HttpError(409, '処理識別子が競合しました。');
  if (row.request_id === request.requestId && row.fingerprint !== fingerprint) throw new HttpError(409, '処理識別子の内容が変わっています。');
  await bindAiDraftAlias(env, request.requestId, fingerprint, row);
  return { row, initialToken: (await readExecution(env, row.request_id))?.lease_token === token ? token : undefined };
};

const finish = async (env: AppEnv, row: AiDraftRow, execution: ExecutionRow, status: 'READY' | 'UNASSESSED', reason?: string, result?: unknown) => {
  await env.DB.batch([
    env.DB.prepare(`UPDATE writing_ai_drafts SET status=?,reason=?,result_json=?,updated_at=? WHERE request_id=? AND status='PENDING'
      AND EXISTS (SELECT 1 FROM writing_ai_draft_execution e WHERE e.request_id=writing_ai_drafts.request_id AND e.phase=? AND e.lease_token IS ?)`)
      .bind(status, reason || null, result ? JSON.stringify(result) : null, Date.now(), row.request_id, execution.phase, execution.lease_token),
    env.DB.prepare(`UPDATE writing_ai_draft_execution SET phase='FINISHED',updated_at=? WHERE request_id=?
      AND EXISTS (SELECT 1 FROM writing_ai_drafts d WHERE d.request_id=writing_ai_draft_execution.request_id AND d.status<>'PENDING')`)
      .bind(Date.now(), row.request_id),
  ]);
  const saved = await readAiDraft(env, row.request_id);
  if (!saved) throw new HttpError(503, 'GPT下書きの保存を確認できません。同じ処理を再確認してください。');
  return saved;
};

const parseCheckpoint = (json: string, operation: AiDraftRow['operation']): OpenAiWritingResult | null => {
  let value: any; try { value = JSON.parse(json); } catch { return null; }
  if (!value || typeof value !== 'object' || !['DRAFT','UNASSESSED'].includes(value.status) || typeof value.dispatched !== 'boolean') return null;
  if (value.metering) {
    const m = value.metering;
    const validated = parseOpenAiWritingMetering({ id: m.responseId, model: m.model, usage: {
      input_tokens: m.inputTokens, output_tokens: m.outputTokens, total_tokens: m.totalTokens,
      input_tokens_details: { cached_tokens: m.cachedInputTokens },
    } });
    if (!validated || m.provider !== validated.provider || m.pricingVersion !== validated.pricingVersion
      || m.estimatedCostMicroUsd !== validated.estimatedCostMicroUsd) return null;
    value.metering = validated;
  }
  if (value.status === 'UNASSESSED') return typeof value.reason === 'string' && value.reason.length <= 100 && value.retryAutomatically === false ? value : null;
  if (!value.metering || value.operation !== operation || value.evaluationStatus !== 'UNASSESSED' || value.requiresHumanReview !== true || value.dispatched !== true) return null;
  const draft = operation === 'OCR' ? validateCandidateOcrDraft(value.draft) : validateCandidateWritingFeedbackDraft(value.draft);
  return draft ? { ...value, draft } : null;
};

const recordUnknown = async (env: AppEnv, row: AiDraftRow, execution: ExecutionRow, reason: 'TIMEOUT' | 'INVALID_USAGE' | 'PROVIDER_FAILED') => {
  const budgetId = execution.budget_request_id || `wa_${await sha256Draft(row.request_id)}`;
  const reservation = await readReservation(env, budgetId);
  if (!reservation || reservation.state !== 'RESERVED') return;
  if ((execution.content_fingerprint && reservation.fingerprint !== execution.content_fingerprint) || reservation.operation !== row.operation) throw new HttpError(503, '費用予約の照合を確認できません。');
  try {
    await budgetStore(env).recordUnknownOutcome({ requestId: budgetId, fingerprint: reservation.fingerprint,
      // Timeout reconciliation and the checkpoint can report different unknown
      // reasons concurrently. Each event is idempotent and retains the hold.
      eventId: `writing-unknown:${row.request_id}:${reason}`, reason });
  } catch (error) {
    // A concurrently persisted known response can settle between the read and
    // the unknown audit INSERT. Its settlement is already the stronger proof.
    const current = await readReservation(env, budgetId);
    if (current?.state !== 'SETTLED' || current.fingerprint !== reservation.fingerprint) throw error;
  }
};

const settleCheckpoint = async (env: AppEnv, row: AiDraftRow, execution: ExecutionRow, response: OpenAiWritingResult) => {
  if (!execution.budget_request_id || !execution.content_fingerprint) throw new HttpError(503, '費用予約の照合を確認できません。');
  if (response.metering) {
    const m = response.metering;
    await budgetStore(env).settleUsage({ requestId: execution.budget_request_id, fingerprint: execution.content_fingerprint,
      chargedMicroUsd: m.estimatedCostMicroUsd, usage: { providerResponseId: m.responseId, provider: 'OPENAI', model: m.model,
        operation: row.operation, pricingVersion: m.pricingVersion, inputTokens: m.inputTokens,
        outputTokens: m.outputTokens, cachedInputTokens: m.cachedInputTokens, totalTokens: m.totalTokens },
      outcome: response.status === 'DRAFT' ? 'COMPLETED' : response.reason === 'PROVIDER_REFUSAL' ? 'REFUSAL'
        : response.reason === 'INCOMPLETE' ? 'INCOMPLETE' : 'INVALID_OUTPUT' });
  } else await recordUnknown(env, row, execution, response.status === 'UNASSESSED' && response.reason === 'TIMEOUT' ? 'TIMEOUT'
    : response.status === 'UNASSESSED' && response.reason === 'UNKNOWN_USAGE' ? 'INVALID_USAGE' : 'PROVIDER_FAILED');
  return finish(env, row, execution, response.status === 'DRAFT' ? 'READY' : 'UNASSESSED',
    response.status === 'UNASSESSED' ? response.reason : undefined,
    response.status === 'DRAFT' ? { operation: response.operation, ...response.draft } : undefined);
};

export const reconcileAiDraft = async (env: AppEnv, user: DbUserRow, initial: AiDraftRow,
  options: { allowDispatch: boolean; initialToken?: string } = { allowDispatch: false }): Promise<WritingAiDraftResponse> => {
  let row = (await readAiDraft(env, initial.request_id))!;
  if (!row) throw new HttpError(404, 'GPT下書きが見つかりません。');
  let execution = await readExecution(env, row.request_id);
  // A late, verifiable response can settle usage after an uncertainty terminal
  // state. Its draft stays UNASSESSED: finish never updates a terminal row.
  if (execution?.phase === 'RESPONSE_STORED') {
    const response = execution.provider_response_json && parseCheckpoint(execution.provider_response_json, row.operation);
    if (response) return projectAiDraft(env, await settleCheckpoint(env, row, execution, response));
    await recordUnknown(env, row, execution, 'PROVIDER_FAILED');
    return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'RESULT_UNAVAILABLE'));
  }
  if (row.status !== 'PENDING') return projectAiDraft(env, row);
  if (!execution) throw new HttpError(503, '処理状態を確認できません。同じ処理を再確認してください。');
  if (execution.phase === 'LEGACY_UNKNOWN' || execution.phase === 'FINISHED'
    || (execution.phase === 'DISPATCHING' && execution.lease_expires_at <= Date.now())) {
    await recordUnknown(env, row, execution, 'PROVIDER_FAILED');
    row = await finish(env, row, execution, 'UNASSESSED', execution.phase === 'LEGACY_UNKNOWN' ? 'LEGACY_RESULT_UNAVAILABLE' : 'RESULT_UNAVAILABLE');
    // A response checkpoint may have won the race against timeout recovery.
    if (row.status === 'PENDING' && (await readExecution(env, row.request_id))?.phase === 'RESPONSE_STORED') return reconcileAiDraft(env, user, row);
    return projectAiDraft(env, row);
  }
  if (execution.phase !== 'PREPARING' || !options.allowDispatch) return projectAiDraft(env, row);

  const token = options.initialToken || crypto.randomUUID();
  if (execution.lease_token !== options.initialToken) {
    await env.DB.prepare(`UPDATE writing_ai_draft_execution SET lease_token=?,lease_expires_at=?,updated_at=?
      WHERE request_id=? AND phase='PREPARING' AND lease_expires_at<=?`)
      .bind(token, Date.now() + AI_DRAFT_LEASE_MS, Date.now(), row.request_id, Date.now()).run();
  }
  execution = (await readExecution(env, row.request_id))!;
  if (execution.phase !== 'PREPARING' || execution.lease_token !== token) return projectAiDraft(env, (await readAiDraft(env, row.request_id))!);
  if (!isWritingOpenAiConfigured(env) || !await hasDataApproval(env, row.assignment_id, row.operation)) return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'DATA_APPROVAL_REQUIRED'));
  if (execution.reservation_month !== new Date().toISOString().slice(0, 7)) return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'RESERVATION_MONTH_EXPIRED'));
  let providerRequest: OpenAiWritingRequest;
  try { providerRequest = await loadAiProviderRequest(env, user, { assignmentId: row.assignment_id, attemptNo: row.attempt_no, inputDraftRevision: row.input_revision, operation: row.operation }); }
  catch (error) { if (error instanceof HttpError && error.status === 409) return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'INPUT_CHANGED')); throw error; }
  const quote = quoteOpenAiWritingRequest(providerRequest);
  if (!quote || JSON.stringify(quote) !== execution.quote_json || !execution.budget_request_id || !execution.content_fingerprint
    || await sha256Draft({ fingerprint: row.fingerprint, providerRequest, quote }) !== execution.content_fingerprint) return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'QUOTE_OR_INPUT_CHANGED'));
  const matches = (r: ReservationRow) => r.fingerprint === execution!.content_fingerprint && r.month_key === execution!.reservation_month
    && r.upper_bound_micro_usd === quote.upperBoundMicroUsd && r.pricing_version === quote.pricingVersion
    && r.provider === 'OPENAI' && r.model === quote.model && r.operation === row.operation && r.state === 'RESERVED';
  let reservation = await readReservation(env, execution.budget_request_id);
  if (!reservation) {
    const reserved = await budgetStore(env).reserveWithMetadata({ requestId: execution.budget_request_id,
      fingerprint: execution.content_fingerprint, monthKey: execution.reservation_month!, upperBoundMicroUsd: quote.upperBoundMicroUsd,
      pricingVersion: quote.pricingVersion, provider: 'OPENAI', model: quote.model, operation: row.operation });
    if (reserved.reserved === false && reserved.reason !== 'DUPLICATE_REQUEST') return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', reserved.reason));
    reservation = await readReservation(env, execution.budget_request_id);
  }
  const priorOutcome = await env.DB.prepare(`SELECT 1 FROM ai_provider_usage_audit WHERE request_id=? AND outcome<>'RESERVED' LIMIT 1`).bind(execution.budget_request_id).first();
  if (!reservation || !matches(reservation) || priorOutcome) return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'DISPATCH_STATE_UNAVAILABLE'));
  await requireDraftAssignment(env, user, row.assignment_id);
  if (!isWritingOpenAiConfigured(env) || !await hasDataApproval(env, row.assignment_id, row.operation)) return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'DATA_APPROVAL_REQUIRED'));
  if (execution.reservation_month !== new Date().toISOString().slice(0, 7)) return projectAiDraft(env, await finish(env, row, execution, 'UNASSESSED', 'RESERVATION_MONTH_EXPIRED'));
  // This durable fence, not a duplicate budget receipt, is permission to send.
  // Any lost acknowledgement is treated as possibly sent; it is never retried.
  const dispatchAt = Date.now();
  const dispatch = await env.DB.prepare(`UPDATE writing_ai_draft_execution SET phase='DISPATCHING',lease_expires_at=?,updated_at=?
    WHERE request_id=? AND phase='PREPARING' AND lease_token=? AND lease_expires_at>?
    AND EXISTS (SELECT 1 FROM writing_ai_drafts d WHERE d.request_id=writing_ai_draft_execution.request_id AND d.status='PENDING')
    AND EXISTS (SELECT 1 FROM ai_provider_budget_months m WHERE m.month_key=? AND m.blocked=0 AND m.accounted_micro_usd<=?)
    AND EXISTS (SELECT 1 FROM writing_ai_data_approvals a JOIN users u ON u.id=a.approved_by AND u.role='ADMIN'
      WHERE a.assignment_id=? AND a.revoked_at IS NULL AND a.expires_at>?
        AND a.data_scope IN ('SYNTHETIC_ONLY','ADULT_CONSENTED') AND a.operation_scope IN (?, 'BOTH') AND length(trim(a.policy_reference))>0)`)
    .bind(dispatchAt + AI_DRAFT_LEASE_MS, dispatchAt, row.request_id, token, dispatchAt,
      execution.reservation_month, AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD, row.assignment_id, dispatchAt, row.operation).run();
  if (dispatch.meta.changes !== 1) {
    const current = (await readExecution(env, row.request_id))!;
    if (current.phase === 'PREPARING' && current.lease_token === token) {
      const month = await env.DB.prepare('SELECT blocked,accounted_micro_usd FROM ai_provider_budget_months WHERE month_key=?')
        .bind(execution.reservation_month).first<{ blocked: number; accounted_micro_usd: number }>();
      if (!month || month.blocked || month.accounted_micro_usd > AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD) return projectAiDraft(env,
        await finish(env, row, current, 'UNASSESSED', !month ? 'BUDGET_STATE_UNAVAILABLE' : month.blocked ? 'BUDGET_BLOCKED' : 'BUDGET_EXHAUSTED'));
      if (!await hasDataApproval(env, row.assignment_id, row.operation)) return projectAiDraft(env,
        await finish(env, row, current, 'UNASSESSED', 'DATA_APPROVAL_REQUIRED'));
    }
    return projectAiDraft(env, (await readAiDraft(env, row.request_id))!);
  }
  // The fence acknowledgement itself may arrive after UTC month rollover.
  // No provider call occurred yet, so terminate while retaining the old hold.
  const dispatchExecution: ExecutionRow = { ...execution, phase: 'DISPATCHING', lease_expires_at: dispatchAt + AI_DRAFT_LEASE_MS };
  try { await requireDraftAssignment(env, user, row.assignment_id); }
  catch (error) {
    if (error instanceof HttpError && [403,404].includes(error.status)) return projectAiDraft(env,
      await finish(env, row, dispatchExecution, 'UNASSESSED', 'ACCESS_CHANGED'));
    throw error;
  }
  // Read approval, budget and dispatch ownership together after all access
  // awaits. The following synchronous checks are the last step before fetch.
  const eligibility = await env.DB.prepare(`SELECT e.phase,e.lease_token,e.lease_expires_at,m.blocked,m.accounted_micro_usd,
    (SELECT MAX(a.expires_at) FROM writing_ai_data_approvals a JOIN users u ON u.id=a.approved_by AND u.role='ADMIN'
      WHERE a.assignment_id=? AND a.revoked_at IS NULL AND a.data_scope IN ('SYNTHETIC_ONLY','ADULT_CONSENTED')
        AND a.operation_scope IN (?, 'BOTH') AND length(trim(a.policy_reference))>0) AS approval_expires_at
    FROM writing_ai_draft_execution e JOIN ai_provider_budget_months m ON m.month_key=e.reservation_month WHERE e.request_id=?`)
    .bind(row.assignment_id, row.operation, row.request_id).first<{
      phase: string; lease_token: string | null; lease_expires_at: number; blocked: number;
      accounted_micro_usd: number; approval_expires_at: number | null;
    }>();
  if (!eligibility) throw new HttpError(503, '送信条件を確認できません。同じ処理を再確認してください。');
  if (eligibility.phase !== 'DISPATCHING' || eligibility.lease_token !== token) return reconcileAiDraft(env, user, row);
  if (!isWritingOpenAiConfigured(env) || !eligibility.approval_expires_at || eligibility.approval_expires_at <= Date.now()) return projectAiDraft(env,
    await finish(env, row, dispatchExecution, 'UNASSESSED', 'DATA_APPROVAL_REQUIRED'));
  if (eligibility.blocked || eligibility.accounted_micro_usd > AI_MONTHLY_DISPATCH_LIMIT_MICRO_USD) return projectAiDraft(env,
    await finish(env, row, dispatchExecution, 'UNASSESSED', eligibility.blocked ? 'BUDGET_BLOCKED' : 'BUDGET_EXHAUSTED'));
  if (execution.reservation_month !== new Date().toISOString().slice(0, 7)) return projectAiDraft(env,
    await finish(env, row, dispatchExecution, 'UNASSESSED', 'RESERVATION_MONTH_EXPIRED'));
  // Leave at least the fixed provider's 25-second timeout plus 5 seconds for a
  // checkpoint. A very slow fence/authorization acknowledgement cannot send.
  if (Date.now() + 30_000 >= eligibility.lease_expires_at) return projectAiDraft(env,
    await finish(env, row, dispatchExecution, 'UNASSESSED', 'DISPATCH_WINDOW_EXPIRED'));
  let response: OpenAiWritingResult;
  try { response = await createOpenAiWritingProvider({ apiKey: env.OPENAI_API_KEY }).execute(providerRequest); }
  catch { response = { status: 'UNASSESSED', reason: 'PROVIDER_FAILED', dispatched: true, retryAutomatically: false }; }
  try {
    const parsed = parseCheckpoint(JSON.stringify(response), row.operation);
    if (!parsed) throw new Error('Invalid provider checkpoint.');
    await env.DB.prepare(`UPDATE writing_ai_draft_execution SET phase='RESPONSE_STORED',provider_response_json=?,updated_at=?
      WHERE request_id=? AND lease_token=? AND provider_response_json IS NULL
      AND (phase='DISPATCHING' OR (phase='FINISHED' AND EXISTS
        (SELECT 1 FROM writing_ai_drafts d WHERE d.request_id=writing_ai_draft_execution.request_id
          AND d.status='UNASSESSED' AND d.reason='RESULT_UNAVAILABLE')))`)
      .bind(JSON.stringify(parsed), Date.now(), row.request_id, token).run();
  } catch {
    // A committed checkpoint with a lost ack is recoverable; without it keep
    // the entire reservation and explicitly terminate without inventing output.
    const saved = (await readExecution(env, row.request_id))!;
    if (saved.phase !== 'RESPONSE_STORED') {
      if ((await readAiDraft(env, row.request_id))?.status !== 'PENDING') return projectAiDraft(env, (await readAiDraft(env, row.request_id))!);
      await recordUnknown(env, row, saved, 'PROVIDER_FAILED');
      return projectAiDraft(env, await finish(env, row, saved, 'UNASSESSED', 'RESULT_UNAVAILABLE'));
    }
  }
  return reconcileAiDraft(env, user, row);
};
