-- The receipt, SRS state, and immutable interaction event commit together.
-- Receipts store identifiers and timing only; no question or answer text.
CREATE TABLE study_attempt_receipts (
  user_id TEXT NOT NULL,
  client_attempt_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  commit_token TEXT NOT NULL,
  word_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  mission_assignment_id TEXT,
  existing_was_study INTEGER NOT NULL CHECK (existing_was_study IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, client_attempt_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (mission_assignment_id) REFERENCES weekly_mission_assignments(id) ON DELETE SET NULL
);
CREATE INDEX idx_study_attempt_receipts_user_created ON study_attempt_receipts(user_id, created_at DESC);
