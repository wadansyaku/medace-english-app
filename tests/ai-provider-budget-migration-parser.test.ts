import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unstable_splitSqlQuery } from 'wrangler';

const migration = readFileSync(new URL('../migrations/0050_ai_provider_budget.sql', import.meta.url), 'utf8');

describe('provider budget migration transport', () => {
  it('keeps each trigger on one LF-only line with an uppercase BEGIN for remote parsing', () => {
    expect(migration).not.toContain('\r');
    const triggers = unstable_splitSqlQuery(migration).filter(statement => statement.includes('CREATE TRIGGER'));
    expect(triggers).toHaveLength(8);
    for (const statement of triggers) {
      const trigger = statement.slice(statement.indexOf('CREATE TRIGGER'));
      expect(trigger).not.toContain('\n');
      expect(trigger).toMatch(/\bBEGIN\b.*\bEND$/);
      expect(trigger).not.toMatch(/\bCASE\b/);
      expect(trigger.match(/\bEND\b/g)).toHaveLength(1);
    }
  });

  it.each([
    { state: 'SETTLED', held: 0, blocked: 0, code: 'AI_BUDGET_INVALID_INITIAL_STATE' },
    { state: 'RESERVED', held: 0, blocked: 1, code: 'AI_BUDGET_BLOCKED' },
    { state: 'RESERVED', held: 4_400_001, blocked: 0, code: 'AI_BUDGET_EXHAUSTED' },
  ])('retains the direct-write guard for $code', ({ state, held, blocked, code }) => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(migration);
      sqlite.prepare('INSERT INTO ai_provider_budget_months(month_key,created_at) VALUES(?,?)').run('2026-10', 1);
      const insert = sqlite.prepare(`INSERT INTO ai_provider_budget_reservations
        (request_id,reserve_token,fingerprint,month_key,upper_bound_micro_usd,pricing_version,state,created_at)
        VALUES(?,?,?,'2026-10',?,'test-price',?,1)`);
      if (held) insert.run('prior', 'prior-token', 'a'.repeat(64), held, 'RESERVED');
      if (blocked) sqlite.exec('UPDATE ai_provider_budget_months SET blocked=1');
      expect(() => insert.run('new', 'new-token', 'a'.repeat(64), 100_000, state)).toThrow(code);
      expect(sqlite.prepare('SELECT accounted_micro_usd,blocked FROM ai_provider_budget_months').get()).toEqual({ accounted_micro_usd: held, blocked });
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_provider_usage_audit').get()!.n).toBe(held ? 1 : 0);
    } finally {
      sqlite.close();
    }
  });

  it.each([0, 1])('preserves the blocked flag %i across settlement boundaries', blocked => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(migration);
      const evaluate = sqlite.prepare('SELECT CASE WHEN ? > ? THEN 1 ELSE ? END AS previous, MAX(?, ? > ?) AS repaired');
      for (const charged of [0, 9, 10, 11, Number.MAX_SAFE_INTEGER]) {
        const row = evaluate.get(charged, 10, blocked, blocked, charged, 10)!;
        expect(row.repaired).toBe(row.previous);
      }
    } finally {
      sqlite.close();
    }
  });

  it('replays all complete statements with the migration ledger append used by Wrangler', () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)');
      const query = `${migration}\nINSERT INTO "d1_migrations" (name) values ('0050_ai_provider_budget.sql');`;
      const statements = unstable_splitSqlQuery(query);
      expect(statements).toHaveLength(14);
      sqlite.exec('BEGIN');
      for (const statement of statements) sqlite.exec(statement);
      sqlite.exec('COMMIT');
      expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'ai_provider_%'").all()).toHaveLength(8);
      expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ai_provider_%'").all()).toHaveLength(3);
      expect(sqlite.prepare('SELECT name FROM d1_migrations').all()).toEqual([{ name: '0050_ai_provider_budget.sql' }]);
    } finally {
      sqlite.close();
    }
  });
});
