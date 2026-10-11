import { readFileSync, readdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGetBookSession, handleGetBookStudyOverview, handleGetDailySessionWords } from '../functions/_shared/storage-book-actions';
import { allocateGraduatedReviewSession, getVisibleLongTermReviewAvailableCount } from '../functions/_shared/graduated-review-assignments';
import { getVisibleDueCount, toWordData, type DbWordRow } from '../functions/_shared/storage-support';
import { handleSaveSrsHistory } from '../functions/_shared/storage-learning-actions';
import { catalogStorageActionDefinitions } from '../functions/_shared/storage-action-registry/catalog';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { LearningTaskIntentType, type LearningTaskIntent, type WordData } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
const temporaryDirs: string[] = [];
const now = Date.parse('2026-10-11T12:00:00Z');
const migrationDir = new URL('../migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort();
afterEach(() => {
  databases.splice(0).forEach(db => db.sqlite.close());
  temporaryDirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
  vi.restoreAllMocks();
});
const task = (bookId = 'a', extra: Partial<LearningTaskIntent> = {}): LearningTaskIntent => ({
  mode: 'study', intentType: LearningTaskIntentType.BOOK_STUDY, label: 'Synthetic review', bookId,
  selectionPolicy: 'BOOK_DUE_ONLY', limit: 20, ...extra,
});
const setup = (ordinaryCount = 100) => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const fixture = createSqliteD1(); databases.push(fixture);
  for (const file of migrationFiles) fixture.sqlite.exec(readFileSync(new URL(file, migrationDir), 'utf8'));
  fixture.sqlite.exec(`INSERT INTO users(id,email,display_name,role,subscription_plan,created_at,updated_at) VALUES
    ('student','synthetic@example.invalid','Synthetic','STUDENT','TOC_FREE',1,1),
    ('other','other@example.invalid','Other','STUDENT','TOC_FREE',1,1);
    INSERT INTO books(id,title,word_count,created_by,catalog_source,access_scope,created_at,updated_at) VALUES
    ('a','A',120,'student','USER_GENERATED','ALL_PLANS',1,1),
    ('b','B',120,'student','USER_GENERATED','ALL_PLANS',1,1),
    ('private','Private',120,'other','USER_GENERATED','ALL_PLANS',1,1),
    ('unapproved','Unchecked',120,NULL,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1);`);
  const word = fixture.sqlite.prepare('INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1)');
  const history = fixture.sqlite.prepare(`INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,interaction_source,attempt_count,interval_days)
    VALUES(?,?,?,?,?,?,?,1,?)`);
  for (const bookId of ['a', 'b', 'private', 'unapproved']) {
    for (let n = 1; n <= ordinaryCount + 8; n++) {
      const id = `${bookId}-${String(n).padStart(3, '0')}`;
      word.run(id, bookId, n, id, `meaning-${n}`, id);
      history.run('student', id, bookId, n <= ordinaryCount ? 'review' : 'graduated', now - 10_000, now - 1_000, 'STUDY', n <= ordinaryCount ? 4 : 30);
    }
  }
  const env = { DB: fixture.DB } as AppEnv;
  const user = fixture.sqlite.prepare("SELECT * FROM users WHERE id='student'").get() as unknown as DbUserRow;
  return { ...fixture, env, user, clock };
};
const count = (f: ReturnType<typeof setup>, table: string) => Number(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
const graduated = (words: WordData[]) => words.filter(word => word.longTermReview);
const ids = (words: WordData[]) => words.map(word => word.id);
const allocations = (f: ReturnType<typeof setup>) => f.sqlite.prepare('SELECT user_id,day_key,word_id,book_id,slot_number,client_session_id FROM graduated_review_allocations ORDER BY day_key,slot_number').all();

describe('graduated review production SQL on real SQLite transactions', () => {
  it('reserves a bounded graduated portion even with 100 ordinary due words, without changing mastery or goals', async () => {
    const f = setup();
    const historyBefore = f.sqlite.prepare('SELECT * FROM learning_histories ORDER BY user_id,word_id').all();
    expect(await getVisibleDueCount(f.env, f.user)).toBe(200);
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user)).toBe(5);
    const words = await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'start-a');
    expect(words).toHaveLength(20); expect(graduated(words)).toHaveLength(3);
    expect(ids(graduated(words))).toEqual(['a-101', 'a-102', 'a-103']);
    expect(count(f, 'graduated_review_allocations')).toBe(3);
    expect(await getVisibleDueCount(f.env, f.user)).toBe(200);
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user)).toBe(2);
    expect(f.sqlite.prepare('SELECT * FROM learning_histories ORDER BY user_id,word_id').all()).toEqual(historyBefore);
    expect(count(f, 'learning_interaction_events')).toBe(0);
    expect(count(f, 'study_attempt_receipts')).toBe(0);
    expect(f.sqlite.prepare("SELECT stats_xp FROM users WHERE id='student'").get()!.stats_xp).toBe(0);
  });

  it('gives at most one new word to concurrent starts on different books when only one daily slot remains', async () => {
    const f = setup();
    await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'first');
    await handleGetBookSession(f.env, f.user, 'a', 5, task(), 'second');
    expect(count(f, 'graduated_review_allocations')).toBe(4);
    const [left, right] = await Promise.all([
      handleGetBookSession(f.env, f.user, 'a', 20, task(), 'tab-a'),
      handleGetBookSession(f.env, f.user, 'b', 20, task('b'), 'tab-b'),
    ]);
    expect(graduated(left).length + graduated(right).length).toBe(1);
    expect(count(f, 'graduated_review_allocations')).toBe(5);
    expect(new Set(allocations(f).map(row => row.slot_number))).toHaveProperty('size', 5);
    expect(graduated(left).every(word => word.bookId === 'a')).toBe(true);
    expect(graduated(right).every(word => word.bookId === 'b')).toBe(true);
  });

  it('replays a committed start after response loss and rejects a reused ID with a different payload', async () => {
    const f = setup(); const originalBatch = f.env.DB.batch.bind(f.env.DB); let drop = true;
    f.env.DB.batch = async statements => {
      const result = await originalBatch(statements);
      if (drop) { drop = false; throw new Error('synthetic response lost after commit'); }
      return result;
    };
    await expect(handleGetBookSession(f.env, f.user, 'a', 20, task(), 'lost')).rejects.toThrow('response lost');
    const persisted = f.sqlite.prepare("SELECT * FROM long_term_review_starts WHERE client_session_id='lost'").get()!;
    const before = allocations(f);
    const [retry, racingRetry] = await Promise.all([
      handleGetBookSession(f.env, f.user, 'a', 20, task(), 'lost'),
      handleGetBookSession(f.env, f.user, 'a', 20, task(), 'lost'),
    ]);
    expect(ids(retry)).toEqual(JSON.parse(String(persisted.result_word_ids_json)));
    expect(ids(racingRetry)).toEqual(ids(retry)); expect(allocations(f)).toEqual(before);
    await expect(handleGetBookSession(f.env, f.user, 'b', 20, task('b'), 'lost')).rejects.toMatchObject({ status: 409 });
    await expect(handleGetBookSession(f.env, f.user, 'a', 10, task(), 'lost')).rejects.toMatchObject({ status: 409 });
    expect(count(f, 'long_term_review_starts')).toBe(1);
  });

  it('makes two simultaneous first requests for the same start commit just one identical result', async () => {
    const f = setup();
    const [first, second] = await Promise.all([
      handleGetBookSession(f.env, f.user, 'a', 20, task(), 'same-first-start'),
      handleGetBookSession(f.env, f.user, 'a', 20, task(), 'same-first-start'),
    ]);
    expect(ids(first)).toEqual(ids(second)); expect(graduated(first)).toHaveLength(3);
    expect(count(f, 'long_term_review_starts')).toBe(1); expect(count(f, 'graduated_review_allocations')).toBe(3);
    expect(f.sqlite.prepare('SELECT start_ordinal FROM long_term_review_starts').get()!.start_ordinal).toBe(1);
  });

  it('does not reject an already displayed valid answer after another tab consumes the daily slots, including wrong-answer retry', async () => {
    const f = setup();
    const shown = graduated(await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'shown'))[0];
    await handleGetBookSession(f.env, f.user, 'b', 20, task('b'), 'consume');
    expect(count(f, 'graduated_review_allocations')).toBe(5);
    await handleSaveSrsHistory(f.env, f.user, shown, 0, 123, undefined, undefined, 'answer-1');
    await handleSaveSrsHistory(f.env, f.user, shown, 0, 123, undefined, undefined, 'answer-1');
    await handleSaveSrsHistory(f.env, f.user, shown, 2, 200, undefined, undefined, 'answer-2');
    expect(count(f, 'study_attempt_receipts')).toBe(2); expect(count(f, 'learning_interaction_events')).toBe(2);
    expect(count(f, 'graduated_review_allocations')).toBe(5);
    expect(f.sqlite.prepare('SELECT attempt_count FROM learning_histories WHERE user_id=? AND word_id=?').get(f.user.id, shown.id)!.attempt_count).toBe(3);
    // Explicit study is never rejected just because its graduated word was not automatically assigned.
    await handleSaveSrsHistory(f.env, f.user, { id: 'a-108', bookId: 'a' }, 2, 100, undefined, undefined, 'explicit-answer');
    expect(count(f, 'study_attempt_receipts')).toBe(3); expect(count(f, 'graduated_review_allocations')).toBe(5);
  });

  it('keeps the old JST assignment day on midnight replay and answer, while only a new start gets the new day', async () => {
    const f = setup(); f.clock.mockReturnValue(Date.parse('2026-10-11T14:59:30Z'));
    const first = await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'midnight');
    const old = allocations(f); expect(old.every(row => row.day_key === '2026-10-11')).toBe(true);
    f.clock.mockReturnValue(Date.parse('2026-10-11T15:00:30Z'));
    expect(ids(await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'midnight'))).toEqual(ids(first));
    expect(allocations(f)).toEqual(old);
    await handleSaveSrsHistory(f.env, f.user, graduated(first)[0], 2, 120, undefined, undefined, 'after-midnight');
    expect(allocations(f)).toEqual(old);
    await handleGetBookSession(f.env, f.user, 'b', 20, task('b'), 'new-day');
    expect(allocations(f).filter(row => row.day_key === '2026-10-12')).toHaveLength(3);
    expect(f.sqlite.prepare("SELECT day_key FROM long_term_review_starts WHERE client_session_id='midnight'").get()!.day_key).toBe('2026-10-11');
  });

  it('uses server time and ignores forged client timestamps or allocation days', async () => {
    const f = setup();
    const forged = { ...task(), now: Date.parse('2099-01-01T00:00:00Z'), dayKey: '2099-01-01' };
    await handleGetBookSession(f.env, f.user, 'a', 20, forged, 'forged');
    expect(allocations(f).every(row => row.day_key === '2026-10-11')).toBe(true);
  });

  it('does not refill a replay after an answer or leak another user’s start; latest material access governs replay, overview and answer', async () => {
    const f = setup(); const words = await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'access');
    const shown = graduated(words)[0];
    await handleSaveSrsHistory(f.env, f.user, shown, 2, 0, undefined, undefined, 'answered');
    const retry = await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'access');
    expect(retry).toHaveLength(19); expect(ids(retry)).not.toContain(shown.id);
    expect(count(f, 'graduated_review_allocations')).toBe(3);
    const other = f.sqlite.prepare("SELECT * FROM users WHERE id='other'").get() as unknown as DbUserRow;
    await expect(handleGetBookSession(f.env, other, 'a', 20, task(), 'access')).rejects.toMatchObject({ status: 403 });
    f.sqlite.exec("UPDATE books SET created_by='other' WHERE id='a'");
    await expect(handleGetBookSession(f.env, f.user, 'a', 20, task(), 'access')).rejects.toMatchObject({ status: 403 });
    await expect(handleGetBookStudyOverview(f.env, f.user, 'a')).rejects.toMatchObject({ status: 403 });
    await expect(handleSaveSrsHistory(f.env, f.user, words[0], 2, 0)).rejects.toMatchObject({ status: 403 });
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'a')).toBe(0);
  });

  it('bounds repeated abandon/back/login/new starts without changing history, XP or mission counters', async () => {
    const f = setup(); const historyBefore = f.sqlite.prepare('SELECT * FROM learning_histories ORDER BY user_id,word_id').all();
    f.sqlite.exec(`INSERT INTO weekly_missions(id,created_by_user_id,learning_track,title,rationale,review_words_target,due_at,created_at,updated_at)
      VALUES('mission','student','VOCABULARY','Synthetic','Synthetic',10,${now + 1000},1,1);
      INSERT INTO weekly_mission_assignments(id,mission_id,student_user_id,assigned_by_user_id,assigned_at,updated_at)
      VALUES('assignment','mission','student','student',1,1)`);
    const missionBefore = f.sqlite.prepare('SELECT * FROM weekly_mission_assignments').all();
    const outcomes = [];
    for (let n = 0; n < 12; n++) outcomes.push(await handleGetBookSession(f.env, f.user, n % 2 ? 'a' : 'b', 20, task(n % 2 ? 'a' : 'b'), `abandon-${n}`));
    expect(outcomes.reduce((total, words) => total + graduated(words).length, 0)).toBe(5);
    expect(count(f, 'graduated_review_allocations')).toBe(5);
    expect(f.sqlite.prepare('SELECT * FROM learning_histories ORDER BY user_id,word_id').all()).toEqual(historyBefore);
    expect(count(f, 'learning_interaction_events')).toBe(0); expect(count(f, 'study_attempt_receipts')).toBe(0);
    expect(f.sqlite.prepare('SELECT * FROM weekly_mission_assignments').all()).toEqual(missionBefore);
  });

  it('makes the limit-one exception deterministic by persisted daily start ordinal while retaining ordinary priority on four of five starts', async () => {
    const f = setup(); const results = [];
    for (let n = 1; n <= 10; n++) results.push(await handleGetBookSession(f.env, f.user, 'a', 1, task(), `short-${n}`));
    expect(results.map(words => graduated(words).length)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(f.sqlite.prepare('SELECT start_ordinal FROM long_term_review_starts ORDER BY start_ordinal').all().map(row => row.start_ordinal)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(ids(await handleGetBookSession(f.env, f.user, 'a', 1, task(), 'short-5'))).toEqual(ids(results[4]));
    expect(count(f, 'graduated_review_allocations')).toBe(2);
  });

  it('preserves exact chapter scope and does not enable a chapter from graduated words in a different chapter', async () => {
    const f = setup(); const normalChapter = { start: 1, end: 10 };
    expect(await handleGetBookStudyOverview(f.env, f.user, 'a', normalChapter)).toMatchObject({ dueCount: 10, longTermReviewAvailableCount: 0 });
    const noGrads = await handleGetBookSession(f.env, f.user, 'a', 10, task('a', { wordRange: normalChapter }), 'chapter-normal');
    expect(graduated(noGrads)).toHaveLength(0);
    const graduateChapter = { start: 104, end: 108 };
    expect(await handleGetBookStudyOverview(f.env, f.user, 'a', graduateChapter)).toMatchObject({ dueCount: 0, longTermReviewAvailableCount: 5 });
    const onlyGrads = await handleGetBookSession(f.env, f.user, 'a', 10, task('a', { wordRange: graduateChapter }), 'chapter-graduate');
    expect(ids(onlyGrads)).toEqual(['a-104','a-105']);
    expect(onlyGrads.every(word => word.number >= 104 && word.number <= 108 && word.longTermReview)).toBe(true);
  });

  it('keeps quizzes, new-only missions and legacy callers free of automatic graduated assignments', async () => {
    const f = setup();
    expect(graduated(await handleGetBookSession(f.env, f.user, 'a', 20, task()))).toHaveLength(0);
    expect(graduated(await handleGetBookSession(f.env, f.user, 'a', 20, task('a', { mode: 'quiz' }), 'quiz'))).toHaveLength(0);
    expect(graduated(await handleGetBookSession(f.env, f.user, 'a', 20, task('a', { selectionPolicy: 'BOOK_NEW_ONLY' }), 'new'))).toHaveLength(0);
    expect(count(f, 'long_term_review_starts')).toBe(0); expect(count(f, 'graduated_review_allocations')).toBe(0);
  });

  it('does not treat zero-progress graduated history as new, and keeps ranged default sessions and overview consistent', async () => {
    const f = setup(0);
    f.sqlite.exec("UPDATE learning_histories SET attempt_count=0,interval_days=0 WHERE book_id='a'");
    const range = { start: 1, end: 8 };
    expect(await handleGetBookStudyOverview(f.env, f.user, 'a', range)).toMatchObject({ studiedCount: 8, newCount: 0, dueCount: 0, longTermReviewAvailableCount: 5 });
    expect(await handleGetBookSession(f.env, f.user, 'a', 20, task('a', { selectionPolicy: 'BOOK_NEW_ONLY', wordRange: range }), 'zero-new')).toEqual([]);
    const words = await handleGetBookSession(f.env, f.user, 'a', 20, task('a', { selectionPolicy: 'BOOK_DEFAULT', wordRange: range }), 'zero-default');
    expect(ids(words)).toEqual(['a-001','a-002','a-003']);
    expect(words.every(word => word.longTermReview)).toBe(true); expect(new Set(ids(words)).size).toBe(words.length);
  });

  it.each(['book-default', 'daily'] as const)('preserves a quiz-only graduated word as ordinary new study on %s initial start and replay', async route => {
    const f = setup(0);
    f.sqlite.exec(`DELETE FROM words WHERE book_id='a' AND id!='a-001';
      UPDATE learning_histories SET interaction_source='QUIZ',status='graduated' WHERE word_id='a-001'`);
    expect(await handleGetBookStudyOverview(f.env, f.user, 'a')).toMatchObject({
      totalCount: 1, studiedCount: 0, newCount: 1, dueCount: 0, longTermReviewAvailableCount: 0,
    });
    const intent = task('a', { selectionPolicy: 'BOOK_DEFAULT', preferredBookIds: ['a'] });
    const start = () => route === 'book-default'
      ? handleGetBookSession(f.env, f.user, 'a', 20, intent, 'quiz-source-ordinary')
      : handleGetDailySessionWords(f.env, f.user, 20, intent, 'quiz-source-ordinary');
    const first = await start(); const retry = await start();
    expect(ids(first)).toEqual(['a-001']); expect(ids(retry)).toEqual(['a-001']);
    expect(graduated(first)).toHaveLength(0); expect(graduated(retry)).toHaveLength(0);
    expect(count(f, 'long_term_review_starts')).toBe(1); expect(count(f, 'graduated_review_allocations')).toBe(0);
    expect(JSON.parse(String(f.sqlite.prepare('SELECT result_word_ids_json FROM long_term_review_starts').get()!.result_word_ids_json))).toEqual(['a-001']);
  });

  it('rejects future, quiz, foreign-user, mismatched-book and unapproved/private candidates in both daily sessions and overview', async () => {
    const f = setup(0);
    f.sqlite.exec(`UPDATE learning_histories SET next_review_date=${now + 1} WHERE word_id='a-001';
      UPDATE learning_histories SET interaction_source='QUIZ' WHERE word_id='a-002';
      UPDATE learning_histories SET user_id='other' WHERE word_id='a-003';
      UPDATE learning_histories SET book_id='private' WHERE word_id='a-004';`);
    const dailyTask = { ...task(), preferredBookIds: ['a'], intentType: LearningTaskIntentType.TODAY_FOCUS };
    const words = await handleGetDailySessionWords(f.env, f.user, 20, dailyTask, 'daily');
    expect(ids(words)).toEqual(['a-005', 'a-006', 'a-007']);
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'a')).toBe(1);
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'private')).toBe(0);
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'unapproved')).toBe(0);
  });

  it('fixes ordinary due counts and daily selection to require the actual word/book match', async () => {
    const f = setup();
    f.sqlite.exec("UPDATE learning_histories SET book_id='private' WHERE word_id='a-001'");
    expect(await getVisibleDueCount(f.env, f.user)).toBe(199);
    expect(ids(await handleGetDailySessionWords(f.env, f.user, 20, { ...task(), preferredBookIds: ['a'] }))).not.toContain('a-001');
  });

  it('does not fall back to other materials for an explicit unavailable preferred list on new starts', async () => {
    const f = setup(); const unavailable = { ...task(), preferredBookIds: ['private', 'missing'] };
    await expect(handleGetDailySessionWords(f.env, f.user, 20, unavailable, 'explicit-unavailable')).rejects.toMatchObject({ status: 403 });
    expect(count(f, 'graduated_review_allocations')).toBe(0);
    // Compatibility remains unchanged for older callers that do not allocate.
    expect(await handleGetDailySessionWords(f.env, f.user, 20, unavailable)).toHaveLength(20);
  });

  it('does not fall back to other materials when a saved plan has only unavailable books on a new start', async () => {
    const f = setup();
    f.sqlite.exec("INSERT INTO learning_plan_books(user_id,book_id,sort_order,created_at,updated_at) VALUES('student','private',0,1,1)");
    await expect(handleGetDailySessionWords(f.env, f.user, 20, undefined, 'plan-unavailable')).rejects.toMatchObject({ status: 403 });
    expect(count(f, 'graduated_review_allocations')).toBe(0); expect(count(f, 'long_term_review_starts')).toBe(0);
    expect(await handleGetDailySessionWords(f.env, f.user, 20)).toHaveLength(20);
  });

  it('defensively excludes allocated graduate IDs and duplicate normal IDs from final persisted composition', async () => {
    const f = setup();
    const normalWords = await handleGetBookSession(f.env, f.user, 'a', 20, task());
    const grad = toWordData(f.sqlite.prepare("SELECT * FROM words WHERE id='a-101'").get() as unknown as DbWordRow);
    const words = await allocateGraduatedReviewSession(f.env, f.user, {
      action: 'book', bookId: 'a', limit: 20, taskIntent: task(), clientSessionId: 'defensive',
      normalWords: [grad, ...normalWords, normalWords[0]], ordinaryDueCount: 100, scopedBookIds: ['a'],
    });
    expect(words.length).toBeLessThanOrEqual(20); expect(graduated(words)).toHaveLength(3);
    expect(new Set(ids(words)).size).toBe(words.length);
    const persisted = JSON.parse(String(f.sqlite.prepare("SELECT result_word_ids_json FROM long_term_review_starts WHERE client_session_id='defensive'").get()!.result_word_ids_json));
    expect(new Set(persisted).size).toBe(persisted.length);
    expect(persisted.filter(id => id === 'a-101')).toHaveLength(1);
  });

  it('filters newly invalid ordinary due histories on replay without refilling the persisted result', async () => {
    const f = setup(); const first = await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'normal-replay');
    f.sqlite.exec(`UPDATE learning_histories SET next_review_date=${now + 1} WHERE word_id='a-001';
      UPDATE learning_histories SET attempt_count=0,interval_days=0,status='new' WHERE word_id='a-002'`);
    const retry = await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'normal-replay');
    expect(ids(retry)).toEqual(ids(first).filter(id => id !== 'a-001' && id !== 'a-002'));
    expect(count(f, 'graduated_review_allocations')).toBe(3);
  });

  it('excludes SQLite infinite or invalid timestamps from both bounded counts and allocation', async () => {
    const f = setup(0);
    const update = f.sqlite.prepare('UPDATE learning_histories SET next_review_date=?,last_studied_at=? WHERE word_id=?');
    update.run(-Infinity, now, 'a-001'); update.run(now - 1, Infinity, 'a-002');
    update.run(now - 1, -Infinity, 'a-003'); update.run('invalid', now, 'a-004');
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'a')).toBe(4);
    expect(ids(await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'finite'))).toEqual(['a-005','a-006','a-007']);
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'a')).toBe(1);
  });

  it('matches canonical metadata fallbacks for empty catalog source and access scope without admitting another user’s private book', async () => {
    const f = setup(0);
    f.sqlite.exec(`UPDATE books SET catalog_source='' WHERE id IN ('a','private');
      INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,source_file,extracted_at,transform_log,content_qa_report,qa_word_count,created_at,updated_at)
      VALUES('private-empty-source','private','LICENSED_PARTNER','Private','Synthetic','approved','approved','Synthetic','Synthetic','Synthetic','Synthetic',120,1,1)`);
    // A missing source on an owned My book canonically means USER_GENERATED.
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'a')).toBe(5);
    expect(graduated(await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'empty-own-source'))).toHaveLength(3);
    // Even an approved ledger cannot convert another user's missing-source My book to official.
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'private')).toBe(0);
    await expect(handleGetBookSession(f.env, f.user, 'private', 20, task('private'), 'empty-private-source')).rejects.toMatchObject({ status: 403 });
    f.sqlite.exec(`UPDATE books SET catalog_source='STEADY_STUDY_ORIGINAL',access_scope='',created_by='other' WHERE id='b';
      INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,source_file,extracted_at,transform_log,content_qa_report,qa_word_count,created_at,updated_at)
      VALUES('empty-scope','b','STEADY_STUDY_ORIGINAL','B','Synthetic','approved','approved','Synthetic','Synthetic','Synthetic','Synthetic',120,1,1)`);
    // Canonical toBookMetadata uses ALL_PLANS for an empty scope on a created book.
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'b')).toBe(2);
    expect(graduated(await handleGetBookSession(f.env, f.user, 'b', 20, task('b'), 'empty-official-scope'))).toHaveLength(2);
  });

  it('propagates a saved-plan fetch failure on a new daily start without changing material scope or allocating', async () => {
    const f = setup(); const prepare = f.env.DB.prepare.bind(f.env.DB);
    f.env.DB.prepare = sql => {
      if (sql.includes('FROM learning_plan_books')) throw new Error('synthetic plan fetch failure');
      return prepare(sql);
    };
    await expect(handleGetDailySessionWords(f.env, f.user, 20, undefined, 'failed-plan')).rejects.toThrow('synthetic plan fetch failure');
    expect(count(f, 'long_term_review_starts')).toBe(0); expect(count(f, 'graduated_review_allocations')).toBe(0);
  });

  it('rechecks latest ledger approval inside the transaction after candidate discovery, then denies replay/overview/answer after revocation', async () => {
    const f = setup();
    f.sqlite.exec(`UPDATE books SET created_by=NULL,catalog_source='STEADY_STUDY_ORIGINAL' WHERE id='a';
      INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,source_file,extracted_at,transform_log,content_qa_report,qa_word_count,created_at,updated_at)
      VALUES('synthetic-source','a','STEADY_STUDY_ORIGINAL','A','Synthetic','approved','approved','Synthetic','Synthetic','Synthetic','Synthetic',120,1,1)`);
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'a')).toBe(5);
    const first = await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'before-revoke');
    let revoked = false;
    f.beforeRun(sql => {
      if (!revoked && sql.includes('INSERT INTO graduated_review_allocations')) {
        revoked = true; f.sqlite.exec("UPDATE material_source_ledger SET review_status='blocked' WHERE book_id='a'");
      }
    });
    await expect(handleGetBookSession(f.env, f.user, 'a', 20, task(), 'revoke-during-allocation')).rejects.toMatchObject({ status: 403 });
    expect(count(f, 'graduated_review_allocations')).toBe(3);
    await expect(handleGetBookSession(f.env, f.user, 'a', 20, task(), 'before-revoke')).rejects.toMatchObject({ status: 403 });
    await expect(handleGetBookStudyOverview(f.env, f.user, 'a')).rejects.toMatchObject({ status: 403 });
    await expect(handleSaveSrsHistory(f.env, f.user, graduated(first)[0], 2, 0)).rejects.toMatchObject({ status: 403 });
    expect(await getVisibleLongTermReviewAvailableCount(f.env, f.user, 'a')).toBe(0);
  });

  it('rolls back the entire assignment transaction if any later statement fails, then the same start can safely retry', async () => {
    const f = setup(); f.sqlite.exec("CREATE TRIGGER fail_synthetic_start BEFORE UPDATE ON long_term_review_starts BEGIN SELECT RAISE(ABORT,'synthetic finalization failure'); END");
    await expect(handleGetBookSession(f.env, f.user, 'a', 20, task(), 'rollback')).rejects.toThrow('synthetic finalization failure');
    expect(count(f, 'long_term_review_starts')).toBe(0); expect(count(f, 'graduated_review_allocations')).toBe(0);
    f.sqlite.exec('DROP TRIGGER fail_synthetic_start');
    expect(graduated(await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'rollback'))).toHaveLength(3);
  });

  it('does not refund daily slots when an assigned word/book is deleted', async () => {
    const f = setup(); await handleGetBookSession(f.env, f.user, 'a', 20, task(), 'delete');
    f.sqlite.exec("DELETE FROM books WHERE id='a'");
    expect(count(f, 'graduated_review_allocations')).toBe(3);
    expect(graduated(await handleGetBookSession(f.env, f.user, 'b', 20, task('b'), 'after-delete'))).toHaveLength(2);
    expect(count(f, 'graduated_review_allocations')).toBe(5);
  });

  it('propagates read failures instead of returning a completed/zero state, and validates start identifiers at the API boundary', async () => {
    const f = setup(); const prepare = f.env.DB.prepare.bind(f.env.DB);
    f.env.DB.prepare = sql => {
      if (sql.includes('AS count') && sql.includes('graduated_review_allocations')) throw new Error('synthetic read failure');
      return prepare(sql);
    };
    await expect(handleGetBookStudyOverview(f.env, f.user, 'a')).rejects.toThrow('synthetic read failure');
    for (const clientSessionId of ['', 'with space', 123, 'x'.repeat(129)]) {
      expect(() => catalogStorageActionDefinitions.getBookSession.parse({ bookId: 'a', limit: 20, clientSessionId })).toThrow();
    }
  });
});

describe('additive migration recovery on an isolated SQLite file', () => {
  it('preserves legacy rows through apply, old-code reads and actual backup restore', () => {
    const dir = mkdtempSync(join(tmpdir(), 'medace-graduated-migration-')); temporaryDirs.push(dir);
    const path = join(dir, 'synthetic.sqlite'); const backup = join(dir, 'before.sqlite');
    let sqlite = new DatabaseSync(path);
    for (const file of migrationFiles.filter(file => !file.startsWith('0062_'))) sqlite.exec(readFileSync(new URL(file, migrationDir), 'utf8'));
    sqlite.exec(`INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES('backup','backup@example.invalid','Backup','STUDENT',1,1);
      INSERT INTO books(id,title,word_count,created_by,created_at,updated_at) VALUES('backup-book','Backup',1,'backup',1,1);
      INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES('backup-word','backup-book',1,'word','meaning','word',1,1);
      INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,interval_days,attempt_count,interaction_source)
        VALUES('backup','backup-word','backup-book','graduated',100,200,30,12,'STUDY')`);
    const before = sqlite.prepare('SELECT * FROM users').all();
    const beforeHistory = sqlite.prepare('SELECT * FROM learning_histories').all();
    sqlite.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    sqlite.exec(readFileSync(new URL('0062_long_term_review_assignments.sql', migrationDir), 'utf8'));
    // App rollback to the old source does not remove additive tables or rewrite history.
    expect(sqlite.prepare('SELECT * FROM users').all()).toEqual(before);
    expect(sqlite.prepare('SELECT * FROM learning_histories').all()).toEqual(beforeHistory);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM learning_histories WHERE status!='graduated'").get()!.n).toBe(0);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    sqlite.close(); copyFileSync(backup, path); sqlite = new DatabaseSync(path);
    expect(sqlite.prepare('SELECT * FROM users').all()).toEqual(before);
    expect(sqlite.prepare('SELECT * FROM learning_histories').all()).toEqual(beforeHistory);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='graduated_review_allocations'").get()).toBeUndefined();
    expect(sqlite.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
    sqlite.close();
  });
});
