CREATE TABLE IF NOT EXISTS learning_interaction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  interaction_source TEXT NOT NULL,
  question_mode TEXT,
  correct INTEGER,
  rating INTEGER,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  interval_days_before INTEGER,
  book_progression_band INTEGER,
  mission_assignment_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (mission_assignment_id) REFERENCES weekly_mission_assignments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_interaction_events_user_created
  ON learning_interaction_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_interaction_events_user_mode_created
  ON learning_interaction_events(user_id, question_mode, created_at DESC);

CREATE TABLE IF NOT EXISTS student_weakness_signals (
  user_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  level TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  next_action_label TEXT NOT NULL,
  recommended_action_type TEXT NOT NULL,
  target_question_modes_json TEXT NOT NULL DEFAULT '[]',
  target_band_index INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, dimension),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_weakness_signals_user_updated
  ON student_weakness_signals(user_id, updated_at DESC);
