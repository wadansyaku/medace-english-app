import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as auth from '../functions/_shared/auth';
import { commitGuestLearningImport, guestLearningRoutes, readGuestLearningCatalog, readGuestLearningSummary, validateGuestLearningImport } from '../functions/_shared/api-routes/guest-learning';
import { GUEST_LEARNING_TTL_MS, GUEST_LEARNING_VERSION, guestLearningImportAttempts, type GuestLearningProgress } from '../shared/guestLearning';
import { NARU_BOOK_ID } from '../shared/naruBook';
import { UserRole } from '../types';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { databases.splice(0).forEach(({ sqlite }) => sqlite.close()); vi.restoreAllMocks(); });
const setup = () => {
  const fixture = createSqliteD1(); databases.push(fixture);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) fixture.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  fixture.sqlite.exec(`INSERT INTO users(id,email,display_name,role,stats_xp,stats_level,created_at,updated_at) VALUES
    ('student-1','one@example.test','One','STUDENT',47,2,1,1),('student-2','two@example.test','Two','STUDENT',0,1,1,1);
    INSERT INTO books(id,title,word_count,is_priority,catalog_source,access_scope,created_at,updated_at) VALUES
    ('${NARU_BOOK_ID}','Naruシスト',3,1,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1),
    ('private-book','Private',1,1,'USER_GENERATED','ALL_PLANS',1,1);
    INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,
      source_file,extracted_at,transform_log,content_qa_report,qa_word_count,qa_source_coverage_rate,created_at,updated_at)
    VALUES ('naru-source','${NARU_BOOK_ID}','STEADY_STUDY_ORIGINAL','Naruシスト','v1','approved','approved','source','date','log','private/path',3,1,1,1);`);
  const insert = fixture.sqlite.prepare(`INSERT INTO words(id,book_id,word_number,word,definition,search_key,source_sheet,source_entry_id,example_sentence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,1)`);
  for (let index = 1; index <= 3; index++) insert.run(`naru-word-${index}`, NARU_BOOK_ID, index, `word${index}`, `意味${index}`, `word${index}`, 'verb', index, 'Source example.');
  fixture.sqlite.exec(`INSERT INTO catalog_workbook_sources(id,series_key,source_file,sha256,archive_json,created_at)
    VALUES('naru-workbook','naru','synthetic.xlsx','synthetic-hash','[]',1);`);
  for (let index = 1; index <= 3; index++) {
    fixture.sqlite.prepare(`INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready)
      VALUES(?,'naru-workbook',?,'synthetic-hash','{}',1)`).run(`entry-${index}`, `source-key-${index}`);
    fixture.sqlite.prepare(`INSERT INTO catalog_word_source_links(source_entry_id,word_id,match_kind)
      VALUES(?,?,'snapshot_import')`).run(`entry-${index}`, `naru-word-${index}`);
  }
  insert.run('private-word', 'private-book', 1, 'private', 'private meaning', 'private', 'sheet', 1, null);
  return { ...fixture, env: { DB: fixture.DB } as AppEnv,
    user: (id = 'student-1') => fixture.sqlite.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as DbUserRow,
    count: (table: string) => fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count };
};
const candidate = () => ({ expectedUserId: 'student-1', sessionId: '11111111-1111-4111-8111-111111111111', version: GUEST_LEARNING_VERSION,
  attempts: [1, 2, 3].map((i) => ({ attemptId: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`, wordId: `naru-word-${i}`, rating: 2 as const, responseTimeMs: 1200, answeredAt: Date.now() - 1000 + i })) });

describe('fixed anonymous Naru catalogue', () => {
  it('returns only canonical Naru words with no private ledger paths and approved source examples', async () => {
    const f = setup(); const result = await readGuestLearningCatalog(f.env);
    expect(result.book).toMatchObject({ id: NARU_BOOK_ID, wordCount: 3 });
    expect(result.serverTimeMs).toBeGreaterThan(0);
    expect(Math.abs(result.serverTimeMs - Date.now())).toBeLessThan(1000);
    expect(result.book).not.toHaveProperty('qualityGate'); expect(result.book).not.toHaveProperty('sourceContext');
    expect(result.words.map(({ id }) => id)).toEqual(['naru-word-1', 'naru-word-2', 'naru-word-3']);
    expect(result.words[0].exampleSentence).toBe('Source example.');
  });
  it('accepts authoritative ready provenance even without the legacy numeric source entry column', async () => {
    const f = setup(); f.sqlite.exec(`UPDATE words SET source_entry_id=NULL WHERE id='naru-word-1';
      UPDATE material_source_ledger SET qa_source_coverage_rate=0.6092`);
    expect((await readGuestLearningCatalog(f.env)).words).toHaveLength(3);
    expect((await commitGuestLearningImport(f.env, f.user(), candidate())).importedAttemptIds).toHaveLength(3);
  });
  it.each(["UPDATE books SET catalog_source='LICENSED_PARTNER'", "UPDATE books SET access_scope='BUSINESS_ONLY'", "UPDATE books SET created_by='student-1'",
    "UPDATE material_source_ledger SET rights_status='pending'", "UPDATE material_source_ledger SET review_status='blocked'", "UPDATE material_source_ledger SET catalog_source='LICENSED_PARTNER'", "DELETE FROM material_source_ledger",
    'UPDATE material_source_ledger SET qa_required_blank_rows=1', 'UPDATE material_source_ledger SET qa_word_count=2',
    "UPDATE words SET definition='' WHERE id='naru-word-1'", "UPDATE words SET source_sheet=NULL WHERE id='naru-word-1'",
    "UPDATE catalog_source_entries SET ready=0 WHERE id='entry-1'", "DELETE FROM catalog_word_source_links WHERE word_id='naru-word-1'",
    "DELETE FROM catalog_word_source_links WHERE word_id='naru-word-1'; DELETE FROM words WHERE id='naru-word-1'"])
  ('fails closed when current readiness or rights change: %s', async (sql) => {
    const f = setup(); f.sqlite.exec(sql); await expect(readGuestLearningCatalog(f.env)).rejects.toMatchObject({ status: 503 });
    await expect(commitGuestLearningImport(f.env, f.user(), candidate())).rejects.toMatchObject({ status: 503 }); expect(f.count('guest_learning_claims')).toBe(0);
  });
  it('hides unaudited generated examples and every authenticated image URL', async () => {
    const f = setup(); f.sqlite.exec(`UPDATE words SET example_generated_at=10, example_audit_status='PENDING',
      example_image_key='private-key', example_image_generated_at=10, example_image_audit_status='PENDING' WHERE id='naru-word-1'`);
    const result = await readGuestLearningCatalog(f.env);
    expect(result.words[0]).toMatchObject({ exampleSentence: null, exampleMeaning: null, exampleImageUrl: null });
    f.sqlite.exec(`UPDATE words SET example_audit_status='APPROVED', example_audited_at=11 WHERE id='naru-word-1'`);
    expect((await readGuestLearningCatalog(f.env)).words[0].exampleSentence).toBe('Source example.');
  });
  it('supports anonymous reads and rejects every caller-selected query', async () => {
    const f = setup(); const route = guestLearningRoutes[0];
    const result = await route.handle({ env: f.env, pathname: 'guest-learning/naru', request: new Request('https://app.test/api/guest-learning/naru') });
    expect(result.response.status).toBe(200); expect(result.response.headers.get('Cache-Control')).toBe('no-store');
    await expect(route.handle({ env: f.env, pathname: 'guest-learning/naru', request: new Request('https://app.test/api/guest-learning/naru?bookId=private-book') })).rejects.toMatchObject({ status: 400 });
  });
});

describe('authenticated guest SRS import', () => {
  it('commits real histories/events once on concurrent immutable retries without granting XP', async () => {
    const f = setup(); const input = candidate(); const before = f.user();
    const first = await commitGuestLearningImport(f.env, before, input);
    const receipts = await Promise.all(Array.from({ length: 3 }, () => commitGuestLearningImport(f.env, before, input)));
    receipts.forEach((receipt) => expect(receipt).toEqual(first));
    expect(first.importedAttemptIds).toEqual(input.attempts.map(({ attemptId }) => attemptId)); expect(first.failedAttempts).toEqual([]);
    for (const table of ['guest_learning_attempts', 'learning_histories', 'learning_interaction_events', 'study_attempt_receipts']) expect(f.count(table)).toBe(3);
    expect(f.user()).toEqual(before); expect(f.count('guest_trial_claims')).toBe(0); expect(f.count('guest_trial_answers')).toBe(0);
    expect(f.sqlite.prepare('SELECT sum(attempt_count) AS n FROM learning_histories').get()?.n).toBe(3);
  });
  it('rejects account switching and canonical private word injection before a claim exists', async () => {
    const f = setup(); const input = candidate();
    await expect(commitGuestLearningImport(f.env, f.user('student-2'), input)).rejects.toMatchObject({ status: 409 });
    await expect(commitGuestLearningImport(f.env, f.user(), { ...input, attempts: [{ ...input.attempts[0], wordId: 'private-word' }] })).rejects.toMatchObject({ status: 400 });
    expect(f.count('guest_learning_claims')).toBe(0);
  });
  it('atomically binds a session to one account and conceals its summary from another', async () => {
    const f = setup(); const input = candidate(); await commitGuestLearningImport(f.env, f.user(), input);
    await expect(commitGuestLearningImport(f.env, f.user('student-2'), { ...input, expectedUserId: 'student-2' })).rejects.toMatchObject({ status: 409 });
    expect(await readGuestLearningSummary(f.env, f.user('student-2'), input.sessionId)).toBeNull();
    expect(f.count('study_attempt_receipts')).toBe(3);
  });
  it('permits only one account to win concurrent first claims', async () => {
    const f = setup(); const input = candidate();
    const result = await Promise.allSettled([
      commitGuestLearningImport(f.env, f.user(), input),
      commitGuestLearningImport(f.env, f.user('student-2'), { ...input, expectedUserId: 'student-2' }),
    ]);
    expect(result.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(f.count('guest_learning_claims')).toBe(1); expect(f.count('study_attempt_receipts')).toBe(3);
  });
  it('acknowledges only submitted batch IDs while an own summary lists the full session', async () => {
    const f = setup(); const input = candidate();
    await commitGuestLearningImport(f.env, f.user(), { ...input, attempts: input.attempts.slice(0, 2) });
    const last = await commitGuestLearningImport(f.env, f.user(), { ...input, attempts: input.attempts.slice(2) });
    expect(last.importedAttemptIds).toEqual([input.attempts[2].attemptId]); expect(last.failedAttempts).toEqual([]);
    expect((await readGuestLearningSummary(f.env, f.user(), input.sessionId))?.importedAttemptIds).toHaveLength(3);
  });
  it('rejects session capacity overflow atomically while retaining earlier receipts', async () => {
    const f = setup(); const input = candidate();
    await commitGuestLearningImport(f.env, f.user(), { ...input, attempts: input.attempts.slice(0, 1) });
    f.sqlite.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<4999)
      INSERT INTO guest_learning_attempts(session_id,attempt_id,word_id,rating,response_time_ms,answered_at,client_attempt_id)
      SELECT ?, 'seed-'||i, 'naru-word-1', 2, 0, 1, 'seed-client-'||i FROM n`).run(input.sessionId);
    await expect(commitGuestLearningImport(f.env, f.user(), { ...input, attempts: input.attempts.slice(1, 2) })).rejects.toMatchObject({ status: 409 });
    expect(f.count('guest_learning_attempts')).toBe(5000); expect(f.count('study_attempt_receipts')).toBe(1);
  });
  it('does not acknowledge a namespaced receipt whose stored answer differs', async () => {
    const f = setup(); const input = candidate(); const attempt = input.attempts[0];
    f.sqlite.prepare(`INSERT INTO study_attempt_receipts(user_id,client_attempt_id,request_fingerprint,commit_token,word_id,book_id,existing_was_study,created_at)
      VALUES(?,?,?,?,?,?,0,1)`).run(f.user().id, `guest_naru_${input.sessionId}_${attempt.attemptId}`, 'different-answer', 'spoof', attempt.wordId, NARU_BOOK_ID);
    const result = await commitGuestLearningImport(f.env, f.user(), { ...input, attempts: [attempt] });
    expect(result.importedAttemptIds).toEqual([]); expect(result.failedAttempts).toEqual([{ attemptId: attempt.attemptId, retryable: false }]);
    expect(f.count('learning_histories')).toBe(0);
  });
  it.each([{ rating: 3 }, { answeredAt: Date.now() - 500 }, { wordId: 'naru-word-2' }, { responseTimeMs: 1201 }])
  ('rolls back new attempts when an existing attempt changes: %s', async (change) => {
    const f = setup(); const input = candidate(); await commitGuestLearningImport(f.env, f.user(), { ...input, attempts: input.attempts.slice(0, 1) });
    await expect(commitGuestLearningImport(f.env, f.user(), { ...input, attempts: [input.attempts[1], { ...input.attempts[0], ...change }] })).rejects.toMatchObject({ status: 409 });
    expect(f.count('guest_learning_attempts')).toBe(1); expect(f.count('study_attempt_receipts')).toBe(1);
  });
  it('returns partial success and recovers the remaining answers without a double count', async () => {
    const f = setup(); const input = candidate(); let commits = 0;
    f.beforeRun((sql) => { if (sql.includes('INSERT INTO study_attempt_receipts') && ++commits === 2) throw new Error('temporary offline'); });
    const partial = await commitGuestLearningImport(f.env, f.user(), input);
    expect(partial.importedAttemptIds).toEqual([input.attempts[0].attemptId]);
    expect(partial.failedAttempts).toEqual(input.attempts.slice(1).map(({ attemptId }) => ({ attemptId, retryable: true })));
    f.beforeRun(undefined);
    const recovered = await commitGuestLearningImport(f.env, f.user(), input);
    expect(recovered.importedAttemptIds).toHaveLength(3); expect(f.count('learning_interaction_events')).toBe(3);
  });
  it('recovers a committed import after summary-response loss', async () => {
    const f = setup(); const input = candidate(); const prepare = f.DB.prepare.bind(f.DB);
    vi.spyOn(f.DB, 'prepare').mockImplementation((sql) => { if (sql.includes('SELECT session_id AS sessionId')) throw new Error('lost response'); return prepare(sql); });
    await expect(commitGuestLearningImport(f.env, f.user(), input)).rejects.toThrow('lost response');
    vi.restoreAllMocks(); expect((await readGuestLearningSummary(f.env, f.user(), input.sessionId))?.importedAttemptIds).toHaveLength(3);
    expect((await commitGuestLearningImport(f.env, f.user(), input)).failedAttempts).toEqual([]); expect(f.count('learning_interaction_events')).toBe(3);
  });
  it('preserves stored summaries after device TTL expires', async () => {
    const f = setup(); const input = candidate(); await commitGuestLearningImport(f.env, f.user(), input);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * GUEST_LEARNING_TTL_MS);
    expect((await readGuestLearningSummary(f.env, f.user(), input.sessionId))?.importedAttemptIds).toHaveLength(3);
    await expect(commitGuestLearningImport(f.env, f.user(), input)).rejects.toMatchObject({ status: 400 });
  });
  it.each([{ role: UserRole.INSTRUCTOR }, { email: 'demo_student_123@medace.app' }])('rejects another account kind: %s', async (change) => {
    const f = setup(); await expect(commitGuestLearningImport(f.env, { ...f.user(), ...change }, candidate())).rejects.toMatchObject({ status: 403 }); expect(f.count('guest_learning_claims')).toBe(0);
  });
});

describe('guest learning input boundaries', () => {
  it.each([120_000, 2 * 86400_000, -2 * 86400_000])('keeps server TTL and future guards unchanged after correcting device clock: %s', skew => {
    const now = Date.now(); const input = candidate();
    const progress: GuestLearningProgress = { sessionId: input.sessionId, version: GUEST_LEARNING_VERSION,
      startedAt: now + skew, serverTimeOffsetMs: -skew, attempts: [], importedAttemptIds: [] };
    const project = (age: number) => guestLearningImportAttempts(progress, [{ ...input.attempts[0], answeredAt: now + skew - age }]);
    expect(validateGuestLearningImport({ ...input, attempts: project(1000) }, now).attempts[0].answeredAt).toBe(now - 1000);
    expect(validateGuestLearningImport({ ...input, attempts: project(GUEST_LEARNING_TTL_MS) }, now).attempts).toHaveLength(1);
    expect(() => validateGuestLearningImport({ ...input, attempts: project(GUEST_LEARNING_TTL_MS + 1) }, now)).toThrow();
    expect(() => validateGuestLearningImport({ ...input, attempts: project(-60_001) }, now)).toThrow();
  });
  it.each([null, {}, { ...candidate(), email: 'user@test' }, { ...candidate(), version: 'other' }, { ...candidate(), attempts: [] },
    { ...candidate(), attempts: Array(101).fill(candidate().attempts[0]) }, { ...candidate(), sessionId: 'bad-id' }])('rejects malformed top-level input: %s', (input) => expect(() => validateGuestLearningImport(input)).toThrow());
  it.each([{ rating: -1 }, { rating: 4 }, { rating: 1.5 }, { responseTimeMs: 1.5 }, { responseTimeMs: 3600001 }, { attemptId: 'bad-id' }, { correct: true }, { wordId: 'bad id' },
    { answeredAt: Date.now() - GUEST_LEARNING_TTL_MS - 1000 }, { answeredAt: Date.now() + 120000 }])('rejects malformed attempt: %s', (change) => {
    const input = candidate(); expect(() => validateGuestLearningImport({ ...input, attempts: [{ ...input.attempts[0], ...change }] })).toThrow();
  });
  it('rejects duplicate attempt IDs while allowing repeated learning of the same word', () => {
    const input = candidate(); expect(() => validateGuestLearningImport({ ...input, attempts: [input.attempts[0], input.attempts[0]] })).toThrow();
    expect(validateGuestLearningImport({ ...input, attempts: [input.attempts[0], { ...input.attempts[1], wordId: input.attempts[0].wordId }] }).attempts).toHaveLength(2);
  });
  it('rejects cross-origin writes, anonymous imports, oversized bodies, and owner query injection', async () => {
    const f = setup(); const route = guestLearningRoutes[1]; const context = { env: f.env, pathname: 'guest-learning/import' };
    await expect(route.handle({ ...context, request: new Request('https://app.test/api/guest-learning/import', { method: 'POST', headers: { Origin: 'https://attacker.test' } }) })).rejects.toMatchObject({ status: 403 });
    await expect(route.handle({ ...context, request: new Request('https://app.test/api/guest-learning/import', { method: 'POST', headers: { Origin: 'https://app.test' } }) })).rejects.toMatchObject({ status: 401 });
    vi.spyOn(auth, 'requireUser').mockResolvedValue(f.user());
    await expect(route.handle({ ...context, request: new Request('https://app.test/api/guest-learning/import', { method: 'POST', headers: { Origin: 'https://app.test' }, body: ' '.repeat(32769) }) })).rejects.toMatchObject({ status: 413 });
    await expect(guestLearningRoutes[2].handle({ env: f.env, pathname: 'guest-learning/summary', request: new Request(`https://app.test/api/guest-learning/summary?sessionId=${candidate().sessionId}&userId=student-2`) })).rejects.toMatchObject({ status: 400 });
  });
});
