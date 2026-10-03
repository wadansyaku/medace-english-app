-- Quiz receipts are separate from SRS ratings. The canonical answer, CBT
-- effects and immutable interaction event commit in the same D1 transaction.
CREATE TABLE quiz_attempt_receipts (
  user_id TEXT NOT NULL,
  client_attempt_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  commit_token TEXT NOT NULL,
  word_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  mission_assignment_id TEXT,
  created_at INTEGER NOT NULL,
  projection_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (projection_status IN ('PENDING', 'COMPLETE')),
  projection_failed_at INTEGER,
  PRIMARY KEY (user_id, client_attempt_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (mission_assignment_id) REFERENCES weekly_mission_assignments(id) ON DELETE SET NULL
);
CREATE INDEX idx_quiz_attempt_receipts_pending ON quiz_attempt_receipts(user_id, projection_status, created_at);
