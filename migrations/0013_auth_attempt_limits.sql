CREATE TABLE IF NOT EXISTS auth_attempt_limits (
  scope_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_attempt_limits_updated_at
  ON auth_attempt_limits(updated_at);
