PRAGMA defer_foreign_keys = ON;

CREATE TABLE password_reset_tokens_next (
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
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO password_reset_tokens_next (
  id,
  recovery_request_id,
  user_id,
  token_hash,
  expires_at,
  used_at,
  created_by,
  created_at
)
SELECT
  id,
  recovery_request_id,
  user_id,
  token_hash,
  expires_at,
  used_at,
  created_by,
  created_at
FROM password_reset_tokens;

DROP TABLE password_reset_tokens;

ALTER TABLE password_reset_tokens_next
  RENAME TO password_reset_tokens;

CREATE INDEX idx_password_reset_tokens_user_expires
  ON password_reset_tokens(user_id, expires_at DESC);

CREATE INDEX idx_password_reset_tokens_recovery_request
  ON password_reset_tokens(recovery_request_id, created_at DESC);

CREATE INDEX idx_password_reset_tokens_created_by
  ON password_reset_tokens(created_by);
