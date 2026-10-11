import { OrganizationRole } from '../../types';
import type { AppEnv } from './types';

export interface GrantedStaffSummary {
  uid: string;
  display_name: string;
  email: string;
  organization_role: string;
  notified_student_count: number;
  notifications_7d: number;
  assigned_student_count: number;
  has_canonical_membership: number;
}

export const readOrganizationGrantedStaff = async (env: AppEnv, organizationId: string, since: number): Promise<GrantedStaffSummary[]> => {
  const result = await env.DB.prepare(`
    SELECT u.id AS uid, u.display_name, u.email,
           CASE WHEN g.teacher_access = 1 THEN ? ELSE ? END AS organization_role,
           EXISTS (SELECT 1 FROM organization_memberships member WHERE member.user_id = u.id
             AND member.organization_id = g.staff_organization_id AND member.status = 'ACTIVE') AS has_canonical_membership,
           (SELECT COUNT(DISTINCT n.student_user_id) FROM instructor_notifications n
             JOIN organization_memberships sm ON sm.user_id = n.student_user_id AND sm.status = 'ACTIVE'
             WHERE n.instructor_user_id = u.id AND sm.organization_id = g.staff_organization_id) AS notified_student_count,
           (SELECT COUNT(*) FROM instructor_notifications n
             JOIN organization_memberships sm ON sm.user_id = n.student_user_id AND sm.status = 'ACTIVE'
             WHERE n.instructor_user_id = u.id AND sm.organization_id = g.staff_organization_id AND n.created_at >= ?) AS notifications_7d,
           (SELECT COUNT(*) FROM student_instructor_assignments a
             JOIN organization_memberships sm ON sm.user_id = a.student_user_id AND sm.status = 'ACTIVE'
             WHERE a.instructor_user_id = u.id AND sm.organization_id = g.staff_organization_id) AS assigned_student_count
      FROM workspace_access_grants g JOIN users u ON u.id = g.user_id
      JOIN organizations o ON o.id = g.staff_organization_id AND o.status = 'ACTIVE'
     WHERE g.staff_organization_id = ? AND g.status = 'ACTIVE'
       AND (g.teacher_access = 1 OR g.school_admin_access = 1)
       AND u.email NOT GLOB 'demo_*@medace.app'
     ORDER BY u.display_name, u.id
  `).bind(OrganizationRole.INSTRUCTOR, OrganizationRole.GROUP_ADMIN, since, organizationId).all<GrantedStaffSummary>();
  return result.results || [];
};
