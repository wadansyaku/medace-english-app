import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitStudyAttempt } from '../functions/_shared/study-attempt-receipts';
import { handleSaveSrsHistory } from '../functions/_shared/storage-learning-actions';
import { buildSrsHistory, type StudyAttemptInput } from '../shared/srs';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => databases.splice(0).forEach(({ sqlite }) => sqlite.close()));
const setup = () => {
  const fixture = createSqliteD1();
  databases.push(fixture);
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  for (const migration of readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(migration, migrationDirectory), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO users(id, email, display_name, role, created_at, updated_at)
      VALUES ('student-1', 'one@example.test', 'One', 'STUDENT', 1, 1), ('student-2', 'two@example.test', 'Two', 'STUDENT', 1, 1);
    INSERT INTO books(id, title, created_at, updated_at) VALUES ('book-1', 'Book', 1, 1);
    INSERT INTO words(id, book_id, word_number, word, definition, search_key, created_at, updated_at)
      VALUES ('word-1', 'book-1', 1, 'test', 'test', 'test', 1, 1), ('word-2', 'book-1', 2, 'next', 'next', 'next', 1, 1);
  `);
  return {
    ...fixture,
    env: { DB: fixture.DB } as AppEnv,
    history: (userId = 'student-1') => fixture.sqlite.prepare('SELECT * FROM learning_histories WHERE user_id = ? AND word_id = ?').get(userId, 'word-1'),
    count: (table: 'learning_histories' | 'learning_interaction_events' | 'study_attempt_receipts') => fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count,
  };
};
const input: StudyAttemptInput = { wordId: 'word-1', bookId: 'book-1', rating: 2, responseTimeMs: 120, clientAttemptId: 'attempt-1' };
const context = { bookProgressionBand: 1 };

describe('atomic SRS attempts', () => {
  it('returns the original receipt after a response is lost without awarding another attempt', async () => {
    const fixture = setup();
    const first = await commitStudyAttempt(fixture.env, 'student-1', input, context);
    const retried = await commitStudyAttempt(fixture.env, 'student-1', input, context);
    expect(retried).toMatchObject(first);
    expect(fixture.history()).toMatchObject({ attempt_count: 1, correct_count: 1, interval_days: 1, total_response_time_ms: 120 });
    expect(fixture.count('learning_interaction_events')).toBe(1);
    expect(fixture.count('study_attempt_receipts')).toBe(1);
  });

  it('commits concurrent retries of one receipt exactly once', async () => {
    const fixture = setup();
    const receipts = await Promise.all(Array.from({ length: 5 }, () => commitStudyAttempt(fixture.env, 'student-1', input, context)));
    expect(new Set(receipts.map((receipt) => receipt.created_at)).size).toBe(1);
    expect(fixture.history()?.attempt_count).toBe(1);
    expect(fixture.count('learning_interaction_events')).toBe(1);
    expect(fixture.count('study_attempt_receipts')).toBe(1);
  });

  it('preserves every distinct concurrent answer and advances SRS from the latest committed state', async () => {
    const fixture = setup();
    await Promise.all(Array.from({ length: 5 }, (_, index) => commitStudyAttempt(fixture.env, 'student-1', {
      ...input, clientAttemptId: `attempt-${index}`,
    }, context)));
    expect(fixture.history()).toMatchObject({ attempt_count: 5, correct_count: 5, interval_days: 50, total_response_time_ms: 600 });
    expect(fixture.count('learning_interaction_events')).toBe(5);
    expect(fixture.count('study_attempt_receipts')).toBe(5);
  });

  it('rolls back the receipt and history if the event fails, then safely accepts retry', async () => {
    const fixture = setup();
    fixture.beforeRun((sql) => { if (sql.includes('INSERT INTO learning_interaction_events')) throw new Error('injected event failure'); });
    await expect(commitStudyAttempt(fixture.env, 'student-1', input, context)).rejects.toThrow('injected event failure');
    for (const table of ['learning_histories', 'learning_interaction_events', 'study_attempt_receipts'] as const) expect(fixture.count(table)).toBe(0);
    fixture.beforeRun(undefined);
    await commitStudyAttempt(fixture.env, 'student-1', input, context);
    expect(fixture.history()?.attempt_count).toBe(1);
  });

  it.each([{ rating: 0 }, { responseTimeMs: 240 }, { wordId: 'word-2' }])('rejects a changed answer under an existing attempt id: %s', async (change) => {
    const fixture = setup();
    await commitStudyAttempt(fixture.env, 'student-1', input, context);
    await expect(commitStudyAttempt(fixture.env, 'student-1', { ...input, ...change }, context)).rejects.toMatchObject({ status: 409 });
    expect(fixture.count('learning_interaction_events')).toBe(1);
  });

  it('scopes receipt ids to a user and keeps legacy requests without ids compatible', async () => {
    const fixture = setup();
    await commitStudyAttempt(fixture.env, 'student-1', input, context);
    await commitStudyAttempt(fixture.env, 'student-2', input, context);
    await commitStudyAttempt(fixture.env, 'student-1', { ...input, clientAttemptId: undefined }, context);
    await commitStudyAttempt(fixture.env, 'student-1', { ...input, clientAttemptId: undefined }, context);
    expect(fixture.history()?.attempt_count).toBe(3);
    expect(fixture.history('student-2')?.attempt_count).toBe(1);
    expect(fixture.count('study_attempt_receipts')).toBe(4);
  });

  it('preserves the original mission and new/review classification for projection retries', async () => {
    const fixture = setup();
    fixture.sqlite.exec(`
      INSERT INTO weekly_missions (id, created_by_user_id, learning_track, title, rationale, due_at, created_at, updated_at)
        VALUES ('mission-1', 'student-1', 'SCHOOL_TERM', 'Mission', 'Practice', 10000, 1, 1);
      INSERT INTO weekly_mission_assignments (id, mission_id, student_user_id, assigned_by_user_id, status, assigned_at, updated_at)
        VALUES ('mission-original', 'mission-1', 'student-1', 'student-1', 'ARCHIVED', 1, 1),
               ('mission-new', 'mission-1', 'student-1', 'student-1', 'ASSIGNED', 1, 1);
    `);
    const original = await commitStudyAttempt(fixture.env, 'student-1', input, { ...context, missionAssignmentId: 'mission-original' });
    await commitStudyAttempt(fixture.env, 'student-1', { ...input, clientAttemptId: 'second' }, context);
    const retry = await commitStudyAttempt(fixture.env, 'student-1', input, { ...context, missionAssignmentId: 'mission-new' });
    expect(original.existing_was_study).toBe(0);
    expect(retry).toMatchObject({ existing_was_study: 0, mission_assignment_id: 'mission-original' });
  });

  it('cascades receipts with deleted study data', async () => {
    const fixture = setup();
    await commitStudyAttempt(fixture.env, 'student-1', input, context);
    fixture.sqlite.exec("DELETE FROM users WHERE id = 'student-1'");
    expect(fixture.count('study_attempt_receipts')).toBe(0);
  });
});

describe('SRS input boundaries', () => {
  it.each([
    { rating: -1 }, { rating: 4 }, { rating: 1.5 }, { responseTimeMs: -1 },
    { responseTimeMs: Infinity }, { responseTimeMs: 3_600_001 }, { clientAttemptId: '' },
    { clientAttemptId: 'x'.repeat(161) },
  ])('rejects malformed input before any D1 access: %s', async (change) => {
    const prepare = vi.fn();
    const candidate = { ...input, ...change };
    await expect(handleSaveSrsHistory({ DB: { prepare } } as never, { id: 'student-1' } as DbUserRow,
      { id: candidate.wordId, bookId: candidate.bookId }, candidate.rating, candidate.responseTimeMs,
      undefined, undefined, candidate.clientAttemptId)).rejects.toMatchObject({ status: 400 });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('keeps shared SRS transitions bounded and preserves cumulative statistics', () => {
    let history;
    for (let index = 0; index < 50; index += 1) history = buildSrsHistory(history, { ...input, rating: 3 }, index);
    expect(history).toMatchObject({ attemptCount: 50, correctCount: 50, totalResponseTimeMs: 6000, interval: 365, status: 'graduated' });
  });
});
