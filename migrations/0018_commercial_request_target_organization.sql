ALTER TABLE commercial_requests
  ADD COLUMN target_organization_id TEXT;

UPDATE commercial_requests
   SET target_organization_id = (
     SELECT o.id
       FROM organizations o
      WHERE o.name_key = LOWER(TRIM(commercial_requests.target_organization_name))
      LIMIT 1
   )
 WHERE target_organization_id IS NULL
   AND target_organization_name IS NOT NULL
   AND TRIM(target_organization_name) != '';

CREATE INDEX IF NOT EXISTS idx_commercial_requests_target_org
  ON commercial_requests(target_organization_id, status, updated_at DESC);
