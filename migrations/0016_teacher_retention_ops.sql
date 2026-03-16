ALTER TABLE instructor_notifications
  ADD COLUMN intervention_kind TEXT NOT NULL DEFAULT 'MANUAL_OTHER';

ALTER TABLE instructor_notifications
  ADD COLUMN recommended_action_type TEXT;

ALTER TABLE organization_kpi_daily_snapshots
  ADD COLUMN students_4plus_days_active INTEGER NOT NULL DEFAULT 0;

ALTER TABLE organization_kpi_daily_snapshots
  ADD COLUMN at_risk_students INTEGER NOT NULL DEFAULT 0;

ALTER TABLE organization_kpi_daily_snapshots
  ADD COLUMN followed_up_at_risk_students INTEGER NOT NULL DEFAULT 0;
