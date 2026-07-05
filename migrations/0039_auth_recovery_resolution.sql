ALTER TABLE auth_recovery_requests ADD COLUMN resolved_at INTEGER;
ALTER TABLE auth_recovery_requests ADD COLUMN resolved_by TEXT;
ALTER TABLE auth_recovery_requests ADD COLUMN resolution_note TEXT;

CREATE INDEX IF NOT EXISTS idx_auth_recovery_requests_resolved_at
  ON auth_recovery_requests(resolved_at DESC);
