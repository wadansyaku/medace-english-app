import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import type { AppEnv, DbUserRow, R2Bucket } from '../functions/_shared/types';
import { createSession } from '../functions/_shared/auth';
import { handleCreateWritingUploadUrl, handleWritingAssetUpload } from '../functions/_shared/writing-actions/mutations';
import {
  projectStaffWorkspace,
  projectRequestWorkspace,
  readGrantEligibleInstructor,
  readWorkspaceGrant,
  revalidateWorkspaceContext,
} from '../functions/_shared/workspace-access';
import { requireActiveOrganizationContext } from '../functions/_shared/organization-memberships';
import { readVisibleStudentIds } from '../functions/_shared/student-visibility';
import { handleGetAllStudentsProgress } from '../functions/_shared/organization-student-read-model';
import { OrganizationRole, SubscriptionPlan, UserRole } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach((fixture) => fixture.sqlite.close()));

// These identities live only in an in-memory SQLite replay of the real schema.
// The owner's canonical student organization deliberately differs from the grant.
const setup = () => {
  const fixture = createSqliteD1();
  fixtures.push(fixture);
  const migrationDir = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(name, migrationDir), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO organizations (id, display_name, name_key, subscription_plan, status, created_at, updated_at)
    VALUES ('staff-org-a', 'Synthetic staff classroom A', 'synthetic-staff-a', 'TOB_PAID', 'ACTIVE', 1, 1),
           ('student-org-b', 'Synthetic student classroom B', 'synthetic-student-b', 'TOB_FREE', 'ACTIVE', 1, 1);
    INSERT INTO users (id, email, password_hash, display_name, role, subscription_plan, organization_id,
      organization_name, organization_role, created_at, updated_at)
    VALUES ('grant-owner', 'owner@workspace.example.invalid', 'preserved-owner-hash', 'Synthetic owner',
      'STUDENT', 'TOB_FREE', 'student-org-b', 'Synthetic student classroom B', 'STUDENT', 1, 1),
      ('other-student', 'other@workspace.example.invalid', 'preserved-other-hash', 'Synthetic owner',
      'STUDENT', 'TOB_FREE', 'student-org-b', 'Synthetic student classroom B', 'STUDENT', 1, 1),
      ('canonical-teacher', 'teacher@workspace.example.invalid', 'preserved-teacher-hash', 'Synthetic teacher',
      'INSTRUCTOR', 'TOB_PAID', 'staff-org-a', 'Synthetic staff classroom A', 'INSTRUCTOR', 1, 1),
      ('canonical-school-admin', 'school@workspace.example.invalid', 'preserved-school-hash', 'Synthetic school administrator',
      'INSTRUCTOR', 'TOB_PAID', 'staff-org-a', 'Synthetic staff classroom A', 'GROUP_ADMIN', 1, 1),
      ('canonical-service-admin', 'service@workspace.example.invalid', 'preserved-service-hash', 'Synthetic service administrator',
      'ADMIN', 'TOC_FREE', NULL, NULL, NULL, 1, 1),
      ('legacy-no-history', 'legacy@workspace.example.invalid', 'preserved-legacy-hash', 'Synthetic legacy staff',
      'INSTRUCTOR', 'TOB_PAID', 'staff-org-a', 'Synthetic staff classroom A', 'GROUP_ADMIN', 1, 1),
      ('student-a-assigned', 'assigned@workspace.example.invalid', NULL, 'Synthetic assigned student A',
      'STUDENT', 'TOB_PAID', 'staff-org-a', 'Synthetic staff classroom A', 'STUDENT', 1, 1),
      ('student-a-cohort', 'cohort@workspace.example.invalid', NULL, 'Synthetic cohort student A',
      'STUDENT', 'TOB_PAID', 'staff-org-a', 'Synthetic staff classroom A', 'STUDENT', 1, 1),
      ('student-a-hidden', 'hidden@workspace.example.invalid', NULL, 'Synthetic hidden student A',
      'STUDENT', 'TOB_PAID', 'staff-org-a', 'Synthetic staff classroom A', 'STUDENT', 1, 1);
    INSERT INTO organization_memberships (user_id, organization_id, role, status, created_at, updated_at)
    VALUES ('grant-owner', 'student-org-b', 'STUDENT', 'ACTIVE', 1, 1),
      ('other-student', 'student-org-b', 'STUDENT', 'ACTIVE', 1, 1),
      ('canonical-teacher', 'staff-org-a', 'INSTRUCTOR', 'ACTIVE', 1, 1),
      ('canonical-school-admin', 'staff-org-a', 'GROUP_ADMIN', 'ACTIVE', 1, 1),
      ('student-a-assigned', 'staff-org-a', 'STUDENT', 'ACTIVE', 1, 1),
      ('student-a-cohort', 'staff-org-a', 'STUDENT', 'ACTIVE', 1, 1),
      ('student-a-hidden', 'staff-org-a', 'STUDENT', 'ACTIVE', 1, 1);
    INSERT INTO workspace_access_grants (user_id, staff_organization_id, teacher_access, school_admin_access,
      service_admin_access, status, grant_version, created_at, updated_at)
    VALUES ('grant-owner', 'staff-org-a', 1, 1, 1, 'ACTIVE', 7, 1, 1);
  `);
  const env: AppEnv = { DB: fixture.DB };
  const identity = (uid = 'grant-owner') => fixture.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(uid) as unknown as DbUserRow;
  const authority = () => ({
    users: fixture.sqlite.prepare(`SELECT id, email, password_hash, role, subscription_plan, organization_id,
      organization_name, organization_role FROM users ORDER BY id`).all(),
    memberships: fixture.sqlite.prepare('SELECT * FROM organization_memberships ORDER BY user_id, organization_id').all(),
    organizations: fixture.sqlite.prepare('SELECT * FROM organizations ORDER BY id').all(),
    grants: fixture.sqlite.prepare('SELECT * FROM workspace_access_grants ORDER BY user_id').all(),
  });
  return { ...fixture, env, identity, authority };
};

describe('explicit UID workspace grants on the production SQL schema', () => {
  it.each([
    ['instructor', UserRole.INSTRUCTOR, OrganizationRole.INSTRUCTOR, 'staff-org-a'],
    ['group-admin', UserRole.INSTRUCTOR, OrganizationRole.GROUP_ADMIN, 'staff-org-a'],
    ['service-admin', UserRole.ADMIN, null, null],
  ] as const)('projects %s without changing the student identity or canonical authority', async (workspace, role, organizationRole, organizationId) => {
    const f = setup();
    const before = f.authority();
    const identity = Object.freeze(f.identity());
    const actor = await projectStaffWorkspace(f.env, identity, workspace, { grantVersion: 7, ...(organizationId ? { organizationId } : {}) });
    expect(actor.id).toBe(identity.id);
    expect(actor.role).toBe(role);
    expect(actor.organization_role ?? null).toBe(organizationRole);
    expect(actor.organization_id ?? null).toBe(organizationId);
    expect(actor.password_hash).toBe('preserved-owner-hash');
    if (organizationId) expect(actor.subscription_plan).toBe(SubscriptionPlan.TOB_PAID);
    expect(identity.role).toBe(UserRole.STUDENT);
    expect(identity.organization_id).toBe('student-org-b');
    expect(f.authority()).toEqual(before);
  });

  it('resolves teacher and school-admin organization rereads from the verified actor context', async () => {
    const f = setup();
    const before = f.authority();
    const teacher = await projectStaffWorkspace(f.env, f.identity(), 'instructor', { grantVersion: 7, organizationId: 'staff-org-a' });
    const administrator = await projectStaffWorkspace(f.env, f.identity(), 'group-admin', { grantVersion: 7, organizationId: 'staff-org-a' });
    await expect(requireActiveOrganizationContext(f.env, teacher)).resolves.toMatchObject({
      organizationId: 'staff-org-a', organizationRole: OrganizationRole.INSTRUCTOR,
    });
    await expect(requireActiveOrganizationContext(f.env, administrator)).resolves.toMatchObject({
      organizationId: 'staff-org-a', organizationRole: OrganizationRole.GROUP_ADMIN,
    });
    await expect(requireActiveOrganizationContext(f.env, teacher, [OrganizationRole.GROUP_ADMIN])).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it('does not grant another UID with the same display name or student membership', async () => {
    const f = setup();
    const before = f.authority();
    await expect(readWorkspaceGrant(f.env, 'other-student')).resolves.toBeNull();
    for (const workspace of ['instructor', 'group-admin', 'service-admin'] as const) {
      await expect(projectStaffWorkspace(f.env, f.identity('other-student'), workspace, { grantVersion: 7 })).rejects.toMatchObject({ status: 403 });
    }
    expect(f.authority()).toEqual(before);
  });

  it.each(['instructor', 'group-admin', 'service-admin'] as const)('rejects forged organization and stale version in %s', async (workspace) => {
    const f = setup();
    const before = f.authority();
    await expect(projectStaffWorkspace(f.env, f.identity(), workspace, { grantVersion: 6 })).rejects.toMatchObject({ status: 403 });
    await expect(projectStaffWorkspace(f.env, f.identity(), workspace, { grantVersion: 7, organizationId: 'student-org-b' })).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it.each([
    ['instructor', 'teacher_access'], ['group-admin', 'school_admin_access'], ['service-admin', 'service_admin_access'],
  ] as const)('rejects disabled %s even when the remaining workspace grants are active', async (workspace, flag) => {
    const f = setup();
    f.sqlite.exec(`UPDATE workspace_access_grants SET ${flag} = 0 WHERE user_id = 'grant-owner'`);
    const before = f.authority();
    await expect(projectStaffWorkspace(f.env, f.identity(), workspace, { grantVersion: 7 })).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it.each(['REVOKED', 'missing'] as const)('fails closed for %s grant without promoting the base student', async (state) => {
    const f = setup();
    if (state === 'missing') f.sqlite.exec("DELETE FROM workspace_access_grants WHERE user_id = 'grant-owner'");
    else f.sqlite.exec("UPDATE workspace_access_grants SET status = 'REVOKED' WHERE user_id = 'grant-owner'");
    const before = f.authority();
    for (const workspace of ['instructor', 'group-admin', 'service-admin'] as const) {
      await expect(projectStaffWorkspace(f.env, f.identity(), workspace, { grantVersion: 7 })).rejects.toMatchObject({ status: 403 });
    }
    expect(f.authority()).toEqual(before);
  });

  it.each(['instructor', 'group-admin'] as const)('rejects inactive staff organization in %s without falling back to the student organization', async (workspace) => {
    const f = setup();
    f.sqlite.exec("UPDATE organizations SET status = 'INACTIVE' WHERE id = 'staff-org-a'");
    const before = f.authority();
    await expect(projectStaffWorkspace(f.env, f.identity(), workspace, { grantVersion: 7 })).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it('retains the separately granted global service role when only the classroom is inactive', async () => {
    const f = setup();
    f.sqlite.exec("UPDATE organizations SET status = 'INACTIVE' WHERE id = 'staff-org-a'");
    const before = f.authority();
    await expect(projectStaffWorkspace(f.env, f.identity(), 'service-admin', { grantVersion: 7 })).resolves.toMatchObject({
      role: UserRole.ADMIN, organization_id: null, server_workspace: { availableWorkspaces: ['service-admin'] },
    });
    expect(f.authority()).toEqual(before);
  });

  it.each(['version', 'revoke', 'organization'] as const)('invalidates an already projected staff actor after %s changes', async (change) => {
    const f = setup();
    const actor = await projectStaffWorkspace(f.env, f.identity(), 'instructor', { grantVersion: 7 });
    if (change === 'version') f.sqlite.exec("UPDATE workspace_access_grants SET grant_version = 8 WHERE user_id = 'grant-owner'");
    if (change === 'revoke') f.sqlite.exec("UPDATE workspace_access_grants SET status = 'REVOKED' WHERE user_id = 'grant-owner'");
    if (change === 'organization') f.sqlite.exec("UPDATE organizations SET status = 'INACTIVE' WHERE id = 'staff-org-a'");
    const before = f.authority();
    await expect(revalidateWorkspaceContext(f.env, actor)).rejects.toMatchObject({ status: 403 });
    await expect(requireActiveOrganizationContext(f.env, actor)).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it.each([
    ['canonical-teacher', 'instructor', OrganizationRole.INSTRUCTOR],
    ['canonical-school-admin', 'group-admin', OrganizationRole.GROUP_ADMIN],
  ] as const)('keeps the matching canonical %s path at version zero', async (uid, workspace, organizationRole) => {
    const f = setup();
    const before = f.authority();
    const actor = await projectStaffWorkspace(f.env, f.identity(uid), workspace, { grantVersion: 0, organizationId: 'staff-org-a' });
    expect(actor.role).toBe(UserRole.INSTRUCTOR);
    expect(actor.organization_role).toBe(organizationRole);
    await expect(requireActiveOrganizationContext(f.env, actor)).resolves.toMatchObject({ organizationId: 'staff-org-a', organizationRole });
    expect(f.authority()).toEqual(before);
  });

  it('does not manufacture canonical membership for zero-history legacy staff', async () => {
    const f = setup();
    const before = f.authority();
    await expect(projectStaffWorkspace(f.env, f.identity('legacy-no-history'), 'group-admin', { grantVersion: 0 })).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it('does not use canonical school-admin role as the teacher scope', async () => {
    const f = setup();
    const before = f.authority();
    await expect(projectStaffWorkspace(f.env, f.identity('canonical-school-admin'), 'instructor', { grantVersion: 0 })).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it('makes the granted UID assignable only in the explicitly granted teacher organization', async () => {
    const f = setup();
    const before = f.authority();
    await expect(readGrantEligibleInstructor(f.env, 'grant-owner', 'staff-org-a')).resolves.not.toBeNull();
    await expect(readGrantEligibleInstructor(f.env, 'grant-owner', 'student-org-b')).resolves.toBeNull();
    await expect(readGrantEligibleInstructor(f.env, 'other-student', 'staff-org-a')).resolves.toBeNull();
    f.sqlite.exec("UPDATE workspace_access_grants SET teacher_access = 0 WHERE user_id = 'grant-owner'");
    await expect(readGrantEligibleInstructor(f.env, 'grant-owner', 'staff-org-a')).resolves.toBeNull();
    const after = f.authority();
    expect(after.users).toEqual(before.users);
    expect(after.memberships).toEqual(before.memberships);
    expect(after.organizations).toEqual(before.organizations);
  });

  it('keeps no-assignment teacher scope empty and includes only assigned or same-classroom cohort students', async () => {
    const f = setup();
    const teacher = await projectStaffWorkspace(f.env, f.identity(), 'instructor', { grantVersion: 7 });
    await expect(readVisibleStudentIds(f.env, teacher)).resolves.toEqual(new Set());
    await expect(handleGetAllStudentsProgress(f.env, teacher)).resolves.toEqual([]);
    f.sqlite.exec(`
      INSERT INTO student_instructor_assignments (student_user_id, instructor_user_id, created_at, updated_at)
      VALUES ('student-a-assigned', 'grant-owner', 1, 1), ('other-student', 'grant-owner', 1, 1);
      INSERT INTO organization_cohorts (id, organization_id, name, created_at, updated_at)
      VALUES ('cohort-a', 'staff-org-a', 'Synthetic cohort A', 1, 1),
        ('cohort-b', 'student-org-b', 'Synthetic cohort B', 1, 1);
      INSERT INTO organization_cohort_students (cohort_id, student_user_id, created_at, updated_at)
      VALUES ('cohort-a', 'student-a-cohort', 1, 1), ('cohort-b', 'other-student', 1, 1);
      INSERT INTO organization_cohort_instructors (cohort_id, instructor_user_id, created_at, updated_at)
      VALUES ('cohort-a', 'grant-owner', 1, 1), ('cohort-b', 'grant-owner', 1, 1);
    `);
    await expect(readVisibleStudentIds(f.env, teacher)).resolves.toEqual(new Set(['student-a-assigned', 'student-a-cohort']));
    const summary = await handleGetAllStudentsProgress(f.env, teacher);
    expect(summary.map((student) => student.uid).sort()).toEqual(['student-a-assigned', 'student-a-cohort']);
  });

  it('separates school-admin classroom reads from service-admin global reads for the same UID', async () => {
    const f = setup();
    const before = f.authority();
    const school = await projectStaffWorkspace(f.env, f.identity(), 'group-admin', { grantVersion: 7 });
    const service = await projectStaffWorkspace(f.env, f.identity(), 'service-admin', { grantVersion: 7 });
    const schoolStudents = await handleGetAllStudentsProgress(f.env, school);
    const serviceStudents = await handleGetAllStudentsProgress(f.env, service);
    expect(schoolStudents.map((student) => student.uid).sort()).toEqual(['student-a-assigned', 'student-a-cohort', 'student-a-hidden']);
    expect(serviceStudents.map((student) => student.uid).sort()).toEqual(['grant-owner', 'other-student', 'student-a-assigned', 'student-a-cohort', 'student-a-hidden']);
    expect(f.authority()).toEqual(before);
  });

  it.each([
    { 'X-MedAce-Workspace': 'admin' },
    { 'X-MedAce-Workspace': 'instructor', 'X-MedAce-Workspace-Version': '-1' },
    { 'X-MedAce-Workspace': 'instructor', 'X-MedAce-Workspace-Version': '7.0' },
    { 'X-MedAce-Workspace': 'instructor', 'X-MedAce-Workspace-Version': '9007199254740992' },
  ])('rejects malformed request selection %j before projecting authority', async (headers) => {
    const f = setup();
    const before = f.authority();
    await expect(projectRequestWorkspace(f.env, f.identity(), new Request('https://local.example.invalid/api/storage', {
      headers: { ...headers, 'X-MedAce-Workspace-Identity': 'grant-owner' },
    }))).rejects.toMatchObject({ status: 400 });
    expect(f.authority()).toEqual(before);
  });

  it('preserves the original personal identity when no staff request context is supplied', async () => {
    const f = setup();
    const before = f.authority();
    for (const headers of [{}, { 'X-MedAce-Workspace': 'personal' }]) {
      const identity = f.identity();
      await expect(projectRequestWorkspace(f.env, identity, new Request('https://local.example.invalid/api/session', { headers }))).resolves.toEqual(identity);
    }
    expect(f.authority()).toEqual(before);
  });

  it('allows session version discovery while requiring a captured UID and version on staff data operations', async () => {
    const f = setup();
    const before = f.authority();
    const selected = { 'X-MedAce-Workspace': 'instructor', 'X-MedAce-Workspace-Org': 'staff-org-a' };
    await expect(projectRequestWorkspace(f.env, f.identity(), new Request('https://local.example.invalid/api/session', { headers: selected })))
      .resolves.toMatchObject({ role: UserRole.INSTRUCTOR, server_workspace: { grantVersion: 7 } });
    await expect(projectRequestWorkspace(f.env, f.identity(), new Request('https://local.example.invalid/api/storage', { method: 'POST', headers: selected })))
      .rejects.toMatchObject({ status: 400 });
    await expect(projectRequestWorkspace(f.env, f.identity(), new Request('https://local.example.invalid/api/storage', {
      method: 'POST', headers: { ...selected, 'X-MedAce-Workspace-Version': '7' },
    }))).rejects.toMatchObject({ status: 403 });
    await expect(projectRequestWorkspace(f.env, f.identity(), new Request('https://local.example.invalid/api/storage', {
      method: 'POST', headers: { ...selected, 'X-MedAce-Workspace-Version': '7', 'X-MedAce-Workspace-Identity': 'other-student' },
    }))).rejects.toMatchObject({ status: 403 });
    expect(f.authority()).toEqual(before);
  });

  it.each(['instructor', 'group-admin'] as const)('requires the captured classroom on %s data operations', async (workspace) => {
    const f = setup();
    const before = f.authority();
    await expect(projectRequestWorkspace(f.env, f.identity(), new Request('https://local.example.invalid/api/storage', {
      method: 'POST', headers: { 'X-MedAce-Workspace': workspace, 'X-MedAce-Workspace-Version': '7',
        'X-MedAce-Workspace-Identity': 'grant-owner' },
    }))).rejects.toMatchObject({ status: 400 });
    expect(f.authority()).toEqual(before);
  });
});

const setupUpload = async () => {
  const f = setup();
  f.sqlite.exec(`
    INSERT INTO student_instructor_assignments (student_user_id, instructor_user_id, created_at, updated_at)
    VALUES ('student-a-assigned', 'grant-owner', 1, 1);
    INSERT INTO writing_assignments (id, organization_id, organization_name, instructor_user_id, student_user_id,
      exam_category, template_type, prompt_title, prompt_text, guidance, word_count_min, word_count_max,
      submission_code, prompt_snapshot, status, created_at, issued_at, updated_at)
    VALUES ('workspace-upload-assignment', 'staff-org-a', 'Synthetic staff classroom A', 'grant-owner',
      'student-a-assigned', 'EIKEN', 'OPINION', 'Synthetic static prompt', 'Local-only answer.', '', 10, 100,
      'workspace-upload-code', '{}', 'ISSUED', 1, 1, 1);
  `);
  const objects = new Map<string, ArrayBuffer>();
  const uploads: string[] = [];
  const deleted: string[] = [];
  const state: { duringPut?: () => void } = {};
  const bucket: R2Bucket = {
    async get(key) {
      const value = objects.get(key);
      return value ? { arrayBuffer: async () => value, body: null, etag: 'synthetic-etag' } : null;
    },
    async put(key, value) {
      uploads.push(key);
      objects.set(key, value as ArrayBuffer);
      state.duringPut?.();
      return { arrayBuffer: async () => value as ArrayBuffer, body: null, etag: 'synthetic-etag' };
    },
    async delete(key) { deleted.push(key); objects.delete(key); },
  };
  f.env.WRITING_ASSETS = bucket;
  const cookie = (await createSession(f.env, new Request('https://local.example.invalid/api/auth'), 'grant-owner')).split(';')[0];
  const otherCookie = (await createSession(f.env, new Request('https://local.example.invalid/api/auth'), 'other-student')).split(';')[0];
  const actor = await projectStaffWorkspace(f.env, f.identity(), 'instructor', { grantVersion: 7 });
  const body = new TextEncoder().encode('Synthetic immutable original.');
  const mint = (user = actor) => handleCreateWritingUploadUrl(f.env, user, {
    assignmentId: 'workspace-upload-assignment', fileName: 'synthetic-original.png', mimeType: 'image/png',
    byteSize: body.length, attemptNo: 1, assetOrder: 1,
  });
  const request = (headers: Record<string, string> = {}) => new Request('https://local.example.invalid/api/writing/upload/synthetic-token', {
    method: 'PUT', headers: { 'Content-Type': 'image/png', ...headers }, body,
  });
  const staffHeaders = { Cookie: cookie, 'X-MedAce-Workspace': 'instructor', 'X-MedAce-Workspace-Version': '7',
    'X-MedAce-Workspace-Org': 'staff-org-a', 'X-MedAce-Workspace-Identity': 'grant-owner' };
  const token = (upload: { uploadUrl: string }) => upload.uploadUrl.split('/').at(-1)!;
  const asset = (assetId: string) => f.sqlite.prepare('SELECT * FROM writing_submission_assets WHERE id = ?').get(assetId)!;
  return { ...f, objects, uploads, deleted, state, otherCookie, actor, body, mint, request, staffHeaders, token, asset };
};

describe('owner-grant upload capabilities use the issuer context and current authority', () => {
  it('rejects missing identity, another UID and another workspace before consuming an issued lease', async () => {
    const f = await setupUpload();
    const upload = await f.mint();
    const before = f.asset(upload.assetId);
    expect(before).toMatchObject({ workspace_user_id: 'grant-owner', workspace_id: 'instructor',
      workspace_organization_id: 'staff-org-a', workspace_grant_version: 7 });
    await expect(handleWritingAssetUpload(f.env, f.token(upload), f.request())).rejects.toMatchObject({ status: 401 });
    await expect(handleWritingAssetUpload(f.env, f.token(upload), f.request({ ...f.staffHeaders, Cookie: f.otherCookie }))).rejects.toMatchObject({ status: 403 });
    await expect(handleWritingAssetUpload(f.env, f.token(upload), f.request({ ...f.staffHeaders, 'X-MedAce-Workspace': 'group-admin' }))).rejects.toMatchObject({ status: 403 });
    expect(f.asset(upload.assetId)).toEqual(before);
    expect(f.uploads).toEqual([]);
  });

  it.each(['version', 'revoke', 'organization', 'teacher-flag'] as const)('denies unused and already-completed token replay after %s changes', async (change) => {
    const f = await setupUpload();
    const completed = await f.mint();
    await expect(handleWritingAssetUpload(f.env, f.token(completed), f.request(f.staffHeaders))).resolves.toMatchObject({ status: 204 });
    const receipt = f.asset(completed.assetId);
    await expect(handleWritingAssetUpload(f.env, f.token(completed), f.request(f.staffHeaders))).resolves.toMatchObject({ status: 204 });
    expect(f.asset(completed.assetId)).toEqual(receipt);
    const unused = await f.mint();
    const unusedBefore = f.asset(unused.assetId);
    if (change === 'version') f.sqlite.exec("UPDATE workspace_access_grants SET grant_version = 8 WHERE user_id = 'grant-owner'");
    if (change === 'revoke') f.sqlite.exec("UPDATE workspace_access_grants SET status = 'REVOKED' WHERE user_id = 'grant-owner'");
    if (change === 'organization') f.sqlite.exec("UPDATE organizations SET status = 'INACTIVE' WHERE id = 'staff-org-a'");
    if (change === 'teacher-flag') f.sqlite.exec("UPDATE workspace_access_grants SET teacher_access = 0 WHERE user_id = 'grant-owner'");
    const authority = f.authority();
    await expect(handleWritingAssetUpload(f.env, f.token(unused), f.request(f.staffHeaders))).rejects.toMatchObject({ status: 403 });
    await expect(handleWritingAssetUpload(f.env, f.token(completed), f.request(f.staffHeaders))).rejects.toMatchObject({ status: 403 });
    expect(f.asset(unused.assetId)).toEqual(unusedBefore);
    expect(f.asset(completed.assetId)).toEqual(receipt);
    expect(f.uploads).toHaveLength(1);
    expect(f.authority()).toEqual(authority);
  });

  it('does not mint a lease from a projected actor whose grant was revoked before the INSERT', async () => {
    const f = await setupUpload();
    f.sqlite.exec("UPDATE workspace_access_grants SET status = 'REVOKED' WHERE user_id = 'grant-owner'");
    await expect(f.mint()).rejects.toMatchObject({ status: 403 });
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_submission_assets').get()!.n).toBe(0);
    expect(f.uploads).toEqual([]);
  });

  it('rejects a grant revocation racing between authorization and the lease INSERT', async () => {
    const f = await setupUpload();
    f.beforeRun((sql) => {
      if (sql.includes('INSERT INTO writing_submission_assets')) {
        f.sqlite.exec("UPDATE workspace_access_grants SET status = 'REVOKED' WHERE user_id = 'grant-owner'");
      }
    });
    await expect(f.mint()).rejects.toMatchObject({ status: 409 });
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_submission_assets').get()!.n).toBe(0);
    expect(f.uploads).toEqual([]);
  });

  it('does not accept an original when the grant changes during the object PUT', async () => {
    const f = await setupUpload();
    const upload = await f.mint();
    f.state.duringPut = () => f.sqlite.exec("UPDATE workspace_access_grants SET grant_version = 8 WHERE user_id = 'grant-owner'");
    await expect(handleWritingAssetUpload(f.env, f.token(upload), f.request(f.staffHeaders))).rejects.toMatchObject({ status: 409 });
    expect(f.asset(upload.assetId)).toMatchObject({ uploaded_at: null, uploaded_etag: null, uploaded_sha256_base64: null, byte_size: 0 });
    expect(f.deleted).toEqual(f.uploads);
    expect(f.objects.size).toBe(0);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM writing_submissions').get()!.n).toBe(0);
  });

  it('preserves cookie-free original student leases and idempotent same-body confirmation', async () => {
    const f = await setupUpload();
    const student = f.identity('student-a-assigned');
    const upload = await f.mint(student);
    expect(f.asset(upload.assetId)).toMatchObject({ workspace_user_id: null, workspace_id: null,
      workspace_organization_id: null, workspace_grant_version: null });
    f.sqlite.exec("UPDATE workspace_access_grants SET status = 'REVOKED' WHERE user_id = 'grant-owner'");
    await expect(handleWritingAssetUpload(f.env, f.token(upload), f.request())).resolves.toMatchObject({ status: 204 });
    const receipt = f.asset(upload.assetId);
    await expect(handleWritingAssetUpload(f.env, f.token(upload), f.request())).resolves.toMatchObject({ status: 204 });
    expect(f.asset(upload.assetId)).toEqual(receipt);
    expect(f.uploads).toHaveLength(1);
  });
});
