ALTER TABLE product_kpi_daily_snapshots
  ADD COLUMN dashboard_start_task_count_30d INTEGER NOT NULL DEFAULT 0;
