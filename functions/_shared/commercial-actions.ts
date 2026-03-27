import type {
  CommercialRequestPayload,
  CommercialRequestUpdatePayload,
} from '../../contracts/storage';
import {
  CommercialRequestKind,
  CommercialRequestStatus,
  CommercialWorkspaceRole,
  OrganizationRole,
  SubscriptionPlan,
  TeachingFormat,
  type CommercialRequest,
  UserRole,
} from '../../types';
import { hasDuplicateOpenRequest, normalizeCommercialEmail } from '../../shared/commercial';
import { HttpError } from './http';
import {
  appendOrganizationAuditLog,
  clearActiveOrganizationMembership,
  getUserRoleForOrganizationRole,
  resolveOrCreateOrganization,
  upsertActiveOrganizationMembership,
} from './organization-memberships';
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
         OR normalized_contact_email = ?
      ORDER BY updated_at DESC`,
    user.id,
    normalizeCommercialEmail(user.email),
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
  if (!Object.values(CommercialRequestStatus).includes(payload.status)) {
    throw new HttpError(400, '申請ステータスが不正です。');
  }

  const current = await readFirst<DbCommercialRequestRow>(
    env,
    `SELECT * FROM commercial_requests WHERE id = ?`,
    payload.id,
  );
  if (!current) {
    throw new HttpError(404, '申請が見つかりません。');
  }

  await maybeProvisionLinkedUser(env, user, payload, now);

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
    payload.status,
    payload.resolutionNote || null,
    payload.linkedUserUid || null,
    payload.targetSubscriptionPlan || null,
    payload.targetOrganizationId || null,
    payload.targetOrganizationName || null,
    payload.targetOrganizationRole || null,
    now,
    payload.id,
  ).run();

  const updated = await readFirst<DbCommercialRequestRow>(
    env,
    `SELECT * FROM commercial_requests WHERE id = ?`,
    payload.id,
  );
  if (!updated) {
    throw new HttpError(500, '申請更新に失敗しました。');
  }
  return createCommercialRequestFromRow(updated);
};
