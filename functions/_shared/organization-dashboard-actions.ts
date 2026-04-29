import {
  type AssignmentEvent,
  type OrganizationDashboardSnapshot,
  type OrganizationInstructorSummary,
  OrganizationRole,
  UserRole,
} from '../../types';
import { buildOrganizationDashboardSnapshot } from './organization-dashboard';
import {
  readOrganizationKpiSeriesFromSnapshots,
  toOrganizationKpiTrendPoints,
} from './organization-kpi';
import { handleGetWeeklyMissionBoard } from './storage-mission-actions';
import { requireActiveOrganizationContext } from './organization-memberships';
import { handleGetAllStudentsProgress } from './organization-student-read-model';
import type { AppEnv, DbUserRow } from './types';
import { DAY_MS, readAll, readFirst, type DbAssignmentEventRow } from './storage-support';

export const handleGetOrganizationDashboardSnapshot = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<OrganizationDashboardSnapshot> => {
  const organization = await requireActiveOrganizationContext(env, user);

  const [
    students,
    missionBoard,
    kpiSeries,
    memberCountRow,
    instructorCountRow,
    cohortCountRow,
    assignmentCountRow,
    notificationCountRow,
    writingAssignmentCountRow,
    instructorRows,
    assignmentEvents,
  ] = await Promise.all([
    handleGetAllStudentsProgress(env, user),
    handleGetWeeklyMissionBoard(env, user),
    readOrganizationKpiSeriesFromSnapshots(env, organization.organizationId),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
         AND email NOT GLOB 'demo_*@medace.app'`,
      organization.organizationId,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
         AND u.role = ?
         AND email NOT GLOB 'demo_*@medace.app'`,
      organization.organizationId,
      UserRole.INSTRUCTOR,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM organization_cohorts
       WHERE organization_id = ?`,
      organization.organizationId,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM student_instructor_assignments a
       JOIN organization_memberships m
         ON m.user_id = a.student_user_id
        AND m.status = 'ACTIVE'
       WHERE m.organization_id = ?`,
      organization.organizationId,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM instructor_notifications n
       JOIN organization_memberships m
         ON m.user_id = n.student_user_id
        AND m.status = 'ACTIVE'
       WHERE m.organization_id = ?`,
      organization.organizationId,
    ),
    readFirst<{ total_count: number; issued_count: number }>(
      env,
      `SELECT
         COUNT(*) AS total_count,
         COALESCE(SUM(CASE WHEN status != 'DRAFT' THEN 1 ELSE 0 END), 0) AS issued_count
       FROM writing_assignments
       WHERE organization_id = ?
          OR (organization_id IS NULL AND organization_name = ?)`,
      organization.organizationId,
      organization.organizationName,
    ),
    readAll<{
      uid: string;
      display_name: string;
      email: string;
      organization_role: string | null;
      notified_student_count: number;
      notifications_7d: number;
      assigned_student_count: number;
    }>(
      env,
      `SELECT
         u.id AS uid,
         u.display_name AS display_name,
         u.email AS email,
         m.role AS organization_role,
         COALESCE(stats.notified_student_count, 0) AS notified_student_count,
         COALESCE(stats.notifications_7d, 0) AS notifications_7d,
         COALESCE(assignments.assigned_student_count, 0) AS assigned_student_count
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN (
         SELECT
           n.instructor_user_id AS instructor_user_id,
           COUNT(DISTINCT n.student_user_id) AS notified_student_count,
           SUM(CASE WHEN n.created_at >= ? THEN 1 ELSE 0 END) AS notifications_7d
         FROM instructor_notifications n
         JOIN users s ON s.id = n.student_user_id
         JOIN organization_memberships student_membership
           ON student_membership.user_id = s.id
          AND student_membership.status = 'ACTIVE'
         WHERE student_membership.organization_id = ?
         GROUP BY n.instructor_user_id
       ) stats ON stats.instructor_user_id = u.id
       LEFT JOIN (
         SELECT
           a.instructor_user_id AS instructor_user_id,
           COUNT(*) AS assigned_student_count
         FROM student_instructor_assignments a
         JOIN users s ON s.id = a.student_user_id
         JOIN organization_memberships student_membership
           ON student_membership.user_id = s.id
          AND student_membership.status = 'ACTIVE'
         WHERE student_membership.organization_id = ?
         GROUP BY a.instructor_user_id
       ) assignments ON assignments.instructor_user_id = u.id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
         AND u.role = ?
         AND u.email NOT GLOB 'demo_*@medace.app'
       ORDER BY
         CASE WHEN m.role = ? THEN 0 ELSE 1 END,
         notifications_7d DESC,
         u.display_name ASC`,
      Date.now() - 7 * DAY_MS,
      organization.organizationId,
      organization.organizationId,
      organization.organizationId,
      UserRole.INSTRUCTOR,
      OrganizationRole.GROUP_ADMIN,
    ),
    readAll<DbAssignmentEventRow>(
      env,
      `SELECT
         e.id AS id,
         s.id AS student_uid,
         s.display_name AS student_name,
         prev.id AS previous_instructor_uid,
         prev.display_name AS previous_instructor_name,
         next.id AS next_instructor_uid,
         next.display_name AS next_instructor_name,
         changer.id AS changed_by_uid,
         changer.display_name AS changed_by_name,
         e.created_at AS created_at
       FROM student_instructor_assignment_events e
       JOIN users s ON s.id = e.student_user_id
       JOIN organization_memberships student_membership
         ON student_membership.user_id = s.id
        AND student_membership.status = 'ACTIVE'
       JOIN users changer ON changer.id = e.changed_by_user_id
       LEFT JOIN users prev ON prev.id = e.previous_instructor_user_id
       LEFT JOIN users next ON next.id = e.next_instructor_user_id
       WHERE student_membership.organization_id = ?
       ORDER BY e.created_at DESC
       LIMIT 12`,
      organization.organizationId,
    ),
  ]);
  const trend = toOrganizationKpiTrendPoints(kpiSeries.dailySnapshots);

  const instructors: OrganizationInstructorSummary[] = instructorRows.map((row) => ({
    uid: row.uid,
    displayName: row.display_name,
    email: row.email,
    organizationRole: row.organization_role ? row.organization_role as OrganizationRole : undefined,
    notifiedStudentCount: Number(row.notified_student_count || 0),
    notifications7d: Number(row.notifications_7d || 0),
    assignedStudentCount: Number(row.assigned_student_count || 0),
  }));

  const mappedAssignmentEvents = assignmentEvents.map((event): AssignmentEvent => ({
    id: event.id,
    studentUid: event.student_uid,
    studentName: event.student_name,
    previousInstructorUid: event.previous_instructor_uid || undefined,
    previousInstructorName: event.previous_instructor_name || undefined,
    nextInstructorUid: event.next_instructor_uid || undefined,
    nextInstructorName: event.next_instructor_name || undefined,
    changedByUid: event.changed_by_uid,
    changedByName: event.changed_by_name,
    createdAt: Number(event.created_at || 0),
  }));

  return buildOrganizationDashboardSnapshot({
    organizationId: organization.organizationId,
    organizationName: organization.organizationName,
    subscriptionPlan: organization.subscriptionPlan,
    totalMembers: Number(memberCountRow?.count || 0),
    totalInstructors: Number(instructorCountRow?.count || 0),
    learningPlanCount: students.filter((student) => student.hasLearningPlan).length,
    cohortCount: Number(cohortCountRow?.count || 0),
    studentAssignmentCount: Number(assignmentCountRow?.count || 0),
    missionAssignmentCount: missionBoard.assignments.length,
    notifications7d: kpiSeries.summary7d.notifications7d,
    totalNotificationCount: Number(notificationCountRow?.count || 0),
    writingAssignmentCount: Number(writingAssignmentCountRow?.total_count || 0),
    issuedWritingAssignmentCount: Number(writingAssignmentCountRow?.issued_count || 0),
    instructors,
    students,
    missionAssignments: missionBoard.assignments,
    assignmentEvents: mappedAssignmentEvents,
    reactivatedStudents7d: kpiSeries.summary7d.reactivatedStudents7d,
    notifiedStudents7d: kpiSeries.summary7d.notifiedStudents7d,
    trend,
  });
};
