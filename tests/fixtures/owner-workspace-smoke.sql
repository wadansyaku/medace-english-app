-- Disposable local D1 only. Reuse the existing long-term learner fixture;
-- no owner account or production entitlement is created by this file.
INSERT INTO organizations (id,display_name,name_key,subscription_plan,status,created_at,updated_at)
VALUES ('owner-smoke-staff-org','Synthetic owner classroom','synthetic-owner-classroom','TOB_PAID','ACTIVE',1,1);
INSERT INTO workspace_access_grants (user_id,staff_organization_id,teacher_access,
 school_admin_access,service_admin_access,status,grant_version,created_at,updated_at)
SELECT id,'owner-smoke-staff-org',1,1,1,'ACTIVE',7,1,1 FROM users WHERE id='long-term-ui-320';

-- Confirmed staff PII and an issued assignment for loss-of-access acceptance.
INSERT INTO users (id,email,password_hash,display_name,role,subscription_plan,organization_id,
 organization_name,organization_role,created_at,updated_at)
VALUES ('owner-revoke-student','revoke-student@workspace-smoke.example.invalid',NULL,'Synthetic revoke pupil',
 'STUDENT','TOB_PAID','owner-smoke-staff-org','Synthetic owner classroom','STUDENT',1,1);
INSERT INTO organization_memberships (user_id,organization_id,role,status,created_at,updated_at)
VALUES ('owner-revoke-student','owner-smoke-staff-org','STUDENT','ACTIVE',1,1);
INSERT INTO student_instructor_assignments (student_user_id,instructor_user_id,created_at,updated_at)
VALUES ('owner-revoke-student','long-term-ui-320',1,1);
INSERT INTO writing_assignments (id,organization_id,organization_name,instructor_user_id,student_user_id,
 exam_category,template_type,prompt_title,prompt_text,guidance,word_count_min,word_count_max,
 submission_code,prompt_snapshot,status,created_at,issued_at,updated_at)
VALUES ('owner-revoke-writing','owner-smoke-staff-org','Synthetic owner classroom','long-term-ui-320','owner-revoke-student',
 'HIGH_SCHOOL_ENTRANCE','OPINION','Synthetic revoke assignment','Write about a favourite book.',
 'Synthetic local acceptance only.',20,40,'OWNER-REVOKE','{}','ISSUED',1,1,1);
