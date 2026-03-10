CREATE TABLE IF NOT EXISTS student_instructor_assignment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_user_id TEXT NOT NULL,
  previous_instructor_user_id TEXT,
  next_instructor_user_id TEXT,
  changed_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_instructor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (next_instructor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_events_student_created
  ON student_instructor_assignment_events(student_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_events_changed_by_created
  ON student_instructor_assignment_events(changed_by_user_id, created_at DESC);
