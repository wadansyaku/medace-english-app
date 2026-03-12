CREATE TABLE IF NOT EXISTS commercial_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  normalized_contact_email TEXT NOT NULL,
  organization_name TEXT,
  requested_workspace_role TEXT,
  seat_estimate TEXT,
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  requested_by_user_id TEXT,
  linked_user_id TEXT,
  target_subscription_plan TEXT,
  target_organization_name TEXT,
  target_organization_role TEXT,
  resolution_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_commercial_requests_requested_by_status
  ON commercial_requests(requested_by_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commercial_requests_email_status
  ON commercial_requests(normalized_contact_email, status, created_at DESC);

CREATE TABLE IF NOT EXISTS product_announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL,
  subscription_plans_json TEXT NOT NULL DEFAULT '[]',
  audience_roles_json TEXT NOT NULL DEFAULT '[]',
  starts_at INTEGER,
  ends_at INTEGER,
  published_at INTEGER NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_announcements_published
  ON product_announcements(published_at DESC, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS product_announcement_receipts (
  announcement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seen_at INTEGER,
  acknowledged_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (announcement_id, user_id),
  FOREIGN KEY (announcement_id) REFERENCES product_announcements(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_announcement_receipts_user
  ON product_announcement_receipts(user_id, updated_at DESC);
