import {
  type OrganizationCohort,
  OrganizationRole,
  UserRole,
} from '../../types';
import { rebuildOrganizationKpiSnapshots } from './organization-kpi';
import { HttpError } from './http';
import { appendOrganizationAuditLog, requireActiveOrganizationContext } from './organization-memberships';
import {
  readInstructorCohortMap,
  readOrganizationCohortRow,
  readOrganizationCohorts,
  readStudentCohort,
} from './student-visibility';
import type { AppEnv, DbUserRow } from './types';
import { readFirst, toTokyoDateKey } from './storage-support';
import { readActiveOrganizationMember } from './organization-support';

export const handleAssignStudentInstructor = async (
  env: AppEnv,
  currentUser: DbUserRow,
  studentUid: string,
  instructorUid: string | null,
): Promise<void> => {
  if (!studentUid) throw new HttpError(400, '生徒を指定してください。');
  const currentOrganization = currentUser.role === UserRole.ADMIN
    ? null
    : await requireActiveOrganizationContext(env, currentUser, [OrganizationRole.GROUP_ADMIN]);

  const student = await readActiveOrganizationMember(env, studentUid);
  if (!student || student.role !== UserRole.STUDENT) throw new HttpError(404, '対象生徒が見つかりません。');
  if (currentOrganization && student.organization_id !== currentOrganization.organizationId) {
    throw new HttpError(403, '同じ組織の生徒のみ担当変更できます。');
  }

  const existingAssignment = await readFirst<{ instructor_user_id: string | null }>(
    env,
    'SELECT instructor_user_id FROM student_instructor_assignments WHERE student_user_id = ?',
    studentUid,
  );
  const previousInstructorUid = existingAssignment?.instructor_user_id || null;

  if (previousInstructorUid === instructorUid) {
    return;
  }

  if (instructorUid) {
    const instructor = await readActiveOrganizationMember(env, instructorUid);
    if (!instructor || instructor.role !== UserRole.INSTRUCTOR) {
      throw new HttpError(404, '担当講師が見つかりません。');
    }
    if (!student.organization_id) {
      throw new HttpError(400, '組織に所属していない生徒には担当割当できません。');
    }
    if (instructor.organization_id !== student.organization_id) {
      throw new HttpError(400, '生徒と同じ組織の講師にのみ割り当てできます。');
    }
    if (currentOrganization && instructor.organization_id !== currentOrganization.organizationId) {
      throw new HttpError(403, '同じ組織の講師にのみ割り当てできます。');
    }
    await env.DB.prepare(`
      INSERT INTO student_instructor_assignments (student_user_id, instructor_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_user_id) DO UPDATE SET
        instructor_user_id = excluded.instructor_user_id,
        updated_at = excluded.updated_at
    `).bind(studentUid, instructorUid, Date.now(), Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM student_instructor_assignments WHERE student_user_id = ?').bind(studentUid).run();
  }

  await env.DB.prepare(`
    INSERT INTO student_instructor_assignment_events (
      student_user_id,
      previous_instructor_user_id,
      next_instructor_user_id,
      changed_by_user_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(
    studentUid,
    previousInstructorUid,
    instructorUid,
    currentUser.id,
    Date.now(),
  ).run();

  if (student.organization_id) {
    await appendOrganizationAuditLog(env, {
      organizationId: student.organization_id,
      actorUserId: currentUser.id,
      actionType: 'STUDENT_ASSIGNMENT_CHANGED',
      targetType: 'student',
      targetId: studentUid,
      payload: {
        previousInstructorUid,
        nextInstructorUid: instructorUid,
      },
    });
    await rebuildOrganizationKpiSnapshots(env, student.organization_id, {
      dateKeys: [toTokyoDateKey(Date.now())],
    });
  }
};

export const handleUpsertOrganizationCohort = async (
  env: AppEnv,
  user: DbUserRow,
  cohortId: string | undefined,
  name: string,
): Promise<OrganizationCohort> => {
  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new HttpError(400, 'クラス/担当グループ名を入力してください。');
  }

  const duplicate = await readFirst<{ id: string }>(
    env,
    `SELECT id
     FROM organization_cohorts
     WHERE organization_id = ?
       AND lower(name) = lower(?)
       AND (? IS NULL OR id != ?)`,
    organization.organizationId,
    trimmedName,
    cohortId || null,
    cohortId || null,
  );
  if (duplicate) {
    throw new HttpError(409, '同じクラス/担当グループ名が既に存在します。');
  }

  const now = Date.now();
  let actionType = 'ORGANIZATION_COHORT_CREATED';
  let previousName: string | undefined;
  let nextCohortId = cohortId;

  if (cohortId) {
    const currentCohort = await readOrganizationCohortRow(env, organization.organizationId, cohortId);
    if (!currentCohort) {
      throw new HttpError(404, '対象のクラス/担当グループが見つかりません。');
    }
    previousName = currentCohort.name;
    if (currentCohort.name === trimmedName) {
      return currentCohort;
    }
    await env.DB.prepare(`
      UPDATE organization_cohorts
         SET name = ?,
             updated_at = ?
       WHERE id = ?
    `).bind(
      trimmedName,
      now,
      cohortId,
    ).run();
    actionType = 'ORGANIZATION_COHORT_RENAMED';
  } else {
    nextCohortId = `cohort_${crypto.randomUUID().replace(/-/g, '')}`;
    await env.DB.prepare(`
      INSERT INTO organization_cohorts (
        id,
        organization_id,
        name,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      nextCohortId,
      organization.organizationId,
      trimmedName,
      now,
      now,
    ).run();
  }

  await appendOrganizationAuditLog(env, {
    organizationId: organization.organizationId,
    actorUserId: user.id,
    actionType,
    targetType: 'cohort',
    targetId: nextCohortId,
    payload: {
      previousName,
      nextName: trimmedName,
    },
  });

  const savedCohort = await readOrganizationCohortRow(env, organization.organizationId, String(nextCohortId));
  if (!savedCohort) {
    throw new HttpError(500, 'クラス/担当グループの保存に失敗しました。');
  }
  return savedCohort;
};

export const handleSetStudentCohort = async (
  env: AppEnv,
  user: DbUserRow,
  studentUid: string,
  cohortId: string | null,
): Promise<void> => {
  if (!studentUid) {
    throw new HttpError(400, '対象生徒を指定してください。');
  }

  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  const student = await readActiveOrganizationMember(env, studentUid);
  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '対象生徒が見つかりません。');
  }
  if (student.organization_id !== organization.organizationId) {
    throw new HttpError(403, '同じ組織の生徒のみ更新できます。');
  }

  const previousCohort = await readStudentCohort(env, studentUid);
  if (!cohortId && !previousCohort) return;
  if (cohortId && previousCohort?.cohortId === cohortId) return;

  let nextCohortName: string | undefined;
  if (cohortId) {
    const cohort = await readOrganizationCohortRow(env, organization.organizationId, cohortId);
    if (!cohort) {
      throw new HttpError(404, '指定したクラス/担当グループが見つかりません。');
    }
    nextCohortName = cohort.name;
    await env.DB.prepare(`
      INSERT INTO organization_cohort_students (
        student_user_id,
        cohort_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(student_user_id) DO UPDATE SET
        cohort_id = excluded.cohort_id,
        updated_at = excluded.updated_at
    `).bind(
      studentUid,
      cohortId,
      Date.now(),
      Date.now(),
    ).run();
  } else {
    await env.DB.prepare(
      'DELETE FROM organization_cohort_students WHERE student_user_id = ?',
    ).bind(studentUid).run();
  }

  await appendOrganizationAuditLog(env, {
    organizationId: organization.organizationId,
    actorUserId: user.id,
    actionType: 'STUDENT_COHORT_CHANGED',
    targetType: 'student',
    targetId: studentUid,
    payload: {
      previousCohortId: previousCohort?.cohortId || null,
      previousCohortName: previousCohort?.cohortName || null,
      nextCohortId: cohortId,
      nextCohortName: nextCohortName || null,
    },
  });
};

export const handleSetInstructorCohorts = async (
  env: AppEnv,
  user: DbUserRow,
  instructorUid: string,
  cohortIds: string[],
): Promise<void> => {
  if (!instructorUid) {
    throw new HttpError(400, '対象講師を指定してください。');
  }

  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  const instructor = await readActiveOrganizationMember(env, instructorUid);
  if (!instructor || instructor.role !== UserRole.INSTRUCTOR || instructor.organization_role !== OrganizationRole.INSTRUCTOR) {
    throw new HttpError(404, '対象講師が見つかりません。');
  }
  if (instructor.organization_id !== organization.organizationId) {
    throw new HttpError(403, '同じ組織の講師のみ更新できます。');
  }

  const nextCohortIds = [...new Set(cohortIds.filter(Boolean))];
  const availableCohorts = await readOrganizationCohorts(env, organization.organizationId);
  const availableCohortIds = new Set(availableCohorts.map((cohort) => cohort.id));
  if (!nextCohortIds.every((cohortId) => availableCohortIds.has(cohortId))) {
    throw new HttpError(404, '指定したクラス/担当グループが見つかりません。');
  }

  const instructorCohorts = await readInstructorCohortMap(env, organization.organizationId);
  const previousCohortIds = instructorCohorts[instructorUid] || [];
  const previousKey = [...previousCohortIds].sort().join(',');
  const nextKey = [...nextCohortIds].sort().join(',');
  if (previousKey === nextKey) return;

  await env.DB.prepare(`
    DELETE FROM organization_cohort_instructors
     WHERE instructor_user_id = ?
       AND cohort_id IN (
         SELECT id
         FROM organization_cohorts
         WHERE organization_id = ?
       )
  `).bind(
    instructorUid,
    organization.organizationId,
  ).run();

  const now = Date.now();
  for (const nextCohortId of nextCohortIds) {
    await env.DB.prepare(`
      INSERT INTO organization_cohort_instructors (
        cohort_id,
        instructor_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
    `).bind(
      nextCohortId,
      instructorUid,
      now,
      now,
    ).run();
  }

  await appendOrganizationAuditLog(env, {
    organizationId: organization.organizationId,
    actorUserId: user.id,
    actionType: 'INSTRUCTOR_COHORTS_CHANGED',
    targetType: 'instructor',
    targetId: instructorUid,
    payload: {
      previousCohortIds,
      nextCohortIds,
    },
  });
};
