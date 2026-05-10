CREATE TABLE IF NOT EXISTS cbt_learner_scope_states (
  user_id TEXT NOT NULL,
  grammar_scope_id TEXT NOT NULL,
  question_mode TEXT NOT NULL,
  mastery_level REAL NOT NULL DEFAULT 0.5 CHECK (mastery_level >= 0 AND mastery_level <= 1),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, grammar_scope_id, question_mode),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cbt_learner_scope_states_user_mastery
  ON cbt_learner_scope_states(user_id, grammar_scope_id, mastery_level, updated_at DESC);

CREATE TABLE IF NOT EXISTS japanese_translation_feedback_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  question_mode TEXT NOT NULL,
  grammar_scope_id TEXT,
  source_sentence TEXT NOT NULL,
  expected_translation TEXT NOT NULL,
  user_translation TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  verdict_label TEXT NOT NULL,
  feedback_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_translation_feedback_user_scope
  ON japanese_translation_feedback_events(user_id, grammar_scope_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assessment_item_metadata (
  problem_id TEXT PRIMARY KEY,
  construct_id TEXT NOT NULL,
  skill_area TEXT NOT NULL,
  item_format TEXT NOT NULL,
  cefr_target TEXT,
  calibration_status TEXT NOT NULL DEFAULT 'UNREVIEWED'
    CHECK (calibration_status IN ('UNREVIEWED', 'TEACHER_REVIEWED', 'PILOTING', 'CALIBRATED', 'REJECTED')),
  review_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING', 'APPROVED', 'NEEDS_REVIEW', 'REJECTED')),
  irt_model TEXT NOT NULL DEFAULT 'NONE'
    CHECK (irt_model IN ('NONE', 'RASCH_1PL', 'IRT_2PL')),
  difficulty REAL,
  discrimination REAL,
  fit REAL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  exposure_rate REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (problem_id) REFERENCES ai_generated_problems(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assessment_item_metadata_construct
  ON assessment_item_metadata(construct_id, skill_area, calibration_status, review_status);
