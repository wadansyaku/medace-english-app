import type {
  CommercialActivationSetupPayload,
  CommercialActivationSetupResult,
  CommercialRequestPayload,
  CommercialRequestUpdatePayload,
} from '../../contracts/storage';
import {
  BusinessAdminWorkspaceView,
  CommercialRequestKind,
  CommercialRequestStatus,
  CommercialWorkspaceRole,
  LearningTrack,
  OrganizationRole,
  SubscriptionPlan,
  TeachingFormat,
  type CommercialRequest,
  UserRole,
  WeeklyMissionStatus,
} from '../../types';
import { hasDuplicateOpenRequest, normalizeCommercialEmail } from '../../shared/commercial';
import { HttpError } from './http';
import {
  appendOrganizationAuditLog,
  clearActiveOrganizationMembership,
  getUserRoleForOrganizationRole,
  isBusinessSubscriptionPlan,
  normalizeOrganizationNameKey,
  readActiveOrganizationContextForUser,
  readOrganizationById,
  readOrganizationByNameKey,
  resolveOrCreateOrganization,
  upsertActiveOrganizationMembership,
} from './organization-memberships';
import {
  handleAssignStudentInstructor,
  handleGetOrganizationDashboardSnapshot,
  handleSetStudentCohort,
  handleUpsertOrganizationCohort,
} from './storage-organization-actions';
import {
  handleAssignWeeklyMission,
  handleCreateWeeklyMission,
} from './storage-mission-actions';
import { recordProductEvent, recordProductEventForUser } from './product-events';
import { readAll, readFirst } from './storage-support';
import type { AppEnv, DbUserRow } from './types';

interface DbCommercialRequestRow {
  id: number;
  kind: string;
  status: string;
  contact_name: string;
  contact_email: string;
  organization_name: string | null;
  teaching_format: string | null;
  desired_start_timing: string | null;
  requested_workspace_role: string | null;
  seat_estimate: string | null;
  message: string;
  source: string;
  requested_by_user_id: string | null;
  linked_user_id: string | null;
  target_subscription_plan: string | null;
  target_organization_id: string | null;
  target_organization_name: string | null;
  target_organization_role: string | null;
  resolution_note: string | null;
  created_at: number;
  updated_at: number;
}

const OPEN_STATUSES = [
  CommercialRequestStatus.OPEN,
  CommercialRequestStatus.CONTACTED,
  CommercialRequestStatus.APPROVED,
] as const;
const BUSINESS_SUBSCRIPTION_PLANS = [
  SubscriptionPlan.TOB_FREE,
  SubscriptionPlan.TOB_PAID,
] as const;

const createCommercialRequestFromRow = (row: DbCommercialRequestRow): CommercialRequest => ({
  id: Number(row.id),
  kind: row.kind as CommercialRequestKind,
  status: row.status as CommercialRequestStatus,
  contactName: row.contact_name,
  contactEmail: row.contact_email,
  organizationName: row.organization_name || undefined,
  teachingFormat: row.teaching_format as TeachingFormat | undefined,
  desiredStartTiming: row.desired_start_timing || undefined,
  requestedWorkspaceRole: row.requested_workspace_role as CommercialWorkspaceRole | undefined,
  seatEstimate: row.seat_estimate || undefined,
  message: row.message,
  source: row.source,
  requestedByUid: row.requested_by_user_id || undefined,
  linkedUserUid: row.linked_user_id || undefined,
  targetSubscriptionPlan: row.target_subscription_plan as SubscriptionPlan | undefined,
  targetOrganizationId: row.target_organization_id || undefined,
  targetOrganizationName: row.target_organization_name || undefined,
  targetOrganizationRole: row.target_organization_role as OrganizationRole | undefined,
  resolutionNote: row.resolution_note || undefined,
  createdAt: Number(row.created_at || 0),
  updatedAt: Number(row.updated_at || 0),
});

const assertCommercialRequestPayload = (payload: CommercialRequestPayload): CommercialRequestPayload => {
  if (!Object.values(CommercialRequestKind).includes(payload.kind)) {
    throw new HttpError(400, '申請種別が不正です。');
  }

  const contactName = String(payload.contactName || '').trim();
  const contactEmail = normalizeCommercialEmail(String(payload.contactEmail || ''));
  const message = String(payload.message || '').trim();
  const source = String(payload.source || '').trim();
  const organizationName = String(payload.organizationName || '').trim();
  const desiredStartTiming = String(payload.desiredStartTiming || '').trim();
  const seatEstimate = String(payload.seatEstimate || '').trim();

  if (!contactName) throw new HttpError(400, '担当者名を入力してください。');
  if (!contactEmail || !contactEmail.includes('@')) throw new HttpError(400, '連絡先メールアドレスを入力してください。');
  if (!message) throw new HttpError(400, '相談内容を入力してください。');
  if (!source) throw new HttpError(400, '申請元情報が不足しています。');

  if (payload.kind !== CommercialRequestKind.PERSONAL_UPGRADE && !organizationName) {
    throw new HttpError(400, '学校名または教室名を入力してください。');
  }

  if (
    payload.teachingFormat
    && !Object.values(TeachingFormat).includes(payload.teachingFormat)
  ) {
    throw new HttpError(400, '授業形態が不正です。');
  }

  if (
    payload.requestedWorkspaceRole
    && !Object.values(CommercialWorkspaceRole).includes(payload.requestedWorkspaceRole)
  ) {
    throw new HttpError(400, '希望する役割が不正です。');
  }

  return {
    ...payload,
    contactName,
    contactEmail,
    message,
    source,
    organizationName: organizationName || undefined,
    desiredStartTiming: desiredStartTiming || undefined,
    seatEstimate: seatEstimate || undefined,
  };
};

export const assertCommercialRequestUpdatePayload = (
  payload: CommercialRequestUpdatePayload,
): CommercialRequestUpdatePayload => {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, '申請IDが不正です。');
  }
  if (!Object.values(CommercialRequestStatus).includes(payload.status)) {
    throw new HttpError(400, '申請ステータスが不正です。');
  }
  if (
    payload.targetSubscriptionPlan
    && !Object.values(SubscriptionPlan).includes(payload.targetSubscriptionPlan)
  ) {
    throw new HttpError(400, '反映先プランが不正です。');
  }
  if (
    payload.targetOrganizationRole
    && !Object.values(OrganizationRole).includes(payload.targetOrganizationRole)
  ) {
    throw new HttpError(400, '反映先の組織ロールが不正です。');
  }

  const resolutionNote = String(payload.resolutionNote || '').trim() || undefined;
  const linkedUserUid = String(payload.linkedUserUid || '').trim() || undefined;
  const targetOrganizationId = String(payload.targetOrganizationId || '').trim() || undefined;
  const targetOrganizationName = String(payload.targetOrganizationName || '').trim() || undefined;

  if (payload.status === CommercialRequestStatus.PROVISIONED) {
    if (!linkedUserUid) {
      throw new HttpError(400, '反映対象ユーザーを指定してください。');
    }
    if (!payload.targetSubscriptionPlan || !(BUSINESS_SUBSCRIPTION_PLANS as readonly SubscriptionPlan[]).includes(payload.targetSubscriptionPlan)) {
      throw new HttpError(400, 'ビジネスプランを指定してください。');
    }
    if (!payload.targetOrganizationRole) {
      throw new HttpError(400, '反映先の組織ロールを指定してください。');
    }
    if (!targetOrganizationId && !targetOrganizationName) {
      throw new HttpError(400, '反映先の組織を指定してください。');
    }
  }

  return {
    ...payload,
    id,
    resolutionNote,
    linkedUserUid,
    targetOrganizationId,
    targetOrganizationName,
  };
};

export const assertCommercialActivationSetupPayload = (
  payload: CommercialActivationSetupPayload,
): CommercialActivationSetupPayload => {
  if (typeof payload.requestId !== 'number' || !Number.isInteger(payload.requestId) || payload.requestId <= 0) {
    throw new HttpError(400, '申請IDが不正です。');
  }
  return { requestId: payload.requestId };
};

const readRecentCommercialRequests = async (
  env: AppEnv,
  normalizedEmail: string,
): Promise<CommercialRequest[]> => {
  const rows = await readAll<DbCommercialRequestRow>(
    env,
    `SELECT *
       FROM commercial_requests
      WHERE normalized_contact_email = ?
      ORDER BY updated_at DESC`,
    normalizedEmail,
  );
  return rows.map(createCommercialRequestFromRow);
};

const assertCommercialRequestRateLimit = async (
  env: AppEnv,
  normalizedEmail: string,
  now = Date.now(),
): Promise<void> => {
  const row = await readFirst<{ count: number }>(
    env,
    `SELECT COUNT(*) AS count
       FROM commercial_requests
      WHERE normalized_contact_email = ?
        AND created_at >= ?`,
    normalizedEmail,
    now - (15 * 60 * 1000),
  );

  if ((row?.count || 0) >= 3) {
    throw new HttpError(429, '短時間に申請が集中しています。15分ほど待ってから再試行してください。');
  }
};

const maybeProvisionLinkedUser = async (
  env: AppEnv,
  actorUser: DbUserRow,
  payload: CommercialRequestUpdatePayload,
  now: number,
): Promise<void> => {
  if (payload.status !== CommercialRequestStatus.PROVISIONED || !payload.linkedUserUid) {
    return;
  }

  const targetUser = await readFirst<DbUserRow>(
    env,
    `SELECT * FROM users WHERE id = ?`,
    payload.linkedUserUid,
  );
  if (!targetUser) {
    throw new HttpError(404, '反映対象ユーザーが見つかりません。');
  }

  const nextPlan = payload.targetSubscriptionPlan || targetUser.subscription_plan as SubscriptionPlan || SubscriptionPlan.TOC_FREE;
  const nextOrganizationRole = payload.targetOrganizationRole
    || (targetUser.organization_role as OrganizationRole | null)
    || (targetUser.role === UserRole.INSTRUCTOR ? OrganizationRole.INSTRUCTOR : OrganizationRole.STUDENT);
  const isBusinessPlan = nextPlan === SubscriptionPlan.TOB_FREE || nextPlan === SubscriptionPlan.TOB_PAID;

  if (!isBusinessPlan) {
    await clearActiveOrganizationMembership(env, {
      userId: payload.linkedUserUid,
      subscriptionPlan: nextPlan,
      userRole: UserRole.STUDENT,
    });
    return;
  }

  const organization = await resolveOrCreateOrganization(env, {
    targetOrganizationId: payload.targetOrganizationId,
    targetOrganizationName: payload.targetOrganizationName || targetUser.organization_name || undefined,
    subscriptionPlan: nextPlan,
  });

  await upsertActiveOrganizationMembership(env, {
    userId: payload.linkedUserUid,
    organizationId: organization.id,
    organizationRole: nextOrganizationRole,
    subscriptionPlan: nextPlan,
  });

  await env.DB.prepare(`
    UPDATE users
       SET role = ?,
           subscription_plan = ?,
           updated_at = ?
     WHERE id = ?
  `).bind(
    getUserRoleForOrganizationRole(nextOrganizationRole),
    nextPlan,
    now,
    payload.linkedUserUid,
  ).run();

  await appendOrganizationAuditLog(env, {
    organizationId: organization.id,
    actorUserId: actorUser.id,
    actionType: 'COMMERCIAL_PROVISIONED',
    targetType: 'USER',
    targetId: payload.linkedUserUid,
    payload: {
      subscriptionPlan: nextPlan,
      organizationRole: nextOrganizationRole,
    },
  });
};

export const handleCreateCommercialRequest = async (
  env: AppEnv,
  payload: CommercialRequestPayload,
  requestedByUser?: DbUserRow,
): Promise<CommercialRequest> => {
  const now = Date.now();
  const input = assertCommercialRequestPayload(payload);
  const recentRequests = await readRecentCommercialRequests(env, input.contactEmail);

  if (hasDuplicateOpenRequest(recentRequests, input.contactEmail, input.kind, requestedByUser?.id)) {
    throw new HttpError(409, '進行中の申請があるため、新しい申請は作成できません。');
  }

  await assertCommercialRequestRateLimit(env, input.contactEmail, now);

  const insertResult = await env.DB.prepare(`
    INSERT INTO commercial_requests (
      kind, status, contact_name, contact_email, normalized_contact_email,
      organization_name, teaching_format, desired_start_timing,
      requested_workspace_role, seat_estimate,
      message, source, requested_by_user_id, linked_user_id,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.kind,
    CommercialRequestStatus.OPEN,
    input.contactName,
    input.contactEmail,
    input.contactEmail,
    input.organizationName || null,
    input.teachingFormat || null,
    input.desiredStartTiming || null,
    input.requestedWorkspaceRole || null,
    input.seatEstimate || null,
    input.message,
    input.source,
    requestedByUser?.id || null,
    requestedByUser?.id || null,
    now,
    now,
  ).run();

  const insertedId = Number(insertResult.meta.last_row_id || 0);
  const row = await readFirst<DbCommercialRequestRow>(
    env,
    `SELECT * FROM commercial_requests WHERE id = ?`,
    insertedId,
  );
  if (!row) {
    throw new HttpError(500, '申請の保存に失敗しました。');
  }
  if (requestedByUser) {
    await recordProductEventForUser(env, requestedByUser, {
      eventName: 'commercial_request_submitted',
      subjectType: 'commercial_request',
      subjectId: String(insertedId),
      status: CommercialRequestStatus.OPEN,
      metadata: {
        kind: input.kind,
        source: input.source,
        teachingFormat: input.teachingFormat || null,
        requestedWorkspaceRole: input.requestedWorkspaceRole || null,
      },
    });
  } else {
    await recordProductEvent(env, {
      eventName: 'commercial_request_submitted',
      subjectType: 'commercial_request',
      subjectId: String(insertedId),
      status: CommercialRequestStatus.OPEN,
      metadata: {
        kind: input.kind,
        source: input.source,
        organizationName: input.organizationName || null,
        teachingFormat: input.teachingFormat || null,
        requestedWorkspaceRole: input.requestedWorkspaceRole || null,
      },
    });
  }
  return createCommercialRequestFromRow(row);
};

export const handleGetCommercialRequestStatus = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<CommercialRequest[]> => {
  const rows = await readAll<DbCommercialRequestRow>(
    env,
    `SELECT *
       FROM commercial_requests
      WHERE requested_by_user_id = ?
      ORDER BY updated_at DESC`,
    user.id,
  );
  return rows.map(createCommercialRequestFromRow);
};

export const handleListCommercialRequests = async (
  env: AppEnv,
): Promise<CommercialRequest[]> => {
  const rows = await readAll<DbCommercialRequestRow>(
    env,
    `SELECT *
       FROM commercial_requests
      ORDER BY updated_at DESC, created_at DESC`,
  );
  return rows.map(createCommercialRequestFromRow);
};

export const handleUpdateCommercialRequest = async (
  env: AppEnv,
  user: DbUserRow,
  payload: CommercialRequestUpdatePayload,
): Promise<CommercialRequest> => {
  const now = Date.now();
  const input = assertCommercialRequestUpdatePayload(payload);

  const current = await readFirst<DbCommercialRequestRow>(
    env,
    `SELECT * FROM commercial_requests WHERE id = ?`,
    input.id,
  );
  if (!current) {
    throw new HttpError(404, '申請が見つかりません。');
  }

  await maybeProvisionLinkedUser(env, user, input, now);

  await env.DB.prepare(`
    UPDATE commercial_requests
       SET status = ?,
           resolution_note = ?,
           linked_user_id = COALESCE(?, linked_user_id),
           target_subscription_plan = ?,
           target_organization_id = ?,
           target_organization_name = ?,
           target_organization_role = ?,
           updated_at = ?
     WHERE id = ?
  `).bind(
    input.status,
    input.resolutionNote || null,
    input.linkedUserUid || null,
    input.targetSubscriptionPlan || null,
    input.targetOrganizationId || null,
    input.targetOrganizationName || null,
    input.targetOrganizationRole || null,
    now,
    input.id,
  ).run();

  const updated = await readFirst<DbCommercialRequestRow>(
    env,
    `SELECT * FROM commercial_requests WHERE id = ?`,
    input.id,
  );
  if (!updated) {
    throw new HttpError(500, '申請更新に失敗しました。');
  }
  return createCommercialRequestFromRow(updated);
};

const resolveCommercialActivationOrganization = async (
  env: AppEnv,
  request: DbCommercialRequestRow,
) => {
  let organization = request.target_organization_id
    ? await readOrganizationById(env, request.target_organization_id)
    : null;

  if (!organization && request.target_organization_name) {
    organization = await readOrganizationByNameKey(
      env,
      normalizeOrganizationNameKey(request.target_organization_name),
    );
  }

  if (!organization && request.linked_user_id) {
    const linkedUserOrganization = await readActiveOrganizationContextForUser(env, request.linked_user_id);
    organization = linkedUserOrganization
      ? await readOrganizationById(env, linkedUserOrganization.organizationId)
      : null;
  }

  if (!organization) {
    throw new HttpError(409, '反映済み商談に紐づく組織が見つかりません。先にプロビジョニング内容を確認してください。');
  }
  if (!isBusinessSubscriptionPlan(organization.subscription_plan)) {
    throw new HttpError(409, '初回運用セットアップはビジネス組織にのみ実行できます。');
  }

  return organization;
};

const readCommercialActivationActor = async (
  env: AppEnv,
  organizationId: string,
): Promise<DbUserRow> => {
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
    organizationId,
    UserRole.INSTRUCTOR,
    OrganizationRole.GROUP_ADMIN,
  );
  if (!actor) {
    throw new HttpError(409, '初回セットアップを実行できるグループ管理者が対象組織にいません。');
  }
  return actor;
};

export const handlePrepareCommercialActivationSetup = async (
  env: AppEnv,
  user: DbUserRow,
  payload: CommercialActivationSetupPayload,
): Promise<CommercialActivationSetupResult> => {
  const { requestId } = assertCommercialActivationSetupPayload(payload);
  const request = await readFirst<DbCommercialRequestRow>(
    env,
    'SELECT * FROM commercial_requests WHERE id = ?',
    requestId,
  );
  if (!request) {
    throw new HttpError(404, '申請が見つかりません。');
  }
  if (request.status !== CommercialRequestStatus.PROVISIONED) {
    throw new HttpError(409, '初回運用セットアップはPROVISIONED済みの商談にのみ実行できます。');
  }

  const organization = await resolveCommercialActivationOrganization(env, request);
  const actor = await readCommercialActivationActor(env, organization.id);

  const [cohorts, students, instructors, books] = await Promise.all([
    readAll<{ id: string; name: string }>(
      env,
      `SELECT id, name
         FROM organization_cohorts
        WHERE organization_id = ?
        ORDER BY created_at ASC`,
      organization.id,
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
      organization.id,
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
      organization.id,
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
  ]);

  if (students.length === 0) {
    throw new HttpError(409, '初回セットアップ対象の生徒が対象組織にいません。');
  }
  if (instructors.length === 0) {
    throw new HttpError(409, '初回セットアップ対象の講師が対象組織にいません。');
  }

  const existingStudentCohort = await readFirst<{ cohort_id: string }>(
    env,
    `SELECT c.id AS cohort_id
       FROM organization_cohort_students cs
       JOIN organization_cohorts c ON c.id = cs.cohort_id
      WHERE cs.student_user_id = ?
        AND c.organization_id = ?
      LIMIT 1`,
    students[0].id,
    organization.id,
  );

  let cohortId = existingStudentCohort?.cohort_id || cohorts[0]?.id;
  let createdCohort = false;
  if (!cohortId) {
    const cohort = await handleUpsertOrganizationCohort(env, actor, undefined, '導入スタートクラス');
    cohortId = cohort.id;
    createdCohort = true;
  }

  const studentUid = students[0].id;
  const instructorIds = new Set(instructors.map((instructor) => instructor.id));
  const existingInstructorAssignment = await readFirst<{ instructor_user_id: string | null }>(
    env,
    'SELECT instructor_user_id FROM student_instructor_assignments WHERE student_user_id = ?',
    studentUid,
  );
  const existingInstructorUid = existingInstructorAssignment?.instructor_user_id
    && instructorIds.has(existingInstructorAssignment.instructor_user_id)
    ? existingInstructorAssignment.instructor_user_id
    : null;
  const instructorUid = existingInstructorUid || instructors[0].id;

  if (!existingStudentCohort) {
    await handleSetStudentCohort(env, actor, studentUid, cohortId);
  }
  if (!existingInstructorUid) {
    await handleAssignStudentInstructor(env, actor, studentUid, instructorUid);
  }

  const activeAssignment = await readFirst<{ id: string; mission_id: string }>(
    env,
    `SELECT a.id, a.mission_id
       FROM weekly_mission_assignments a
       JOIN weekly_missions m ON m.id = a.mission_id
      WHERE m.organization_id = ?
        AND a.student_user_id = ?
        AND a.status != ?
      ORDER BY a.assigned_at DESC
      LIMIT 1`,
    organization.id,
    studentUid,
    WeeklyMissionStatus.ARCHIVED,
  );

  let missionId = activeAssignment?.mission_id;
  let missionAssignmentId = activeAssignment?.id;
  let createdMission = false;
  let assignedMission = false;

  if (!missionId) {
    const existingMission = await readFirst<{ id: string }>(
      env,
      `SELECT id
         FROM weekly_missions
        WHERE organization_id = ?
        ORDER BY created_at ASC
        LIMIT 1`,
      organization.id,
    );
    missionId = existingMission?.id;
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

    const assignment = await handleAssignWeeklyMission(env, actor, missionId, studentUid);
    missionAssignmentId = assignment.id;
    assignedMission = true;
  }
  if (!missionId) {
    throw new HttpError(500, '初回ミッションの準備に失敗しました。');
  }

  await appendOrganizationAuditLog(env, {
    organizationId: organization.id,
    actorUserId: user.id,
    actionType: 'COMMERCIAL_ACTIVATION_SETUP_PREPARED',
    targetType: 'commercial_request',
    targetId: String(requestId),
    payload: {
      actorUserId: actor.id,
      cohortId,
      studentUid,
      instructorUid,
      missionId,
      missionAssignmentId: missionAssignmentId || null,
      createdCohort,
      createdMission,
      assignedMission,
    },
  });

  const dashboard = await handleGetOrganizationDashboardSnapshot(env, actor);
  const nextActionTarget = dashboard.nextRequiredActionTarget || {
    kind: 'INSTRUCTOR_NOTIFICATION' as const,
    targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
    organizationId: organization.id,
    studentUid,
    instructorUid,
    missionAssignmentId,
    missionId,
  };

  return {
    commercialRequestId: requestId,
    organizationId: organization.id,
    organizationName: organization.display_name,
    actorUserId: actor.id,
    createdCohort,
    cohortId,
    studentUid,
    instructorUid,
    createdMission,
    assignedMission,
    missionId,
    missionAssignmentId,
    nextActionLabel: dashboard.nextRequiredActionLabel || '初回通知へ進む',
    nextActionTarget,
  };
};
