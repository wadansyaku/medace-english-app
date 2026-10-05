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
