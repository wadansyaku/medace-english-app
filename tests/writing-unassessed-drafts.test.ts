import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqliteD1 } from './helpers/sqlite-d1';
import type { AppEnv, DbUserRow, D1Database, D1PreparedStatement } from '../functions/_shared/types';
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
  fixture.sqlite.exec(readFileSync('migrations/0053_writing_draft_actor_retention.sql', 'utf8'));
  fixture.sqlite.exec(readFileSync('migrations/0054_writing_ai_draft_recovery.sql', 'utf8'));
  env = { DB: fixture.DB };
  mocks.organization.mockImplementation(async (_env, uid) => uid === 'teacher' ? { organizationId: 'org' } : null);
  mocks.visible.mockImplementation(async (_env, user) => new Set([user.role === 'STUDENT' ? user.id : 'student']));
  mocks.execute.mockReset(); mocks.execute.mockResolvedValue(generated());
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External network is forbidden in this test'); }));
});
afterEach(() => { fixture.sqlite.close(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// Preserve the genuine SQLite transaction, then lose its acknowledgement. This
// exercises persisted state after failure rather than a mock SQL implementation.
const loseDatabaseAckOnce = (matches: (sql: string) => boolean) => {
  const original = env.DB;
  const records = new WeakMap<D1PreparedStatement, { sql: string; original: D1PreparedStatement }>();
  let armed = true;
  const lose = (sqls: string[]) => { if (armed && sqls.some(matches)) { armed = false; throw new Error('Synthetic lost database acknowledgement'); } };
  const wrapped: D1Database = {
    prepare(sql) {
      const delegate = original.prepare(sql);
      const statement: D1PreparedStatement = {
        bind(...values) { delegate.bind(...values); return statement; },
        first: <T>() => delegate.first<T>(), all: <T>() => delegate.all<T>(),
        async run() { const result = await delegate.run(); lose([sql]); return result; },
      };
      records.set(statement, { sql, original: delegate });
      return statement;
    },
    async batch(statements) {
      const batch = statements.map(statement => records.get(statement)!);
      const result = await original.batch(batch.map(record => record.original));
      lose(batch.map(record => record.sql));
      return result;
    },
  };
  env.DB = wrapped;
};
const failDatabaseWriteOnce = (matches: (sql: string) => boolean) => {
  let armed = true;
  fixture.beforeRun(sql => { if (armed && matches(sql)) { armed = false; throw new Error('Synthetic database failure'); } });
};
const execution = () => fixture.sqlite.prepare('SELECT * FROM writing_ai_draft_execution WHERE request_id=?').get(request().requestId)!;
const reservation = () => fixture.sqlite.prepare('SELECT * FROM ai_provider_budget_reservations').get()!;
const expireLease = () => fixture.sqlite.prepare('UPDATE writing_ai_draft_execution SET lease_expires_at=0').run();
const prepareApprovedInput = async () => { await saveWritingInputDraft(env, student, parseInputDraft(input())); approve(); };
const settledWrites = (sql: string) => sql.includes("SET state = 'SETTLED'");
const reserveWrites = (sql: string) => sql.includes('INSERT INTO ai_provider_budget_reservations');
const finalWrites = (sql: string) => sql.includes('UPDATE writing_ai_drafts SET status');
const checkpointWrites = (sql: string) => sql.includes("SET phase='RESPONSE_STORED'");
const pauseDatabaseWriteOnce = (matches: (sql: string) => boolean, kind: 'run' | 'first' = 'run') => {
  const original = env.DB; let armed = true;
  let release!: () => void; let reached!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const paused = new Promise<void>(resolve => { reached = resolve; });
  env.DB = { ...original, prepare(sql) {
    const statement = original.prepare(sql); const run = statement.run.bind(statement);
    const first: D1PreparedStatement['first'] = statement.first.bind(statement);
    const wait = async () => {
      if (armed && matches(sql)) { armed = false; reached(); await blocked; }
    };
    if (kind === 'run') statement.run = async () => { await wait(); return run(); };
    else statement.first = async <T>() => { await wait(); return first<T>(); };
    return statement;
  } };
  return { paused, release };
};

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
  it('recovers uploaded originals that never reached draft saving while preserving pending upload reservations', async () => {
    fixture.sqlite.prepare("INSERT INTO writing_submission_assets(id,assignment_id,attempt_no,uploaded_at,file_name,mime_type,byte_size,r2_key) VALUES('pending','assignment',1,NULL,'pending.png','image/png',0,'pending-key')").run();
    const staged = await saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'prepare-new-file', prepareUpload: true, manualTranscript: '', assetIds: [] })));
    expect(staged.draft).toMatchObject({ revision: 1, manualTranscript: '', assets: [] });
    expect(fixture.sqlite.prepare("SELECT draft_retired_at FROM writing_submission_assets WHERE id='asset'").get()?.draft_retired_at).toBeGreaterThan(0);
    expect(fixture.sqlite.prepare("SELECT draft_retired_at FROM writing_submission_assets WHERE id='pending'").get()?.draft_retired_at).toBeNull();
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_submission_assets').get()?.n).toBe(2);
    expect(await saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'prepare-new-file', prepareUpload: true, manualTranscript: '', assetIds: [] })))).toEqual(staged);
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

describe('durable Writing dispatch recovery without duplicate provider spending', () => {
  it('rolls back the draft and canonical claim when the execution checkpoint cannot be committed', async () => {
    await prepareApprovedInput();
    failDatabaseWriteOnce(sql => sql.includes('INSERT INTO writing_ai_draft_execution'));
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow('Synthetic database failure');
    for (const table of ['writing_ai_drafts', 'writing_ai_draft_canonical_claims', 'writing_ai_draft_execution', 'ai_provider_budget_reservations']) {
      expect(fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n).toBe(0);
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('recovers a lost atomic claim acknowledgement only through its durable pre-send checkpoint', async () => {
    await prepareApprovedInput();
    loseDatabaseAckOnce(sql => sql.includes('INSERT INTO writing_ai_draft_execution'));
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow('lost database acknowledgement');
    expect(execution().phase).toBe('PREPARING'); expect(mocks.execute).not.toHaveBeenCalled();
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'PENDING', recoveryAction: 'RESEND_SAME_REQUEST' });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'PENDING' });
    expireLease();
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it.each(['before', 'after'] as const)('safely resumes a reservation %s-commit failure without changing its identity or nonce', async timing => {
    await prepareApprovedInput();
    (timing === 'before' ? failDatabaseWriteOnce : loseDatabaseAckOnce)(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    const checkpoint = execution();
    const oldReservation = timing === 'after' ? reservation() : null;
    expect(checkpoint.phase).toBe('PREPARING'); expect(mocks.execute).not.toHaveBeenCalled();
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ recoveryAction: 'RESEND_SAME_REQUEST' });
    expireLease();
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY', inputDraftRevision: 1, recoveryAction: 'NONE' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const saved = reservation();
    expect(saved.fingerprint).toBe(checkpoint.content_fingerprint);
    expect(saved.month_key).toBe(checkpoint.reservation_month);
    if (oldReservation) expect(saved.reserve_token).toBe(oldReservation.reserve_token);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_provider_budget_reservations').get()?.n).toBe(1);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_provider_usage_audit WHERE outcome='RESERVED'").get()?.n).toBe(1);
  });
  it('never retries a dispatch fence whose committed acknowledgement was lost, even with a new request ID', async () => {
    await prepareApprovedInput();
    loseDatabaseAckOnce(sql => sql.includes("SET phase='DISPATCHING'"));
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    expect(execution().phase).toBe('DISPATCHING'); expect(mocks.execute).not.toHaveBeenCalled();
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'PENDING', recoveryAction: 'CHECK_RESULT' });
    expireLease();
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'UNASSESSED', reason: 'RESULT_UNAVAILABLE', recoveryAction: 'NONE' });
    expect(await generateWritingAiDraft(env, teacher, request({ requestId: 'new-after-uncertain-dispatch' }))).toMatchObject({ requestId: request().requestId, status: 'UNASSESSED' });
    expect(reservation().state).toBe('RESERVED'); expect(reservation().charged_micro_usd).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('can safely resume a dispatch fence failure that did not commit', async () => {
    await prepareApprovedInput(); failDatabaseWriteOnce(sql => sql.includes("SET phase='DISPATCHING'"));
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    expect(execution().phase).toBe('PREPARING'); expect(reservation().state).toBe('RESERVED');
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ recoveryAction: 'RESEND_SAME_REQUEST' });
    expireLease();
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it.each(['before', 'after'] as const)('repairs a settlement %s-commit failure from the stored response using GET only', async timing => {
    await prepareApprovedInput();
    (timing === 'before' ? failDatabaseWriteOnce : loseDatabaseAckOnce)(settledWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    expect(execution().phase).toBe('RESPONSE_STORED'); expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'READY', assessmentStatus: 'UNASSESSED' });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY' });
    expect(reservation()).toMatchObject({ state: 'SETTLED', charged_micro_usd: 20 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_provider_usage_audit WHERE outcome='COMPLETED'").get()?.n).toBe(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['before', 'after'] as const)('recovers a final draft update %s-commit failure without generating another draft', async timing => {
    await prepareApprovedInput();
    (timing === 'before' ? failDatabaseWriteOnce : loseDatabaseAckOnce)(finalWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    expect(reservation().state).toBe('SETTLED');
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'READY', result: { correctedDraft: 'Synthetic corrected draft.' } });
    expect(execution().phase).toBe('FINISHED'); expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('holds the entire quote and reports unavailable result when the provider response cannot be stored', async () => {
    await prepareApprovedInput(); failDatabaseWriteOnce(checkpointWrites);
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: 'RESULT_UNAVAILABLE' });
    expect(reservation()).toMatchObject({ state: 'RESERVED', charged_micro_usd: null });
    const snapshot = (await getWritingAiBudget(env, admin, new Date().toISOString().slice(0, 7))).snapshot;
    expect(snapshot.accountedMicroUsd).toBe(reservation().upper_bound_micro_usd);
    expect(await generateWritingAiDraft(env, teacher, request({ requestId: 'new-after-response-loss' }))).toMatchObject({ status: 'UNASSESSED', requestId: request().requestId });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fixture.sqlite.prepare('SELECT result_json FROM writing_ai_drafts').get()?.result_json).toBeNull();
  });
  it('recovers a response checkpoint whose committed acknowledgement was lost', async () => {
    await prepareApprovedInput(); loseDatabaseAckOnce(checkpointWrites);
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY' });
    expect(reservation()).toMatchObject({ state: 'SETTLED', charged_micro_usd: 20 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('does not let late provider completion overwrite expired uncertain dispatch recovery', async () => {
    await prepareApprovedInput();
    let complete!: (value: ReturnType<typeof generated>) => void;
    let started!: () => void;
    const providerStarted = new Promise<void>(resolve => { started = resolve; });
    mocks.execute.mockImplementationOnce(() => { started(); return new Promise(resolve => { complete = resolve; }); });
    const pending = generateWritingAiDraft(env, teacher, request());
    await providerStarted; expireLease();
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'UNASSESSED', reason: 'RESULT_UNAVAILABLE' });
    complete(generated());
    expect(await pending).toMatchObject({ status: 'UNASSESSED', reason: 'RESULT_UNAVAILABLE' });
    expect(reservation()).toMatchObject({ state: 'SETTLED', charged_micro_usd: 20 }); expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_provider_usage_audit WHERE outcome='COMPLETED'").get()?.n).toBe(1);
    expect(fixture.sqlite.prepare('SELECT result_json FROM writing_ai_drafts').get()?.result_json).toBeNull();
  });
  it('renews the dispatch lease after slow preparation so an ordinary provider response is not timed out early', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    await prepareApprovedInput();
    // Pause the pre-fence read, advance while the preparation lease still lives,
    // then ensure the lease is a full minute from dispatch rather than claim.
    const fenceGate = pauseDatabaseWriteOnce(sql => sql.includes('SELECT 1 FROM ai_provider_usage_audit'), 'first');
    const pending = generateWritingAiDraft(env, teacher, request()); await fenceGate.paused;
    vi.setSystemTime(new Date('2026-10-15T10:00:59Z'));
    fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET expires_at=?').run(Date.now() + 60000);
    mocks.execute.mockImplementationOnce(async () => {
      expect(execution().lease_expires_at).toBe(new Date('2026-10-15T10:01:59Z').getTime());
      vi.setSystemTime(new Date('2026-10-15T10:01:10Z'));
      expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'PENDING', recoveryAction: 'CHECK_RESULT' });
      return generated();
    });
    fenceGate.release();
    expect(await pending).toMatchObject({ status: 'READY' }); expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it.each(['before', 'after'] as const)('recovers late known usage after %s-commit settlement failure while keeping terminal output unavailable', async timing => {
    await prepareApprovedInput();
    let complete!: (value: ReturnType<typeof generated>) => void; let started!: () => void;
    const providerStarted = new Promise<void>(resolve => { started = resolve; });
    mocks.execute.mockImplementationOnce(() => { started(); return new Promise(resolve => { complete = resolve; }); });
    const pending = generateWritingAiDraft(env, teacher, request()); await providerStarted; expireLease();
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'UNASSESSED', reason: 'RESULT_UNAVAILABLE' });
    (timing === 'before' ? failDatabaseWriteOnce : loseDatabaseAckOnce)(settledWrites);
    complete(generated()); await expect(pending).rejects.toThrow();
    expect(execution().phase).toBe('RESPONSE_STORED');
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'UNASSESSED', reason: 'RESULT_UNAVAILABLE' });
    expect(await generateWritingAiDraft(env, teacher, request({ requestId: 'retry-after-late-usage' }))).toMatchObject({ requestId: request().requestId, status: 'UNASSESSED' });
    expect(reservation()).toMatchObject({ state: 'SETTLED', charged_micro_usd: 20 });
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_provider_usage_audit WHERE outcome='COMPLETED'").get()?.n).toBe(1);
    expect(execution().phase).toBe('FINISHED'); expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fixture.sqlite.prepare('SELECT result_json FROM writing_ai_drafts').get()?.result_json).toBeNull();
  });
  it.each(['known', 'timeout'] as const)('converges if a provider %s response races an unknown-outcome audit', async outcome => {
    await prepareApprovedInput();
    let complete!: (value: unknown) => void; let started!: () => void;
    const providerStarted = new Promise<void>(resolve => { started = resolve; });
    mocks.execute.mockImplementationOnce(() => { started(); return new Promise(resolve => { complete = resolve; }); });
    const pending = generateWritingAiDraft(env, teacher, request()); await providerStarted; expireLease();
    const gate = pauseDatabaseWriteOnce(sql => sql.includes('INSERT INTO ai_provider_usage_audit'));
    const checking = getWritingAiDraft(env, teacher, request().requestId); await gate.paused;
    complete(outcome === 'known' ? generated() : { status: 'UNASSESSED', reason: 'TIMEOUT', dispatched: true, retryAutomatically: false });
    expect(await pending).toMatchObject({ status: outcome === 'known' ? 'READY' : 'UNASSESSED' });
    gate.release();
    expect(await checking).toMatchObject({ status: outcome === 'known' ? 'READY' : 'UNASSESSED' });
    expect(reservation().state).toBe(outcome === 'known' ? 'SETTLED' : 'RESERVED');
    if (outcome === 'known') expect(reservation().charged_micro_usd).toBe(20);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('recovers a failed unknown-outcome audit with the same request without releasing its hold', async () => {
    await prepareApprovedInput();
    mocks.execute.mockResolvedValue({ status: 'UNASSESSED', reason: 'TIMEOUT', dispatched: true, retryAutomatically: false });
    failDatabaseWriteOnce(sql => sql.includes('INSERT INTO ai_provider_usage_audit'));
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    expect(execution().phase).toBe('RESPONSE_STORED');
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'UNASSESSED', reason: 'TIMEOUT' });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: 'TIMEOUT' });
    expect(reservation().state).toBe('RESERVED'); expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_provider_usage_audit WHERE outcome='TIMEOUT'").get()?.n).toBe(1);
  });
  it('canonicalizes a new request ID and another authorized teacher without dispatching twice, while rejecting same-ID actor changes', async () => {
    await prepareApprovedInput();
    const original = await generateWritingAiDraft(env, teacher, request());
    fixture.sqlite.prepare("INSERT INTO users VALUES('teacher-two','INSTRUCTOR','Synthetic other teacher')").run();
    mocks.organization.mockResolvedValue({ organizationId: 'org' });
    const otherTeacher = { ...teacher, id: 'teacher-two' };
    const otherRequest = request({ requestId: 'new-from-teacher-two' });
    expect(await generateWritingAiDraft(env, otherTeacher, otherRequest)).toEqual(original);
    expect(await getWritingAiDraft(env, otherTeacher, otherRequest.requestId)).toEqual(original);
    await expect(generateWritingAiDraft(env, otherTeacher, request())).rejects.toMatchObject({ status: 409 });
    await expect(generateWritingAiDraft(env, teacher, otherRequest)).rejects.toMatchObject({ status: 409 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_ai_drafts').get()?.n).toBe(1);
  });
  it('chooses only one dispatch owner when several expired pre-send retries race', async () => {
    await prepareApprovedInput(); failDatabaseWriteOnce(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow(); expireLease();
    const results = await Promise.all(['generate-one', 'other-racer-a', 'other-racer-b'].map(requestId => generateWritingAiDraft(env, teacher, request({ requestId }))));
    expect(results.some(result => result.status === 'READY')).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1); expect(reservation().state).toBe('SETTLED');
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_ai_drafts').get()?.n).toBe(1);
  });
  it('fences the original paused worker after another worker acquires its expired lease', async () => {
    await prepareApprovedInput();
    const gate = pauseDatabaseWriteOnce(sql => sql.includes("SET phase='DISPATCHING'"));
    const originalWorker = generateWritingAiDraft(env, teacher, request());
    await gate.paused;
    const nonce = execution().lease_token; expireLease();
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY' });
    expect(execution().lease_token).not.toBe(nonce);
    gate.release();
    expect(await originalWorker).toMatchObject({ status: 'READY' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_provider_budget_reservations').get()?.n).toBe(1);
  });
  it('allows a different authorized teacher to explicitly resume with its own alias request ID', async () => {
    await prepareApprovedInput(); failDatabaseWriteOnce(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow(); expireLease();
    fixture.sqlite.prepare("INSERT INTO users VALUES('teacher-two','INSTRUCTOR','Synthetic other teacher')").run();
    mocks.organization.mockResolvedValue({ organizationId: 'org' });
    const otherTeacher = { ...teacher, id: 'teacher-two' }; const alias = request({ requestId: 'resume-from-teacher-two' });
    expect(await generateWritingAiDraft(env, otherTeacher, alias)).toMatchObject({ requestId: request().requestId, status: 'READY' });
    expect(await generateWritingAiDraft(env, otherTeacher, alias)).toMatchObject({ status: 'READY' });
    expect(await getWritingAiDraft(env, otherTeacher, request().requestId)).toMatchObject({ status: 'READY' });
    await expect(generateWritingAiDraft(env, otherTeacher, request())).rejects.toMatchObject({ status: 409 });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('keeps the original reservation month and quote across a month boundary and refuses new dispatch', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T23:59:30Z'));
    await prepareApprovedInput(); loseDatabaseAckOnce(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    const before = { ...execution() }; const reserved = { ...reservation() };
    vi.setSystemTime(new Date('2026-11-01T00:00:31Z'));
    fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET expires_at=?').run(Date.now() + 60000);
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: 'RESERVATION_MONTH_EXPIRED' });
    expect(execution()).toMatchObject({ reservation_month: before.reservation_month, quote_json: before.quote_json, content_fingerprint: before.content_fingerprint });
    expect(reservation()).toEqual(reserved); expect(reservation().month_key).toBe('2026-10');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect((await getWritingAiBudget(env, admin, '2026-11')).snapshot.accountedMicroUsd).toBe(0);
  });
  it('settles a known stored response in its original month after the calendar changes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T23:59:30Z'));
    await prepareApprovedInput(); failDatabaseWriteOnce(settledWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow();
    vi.setSystemTime(new Date('2026-11-01T00:00:31Z'));
    expect(await getWritingAiDraft(env, teacher, request().requestId)).toMatchObject({ status: 'READY' });
    expect(reservation()).toMatchObject({ month_key: '2026-10', state: 'SETTLED', charged_micro_usd: 20 });
    expect((await getWritingAiBudget(env, admin, '2026-11')).snapshot.accountedMicroUsd).toBe(0);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('stops if the month changes while storage work awaits the dispatch fence', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
    await prepareApprovedInput();
    const gate = pauseDatabaseWriteOnce(sql => sql.includes("SET phase='DISPATCHING'"));
    const pending = generateWritingAiDraft(env, teacher, request()); await gate.paused;
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z')); gate.release();
    expect(await pending).toMatchObject({ status: 'UNASSESSED', reason: 'RESERVATION_MONTH_EXPIRED' });
    expect(reservation()).toMatchObject({ month_key: '2026-10', state: 'RESERVED' });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'expired', 'admin-role', 'admin-cleanup', 'feature', 'access'] as const)('rechecks %s after a delayed dispatch fence acknowledgement before sending', async changed => {
    await prepareApprovedInput();
    const gate = pauseDatabaseWriteOnce(sql => sql.includes("SET phase='DISPATCHING'"));
    const pending = generateWritingAiDraft(env, teacher, request()); await gate.paused;
    if (changed === 'revoked') fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET revoked_at=1').run();
    if (changed === 'expired') fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET expires_at=1').run();
    if (changed === 'admin-role') fixture.sqlite.prepare("UPDATE users SET role='STUDENT' WHERE id='admin'").run();
    if (changed === 'admin-cleanup') fixture.sqlite.prepare("DELETE FROM users WHERE id='admin'").run();
    if (changed === 'feature') env.OPENAI_WRITING_ENABLED = 'false';
    if (changed === 'access') mocks.organization.mockResolvedValue({ organizationId: 'wrong-org' });
    gate.release();
    expect(await pending).toMatchObject({ status: 'UNASSESSED', reason: changed === 'access' ? 'ACCESS_CHANGED' : 'DATA_APPROVAL_REQUIRED' });
    expect(reservation().state).toBe('RESERVED'); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('retains the canonical fingerprint after its original actor expires and lets an authorized teacher use a fresh alias', async () => {
    await prepareApprovedInput(); loseDatabaseAckOnce(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow(); expireLease();
    fixture.sqlite.prepare("INSERT INTO users VALUES('teacher-two','INSTRUCTOR','Synthetic other teacher')").run();
    fixture.sqlite.prepare("UPDATE writing_assignments SET instructor_user_id='teacher-two'").run();
    fixture.sqlite.prepare("DELETE FROM users WHERE id='teacher'").run();
    expect(fixture.sqlite.prepare('SELECT requested_by FROM writing_ai_drafts').get()?.requested_by).toBeNull();
    mocks.organization.mockResolvedValue({ organizationId: 'org' });
    const otherTeacher = { ...teacher, id: 'teacher-two' };
    await expect(generateWritingAiDraft(env, otherTeacher, request())).rejects.toMatchObject({ status: 409 });
    expect(await generateWritingAiDraft(env, otherTeacher, request({ requestId: 'after-actor-expired' }))).toMatchObject({ status: 'READY', requestId: request().requestId });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('observes blocked budget and revoked approval in the final pre-fetch eligibility read', async () => {
    await prepareApprovedInput();
    const gate = pauseDatabaseWriteOnce(sql => sql.includes('SELECT e.phase,e.lease_token'), 'first');
    const pending = generateWritingAiDraft(env, teacher, request()); await gate.paused;
    fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET revoked_at=1').run();
    fixture.sqlite.prepare('UPDATE ai_provider_budget_months SET blocked=1').run();
    gate.release();
    expect(await pending).toMatchObject({ status: 'UNASSESSED', reason: 'DATA_APPROVAL_REQUIRED' });
    expect(reservation().state).toBe('RESERVED'); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('does not send if a delayed fence acknowledgement leaves less than the provider timeout and checkpoint margin', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T10:00:00Z')); await prepareApprovedInput();
    const gate = pauseDatabaseWriteOnce(sql => sql.includes("SET phase='DISPATCHING'"));
    const pending = generateWritingAiDraft(env, teacher, request()); await gate.paused;
    vi.setSystemTime(new Date('2026-10-15T10:00:31Z')); gate.release();
    expect(await pending).toMatchObject({ status: 'UNASSESSED', reason: 'DISPATCH_WINDOW_EXPIRED' });
    expect(reservation().state).toBe('RESERVED'); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each(['invalid-usage', 'over-quote'] as const)('does not bypass a month blocked by another request when reusing an existing reservation (%s)', async outcome => {
    await prepareApprovedInput(); loseDatabaseAckOnce(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow(); expireLease();
    const before = { ...reservation() };
    const store = createD1AiBudgetStore(env.DB, { approvedPricingVersions: [OPENAI_WRITING_PRICING_VERSION] });
    const other = { requestId: 'other-operation', fingerprint: 'd'.repeat(64), monthKey: new Date().toISOString().slice(0, 7),
      upperBoundMicroUsd: 100, pricingVersion: OPENAI_WRITING_PRICING_VERSION, provider: 'OPENAI' as const, model: OPENAI_WRITING_MODEL, operation: 'OCR' as const };
    expect(await store.reserveWithMetadata(other)).toMatchObject({ reserved: true });
    if (outcome === 'invalid-usage') await store.recordUnknownOutcome({ requestId: other.requestId, fingerprint: other.fingerprint, eventId: 'other-unknown', reason: 'INVALID_USAGE' });
    else await store.settle({ requestId: other.requestId, fingerprint: other.fingerprint, chargedMicroUsd: 101 });
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: 'BUDGET_BLOCKED' });
    expect(fixture.sqlite.prepare('SELECT * FROM ai_provider_budget_reservations WHERE request_id=?').get(before.request_id)).toEqual(before);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('checks budget blocking atomically with the dispatch fence even if blocking arrives during its storage wait', async () => {
    await prepareApprovedInput();
    const gate = pauseDatabaseWriteOnce(sql => sql.includes("SET phase='DISPATCHING'"));
    const pending = generateWritingAiDraft(env, teacher, request()); await gate.paused;
    const originalReservation = { ...reservation() };
    const store = createD1AiBudgetStore(env.DB, { approvedPricingVersions: [OPENAI_WRITING_PRICING_VERSION] });
    expect(await store.reserveWithMetadata({ requestId: 'blocked-during-fence', fingerprint: 'e'.repeat(64), monthKey: new Date().toISOString().slice(0, 7),
      upperBoundMicroUsd: 100, pricingVersion: OPENAI_WRITING_PRICING_VERSION, provider: 'OPENAI', model: OPENAI_WRITING_MODEL, operation: 'OCR' })).toMatchObject({ reserved: true });
    await store.recordUnknownOutcome({ requestId: 'blocked-during-fence', fingerprint: 'e'.repeat(64), eventId: 'blocked-during-fence-audit', reason: 'INVALID_USAGE' });
    gate.release(); expect(await pending).toMatchObject({ status: 'UNASSESSED', reason: 'BUDGET_BLOCKED' });
    expect(fixture.sqlite.prepare('SELECT * FROM ai_provider_budget_reservations WHERE request_id=?').get(originalReservation.request_id)).toEqual(originalReservation);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each(['input', 'approval', 'feature', 'quote'] as const)('rechecks the %s boundary before resuming a persisted pre-send claim', async boundary => {
    await prepareApprovedInput(); loseDatabaseAckOnce(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow(); expireLease();
    const originalReservation = { ...reservation() };
    if (boundary === 'input') await saveWritingInputDraft(env, student, parseInputDraft(input({ requestId: 'new-input', expectedRevision: 1, manualTranscript: 'New synthetic revision.' })));
    if (boundary === 'approval') fixture.sqlite.prepare('UPDATE writing_ai_data_approvals SET revoked_at=1').run();
    if (boundary === 'feature') env.OPENAI_WRITING_ENABLED = 'false';
    if (boundary === 'quote') fixture.sqlite.prepare("UPDATE writing_ai_draft_execution SET quote_json='{}'").run();
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'UNASSESSED', reason: boundary === 'input' ? 'INPUT_CHANGED' : boundary === 'quote' ? 'QUOTE_OR_INPUT_CHANGED' : 'DATA_APPROVAL_REQUIRED' });
    expect(reservation()).toEqual(originalReservation); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('keeps unauthorized retry and recheck outside the canonical state and budget', async () => {
    await prepareApprovedInput(); failDatabaseWriteOnce(reserveWrites);
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toThrow(); expireLease();
    mocks.organization.mockResolvedValue({ organizationId: 'wrong-org' });
    await expect(generateWritingAiDraft(env, teacher, request())).rejects.toMatchObject({ status: 403 });
    await expect(getWritingAiDraft(env, teacher, request().requestId)).rejects.toMatchObject({ status: 403 });
    expect(execution().phase).toBe('PREPARING'); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('preserves legacy duplicates and READY output, chooses the available result, and never redispatches old PENDING claims', async () => {
    await prepareApprovedInput();
    fixture.sqlite.exec('DROP TABLE writing_ai_draft_request_aliases; DROP TABLE writing_ai_draft_canonical_claims; DROP TABLE writing_ai_draft_execution;');
    const insert = fixture.sqlite.prepare(`INSERT INTO writing_ai_drafts(request_id,assignment_id,attempt_no,input_revision,requested_by,fingerprint,operation,status,result_json,created_at,updated_at)
      VALUES(?,'assignment',1,1,'teacher',?,'WRITING_FEEDBACK',?,?,?,?)`);
    insert.run('legacy-pending-one', 'a'.repeat(64), 'PENDING', null, 1, 1);
    insert.run('legacy-pending-two', 'b'.repeat(64), 'PENDING', null, 2, 2);
    const stored = JSON.stringify({ operation: 'WRITING_FEEDBACK', correctedDraft: 'Existing reviewed draft.' });
    insert.run('legacy-ready', 'c'.repeat(64), 'READY', stored, 3, 3);
    fixture.sqlite.exec(readFileSync('migrations/0054_writing_ai_draft_recovery.sql', 'utf8'));
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_ai_drafts').get()?.n).toBe(3);
    expect(fixture.sqlite.prepare('SELECT request_id FROM writing_ai_draft_canonical_claims').get()?.request_id).toBe('legacy-ready');
    expect(await generateWritingAiDraft(env, teacher, request())).toMatchObject({ status: 'READY', requestId: 'legacy-ready', result: { correctedDraft: 'Existing reviewed draft.' } });
    for (const id of ['legacy-pending-one', 'legacy-pending-two']) {
      expect(await getWritingAiDraft(env, teacher, id)).toMatchObject({ status: 'UNASSESSED', reason: 'LEGACY_RESULT_UNAVAILABLE' });
    }
    expect(fixture.sqlite.prepare("SELECT result_json FROM writing_ai_drafts WHERE request_id='legacy-ready'").get()?.result_json).toBe(stored);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_ai_drafts').get()?.n).toBe(3);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
