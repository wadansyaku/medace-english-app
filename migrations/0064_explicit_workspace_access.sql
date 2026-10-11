-- Explicit UID grants supplement an existing identity; they never replace its
-- personal role, canonical membership, subscription or password credentials.
CREATE TABLE workspace_access_grants (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_organization_id TEXT NOT NULL REFERENCES organizations(id),
  teacher_access INTEGER NOT NULL DEFAULT 0 CHECK (teacher_access IN (0, 1)),
  school_admin_access INTEGER NOT NULL DEFAULT 0 CHECK (school_admin_access IN (0, 1)),
  service_admin_access INTEGER NOT NULL DEFAULT 0 CHECK (service_admin_access IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  grant_version INTEGER NOT NULL CHECK (grant_version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Existing upload capabilities retain their previous contract. New leases
-- issued through an explicit workspace grant bind to that grant and scope.
ALTER TABLE writing_submission_assets ADD COLUMN workspace_user_id TEXT REFERENCES users(id);
ALTER TABLE writing_submission_assets ADD COLUMN workspace_id TEXT;
ALTER TABLE writing_submission_assets ADD COLUMN workspace_organization_id TEXT REFERENCES organizations(id);
ALTER TABLE writing_submission_assets ADD COLUMN workspace_grant_version INTEGER;
