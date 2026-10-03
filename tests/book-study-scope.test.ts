import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGetBookSession, handleGetBookStudyOverview, handleGetDailySessionWords } from '../functions/_shared/storage-book-actions';
import { catalogStorageActionDefinitions } from '../functions/_shared/storage-action-registry/catalog';
import { toLearningHistory, toWordData, type DbHistoryRow, type DbWordRow } from '../functions/_shared/storage-support';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { buildBookSessionWords, getBookSession, getBookStudyOverview, getDailySessionWords, type LearningHistoryContext } from '../services/storage/learning-history';
import { STORES, type StoredLearningHistoryRecord } from '../services/storage/idb-support';
import { BookCatalogSource, LearningTaskIntentType, SubscriptionPlan, UserRole, type BookMetadata, type LearningTaskIntent, type StudyWordRange, type TaskSelectionPolicy, type UserProfile } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
const now = 100_000;
afterEach(() => { databases.splice(0).forEach(({ sqlite }) => sqlite.close()); vi.restoreAllMocks(); });
const task = (policy: TaskSelectionPolicy, wordRange: StudyWordRange | undefined = { start: 11, end: 20 }): LearningTaskIntent => ({
  mode: 'study', intentType: LearningTaskIntentType.BOOK_STUDY, label: '章', selectionPolicy: policy, limit: 10, bookId: 'book', wordRange,
});
const request = <T>(result: T, error?: Error): IDBRequest<T> => {
  const operation = { result, error, onsuccess: null, onerror: null } as unknown as IDBRequest<T>;
  queueMicrotask(() => error ? operation.onerror?.call(operation, new Event('error')) : operation.onsuccess?.call(operation, new Event('success')));
  return operation;
};
const setup = () => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const db = createSqliteD1(); databases.push(db);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) db.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  db.sqlite.exec(`INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES
    ('student-1','one@example.test','One','STUDENT',1,1),('student-2','two@example.test','Two','STUDENT',1,1);
    INSERT INTO books(id,title,word_count,created_by,catalog_source,access_scope,created_at,updated_at) VALUES
    ('book','Synthetic',999,'student-1','USER_GENERATED','ALL_PLANS',1,1),
    ('private','Private',999,'student-2','USER_GENERATED','ALL_PLANS',1,1),
    ('unapproved','Unchecked',999,NULL,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1);`);
  const insert = db.sqlite.prepare('INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1)');
  for (let n = 1; n <= 30; n++) insert.run(`w${n}`, 'book', n, `word${n}`, `meaning${n}`, `word${n}`);
  const history = (n: number, status = 'review', date = now - 100, source = 'STUDY', uid = 'student-1', attempts = 1, interval = 4) => {
    db.sqlite.prepare(`INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,interaction_source,attempt_count,interval_days) VALUES(?,?,'book',?,1,?,?,?,?)`)
      .run(uid, `w${n}`, status, date, source, attempts, interval);
  };
  for (let n = 1; n <= 10; n++) history(n);
  history(11); history(12, 'review', now + 100); history(13, 'graduated', now - 100);
  history(14, 'learning', now - 100, 'QUIZ'); history(15, 'new', 0, 'STUDY', 'student-1', 0, 0);
  history(16, 'review', 0, 'STUDY', 'student-2'); history(17, 'review', now + 200, 'STUDY', 'student-1', 0, 4);
  const words = (db.sqlite.prepare("SELECT * FROM words WHERE book_id='book' ORDER BY word_number").all() as unknown as DbWordRow[]).map(toWordData);
  const records = (db.sqlite.prepare('SELECT * FROM learning_histories').all() as unknown as (DbHistoryRow & { user_id: string })[])
    .map(row => ({ id: `${row.user_id}_${row.word_id}`, data: toLearningHistory(row) } satisfies StoredLearningHistoryRecord));
  // A different UID with the requested UID as a prefix must not count locally.
  records.push({ id: 'student-1_alien_w18', data: { ...records[0].data, wordId: 'w18' } });
  const books: BookMetadata[] = [
    { id: 'book', title: 'Synthetic', wordCount: 999, isPriority: false, catalogSource: BookCatalogSource.USER_GENERATED, description: '{"createdBy":"student-1"}' },
    { id: 'private', title: 'Private', wordCount: 999, isPriority: false, catalogSource: BookCatalogSource.USER_GENERATED, description: '{"createdBy":"student-2"}' },
    { id: 'unapproved', title: 'Unchecked', wordCount: 999, isPriority: false, catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL },
  ];
  let failedStore: string | undefined;
  const context: LearningHistoryContext = {
    getSession: async () => ({ uid: 'student-1', role: UserRole.STUDENT, subscriptionPlan: SubscriptionPlan.TOC_FREE } as UserProfile),
    getBooks: async () => books,
    getWordsByBook: async () => words,
    getStore: async name => ({
      get: (id: string) => request(books.find(book => book.id === id), failedStore === name ? new Error('synthetic read failure') : undefined),
      getAll: () => request(name === STORES.HISTORY ? records : [], failedStore === name ? new Error('synthetic read failure') : undefined),
      index: () => ({ getAll: () => request(words, failedStore === name ? new Error('synthetic read failure') : undefined) }),
    } as unknown as IDBObjectStore),
  };
  return { ...db, env: { DB: db.DB } as AppEnv, user: db.sqlite.prepare("SELECT * FROM users WHERE id='student-1'").get() as unknown as DbUserRow,
    context, words, records, failStore: (name: string) => { failedStore = name; } };
};
const numbers = (words: { number: number }[]) => words.map(word => word.number);

describe('book scope production SQL and local selection', () => {
  it.each([
    ['BOOK_DUE_ONLY', 1, { start: 11, end: 20 }, [11]],
    ['BOOK_NEW_ONLY', 2, { start: 21, end: 30 }, [21, 22]],
    ['BOOK_REVIEW_ONLY', 2, { start: 12, end: 17 }, [12, 17]],
    ['BOOK_DEFAULT', 10, { start: 11, end: 20 }, [11, 14, 15, 16, 18, 19, 20, 12, 17]],
  ] as const)('applies %s scope before limits and across due/new/ahead', async (policy, limit, range, expected) => {
    const fixture = setup(); const intent = task(policy, range);
    expect(numbers(await handleGetBookSession(fixture.env, fixture.user, 'book', limit, intent))).toEqual(expected);
    expect(numbers(await getBookSession(fixture.context, 'student-1', 'book', limit, intent))).toEqual(expected);
  });
  it('returns zero due words without any future or new replenishment', async () => {
    const fixture = setup(); const intent = task('BOOK_DUE_ONLY', { start: 21, end: 30 });
    expect(await handleGetBookSession(fixture.env, fixture.user, 'book', 10, intent)).toEqual([]);
    expect(await getBookSession(fixture.context, 'student-1', 'book', 10, intent)).toEqual([]);
    expect(numbers(await handleGetBookSession(fixture.env, fixture.user, 'book', 10, task('BOOK_REVIEW_ONLY', { start: 12, end: 17 })))).toEqual([12, 17]);
  });
  it('applies the same range to book quizzes and never follows a corrupt history into another book', async () => {
    const fixture = setup();
    fixture.sqlite.exec(`INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at)
      VALUES('private-word','private',11,'private','private','private',1,1);
      INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,interaction_source,attempt_count)
      VALUES('student-1','private-word','book','review',1,0,'STUDY',1);`);
    const intent = { ...task('BOOK_DUE_ONLY'), mode: 'quiz' as const, intentType: LearningTaskIntentType.BOOK_QUIZ };
    expect(numbers(await handleGetBookSession(fixture.env, fixture.user, 'book', 1, intent))).toEqual([11]);
    expect(numbers(await getBookSession(fixture.context, 'student-1', 'book', 1, intent))).toEqual([11]);
    expect(await handleGetBookStudyOverview(fixture.env, fixture.user, 'book', intent.wordRange)).toMatchObject({ dueCount: 1, studiedCount: 4 });
  });
  it('keeps scope-less legacy placeholder and review-ahead behavior', async () => {
    const fixture = setup(); const intent = task('BOOK_NEW_ONLY', undefined);
    // Explicit undefined must bypass the task helper's default fixture range.
    intent.wordRange = undefined;
    expect(numbers(await handleGetBookSession(fixture.env, fixture.user, 'book', 30, intent))).not.toContain(15);
    const histories = fixture.records.filter(record => record.id === `student-1_${record.data.wordId}`).map(record => record.data);
    expect(numbers(buildBookSessionWords({ words: fixture.words, histories, limit: 30, now, selectionPolicy: 'BOOK_NEW_ONLY' }))).not.toContain(15);
    expect(numbers(buildBookSessionWords({ words: fixture.words.slice(11, 17), histories, limit: 30, now, selectionPolicy: 'BOOK_REVIEW_ONLY' }))).toContain(12);
  });
  it('keeps new selection aligned with overview when a history has the wrong book', async () => {
    const fixture = setup(); const range = { start: 18, end: 18 };
    fixture.sqlite.exec(`INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,interaction_source,attempt_count)
      VALUES('student-1','w18','private','review',1,0,'STUDY',1);`);
    fixture.records.push({ id: 'student-1_w18', data: { ...fixture.records[0].data, wordId: 'w18', bookId: 'private' } });
    expect(await handleGetBookStudyOverview(fixture.env, fixture.user, 'book', range)).toMatchObject({ totalCount: 1, newCount: 1, studiedCount: 0 });
    expect(await getBookStudyOverview(fixture.context, 'student-1', 'book', range)).toMatchObject({ totalCount: 1, newCount: 1, studiedCount: 0 });
    for (const policy of ['BOOK_NEW_ONLY', 'BOOK_DEFAULT'] as const) {
      expect(numbers(await handleGetBookSession(fixture.env, fixture.user, 'book', 10, task(policy, range)))).toEqual([18]);
      expect(numbers(await getBookSession(fixture.context, 'student-1', 'book', 10, task(policy, range)))).toEqual([18]);
    }
  });
  it('counts real scoped words and only this user’s strict SRS, including future/graduated without making them due', async () => {
    const fixture = setup(); const range = { start: 11, end: 20 };
    const expected = { bookId: 'book', totalCount: 10, studiedCount: 4, newCount: 6, dueCount: 1 };
    expect(await handleGetBookStudyOverview(fixture.env, fixture.user, 'book', range)).toEqual(expected);
    expect(await getBookStudyOverview(fixture.context, 'student-1', 'book', range)).toEqual(expected);
    const intent = task('BOOK_NEW_ONLY', range);
    expect(await handleGetBookSession(fixture.env, fixture.user, 'book', 100, intent)).toHaveLength(expected.newCount);
    expect(await getBookSession(fixture.context, 'student-1', 'book', 100, intent)).toHaveLength(expected.newCount);
    expect(await handleGetBookStudyOverview(fixture.env, fixture.user, 'book')).toMatchObject({ totalCount: 30, studiedCount: 14, newCount: 16, dueCount: 11 });
    expect(await getBookStudyOverview(fixture.context, 'student-1', 'book')).toMatchObject({ totalCount: 30, studiedCount: 14, newCount: 16, dueCount: 11 });
    expect(await handleGetBookStudyOverview(fixture.env, fixture.user, 'book', { start: 99, end: 100 })).toMatchObject({ totalCount: 0, studiedCount: 0, newCount: 0, dueCount: 0 });
  });
  it.each(['private', 'unapproved', 'missing'])('rejects overview and scoped selection for inaccessible book %s', async bookId => {
    const fixture = setup();
    await expect(handleGetBookStudyOverview(fixture.env, fixture.user, bookId)).rejects.toMatchObject({ status: bookId === 'missing' ? 404 : 403 });
    await expect(getBookStudyOverview(fixture.context, 'student-1', bookId)).rejects.toThrow();
    await expect(handleGetBookSession(fixture.env, fixture.user, bookId, 10, { ...task('BOOK_NEW_ONLY'), bookId })).rejects.toMatchObject({ status: bookId === 'missing' ? 404 : 403 });
  });
  it.each([STORES.BOOKS, STORES.WORDS, STORES.HISTORY])('rejects failed local %s reads instead of publishing zero counters', async store => {
    const fixture = setup(); fixture.failStore(store);
    await expect(getBookStudyOverview(fixture.context, 'student-1', 'book')).rejects.toThrow('synthetic read failure');
    await expect(getBookSession(fixture.context, 'student-1', 'book', 10, task('BOOK_NEW_ONLY'))).rejects.toThrow('synthetic read failure');
  });
  it('refuses another local user’s counters', async () => {
    const fixture = setup();
    await expect(getBookStudyOverview(fixture.context, 'student-2', 'book')).rejects.toThrow('セッション');
  });
});

describe('invalid scope API boundaries', () => {
  it.each([null, { start: NaN, end: 10 }, { start: 10, end: 1 }, { start: 0, end: 10 }, { start: 1, end: Infinity }])('rejects malformed range before any database access: %j', async range => {
    const prepare = vi.fn(); const env = { DB: { prepare } } as unknown as AppEnv; const user = { id: 'student-1' } as DbUserRow;
    await expect(handleGetBookSession(env, user, 'book', 10, { ...task('BOOK_NEW_ONLY'), wordRange: range as never })).rejects.toMatchObject({ status: 400 });
    await expect(handleGetBookStudyOverview(env, user, 'book', range as never)).rejects.toMatchObject({ status: 400 });
    expect(prepare).not.toHaveBeenCalled();
    expect(() => catalogStorageActionDefinitions.getBookStudyOverview.parse({ bookId: 'book', wordRange: range })).toThrow();
  });
  it.each([LearningTaskIntentType.MISSION_NEW, LearningTaskIntentType.MISSION_REVIEW, LearningTaskIntentType.MISSION_QUIZ])('rejects range with %s without widening its mission', async intentType => {
    const fixture = setup();
    await expect(handleGetBookSession(fixture.env, fixture.user, 'book', 10, { ...task('BOOK_NEW_ONLY'), intentType })).rejects.toMatchObject({ status: 400 });
  });
  it('rejects assignment, daily and smart range instead of silently ignoring it', async () => {
    const fixture = setup(); const intent = task('BOOK_NEW_ONLY');
    await expect(handleGetBookSession(fixture.env, fixture.user, 'book', 10, { ...intent, missionAssignmentId: 'assignment' })).rejects.toMatchObject({ status: 400 });
    await expect(handleGetBookSession(fixture.env, fixture.user, 'smart-session', 10, intent)).rejects.toMatchObject({ status: 400 });
    await expect(handleGetDailySessionWords(fixture.env, fixture.user, 10, intent)).rejects.toMatchObject({ status: 400 });
    await expect(getDailySessionWords(fixture.context, 'student-1', 10, intent)).rejects.toThrow();
    expect(() => catalogStorageActionDefinitions.getDailySessionWords.parse({ limit: 10, wordRange: intent.wordRange })).toThrow();
  });
  it('ignores an injected uid and dispatches overview using the authenticated actor', async () => {
    const fixture = setup(); const action = catalogStorageActionDefinitions.getBookStudyOverview;
    const payload = action.parse({ bookId: 'book', wordRange: { start: 11, end: 20 }, uid: 'student-2' });
    expect(payload).not.toHaveProperty('uid');
    expect(await action.execute({ env: fixture.env, user: fixture.user } as never, payload)).toMatchObject({ studiedCount: 4, dueCount: 1 });
  });
  it('propagates failed D1 acquisition without an empty overview', async () => {
    const fixture = setup();
    const prepare = fixture.env.DB.prepare.bind(fixture.env.DB);
    fixture.env.DB.prepare = sql => {
      if (sql.includes('AS total_count')) throw new Error('synthetic D1 read failure');
      return prepare(sql);
    };
    await expect(handleGetBookStudyOverview(fixture.env, fixture.user, 'book')).rejects.toThrow('synthetic D1 read failure');
  });
});
