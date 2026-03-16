ALTER TABLE users
  ADD COLUMN organization_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_organization_id
  ON users(organization_id);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  subscription_plan TEXT NOT NULL DEFAULT 'TOB_FREE',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_name_key
  ON organizations(name_key);

CREATE TABLE IF NOT EXISTS organization_memberships (
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, organization_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_memberships_active_user
  ON organization_memberships(user_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_organization_memberships_org_role
  ON organization_memberships(organization_id, role, status);

CREATE TABLE IF NOT EXISTS organization_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_audit_logs_org_created
  ON organization_audit_logs(organization_id, created_at DESC);

INSERT INTO organizations (
  id,
  display_name,
  name_key,
  subscription_plan,
  status,
  created_at,
  updated_at
)
SELECT
  'org_' || lower(hex(randomblob(16))) AS id,
  source.display_name,
  source.name_key,
  source.subscription_plan,
  'ACTIVE' AS status,
  source.created_at,
  source.updated_at
FROM (
  SELECT
    MIN(TRIM(u.organization_name)) AS display_name,
    LOWER(TRIM(u.organization_name)) AS name_key,
    CASE
      WHEN MAX(CASE WHEN u.subscription_plan = 'TOB_PAID' THEN 1 ELSE 0 END) = 1 THEN 'TOB_PAID'
      ELSE 'TOB_FREE'
    END AS subscription_plan,
    MIN(u.created_at) AS created_at,
    MAX(u.updated_at) AS updated_at
  FROM users u
  WHERE u.role IN ('STUDENT', 'INSTRUCTOR')
    AND u.subscription_plan IN ('TOB_FREE', 'TOB_PAID')
    AND u.organization_name IS NOT NULL
    AND TRIM(u.organization_name) != ''
  GROUP BY LOWER(TRIM(u.organization_name))
) source
WHERE NOT EXISTS (
  SELECT 1
  FROM organizations o
  WHERE o.name_key = source.name_key
);

UPDATE users
SET organization_id = (
  SELECT o.id
  FROM organizations o
  WHERE o.name_key = LOWER(TRIM(users.organization_name))
)
WHERE role IN ('STUDENT', 'INSTRUCTOR')
  AND subscription_plan IN ('TOB_FREE', 'TOB_PAID')
  AND organization_name IS NOT NULL
  AND TRIM(organization_name) != '';

UPDATE users
SET organization_name = TRIM(organization_name),
    organization_role = COALESCE(
      organization_role,
      CASE
        WHEN role = 'INSTRUCTOR' THEN 'INSTRUCTOR'
        WHEN role = 'STUDENT' THEN 'STUDENT'
        ELSE NULL
      END
    ),
    subscription_plan = COALESCE(
      (
        SELECT o.subscription_plan
        FROM organizations o
        WHERE o.id = users.organization_id
      ),
      subscription_plan
    )
WHERE organization_id IS NOT NULL;

INSERT INTO organization_memberships (
  user_id,
  organization_id,
  role,
  status,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.organization_id,
  u.organization_role,
  'ACTIVE',
  u.created_at,
  u.updated_at
FROM users u
WHERE u.organization_id IS NOT NULL
  AND u.organization_role IS NOT NULL
ON CONFLICT(user_id, organization_id) DO UPDATE SET
  role = excluded.role,
  status = excluded.status,
  updated_at = excluded.updated_at;

ALTER TABLE writing_assignments
  ADD COLUMN organization_id TEXT;

UPDATE writing_assignments
SET organization_id = (
  SELECT o.id
  FROM organizations o
  WHERE o.name_key = LOWER(TRIM(writing_assignments.organization_name))
)
WHERE organization_id IS NULL
  AND organization_name IS NOT NULL
  AND TRIM(organization_name) != '';

CREATE INDEX IF NOT EXISTS idx_writing_assignments_org_id_status
  ON writing_assignments(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS organization_kpi_daily_snapshots_next (
  organization_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  total_students INTEGER NOT NULL DEFAULT 0,
  assigned_students INTEGER NOT NULL DEFAULT 0,
  plan_students INTEGER NOT NULL DEFAULT 0,
  active_students INTEGER NOT NULL DEFAULT 0,
  notifications INTEGER NOT NULL DEFAULT 0,
  notified_students INTEGER NOT NULL DEFAULT 0,
  reactivated_students INTEGER NOT NULL DEFAULT 0,
  students_4plus_days_active INTEGER NOT NULL DEFAULT 0,
  at_risk_students INTEGER NOT NULL DEFAULT 0,
  followed_up_at_risk_students INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, snapshot_date),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO organization_kpi_daily_snapshots_next (
  organization_id,
  organization_name,
  snapshot_date,
  total_students,
  assigned_students,
  plan_students,
  active_students,
  notifications,
  notified_students,
  reactivated_students,
  students_4plus_days_active,
  at_risk_students,
  followed_up_at_risk_students,
  created_at,
  updated_at
)
SELECT
  o.id,
  o.display_name,
  s.snapshot_date,
  s.total_students,
  s.assigned_students,
  s.plan_students,
  s.active_students,
  s.notifications,
  s.notified_students,
  s.reactivated_students,
  COALESCE(s.students_4plus_days_active, 0),
  COALESCE(s.at_risk_students, 0),
  COALESCE(s.followed_up_at_risk_students, 0),
  s.created_at,
  s.updated_at
FROM organization_kpi_daily_snapshots s
JOIN organizations o
  ON o.name_key = LOWER(TRIM(s.organization_name))
ON CONFLICT(organization_id, snapshot_date) DO UPDATE SET
  organization_name = excluded.organization_name,
  total_students = excluded.total_students,
  assigned_students = excluded.assigned_students,
  plan_students = excluded.plan_students,
  active_students = excluded.active_students,
  notifications = excluded.notifications,
  notified_students = excluded.notified_students,
  reactivated_students = excluded.reactivated_students,
  students_4plus_days_active = excluded.students_4plus_days_active,
  at_risk_students = excluded.at_risk_students,
  followed_up_at_risk_students = excluded.followed_up_at_risk_students,
  updated_at = excluded.updated_at;

DROP TABLE organization_kpi_daily_snapshots;

ALTER TABLE organization_kpi_daily_snapshots_next
  RENAME TO organization_kpi_daily_snapshots;

CREATE INDEX IF NOT EXISTS idx_organization_kpi_daily_snapshots_date
  ON organization_kpi_daily_snapshots(snapshot_date, organization_id);
