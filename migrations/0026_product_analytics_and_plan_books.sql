CREATE TABLE IF NOT EXISTS product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  feature_area TEXT NOT NULL,
  user_id TEXT,
  organization_id TEXT,
  subscription_plan TEXT,
  user_role TEXT,
  subject_type TEXT,
  subject_id TEXT,
  status TEXT,
  used_ai INTEGER NOT NULL DEFAULT 0,
  estimated_cost_milli_yen INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_events_created
  ON product_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_name_created
  ON product_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_org_created
  ON product_events(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS product_kpi_daily_snapshots (
  date_key TEXT PRIMARY KEY,
  total_users INTEGER NOT NULL DEFAULT 0,
  active_students_1d INTEGER NOT NULL DEFAULT 0,
  active_students_7d INTEGER NOT NULL DEFAULT 0,
  active_students_30d INTEGER NOT NULL DEFAULT 0,
  total_organizations INTEGER NOT NULL DEFAULT 0,
  active_organizations_30d INTEGER NOT NULL DEFAULT 0,
  study_sessions_started_30d INTEGER NOT NULL DEFAULT 0,
  study_sessions_finished_30d INTEGER NOT NULL DEFAULT 0,
  quiz_sessions_started_30d INTEGER NOT NULL DEFAULT 0,
  spelling_checks_started_30d INTEGER NOT NULL DEFAULT 0,
  commercial_form_open_count_30d INTEGER NOT NULL DEFAULT 0,
  commercial_request_count_30d INTEGER NOT NULL DEFAULT 0,
  organizations_with_cohort_count INTEGER NOT NULL DEFAULT 0,
  organizations_with_assignment_count INTEGER NOT NULL DEFAULT 0,
  organizations_with_mission_count INTEGER NOT NULL DEFAULT 0,
  organizations_with_notification_count INTEGER NOT NULL DEFAULT 0,
  generation_count_30d INTEGER NOT NULL DEFAULT 0,
  cache_hit_count_30d INTEGER NOT NULL DEFAULT 0,
  example_generation_count_30d INTEGER NOT NULL DEFAULT 0,
  example_cache_hit_count_30d INTEGER NOT NULL DEFAULT 0,
  image_generation_count_30d INTEGER NOT NULL DEFAULT 0,
  image_cache_hit_count_30d INTEGER NOT NULL DEFAULT 0,
  estimated_ai_cost_milli_yen_30d INTEGER NOT NULL DEFAULT 0,
  estimated_provider_ai_cost_milli_yen_30d INTEGER NOT NULL DEFAULT 0,
  estimated_avoided_cost_milli_yen_30d INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_plan_books (
  user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_learning_plan_books_user_order
  ON learning_plan_books(user_id, sort_order ASC, updated_at DESC);

INSERT INTO learning_plan_books (user_id, book_id, sort_order, created_at, updated_at)
SELECT
  lp.user_id,
  json_each.value AS book_id,
  CAST(json_each.key AS INTEGER) AS sort_order,
  lp.created_at,
  lp.updated_at
FROM learning_plans lp,
     json_each(COALESCE(lp.selected_book_ids, '[]'))
WHERE json_each.type = 'text'
ON CONFLICT(user_id, book_id) DO UPDATE SET
  sort_order = excluded.sort_order,
  updated_at = excluded.updated_at;

ALTER TABLE ai_usage_events
  ADD COLUMN pricing_version TEXT NOT NULL DEFAULT '2026-03-28';

ALTER TABLE ai_usage_events
  ADD COLUMN provider_input_units INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_usage_events
  ADD COLUMN provider_output_units INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_usage_events
  ADD COLUMN provider_asset_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ai_usage_events
  ADD COLUMN estimated_provider_cost_milli_yen INTEGER NOT NULL DEFAULT 0;

UPDATE ai_usage_events
SET pricing_version = '2026-03-28',
    provider_input_units = CASE
      WHEN provider_input_units = 0 THEN COALESCE(request_units, 1)
      ELSE provider_input_units
    END,
    provider_output_units = CASE
      WHEN provider_output_units = 0 AND used_ai = 1 THEN 1
      ELSE provider_output_units
    END,
    provider_asset_count = CASE
      WHEN provider_asset_count = 0 AND action = 'generateWordImage' AND used_ai = 1 THEN 1
      ELSE provider_asset_count
    END,
    estimated_provider_cost_milli_yen = CASE
      WHEN estimated_provider_cost_milli_yen = 0 THEN COALESCE(estimated_cost_milli_yen, 0)
      ELSE estimated_provider_cost_milli_yen
    END;

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month_provider
  ON ai_usage_events(user_id, month_key, created_at DESC, estimated_provider_cost_milli_yen);
