ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN writing_assignments_created_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN writing_submissions_received_30d INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN writing_reviews_completed_30d INTEGER NOT NULL DEFAULT 0;
