import {
  getWorkspaceContextKey,
  isStaffWorkspace,
  WORKSPACE_HEADER,
  WORKSPACE_IDENTITY_HEADER,
  WORKSPACE_ORGANIZATION_HEADER,
  WORKSPACE_VERSION_HEADER,
  type StaffWorkspace,
  type WorkspaceAccess,
} from '../contracts/workspaceAccess';
import type { UserProfile } from '../types';

const STORAGE_KEY = 'medace:staff-workspace';
interface TabWorkspace { uid?: string; access?: WorkspaceAccess; requested?: StaffWorkspace }
let current: TabWorkspace = {};
let generation = 0;
const requests = new Set<AbortController>();

const save = () => {
  try {
    if (current.access && current.uid) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ uid: current.uid, access: current.access }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* A restricted tab can still use the in-memory selection. */ }
};

export const invalidateWorkspaceRequests = () => {
  generation += 1;
  for (const controller of requests) controller.abort();
  requests.clear();
};

export const prepareWorkspaceRestore = (pathname: string, search = '') => {
  const requested = ['/teacher', '/public/roles/instructor'].includes(pathname) ? 'instructor'
    : ['/school-admin', '/public/roles/group-admin'].includes(pathname) ? 'group-admin'
    : ['/service-admin', '/admin-access', '/public/roles/service-admin'].includes(pathname) ? 'service-admin' : undefined;
  let saved: TabWorkspace = {};
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (typeof value?.uid === 'string' && isStaffWorkspace(value.access?.workspace)
      && Number.isSafeInteger(value.access.grantVersion) && value.access.grantVersion >= 0) saved = value;
  } catch { /* Ignore invalid local hints; they carry no authority. */ }
  const sourceIds = new URLSearchParams(search).getAll('supportSource');
  // Evidence links preserve a previously verified selection in this tab. The
  // URL never supplies a role or grant; the session endpoint revalidates the
  // saved identity, version and organization against current server authority.
  const readsSupportEvidence = pathname.replace(/\/+$/, '') === '/public'
    && sourceIds.length === 1 && /^[a-z0-9-]{1,128}$/.test(sourceIds[0]);
  const restoresStaff = requested || pathname === '/instructor' || pathname === '/admin' || readsSupportEvidence;
  current = restoresStaff ? { ...saved, requested: requested || saved.access?.workspace } : {};
  if (requested && current.access?.workspace !== requested) current.access = undefined;
};

export const selectWorkspaceForSession = (workspace: StaffWorkspace | 'personal', uid?: string) => {
  invalidateWorkspaceRequests();
  current = workspace === 'personal' ? {} : { uid: uid || current.uid, requested: workspace };
  save();
};

export const acceptWorkspaceProfile = (user: UserProfile | null) => {
  const next = user?.workspaceAccess ? { uid: user.uid, access: user.workspaceAccess, requested: user.workspaceAccess.workspace } : user ? { uid: user.uid } : {};
  const previousKey = getWorkspaceContextKey(current.uid || '', current.access);
  const nextKey = getWorkspaceContextKey(user?.uid || '', user?.workspaceAccess);
  if (previousKey !== nextKey) invalidateWorkspaceRequests();
  current = next;
  save();
};

export interface CapturedWorkspaceRequest {
  generation: number;
  headers: Record<string, string>;
  controller: AbortController;
}

export const captureWorkspaceRequest = (): CapturedWorkspaceRequest => {
  const headers: Record<string, string> = {};
  const workspace = current.access?.workspace || current.requested;
  if (current.uid) headers[WORKSPACE_IDENTITY_HEADER] = current.uid;
  if (workspace) {
    headers[WORKSPACE_HEADER] = workspace;
    if (current.access) {
      headers[WORKSPACE_VERSION_HEADER] = String(current.access.grantVersion);
      if (current.access.organizationId) headers[WORKSPACE_ORGANIZATION_HEADER] = current.access.organizationId;
    }
  }
  const controller = new AbortController();
  requests.add(controller);
  return { generation, headers, controller };
};

export const isWorkspaceRequestCurrent = (request: CapturedWorkspaceRequest): boolean => request.generation === generation && !request.controller.signal.aborted;
export const releaseWorkspaceRequest = (request: CapturedWorkspaceRequest) => requests.delete(request.controller);
export const isCurrentWorkspaceProfile = (user: UserProfile): boolean => current.uid
  ? getWorkspaceContextKey(current.uid, current.access) === getWorkspaceContextKey(user.uid, user.workspaceAccess)
  : !user.workspaceAccess;

export const clearWorkspaceContext = () => {
  invalidateWorkspaceRequests();
  current = {};
  save();
};
