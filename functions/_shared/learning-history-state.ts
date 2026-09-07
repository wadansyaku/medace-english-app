import type { DbHistoryRow } from './storage-support';

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
