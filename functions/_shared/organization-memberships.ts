import {
  OrganizationRole,
  SubscriptionPlan,
  UserRole,
} from '../../types';
import { HttpError } from './http';
import { readFirst } from './storage-support';
import type { AppEnv, DbUserRow } from './types';

export interface DbOrganizationRow {
  id: string;
  display_name: string;
  name_key: string;
  subscription_plan: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface ActiveOrganizationContext {
  organizationId: string;
  organizationName: string;
  subscriptionPlan: SubscriptionPlan;
  organizationRole: OrganizationRole;
}

const BUSINESS_SUBSCRIPTION_PLANS = new Set<SubscriptionPlan>([
  SubscriptionPlan.TOB_FREE,
  SubscriptionPlan.TOB_PAID,
]);

export const isBusinessSubscriptionPlan = (plan: SubscriptionPlan | string | null | undefined): plan is SubscriptionPlan => (
  Boolean(plan && BUSINESS_SUBSCRIPTION_PLANS.has(plan as SubscriptionPlan))
);

export const normalizeOrganizationNameKey = (value: string): string => value.trim().toLowerCase();

const deriveOrganizationRole = (user: Pick<DbUserRow, 'role' | 'organization_role'>): OrganizationRole | null => {
  if (user.organization_role && Object.values(OrganizationRole).includes(user.organization_role as OrganizationRole)) {
    return user.organization_role as OrganizationRole;
  }
  if (user.role === UserRole.INSTRUCTOR) return OrganizationRole.INSTRUCTOR;
  if (user.role === UserRole.STUDENT) return OrganizationRole.STUDENT;
  return null;
};

export const getUserRoleForOrganizationRole = (organizationRole: OrganizationRole): UserRole => (
  organizationRole === OrganizationRole.STUDENT ? UserRole.STUDENT : UserRole.INSTRUCTOR
);

export const readOrganizationById = async (
  env: AppEnv,
  organizationId: string,
): Promise<DbOrganizationRow | null> => readFirst<DbOrganizationRow>(
  env,
  'SELECT * FROM organizations WHERE id = ?',
  organizationId,
);

export const readOrganizationByNameKey = async (
  env: AppEnv,
  nameKey: string,
): Promise<DbOrganizationRow | null> => readFirst<DbOrganizationRow>(
  env,
  'SELECT * FROM organizations WHERE name_key = ?',
  nameKey,
);

export const readActiveOrganizationContextForUser = async (
  env: AppEnv,
  userId: string,
): Promise<ActiveOrganizationContext | null> => {
  const row = await readFirst<{
    organization_id: string;
    organization_name: string;
    subscription_plan: string;
    organization_role: string;
  }>(
    env,
    `SELECT
       o.id AS organization_id,
       o.display_name AS organization_name,
       o.subscription_plan AS subscription_plan,
       m.role AS organization_role
     FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ?
       AND m.status = 'ACTIVE'
     LIMIT 1`,
    userId,
  );

  if (!row) return null;

  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    subscriptionPlan: row.subscription_plan as SubscriptionPlan,
    organizationRole: row.organization_role as OrganizationRole,
  };
};

export const requireActiveOrganizationContext = async (
  env: AppEnv,
  user: DbUserRow,
  allowedRoles?: OrganizationRole[],
): Promise<ActiveOrganizationContext> => {
  const context = await readActiveOrganizationContextForUser(env, user.id);
  if (!context) {
    throw new HttpError(403, '組織情報が設定されていません。');
  }
  if (allowedRoles && !allowedRoles.includes(context.organizationRole)) {
    throw new HttpError(403, 'この組織操作を実行する権限がありません。');
  }
  return context;
};

export const syncUserOrganizationShadow = async (
  env: AppEnv,
  input: {
    userId: string;
    organizationId: string;
    organizationName: string;
    organizationRole: OrganizationRole;
    subscriptionPlan: SubscriptionPlan;
  },
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE users
       SET organization_id = ?,
           organization_name = ?,
           organization_role = ?,
           subscription_plan = ?,
           updated_at = ?
     WHERE id = ?
  `).bind(
    input.organizationId,
    input.organizationName,
    input.organizationRole,
    input.subscriptionPlan,
    Date.now(),
    input.userId,
  ).run();
};

export const clearUserOrganizationShadow = async (
  env: AppEnv,
  input: {
    userId: string;
    subscriptionPlan?: SubscriptionPlan;
    userRole?: UserRole;
  },
): Promise<void> => {
  const nextPlan = input.subscriptionPlan || SubscriptionPlan.TOC_FREE;
  const nextRole = input.userRole || UserRole.STUDENT;

  await env.DB.prepare(`
    UPDATE users
       SET role = ?,
           subscription_plan = ?,
           organization_id = NULL,
           organization_name = NULL,
           organization_role = NULL,
           updated_at = ?
     WHERE id = ?
  `).bind(
    nextRole,
    nextPlan,
    Date.now(),
    input.userId,
  ).run();
};

export const syncOrganizationShadowForActiveMembers = async (
  env: AppEnv,
  organizationId: string,
): Promise<void> => {
  const organization = await readOrganizationById(env, organizationId);
  if (!organization) {
    throw new HttpError(404, '組織が見つかりません。');
  }

  await env.DB.prepare(`
    UPDATE users
       SET organization_id = ?,
           organization_name = ?,
           subscription_plan = ?,
           updated_at = ?
     WHERE id IN (
       SELECT user_id
       FROM organization_memberships
       WHERE organization_id = ?
         AND status = 'ACTIVE'
     )
  `).bind(
    organization.id,
    organization.display_name,
    organization.subscription_plan,
    Date.now(),
    organization.id,
  ).run();
};

export const resolveOrCreateOrganization = async (
  env: AppEnv,
  input: {
    targetOrganizationId?: string;
    targetOrganizationName?: string;
    subscriptionPlan?: SubscriptionPlan;
  },
): Promise<DbOrganizationRow> => {
  const now = Date.now();
  let organization = input.targetOrganizationId
    ? await readOrganizationById(env, input.targetOrganizationId)
    : null;

  if (!organization && input.targetOrganizationName) {
    const nameKey = normalizeOrganizationNameKey(input.targetOrganizationName);
    if (!nameKey) {
      throw new HttpError(400, '組織名を入力してください。');
    }
    organization = await readOrganizationByNameKey(env, nameKey);
    if (!organization) {
      const organizationId = `org_${crypto.randomUUID().replace(/-/g, '')}`;
      await env.DB.prepare(`
        INSERT INTO organizations (
          id,
          display_name,
          name_key,
          subscription_plan,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).bind(
        organizationId,
        input.targetOrganizationName.trim(),
        nameKey,
        input.subscriptionPlan || SubscriptionPlan.TOB_FREE,
        now,
        now,
      ).run();
      organization = await readOrganizationById(env, organizationId);
    }
  }

  if (!organization) {
    throw new HttpError(404, '対象組織が見つかりません。');
  }

  if (
    input.subscriptionPlan
    && isBusinessSubscriptionPlan(input.subscriptionPlan)
    && organization.subscription_plan !== input.subscriptionPlan
  ) {
    await env.DB.prepare(`
      UPDATE organizations
         SET subscription_plan = ?,
             updated_at = ?
       WHERE id = ?
    `).bind(
      input.subscriptionPlan,
      now,
      organization.id,
    ).run();
    organization = await readOrganizationById(env, organization.id);
  }

  if (!organization) {
    throw new HttpError(500, '組織更新後の取得に失敗しました。');
  }

  return organization;
};

export const upsertActiveOrganizationMembership = async (
  env: AppEnv,
  input: {
    userId: string;
    organizationId: string;
    organizationRole: OrganizationRole;
    subscriptionPlan?: SubscriptionPlan;
  },
): Promise<ActiveOrganizationContext> => {
  const now = Date.now();
  const organization = await resolveOrCreateOrganization(env, {
    targetOrganizationId: input.organizationId,
    subscriptionPlan: input.subscriptionPlan,
  });

  await env.DB.prepare(`
    UPDATE organization_memberships
       SET status = 'INACTIVE',
           updated_at = ?
     WHERE user_id = ?
       AND organization_id != ?
       AND status = 'ACTIVE'
  `).bind(
    now,
    input.userId,
    input.organizationId,
  ).run();

  await env.DB.prepare(`
    INSERT INTO organization_memberships (
      user_id,
      organization_id,
      role,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 'ACTIVE', ?, ?)
    ON CONFLICT(user_id, organization_id) DO UPDATE SET
      role = excluded.role,
      status = 'ACTIVE',
      updated_at = excluded.updated_at
  `).bind(
    input.userId,
    organization.id,
    input.organizationRole,
    now,
    now,
  ).run();

  await syncUserOrganizationShadow(env, {
    userId: input.userId,
    organizationId: organization.id,
    organizationName: organization.display_name,
    organizationRole: input.organizationRole,
    subscriptionPlan: organization.subscription_plan as SubscriptionPlan,
  });

  return {
    organizationId: organization.id,
    organizationName: organization.display_name,
    subscriptionPlan: organization.subscription_plan as SubscriptionPlan,
    organizationRole: input.organizationRole,
  };
};

export const clearActiveOrganizationMembership = async (
  env: AppEnv,
  input: {
    userId: string;
    subscriptionPlan?: SubscriptionPlan;
    userRole?: UserRole;
  },
): Promise<void> => {
  await env.DB.prepare(`
    UPDATE organization_memberships
       SET status = 'INACTIVE',
           updated_at = ?
     WHERE user_id = ?
       AND status = 'ACTIVE'
  `).bind(
    Date.now(),
    input.userId,
  ).run();

  await clearUserOrganizationShadow(env, input);
};

export const appendOrganizationAuditLog = async (
  env: AppEnv,
  input: {
    organizationId: string;
    actorUserId: string;
    actionType: string;
    targetType: string;
    targetId?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO organization_audit_logs (
      organization_id,
      actor_user_id,
      action_type,
      target_type,
      target_id,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.organizationId,
    input.actorUserId,
    input.actionType,
    input.targetType,
    input.targetId || null,
    input.payload ? JSON.stringify(input.payload) : null,
    Date.now(),
  ).run();
};

export const maybeSyncBusinessMembershipFromUser = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<void> => {
  const organizationRole = deriveOrganizationRole(user);
  if (
    !user.organization_id
    || !organizationRole
    || !isBusinessSubscriptionPlan(user.subscription_plan)
  ) {
    return;
  }

  await upsertActiveOrganizationMembership(env, {
    userId: user.id,
    organizationId: user.organization_id,
    organizationRole,
    subscriptionPlan: user.subscription_plan as SubscriptionPlan,
  });
};
