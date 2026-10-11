import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { handleGetOrganizationSettingsSnapshot } from '../functions/_shared/organization-settings-actions';
import { handleSetInstructorCohorts } from '../functions/_shared/organization-assignment-actions';
import { projectStaffWorkspace } from '../functions/_shared/workspace-access';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { OrganizationRole, UserRole } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach((fixture) => fixture.sqlite.close()));

const setup = () => {
  const fixture = createSqliteD1();
  fixtures.push(fixture);
  const migrationDir = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(name, migrationDir), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO organizations (id, display_name, name_key, subscription_plan, status, created_at, updated_at)
    VALUES ('picker-org-a', 'Synthetic classroom A', 'picker-a', 'TOB_PAID', 'ACTIVE', 1, 1),
           ('picker-org-b', 'Synthetic classroom B', 'picker-b', 'TOB_FREE', 'ACTIVE', 1, 1);
    INSERT INTO users (id, email, password_hash, display_name, role, subscription_plan, organization_id,
      organization_name, organization_role, created_at, updated_at)
    VALUES ('picker-owner', 'owner@picker.example.invalid', 'synthetic-preserved-hash', 'Synthetic owner',
      'STUDENT', 'TOB_FREE', 'picker-org-b', 'Synthetic classroom B', 'STUDENT', 1, 1),
      ('picker-teacher', 'teacher@picker.example.invalid', NULL, 'Synthetic canonical teacher',
      'INSTRUCTOR', 'TOB_PAID', 'picker-org-a', 'Synthetic classroom A', 'INSTRUCTOR', 1, 1),
      ('picker-admin', 'admin@picker.example.invalid', NULL, 'Synthetic school administrator',
      'INSTRUCTOR', 'TOB_PAID', 'picker-org-a', 'Synthetic classroom A', 'GROUP_ADMIN', 1, 1),
      ('picker-student', 'student@picker.example.invalid', NULL, 'Synthetic student',
      'STUDENT', 'TOB_PAID', 'picker-org-a', 'Synthetic classroom A', 'STUDENT', 1, 1);
    INSERT INTO organization_memberships (user_id, organization_id, role, status, created_at, updated_at)
    VALUES ('picker-owner', 'picker-org-b', 'STUDENT', 'ACTIVE', 1, 1),
           ('picker-teacher', 'picker-org-a', 'INSTRUCTOR', 'ACTIVE', 1, 1),
           ('picker-admin', 'picker-org-a', 'GROUP_ADMIN', 'ACTIVE', 1, 1),
           ('picker-student', 'picker-org-a', 'STUDENT', 'ACTIVE', 1, 1);
    INSERT INTO workspace_access_grants (user_id, staff_organization_id, teacher_access, school_admin_access,
      service_admin_access, status, grant_version, created_at, updated_at)
    VALUES ('picker-owner', 'picker-org-a', 1, 1, 1, 'ACTIVE', 7, 1, 1);
    INSERT INTO organization_cohorts (id, organization_id, name, created_at, updated_at)
    VALUES ('picker-cohort-a', 'picker-org-a', 'Synthetic class A', 1, 1),
           ('picker-cohort-b', 'picker-org-b', 'Synthetic class B', 1, 1);
  `);
  const env: AppEnv = { DB: fixture.DB };
  const identity = (uid = 'picker-admin') => fixture.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(uid) as unknown as DbUserRow;
  const authority = () => ({
    users: fixture.sqlite.prepare('SELECT * FROM users ORDER BY id').all(),
    memberships: fixture.sqlite.prepare('SELECT * FROM organization_memberships ORDER BY user_id, organization_id').all(),
    grants: fixture.sqlite.prepare(`SELECT user_id, staff_organization_id, teacher_access, school_admin_access,
      service_admin_access, status, CAST(grant_version AS TEXT) AS grant_version, created_at, updated_at
      FROM workspace_access_grants ORDER BY user_id`).all(),
  });
  return { ...fixture, env, identity, authority };
};

describe('cohort instructor options keep canonical membership separate from operational grants', () => {
  it('includes an existing raw student with a current teacher grant without fabricating membership', async () => {
    const f = setup();
    const before = f.authority();
    const snapshot = await handleGetOrganizationSettingsSnapshot(f.env, f.identity());
    expect(snapshot.eligibleInstructors).toEqual([
      { userUid: 'picker-teacher', displayName: 'Synthetic canonical teacher', email: 'teacher@picker.example.invalid' },
      { userUid: 'picker-owner', displayName: 'Synthetic owner', email: 'owner@picker.example.invalid' },
    ]);
    expect(snapshot.members.map((member) => member.userUid).sort()).toEqual(['picker-admin', 'picker-student', 'picker-teacher']);
    expect(snapshot.members.find((member) => member.userUid === 'picker-student')).toMatchObject({
      userRole: UserRole.STUDENT, organizationRole: OrganizationRole.STUDENT,
    });
    expect(f.authority()).toEqual(before);
  });

  it('also preserves a grant holder canonical student membership in the same classroom', async () => {
    const f = setup();
    f.sqlite.exec(`UPDATE organization_memberships SET organization_id = 'picker-org-a' WHERE user_id = 'picker-owner'`);
    const before = f.authority();
    const snapshot = await handleGetOrganizationSettingsSnapshot(f.env, f.identity());
    expect(snapshot.members.find((member) => member.userUid === 'picker-owner')).toMatchObject({
      userRole: UserRole.STUDENT, organizationRole: OrganizationRole.STUDENT,
    });
    expect(snapshot.eligibleInstructors?.filter((candidate) => candidate.userUid === 'picker-owner')).toHaveLength(1);
    expect(f.authority()).toEqual(before);
  });

  it('deduplicates a canonical instructor who also has a teacher grant', async () => {
    const f = setup();
    f.sqlite.exec(`INSERT INTO workspace_access_grants (user_id, staff_organization_id, teacher_access,
      school_admin_access, service_admin_access, status, grant_version, created_at, updated_at)
      VALUES ('picker-teacher', 'picker-org-a', 1, 0, 0, 'ACTIVE', 3, 1, 1)`);
    const snapshot = await handleGetOrganizationSettingsSnapshot(f.env, f.identity());
    expect(snapshot.eligibleInstructors?.filter((candidate) => candidate.userUid === 'picker-teacher')).toHaveLength(1);
  });

  it.each([
    ['revoked', "status = 'REVOKED', grant_version = 8"],
    ['school-admin only', 'teacher_access = 0, school_admin_access = 1'],
    ['service-admin only', 'teacher_access = 0, school_admin_access = 0, service_admin_access = 1'],
    ['another classroom', "staff_organization_id = 'picker-org-b'"],
    ['unsafe version', 'grant_version = 9007199254740992'],
    ['fractional version', 'grant_version = 7.5'],
  ])('excludes %s grants without changing canonical records', async (_label, update) => {
    const f = setup();
    f.sqlite.exec(`UPDATE workspace_access_grants SET ${update} WHERE user_id = 'picker-owner'`);
    const before = f.authority();
    const snapshot = await handleGetOrganizationSettingsSnapshot(f.env, f.identity());
    expect(snapshot.eligibleInstructors?.map((candidate) => candidate.userUid)).toEqual(['picker-teacher']);
    expect(f.authority()).toEqual(before);
  });

  it('returns an explicit empty list when all target instructors are unavailable', async () => {
    const f = setup();
    f.sqlite.exec(`UPDATE organization_memberships SET status = 'INACTIVE' WHERE user_id = 'picker-teacher';
      UPDATE workspace_access_grants SET status = 'REVOKED', grant_version = 8 WHERE user_id = 'picker-owner'`);
    const snapshot = await handleGetOrganizationSettingsSnapshot(f.env, f.identity());
    expect(snapshot.eligibleInstructors).toEqual([]);
  });

  it('rereads current grant state on refresh rather than retaining earlier eligibility', async () => {
    const f = setup();
    const readIds = async () => (await handleGetOrganizationSettingsSnapshot(f.env, f.identity())).eligibleInstructors?.map((candidate) => candidate.userUid);
    expect(await readIds()).toContain('picker-owner');
    f.sqlite.exec(`UPDATE workspace_access_grants SET status = 'REVOKED', grant_version = 8 WHERE user_id = 'picker-owner'`);
    expect(await readIds()).not.toContain('picker-owner');
    f.sqlite.exec(`UPDATE workspace_access_grants SET status = 'ACTIVE', grant_version = 9 WHERE user_id = 'picker-owner'`);
    expect(await readIds()).toContain('picker-owner');
  });

  it('matches the save boundary for a canonical school administrator even with a teacher grant', async () => {
    const f = setup();
    f.sqlite.exec(`INSERT INTO workspace_access_grants (user_id, staff_organization_id, teacher_access,
      school_admin_access, service_admin_access, status, grant_version, created_at, updated_at)
      VALUES ('picker-admin', 'picker-org-a', 1, 1, 0, 'ACTIVE', 3, 1, 1)`);
    const snapshot = await handleGetOrganizationSettingsSnapshot(f.env, f.identity());
    expect(snapshot.eligibleInstructors?.map((candidate) => candidate.userUid)).not.toContain('picker-admin');
    await expect(handleSetInstructorCohorts(f.env, f.identity(), 'picker-admin', ['picker-cohort-a'])).rejects.toMatchObject({ status: 404 });
  });

  it('saves a selected grant holder through the existing cohort API while preserving student authority', async () => {
    const f = setup();
    const before = f.authority();
    const snapshot = await handleGetOrganizationSettingsSnapshot(f.env, f.identity());
    const selected = snapshot.eligibleInstructors?.find((candidate) => candidate.userUid === 'picker-owner');
    expect(selected).toBeDefined();
    await handleSetInstructorCohorts(f.env, f.identity(), selected!.userUid, ['picker-cohort-a']);
    expect((await handleGetOrganizationSettingsSnapshot(f.env, f.identity())).instructorCohorts['picker-owner']).toEqual(['picker-cohort-a']);
    expect(f.authority()).toEqual(before);
    await expect(handleSetInstructorCohorts(f.env, f.identity(), selected!.userUid, ['picker-cohort-b'])).rejects.toMatchObject({ status: 404 });
    expect((await handleGetOrganizationSettingsSnapshot(f.env, f.identity())).instructorCohorts['picker-owner']).toEqual(['picker-cohort-a']);
  });

  it('rejects a formerly selected instructor after revocation without changing cohort links', async () => {
    const f = setup();
    const selected = (await handleGetOrganizationSettingsSnapshot(f.env, f.identity())).eligibleInstructors?.find((candidate) => candidate.userUid === 'picker-owner');
    f.sqlite.exec(`UPDATE workspace_access_grants SET status = 'REVOKED', grant_version = 8 WHERE user_id = 'picker-owner'`);
    await expect(handleSetInstructorCohorts(f.env, f.identity(), selected!.userUid, ['picker-cohort-a'])).rejects.toMatchObject({ status: 404 });
    expect(f.sqlite.prepare('SELECT * FROM organization_cohort_instructors').all()).toEqual([]);
  });

  it.each(['instructor', 'service-admin'] as const)('denies %s access to settings and its eligible instructor emails', async (workspace) => {
    const f = setup();
    const actor = await projectStaffWorkspace(f.env, f.identity('picker-owner'), workspace, {
      grantVersion: 7, ...(workspace === 'instructor' ? { organizationId: 'picker-org-a' } : {}),
    });
    await expect(handleGetOrganizationSettingsSnapshot(f.env, actor)).rejects.toMatchObject({ status: 403 });
  });
});
