import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqliteD1 } from './helpers/sqlite-d1';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), organization: vi.fn(), visible: vi.fn() }));
vi.mock('../functions/_shared/openai-writing-provider', async () => ({
  ...await vi.importActual('../functions/_shared/openai-writing-provider'),
  createOpenAiWritingProvider: () => ({ execute: mocks.execute }),
}));
vi.mock('../functions/_shared/organization-memberships', async () => ({
  ...await vi.importActual('../functions/_shared/organization-memberships'), readActiveOrganizationContextForUser: mocks.organization,
}));
vi.mock('../functions/_shared/student-visibility', async () => ({
  ...await vi.importActual('../functions/_shared/student-visibility'), readVisibleStudentIds: mocks.visible,
}));
import { parseInputDraft, saveWritingInputDraft, getWritingInputDraft } from '../functions/_shared/writing-actions/input-drafts';
import { generateWritingAiDraft, getWritingAiDraft, getWritingAiCapabilities, getWritingAiBudget } from '../functions/_shared/writing-actions/ai-drafts';
import { OPENAI_WRITING_MODEL, OPENAI_WRITING_PRICING_VERSION } from '../functions/_shared/openai-writing-provider';
import { classifyWritingEvaluation } from '../shared/writingAiSafety';
import { createD1AiBudgetStore } from '../functions/_shared/ai-provider-budget-d1';

let fixture: ReturnType<typeof createSqliteD1>;
let env: AppEnv;
const student = { id: 'student', role: 'STUDENT', subscription_plan: 'TOB_PAID' } as DbUserRow;
const teacher = { id: 'teacher', role: 'INSTRUCTOR', subscription_plan: 'TOB_PAID' } as DbUserRow;
const admin = { id: 'admin', role: 'ADMIN' } as DbUserRow;
const input = (overrides = {}) => ({ requestId: 'save-one', assignmentId: 'assignment', attemptNo: 1,
  expectedRevision: 0, assetIds: [] as string[], manualTranscript: 'Synthetic original answer.', ...overrides });
const request = (overrides = {}) => ({ requestId: 'generate-one', assignmentId: 'assignment', attemptNo: 1,
  inputDraftRevision: 1, operation: 'WRITING_FEEDBACK' as const, ...overrides });
const metering = { responseId: 'resp_synthetic', provider: 'OPENAI', model: OPENAI_WRITING_MODEL,
  pricingVersion: OPENAI_WRITING_PRICING_VERSION, inputTokens: 10, cachedInputTokens: 0,
  outputTokens: 10, totalTokens: 20, estimatedCostMicroUsd: 20 };
const generated = () => ({ status: 'DRAFT', operation: 'WRITING_FEEDBACK', evaluationStatus: 'UNASSESSED', requiresHumanReview: true,
  dispatched: true, draft: { strengths: ['意味が明確'], improvementPoints: ['理由を追加'], correctedDraft: 'Synthetic corrected draft.', sentenceCorrections: [] }, metering });
const approve = () => {
  env.OPENAI_WRITING_ENABLED = 'true'; env.OPENAI_API_KEY = 'synthetic-not-a-real-key'; env.OPENAI_WRITING_DATA_POLICY = 'operator-approved-v1';
  fixture.sqlite.prepare(`INSERT INTO writing_ai_data_approvals VALUES('assignment','SYNTHETIC_ONLY','BOTH','synthetic-test-only','admin',?,NULL,?)`)
    .run(Date.now() + 60000, Date.now());
};
beforeEach(() => {
  fixture = createSqliteD1();
  fixture.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT,display_name TEXT);
    INSERT INTO users VALUES('student','STUDENT','Synthetic learner'),('teacher','INSTRUCTOR','Synthetic teacher'),('admin','ADMIN','Synthetic admin'),('other','STUDENT','Synthetic other');
    CREATE TABLE writing_assignments(id TEXT PRIMARY KEY,organization_id TEXT,instructor_user_id TEXT,student_user_id TEXT,status TEXT,attempt_count INTEGER,max_attempts INTEGER,prompt_text TEXT,guidance TEXT);
    INSERT INTO writing_assignments VALUES('assignment','org','teacher','student','ISSUED',0,2,'Give two reasons.','Use an example.');
    CREATE TABLE writing_submission_assets(id TEXT PRIMARY KEY,assignment_id TEXT,attempt_no INTEGER,uploaded_at INTEGER,file_name TEXT,mime_type TEXT,byte_size INTEGER,r2_key TEXT,submission_id TEXT);
    INSERT INTO writing_submission_assets VALUES('asset','assignment',1,1,'synthetic.png','image/png',3,'synthetic-r2-key',NULL);
  `);
  fixture.sqlite.exec(readFileSync('migrations/0050_ai_provider_budget.sql', 'utf8'));
  fixture.sqlite.exec(readFileSync('migrations/0051_writing_unassessed_drafts.sql', 'utf8'));
  fixture.sqlite.exec(readFileSync('migrations/0052_writing_draft_attachment_retirement.sql', 'utf8'));
  env = { DB: fixture.DB };
  mocks.organization.mockImplementation(async (_env, uid) => uid === 'teacher' ? { organizationId: 'org' } : null);
  mocks.visible.mockImplementation(async (_env, user) => new Set([user.role === 'STUDENT' ? user.id : 'student']));
  mocks.execute.mockReset(); mocks.execute.mockResolvedValue(generated());
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External network is forbidden in this test'); }));
});
afterEach(() => { fixture.sqlite.close(); vi.unstubAllGlobals(); });

describe('unassessed Writing originals and provider integration', () => {
  it('saves manual-only input without AI, restores it, and never changes assignment completion', async () => {
    const before = fixture.sqlite.prepare('SELECT * FROM writing_assignments').all();
    const saved = await saveWritingInputDraft(env, student, parseInputDraft(input()));
    expect(saved.draft).toMatchObject({ revision: 1, manualTranscript: 'Synthetic original answer.', assessmentStatus: 'UNASSESSED' });
    expect(await getWritingInputDraft({ DB: fixture.DB }, student, 'assignment', 1)).toEqual(saved);
    expect(fixture.sqlite.prepare('SELECT * FROM writing_assignments').all()).toEqual(before);
    expect(mocks.execute).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('deduplicates a lost save response, rejects changed payload and stale revisions, and preserves originals', async () => {
    const first = await saveWritingInputDraft(env, student, parseInputDraft(input()));
    expect(await saveWritingInputDraft(env, student, parseInputDraft(input()))).toEqual(first);
    await expect(saveWritingInputDraft(env, student, parseInputDraft(input({ manualTranscript: 'Changed' })))).rejects.toMatchObject({ status: 409 });
    const second = await saveWritingInputDraft(env, teacher, parseInputDraft(input({ requestId: 'save-two', expectedRevision: 1, manualTranscript: 'Reviewed input' })));
    expect(second.draft?.revision).toBe(2);
    await expect(saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'stale' })))).rejects.toMatchObject({ status: 409 });
    expect((await getWritingInputDraft(env, student, 'assignment', 1)).draft?.manualTranscript).toBe('Reviewed input');
  });
  it('allows exactly one of concurrent saves at the same revision', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input()));
    const results = await Promise.allSettled(['a', 'b'].map(id => saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: id, expectedRevision: 1, manualTranscript: id })))));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await getWritingInputDraft(env, student, 'assignment', 1)).draft?.revision).toBe(2);
  });
  it('retires detached originals in the same CAS batch without deleting rows, and a stale request cannot retire current attachments', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input({ manualTranscript: '', assetIds: ['asset'] })));
    await saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'detach', expectedRevision: 1, manualTranscript: '', assetIds: [] })));
    expect(fixture.sqlite.prepare("SELECT draft_retired_at FROM writing_submission_assets WHERE id='asset'").get()?.draft_retired_at).toBeGreaterThan(0);
    expect((await getWritingInputDraft(env, student, 'assignment', 1)).draft).toMatchObject({ revision: 2, manualTranscript: '', assets: [] });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM writing_submission_assets").get()?.n).toBe(1);
    await expect(saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'revive', expectedRevision: 2, assetIds: ['asset'] })))).rejects.toMatchObject({ status: 409 });
    expect(() => parseInputDraft(input({ manualTranscript: '', assetIds: [] }))).toThrow();
  });
  it('does not retire attachments when a stale CAS loses, including after another editor saves', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input({ assetIds: ['asset'] })));
    await saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'winner', expectedRevision: 1, assetIds: ['asset'], manualTranscript: 'Winning content' })));
    await expect(saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'loser', expectedRevision: 1, assetIds: [], manualTranscript: '' })))).rejects.toMatchObject({ status: 409 });
    expect(fixture.sqlite.prepare("SELECT draft_retired_at FROM writing_submission_assets WHERE id='asset'").get()?.draft_retired_at).toBeNull();
    expect((await getWritingInputDraft(env, student, 'assignment', 1)).draft?.assets).toHaveLength(1);
  });
  it('validates asset ownership, uploaded status and attempt, retaining saved asset metadata', async () => {
    const saved = await saveWritingInputDraft(env, student, parseInputDraft(input({ manualTranscript: '', assetIds: ['asset'] })));
    expect(saved.draft?.assets).toEqual([{ id: 'asset', fileName: 'synthetic.png', mimeType: 'image/png', byteSize: 3 }]);
    fixture.sqlite.prepare("UPDATE writing_submission_assets SET attempt_no=2 WHERE id='asset'").run();
    await expect(saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'bad-asset', assetIds: ['asset'] })))).rejects.toMatchObject({ status: 400 });
  });
  it('enforces the combined upload policy at draft saving, including separately uploaded PDF and image files', async () => {
    fixture.sqlite.prepare("INSERT INTO writing_submission_assets(id,assignment_id,attempt_no,uploaded_at,file_name,mime_type,byte_size,r2_key) VALUES('pdf','assignment',1,1,'synthetic.pdf','application/pdf',3,'pdf-key')").run();
    await expect(saveWritingInputDraft(env, student, parseInputDraft(input({ assetIds: ['asset', 'pdf'] })))).rejects.toMatchObject({ status: 400 });
    fixture.sqlite.prepare("UPDATE writing_submission_assets SET byte_size=? WHERE id='asset'").run(21 * 1024 * 1024);
    await expect(saveWritingInputDraft(env, student, parseInputDraft(input({ assetIds: ['asset'] })))).rejects.toMatchObject({ status: 400 });
    expect((await getWritingInputDraft(env, student, 'assignment', 1)).draft).toBeNull();
  });
  it.each([{}, { OPENAI_API_KEY: 'synthetic-key' }, { OPENAI_WRITING_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-key' }])('requires explicit feature/data policy before reserving or dispatching %j', async flags => {
    Object.assign(env, flags); await saveWritingInputDraft(env, student, parseInputDraft(input()));
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toMatchObject({ status: 503 });
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_provider_budget_reservations').get()?.n).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('requires server-recorded data approval and rejects revoked/expired approvals', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input()));
    env.OPENAI_WRITING_ENABLED = 'true'; env.OPENAI_API_KEY = 'synthetic'; env.OPENAI_WRITING_DATA_POLICY = 'operator-approved-v1';
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toMatchObject({ status: 403 });
    approve(); fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET revoked_at=1').run();
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toMatchObject({ status: 403 });
    fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET revoked_at=NULL,expires_at=1').run();
    expect((await getWritingAiCapabilities(env, teacher, 'assignment')).feedbackEnabled).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('reserves before dispatch, persists the response-usage estimate and unassessed result, and retries without spending', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input())); approve();
    mocks.execute.mockImplementationOnce(async () => {
      expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_provider_budget_reservations').get()?.n).toBe(1);
      return generated();
    });
    const result = await generateWritingAiDraft(env, teacher, request());
    expect(result).toMatchObject({ status: 'READY', assessmentStatus: 'UNASSESSED', requiresHumanReview: true, result: { operation: 'WRITING_FEEDBACK', correctedDraft: 'Synthetic corrected draft.' } });
    expect(await generateWritingAiDraft(env, teacher, request())).toEqual(result);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toEqual(result);
    const budget = await getWritingAiBudget(env, admin, new Date().toISOString().slice(0, 7));
    expect(budget.snapshot.accountedMicroUsd).toBe(20); expect(budget.providerInvoiceConfirmed).toBe(false);
    expect(budget.audit.rows.some(row => row.provider_response_id === 'resp_synthetic' && row.total_tokens === 20)).toBe(true);
    expect(JSON.stringify(budget.audit)).not.toContain('Synthetic original answer');
    expect((await getWritingInputDraft(env, student, 'assignment', 1)).draft?.manualTranscript).toBe('Synthetic original answer.');
  });
  it('only one concurrent identical request dispatches and a pending duplicate cannot overwrite its result', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input())); approve();
    const results = await Promise.all([generateWritingAiDraft(env, teacher, request()), generateWritingAiDraft(env, teacher, request())]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(results.some(result => result.status === 'READY')).toBe(true);
    expect((await getWritingAiDraft(env, teacher, request().requestId)).status).toBe('READY');
  });
  it('reads approved images from original storage and saves OCR as a suggestion without replacing original text', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input({ assetIds: ['asset'] }))); approve();
    env.WRITING_ASSETS = { get: vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })) } as any;
    mocks.execute.mockResolvedValue({ status: 'DRAFT', operation: 'OCR', evaluationStatus: 'UNASSESSED', requiresHumanReview: true,
      dispatched: true, draft: { transcript: 'Synthetic recognized text.', confidence: 0.9 }, metering });
    const result = await generateWritingAiDraft(env, teacher, request({ operation: 'OCR' }));
    expect(result).toMatchObject({ status: 'READY', assessmentStatus: 'UNASSESSED', result: { operation: 'OCR', transcript: 'Synthetic recognized text.' } });
    expect(mocks.execute).toHaveBeenCalledWith({ operation: 'OCR', payload: { assets: [{ mimeType: 'image/png', base64Data: 'AQID' }], promptText: 'Give two reasons.\nUse an example.' } });
    expect((await getWritingInputDraft(env, student, 'assignment', 1)).draft?.manualTranscript).toBe('Synthetic original answer.');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('stops before provider dispatch when the global month cannot fit the upper bound', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input())); approve();
    const store = createD1AiBudgetStore(env.DB, { approvedPricingVersions: [OPENAI_WRITING_PRICING_VERSION] });
    const monthKey = new Date().toISOString().slice(0, 7);
    expect(await store.reserveWithMetadata({ requestId: 'other-operation', fingerprint: 'a'.repeat(64), monthKey,
      upperBoundMicroUsd: 4_500_000, pricingVersion: OPENAI_WRITING_PRICING_VERSION, provider: 'OPENAI', model: OPENAI_WRITING_MODEL, operation: 'OCR' })).toMatchObject({ reserved: true });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED' });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect((await getWritingAiBudget(env, admin, monthKey)).snapshot.accountedMicroUsd).toBe(4_500_000);
  });
  it('blocks additional dispatch when a response has no trustworthy usage', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input())); approve();
    mocks.execute.mockResolvedValue({ status: 'UNASSESSED', reason: 'UNKNOWN_USAGE', dispatched: true, retryAutomatically: false });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: 'UNKNOWN_USAGE' });
    expect((await getWritingAiBudget(env, admin, new Date().toISOString().slice(0, 7))).snapshot.blocked).toBe(true);
    expect(await generateWritingAiDraft(env, teacher, request({ requestId: 'next' }))).toMatchObject({ status: 'UNASSESSED' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('retains an unknown timeout reservation and never fabricates or automatically retries', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input())); approve();
    mocks.execute.mockResolvedValue({ status: 'UNASSESSED', reason: 'TIMEOUT', dispatched: true, retryAutomatically: false });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: 'TIMEOUT' });
    await generateWritingAiDraft(env, teacher, request()); expect(mocks.execute).toHaveBeenCalledTimes(1);
    const budget = await getWritingAiBudget(env, admin, new Date().toISOString().slice(0, 7));
    expect(budget.snapshot.unresolvedReservations).toBe(1); expect(budget.snapshot.accountedMicroUsd).toBeGreaterThan(0);
  });
  it('records known refusal usage and denies unsupported PDF OCR without dispatch', async () => {
    await saveWritingInputDraft(env, student, parseInputDraft(input({ assetIds: ['asset'] }))); approve();
    mocks.execute.mockResolvedValue({ status: 'UNASSESSED', reason: 'PROVIDER_REFUSAL', dispatched: true, retryAutomatically: false, metering });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: 'PROVIDER_REFUSAL' });
    fixture.sqlite.prepare("UPDATE writing_submission_assets SET mime_type='application/pdf'").run();
    await expect(generateWritingAiDraft(env, teacher, request({ requestId: 'pdf', operation: 'OCR' }))).rejects.toMatchObject({ status: 400 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it.each([student, admin, { ...teacher, id: 'not-active' }])('limits generation to active assigned teachers (%j)', async actor => {
    await saveWritingInputDraft(env, student, parseInputDraft(input())); approve();
    await expect(generateWritingAiDraft(env, actor as DbUserRow, request())).rejects.toMatchObject({ status: 403 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('denies another learner and another teacher organization, and keeps global audit ADMIN-only', async () => {
    await expect(getWritingInputDraft(env, { ...student, id: 'other' }, 'assignment', 1)).rejects.toMatchObject({ status: 403 });
    mocks.organization.mockResolvedValue({ organizationId: 'other-org' });
    await expect(getWritingInputDraft(env, teacher, 'assignment', 1)).rejects.toMatchObject({ status: 403 });
    await expect(getWritingAiBudget(env, student, '2026-10')).rejects.toMatchObject({ status: 403 });
    await expect(getWritingAiBudget(env, teacher, '2026-10')).rejects.toMatchObject({ status: 403 });
  });
  it.each(['UNASSESSED', 'DRAFT', 'READY'])('never classifies %s GPT suggestions as real grades', status => {
    expect(classifyWritingEvaluation({ provenance: { mode: 'live', provider: 'OPENAI' } as any, status }, { mode: 'live', provider: 'OPENAI' } as any)).toBe('unverified');
  });
  it('rejects unknown caller-supplied approval/grade fields and stale input revisions', async () => {
    expect(() => parseInputDraft({ ...input(), approved: true })).toThrow();
    await saveWritingInputDraft(env, student, parseInputDraft(input())); approve();
    await expect(generateWritingAiDraft(env, teacher, request({ inputDraftRevision: 2 }))).rejects.toMatchObject({ status: 409 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
