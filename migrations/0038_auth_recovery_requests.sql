CREATE TABLE IF NOT EXISTS auth_recovery_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  has_matching_user INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  source TEXT NOT NULL DEFAULT 'login',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_recovery_requests_status_created
  ON auth_recovery_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_recovery_requests_email_created
  ON auth_recovery_requests(email, created_at DESC);
