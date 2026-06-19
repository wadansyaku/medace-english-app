ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_with_writing_assignment_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_created_cohort_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_assigned_student_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_created_first_mission_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_sent_notification_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_with_writing_assignment_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_with_writing_submission_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_with_writing_review_30d INTEGER NOT NULL DEFAULT 0;
