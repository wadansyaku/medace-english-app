import type { GenerateWritingAiDraftRequest, WritingAiDraftResponse } from '../../../contracts/writing-ai-drafts';
import { OPENAI_WRITING_PRICING_VERSION, quoteOpenAiWritingRequest } from '../openai-writing-provider';
import { createD1AiBudgetStore } from '../ai-provider-budget-d1';
import { isWritingOpenAiConfigured, writingAiCapabilities } from '../writing-ai-capabilities';
import { HttpError } from '../http';
import type { AppEnv, DbUserRow } from '../types';
import { guardTeacher, guardWritingAccess } from './access';
import { draftIdentifier, draftInteger, exactDraftObject, requireDraftAssignment, sha256Draft } from './input-drafts';
import { bindAiDraftAlias, claimAiDraft, hasDataApproval, loadAiProviderRequest,
  readAiDraftByClientId, readCanonicalAiDraft, reconcileAiDraft } from './ai-draft-recovery';

export const parseWritingAiDraftRequest = (value: unknown): GenerateWritingAiDraftRequest => {
  const record = exactDraftObject(value, ['requestId', 'assignmentId', 'attemptNo', 'operation', 'inputDraftRevision']);
  if (record.operation !== 'OCR' && record.operation !== 'WRITING_FEEDBACK') throw new HttpError(400, 'GPT下書きの種類が不正です。');
  return { requestId: draftIdentifier(record.requestId), assignmentId: draftIdentifier(record.assignmentId),
    attemptNo: draftInteger(record.attemptNo, 1, 20), operation: record.operation,
    inputDraftRevision: draftInteger(record.inputDraftRevision, 1, 1_000_000) };
};

export const getWritingAiCapabilities = async (env: AppEnv, user: DbUserRow, assignmentId?: string) => {
  guardWritingAccess(user);
  if (!assignmentId) return writingAiCapabilities(env);
  await requireDraftAssignment(env, user, assignmentId);
  if (user.role !== 'INSTRUCTOR' || !isWritingOpenAiConfigured(env)) return writingAiCapabilities(env);
  const [ocr, feedback] = await Promise.all([hasDataApproval(env, assignmentId, 'OCR'), hasDataApproval(env, assignmentId, 'WRITING_FEEDBACK')]);
  return { ...writingAiCapabilities(env, ocr || feedback), ocrEnabled: ocr, feedbackEnabled: feedback };
};

export const getWritingAiDraft = async (env: AppEnv, user: DbUserRow, requestId: string): Promise<WritingAiDraftResponse> => {
  guardTeacher(user);
  const saved = await readAiDraftByClientId(env, draftIdentifier(requestId));
  if (!saved) throw new HttpError(404, 'GPT下書きが見つかりません。');
  await requireDraftAssignment(env, user, saved.row.assignment_id);
  // GET repairs only stored response/usage/terminal state; never dispatches.
  return reconcileAiDraft(env, user, saved.row);
};

export const generateWritingAiDraft = async (env: AppEnv, user: DbUserRow, request: GenerateWritingAiDraftRequest): Promise<WritingAiDraftResponse> => {
  guardTeacher(user);
  await requireDraftAssignment(env, user, request.assignmentId);
  const fingerprint = await sha256Draft({ ...request, requestedBy: user.id });
  const previous = await readAiDraftByClientId(env, request.requestId);
  if (previous) {
    if (previous.clientFingerprint !== fingerprint) throw new HttpError(409, '同じ処理識別子の対象・入力版・操作者が変わっています。');
    return reconcileAiDraft(env, user, previous.row, { allowDispatch: true });
  }
  const canonical = await readCanonicalAiDraft(env, request);
  if (canonical) {
    await bindAiDraftAlias(env, request.requestId, fingerprint, canonical);
    return reconcileAiDraft(env, user, canonical, { allowDispatch: true });
  }
  if (!isWritingOpenAiConfigured(env)) throw new HttpError(503, writingAiCapabilities(env).message);
  if (!await hasDataApproval(env, request.assignmentId, request.operation)) throw new HttpError(403, 'この課題の外部送信条件・成人同意または合成データ確認が未承認です。原本下書きは保存できます。');
  const providerRequest = await loadAiProviderRequest(env, user, request);
  const quote = quoteOpenAiWritingRequest(providerRequest);
  if (!quote) throw new HttpError(400, 'GPT下書きの入力上限・費用上限を確認できません。原本を保持しています。');
  const claimed = await claimAiDraft(env, user, request, fingerprint, providerRequest, quote);
  return reconcileAiDraft(env, user, claimed.row, { allowDispatch: true, initialToken: claimed.initialToken });
};

export const getWritingAiBudget = async (env: AppEnv, user: DbUserRow, monthKey: string) => {
  if (user.role !== 'ADMIN') throw new HttpError(403, 'AI利用額は管理者のみ確認できます。');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new HttpError(400, '月の指定が不正です。');
  const store = createD1AiBudgetStore(env.DB, { approvedPricingVersions: [OPENAI_WRITING_PRICING_VERSION] });
  return { monthKey, snapshot: await store.snapshot(monthKey), audit: await store.exportAudit(monthKey),
    providerInvoiceConfirmed: false, scope: 'THIS_APPLICATION_ONLY', configured: isWritingOpenAiConfigured(env) };
};
