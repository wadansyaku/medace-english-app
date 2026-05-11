ALTER TABLE assessment_item_metadata ADD COLUMN reviewed_by TEXT;
ALTER TABLE assessment_item_metadata ADD COLUMN reviewed_at INTEGER;
ALTER TABLE assessment_item_metadata ADD COLUMN review_note TEXT;

ALTER TABLE japanese_translation_feedback_events ADD COLUMN exam_target TEXT;
ALTER TABLE japanese_translation_feedback_events ADD COLUMN organization_id TEXT;
ALTER TABLE japanese_translation_feedback_events ADD COLUMN model TEXT;
ALTER TABLE japanese_translation_feedback_events ADD COLUMN prompt_version TEXT;

CREATE INDEX IF NOT EXISTS idx_translation_feedback_org_scope
  ON japanese_translation_feedback_events(organization_id, grammar_scope_id, created_at DESC);

CREATE TABLE IF NOT EXISTS classroom_activation_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  cohort_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_classroom_activation_runs_org_status
  ON classroom_activation_runs(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS classroom_activation_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  organization_id TEXT NOT NULL,
  lifecycle_stage TEXT NOT NULL
    CHECK (lifecycle_stage IN ('cohort', 'student', 'instructor', 'mission', 'notification', 'worksheet', 'writing', 'review')),
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  subject_user_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES classroom_activation_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_classroom_activation_events_org_stage
  ON classroom_activation_events(organization_id, lifecycle_stage, occurred_at DESC);

CREATE TABLE IF NOT EXISTS classroom_worksheet_lifecycle_events (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  organization_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  worksheet_source TEXT NOT NULL
    CHECK (worksheet_source IN ('history', 'catalog_fallback', 'starter_fallback')),
  lifecycle_status TEXT NOT NULL
    CHECK (lifecycle_status IN ('printed', 'issued', 'collected', 'scored')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES classroom_activation_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classroom_worksheet_lifecycle_org_status
  ON classroom_worksheet_lifecycle_events(organization_id, lifecycle_status, occurred_at DESC);
