import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '../../functions/_shared/types';

// Execute the production SQL against an isolated SQLite database, including
// transaction rollback. This adapter never opens the application's local D1.
export const createSqliteD1 = () => {
  const sqlite = new DatabaseSync(':memory:');
  const statements = new WeakMap<D1PreparedStatement, { sql: string; values: SQLInputValue[] }>();
  let beforeRun: ((sql: string, values: SQLInputValue[]) => void) | undefined;
  const execute = (statement: D1PreparedStatement): D1Result => {
    const { sql, values } = statements.get(statement)!;
    beforeRun?.(sql, values);
    const result = sqlite.prepare(sql).run(...values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  };
  const DB: D1Database = {
    prepare(sql) {
      const record = { sql, values: [] as SQLInputValue[] };
      const statement: D1PreparedStatement = {
        bind(...values) {
          record.values = values as SQLInputValue[];
          return statement;
        },
        async first<TRow>() {
          return (sqlite.prepare(sql).get(...record.values) as TRow | undefined) ?? null;
        },
        async all<TRow>() {
          return { success: true, meta: {}, results: sqlite.prepare(sql).all(...record.values) as TRow[] };
        },
        async run() { return execute(statement); },
      };
      statements.set(statement, record);
      return statement;
    },
    async batch(batchStatements) {
      sqlite.exec('BEGIN');
      try {
        const results = batchStatements.map(execute);
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {
    DB,
    sqlite,
    beforeRun(callback: typeof beforeRun) { beforeRun = callback; },
  };
};
