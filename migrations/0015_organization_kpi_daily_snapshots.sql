CREATE TABLE IF NOT EXISTS organization_kpi_daily_snapshots (
  organization_name TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  total_students INTEGER NOT NULL DEFAULT 0,
  assigned_students INTEGER NOT NULL DEFAULT 0,
  plan_students INTEGER NOT NULL DEFAULT 0,
  active_students INTEGER NOT NULL DEFAULT 0,
  notifications INTEGER NOT NULL DEFAULT 0,
  notified_students INTEGER NOT NULL DEFAULT 0,
  reactivated_students INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (organization_name, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_organization_kpi_daily_snapshots_date
  ON organization_kpi_daily_snapshots(snapshot_date, organization_name);
