CREATE TABLE IF NOT EXISTS organization_cohorts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_cohorts_org_name
  ON organization_cohorts(organization_id, name);

CREATE INDEX IF NOT EXISTS idx_organization_cohorts_org_updated
  ON organization_cohorts(organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS organization_cohort_students (
  student_user_id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cohort_id) REFERENCES organization_cohorts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_cohort_students_cohort
  ON organization_cohort_students(cohort_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS organization_cohort_instructors (
  cohort_id TEXT NOT NULL,
  instructor_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (cohort_id, instructor_user_id),
  FOREIGN KEY (cohort_id) REFERENCES organization_cohorts(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_cohort_instructors_instructor
  ON organization_cohort_instructors(instructor_user_id, updated_at DESC);
