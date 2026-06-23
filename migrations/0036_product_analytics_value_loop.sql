ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_with_writing_submission_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN organizations_with_writing_review_count INTEGER NOT NULL DEFAULT 0;
