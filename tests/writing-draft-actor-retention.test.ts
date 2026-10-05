import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteExpiredDemoUsers } from '../functions/_shared/auth';
import { createSqliteD1 } from './helpers/sqlite-d1';

const oldMigration = readFileSync(new URL('../migrations/0051_writing_unassessed_drafts.sql', import.meta.url), 'utf8');
const repair = readFileSync(new URL('../migrations/0053_writing_draft_actor_retention.sql', import.meta.url), 'utf8');
const tables = ['writing_input_drafts', 'writing_ai_data_approvals', 'writing_ai_drafts'] as const;
const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(fixture => fixture.sqlite.close()));
const setup = () => {
  const fixture = createSqliteD1(); fixtures.push(fixture);
  fixture.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,role TEXT,created_at INTEGER);
    INSERT INTO users VALUES
      ('expired','demo_ADMIN_expired@medace.app','ADMIN',1),
      ('teacher','demo_INSTRUCTOR_current@medace.app','INSTRUCTOR',200),
      ('student','synthetic@example.invalid','STUDENT',200);
    CREATE TABLE writing_assignments(id TEXT PRIMARY KEY,
      student_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      instructor_user_id TEXT REFERENCES users(id) ON DELETE CASCADE);
    INSERT INTO writing_assignments VALUES('assignment','student','teacher');
    CREATE TABLE password_reset_tokens(id TEXT PRIMARY KEY,created_by TEXT REFERENCES users(id));
    INSERT INTO password_reset_tokens VALUES('token','expired');`);
  fixture.sqlite.exec(oldMigration);
  fixture.sqlite.prepare(`INSERT INTO writing_input_drafts VALUES('assignment',1,'student',7,?,?,'save-key',?,'expired',10,30)`)
    .run('Synthetic saved answer.', '["original-asset"]', 'a'.repeat(64));
  fixture.sqlite.exec(`INSERT INTO writing_ai_data_approvals VALUES('assignment','SYNTHETIC_ONLY','BOTH','synthetic-only-proof','expired',9999999999999,NULL,10);`);
  fixture.sqlite.prepare(`INSERT INTO writing_ai_drafts VALUES('request-key','assignment',1,7,'expired',?,'WRITING_FEEDBACK','READY','UNASSESSED',?,NULL,10,30)`)
    .run('b'.repeat(64), '{"correctedDraft":"Synthetic suggestion."}');
  const snapshot = () => Object.fromEntries(tables.map(table => [table, fixture.sqlite.prepare(`SELECT * FROM ${table}`).all()]));
  return { ...fixture, snapshot, env: { DB: fixture.DB } };
};

describe('Writing draft actor account lifetime', () => {
  it('reproduces the old foreign-key failure and rolls back the whole cleanup batch', async () => {
    const f = setup(); const before = f.snapshot();
    await expect(deleteExpiredDemoUsers(f.env, 100)).rejects.toThrow(/FOREIGN KEY/);
    expect(f.snapshot()).toEqual(before);
    expect(f.sqlite.prepare('SELECT created_by FROM password_reset_tokens').get()!.created_by).toBe('expired');
    expect(f.sqlite.prepare("SELECT id FROM users WHERE id='expired'").get()).toBeDefined();
  });

  it('preserves every existing draft, original reference, result and approval column during migration', () => {
    const f = setup(); const before = f.snapshot();
    f.sqlite.exec(repair);
    expect(f.snapshot()).toEqual(before);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(f.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='idx_writing_ai_drafts_assignment'").get()).toBeDefined();
    expect(() => f.sqlite.exec("UPDATE writing_input_drafts SET revision=0")).toThrow(/CHECK/);
    expect(() => f.sqlite.exec("UPDATE writing_ai_drafts SET assessment_status='ASSESSED'")).toThrow(/CHECK/);
  });

  it('cleans up an expired non-owner actor while preserving answers and disabling the deleted ADMIN approval', async () => {
    const f = setup(); f.sqlite.exec(repair); const before = f.snapshot();
    const approved = () => f.sqlite.prepare(`SELECT a.assignment_id FROM writing_ai_data_approvals a
      JOIN users u ON u.id=a.approved_by AND u.role='ADMIN'
      WHERE a.assignment_id='assignment' AND a.revoked_at IS NULL AND a.expires_at>100
        AND a.data_scope IN ('SYNTHETIC_ONLY','ADULT_CONSENTED')
        AND a.operation_scope IN ('WRITING_FEEDBACK','BOTH') AND length(trim(a.policy_reference))>0`).all();
    expect(approved()).toHaveLength(1);
    await deleteExpiredDemoUsers(f.env, 100);
    expect(approved()).toEqual([]);
    for (const [table, actorColumn] of [
      ['writing_input_drafts', 'last_saved_by'], ['writing_ai_data_approvals', 'approved_by'], ['writing_ai_drafts', 'requested_by'],
    ]) {
      expect(f.sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(before[table].map(row => ({ ...row, [actorColumn]: null })));
    }
    expect(f.sqlite.prepare('SELECT id FROM users ORDER BY id').all()).toEqual([{ id: 'student' }, { id: 'teacher' }]);
    expect(f.sqlite.prepare('SELECT id FROM writing_assignments').all()).toEqual([{ id: 'assignment' }]);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    await expect(deleteExpiredDemoUsers(f.env, 100)).resolves.toBeUndefined();
  });

  it('still rolls back metadata nulling if another account cleanup constraint fails', async () => {
    const f = setup(); f.sqlite.exec(repair); const before = f.snapshot();
    f.sqlite.exec("CREATE TABLE remaining_restriction(actor TEXT REFERENCES users(id)); INSERT INTO remaining_restriction VALUES('expired');");
    await expect(deleteExpiredDemoUsers(f.env, 100)).rejects.toThrow(/FOREIGN KEY/);
    expect(f.snapshot()).toEqual(before);
    expect(f.sqlite.prepare('SELECT created_by FROM password_reset_tokens').get()!.created_by).toBe('expired');
  });

  it('keeps owner deletion cascades and removes assignment-bound data without orphan rows', () => {
    const f = setup(); f.sqlite.exec(repair);
    f.sqlite.exec("DELETE FROM users WHERE id='student'");
    for (const table of [...tables, 'writing_assignments']) expect(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n).toBe(0);
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
