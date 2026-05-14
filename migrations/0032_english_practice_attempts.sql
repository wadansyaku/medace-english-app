CREATE TABLE IF NOT EXISTS english_practice_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_attempt_id TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('grammar', 'translation', 'reading', 'writing')),
  mode TEXT NOT NULL CHECK (mode IN ('GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT', 'JA_TRANSLATION_ORDER', 'READING', 'WRITING')),
  correct INTEGER NOT NULL DEFAULT 0,
  score REAL,
  max_score REAL,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  word_id TEXT,
  book_id TEXT,
  grammar_scope_id TEXT,
  scope_label_ja TEXT,
  reading_question_kind TEXT,
  level TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  delegated_quiz_attempt INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL,
  UNIQUE(user_id, client_attempt_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE SET NULL,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_english_practice_attempts_user_lane_created
  ON english_practice_attempts(user_id, lane, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_english_practice_attempts_user_created
  ON english_practice_attempts(user_id, created_at DESC);
