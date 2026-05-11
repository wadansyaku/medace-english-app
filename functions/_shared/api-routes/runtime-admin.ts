import { requireRole, requireUser } from '../auth';
import { HttpError, readJson } from '../http';
import { requireActiveOrganizationContext } from '../organization-memberships';
import getServerRuntimeFlags from '../runtime';
import {
  handleAssignStudentInstructor,
  handleSetStudentCohort,
  handleUpsertOrganizationCohort,
} from '../storage-organization-actions';
import {
  handleAssignWeeklyMission,
  handleCreateWeeklyMission,
} from '../storage-mission-actions';
import { readAll, readFirst } from '../storage-support';
import { assertSameOriginMutation } from '../request-guards';
import { replayPendingSideEffectJobs } from '../side-effect-jobs';
import { LearningTrack, OrganizationRole, UserRole, WeeklyMissionStatus } from '../../../types';
import { ApiRouteDefinition, createJsonResponse } from './runtime';
import type { DbUserRow } from '../types';

interface ReplaySideEffectJobsBody {
  limit?: number;
}

interface BootstrapDemoOrganizationBody {
  organizationId?: string;
}

const resolveBootstrapActor = async (
  env: Parameters<ApiRouteDefinition['handle']>[0]['env'],
  request: Request,
  user: DbUserRow,
  body: BootstrapDemoOrganizationBody,
): Promise<{ actor: DbUserRow; organizationId: string }> => {
  const runtimeFlags = getServerRuntimeFlags(request, env);
  if (runtimeFlags.deployment.isProductionLike) {
    throw new HttpError(403, '本番環境では demo bootstrap を実行できません。');
  }

  if (user.role === UserRole.ADMIN) {
    if (!body.organizationId) {
      throw new HttpError(400, '管理者が bootstrap する場合は organizationId が必要です。');
    }
    const actor = await readFirst<DbUserRow>(
      env,
      `SELECT u.*
       FROM users u
       JOIN organization_memberships m
         ON m.user_id = u.id
        AND m.status = 'ACTIVE'
       WHERE m.organization_id = ?
         AND u.role = ?
         AND m.role = ?
       ORDER BY u.created_at ASC
       LIMIT 1`,
      body.organizationId,
      UserRole.INSTRUCTOR,
      OrganizationRole.GROUP_ADMIN,
    );
    if (!actor) {
      throw new HttpError(404, '対象組織の group admin が見つかりません。');
    }
    return {
      actor,
      organizationId: body.organizationId,
    };
  }

  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  return {
    actor: user,
    organizationId: organization.organizationId,
  };
};

export const runtimeAdminRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'runtime/side-effect-jobs/replay' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      requireRole(user, [UserRole.ADMIN]);
      const body: ReplaySideEffectJobsBody = await readJson<ReplaySideEffectJobsBody>(request).catch(() => ({}));
      const limit = typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(100, Math.trunc(body.limit)))
        : 20;
      const result = await replayPendingSideEffectJobs(env, limit);
      return {
        logUser: user,
        response: createJsonResponse({
          completed: result.completed,
          failed: result.failed,
          limit,
          results: result.results,
        }),
      };
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'runtime-admin/bootstrap-demo-organization' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      if (user.role !== UserRole.ADMIN && user.organization_role !== OrganizationRole.GROUP_ADMIN) {
        throw new HttpError(403, 'この bootstrap を実行する権限がありません。');
      }
      const body: BootstrapDemoOrganizationBody = await readJson<BootstrapDemoOrganizationBody>(request).catch(() => ({}));
      const { actor, organizationId } = await resolveBootstrapActor(env, request, user, body);

      const [cohorts, students, instructors, books, existingMissionRow] = await Promise.all([
        readAll<{ id: string; name: string }>(
          env,
          `SELECT id, name
           FROM organization_cohorts
           WHERE organization_id = ?
           ORDER BY created_at ASC`,
          organizationId,
        ),
        readAll<{ id: string }>(
          env,
          `SELECT u.id AS id
           FROM users u
           JOIN organization_memberships m
             ON m.user_id = u.id
            AND m.status = 'ACTIVE'
           WHERE m.organization_id = ?
             AND u.role = ?
           ORDER BY u.created_at ASC`,
          organizationId,
          UserRole.STUDENT,
        ),
        readAll<{ id: string }>(
          env,
          `SELECT u.id AS id
           FROM users u
           JOIN organization_memberships m
             ON m.user_id = u.id
            AND m.status = 'ACTIVE'
           WHERE m.organization_id = ?
             AND u.role = ?
           ORDER BY CASE WHEN m.role = ? THEN 0 ELSE 1 END, u.created_at ASC`,
          organizationId,
          UserRole.INSTRUCTOR,
          OrganizationRole.GROUP_ADMIN,
        ),
        readAll<{ id: string; title: string }>(
          env,
          `SELECT id, title
           FROM books
           ORDER BY is_priority DESC, title ASC
           LIMIT 1`,
        ),
        readFirst<{ id: string }>(
          env,
          `SELECT id
           FROM weekly_missions
           WHERE organization_id = ?
           ORDER BY created_at ASC
           LIMIT 1`,
          organizationId,
        ),
      ]);

      if (students.length === 0) {
        throw new HttpError(404, 'bootstrap 対象の生徒が見つかりません。');
      }
      if (instructors.length === 0) {
        throw new HttpError(404, 'bootstrap 対象の講師が見つかりません。');
      }

      let cohortId = cohorts[0]?.id;
      let createdCohort = false;
      if (!cohortId) {
        const cohort = await handleUpsertOrganizationCohort(env, actor, undefined, '導入スタートクラス');
        cohortId = cohort.id;
        createdCohort = true;
      }

      const studentUid = students[0].id;
      const instructorUid = instructors[0].id;

      await handleSetStudentCohort(env, actor, studentUid, cohortId);
      await handleAssignStudentInstructor(env, actor, studentUid, instructorUid);

      let missionId = existingMissionRow?.id;
      let createdMission = false;
      if (!missionId) {
        const mission = await handleCreateWeeklyMission(env, actor, {
          learningTrack: LearningTrack.SCHOOL_TERM,
          title: '初回導入ミッション',
          rationale: '最初の導線確認のための最小ミッションです。',
          bookId: books[0]?.id,
          bookTitle: books[0]?.title,
          newWordsTarget: 8,
          reviewWordsTarget: 4,
          quizTargetCount: 1,
        });
        missionId = mission.id;
        createdMission = true;
      }

      const existingAssignment = await readFirst<{ id: string }>(
        env,
        `SELECT id
         FROM weekly_mission_assignments
         WHERE mission_id = ?
           AND student_user_id = ?
           AND status != ?
         ORDER BY assigned_at DESC
         LIMIT 1`,
        missionId,
        studentUid,
        WeeklyMissionStatus.ARCHIVED,
      );
      const assignedMission = !existingAssignment;
      if (!existingAssignment && missionId) {
        await handleAssignWeeklyMission(env, actor, missionId, studentUid);
      }

      return {
        logUser: user,
        response: createJsonResponse({
          organizationId,
          actorUserId: actor.id,
          createdCohort,
          createdMission,
          assignedMission,
          cohortId,
          missionId,
          studentUid,
          instructorUid,
        }),
      };
    },
  },
];
