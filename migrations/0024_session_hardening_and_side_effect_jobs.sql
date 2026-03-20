ALTER TABLE sessions
  ADD COLUMN token_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash_expires
  ON sessions(token_hash, expires_at);

ALTER TABLE writing_submission_assets
  ADD COLUMN expected_byte_size INTEGER;

ALTER TABLE writing_submission_assets
  ADD COLUMN expected_sha256_base64 TEXT;

ALTER TABLE writing_submission_assets
  ADD COLUMN uploaded_sha256_base64 TEXT;

UPDATE writing_submission_assets
SET expected_byte_size = byte_size
WHERE expected_byte_size IS NULL
  AND byte_size IS NOT NULL
  AND byte_size > 0;

CREATE TABLE IF NOT EXISTS side_effect_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_side_effect_jobs_status_updated
  ON side_effect_jobs(status, updated_at);
