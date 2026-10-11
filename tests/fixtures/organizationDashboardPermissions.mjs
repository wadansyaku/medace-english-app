// Disposable synthetic identities and classrooms, shared by SQL unit and local
// native D1 direct-API regressions. Never use a production account or grant.
export const permissionFixtureSql = (now) => `
  INSERT INTO organizations(id,display_name,name_key,subscription_plan,status,created_at,updated_at)
    VALUES('permission-org-a','Synthetic classroom A','permission-org-a','TOB_PAID','ACTIVE',1,1),
          ('permission-org-b','Synthetic classroom B','permission-org-b','TOB_PAID','ACTIVE',1,1);
  INSERT INTO users(id,email,password_hash,display_name,role,subscription_plan,organization_id,organization_name,organization_role,created_at,updated_at)
    VALUES('permission-owner','owner@permissions.example.invalid',NULL,'Synthetic owner','STUDENT','TOB_PAID','permission-org-b','Synthetic classroom B','STUDENT',1,1),
      ('permission-teacher','teacher@permissions.example.invalid',NULL,'Synthetic teacher','INSTRUCTOR','TOB_PAID','permission-org-a','Synthetic classroom A','INSTRUCTOR',1,1),
      ('permission-unassigned-teacher','unassigned@permissions.example.invalid',NULL,'Synthetic unassigned teacher','INSTRUCTOR','TOB_PAID','permission-org-a','Synthetic classroom A','INSTRUCTOR',1,1),
      ('permission-school','school@permissions.example.invalid',NULL,'Synthetic school administrator','INSTRUCTOR','TOB_PAID','permission-org-a','Synthetic classroom A','GROUP_ADMIN',1,1),
      ('permission-assigned','assigned@permissions.example.invalid',NULL,'Synthetic assigned student A','STUDENT','TOB_PAID','permission-org-a','Synthetic classroom A','STUDENT',1,1),
      ('permission-hidden','hidden@permissions.example.invalid',NULL,'Synthetic UNASSIGNED PRIVATE student A','STUDENT','TOB_PAID','permission-org-a','Synthetic classroom A','STUDENT',1,1),
      ('permission-foreign','foreign@permissions.example.invalid',NULL,'Synthetic FOREIGN PRIVATE student B','STUDENT','TOB_PAID','permission-org-b','Synthetic classroom B','STUDENT',1,1),
      ('permission-admin','admin@permissions.example.invalid',NULL,'Synthetic service administrator','ADMIN','TOC_FREE',NULL,NULL,NULL,1,1);
  INSERT INTO organization_memberships(user_id,organization_id,role,status,created_at,updated_at)
    VALUES('permission-owner','permission-org-b','STUDENT','ACTIVE',1,1),
      ('permission-teacher','permission-org-a','INSTRUCTOR','ACTIVE',1,1),
      ('permission-unassigned-teacher','permission-org-a','INSTRUCTOR','ACTIVE',1,1),
      ('permission-school','permission-org-a','GROUP_ADMIN','ACTIVE',1,1),
      ('permission-assigned','permission-org-a','STUDENT','ACTIVE',1,1),
      ('permission-hidden','permission-org-a','STUDENT','ACTIVE',1,1),
      ('permission-foreign','permission-org-b','STUDENT','ACTIVE',1,1);
  INSERT INTO workspace_access_grants VALUES('permission-owner','permission-org-a',1,1,1,'ACTIVE',7,1,1);
  INSERT INTO organization_cohorts(id,organization_id,name,created_at,updated_at)
    VALUES('permission-class-assigned','permission-org-a','Assigned class',1,1),
      ('permission-class-hidden','permission-org-a','Unassigned class',1,1),
      ('permission-class-foreign','permission-org-b','Foreign class',1,1);
  INSERT INTO organization_cohort_students VALUES('permission-assigned','permission-class-assigned',1,1),
    ('permission-hidden','permission-class-hidden',1,1),('permission-foreign','permission-class-foreign',1,1);
  INSERT INTO organization_cohort_instructors VALUES('permission-class-assigned','permission-teacher',1,1);
  INSERT INTO student_instructor_assignments VALUES('permission-assigned','permission-teacher',1,1);
  INSERT INTO student_instructor_assignment_events(student_user_id,previous_instructor_user_id,next_instructor_user_id,changed_by_user_id,created_at)
    VALUES('permission-hidden',NULL,'permission-school','permission-school',${now}),
      ('permission-foreign',NULL,'permission-school','permission-school',${now});
`;

export const permissionWorkspaceHeaders = (workspace) => ({
  'X-MedAce-Workspace':workspace,
  'X-MedAce-Workspace-Version':'7',
  'X-MedAce-Workspace-Identity':'permission-owner',
  ...(workspace==='service-admin'?{}:{'X-MedAce-Workspace-Org':'permission-org-a'}),
});

export const forbiddenPayloadMarkers = ['permission-hidden','Synthetic UNASSIGNED PRIVATE student A',
  'permission-foreign','Synthetic FOREIGN PRIVATE student B','assignmentEvents','instructors',
  'instructorBacklog','trend','totalMembers','activationState'];
