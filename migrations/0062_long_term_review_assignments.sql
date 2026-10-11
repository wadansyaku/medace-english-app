-- Start-time assignment is independent of answers and the canonical SRS history.
-- Keep allocations after material deletion: deletion must not refund a daily slot.
CREATE TABLE long_term_review_starts (
  user_id TEXT NOT NULL,
  client_session_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  commit_token TEXT NOT NULL,
  day_key TEXT NOT NULL,
  start_ordinal INTEGER NOT NULL CHECK (start_ordinal > 0),
  session_limit INTEGER NOT NULL CHECK (session_limit BETWEEN 1 AND 100),
  session_quota INTEGER NOT NULL CHECK (session_quota BETWEEN 0 AND 3),
  normal_word_ids_json TEXT NOT NULL CHECK (json_valid(normal_word_ids_json)),
  result_word_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(result_word_ids_json)),
  graduate_word_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(graduate_word_ids_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, client_session_id),
  UNIQUE (user_id, day_key, start_ordinal),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE graduated_review_allocations (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  word_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  slot_number INTEGER NOT NULL CHECK (slot_number IN (1, 2, 3, 4, 5)),
  client_session_id TEXT NOT NULL,
  allocated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day_key, word_id),
  UNIQUE (user_id, day_key, slot_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_graduated_review_allocations_start
  ON graduated_review_allocations(user_id, client_session_id, slot_number);
