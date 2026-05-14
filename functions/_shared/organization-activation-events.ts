import {
  OrganizationRole,
  UserRole,
  type ClassroomActivationLifecycleStage,
  type ClassroomWorksheetLifecycleEventResult,
  type ClassroomWorksheetLifecycleStatus,
  type ClassroomWorksheetSource,
} from '../../types';
import { HttpError } from './http';
import { requireActiveOrganizationContext } from './organization-memberships';
import { readActiveOrganizationMember } from './organization-support';
import { canAccessVisibleStudent } from './student-visibility';
import { readFirst } from './storage-support';
import type { AppEnv, DbUserRow } from './types';

export const CLASSROOM_WORKSHEET_SOURCES = ['history', 'catalog_fallback', 'starter_fallback'] as const satisfies readonly ClassroomWorksheetSource[];
export const CLASSROOM_WORKSHEET_LIFECYCLE_STATUSES = ['printed', 'issued', 'collected', 'scored'] as const satisfies readonly ClassroomWorksheetLifecycleStatus[];

interface AppendClassroomActivationEventInput {
  organizationId: string;
  runId: string;
  lifecycleStage: ClassroomActivationLifecycleStage;
  eventType: string;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt: number;
}

export interface RecordClassroomWorksheetLifecycleEventInput {
  studentUid: string;
  worksheetSource: ClassroomWorksheetSource;
  lifecycleStatus: ClassroomWorksheetLifecycleStatus;
  cohortId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: number;
}

const createLifecycleId = (prefix: string): string => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

const stringifyPayload = (payload?: Record<string, unknown>): string => JSON.stringify(payload || {});

const ensureClassroomActivationRun = async (
  env: AppEnv,
  input: {
    organizationId: string;
    cohortId?: string;
    actorUserId?: string;
    now: number;
  },
): Promise<string> => {
  const row = await readFirst<{ id: string }>(
    env,
    `SELECT id
     FROM classroom_activation_runs
     WHERE organization_id = ?
       AND status = 'ACTIVE'
       AND ((? IS NULL AND cohort_id IS NULL) OR cohort_id = ?)
     ORDER BY updated_at DESC
     LIMIT 1`,
    input.organizationId,
    input.cohortId || null,
    input.cohortId || null,
  );

  if (row?.id) {
    await env.DB.prepare(`
      UPDATE classroom_activation_runs
         SET updated_at = ?
       WHERE id = ?
    `).bind(input.now, row.id).run();
    return row.id;
  }

  const runId = createLifecycleId('classroom_run');
  await env.DB.prepare(`
    INSERT INTO classroom_activation_runs (
      id,
      organization_id,
      cohort_id,
      status,
      started_at,
      completed_at,
      created_by,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 'ACTIVE', ?, NULL, ?, ?, ?)
  `).bind(
    runId,
    input.organizationId,
    input.cohortId || null,
    input.now,
    input.actorUserId || null,
    input.now,
    input.now,
  ).run();

  return runId;
};

export const appendClassroomActivationEvent = async (
  env: AppEnv,
  input: AppendClassroomActivationEventInput,
): Promise<string> => {
  const eventId = createLifecycleId('classroom_event');
  await env.DB.prepare(`
    INSERT INTO classroom_activation_events (
      id,
      run_id,
      organization_id,
      lifecycle_stage,
      event_type,
      actor_user_id,
      subject_user_id,
      payload_json,
      occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId,
    input.runId,
    input.organizationId,
    input.lifecycleStage,
    input.eventType,
    input.actorUserId || null,
    input.subjectUserId || null,
    stringifyPayload(input.payload),
    input.occurredAt,
  ).run();
  return eventId;
};

export const handleRecordClassroomWorksheetLifecycleEvent = async (
  env: AppEnv,
  user: DbUserRow,
  input: RecordClassroomWorksheetLifecycleEventInput,
): Promise<ClassroomWorksheetLifecycleEventResult> => {
  const organization = await requireActiveOrganizationContext(env, user, [
    OrganizationRole.GROUP_ADMIN,
    OrganizationRole.INSTRUCTOR,
  ]);
  const student = await readActiveOrganizationMember(env, input.studentUid);

  if (!student || student.role !== UserRole.STUDENT || student.organization_id !== organization.organizationId) {
    throw new HttpError(403, '担当組織の生徒のみ worksheet lifecycle を記録できます。');
  }
  const canAccessStudent = await canAccessVisibleStudent(env, user, input.studentUid, organization);
  if (!canAccessStudent) {
    throw new HttpError(403, '担当範囲の生徒のみ worksheet lifecycle を記録できます。');
  }

  const occurredAt = input.occurredAt || Date.now();
  const runId = await ensureClassroomActivationRun(env, {
    organizationId: organization.organizationId,
    cohortId: input.cohortId,
    actorUserId: user.id,
    now: occurredAt,
  });
  const worksheetEventId = createLifecycleId('worksheet_lifecycle');
  const lifecyclePayload = {
    ...(input.payload || {}),
    worksheetSource: input.worksheetSource,
    lifecycleStatus: input.lifecycleStatus,
  };

  await env.DB.prepare(`
    INSERT INTO classroom_worksheet_lifecycle_events (
      id,
      run_id,
      organization_id,
      student_user_id,
      worksheet_source,
      lifecycle_status,
      payload_json,
      occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    worksheetEventId,
    runId,
    organization.organizationId,
    input.studentUid,
    input.worksheetSource,
    input.lifecycleStatus,
    stringifyPayload(input.payload),
    occurredAt,
  ).run();

  const eventId = await appendClassroomActivationEvent(env, {
    organizationId: organization.organizationId,
    runId,
    lifecycleStage: 'worksheet',
    eventType: `worksheet_${input.lifecycleStatus}`,
    actorUserId: user.id,
    subjectUserId: input.studentUid,
    payload: {
      ...lifecyclePayload,
      worksheetEventId,
    },
    occurredAt,
  });

  return {
    runId,
    eventId,
    worksheetEventId,
    worksheetSource: input.worksheetSource,
    lifecycleStatus: input.lifecycleStatus,
    occurredAt,
  };
};
