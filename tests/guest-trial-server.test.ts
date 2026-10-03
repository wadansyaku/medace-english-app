import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as auth from '../functions/_shared/auth';
import { authProfileRoutes } from '../functions/_shared/api-routes/auth-profile';
import { commitGuestTrialImport, guestTrialRoutes, readGuestTrialSummary, validateGuestTrialImport } from '../functions/_shared/api-routes/guest-trial';
import { GUEST_TRIAL_QUESTIONS, GUEST_TRIAL_TTL_MS, GUEST_TRIAL_VERSION } from '../shared/guestTrial';
import { EnglishLevel, UserRole } from '../types';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { databases.splice(0).forEach(({ sqlite }) => sqlite.close()); vi.restoreAllMocks(); });
const setup = () => {
  const fixture = createSqliteD1(); databases.push(fixture);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) fixture.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  fixture.sqlite.exec(`INSERT INTO users(id,email,display_name,role,stats_xp,stats_level,created_at,updated_at) VALUES
    ('student-1','one@example.test','One','STUDENT',47,2,1,1),('student-2','two@example.test','Two','STUDENT',0,1,1,1);`);
  return { ...fixture, env: { DB: fixture.DB } as AppEnv,
    user: (id = 'student-1') => fixture.sqlite.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as DbUserRow,
    count: (table: string) => fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count,
  };
};
const input = () => ({ expectedUserId: 'student-1', trialId: 'trial-original-123', version: GUEST_TRIAL_VERSION, answers: GUEST_TRIAL_QUESTIONS.map((question, index) => ({
  attemptId: `attempt-original-${index}`, questionId: question.id,
  choiceIndex: index === 1 ? 0 : question.correctChoiceIndex, answeredAt: Date.now() - 1000,
})) });

describe('guest trial atomic authenticated import', () => {
  it('stores canonical original answers once on repeated and concurrent retries; never writes real learning or levels', async () => {
    const fixture = setup(); const candidate = input(); const before = fixture.user();
    const first = await commitGuestTrialImport(fixture.env, before, candidate);
    const repeats = await Promise.all(Array.from({ length: 5 }, () => commitGuestTrialImport(fixture.env, before, candidate)));
    repeats.forEach((receipt) => expect(receipt).toEqual(first));
    expect(first.summary).toMatchObject({ answerCount: 5, correctCount: 4, trialId: candidate.trialId, version: GUEST_TRIAL_VERSION });
    expect(first.summary.answers).toEqual(candidate.answers);
    expect(fixture.count('guest_trial_claims')).toBe(1); expect(fixture.count('guest_trial_answers')).toBe(5);
    expect(fixture.user()).toEqual(before);
    for (const table of ['learning_histories', 'learning_interaction_events', 'study_attempt_receipts', 'quiz_attempt_receipts', 'books', 'words']) expect(fixture.count(table)).toBe(0);
  });
  it('allows immutable appends and subset retry with a full own summary', async () => {
    const fixture = setup(); const candidate = input();
    const first = await commitGuestTrialImport(fixture.env, fixture.user(), { ...candidate, answers: candidate.answers.slice(0, 2) });
    const full = await commitGuestTrialImport(fixture.env, fixture.user(), candidate);
    expect(full.summary).toMatchObject({ answerCount: 5, importedAt: first.summary.importedAt });
    expect(await commitGuestTrialImport(fixture.env, fixture.user(), { ...candidate, answers: candidate.answers.slice(0, 1) })).toEqual(full);
  });
  it('blocks another account claiming any portion and never returns its summary', async () => {
    const fixture = setup(); const candidate = input();
    await commitGuestTrialImport(fixture.env, fixture.user(), { ...candidate, answers: [candidate.answers[0]] });
    await expect(commitGuestTrialImport(fixture.env, fixture.user('student-2'), { ...candidate, expectedUserId: 'student-2', answers: [candidate.answers[1]] })).rejects.toMatchObject({ status: 409 });
    expect(await readGuestTrialSummary(fixture.env, fixture.user('student-2'), candidate.trialId)).toBeNull();
    expect(fixture.count('guest_trial_answers')).toBe(1);
  });
  it('blocks reusing global attempt IDs in another trial and rolls back its new claim', async () => {
    const fixture = setup(); const candidate = input(); await commitGuestTrialImport(fixture.env, fixture.user(), candidate);
    await expect(commitGuestTrialImport(fixture.env, fixture.user('student-2'), { ...candidate, expectedUserId: 'student-2', trialId: 'other-trial-123' })).rejects.toMatchObject({ status: 409 });
    expect(fixture.count('guest_trial_claims')).toBe(1); expect(fixture.count('guest_trial_answers')).toBe(5);
  });
  it.each([{ choiceIndex: 1 }, { answeredAt: 1 }, { questionId: 'original-v1-carry' }, { attemptId: 'replacement-attempt' }])('rejects altered answered content and atomically removes earlier additions: %s', async (change) => {
    const fixture = setup(); const candidate = input();
    await commitGuestTrialImport(fixture.env, fixture.user(), { ...candidate, answers: [candidate.answers[0]] });
    // Append is placed before the invalid replay to test actual transaction rollback.
    const changed = { ...candidate.answers[0], ...change };
    if ('answeredAt' in change) changed.answeredAt = candidate.answers[0].answeredAt + 1;
    await expect(commitGuestTrialImport(fixture.env, fixture.user(), { ...candidate, answers: [candidate.answers[2], changed] })).rejects.toMatchObject({ status: 409 });
    expect(fixture.count('guest_trial_answers')).toBe(1);
  });
  it.each(['guest_trial_claims', 'guest_trial_answers'])('rolls back on %s write failure and accepts same-payload retry', async (table) => {
    const fixture = setup(); const candidate = input();
    fixture.beforeRun((sql) => { if (sql.includes(`INSERT INTO ${table}`)) throw new Error('injected write failure'); });
    await expect(commitGuestTrialImport(fixture.env, fixture.user(), candidate)).rejects.toThrow('injected write failure');
    expect(fixture.count('guest_trial_claims')).toBe(0); expect(fixture.count('guest_trial_answers')).toBe(0);
    fixture.beforeRun(undefined); expect((await commitGuestTrialImport(fixture.env, fixture.user(), candidate)).summary.answerCount).toBe(5);
  });
  it('allows recovery by summary after a committed transaction with a lost response', async () => {
    const fixture = setup(); const candidate = input(); const originalPrepare = fixture.env.DB.prepare.bind(fixture.env.DB);
    vi.spyOn(fixture.env.DB, 'prepare').mockImplementation((sql) => {
      if (sql.includes('SELECT c.trial_id')) throw new Error('lost response');
      return originalPrepare(sql);
    });
    await expect(commitGuestTrialImport(fixture.env, fixture.user(), candidate)).rejects.toThrow('lost response');
    vi.restoreAllMocks(); expect((await readGuestTrialSummary(fixture.env, fixture.user(), candidate.trialId))?.answerCount).toBe(5);
    expect((await commitGuestTrialImport(fixture.env, fixture.user(), candidate)).summary.answerCount).toBe(5);
  });
  it('rejects a cookie account switch before the first claim even with an unclaimed trial', async () => {
    const fixture = setup();
    await expect(commitGuestTrialImport(fixture.env, fixture.user('student-2'), input())).rejects.toMatchObject({ status: 409 });
    expect(fixture.count('guest_trial_claims')).toBe(0); expect(fixture.count('guest_trial_answers')).toBe(0);
  });
  it('reads saved account answers beyond device expiration with server-derived correctness and no PII', async () => {
    const fixture = setup(); const candidate = input();
    await commitGuestTrialImport(fixture.env, fixture.user(), candidate);
    fixture.sqlite.exec('UPDATE guest_trial_answers SET correct=0');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + GUEST_TRIAL_TTL_MS * 2);
    const summary = await readGuestTrialSummary(fixture.env, fixture.user());
    expect(summary).toMatchObject({ trialId: candidate.trialId, answerCount: 5, correctCount: 4, answers: candidate.answers });
    expect(Object.keys(summary!).sort()).toEqual(['answerCount', 'answers', 'correctCount', 'importedAt', 'trialId', 'version']);
    expect(Object.keys(summary!.answers[0]).sort()).toEqual(['answeredAt', 'attemptId', 'choiceIndex', 'questionId']);
  });
  it('returns the latest own trial while excluding another account and retaining specific older reads', async () => {
    const fixture = setup(); const candidate = input(); vi.spyOn(Date, 'now').mockReturnValue(candidate.answers[0].answeredAt + 1000);
    await commitGuestTrialImport(fixture.env, fixture.user(), candidate);
    vi.spyOn(Date, 'now').mockReturnValue(candidate.answers[0].answeredAt + 2000);
    const newer = { ...candidate, trialId: 'trial-newer-123', answers: candidate.answers.map((answer) => ({ ...answer, attemptId: `${answer.attemptId}-new` })) };
    await commitGuestTrialImport(fixture.env, fixture.user(), newer);
    vi.spyOn(Date, 'now').mockReturnValue(candidate.answers[0].answeredAt + 3000);
    const other = { ...newer, expectedUserId: 'student-2', trialId: 'trial-other-123', answers: newer.answers.map((answer) => ({ ...answer, attemptId: `${answer.attemptId}-other` })) };
    await commitGuestTrialImport(fixture.env, fixture.user('student-2'), other);
    expect((await readGuestTrialSummary(fixture.env, fixture.user()))?.trialId).toBe(newer.trialId);
    expect((await readGuestTrialSummary(fixture.env, fixture.user(), candidate.trialId))?.trialId).toBe(candidate.trialId);
    expect((await readGuestTrialSummary(fixture.env, fixture.user('student-2')))?.answers).toEqual(other.answers);
    expect(await readGuestTrialSummary(fixture.env, fixture.user(), other.trialId)).toBeNull();
  });
  it('surfaces answer-read failure instead of showing an empty saved practice', async () => {
    const fixture = setup(); const candidate = input(); await commitGuestTrialImport(fixture.env, fixture.user(), candidate);
    const originalPrepare = fixture.DB.prepare.bind(fixture.DB);
    vi.spyOn(fixture.DB, 'prepare').mockImplementation((sql) => {
      const statement = originalPrepare(sql);
      if (sql.includes('SELECT a.attempt_id')) vi.spyOn(statement, 'all').mockResolvedValue({ success: false, meta: {} });
      return statement;
    });
    await expect(readGuestTrialSummary(fixture.env, fixture.user())).rejects.toMatchObject({ status: 500 });
  });
  it.each([{ role: UserRole.INSTRUCTOR }, { email: 'demo_student_123@medace.app' }])('rejects non-owner account kinds: %s', async (change) => {
    const fixture = setup(); await expect(commitGuestTrialImport(fixture.env, { ...fixture.user(), ...change }, input())).rejects.toMatchObject({ status: 403 });
    expect(fixture.count('guest_trial_claims')).toBe(0);
  });
});

describe('guest trial request boundaries', () => {
  it.each([null, {}, { ...input(), userId: 'other' }, { ...input(), version: 'unknown' }, { ...input(), answers: [] },
    { ...input(), answers: Array(6).fill(input().answers[0]) }, { ...input(), trialId: 'a' }])('rejects invalid or PII-bearing top-level input: %s', (candidate) => {
    expect(() => validateGuestTrialImport(candidate)).toThrow();
  });
  it.each([{ choiceIndex: -1 }, { choiceIndex: 4 }, { choiceIndex: 1.5 }, { questionId: 'word-commercial-1' }, { correct: true }, { email: 'x@y.test' },
    { answeredAt: Date.now() - GUEST_TRIAL_TTL_MS - 1000 }, { answeredAt: Date.now() + 120000 }, { attemptId: 'bad id' }])('rejects answer injection or invalid timing: %s', (change) => {
    const candidate = input(); candidate.answers = [{ ...candidate.answers[0], ...change }]; expect(() => validateGuestTrialImport(candidate)).toThrow();
  });
  it('rejects duplicate attempts/questions', () => {
    const candidate = input(); candidate.answers = [candidate.answers[0], candidate.answers[0]]; expect(() => validateGuestTrialImport(candidate)).toThrow();
  });
  it('rejects cross-origin writes before auth or database access', async () => {
    const request = new Request('https://app.example/api/guest-trial/import', { method: 'POST', headers: { Origin: 'https://attacker.example' }, body: JSON.stringify(input()) });
    await expect(guestTrialRoutes[0].handle({ request, env: {} as AppEnv, pathname: 'guest-trial/import' })).rejects.toMatchObject({ status: 403 });
  });
  it('requires a fresh authenticated session', async () => {
    const request = new Request('https://app.example/api/guest-trial/import', { method: 'POST', headers: { Origin: 'https://app.example' }, body: JSON.stringify(input()) });
    await expect(guestTrialRoutes[0].handle({ request, env: {} as AppEnv, pathname: 'guest-trial/import' })).rejects.toMatchObject({ status: 401 });
  });
  it('bounds body bytes and rejects owner query injection', async () => {
    const fixture = setup(); vi.spyOn(auth, 'requireUser').mockResolvedValue(fixture.user());
    await expect(guestTrialRoutes[0].handle({ env: fixture.env, pathname: 'guest-trial/import', request: new Request('https://app.example/api/guest-trial/import', { method: 'POST', headers: { Origin: 'https://app.example' }, body: ' '.repeat(4097) }) })).rejects.toMatchObject({ status: 413 });
    await expect(guestTrialRoutes[1].handle({ env: fixture.env, pathname: 'guest-trial/summary', request: new Request('https://app.example/api/guest-trial/summary?trialId=trial-original-123&userId=student-2') })).rejects.toMatchObject({ status: 400 });
  });
  it('returns verified JSON on the authenticated POST and own GET, and 204 for an absent trial', async () => {
    const fixture = setup(); const candidate = input(); vi.spyOn(auth, 'requireUser').mockResolvedValue(fixture.user());
    const posted = await guestTrialRoutes[0].handle({ env: fixture.env, pathname: 'guest-trial/import', request: new Request('https://app.example/api/guest-trial/import', {
      method: 'POST', headers: { Origin: 'https://app.example' }, body: JSON.stringify(candidate),
    }) });
    const receipt = await posted.response.json(); expect(receipt.summary.answerCount).toBe(5);
    const read = await guestTrialRoutes[1].handle({ env: fixture.env, pathname: 'guest-trial/summary', request: new Request(`https://app.example/api/guest-trial/summary?trialId=${candidate.trialId}`) });
    expect(await read.response.json()).toEqual(receipt.summary); expect(read.response.headers.get('Cache-Control')).toBe('no-store');
    const absent = await guestTrialRoutes[1].handle({ env: fixture.env, pathname: 'guest-trial/summary', request: new Request('https://app.example/api/guest-trial/summary?trialId=trial-missing-123') });
    expect(absent.response.status).toBe(204);
  });
  it('rejects repeated query IDs instead of silently choosing an owner scope', async () => {
    const fixture = setup(); vi.spyOn(auth, 'requireUser').mockResolvedValue(fixture.user());
    await expect(guestTrialRoutes[1].handle({ env: fixture.env, pathname: 'guest-trial/summary', request: new Request('https://app.example/api/guest-trial/summary?trialId=trial-original-123&trialId=other-trial-123') })).rejects.toMatchObject({ status: 400 });
  });
  it('accepts no query as latest and preserves empty, role, demo, and anonymous guards', async () => {
    const fixture = setup(); const candidate = input(); await commitGuestTrialImport(fixture.env, fixture.user(), candidate);
    const requireUser = vi.spyOn(auth, 'requireUser').mockResolvedValue(fixture.user());
    const context = { env: fixture.env, pathname: 'guest-trial/summary', request: new Request('https://app.example/api/guest-trial/summary') };
    expect((await (await guestTrialRoutes[1].handle(context)).response.json()).answers).toEqual(candidate.answers);
    await expect(guestTrialRoutes[1].handle({ ...context, request: new Request('https://app.example/api/guest-trial/summary?trialId=') })).rejects.toMatchObject({ status: 400 });
    requireUser.mockResolvedValue({ ...fixture.user(), email: 'demo_student_123@medace.app' });
    await expect(guestTrialRoutes[1].handle(context)).rejects.toMatchObject({ status: 403 });
    requireUser.mockResolvedValue({ ...fixture.user(), role: UserRole.INSTRUCTOR });
    await expect(guestTrialRoutes[1].handle(context)).rejects.toMatchObject({ status: 403 });
    vi.restoreAllMocks(); await expect(guestTrialRoutes[1].handle(context)).rejects.toMatchObject({ status: 401 });
  });
});

describe('durable optional diagnostic without fabricated level', () => {
  const update = async (fixture: ReturnType<typeof setup>, user: Record<string, unknown>) => {
    vi.spyOn(auth, 'requireUser').mockResolvedValue(fixture.user());
    const route = authProfileRoutes.find((route) => route.matches({ env: fixture.env, request: new Request('https://app.example/api/profile', { method: 'POST' }), pathname: 'profile' }))!;
    return route.handle({ env: fixture.env, pathname: 'profile', request: new Request('https://app.example/api/profile', { method: 'POST', headers: { Origin: 'https://app.example' }, body: JSON.stringify({ user }) }) });
  };
  it('persists server time, survives re-read and ordinary update, and preserves an absent level', async () => {
    const fixture = setup(); vi.spyOn(Date, 'now').mockReturnValue(123456789);
    expect(auth.mapUserRowToProfile(fixture.user())).toMatchObject({ needsOnboarding: true, englishLevel: null });
    const response = await update(fixture, { diagnosticDeferredAt: 999, needsOnboarding: false });
    expect(await response.response.json()).toMatchObject({ diagnosticDeferredAt: 123456789, needsOnboarding: false });
    expect(fixture.user().english_level).toBeNull();
    await update(fixture, { displayName: 'New Name' });
    expect(auth.mapUserRowToProfile(fixture.user())).toMatchObject({ diagnosticDeferredAt: 123456789, needsOnboarding: false, englishLevel: null });
    await update(fixture, { englishLevel: EnglishLevel.B1 });
    expect(auth.mapUserRowToProfile(fixture.user())).toMatchObject({ diagnosticDeferredAt: 123456789, englishLevel: EnglishLevel.B1, needsOnboarding: false });
  });
  it('does not treat client needsOnboarding=false alone as a diagnostic result or durable skip', async () => {
    const fixture = setup(); await update(fixture, { needsOnboarding: false });
    expect(auth.mapUserRowToProfile(fixture.user())).toMatchObject({ needsOnboarding: true, englishLevel: null, diagnosticDeferredAt: undefined });
  });
  it('preserves an existing assessed level when skipping an optional diagnostic', async () => {
    const fixture = setup(); fixture.sqlite.exec("UPDATE users SET english_level='B2' WHERE id='student-1'");
    await update(fixture, { diagnosticDeferredAt: Date.now() });
    expect(auth.mapUserRowToProfile(fixture.user())).toMatchObject({ englishLevel: EnglishLevel.B2, needsOnboarding: false });
  });
  it('keeps a newer skip marker when a concurrent ordinary update uses a stale authenticated row', async () => {
    const fixture = setup(); const stale = fixture.user();
    fixture.sqlite.exec("UPDATE users SET diagnostic_deferred_at=123456789 WHERE id='student-1'");
    vi.spyOn(auth, 'requireUser').mockResolvedValue(stale);
    const route = authProfileRoutes.find((route) => route.matches({ env: fixture.env, request: new Request('https://app.example/api/profile', { method: 'POST' }), pathname: 'profile' }))!;
    await route.handle({ env: fixture.env, pathname: 'profile', request: new Request('https://app.example/api/profile', { method: 'POST', headers: { Origin: 'https://app.example' }, body: JSON.stringify({ user: { displayName: 'Concurrent' } }) }) });
    expect(fixture.user().diagnostic_deferred_at).toBe(123456789);
    expect(auth.mapUserRowToProfile(fixture.user()).needsOnboarding).toBe(false);
  });
  it('rejects a diagnostic skip for a non-student without modifying its level', async () => {
    const fixture = setup(); fixture.sqlite.exec("UPDATE users SET role='INSTRUCTOR' WHERE id='student-1'");
    await expect(update(fixture, { diagnosticDeferredAt: Date.now() })).rejects.toMatchObject({ status: 400 });
    expect(fixture.user().english_level).toBeNull(); expect(fixture.user().diagnostic_deferred_at).toBeNull();
  });
  it('rejects profile changes when a different tab switches the cookie account before POST', async () => {
    const fixture = setup(); const beforeFirst = fixture.user(); const beforeOther = fixture.user('student-2');
    vi.spyOn(auth, 'requireUser').mockResolvedValue(beforeOther);
    const prepare = vi.spyOn(fixture.DB, 'prepare');
    const route = authProfileRoutes.find((route) => route.matches({ env: fixture.env, request: new Request('https://app.example/api/profile', { method: 'POST' }), pathname: 'profile' }))!;
    await expect(route.handle({ env: fixture.env, pathname: 'profile', request: new Request('https://app.example/api/profile', {
      method: 'POST', headers: { Origin: 'https://app.example' }, body: JSON.stringify({ user: {
        uid: 'student-1', displayName: 'Wrong account', diagnosticDeferredAt: Date.now(), englishLevel: EnglishLevel.C1,
      } }),
    }) })).rejects.toMatchObject({ status: 409 });
    expect(prepare).not.toHaveBeenCalled();
    expect(fixture.user()).toEqual(beforeFirst); expect(fixture.user('student-2')).toEqual(beforeOther);
  });
  it('accepts a matching profile UID and remains compatible with an omitted UID', async () => {
    const fixture = setup(); await update(fixture, { uid: 'student-1', displayName: 'Matching', diagnosticDeferredAt: Date.now() });
    expect(fixture.user().display_name).toBe('Matching'); expect(fixture.user().diagnostic_deferred_at).toBeGreaterThan(0);
    await update(fixture, { displayName: 'Legacy payload' }); expect(fixture.user().display_name).toBe('Legacy payload');
  });
  it.each([null, 123, '', 'student-2'])('rejects a provided invalid or mismatched profile UID: %s', async (uid) => {
    const fixture = setup(); const before = fixture.user();
    await expect(update(fixture, { uid, diagnosticDeferredAt: Date.now() })).rejects.toMatchObject({ status: 409 });
    expect(fixture.user()).toEqual(before);
  });
  it.each([null, 0, -1, 'yes', 1.5])('rejects malformed defer marker %s', async (diagnosticDeferredAt) => {
    const fixture = setup(); await expect(update(fixture, { diagnosticDeferredAt })).rejects.toMatchObject({ status: 400 });
    expect(fixture.user().diagnostic_deferred_at).toBeNull();
  });
});
