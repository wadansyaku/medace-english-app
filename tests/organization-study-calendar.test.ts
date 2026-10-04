import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGetAllStudentsProgress } from '../functions/_shared/organization-student-read-model';
import { commitStudyAttempt } from '../functions/_shared/study-attempt-receipts';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { UserRole } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => {
  vi.useRealTimers();
  databases.splice(0).forEach(({ sqlite }) => sqlite.close());
});
const setNow = (date = '2026-10-04T12:00:00+09:00') => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(date));
};
const setup = () => {
  const fixture = createSqliteD1();
  databases.push(fixture);
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  for (const migration of readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(migration, migrationDirectory), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO users(id, email, display_name, role, created_at, updated_at) VALUES
      ('student-1', 'one@example.test', 'One', 'STUDENT', 1, 1),
      ('student-2', 'two@example.test', 'Two', 'STUDENT', 1, 1),
      ('student-3', 'three@example.test', 'Three', 'STUDENT', 1, 1),
      ('instructor-1', 'teacher@example.test', 'Teacher', 'INSTRUCTOR', 1, 1);
    INSERT INTO books(id, title, created_by, word_count, created_at, updated_at) VALUES
      ('personal', 'Personal', 'student-1', 1, 1, 1),
      ('other-owner', 'Other owner', 'student-2', 1, 1, 1),
      ('approved', 'Approved', NULL, 1, 1, 1),
      ('pending', 'Pending', NULL, 1, 1, 1);
    INSERT INTO words(id, book_id, word_number, word, definition, search_key, created_at, updated_at)
      SELECT id || '-word', id, 1, 'test', 'test', 'test', 1, 1 FROM books;
    INSERT INTO material_source_ledger(source_id, book_id, catalog_source, book_title, edition,
      rights_status, review_status, source_file, extracted_at, transform_log, content_qa_report,
      qa_word_count, created_at, updated_at) VALUES
      ('approved-ledger', 'approved', 'STEADY_STUDY_ORIGINAL', 'Approved', 'test',
        'approved', 'approved', 'synthetic', 'test', 'test', 'test', 1, 1, 1),
      ('pending-ledger', 'pending', 'LICENSED_PARTNER', 'Pending', 'test',
        'pending', 'needs_review', 'synthetic', 'test', 'test', 'test', 1, 1, 1);
  `);
  const env = { DB: fixture.DB } as AppEnv;
  return {
    ...fixture,
    env,
    event(date: string, book = 'personal', source = 'STUDY', user = 'student-1') {
      fixture.sqlite.prepare(`INSERT INTO learning_interaction_events
        (user_id, word_id, book_id, created_at, interaction_source)
        VALUES (?, ?, ?, ?, ?)`).run(user, `${book}-word`, book, Date.parse(date), source);
    },
    history(date: string, book = 'personal', source = 'STUDY') {
      fixture.sqlite.prepare(`INSERT INTO learning_histories
        (user_id, word_id, book_id, status, last_studied_at, next_review_date, interaction_source)
        VALUES ('student-1', ?, ?, 'LEARNING', ?, ?, ?)`)
        .run(`${book}-word`, book, Date.parse(date), Date.parse(date), source);
    },
    async days(user = { id: 'admin-1', role: UserRole.ADMIN } as DbUserRow) {
      const students = await handleGetAllStudentsProgress(env, user);
      return students.find(student => student.uid === 'student-1')?.activeStudyDays7d;
    },
  };
};

describe('teacher study days: today and the preceding six JST calendar days', () => {
  it.each([
    ['2026-09-27T23:59:59.999+09:00', 0],
    ['2026-09-28T00:00:00+09:00', 1],
    ['2026-09-28T07:00:00+09:00', 1],
    ['2026-10-04T00:00:00+09:00', 1],
    ['2026-10-04T12:00:00+09:00', 1],
    ['2026-10-04T12:00:00.001+09:00', 0],
    ['2026-10-05T00:00:00+09:00', 0],
  ])('counts the boundary event at %s as %i day(s)', async (date, expected) => {
    setNow();
    const fixture = setup();
    fixture.event(date);
    expect(await fixture.days()).toBe(expected);
  });

  it('keeps six-days-ago morning activity throughout today and drops it at the next JST midnight', async () => {
    const fixture = setup();
    fixture.event('2026-09-28T07:00:00+09:00');
    for (const time of ['00:00:00', '12:00:00', '23:59:59.999']) {
      setNow(`2026-10-04T${time}+09:00`);
      expect(await fixture.days()).toBe(1);
    }
    setNow('2026-10-05T00:00:00+09:00');
    expect(await fixture.days()).toBe(0);
  });

  it('counts JST dates once and never exceeds seven days, even across UTC midnight', async () => {
    setNow();
    const fixture = setup();
    for (let day = 28; day <= 30; day++) fixture.event(`2026-09-${day}T00:00:00+09:00`);
    for (let day = 1; day <= 4; day++) fixture.event(`2026-10-0${day}T00:00:00+09:00`);
    fixture.event('2026-10-03T15:30:00Z'); // Oct 4 in Japan.
    fixture.event('2026-10-04T03:00:00Z');
    fixture.history('2026-10-04T03:00:00Z');
    expect(await fixture.days()).toBe(7);
  });

  it('retains both days when a real SRS attempt overwrites the same word history', async () => {
    const fixture = setup();
    const input = { wordId: 'personal-word', bookId: 'personal', rating: 2, responseTimeMs: 100 };
    setNow('2026-09-28T07:00:00+09:00');
    await commitStudyAttempt(fixture.env, 'student-1', { ...input, clientAttemptId: 'day-one' }, { bookProgressionBand: 1 });
    setNow();
    await commitStudyAttempt(fixture.env, 'student-1', { ...input, clientAttemptId: 'day-two' }, { bookProgressionBand: 1 });
    expect(await fixture.days()).toBe(2);
  });

  it('retains legacy STUDY history, applies its bounds and deduplicates it against events', async () => {
    setNow();
    const fixture = setup();
    fixture.history('2026-09-28T07:00:00+09:00');
    expect(await fixture.days()).toBe(1);
    fixture.event('2026-09-28T08:00:00+09:00');
    expect(await fixture.days()).toBe(1);
    fixture.sqlite.prepare('UPDATE learning_histories SET last_studied_at = ?').run(Date.parse('2026-09-27T23:59:59+09:00'));
    fixture.sqlite.exec('DELETE FROM learning_interaction_events');
    expect(await fixture.days()).toBe(0);
    fixture.sqlite.prepare('UPDATE learning_histories SET last_studied_at = ?').run(Date.now() + 1);
    expect(await fixture.days()).toBe(0);
  });

  it('excludes quizzes, another learner’s books and unapproved material in both sources', async () => {
    setNow();
    const fixture = setup();
    fixture.event('2026-10-01T07:00:00+09:00', 'personal', 'QUIZ');
    fixture.history('2026-10-01T07:00:00+09:00', 'personal', 'QUIZ');
    for (const book of ['pending', 'other-owner']) {
      fixture.event('2026-10-02T07:00:00+09:00', book);
      fixture.history('2026-10-02T07:00:00+09:00', book);
    }
    expect(await fixture.days()).toBe(0);
    fixture.event('2026-10-03T07:00:00+09:00', 'approved');
    fixture.history('2026-10-03T07:00:00+09:00', 'approved');
    expect(await fixture.days()).toBe(1);
    fixture.sqlite.exec("UPDATE material_source_ledger SET qa_required_blank_rows = 1 WHERE book_id = 'approved'");
    expect(await fixture.days()).toBe(0);
  });

  it('keeps instructor assignment and organization visibility on the real SQL path', async () => {
    setNow();
    const fixture = setup();
    fixture.sqlite.exec(`
      INSERT INTO organizations(id, display_name, name_key, created_at, updated_at)
        VALUES ('school-1', 'School', 'school', 1, 1), ('school-2', 'Other', 'other', 1, 1);
      INSERT INTO organization_memberships(user_id, organization_id, role, status, created_at, updated_at) VALUES
        ('instructor-1', 'school-1', 'INSTRUCTOR', 'ACTIVE', 1, 1),
        ('student-1', 'school-1', 'STUDENT', 'ACTIVE', 1, 1),
        ('student-2', 'school-1', 'STUDENT', 'ACTIVE', 1, 1),
        ('student-3', 'school-2', 'STUDENT', 'ACTIVE', 1, 1);
      INSERT INTO student_instructor_assignments(student_user_id, instructor_user_id, created_at, updated_at)
        VALUES ('student-1', 'instructor-1', 1, 1), ('student-3', 'instructor-1', 1, 1);
    `);
    for (const user of ['student-1', 'student-2', 'student-3']) fixture.event('2026-09-28T07:00:00+09:00', 'approved', 'STUDY', user);
    const students = await handleGetAllStudentsProgress(fixture.env, { id: 'instructor-1', role: UserRole.INSTRUCTOR } as DbUserRow);
    expect(students.map(student => [student.uid, student.activeStudyDays7d])).toEqual([['student-1', 1]]);
  });
});
