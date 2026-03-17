import { OrganizationRole, type OrganizationCohort, UserRole } from '../../types';
import {
  type ActiveOrganizationContext,
  requireActiveOrganizationContext,
} from './organization-memberships';
import {
  buildInClause,
  canBypassInstructorAssignment,
  readAll,
  readFirst,
} from './storage-support';
import type { AppEnv, DbUserRow } from './types';

interface OrganizationCohortRow {
  id: string;
  organization_id: string;
  name: string;
  updated_at: number;
  student_count: number;
  instructor_count: number;
}

interface StudentCohortRow {
  student_uid: string;
  cohort_id: string;
  cohort_name: string;
}

interface InstructorCohortRow {
  instructor_uid: string;
  cohort_id: string;
}

export interface StudentVisibilityRuleInput {
  userRole: UserRole;
  organizationRole?: OrganizationRole | null;
  currentUserId: string;
  studentUid: string;
  assignedInstructorUid?: string | null;
  studentCohortId?: string | null;
  instructorCohortIds?: Iterable<string>;
  bypassAssignment?: boolean;
}

export const isStudentVisibleByAccessRule = ({
  userRole,
  organizationRole,
  currentUserId,
  studentUid,
  assignedInstructorUid,
  studentCohortId,
  instructorCohortIds = [],
  bypassAssignment = false,
}: StudentVisibilityRuleInput): boolean => {
  if (
    userRole === UserRole.ADMIN
    || organizationRole === OrganizationRole.GROUP_ADMIN
    || bypassAssignment
  ) {
    return true;
  }
  if (userRole === UserRole.STUDENT) {
    return currentUserId === studentUid;
  }
  if (assignedInstructorUid === currentUserId) {
    return true;
  }
  if (!studentCohortId) {
    return false;
  }
  return new Set(instructorCohortIds).has(studentCohortId);
};

const readOrganizationStudentIds = async (
  env: AppEnv,
  organizationId: string,
): Promise<Set<string>> => {
  const rows = await readAll<{ student_uid: string }>(
    env,
    `SELECT u.id AS student_uid
     FROM users u
     JOIN organization_memberships m
       ON m.user_id = u.id
      AND m.status = 'ACTIVE'
     WHERE u.role = ?
       AND m.organization_id = ?`,
    UserRole.STUDENT,
    organizationId,
  );
  return new Set(rows.map((row) => row.student_uid));
};

export const readOrganizationCohorts = async (
  env: AppEnv,
  organizationId: string,
): Promise<OrganizationCohort[]> => {
  const rows = await readAll<OrganizationCohortRow>(
    env,
    `SELECT
       c.id AS id,
       c.organization_id AS organization_id,
       c.name AS name,
       c.updated_at AS updated_at,
       COUNT(DISTINCT cs.student_user_id) AS student_count,
       COUNT(DISTINCT ci.instructor_user_id) AS instructor_count
     FROM organization_cohorts c
     LEFT JOIN organization_cohort_students cs ON cs.cohort_id = c.id
     LEFT JOIN organization_cohort_instructors ci ON ci.cohort_id = c.id
     WHERE c.organization_id = ?
     GROUP BY c.id, c.organization_id, c.name, c.updated_at
     ORDER BY c.name ASC`,
    organizationId,
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    studentCount: Number(row.student_count || 0),
    instructorCount: Number(row.instructor_count || 0),
    updatedAt: Number(row.updated_at || 0),
  }));
};

export const readStudentCohortMap = async (
  env: AppEnv,
  organizationId: string,
): Promise<Map<string, { cohortId: string; cohortName: string }>> => {
  const rows = await readAll<StudentCohortRow>(
    env,
    `SELECT
       cs.student_user_id AS student_uid,
       c.id AS cohort_id,
       c.name AS cohort_name
     FROM organization_cohort_students cs
     JOIN organization_cohorts c ON c.id = cs.cohort_id
     WHERE c.organization_id = ?`,
    organizationId,
  );

  return new Map(rows.map((row) => [
    row.student_uid,
    {
      cohortId: row.cohort_id,
      cohortName: row.cohort_name,
    },
  ]));
};

export const readInstructorCohortMap = async (
  env: AppEnv,
  organizationId: string,
): Promise<Record<string, string[]>> => {
  const rows = await readAll<InstructorCohortRow>(
    env,
    `SELECT
       ci.instructor_user_id AS instructor_uid,
       ci.cohort_id AS cohort_id
     FROM organization_cohort_instructors ci
     JOIN organization_cohorts c ON c.id = ci.cohort_id
     WHERE c.organization_id = ?
     ORDER BY ci.instructor_user_id ASC, c.name ASC`,
    organizationId,
  );

  const instructorCohorts: Record<string, string[]> = {};
  rows.forEach((row) => {
    if (!instructorCohorts[row.instructor_uid]) {
      instructorCohorts[row.instructor_uid] = [];
    }
    instructorCohorts[row.instructor_uid].push(row.cohort_id);
  });
  return instructorCohorts;
};

export const readVisibleStudentIds = async (
  env: AppEnv,
  user: DbUserRow,
  organization?: ActiveOrganizationContext,
): Promise<Set<string>> => {
  const activeOrganization = organization || await requireActiveOrganizationContext(env, user);

  if (user.role === UserRole.STUDENT) {
    return new Set([user.id]);
  }
  if (
    user.role === UserRole.ADMIN
    || activeOrganization.organizationRole === OrganizationRole.GROUP_ADMIN
    || canBypassInstructorAssignment(user)
  ) {
    return readOrganizationStudentIds(env, activeOrganization.organizationId);
  }

  const rows = await readAll<{ student_uid: string }>(
    env,
    `SELECT DISTINCT visible.student_uid AS student_uid
     FROM (
       SELECT a.student_user_id AS student_uid
       FROM student_instructor_assignments a
       JOIN users student ON student.id = a.student_user_id
       JOIN organization_memberships m
         ON m.user_id = student.id
        AND m.status = 'ACTIVE'
       WHERE a.instructor_user_id = ?
         AND student.role = ?
         AND m.organization_id = ?

       UNION

       SELECT cs.student_user_id AS student_uid
       FROM organization_cohort_instructors ci
       JOIN organization_cohorts c ON c.id = ci.cohort_id
       JOIN organization_cohort_students cs ON cs.cohort_id = c.id
       JOIN users student ON student.id = cs.student_user_id
       JOIN organization_memberships m
         ON m.user_id = student.id
        AND m.status = 'ACTIVE'
       WHERE ci.instructor_user_id = ?
         AND c.organization_id = ?
         AND student.role = ?
         AND m.organization_id = c.organization_id
     ) visible`,
    user.id,
    UserRole.STUDENT,
    activeOrganization.organizationId,
    user.id,
    activeOrganization.organizationId,
    UserRole.STUDENT,
  );

  return new Set(rows.map((row) => row.student_uid));
};

export const buildVisibleStudentFilter = (
  visibleStudentIds: Iterable<string>,
  column = 'u.id',
): { sql: string; bindings: string[] } => {
  const ids = [...visibleStudentIds];
  if (ids.length === 0) {
    return {
      sql: ' AND 1 = 0',
      bindings: [],
    };
  }

  return {
    sql: ` AND ${column} IN (${buildInClause(ids.length)})`,
    bindings: ids,
  };
};

export const readOrganizationCohortRow = async (
  env: AppEnv,
  organizationId: string,
  cohortId: string,
): Promise<OrganizationCohort | null> => {
  const rows = await readOrganizationCohorts(env, organizationId);
  return rows.find((row) => row.id === cohortId) || null;
};

export const readStudentCohort = async (
  env: AppEnv,
  studentUid: string,
): Promise<{ cohortId: string; cohortName: string; organizationId: string } | null> => {
  const row = await readFirst<{
    cohort_id: string;
    cohort_name: string;
    organization_id: string;
  }>(
    env,
    `SELECT
       c.id AS cohort_id,
       c.name AS cohort_name,
       c.organization_id AS organization_id
     FROM organization_cohort_students cs
     JOIN organization_cohorts c ON c.id = cs.cohort_id
     WHERE cs.student_user_id = ?`,
    studentUid,
  );
  if (!row) return null;
  return {
    cohortId: row.cohort_id,
    cohortName: row.cohort_name,
    organizationId: row.organization_id,
  };
};
