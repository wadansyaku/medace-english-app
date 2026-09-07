import { afterEach, describe, expect, it } from 'vitest';
import { touchWeeklyMissionProgressFromQuiz, touchWeeklyMissionProgressFromStudy } from '../functions/_shared/storage-mission-actions';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { databases.splice(0).forEach(({ sqlite }) => sqlite.close()); });
const setup = (targets = { newWords: 0, reviews: 2, quizDays: 0 }) => {
  const database = createSqliteD1();
  databases.push(database);
  database.sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE organization_memberships (user_id TEXT, organization_id TEXT, status TEXT);
    CREATE TABLE writing_assignments (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE weekly_missions (
      id TEXT PRIMARY KEY, book_id TEXT, new_words_target INTEGER, review_words_target INTEGER,
      quiz_target_count INTEGER, writing_assignment_id TEXT, due_at INTEGER
    );
    CREATE TABLE weekly_mission_assignments (
      id TEXT PRIMARY KEY, student_user_id TEXT, mission_id TEXT, assigned_at INTEGER,
      started_at INTEGER, restarted_at INTEGER, last_activity_at INTEGER, completed_at INTEGER,
      status TEXT, new_word_ids_json TEXT, review_word_ids_json TEXT, quiz_day_keys_json TEXT, updated_at INTEGER
    );
    INSERT INTO users VALUES ('student-1');
  `);
  database.sqlite.prepare('INSERT INTO weekly_missions VALUES (?, ?, ?, ?, ?, NULL, ?)')
    .run('mission-1', 'book-1', targets.newWords, targets.reviews, targets.quizDays, 100_000);
  database.sqlite.exec(`INSERT INTO weekly_mission_assignments VALUES (
    'assignment-1', 'student-1', 'mission-1', 10, NULL, NULL, NULL, NULL, 'ASSIGNED', '[]', '[]', '[]', 10
  )`);
  return {
    ...database,
    env: { DB: database.DB } as AppEnv,
    user: { id: 'student-1' } as DbUserRow,
    row: () => database.sqlite.prepare('SELECT * FROM weekly_mission_assignments WHERE id = ?').get('assignment-1')!,
  };
};

const review = (fixture: ReturnType<typeof setup>, wordId: string, studiedAt = 100) => touchWeeklyMissionProgressFromStudy(
  fixture.env, fixture.user, { wordId, bookId: 'book-1', existingWasStudy: true, studiedAt },
);

describe('mission progress persistence', () => {
  it('does not complete a two-word review mission by reviewing one word twice', async () => {
    const fixture = setup();
    await review(fixture, 'word-1');
    await review(fixture, 'word-1', 200);
    expect(fixture.row()).toMatchObject({ status: 'IN_PROGRESS', completed_at: null, review_word_ids_json: '["word-1"]' });
    await review(fixture, 'word-2', 300);
    expect(fixture.row()).toMatchObject({ status: 'COMPLETED', completed_at: 300, review_word_ids_json: '["word-1","word-2"]' });
  });

  it('counts repeated quiz answers on the same day once', async () => {
    const fixture = setup({ newWords: 0, reviews: 0, quizDays: 2 });
    const quiz = (dateKey: string) => touchWeeklyMissionProgressFromQuiz(fixture.env, fixture.user, {
      bookId: 'book-1', dateKey, attemptedAt: 100,
    });
    await quiz('2026-09-07');
    await quiz('2026-09-07');
    expect(fixture.row()).toMatchObject({ status: 'IN_PROGRESS', quiz_day_keys_json: '["2026-09-07"]' });
    await quiz('2026-09-08');
    expect(fixture.row().status).toBe('COMPLETED');
  });

  it('retains both concurrent words and completes only after merging the winning write', async () => {
    const fixture = setup();
    await Promise.all([review(fixture, 'word-1'), review(fixture, 'word-2', 200)]);
    expect(new Set(JSON.parse(String(fixture.row().review_word_ids_json)))).toEqual(new Set(['word-1', 'word-2']));
    expect(fixture.row()).toMatchObject({ status: 'COMPLETED', last_activity_at: 200 });
  });

  it('never moves the last activity backwards after an older response arrives', async () => {
    const fixture = setup({ newWords: 0, reviews: 5, quizDays: 0 });
    await review(fixture, 'word-1', 500);
    await review(fixture, 'word-2', 100);
    expect(fixture.row().last_activity_at).toBe(500);
  });

  it.each(['ARCHIVED', 'COMPLETED'])('does not resurrect an assignment concurrently moved to %s', async (status) => {
    const fixture = setup();
    let intercepted = false;
    fixture.beforeRun((sql) => {
      if (intercepted || !sql.includes('UPDATE weekly_mission_assignments')) return;
      intercepted = true;
      fixture.sqlite.prepare('UPDATE weekly_mission_assignments SET status = ? WHERE id = ?').run(status, 'assignment-1');
    });
    await review(fixture, 'word-1');
    expect(fixture.row()).toMatchObject({ status, review_word_ids_json: '[]' });
  });

  it('returns a retryable conflict instead of claiming a save after repeated contention', async () => {
    const fixture = setup();
    let conflicts = 0;
    fixture.beforeRun((sql) => {
      if (!sql.includes('UPDATE weekly_mission_assignments')) return;
      conflicts += 1;
      fixture.sqlite.prepare('UPDATE weekly_mission_assignments SET last_activity_at = ?').run(conflicts);
    });
    await expect(review(fixture, 'word-1')).rejects.toMatchObject({ status: 409 });
    expect(conflicts).toBe(4);
    expect(fixture.row().review_word_ids_json).toBe('[]');
  });

  it('does not count activity for another book, student, or selected assignment', async () => {
    const fixture = setup();
    await touchWeeklyMissionProgressFromStudy(fixture.env, fixture.user, {
      wordId: 'word-1', bookId: 'other-book', existingWasStudy: true,
    });
    await touchWeeklyMissionProgressFromStudy(fixture.env, { id: 'other-student' } as DbUserRow, {
      wordId: 'word-1', bookId: 'book-1', existingWasStudy: true,
    });
    await touchWeeklyMissionProgressFromStudy(fixture.env, fixture.user, {
      wordId: 'word-1', bookId: 'book-1', assignmentId: 'other-assignment', existingWasStudy: true,
    });
    expect(fixture.row()).toMatchObject({ status: 'ASSIGNED', review_word_ids_json: '[]' });
  });
});
