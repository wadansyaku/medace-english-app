import { PRODUCT_SUPPORT_MAX_QUESTION_CHARS, type ProductSupportReference, type ProductSupportRequest, type ProductSupportResponse } from '../../contracts/productSupport';
import { searchProductSupportConversation, validateProductSupportAnswer } from '../../shared/productSupportConversation';
import { PRODUCT_SUPPORT_SOURCE_LINKS_READY, PRODUCT_SUPPORT_TARGET_VERSION, type ProductSupportKnowledgeSource, type ProductSupportRole } from '../../shared/productSupportKnowledge';
import { hashOpaqueToken } from './auth';
import { HttpError } from './http';
import { createProductSupportBudget, hashProductSupportMetadata, type ProductSupportReceipt } from './product-support-budget';
import { buildProductSupportPrompt, decodeProductSupportProviderOutput, getProductSupportProvider, type ProductSupportEnv, type ProductSupportProvider } from './product-support-provider';

export const PRODUCT_SUPPORT_BODY_LIMIT_BYTES = 12 * 1024;
export const PRODUCT_SUPPORT_TIMEOUT_MS = 10_000;
const invalid = (): never => { throw new HttpError(400, '質問の形式を確認してください。'); };
const object = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) return invalid();
  return value as Record<string, unknown>;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return invalid();
  if (value.length > PRODUCT_SUPPORT_MAX_QUESTION_CHARS) throw new HttpError(413, '質問は600文字以内で入力してください。');
  const normalized = value.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '');
  // Conservative tripwires, not a complete PII/injection detector.
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b(?:sk-[a-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|bearer\s+\S{12,})|(?:電話番号|パスワード|api[ ]?キー|api key|氏名|生徒名)\s*[:=：]\s*\S+|\b0\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}\b/i.test(normalized)) {
    throw new HttpError(400, '個人情報や秘密情報を取り除いて、操作だけを入力してください。');
  }
  if (/(?:指示|命令|ルール|制約).{0,12}(?:無視|破棄|上書き)|(?:ignore|override|disregard).{0,30}(?:instructions?|rules?|system)|system\s*prompt|システムプロンプト|内部runbook|秘密.{0,10}(?:表示|出力)|権限.{0,8}(?:付与|昇格)/i.test(normalized)) {
    throw new HttpError(400, '公開されている操作案内について質問してください。');
  }
  return value.trim();
};
export const validateProductSupportRequest = (value: unknown): ProductSupportRequest => {
  const body = object(value, ['action', 'requestId', 'question', 'history', 'privacyConsent', 'targetVersion']);
  if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId)) return invalid();
  if (body.action === 'recheck') {
    object(body, ['action', 'requestId']); return { action: 'recheck', requestId: body.requestId };
  }
  if (body.action !== 'ask' || body.privacyConsent !== true || !Array.isArray(body.history) || body.history.length > 3) return invalid();
  if (body.targetVersion !== undefined && body.targetVersion !== PRODUCT_SUPPORT_TARGET_VERSION) {
    throw new HttpError(409, '操作案内の版が変わりました。画面を再読み込みしてください。');
  }
  return { action: 'ask', requestId: body.requestId, question: text(body.question),
    history: body.history.map(turn => ({ userText: text(object(turn, ['userText']).userText) })),
    privacyConsent: true, ...(body.targetVersion !== undefined ? { targetVersion: PRODUCT_SUPPORT_TARGET_VERSION } : {}) };
};
export interface ProductSupportActor { actorHash: string; role: ProductSupportRole }
/** Read-only cookie verification. Do not call getSessionUser: its existing
 * profile/membership supplementation is outside Bot authority. */
export const resolveProductSupportActor = async (env: ProductSupportEnv, request: Request): Promise<ProductSupportActor> => {
  let credential: string | undefined;
  try {
    const entry = (request.headers.get('Cookie') || '').split(';').map(part => part.trim())
      .find(part => part.startsWith('medace_session='));
    if (entry) credential = decodeURIComponent(entry.slice('medace_session='.length));
  } catch { /* Invalid cookie gets public-only guidance. */ }
  const publicActor = async (): Promise<ProductSupportActor> => ({ role: 'GUEST', actorHash: await hashProductSupportMetadata('bot-support:shared-public-bucket:v1') });
  if (!credential || credential.length > 500) return publicActor();
  const sessionId = credential.split('.')[0];
  const row = await env.DB.prepare(`SELECT u.id,u.role,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>?`).bind(sessionId, Date.now()).first<{ id: string; role: string; token_hash: string | null }>();
  if (!row || (credential.includes('.')
    ? row.token_hash !== await hashOpaqueToken(credential)
    : row.token_hash !== null)) return publicActor();
  let role: ProductSupportRole = row.role === 'ADMIN' ? 'ADMIN' : row.role === 'STUDENT' ? 'STUDENT' : 'GUEST';
  if (row.role === 'INSTRUCTOR') {
    const membership = await env.DB.prepare(`SELECT m.role FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
      WHERE m.user_id=? AND m.status='ACTIVE' AND o.status='ACTIVE' AND m.role IN ('INSTRUCTOR','GROUP_ADMIN')
      ORDER BY CASE m.role WHEN 'GROUP_ADMIN' THEN 0 ELSE 1 END,m.organization_id LIMIT 1`).bind(row.id).first<{ role: ProductSupportRole }>();
    if (membership) role = membership.role;
  }
  return { role, actorHash: await hashProductSupportMetadata(`bot-support:actor:v1:${row.id}`) };
};
const references = (sources: readonly ProductSupportKnowledgeSource[]): ProductSupportReference[] => sources.map(source => ({
  sourceId: source.sourceId, title: source.title, excerpt: source.content, version: source.targetVersion, checkedAt: source.checkedAt,
  ...(PRODUCT_SUPPORT_SOURCE_LINKS_READY ? { url: source.sourceURL } : {}),
}));
const unknownResponse = (requestId: string): ProductSupportResponse => ({ requestId, version: PRODUCT_SUPPORT_TARGET_VERSION,
  status: 'UNKNOWN_RESULT', recheckAllowed: false, message: 'この質問の結果を復元できません。再生成は行いません。公開案内を確認するか、手動で報告してください。' });
const receiptResponse = (requestId: string, receipt: ProductSupportReceipt, now: number): ProductSupportResponse =>
  receipt.state === 'RESERVED' && now - receipt.created_at < PRODUCT_SUPPORT_TIMEOUT_MS
    ? { requestId, version: PRODUCT_SUPPORT_TARGET_VERSION, status: 'PENDING', recheckAllowed: true, message: '処理の結果を確認しています。再照会で確認できます。' }
    : unknownResponse(requestId);

/** Trusted injectable dependencies are for isolated tests, not HTTP options. */
export const handleProductSupport = async (env: ProductSupportEnv, actor: ProductSupportActor, raw: unknown, options: {
  now?: () => number; provider?: ProductSupportProvider | null; timeoutMs?: number;
} = {}): Promise<ProductSupportResponse> => {
  const body = validateProductSupportRequest(raw);
  const now = options.now ?? Date.now;
  const budget = createProductSupportBudget(env.DB, { now });
  const requestKey = await hashProductSupportMetadata(`bot-support:request:v1:${body.requestId}`);
  if (body.action === 'recheck') {
    const receipt = await budget.read(actor.actorHash, requestKey);
    return !receipt || receipt.role !== actor.role || receipt.target_version !== PRODUCT_SUPPORT_TARGET_VERSION
      ? unknownResponse(body.requestId) : receiptResponse(body.requestId, receipt, now());
  }
  const input = { question: body.question, history: body.history, role: actor.role, targetVersion: PRODUCT_SUPPORT_TARGET_VERSION };
  const decision = searchProductSupportConversation(input);
  const provider = options.provider === undefined ? getProductSupportProvider(env) : options.provider;
  const useProvider = decision.kind === 'grounded' && provider !== null
    && env.BOT_ENABLED === 'true' && env.BOT_DATA_POLICY === 'PUBLIC_KB_ONLY_CONSENTED'
    && provider.profile.verified && provider.profile.includesReasoningBilling && provider.profile.hardTotalBilledOutputBound;
  const prompt = useProvider ? buildProductSupportPrompt(body, decision.sources) : null;
  const requestHash = await hashProductSupportMetadata(JSON.stringify({ ...input, privacyConsent: body.privacyConsent }));
  const reservation = await budget.reserve({ actorHash: actor.actorHash, requestKey, requestHash, role: actor.role,
    version: PRODUCT_SUPPORT_TARGET_VERSION, operation: useProvider ? 'GENERATION' : 'PUBLIC_KB',
    upperBoundMicroUsd: useProvider ? provider!.profile.upperBoundMicroUsd : 0 });
  if (reservation.kind === 'capacity') return { requestId: body.requestId, version: PRODUCT_SUPPORT_TARGET_VERSION,
    status: 'CAPACITY_REACHED', recheckAllowed: false, message: '今は対話受付の上限に達しています。公開案内を確認するか、手動で報告してください。' };
  if (reservation.kind === 'duplicate') return receiptResponse(body.requestId, reservation.receipt, now());
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    let proposed: unknown;
    if (useProvider) {
      const duration = options.timeoutMs ?? PRODUCT_SUPPORT_TIMEOUT_MS;
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > PRODUCT_SUPPORT_TIMEOUT_MS) throw new Error('Invalid Bot timeout.');
      proposed = decodeProductSupportProviderOutput(await Promise.race([
        provider!.generate(prompt!),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Bot result unknown.')), duration); }),
      ]));
    } else if (decision.kind === 'grounded') {
      proposed = { answer: decision.sources.map(source => `${source.title}\n${source.content}`).join('\n\n'),
        sourceIds: decision.sources.map(source => source.sourceId), unknown: false, clarification: null };
    } else {
      const clarification = decision.kind === 'clarification' ? decision.clarification
        : '公開案内で確認できる操作について、画面や機能を教えてください。確認できない内容は手動で報告できます。';
      proposed = { answer: clarification, sourceIds: decision.sources.map(source => source.sourceId), unknown: true, clarification };
    }
    const validation = validateProductSupportAnswer(proposed, input, decision);
    if (!validation.valid) throw new Error('Bot answer could not be verified.');
    await budget.finish(reservation.receipt, 'COMPLETED');
    return { requestId: body.requestId, version: PRODUCT_SUPPORT_TARGET_VERSION, status: 'ANSWERED',
      kind: validation.value.unknown ? 'CLARIFICATION' : 'ANSWER', answer: validation.value.answer,
      sourceIds: validation.value.sourceIds, references: references(validation.sources), providerUsed: useProvider,
      recheckAllowed: false, ...(!useProvider ? { message: '公開案内からの回答（生成OFF）です。自由会話のAI生成は実行していません。' } : {}) };
  } catch {
    // An uncertain dispatch/answer/commit retains its complete hold. Do not
    // include provider errors (which may echo a prompt) in logs or responses.
    try { await budget.finish(reservation.receipt, 'UNKNOWN'); } catch { /* The original RESERVED hold is equally conservative. */ }
    return unknownResponse(body.requestId);
  } finally { if (timeout !== undefined) clearTimeout(timeout); }
};
