import { createHash, pbkdf2Sync } from 'node:crypto';

const assert = (condition, message) => { if (!condition) throw new Error(`Owner workspace regression: ${message}`); };
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sha256 = (body) => createHash('sha256').update(body).digest('base64');
const invalidModernCookies = (cookie) => {
  const rawToken = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  const delimiter = rawToken.indexOf('.');
  assert(delimiter > 0, 'the modern fixture cookie must contain its secret');
  const sessionId = rawToken.slice(0, delimiter);
  return [`medace_session=${encodeURIComponent(sessionId)}`, `medace_session=${encodeURIComponent(`${sessionId}.synthetic-wrong-secret`)}`];
};
const headersFor = (workspace, orgId, version, uid) => ({
  'X-MedAce-Workspace': workspace,
  'X-MedAce-Workspace-Version': String(version),
  'X-MedAce-Workspace-Identity': uid,
  ...(workspace === 'service-admin' ? {} : { 'X-MedAce-Workspace-Org': orgId }),
});

// The standard API runner supplies its disposable --local D1 helpers and existing
// synthetic identities. This module never opens a remote database or creates an
// owner account. All authority changes below are restored before the runner resumes.
export const verifyOwnerWorkspaceRegressions = async ({
  persistDir, baseUrl, SessionClient, executeLocalSql, queryLocalSql,
  orgStudentUser: owner, freeStudentUser: otherStudent, cohortStudentUser: assignedStudent,
  otherCohortStudentUser: hiddenStudent, groupAdminUser,
}) => {
  assert(new URL(baseUrl).hostname === '127.0.0.1', 'fixtures must stay on the isolated localhost server');
  const execute = (sql) => executeLocalSql(persistDir, sql);
  const query = (sql) => queryLocalSql(persistDir, sql);
  const orgId = groupAdminUser.organizationId;
  const workspaceHeaders = (workspace, organizationId = orgId, version = 7) => headersFor(workspace, organizationId, version, owner.uid);
  const otherOrgId = 'api-owner-workspace-other-org';
  const otherCohortId = 'api-owner-workspace-other-cohort';
  const legacySessionId = 'api-owner-workspace-true-legacy-session';
  // The existing demo UID is retained. A local-only non-demo email makes the
  // explicit staff roster test meaningful; it is restored in finally.
  const localOwnerEmail = 'owner-grant-fixture@workspace.example.invalid';
  const localPassword = 'local-only-owner-workspace-password';
  const salt = Buffer.from('owner-workspace-local-fixture');
  const passwordHash = `pbkdf2$100000$${salt.toString('base64')}$${pbkdf2Sync(localPassword, salt, 100000, 32, 'sha256').toString('base64')}`;
  const originalUsers = await query(`SELECT * FROM users WHERE id IN (${quote(owner.uid)}, ${quote(otherStudent.uid)}) ORDER BY id`);
  const originalMemberships = await query(`SELECT * FROM organization_memberships WHERE user_id = ${quote(otherStudent.uid)} ORDER BY organization_id`);
  const originalAssignment = await query(`SELECT * FROM student_instructor_assignments WHERE student_user_id = ${quote(assignedStudent.uid)}`);
  const originalInstructorCohorts = await query(`SELECT * FROM organization_cohort_instructors WHERE instructor_user_id = ${quote(owner.uid)} ORDER BY cohort_id`);
  const originalGrant = await query(`SELECT * FROM workspace_access_grants WHERE user_id = ${quote(owner.uid)}`);
  assert(originalUsers.length === 2 && originalUsers.every((user) => user.role === 'STUDENT'), 'reuse two existing raw student identities');
  assert(originalGrant.length === 0, 'disposable owner fixture must start without a grant');
  assert((await query(`SELECT role, status FROM organization_memberships WHERE user_id = ${quote(owner.uid)} AND organization_id = ${quote(orgId)}`))[0]?.role === 'STUDENT',
    'owner fixture must keep its canonical student membership');
  assert((await query(`SELECT id FROM organizations WHERE id = ${quote(otherOrgId)}`)).length === 0, 'other-org fixture identifier must be unused');
  assert((await query(`SELECT id FROM users WHERE email = ${quote(localOwnerEmail)}`)).length === 0, 'local-only owner fixture email must be unused');
  assert((await query(`SELECT token FROM sessions WHERE token = ${quote(legacySessionId)}`)).length === 0, 'local legacy session identifier must be unused');
  const assignmentIds = ['api-owner-workspace-assignment-a', 'api-owner-workspace-assignment-b'];
  const protectedSql = `
    SELECT 'user' AS authority_table, id, email, password_hash, role, subscription_plan,
      organization_id, organization_name, organization_role FROM users
      WHERE id IN (${quote(owner.uid)}, ${quote(otherStudent.uid)}, ${quote(groupAdminUser.uid)}) ORDER BY id;
    SELECT 'membership' AS authority_table, * FROM organization_memberships
      WHERE user_id IN (${quote(owner.uid)}, ${quote(otherStudent.uid)}, ${quote(groupAdminUser.uid)}) ORDER BY user_id, organization_id;
    SELECT 'grant' AS authority_table, * FROM workspace_access_grants WHERE user_id = ${quote(owner.uid)};
  `;
  const learningSql = `
    SELECT 'history' AS learning_table, * FROM learning_histories WHERE user_id = ${quote(owner.uid)} ORDER BY word_id;
    SELECT 'study_receipt' AS learning_table, * FROM study_attempt_receipts WHERE user_id = ${quote(owner.uid)} ORDER BY client_attempt_id;
    SELECT 'quiz_receipt' AS learning_table, * FROM quiz_attempt_receipts WHERE user_id = ${quote(owner.uid)} ORDER BY client_attempt_id;
    SELECT 'import_receipt' AS learning_table, * FROM personal_catalog_import_receipts WHERE user_id = ${quote(owner.uid)} ORDER BY client_import_id;
  `;
  const learningBefore = await query(learningSql);
  const sessionsSql = `SELECT token, token_hash, user_id, expires_at, created_at FROM sessions WHERE user_id = ${quote(owner.uid)} ORDER BY token`;
  const sessionSnapshot = async () => JSON.stringify(await query(sessionsSql));
  const insertLegacySession = () => execute(`INSERT INTO sessions (token, token_hash, user_id, expires_at, created_at)
    VALUES (${quote(legacySessionId)}, NULL, ${quote(owner.uid)}, ${Date.now() + 60_000}, ${Date.now()})`);
  const teacher = new SessionClient(baseUrl, 'owner-teacher');
  const school = new SessionClient(baseUrl, 'owner-school');
  const service = new SessionClient(baseUrl, 'owner-service');
  const outsider = new SessionClient(baseUrl, 'owner-ungranted-student');
  const teacherHeaders = workspaceHeaders('instructor');
  const schoolHeaders = workspaceHeaders('group-admin');
  const serviceHeaders = workspaceHeaders('service-admin');
  const auth = (client, user, loginEntry, overrides = {}) => client.request('/api/auth', {
    method: 'POST', body: JSON.stringify({ action: 'email-auth', email: user.uid === owner.uid ? localOwnerEmail : user.email, password: localPassword,
      isSignUp: false, loginEntry, ...overrides }),
  });
  const storage = (client, headers, action, payload) => client.request('/api/storage', {
    method: 'POST', headers, body: JSON.stringify({ action, ...(payload === undefined ? {} : { payload }) }),
  });
  const requireStatus = (result, status, label) => assert(result.status === status, `${label}: expected ${status}, received ${result.status}`);
  const students = async (client, headers) => {
    const result = await storage(client, headers, 'getAllStudentsProgress');
    requireStatus(result, 200, 'student progress');
    assert(Array.isArray(result.data), 'progress response must be a list');
    return result.data;
  };
  const putAsset = (client, upload, body, headers = teacherHeaders) => fetch(`${baseUrl}${upload.uploadUrl}`, {
    method: 'PUT', headers: { Origin: baseUrl, 'Content-Type': 'image/png', 'X-Content-SHA256': sha256(body),
      ...(client?.cookie ? { Cookie: client.cookie } : {}), ...headers }, body,
  });
  const assetSnapshot = (assetId) => query(`SELECT * FROM writing_submission_assets WHERE id = ${quote(assetId)}`);
  let initialAuthority;
  let createdCohortId;
  try {
    await execute(`
      UPDATE users SET password_hash = ${quote(passwordHash)} WHERE id IN (${quote(owner.uid)}, ${quote(otherStudent.uid)});
      UPDATE users SET email = ${quote(localOwnerEmail)} WHERE id = ${quote(owner.uid)};
      INSERT INTO organizations (id, display_name, name_key, subscription_plan, status, created_at, updated_at)
      VALUES (${quote(otherOrgId)}, 'Synthetic other classroom only', 'api-owner-workspace-other-org', 'TOB_PAID', 'ACTIVE', 1, 1);
      INSERT INTO organization_cohorts (id, organization_id, name, created_at, updated_at)
      VALUES (${quote(otherCohortId)}, ${quote(otherOrgId)}, 'Synthetic other classroom cohort only', 1, 1);
      UPDATE organization_memberships SET status = 'INACTIVE' WHERE user_id = ${quote(otherStudent.uid)};
      INSERT INTO organization_memberships (user_id, organization_id, role, status, created_at, updated_at)
      VALUES (${quote(otherStudent.uid)}, ${quote(otherOrgId)}, 'STUDENT', 'ACTIVE', 1, 1);
      UPDATE users SET organization_id = ${quote(otherOrgId)}, organization_name = 'Synthetic other classroom only',
        organization_role = 'STUDENT', subscription_plan = 'TOB_PAID' WHERE id = ${quote(otherStudent.uid)};
      INSERT INTO workspace_access_grants (user_id, staff_organization_id, teacher_access, school_admin_access,
        service_admin_access, status, grant_version, created_at, updated_at)
      VALUES (${quote(owner.uid)}, ${quote(orgId)}, 1, 1, 1, 'ACTIVE', 7, 1, 1);
    `);
    initialAuthority = await query(protectedSql);
    for (const [client, workspace, role, organizationRole] of [
      [teacher, 'instructor', 'INSTRUCTOR', 'INSTRUCTOR'],
      [school, 'group-admin', 'INSTRUCTOR', 'GROUP_ADMIN'],
      [service, 'service-admin', 'ADMIN', undefined],
    ]) {
      const result = await auth(client, owner, workspace);
      requireStatus(result, 200, `${workspace} real-password login`);
      assert(result.data.uid === owner.uid && result.data.role === role && result.data.organizationRole === organizationRole,
        'dedicated entry must project the same UID and exact selected role');
      assert(result.data.workspaceAccess?.workspace === workspace && result.data.workspaceAccess.grantVersion === 7,
        'login must return the selected workspace and current grant version');
      assert(result.data.workspaceAccess.availableWorkspaces.join(',') === 'instructor,group-admin,service-admin',
        'only the three explicit allowed workspaces should be advertised');
      assert((result.data.organizationId || null) === (workspace === 'service-admin' ? null : orgId), 'staff role must bind to the server grant organization');
      const session = await client.request('/api/session', { method: 'GET', headers: workspaceHeaders(workspace) });
      requireStatus(session, 200, `${workspace} session restore`);
      assert(session.data.role === role && session.data.workspaceAccess?.workspace === workspace, 'session restore must retain the explicit workspace projection');
    }
    const originalSessions = await sessionSnapshot();
    for (const [client, workspace] of [[teacher, 'instructor'], [school, 'group-admin'], [service, 'service-admin']]) {
      const headers = workspaceHeaders(workspace);
      const baselineData = JSON.stringify(await students(client, headers));
      for (const cookie of invalidModernCookies(client.cookie)) {
        const rejected = new SessionClient(baseUrl, 'invalid-modern-cookie');
        rejected.cookie = cookie;
        const invalidSession = await rejected.request('/api/session', { method: 'GET', headers });
        requireStatus(invalidSession, 204, `${workspace} shortened/wrong-secret session`);
        assert(invalidSession.setCookies.length === 0, 'invalid session read must not issue or clear a cookie');
        requireStatus(await storage(rejected, headers, 'getAllStudentsProgress'), 401, `${workspace} shortened/wrong-secret data`);
        const invalidLogout = await rejected.request('/api/session', { method: 'DELETE', headers });
        requireStatus(invalidLogout, 204, `${workspace} shortened/wrong-secret logout`);
        assert(invalidLogout.setCookies.length === 1 && invalidLogout.setCookies[0].includes('Max-Age=0'),
          'rejected credential logout may clear only its own request cookie');
        assert(await sessionSnapshot() === originalSessions, 'invalid secret or bare session ID must not delete or change any authenticated owner session');
        assert(JSON.stringify(await query(protectedSql)) === JSON.stringify(initialAuthority), 'rejected credentials must not change authority or credentials');
        requireStatus(await client.request('/api/session', { method: 'GET', headers }), 200, `${workspace} valid cookie recovery`);
        assert(JSON.stringify(await students(client, headers)) === baselineData, 'the original cookie must retain the same current workspace data after rejection');
      }
    }
    const logoutClient = new SessionClient(baseUrl, 'valid-modern-logout');
    requireStatus(await auth(logoutClient, owner, 'instructor'), 200, 'valid modern logout setup');
    const beforeValidLogout = await query(sessionsSql);
    requireStatus(await logoutClient.request('/api/session', { method: 'DELETE', headers: teacherHeaders }), 204, 'authenticated modern logout');
    assert((await query(sessionsSql)).length === beforeValidLogout.length - 1 && await sessionSnapshot() === originalSessions,
      'valid modern logout must delete only its newly authenticated session');
    requireStatus(await logoutClient.request('/api/session', { method: 'GET', headers: teacherHeaders }), 204, 'logged-out modern session');
    requireStatus(await storage(logoutClient, teacherHeaders, 'getAllStudentsProgress'), 401, 'logged-out modern data');
    await insertLegacySession();
    const legacy = new SessionClient(baseUrl, 'true-null-hash-legacy');
    legacy.cookie = `medace_session=${legacySessionId}`;
    for (const workspace of ['instructor', 'group-admin', 'service-admin']) {
      const result = await legacy.request('/api/session', { method: 'GET', headers: workspaceHeaders(workspace) });
      requireStatus(result, 200, `${workspace} genuine legacy session`);
      assert(result.data.uid === owner.uid && result.data.workspaceAccess?.workspace === workspace, 'only a genuine null-hash legacy token retains compatibility');
      await students(legacy, workspaceHeaders(workspace));
    }
    requireStatus(await legacy.request('/api/session', { method: 'DELETE', headers: teacherHeaders }), 204, 'authenticated true legacy logout');
    assert(await sessionSnapshot() === originalSessions, 'true legacy logout must delete its own row and preserve all modern owner sessions');
    requireStatus(await teacher.request('/api/session', { method: 'GET', headers: teacherHeaders }), 200, 'modern session after legacy logout');
    const personal = await teacher.request('/api/session', { method: 'GET' });
    requireStatus(personal, 200, 'personal session restore');
    assert(personal.data.role === 'STUDENT' && !personal.data.workspaceAccess && personal.data.organizationRole === 'STUDENT',
      'the shared identity cookie must retain the underlying personal student');
    const discovered = await teacher.request('/api/session', { method: 'GET', headers: { 'X-MedAce-Workspace': 'instructor' } });
    requireStatus(discovered, 200, 'session workspace discovery');
    assert(discovered.data.workspaceAccess?.grantVersion === 7 && discovered.data.organizationId === orgId,
      'session-only discovery must provide the current server grant scope');
    requireStatus(await storage(teacher, {}, 'getAllStudentsProgress'), 403, 'missing workspace must retain student restrictions');
    const wrongPassword = await auth(teacher, owner, 'service-admin', { password: 'incorrect-local-password' });
    requireStatus(wrongPassword, 401, 'password must be checked before workspace access');
    assert(wrongPassword.setCookies.length === 0, 'failed password must not issue or replace a session');
    requireStatus(await auth(outsider, otherStudent, 'service-admin'), 403, 'another existing UID must not acquire the owner grant');
    for (const header of [
      { 'X-MedAce-Workspace': 'admin', 'X-MedAce-Workspace-Version': '7' },
      { 'X-MedAce-Workspace': 'instructor', 'X-MedAce-Workspace-Version': '7.5' },
      { 'X-MedAce-Workspace': 'instructor' },
      { 'X-MedAce-Workspace': 'instructor', 'X-MedAce-Workspace-Version': '7', 'X-MedAce-Workspace-Identity': owner.uid },
    ]) requireStatus(await storage(teacher, header, 'getAllStudentsProgress'), 400, 'malformed or incomplete workspace context');
    requireStatus(await storage(teacher, workspaceHeaders('instructor', orgId, 6), 'getAllStudentsProgress'), 403, 'stale grant version');
    requireStatus(await storage(teacher, workspaceHeaders('instructor', otherOrgId), 'getAllStudentsProgress'), 403, 'forged teacher organization');
    requireStatus(await storage(teacher, { ...teacherHeaders, 'X-MedAce-Workspace-Identity': otherStudent.uid }, 'getAllStudentsProgress'), 403, 'workspace identity must match the cookie identity');
    requireStatus(await storage(service, { ...serviceHeaders, 'X-MedAce-Workspace-Org': orgId }, 'getAllStudentsProgress'), 403, 'service mode must not accept a classroom organization hint');
    assert((await students(teacher, teacherHeaders)).length === 0, 'teacher without assignment or cohort must remain empty');
    const schoolStudents = await students(school, schoolHeaders);
    assert(schoolStudents.some((student) => student.uid === assignedStudent.uid)
      && schoolStudents.some((student) => student.uid === hiddenStudent.uid)
      && !schoolStudents.some((student) => student.uid === otherStudent.uid), 'school administrator should see all of A and none of B');
    const serviceStudents = await students(service, serviceHeaders);
    assert(serviceStudents.some((student) => student.uid === assignedStudent.uid)
      && serviceStudents.some((student) => student.uid === otherStudent.uid), 'service administrator should see both A and B');
    requireStatus(await storage(school, schoolHeaders, 'assignStudentInstructor', { studentUid: assignedStudent.uid, instructorUid: owner.uid }), 204,
      'grant-holder with raw student identity must be eligible for its teacher assignment');
    assert((await students(teacher, teacherHeaders)).map((student) => student.uid).join(',') === assignedStudent.uid,
      'teacher must see exactly its assigned student in A');
    const settings = await storage(school, schoolHeaders, 'getOrganizationSettingsSnapshot');
    requireStatus(settings, 200, 'school settings');
    assert(settings.data.organizationId === orgId && settings.data.members.every((member) => member.userUid !== otherStudent.uid),
      'settings must use the grant classroom and exclude the other classroom');
    const classroom = await storage(school, schoolHeaders, 'upsertOrganizationCohort', { name: 'Synthetic owner grant class only' });
    requireStatus(classroom, 200, 'grant classroom cohort creation');
    createdCohortId = classroom.data.id;
    assert(typeof createdCohortId === 'string' && createdCohortId.length > 0, 'new local classroom cohort must have a real stored ID');
    requireStatus(await storage(school, schoolHeaders, 'setInstructorCohorts', {
      instructorUid: owner.uid, cohortIds: [createdCohortId],
    }), 204, 'granted teacher must be assignable to its classroom cohort');
    const settingsWithCohort = await storage(school, schoolHeaders, 'getOrganizationSettingsSnapshot');
    requireStatus(settingsWithCohort, 200, 'settings with granted teacher cohort');
    assert((settingsWithCohort.data.instructorCohorts[owner.uid] || []).join(',') === createdCohortId,
      'settings must expose the owner teacher cohort assignment');
    const canonicalOwnerMember = settingsWithCohort.data.members.find((member) => member.userUid === owner.uid);
    assert(canonicalOwnerMember?.userRole === 'STUDENT' && canonicalOwnerMember.organizationRole === 'STUDENT',
      'the canonical membership roster must retain the original student authority');
    const dashboardRoster = await storage(school, schoolHeaders, 'getOrganizationDashboardSnapshot');
    requireStatus(dashboardRoster, 200, 'dashboard staff roster');
    const grantedTeachers = dashboardRoster.data.instructors.filter((instructor) => instructor.uid === owner.uid);
    assert(grantedTeachers.length === 1 && grantedTeachers[0].organizationRole === 'INSTRUCTOR',
      'the operational instructor roster must include the explicit granted teacher once');
    const cohortRowsSql = `SELECT * FROM organization_cohort_instructors WHERE instructor_user_id = ${quote(owner.uid)} ORDER BY cohort_id`;
    const beforeForeignCohort = await query(cohortRowsSql);
    requireStatus(await storage(school, schoolHeaders, 'setInstructorCohorts', {
      instructorUid: owner.uid, cohortIds: [createdCohortId, otherCohortId],
    }), 404, 'a foreign classroom cohort must not be assigned to the granted teacher');
    assert(JSON.stringify(await query(cohortRowsSql)) === JSON.stringify(beforeForeignCohort),
      'denied foreign cohort update must retain every existing owner cohort assignment');
    assert(JSON.stringify(await query(protectedSql)) === JSON.stringify(initialAuthority),
      'teacher cohort assignment and roster reads must preserve raw student role, canonical student membership, plan and hash');
    const mutationSql = `
      SELECT 'assignment' AS mutation_table, * FROM student_instructor_assignments ORDER BY student_user_id;
      SELECT 'notification' AS mutation_table, * FROM instructor_notifications ORDER BY id;
      SELECT 'cohort' AS mutation_table, * FROM organization_cohorts ORDER BY id;
    `;
    const beforeDeniedMutations = await query(mutationSql);
    for (const [client, headers] of [[teacher, teacherHeaders], [school, schoolHeaders]]) {
      requireStatus(await storage(client, headers, 'getStudentWorksheetSnapshot', { studentUid: otherStudent.uid }), 403, 'cross-classroom worksheet');
      requireStatus(await storage(client, headers, 'sendInstructorNotification', {
        studentUid: otherStudent.uid, message: 'Synthetic forbidden notification', triggerReason: 'Synthetic test only',
        usedAi: false, interventionKind: 'MANUAL_OTHER',
      }), 403, 'cross-classroom notification');
      requireStatus(await storage(client, headers, 'assignStudentInstructor', { studentUid: otherStudent.uid, instructorUid: owner.uid }), 403,
        'cross-classroom instructor assignment');
      requireStatus(await storage(client, headers, 'getAdminDashboardSnapshot'), 403, 'staff mode must not inherit service-admin rights');
    }
    requireStatus(await storage(teacher, teacherHeaders, 'getStudentWorksheetSnapshot', { studentUid: hiddenStudent.uid }), 403, 'unassigned same-classroom worksheet');
    requireStatus(await storage(teacher, teacherHeaders, 'upsertOrganizationCohort', { name: 'Synthetic forbidden teacher class' }), 403, 'teacher must not inherit school-admin rights');
    assert(JSON.stringify(await query(mutationSql)) === JSON.stringify(beforeDeniedMutations), 'denied classroom, notification and assignment operations must not persist any changes');
    const profile = await school.request('/api/profile', { method: 'POST', headers: schoolHeaders, body: JSON.stringify({ user: {
      uid: owner.uid, role: 'ADMIN', organizationId: otherOrgId, organizationRole: 'GROUP_ADMIN', subscriptionPlan: 'TOC_PAID',
      workspaceAccess: { workspace: 'service-admin', grantVersion: 99 },
    } }) });
    requireStatus(profile, 200, 'profile round-trip');
    assert(profile.data.role === 'INSTRUCTOR' && profile.data.organizationId === orgId && profile.data.workspaceAccess?.workspace === 'group-admin',
      'profile mutation must ignore client authority injection and retain the active workspace');
    // Two tabs intentionally share one identity cookie; requests choose their own
    // server-checked scopes instead of changing a cookie-wide role selection.
    service.cookie = teacher.cookie;
    const [tabTeacher, tabService] = await Promise.all([students(teacher, teacherHeaders), students(service, serviceHeaders)]);
    assert(tabTeacher.length === 1 && tabTeacher[0].uid === assignedStudent.uid
      && tabService.some((student) => student.uid === otherStudent.uid), 'one cookie must support simultaneous isolated teacher and service requests');
    assert(JSON.stringify(await query(protectedSql)) === JSON.stringify(initialAuthority), 'login, restore, staff operations and injected profile must preserve raw role, hash, plan, memberships and grant');

    // Create only synthetic static assignments directly in local D1. No prompt
    // generation, OCR, evaluation, provider request or production material is used.
    for (const [assignmentId, organizationId, student, organizationName] of [
      [assignmentIds[0], orgId, assignedStudent, groupAdminUser.organizationName],
      [assignmentIds[1], otherOrgId, otherStudent, 'Synthetic other classroom only'],
    ]) await execute(`INSERT INTO writing_assignments (id, organization_id, organization_name, instructor_user_id,
      student_user_id, exam_category, template_type, prompt_title, prompt_text, guidance, word_count_min,
      word_count_max, submission_code, prompt_snapshot, status, created_at, issued_at, updated_at)
      VALUES (${quote(assignmentId)}, ${quote(organizationId)}, ${quote(organizationName)}, ${quote(groupAdminUser.uid)},
        ${quote(student.uid)}, 'EIKEN', 'OPINION', 'Synthetic static prompt', 'Synthetic local-only answer.', '',
        10, 100, ${quote(assignmentId)}, '{}', 'ISSUED', 1, 1, 1)`);
    for (const [client, headers] of [[teacher, teacherHeaders], [school, schoolHeaders]]) {
      const assignments = await client.request('/api/writing/assignments?scope=organization', { method: 'GET', headers });
      requireStatus(assignments, 200, 'writing classroom assignments');
      assert(assignments.data.assignments.some((assignment) => assignment.id === assignmentIds[0])
        && !assignments.data.assignments.some((assignment) => assignment.id === assignmentIds[1]), 'writing reread must use the selected classroom');
      requireStatus(await client.request('/api/writing/upload-url', { method: 'POST', headers, body: JSON.stringify({
        assignmentId: assignmentIds[1], fileName: 'forbidden.png', mimeType: 'image/png', byteSize: 4, assetOrder: 1,
      }) }), 403, 'cross-classroom upload reservation');
    }
    const body = Buffer.from('owner-workspace-synthetic-original');
    const mint = async (order) => {
      const result = await teacher.request('/api/writing/upload-url', { method: 'POST', headers: teacherHeaders, body: JSON.stringify({
        assignmentId: assignmentIds[0], fileName: `synthetic-${order}.png`, mimeType: 'image/png', assetOrder: order,
        attemptNo: 1, byteSize: body.length, sha256Base64: sha256(body),
      }) });
      requireStatus(result, 200, 'owner grant upload lease');
      const [asset] = await assetSnapshot(result.data.assetId);
      assert(asset.workspace_user_id === owner.uid && asset.workspace_id === 'instructor'
        && asset.workspace_organization_id === orgId && asset.workspace_grant_version === 7, 'upload lease must bind the issuer UID, workspace, classroom and version');
      return result.data;
    };
    const uploaded = await mint(1);
    const unused = await mint(2);
    const beforeAnonymous = await assetSnapshot(uploaded.assetId);
    requireStatus(await putAsset(null, uploaded, body), 401, 'owner lease must require the same identity session');
    assert(JSON.stringify(await assetSnapshot(uploaded.assetId)) === JSON.stringify(beforeAnonymous), 'unauthenticated owner PUT must not consume or change the lease');
    requireStatus(await putAsset(teacher, uploaded, body, schoolHeaders), 403, 'owner lease must require the issuing workspace');
    requireStatus(await putAsset(teacher, uploaded, body), 204, 'owner upload original');
    const completed = await assetSnapshot(uploaded.assetId);
    requireStatus(await putAsset(teacher, uploaded, body), 204, 'same-body owner PUT confirmation');
    assert(JSON.stringify(await assetSnapshot(uploaded.assetId)) === JSON.stringify(completed), 'successful confirmation must not rewrite the original upload receipt');
    const sessionsBeforeInvalidUpload = await sessionSnapshot();
    const unusedBeforeInvalidUpload = await assetSnapshot(unused.assetId);
    for (const [client, workspace] of [[teacher, 'instructor'], [school, 'group-admin'], [service, 'service-admin']]) {
      const headers = workspaceHeaders(workspace);
      const baselineData = JSON.stringify(await students(client, headers));
      for (const cookie of invalidModernCookies(client.cookie)) {
        const rejected = new SessionClient(baseUrl, 'invalid-modern-upload-cookie');
        rejected.cookie = cookie;
        requireStatus(await putAsset(rejected, unused, body, headers), 401, `${workspace} shortened/wrong-secret unused upload`);
        requireStatus(await putAsset(rejected, uploaded, body, headers), 401, `${workspace} shortened/wrong-secret original confirmation`);
        assert(await sessionSnapshot() === sessionsBeforeInvalidUpload, 'rejected upload credentials must not destroy the valid owner session');
        assert(JSON.stringify(await assetSnapshot(unused.assetId)) === JSON.stringify(unusedBeforeInvalidUpload)
          && JSON.stringify(await assetSnapshot(uploaded.assetId)) === JSON.stringify(completed), 'rejected upload credentials must not consume or rewrite any original receipt');
        requireStatus(await client.request('/api/session', { method: 'GET', headers }), 200, `${workspace} upload cookie recovery`);
        assert(JSON.stringify(await students(client, headers)) === baselineData, 'current workspace data must survive invalid upload credentials');
      }
    }
    await insertLegacySession();
    const legacyUpload = new SessionClient(baseUrl, 'true-legacy-original-confirmation');
    legacyUpload.cookie = `medace_session=${legacySessionId}`;
    requireStatus(await putAsset(legacyUpload, uploaded, body, teacherHeaders), 204, 'genuine legacy issuer original confirmation');
    assert(JSON.stringify(await assetSnapshot(uploaded.assetId)) === JSON.stringify(completed), 'true legacy confirmation must retain the immutable original receipt');
    requireStatus(await legacyUpload.request('/api/session', { method: 'DELETE', headers: teacherHeaders }), 204, 'genuine legacy issuer logout');
    assert(await sessionSnapshot() === sessionsBeforeInvalidUpload, 'legacy upload logout must leave every modern session intact');
    for (const [sql, label] of [
      [`UPDATE workspace_access_grants SET grant_version = 8 WHERE user_id = ${quote(owner.uid)}`, 'version change'],
      [`UPDATE workspace_access_grants SET status = 'REVOKED' WHERE user_id = ${quote(owner.uid)}`, 'revocation'],
      [`UPDATE organizations SET status = 'INACTIVE' WHERE id = ${quote(orgId)}`, 'inactive organization'],
    ]) {
      await execute(sql);
      const beforeUnused = await assetSnapshot(unused.assetId);
      requireStatus(await storage(teacher, teacherHeaders, 'getAllStudentsProgress'), 403, `teacher after ${label}`);
      requireStatus(await storage(service, serviceHeaders, 'getAllStudentsProgress'), label === 'inactive organization' ? 200 : 403,
        `global service permission after ${label}`);
      requireStatus(await putAsset(teacher, unused, body), 403, `unused owner PUT after ${label}`);
      requireStatus(await putAsset(teacher, uploaded, body), 403, `already-uploaded owner replay after ${label}`);
      assert(JSON.stringify(await assetSnapshot(unused.assetId)) === JSON.stringify(beforeUnused)
        && JSON.stringify(await assetSnapshot(uploaded.assetId)) === JSON.stringify(completed), 'denied stale/revoked PUT must not change either asset receipt');
      await execute(`UPDATE workspace_access_grants SET grant_version = 7, status = 'ACTIVE' WHERE user_id = ${quote(owner.uid)};
        UPDATE organizations SET status = 'ACTIVE' WHERE id = ${quote(orgId)}`);
    }
    requireStatus(await storage(service, serviceHeaders, 'getAdminDashboardSnapshot'), 200, 'current service-admin explicit grant');
    assert(JSON.stringify(await query(learningSql)) === JSON.stringify(learningBefore), 'workspace use must preserve personal learning and import receipts');
    console.log('Owner workspace native D1 regression passed: same student UID/password, explicit grant, request scope/version, teacher assignment, school classroom, service global, shared-cookie isolation, profile injection denied, bound upload/replay/revocation, raw authority and learning retained.');
  } finally {
    await execute(`DELETE FROM writing_assignments WHERE id IN (${assignmentIds.map(quote).join(',')});
      DELETE FROM sessions WHERE token = ${quote(legacySessionId)};
      DELETE FROM student_instructor_assignments WHERE student_user_id = ${quote(assignedStudent.uid)};
      DELETE FROM organization_cohort_instructors WHERE instructor_user_id = ${quote(owner.uid)};
      ${createdCohortId ? `DELETE FROM organization_cohorts WHERE id = ${quote(createdCohortId)};` : ''}
      DELETE FROM workspace_access_grants WHERE user_id = ${quote(owner.uid)};
      UPDATE organizations SET status = 'ACTIVE' WHERE id = ${quote(orgId)};
      DELETE FROM organization_memberships WHERE user_id = ${quote(otherStudent.uid)};
      DELETE FROM organizations WHERE id = ${quote(otherOrgId)};`);
    for (const user of originalUsers) await execute(`UPDATE users SET email = ${quote(user.email)}, password_hash = ${user.password_hash === null ? 'NULL' : quote(user.password_hash)},
      role = ${quote(user.role)}, subscription_plan = ${user.subscription_plan === null ? 'NULL' : quote(user.subscription_plan)},
      organization_id = ${user.organization_id === null ? 'NULL' : quote(user.organization_id)},
      organization_name = ${user.organization_name === null ? 'NULL' : quote(user.organization_name)},
      organization_role = ${user.organization_role === null ? 'NULL' : quote(user.organization_role)} WHERE id = ${quote(user.id)}`);
    for (const membership of originalMemberships) await execute(`INSERT INTO organization_memberships
      (user_id, organization_id, role, status, created_at, updated_at) VALUES
      (${quote(membership.user_id)}, ${quote(membership.organization_id)}, ${quote(membership.role)}, ${quote(membership.status)}, ${membership.created_at}, ${membership.updated_at})`);
    for (const assignment of originalAssignment) await execute(`INSERT INTO student_instructor_assignments
      (student_user_id, instructor_user_id, created_at, updated_at) VALUES
      (${quote(assignment.student_user_id)}, ${quote(assignment.instructor_user_id)}, ${assignment.created_at}, ${assignment.updated_at})`);
    for (const cohort of originalInstructorCohorts) await execute(`INSERT INTO organization_cohort_instructors
      (cohort_id, instructor_user_id, created_at, updated_at) VALUES
      (${quote(cohort.cohort_id)}, ${quote(cohort.instructor_user_id)}, ${cohort.created_at}, ${cohort.updated_at})`);
  }
};
