-- Disposable local D1 only. Reuse the existing long-term learner fixture;
-- no owner account or production entitlement is created by this file.
INSERT INTO workspace_access_grants (user_id,staff_organization_id,teacher_access,
 school_admin_access,service_admin_access,status,grant_version,created_at,updated_at)
SELECT id,'staff-smoke-org',1,1,1,'ACTIVE',7,1,1 FROM users WHERE id='long-term-ui-320';
