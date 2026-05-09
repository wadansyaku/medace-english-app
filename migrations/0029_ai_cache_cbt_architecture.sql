CREATE TABLE IF NOT EXISTS ai_generated_contents (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('EXAMPLE_SENTENCE', 'GRAMMAR_PROBLEM')),
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  word_id TEXT,
  book_id TEXT,
  question_mode TEXT,
  grammar_scope_id TEXT,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  quality_status TEXT NOT NULL DEFAULT 'READY' CHECK (quality_status IN ('READY', 'NEEDS_REVIEW', 'REJECTED')),
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_contents_lookup
  ON ai_generated_contents(content_kind, word_id, question_mode, grammar_scope_id, quality_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_generated_contents_book
  ON ai_generated_contents(book_id, content_kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_generated_examples (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL UNIQUE,
  word_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  sentence TEXT NOT NULL,
  translation TEXT NOT NULL,
  cefr_level TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (content_id) REFERENCES ai_generated_contents(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_examples_word_active
  ON ai_generated_examples(word_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_generated_problems (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL UNIQUE,
  word_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  question_mode TEXT NOT NULL,
  grammar_scope_id TEXT,
  prompt_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  ordered_tokens_json TEXT NOT NULL DEFAULT '[]',
  source_sentence TEXT,
  source_translation TEXT,
  grammar_focus TEXT,
  difficulty_level REAL NOT NULL DEFAULT 0.5 CHECK (difficulty_level >= 0 AND difficulty_level <= 1),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (content_id) REFERENCES ai_generated_contents(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_problems_reuse
  ON ai_generated_problems(word_id, question_mode, grammar_scope_id, active, difficulty_level, updated_at DESC);

CREATE TABLE IF NOT EXISTS cbt_learner_profiles (
  user_id TEXT PRIMARY KEY,
  ability_level REAL NOT NULL DEFAULT 0.5 CHECK (ability_level >= 0 AND ability_level <= 1),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cbt_problem_stats (
  problem_id TEXT PRIMARY KEY,
  difficulty_level REAL NOT NULL DEFAULT 0.5 CHECK (difficulty_level >= 0 AND difficulty_level <= 1),
  discrimination REAL NOT NULL DEFAULT 1,
  exposure_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (problem_id) REFERENCES ai_generated_problems(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cbt_problem_stats_difficulty
  ON cbt_problem_stats(difficulty_level, exposure_count);

CREATE TABLE IF NOT EXISTS cbt_learner_word_states (
  user_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  mastery_level REAL NOT NULL DEFAULT 0.5 CHECK (mastery_level >= 0 AND mastery_level <= 1),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  last_problem_id TEXT,
  last_attempt_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, word_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (last_problem_id) REFERENCES ai_generated_problems(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cbt_learner_word_states_user_mastery
  ON cbt_learner_word_states(user_id, mastery_level, updated_at DESC);
