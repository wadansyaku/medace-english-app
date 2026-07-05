CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recovery_request_id INTEGER,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (recovery_request_id) REFERENCES auth_recovery_requests(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_expires
  ON password_reset_tokens(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_recovery_request
  ON password_reset_tokens(recovery_request_id, created_at DESC);
