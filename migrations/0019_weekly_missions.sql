CREATE TABLE IF NOT EXISTS weekly_missions (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  created_by_user_id TEXT NOT NULL,
  learning_track TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  book_id TEXT,
  book_title TEXT,
  new_words_target INTEGER NOT NULL DEFAULT 0,
  review_words_target INTEGER NOT NULL DEFAULT 0,
  quiz_target_count INTEGER NOT NULL DEFAULT 0,
  writing_assignment_id TEXT,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
  FOREIGN KEY (writing_assignment_id) REFERENCES writing_assignments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_missions_org_due
  ON weekly_missions(organization_id, due_at DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_missions_track_due
  ON weekly_missions(learning_track, due_at DESC);

CREATE TABLE IF NOT EXISTS weekly_mission_assignments (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED',
  assigned_at INTEGER NOT NULL,
  started_at INTEGER,
  restarted_at INTEGER,
  last_activity_at INTEGER,
  completed_at INTEGER,
  new_word_ids_json TEXT NOT NULL DEFAULT '[]',
  review_word_ids_json TEXT NOT NULL DEFAULT '[]',
  quiz_day_keys_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES weekly_missions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weekly_mission_assignments_student_status
  ON weekly_mission_assignments(student_user_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_mission_assignments_mission_status
  ON weekly_mission_assignments(mission_id, status, assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_mission_assignments_active_student
  ON weekly_mission_assignments(student_user_id)
  WHERE status IN ('ASSIGNED', 'IN_PROGRESS', 'OVERDUE');
