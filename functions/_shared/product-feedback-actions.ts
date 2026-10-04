import type { ProductFeedbackReport, ProductFeedbackRequest } from '../../contracts/productFeedback';
import { advanceFeedback, validateFeedbackInput } from '../../shared/productFeedback';
import { OrganizationRole, UserRole } from '../../types';
import { requireRole } from './auth';
import { HttpError } from './http';
import { requireActiveOrganizationContext } from './organization-memberships';
import type { AppEnv, DbUserRow } from './types';

type Row = { id: string; reporter_user_id: string; org_id: string | null; create_fingerprint: string; input_json: string; revision: number; status: ProductFeedbackReport['status']; priority: ProductFeedbackReport['priority'] | null; acceptance: string | null; fix_revision: string | null; created_at: number; updated_at: number };
type Receipt = { actor_user_id: string | null; fingerprint: string; response_json: string };
const invalid = (): never => { throw new HttpError(400, '報告リクエストを確認してください。'); };
const object = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) return invalid();
  return value as Record<string, unknown>;
};
const id = (value: unknown): string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : invalid();
export const validateProductFeedbackRequest = (value: unknown): ProductFeedbackRequest => {
  const body = object(value, ['action','cursor','id','input','privacyConfirmed','expectedRevision','mutationId','change']);
  if (body.action === 'list') {
    object(body, ['action','cursor']);
    if (body.cursor !== undefined && (typeof body.cursor !== 'string' || body.cursor.length > 512)) invalid();
  } else if (body.action === 'get') {
    object(body, ['action','id']); id(body.id);
  } else if (body.action === 'create') {
    object(body, ['action','id','input','privacyConfirmed']); id(body.id);
    if (body.privacyConfirmed !== true) invalid();
    object(body.input, ['title','version','screen','steps','expected','actual','impact']);
    try { validateFeedbackInput(body.input); } catch (error) { throw new HttpError(400, (error as Error).message); }
  } else if (body.action === 'advance') {
    object(body, ['action','id','expectedRevision','mutationId','change']); id(body.id); id(body.mutationId);
    if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) invalid();
    const change = object(body.change, ['type','priority','acceptance','revision','note','passed']);
    const keys: Record<string, string[]> = { triage: ['type','priority','acceptance'], 'prepare-handoff': ['type'], 'record-fix': ['type','revision','note'], retest: ['type','passed','note'] };
    const changeType = typeof change.type === 'string' ? change.type : invalid();
    if (!Object.hasOwn(keys, changeType)) invalid();
    object(change, keys[changeType]);
  } else invalid();
  return body as unknown as ProductFeedbackRequest;
};
const summary = (row: Row, user: DbUserRow): ProductFeedbackReport => ({
  ...JSON.parse(row.input_json), id: row.id, revision: row.revision, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  ...(row.priority ? { priority: row.priority } : {}), ...(row.acceptance ? { acceptance: row.acceptance } : {}), ...(row.fix_revision ? { fixRevision: row.fix_revision } : {}),
  history: [], historyLoaded: false, isOwnReport: row.reporter_user_id === user.id,
});
const withHistory = async (env: AppEnv, report: Omit<ProductFeedbackReport, 'history'>): Promise<ProductFeedbackReport> => {
  const events = await env.DB.prepare('SELECT revision, at, status, actor_role AS actorRole, note FROM product_feedback_events WHERE report_id=? AND revision<=? ORDER BY revision').bind(report.id, report.revision).all<ProductFeedbackReport['history'][number]>();
  if (events.success === false || !events.results) throw new Error('Feedback history read failed');
  return { ...report, history: events.results, historyLoaded: true };
};
const project = (env: AppEnv, row: Row, user: DbUserRow): Promise<ProductFeedbackReport> => withHistory(env, summary(row, user));
const read = (env: AppEnv, reportId: string) => env.DB.prepare('SELECT * FROM product_feedback_reports WHERE id=?').bind(reportId).first<Row>();
// Canonical keys make semantically identical JSON requests retryable.
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const handleProductFeedback = async (env: AppEnv, user: DbUserRow, raw: unknown) => {
  requireRole(user, [UserRole.INSTRUCTOR, UserRole.ADMIN]);
  const admin = user.role === UserRole.ADMIN;
  const orgId = admin ? null : (await requireActiveOrganizationContext(env, user, [OrganizationRole.INSTRUCTOR, OrganizationRole.GROUP_ADMIN])).organizationId;
  if (!admin) {
    const organization = await env.DB.prepare('SELECT status FROM organizations WHERE id=?').bind(orgId).first<{ status: string }>();
    if (organization?.status !== 'ACTIVE') throw new HttpError(403, '有効な組織への所属が必要です。');
  }
  const body = validateProductFeedbackRequest(raw);
  const authorized = (row: Row) => { if (!admin && (row.reporter_user_id !== user.id || row.org_id !== orgId)) throw new HttpError(404, '報告が見つかりません。'); };
  if (body.action === 'list') {
    let cursor: { at: number; id: string } | undefined;
    if (body.cursor !== undefined) {
      try { const value = object(JSON.parse(atob(body.cursor)), ['at','id']); id(value.id); if (!Number.isSafeInteger(value.at) || Number(value.at) < 0) invalid(); cursor = value as typeof cursor; } catch { invalid(); }
    }
    const filters = [admin ? '1=1' : 'reporter_user_id=? AND org_id=?', ...(cursor ? ['(updated_at < ? OR (updated_at = ? AND id < ?))'] : [])];
    const values: unknown[] = admin ? [] : [user.id, orgId]; if (cursor) values.push(cursor.at, cursor.at, cursor.id);
    const result = await env.DB.prepare(`SELECT * FROM product_feedback_reports WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC,id DESC LIMIT 101`).bind(...values).all<Row>();
    if (result.success === false || !result.results) throw new Error('Feedback list read failed');
    const rows = result.results.slice(0,100); const last = rows.at(-1);
    return { reports: rows.map(row => summary(row,user)), canManage: admin, deploymentRevision: env.DEPLOYMENT_SHA || null, nextCursor: result.results.length > 100 && last ? btoa(JSON.stringify({ at: last.updated_at, id: last.id })) : null };
  }
  if (body.action === 'create') {
    const input = validateFeedbackInput(body.input); const fingerprint = canonical(input); const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO product_feedback_reports(id,reporter_user_id,org_id,create_fingerprint,input_json,revision,status,created_at,updated_at) VALUES(?,?,?,?,?,1,'NEW',?,?)`).bind(body.id,user.id,orgId,fingerprint,JSON.stringify(input),now,now),
      env.DB.prepare(`INSERT OR IGNORE INTO product_feedback_events(report_id,revision,actor_user_id,actor_role,status,note,at) SELECT id,1,?,?,'NEW','匿名の操作報告を保存。',created_at FROM product_feedback_reports WHERE id=? AND reporter_user_id=? AND create_fingerprint=?`).bind(user.id,user.role,body.id,user.id,fingerprint),
    ]);
    const row = await read(env,body.id); if (!row) throw new Error('Feedback create read failed');
    if (row.reporter_user_id !== user.id || row.org_id !== orgId || row.create_fingerprint !== fingerprint) throw new HttpError(409,'報告IDが既に別の内容で使われています。');
    return project(env,row,user);
  }
  const row = await read(env,body.id); if (!row) throw new HttpError(404,'報告が見つかりません。'); authorized(row);
  if (body.action === 'get') return project(env,row,user);
  if (body.change.type !== 'retest' && !admin) throw new HttpError(403,'管理者のみが実行できます。');
  const fingerprint = canonical(body);
  const receipt = () => env.DB.prepare('SELECT actor_user_id,fingerprint,response_json FROM product_feedback_receipts WHERE report_id=? AND mutation_id=?').bind(body.id,body.mutationId).first<Receipt>();
  const retry = (saved: Receipt) => { if (saved.actor_user_id !== user.id || saved.fingerprint !== fingerprint) throw new HttpError(409,'操作IDが別の内容で使われています。'); return withHistory(env, JSON.parse(saved.response_json) as Omit<ProductFeedbackReport, 'history'>); };
  const saved = await receipt(); if (saved) return retry(saved);
  if (row.revision !== body.expectedRevision) throw new HttpError(409,'報告が更新されています。再取得してください。');
  const report = await project(env,row,user);
  // Preserve all old events; cap new mutations at 1,000 to bound each read/export.
  if (row.revision >= 1000) throw new HttpError(409,'履歴の保存上限に達しました。');
  let next: ProductFeedbackReport;
  try { next = advanceFeedback(report,body.change,user.role as 'ADMIN' | 'INSTRUCTOR',Date.now()); } catch(error) { throw new HttpError(400,(error as Error).message); }
  const event = next.history.at(-1)!;
  const { history: _history, ...responseSnapshot } = next;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO product_feedback_receipts(report_id,mutation_id,actor_user_id,fingerprint,response_json) SELECT id,?,?,?,? FROM product_feedback_reports WHERE id=? AND revision=?`).bind(body.mutationId,user.id,fingerprint,JSON.stringify(responseSnapshot),body.id,body.expectedRevision),
    env.DB.prepare(`UPDATE product_feedback_reports SET revision=?,status=?,priority=?,acceptance=?,fix_revision=?,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM product_feedback_receipts WHERE report_id=? AND mutation_id=? AND actor_user_id=? AND fingerprint=?)`).bind(next.revision,next.status,next.priority ?? null,next.acceptance ?? null,next.fixRevision ?? null,next.updatedAt,body.id,body.expectedRevision,body.id,body.mutationId,user.id,fingerprint),
    env.DB.prepare(`INSERT OR IGNORE INTO product_feedback_events(report_id,revision,actor_user_id,actor_role,status,note,at) SELECT id,?,?,?,?,?,? FROM product_feedback_reports WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM product_feedback_receipts WHERE report_id=? AND mutation_id=? AND actor_user_id=? AND fingerprint=?)`).bind(next.revision,user.id,event.actorRole,event.status,event.note,event.at,body.id,next.revision,body.id,body.mutationId,user.id,fingerprint),
  ]);
  const committed = await receipt(); if (!committed) throw new HttpError(409,'報告が更新されています。再取得してください。'); return retry(committed);
};
