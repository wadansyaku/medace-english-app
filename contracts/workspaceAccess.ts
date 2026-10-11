export type StaffWorkspace = 'instructor' | 'group-admin' | 'service-admin';
export type WorkspaceId = 'personal' | StaffWorkspace;

export interface WorkspaceAccess {
  workspace: StaffWorkspace;
  organizationId?: string;
  grantVersion: number;
  availableWorkspaces: StaffWorkspace[];
}

export const WORKSPACE_HEADER = 'X-MedAce-Workspace';
export const WORKSPACE_VERSION_HEADER = 'X-MedAce-Workspace-Version';
export const WORKSPACE_ORGANIZATION_HEADER = 'X-MedAce-Workspace-Org';
export const WORKSPACE_IDENTITY_HEADER = 'X-MedAce-Workspace-Identity';

export const isStaffWorkspace = (value: unknown): value is StaffWorkspace => (
  value === 'instructor' || value === 'group-admin' || value === 'service-admin'
);

export const getWorkspaceContextKey = (uid: string, access?: WorkspaceAccess): string => (
  JSON.stringify([uid, access?.workspace || 'personal', access?.organizationId || null, access?.grantVersion || 0])
);
