-- Separate from the original five-question trial. Bind a guest learning session
-- before applying SRS; immutable attempts recover partial/lost-response imports.
CREATE TABLE guest_learning_claims (
  session_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL CHECK (version = 'naru-guest-v1'),
  imported_at INTEGER NOT NULL
);
CREATE INDEX idx_guest_learning_claims_user ON guest_learning_claims(user_id);

CREATE TABLE guest_learning_attempts (
  session_id TEXT NOT NULL REFERENCES guest_learning_claims(session_id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 3),
  response_time_ms INTEGER NOT NULL CHECK (response_time_ms BETWEEN 0 AND 3600000),
  answered_at INTEGER NOT NULL,
  client_attempt_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (session_id, attempt_id)
);
