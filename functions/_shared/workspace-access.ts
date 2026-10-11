import {
  isStaffWorkspace,
  WORKSPACE_HEADER,
  WORKSPACE_IDENTITY_HEADER,
  WORKSPACE_ORGANIZATION_HEADER,
  WORKSPACE_VERSION_HEADER,
  type StaffWorkspace,
} from '../../contracts/workspaceAccess';
import { OrganizationRole, UserRole } from '../../types';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

export interface WorkspaceGrantRow {
  user_id: string;
  staff_organization_id: string;
  teacher_access: number;
  school_admin_access: number;
  service_admin_access: number;
  status: string;
  grant_version: number;
  organization_name: string;
  organization_status: string;
  subscription_plan: string;
}

const denied = (): HttpError => new HttpError(403, 'この業務画面を利用する権限を確認できません。案内元にアカウントの利用権限をご確認ください。');

export const readWorkspaceGrant = async (env: AppEnv, userId: string): Promise<WorkspaceGrantRow | null> => {
  const row = await env.DB.prepare(`
    SELECT g.*, o.display_name AS organization_name, o.status AS organization_status,
           o.subscription_plan AS subscription_plan
      FROM workspace_access_grants g JOIN organizations o ON o.id = g.staff_organization_id
     WHERE g.user_id = ?
  `).bind(userId).first<WorkspaceGrantRow>();
  // Checking the identity and numeric version also keeps an incomplete row
  // from supplying authority through a stale or malformed read model.
  return row?.user_id === userId && Number.isSafeInteger(row.grant_version) && row.grant_version > 0 ? row : null;
};

const availableWorkspaces = (grant: WorkspaceGrantRow): StaffWorkspace[] => {
  if (grant.status !== 'ACTIVE') return [];
  const workspaces: StaffWorkspace[] = [];
  if (grant.organization_status === 'ACTIVE') {
    if (grant.teacher_access === 1) workspaces.push('instructor');
    if (grant.school_admin_access === 1) workspaces.push('group-admin');
  }
  if (grant.service_admin_access === 1) workspaces.push('service-admin');
  return workspaces;
};

export interface WorkspaceSelection {
  grantVersion?: number;
  organizationId?: string;
}

export const projectStaffWorkspace = async (
  env: AppEnv,
  identity: DbUserRow,
  workspace: StaffWorkspace,
  selection: WorkspaceSelection = {},
): Promise<DbUserRow> => {
  const grant = await readWorkspaceGrant(env, identity.id);
  if (grant) {
    const allowed = availableWorkspaces(grant);
    if (!allowed.includes(workspace)
      || (selection.grantVersion !== undefined && selection.grantVersion !== grant.grant_version)) throw denied();
    const organizationId = workspace === 'service-admin' ? undefined : grant.staff_organization_id;
    if (selection.organizationId !== undefined && selection.organizationId !== organizationId) throw denied();
    return {
      ...identity,
      role: workspace === 'service-admin' ? UserRole.ADMIN : UserRole.INSTRUCTOR,
      organization_id: organizationId || null,
      organization_name: organizationId ? grant.organization_name : null,
      organization_role: workspace === 'instructor' ? OrganizationRole.INSTRUCTOR
        : workspace === 'group-admin' ? OrganizationRole.GROUP_ADMIN : null,
      subscription_plan: organizationId ? grant.subscription_plan : identity.subscription_plan,
      server_workspace: { workspace, organizationId, grantVersion: grant.grant_version, availableWorkspaces: allowed, source: 'EXPLICIT_GRANT' },
    };
  }

  if (selection.grantVersion !== undefined && selection.grantVersion !== 0) throw denied();
  if (workspace === 'service-admin') {
    if (identity.role !== UserRole.ADMIN || selection.organizationId !== undefined) throw denied();
    return { ...identity, server_workspace: { workspace, grantVersion: 0, availableWorkspaces: [workspace], source: 'CANONICAL' } };
  }
  if (identity.role !== UserRole.INSTRUCTOR) throw denied();
  const context = await env.DB.prepare(`
    SELECT o.id AS organization_id, o.display_name AS organization_name,
           o.subscription_plan AS subscription_plan, m.role AS organization_role
      FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ? AND m.status = 'ACTIVE' AND o.status = 'ACTIVE'
     LIMIT 1
  `).bind(identity.id).first<Pick<DbUserRow, 'organization_id' | 'organization_name' | 'subscription_plan' | 'organization_role'>>();
  const expectedRole = workspace === 'instructor' ? OrganizationRole.INSTRUCTOR : OrganizationRole.GROUP_ADMIN;
  if (!context?.organization_id || context.organization_role !== expectedRole
    || (selection.organizationId !== undefined && selection.organizationId !== context.organization_id)) throw denied();
  return { ...identity, ...context, server_workspace: { workspace, organizationId: context.organization_id,
    grantVersion: 0, availableWorkspaces: [workspace], source: 'CANONICAL' } };
};

export const projectRequestWorkspace = async (env: AppEnv, identity: DbUserRow, request: Request): Promise<DbUserRow> => {
  const expectedIdentity = request.headers.get(WORKSPACE_IDENTITY_HEADER);
  if (expectedIdentity && expectedIdentity !== identity.id) throw denied();
  const workspace = request.headers.get(WORKSPACE_HEADER);
  if (!workspace || workspace === 'personal') return identity;
  if (!isStaffWorkspace(workspace)) throw new HttpError(400, '業務画面の指定が正しくありません。');
  const versionText = request.headers.get(WORKSPACE_VERSION_HEADER);
  // Only the session read may discover a version. Data operations must retain
  // the permission version captured by the screen that initiated the request.
  const discoversVersion = request.method === 'GET' && new URL(request.url).pathname === '/api/session';
  if (versionText === null && !discoversVersion) throw new HttpError(400, '業務画面の権限情報を再確認してください。');
  if (versionText !== null && !/^(0|[1-9]\d*)$/.test(versionText)) throw new HttpError(400, '業務画面の権限情報が正しくありません。');
  const grantVersion = versionText === null ? undefined : Number(versionText);
  if (grantVersion !== undefined && !Number.isSafeInteger(grantVersion)) throw new HttpError(400, '業務画面の権限情報が正しくありません。');
  if (!expectedIdentity && !discoversVersion) throw denied();
  const organizationId = request.headers.get(WORKSPACE_ORGANIZATION_HEADER) || undefined;
  if (workspace !== 'service-admin' && !organizationId && !discoversVersion) throw new HttpError(400, '対象教室を再確認してください。');
  return projectStaffWorkspace(env, identity, workspace, { grantVersion,
    organizationId });
};

export const revalidateWorkspaceContext = async (env: AppEnv, user: DbUserRow): Promise<DbUserRow> => {
  const context = user.server_workspace;
  if (!context) return user;
  const identity = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<DbUserRow>();
  if (!identity) throw denied();
  return projectStaffWorkspace(env, identity, context.workspace, context);
};

export const readGrantEligibleInstructor = async (env: AppEnv, userId: string, organizationId: string): Promise<DbUserRow | null> => {
  const grant = await readWorkspaceGrant(env, userId);
  if (!grant || grant.staff_organization_id !== organizationId || !availableWorkspaces(grant).includes('instructor')) return null;
  const identity = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUserRow>();
  return identity ? projectStaffWorkspace(env, identity, 'instructor', { grantVersion: grant.grant_version, organizationId }) : null;
};
