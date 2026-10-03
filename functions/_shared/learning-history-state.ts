import type { DbHistoryRow } from './storage-support';

export interface SqlSnapshotCondition {
  sql: string;
  bindings: unknown[];
}

// Table/column names are fixed by callers, never supplied by an API request.
export const buildRowSnapshotCondition = (
  table: string,
  keys: Record<string, unknown>,
  fields: readonly string[],
  row: Record<string, unknown> | null,
): SqlSnapshotCondition => {
  const keyEntries = Object.entries(keys);
  const where = keyEntries.map(([key]) => `${key} IS ?`).join(' AND ');
  return row ? {
    sql: `EXISTS (SELECT 1 FROM ${table} WHERE ${where} AND ${fields.map((field) => `${field} IS ?`).join(' AND ')})`,
    bindings: [...keyEntries.map(([, value]) => value), ...fields.map((field) => row[field] ?? null)],
  } : {
    sql: `NOT EXISTS (SELECT 1 FROM ${table} WHERE ${where})`,
    bindings: keyEntries.map(([, value]) => value),
  };
};

const HISTORY_FIELDS = [
  'book_id', 'status', 'last_studied_at', 'next_review_date', 'interval_days', 'ease_factor',
  'correct_count', 'attempt_count', 'total_response_time_ms', 'interaction_source',
] as const;

export const buildHistorySnapshotCondition = (userId: string, wordId: string, existing: DbHistoryRow | null) => ({
  sql: existing
    ? `EXISTS (SELECT 1 FROM learning_histories h WHERE h.user_id = ? AND h.word_id = ? AND ${HISTORY_FIELDS.map((field) => `h.${field} IS ?`).join(' AND ')})`
    : 'NOT EXISTS (SELECT 1 FROM learning_histories h WHERE h.user_id = ? AND h.word_id = ?)',
  bindings: [userId, wordId, ...(existing ? HISTORY_FIELDS.map((field) => existing[field]) : [])],
});
