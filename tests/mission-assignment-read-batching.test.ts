import { afterEach, describe, expect, it } from 'vitest';
import { readMissionAssignmentsByStudent } from '../functions/_shared/storage-mission-actions';
import type { AppEnv, D1Database } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => databases.splice(0).forEach(({ sqlite }) => sqlite.close()));

const setup = () => {
  const database = createSqliteD1();
  databases.push(database);
  database.sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT);
    CREATE TABLE writing_assignments (id TEXT PRIMARY KEY, prompt_title TEXT, status TEXT);
    CREATE TABLE weekly_missions (
      id TEXT PRIMARY KEY, organization_id TEXT, created_by_user_id TEXT, learning_track TEXT,
      title TEXT, rationale TEXT, book_id TEXT, book_title TEXT, new_words_target INTEGER,
      review_words_target INTEGER, quiz_target_count INTEGER, writing_assignment_id TEXT,
      due_at INTEGER, status TEXT, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE weekly_mission_assignments (
      id TEXT PRIMARY KEY, student_user_id TEXT, assigned_by_user_id TEXT, mission_id TEXT,
      assigned_at INTEGER, started_at INTEGER, restarted_at INTEGER, last_activity_at INTEGER,
      completed_at INTEGER, status TEXT, new_word_ids_json TEXT, review_word_ids_json TEXT,
      quiz_day_keys_json TEXT
    );
    INSERT INTO users VALUES ('assigner', 'Teacher');
    INSERT INTO weekly_missions VALUES (
      'mission', NULL, 'assigner', 'SCHOOL_TERM', 'Mission', 'Reason', NULL, NULL,
      2, 1, 1, NULL, 9999999999999, 'ASSIGNED', 1, 1
    );
  `);
  const bindings: unknown[][] = [];
  const DB: D1Database = {
    ...database.DB,
    prepare(sql) {
      const statement = database.DB.prepare(sql);
      return {
        ...statement,
        bind(...values) {
          // SQLite's native limit differs from D1: explicitly enforce D1's limit here.
          if (values.length > 100) throw new Error('too many SQL variables');
          expect((sql.match(/\?/g) ?? []).length).toBe(values.length);
          bindings.push(values);
          return statement.bind(...values);
        },
      };
    },
  };
  const student = (uid: string) => database.sqlite.prepare('INSERT INTO users VALUES (?, ?)').run(uid, uid);
  const assignment = (id: string, uid: string, at: number, status: string | null = 'ASSIGNED') => {
    database.sqlite.prepare(`INSERT INTO weekly_mission_assignments VALUES (
      ?, ?, 'assigner', 'mission', ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL
    )`).run(id, uid, at, status);
  };
  return { env: { DB } as AppEnv, bindings, student, assignment };
};

describe('mission assignment reads under the D1 parameter limit', () => {
  it('does not query for an empty authorized student set', async () => {
    const fixture = setup();
    expect(await readMissionAssignmentsByStudent(fixture.env, [])).toEqual(new Map());
    expect(fixture.bindings).toEqual([]);
  });

  it.each([99, 100, 205])('retains all %i students, newest assignments and global order across bounded queries', async (count) => {
    const fixture = setup();
    const ids = Array.from({ length: count }, (_, index) => `student-${index}`);
    ids.forEach((uid, index) => {
      fixture.student(uid);
      fixture.assignment(`old-${index}`, uid, index);
      fixture.assignment(`latest-${index}`, uid, index + 1000);
      fixture.assignment(`archived-${index}`, uid, index + 2000, 'ARCHIVED');
      fixture.assignment(`null-status-${index}`, uid, index + 3000, null);
    });
    fixture.student('outside');
    fixture.assignment('outside-assignment', 'outside', 9999);
    fixture.student('no-assignment');
    const result = await readMissionAssignmentsByStudent(fixture.env, [...ids, ids[0], 'no-assignment']);
    expect([...result.keys()]).toEqual([...ids].reverse());
    expect(result.size).toBe(count);
    ids.forEach((uid, index) => {
      expect(result.get(uid)).toMatchObject({ id: `latest-${index}`, studentUid: uid, assignedAt: index + 1000 });
      expect(result.get(uid)?.mission.bookId).toBeUndefined();
      expect(result.get(uid)?.mission.writingAssignmentId).toBeUndefined();
      expect(result.get(uid)?.progress.newWordsCompleted).toBe(0);
    });
    expect(fixture.bindings).toHaveLength(Math.ceil((count + 1) / 99));
    expect(fixture.bindings.every(values => values.length <= 100 && values.at(-1) === 'ARCHIVED')).toBe(true);
    expect(fixture.bindings.flatMap(values => values.slice(0, -1))).toEqual([...ids, 'no-assignment']);
  });
});
