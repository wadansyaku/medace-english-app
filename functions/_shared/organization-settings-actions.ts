import {
  type OrganizationAuditEvent,
  type OrganizationEligibleInstructor,
  type OrganizationMemberSummary,
  OrganizationRole,
  type OrganizationSettingsSnapshot,
  SubscriptionPlan,
  UserRole,
} from '../../types';
import { HttpError } from './http';
import {
  appendOrganizationAuditLog,
  normalizeOrganizationNameKey,
  requireActiveOrganizationContext,
  syncOrganizationShadowForActiveMembers,
} from './organization-memberships';
import { readInstructorCohortMap, readOrganizationCohorts } from './student-visibility';
import type { AppEnv, DbUserRow } from './types';
import { readAll, readFirst } from './storage-support';
import { readEligibleOrganizationInstructor } from './organization-support';

export const handleGetOrganizationSettingsSnapshot = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<OrganizationSettingsSnapshot> => {
  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  const organizationRow = await readFirst<{
    id: string;
    display_name: string;
    name_key: string;
    subscription_plan: string;
    updated_at: number;
  }>(
    env,
    `SELECT id, display_name, name_key, subscription_plan, updated_at
     FROM organizations
     WHERE id = ?`,
    organization.organizationId,
  );

  if (!organizationRow) {
    throw new HttpError(404, '組織情報が見つかりません。');
  }

  const [memberRows, auditRows, cohorts, instructorCohorts, grantedInstructorRows] = await Promise.all([
    readAll<{
      user_uid: string;
      display_name: string;
      email: string;
      user_role: string;
      organization_role: string;
      subscription_plan: string;
      joined_at: number;
      updated_at: number;
    }>(
      env,
      `SELECT
         u.id AS user_uid,
         u.display_name AS display_name,
         u.email AS email,
         u.role AS user_role,
         m.role AS organization_role,
         u.subscription_plan AS subscription_plan,
         m.created_at AS joined_at,
         m.updated_at AS updated_at
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
       ORDER BY
         CASE m.role
           WHEN 'GROUP_ADMIN' THEN 0
           WHEN 'INSTRUCTOR' THEN 1
           ELSE 2
         END,
         u.display_name ASC`,
      organization.organizationId,
    ),
    readAll<{
      id: number;
      organization_id: string;
      actor_user_id: string;
      actor_display_name: string;
      action_type: string;
      target_type: string;
      target_id: string | null;
      payload_json: string | null;
      created_at: number;
    }>(
      env,
      `SELECT
         l.id AS id,
         l.organization_id AS organization_id,
         l.actor_user_id AS actor_user_id,
         actor.display_name AS actor_display_name,
         l.action_type AS action_type,
         l.target_type AS target_type,
         l.target_id AS target_id,
         l.payload_json AS payload_json,
         l.created_at AS created_at
       FROM organization_audit_logs l
       JOIN users actor ON actor.id = l.actor_user_id
       WHERE l.organization_id = ?
       ORDER BY l.created_at DESC
       LIMIT 20`,
      organization.organizationId,
    ),
    readOrganizationCohorts(env, organization.organizationId),
    readInstructorCohortMap(env, organization.organizationId),
    readAll<{ user_uid: string; display_name: string; email: string; grant_version: number }>(
      env,
      `SELECT u.id AS user_uid, u.display_name, u.email, g.grant_version
       FROM workspace_access_grants g
       JOIN users u ON u.id = g.user_id
       JOIN organizations o ON o.id = g.staff_organization_id AND o.status = 'ACTIVE'
       WHERE g.staff_organization_id = ?
         AND g.status = 'ACTIVE'
         AND g.teacher_access = 1
         AND g.grant_version > 0
         AND g.grant_version <= ?`,
      organization.organizationId,
      Number.MAX_SAFE_INTEGER,
    ),
  ]);

  const members: OrganizationMemberSummary[] = memberRows.map((row) => ({
    userUid: row.user_uid,
    displayName: row.display_name,
    email: row.email,
    userRole: row.user_role as UserRole,
    organizationRole: row.organization_role as OrganizationRole,
    subscriptionPlan: row.subscription_plan as SubscriptionPlan,
    joinedAt: Number(row.joined_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }));

  const instructorCandidates = new Map<string, OrganizationEligibleInstructor>();
  for (const member of members) {
    if (member.userRole === UserRole.INSTRUCTOR && member.organizationRole === OrganizationRole.INSTRUCTOR) {
      instructorCandidates.set(member.userUid, {
        userUid: member.userUid, displayName: member.displayName, email: member.email,
      });
    }
  }
  for (const row of grantedInstructorRows) {
    if (Number.isSafeInteger(row.grant_version) && !instructorCandidates.has(row.user_uid)) {
      instructorCandidates.set(row.user_uid, {
        userUid: row.user_uid, displayName: row.display_name, email: row.email,
      });
    }
  }
  // Use the same fresh eligibility check as setInstructorCohorts. In particular,
  // a canonical group administrator is not a cohort-scoped instructor.
  const checkedInstructors = await Promise.all([...instructorCandidates.values()].map(async (candidate) => {
    const instructor = await readEligibleOrganizationInstructor(env, candidate.userUid, organization.organizationId);
    return instructor?.role === UserRole.INSTRUCTOR
      && instructor.organization_role === OrganizationRole.INSTRUCTOR
      && instructor.organization_id === organization.organizationId ? candidate : null;
  }));
  const eligibleInstructors = checkedInstructors.filter((candidate): candidate is OrganizationEligibleInstructor => candidate !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ja') || left.userUid.localeCompare(right.userUid));

  const auditEvents: OrganizationAuditEvent[] = auditRows.map((row) => ({
    id: Number(row.id || 0),
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    actionType: row.action_type,
    targetType: row.target_type,
    targetId: row.target_id || undefined,
    payload: row.payload_json ? JSON.parse(row.payload_json) as Record<string, unknown> : undefined,
    createdAt: Number(row.created_at || 0),
  }));

  return {
    organizationId: organizationRow.id,
    displayName: organizationRow.display_name,
    nameKey: organizationRow.name_key,
    subscriptionPlan: organizationRow.subscription_plan as SubscriptionPlan,
    members,
    eligibleInstructors,
    cohorts,
    instructorCohorts,
    auditEvents,
    updatedAt: Number(organizationRow.updated_at || 0),
  };
};

export const handleUpdateOrganizationProfile = async (
  env: AppEnv,
  user: DbUserRow,
  displayName: string,
): Promise<OrganizationSettingsSnapshot> => {
  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  const trimmedDisplayName = displayName.trim();
  if (!trimmedDisplayName) {
    throw new HttpError(400, '組織名を入力してください。');
  }

  const nextNameKey = normalizeOrganizationNameKey(trimmedDisplayName);
  const currentOrganization = await readFirst<{
    id: string;
    display_name: string;
    name_key: string;
  }>(
    env,
    `SELECT id, display_name, name_key
     FROM organizations
     WHERE id = ?`,
    organization.organizationId,
  );

  if (!currentOrganization) {
    throw new HttpError(404, '組織情報が見つかりません。');
  }

  const duplicate = await readFirst<{ id: string }>(
    env,
    `SELECT id
     FROM organizations
     WHERE name_key = ?
       AND id != ?`,
    nextNameKey,
    organization.organizationId,
  );
  if (duplicate) {
    throw new HttpError(409, '同じ組織名が既に使われています。');
  }

  if (
    currentOrganization.display_name !== trimmedDisplayName
    || currentOrganization.name_key !== nextNameKey
  ) {
    const now = Date.now();
    await env.DB.prepare(`
      UPDATE organizations
         SET display_name = ?,
             name_key = ?,
             updated_at = ?
       WHERE id = ?
    `).bind(
      trimmedDisplayName,
      nextNameKey,
      now,
      organization.organizationId,
    ).run();

    await syncOrganizationShadowForActiveMembers(env, organization.organizationId);

    await env.DB.prepare(`
      UPDATE writing_assignments
         SET organization_name = ?,
             updated_at = ?
       WHERE organization_id = ?
    `).bind(
      trimmedDisplayName,
      now,
      organization.organizationId,
    ).run();

    await env.DB.prepare(`
      UPDATE organization_kpi_daily_snapshots
         SET organization_name = ?,
             updated_at = ?
       WHERE organization_id = ?
    `).bind(
      trimmedDisplayName,
      now,
      organization.organizationId,
    ).run();

    await appendOrganizationAuditLog(env, {
      organizationId: organization.organizationId,
      actorUserId: user.id,
      actionType: 'ORGANIZATION_RENAMED',
      targetType: 'organization',
      targetId: organization.organizationId,
      payload: {
        previousDisplayName: currentOrganization.display_name,
        nextDisplayName: trimmedDisplayName,
      },
    });
  }

  return handleGetOrganizationSettingsSnapshot(env, user);
};
