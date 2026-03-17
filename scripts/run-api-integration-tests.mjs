import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createNodeToolCommand } from './_shared/tooling.mjs';

const cwd = process.cwd();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const TOKYO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toTokyoDateKey = (value) => TOKYO_DATE_FORMATTER.format(new Date(value));

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    ...options,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error(`${command} ${args.join(' ')} failed with code ${code}\n${stdout}\n${stderr}`));
  });
});

const getSetCookieHeaders = (headers) => {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const header = headers.get('set-cookie');
  return header ? [header] : [];
};

const findTrendPoint = (snapshot, dateKey) => (
  (snapshot?.trend || []).find((point) => point.date === dateKey) || null
);

const getBookBandIndex = (title) => {
  if (!title) return null;
  const normalized = title.replace(/\s+/g, '');
  const levelMatch = normalized.match(/レベル([1-6])/);
  if (levelMatch) return Number(levelMatch[1]);
  if (normalized.includes('中1')) return 1;
  if (normalized.includes('中2')) return 2;
  if (normalized.includes('中3')) return 3;
  if (normalized.includes('高1')) return 4;
  if (normalized.includes('高2')) return 5;
  if (normalized.includes('高3')) return 6;
  return null;
};

class SessionClient {
  constructor(baseUrl, name) {
    this.baseUrl = baseUrl;
    this.name = name;
    this.cookie = '';
  }

  async request(pathname, init = {}) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(init.headers || {}),
      },
    });

    const setCookies = getSetCookieHeaders(response.headers);
    if (setCookies.length > 0) {
      this.cookie = setCookies.map((header) => header.split(';')[0]).join('; ');
    }

    let data;
    if (response.status !== 204) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    }

    return { status: response.status, data };
  }

  async demoLogin(role, organizationRole, demoPassword) {
    const result = await this.request('/api/auth', {
      method: 'POST',
      body: JSON.stringify({
        action: 'demo-login',
        role,
        organizationRole,
        demoPassword,
      }),
    });
    assert(result.status === 200, `[${this.name}] demo login failed: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async emailAuth({ email, password, isSignUp, role, displayName }) {
    const result = await this.request('/api/auth', {
      method: 'POST',
      body: JSON.stringify({
        action: 'email-auth',
        email,
        password,
        isSignUp,
        role,
        displayName,
      }),
    });
    assert(result.status === 200, `[${this.name}] email auth failed: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async storage(action, payload) {
    const result = await this.storageRaw(action, payload);
    assert(result.status >= 200 && result.status < 300, `[${this.name}] ${action} failed: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async storageRaw(action, payload) {
    return this.request('/api/storage', {
      method: 'POST',
      body: JSON.stringify(payload === undefined ? { action } : { action, payload }),
    });
  }

  async get(pathname) {
    const result = await this.request(pathname, { method: 'GET' });
    assert(result.status >= 200 && result.status < 300, `[${this.name}] GET ${pathname} failed: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async post(pathname, body) {
    const result = await this.request(pathname, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert(result.status >= 200 && result.status < 300, `[${this.name}] POST ${pathname} failed: ${JSON.stringify(result.data)}`);
    return result.data;
  }
}

const waitForServer = async (baseUrl, serverLogs) => {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.status === 200 || response.status === 204) {
        return;
      }
    } catch {
      // Retry until the dev server is ready.
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for wrangler pages dev.\n${serverLogs.join('')}`);
};

const getAvailablePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Failed to resolve an available port.'));
      return;
    }
    const { port } = address;
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(port);
    });
  });
});

const startServer = (persistDir, port) => {
  const logs = [];
  const wranglerPagesDev = createNodeToolCommand('wrangler', [
    'pages',
    'dev',
    'dist',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--persist-to',
    persistDir,
  ]);
  const child = spawn(wranglerPagesDev.command, wranglerPagesDev.args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  child.stdout.on('data', (chunk) => {
    logs.push(chunk.toString());
  });
  child.stderr.on('data', (chunk) => {
    logs.push(chunk.toString());
  });

  return { child, logs };
};

const stopChildProcess = async (child, graceMs = 2_000) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  const signalProcessTree = (signal) => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      child.kill(signal);
      return;
    }
    process.kill(-child.pid, signal);
  };

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      child.removeListener('close', onClose);
      resolve();
    };
    const onClose = () => finish();

    child.once('close', onClose);

    try {
      signalProcessTree('SIGTERM');
    } catch {
      finish();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          signalProcessTree('SIGKILL');
        } catch {
          // Ignore secondary termination failures; the close handler or final timer resolves.
        }
      }
    }, graceMs);
    forceKillTimer.unref?.();

    const settleTimer = setTimeout(() => finish(), graceMs + 1_000);
    settleTimer.unref?.();
  });
};

const importOfficialCatalog = async (admin, title, accessScope, catalogSource, wordCount = 2) => {
  const result = await admin.storage('batchImportWords', {
    defaultBookName: title,
    source: {
      kind: 'rows',
      rows: Array.from({ length: wordCount }, (_, index) => ({
        bookName: title,
        number: index + 1,
        word: `${title} word ${index + 1}`,
        definition: `${title} definition ${index + 1}`,
      })),
    },
    options: {
      accessScope,
      catalogSource,
    },
  });

  assert(result.importedBookCount === 1, `[admin] expected one imported book for ${title}`);
};

const executeLocalSql = async (persistDir, sql) => {
  const wranglerExecute = createNodeToolCommand('wrangler', [
    'd1',
    'execute',
    'medace-db',
    '--local',
    '--persist-to',
    persistDir,
    '--command',
    sql,
  ]);
  await runCommand(wranglerExecute.command, wranglerExecute.args);
};

const executeLocalSqlFile = async (persistDir, filePath) => {
  const wranglerExecute = createNodeToolCommand('wrangler', [
    'd1',
    'execute',
    'medace-db',
    '--local',
    '--persist-to',
    persistDir,
    '--file',
    filePath,
  ]);
  await runCommand(wranglerExecute.command, wranglerExecute.args);
};

const main = async () => {
  const persistDir = await mkdtemp(path.join(os.tmpdir(), 'medace-api-tests-'));
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let server;

  try {
    console.log('Applying local D1 migrations...');
    const wranglerMigrate = createNodeToolCommand('wrangler', [
      'd1',
      'migrations',
      'apply',
      'medace-db',
      '--local',
      '--persist-to',
      persistDir,
    ]);
    await runCommand(wranglerMigrate.command, wranglerMigrate.args);

    console.log('Starting local Pages Functions server...');
    server = startServer(persistDir, port);
    await waitForServer(baseUrl, server.logs);

    const publicMotivationResponse = await fetch(`${baseUrl}/api/public/motivation`);
    assert(publicMotivationResponse.status === 200, 'public motivation endpoint should be available without login');
    const publicMotivation = await publicMotivationResponse.json();
    assert(publicMotivation.snapshot?.scopes?.[0]?.scope === 'GLOBAL', 'public motivation endpoint should expose a global scope');
    assert(typeof publicMotivation.updatedAt === 'number', 'public motivation endpoint should include an updatedAt timestamp');

    const admin = new SessionClient(baseUrl, 'admin');
    const publicClient = new SessionClient(baseUrl, 'public');
    const freeStudent = new SessionClient(baseUrl, 'free-student');
    const orgStudent = new SessionClient(baseUrl, 'org-student');
    const cohortStudent = new SessionClient(baseUrl, 'cohort-student');
    const otherCohortStudent = new SessionClient(baseUrl, 'other-cohort-student');
    const groupAdmin = new SessionClient(baseUrl, 'group-admin');
    const instructor = new SessionClient(baseUrl, 'instructor');

    const adminUser = await admin.demoLogin('ADMIN', undefined, 'admin');
    assert(adminUser.role === 'ADMIN', 'admin session did not return an admin user');

    await importOfficialCatalog(admin, 'Starter 120', 'ALL_PLANS', 'STEADY_STUDY_ORIGINAL');
    await importOfficialCatalog(admin, 'Business 500', 'BUSINESS_ONLY', 'LICENSED_PARTNER');
    await importOfficialCatalog(admin, 'レベル1', 'ALL_PLANS', 'STEADY_STUDY_ORIGINAL', 10);
    await importOfficialCatalog(admin, 'レベル2', 'ALL_PLANS', 'STEADY_STUDY_ORIGINAL', 10);
    await importOfficialCatalog(admin, 'レベル3', 'ALL_PLANS', 'STEADY_STUDY_ORIGINAL', 10);
    await importOfficialCatalog(admin, 'レベル4', 'ALL_PLANS', 'STEADY_STUDY_ORIGINAL', 10);

    const freeStudentUser = await freeStudent.demoLogin('STUDENT');
    const freeBooks = await freeStudent.storage('getBooks');
    const freeBookTitles = freeBooks.map((book) => book.title);
    assert(freeBookTitles.includes('Starter 120'), 'free student should see ALL_PLANS official books');
    assert(!freeBookTitles.includes('Business 500'), 'free student should not see BUSINESS_ONLY official books');
    assert(freeBookTitles.includes('レベル3'), 'free student should see indexed level books for cold-start calibration');

    const updatedFreeProfile = await freeStudent.post('/api/profile', {
      user: {
        grade: 'JHS2',
        englishLevel: 'B2',
      },
    });
    assert(updatedFreeProfile.englishLevel === 'B2', 'profile update should persist the higher placement level');

    const coldStartWords = await freeStudent.storage('getDailySessionWords', { limit: 10 });
    const bandByBookId = new Map(freeBooks.map((book) => [book.id, getBookBandIndex(book.title)]));
    const coldStartBands = coldStartWords
      .map((word) => bandByBookId.get(word.bookId) || null)
      .filter((band) => band !== null);
    assert(coldStartBands.length > 0, 'cold-start session should include indexed books when level books are available');
    assert(coldStartBands.filter((band) => band === 3).length >= 5, 'cold-start session should center the target level band');
    assert(!coldStartBands.slice(0, 5).every((band) => band === 1), 'cold-start session should not open with only the easiest band');

    await freeStudent.storage('saveSRSHistory', {
      word: coldStartWords[0],
      rating: 2,
      responseTimeMs: 900,
    });
    const followUpWords = await freeStudent.storage('getDailySessionWords', { limit: 10 });
    assert(
      followUpWords.map((word) => word.id).join(',') !== coldStartWords.map((word) => word.id).join(','),
      'after a study history is created, daily session selection should leave cold-start calibration',
    );

    const orgStudentUser = await orgStudent.demoLogin('STUDENT', 'STUDENT');
    const cohortStudentUser = await cohortStudent.demoLogin('STUDENT', 'STUDENT');
    const otherCohortStudentUser = await otherCohortStudent.demoLogin('STUDENT', 'STUDENT');
    const groupAdminUser = await groupAdmin.demoLogin('INSTRUCTOR', 'GROUP_ADMIN');
    const instructorEmail = 'cohort-instructor@example.jp';
    const instructorSeedUser = await instructor.emailAuth({
      email: instructorEmail,
      password: 'integration-pass',
      isSignUp: true,
      role: 'STUDENT',
      displayName: 'Cohort Instructor',
    });
    const instructorCommercialRequest = await instructor.storage('submitCommercialRequest', {
      kind: 'BUSINESS_ROLE_CONVERSION',
      contactName: 'Cohort Instructor',
      contactEmail: instructorEmail,
      organizationName: groupAdminUser.organizationName,
      requestedWorkspaceRole: 'INSTRUCTOR',
      seatEstimate: '1-30名',
      message: 'cohort scope integration test instructor',
      source: 'DASHBOARD_ACCOUNT',
    });
    await admin.storage('updateCommercialRequest', {
      id: instructorCommercialRequest.id,
      status: 'PROVISIONED',
      resolutionNote: 'integration test instructor provisioning',
      linkedUserUid: instructorSeedUser.uid,
      targetSubscriptionPlan: 'TOB_PAID',
      targetOrganizationId: groupAdminUser.organizationId,
      targetOrganizationName: groupAdminUser.organizationName,
      targetOrganizationRole: 'INSTRUCTOR',
    });
    const instructorUser = await instructor.get('/api/session');
    assert(instructorUser.organizationRole === 'INSTRUCTOR', 'provisioned instructor should receive instructor organization role');
    assert(instructorUser.organizationId === groupAdminUser.organizationId, 'provisioned instructor should join the group admin organization');

    const publicCommercialEmail = 'phase4-public@example.jp';
    const anonymousBusinessTrial = await publicClient.request('/api/public/commercial-request', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'BUSINESS_TRIAL',
        contactName: 'Phase 4 Public Contact',
        contactEmail: publicCommercialEmail,
        organizationName: 'Phase 4 Academy',
        requestedWorkspaceRole: 'GROUP_ADMIN',
        seatEstimate: '31-100名',
        message: '学校導入の初回相談をしたいです。',
        source: 'PUBLIC_GUIDE',
      }),
    });
    assert(anonymousBusinessTrial.status === 200, 'anonymous commercial request should be accepted');

    const anonymousRoleConversion = await publicClient.request('/api/public/commercial-request', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'BUSINESS_ROLE_CONVERSION',
        contactName: 'Phase 4 Public Contact',
        contactEmail: publicCommercialEmail,
        organizationName: 'Phase 4 Academy',
        requestedWorkspaceRole: 'INSTRUCTOR',
        seatEstimate: '31-100名',
        message: '講師アカウントの切り替え相談です。',
        source: 'PUBLIC_GUIDE',
      }),
    });
    assert(anonymousRoleConversion.status === 200, 'second anonymous commercial request should be accepted when the kind differs');

    await executeLocalSql(
      persistDir,
      `UPDATE commercial_requests
          SET status = 'CANCELLED'
        WHERE normalized_contact_email = '${publicCommercialEmail}'
          AND kind = 'BUSINESS_TRIAL'`,
    );

    const anonymousBusinessTrialRetry = await publicClient.request('/api/public/commercial-request', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'BUSINESS_TRIAL',
        contactName: 'Phase 4 Public Contact',
        contactEmail: publicCommercialEmail,
        organizationName: 'Phase 4 Academy',
        requestedWorkspaceRole: 'GROUP_ADMIN',
        seatEstimate: '31-100名',
        message: '導入相談を再送します。',
        source: 'PUBLIC_GUIDE',
      }),
    });
    assert(anonymousBusinessTrialRetry.status === 200, 'anonymous commercial request should allow a retry after the open request is closed');

    const anonymousRateLimited = await publicClient.request('/api/public/commercial-request', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'PERSONAL_UPGRADE',
        contactName: 'Phase 4 Public Contact',
        contactEmail: publicCommercialEmail,
        message: '短時間送信のレート制限を確認します。',
        source: 'PUBLIC_GUIDE',
      }),
    });
    assert(anonymousRateLimited.status === 429, 'anonymous commercial request should enforce a short-term rate limit');

    const orgBooks = await orgStudent.storage('getBooks');
    const orgBookTitles = orgBooks.map((book) => book.title);
    assert(orgBookTitles.includes('Starter 120'), 'business student should see ALL_PLANS official books');
    assert(orgBookTitles.includes('Business 500'), 'business student should see BUSINESS_ONLY official books');

    const phrasebookImport = await orgStudent.storage('batchImportWords', {
      defaultBookName: 'Follow-up Drill',
      source: {
        kind: 'rows',
        rows: [
          { bookName: 'Follow-up Drill', number: 1, word: 'triage', definition: 'トリアージ' },
          { bookName: 'Follow-up Drill', number: 2, word: 'triage', definition: 'トリアージ' },
          { bookName: 'Follow-up Drill', number: 3, word: 'stabilize', definition: '安定させる' },
        ],
      },
    });
    assert(phrasebookImport.importedBookCount === 1, 'student phrasebook import should create one book');
    assert(phrasebookImport.importedWordCount === 2, 'duplicate phrasebook rows should be skipped');
    assert(phrasebookImport.skippedRowCount === 1, 'duplicate phrasebook rows should increment skippedRowCount');
    assert(
      phrasebookImport.warnings.some((warning) => warning.code === 'DUPLICATE_ROW'),
      'duplicate phrasebook rows should return a DUPLICATE_ROW warning',
    );

    const orgBooksAfterPhrasebook = await orgStudent.storage('getBooks');
    assert(
      orgBooksAfterPhrasebook.some((book) => book.title === 'Follow-up Drill'),
      'owner should see the imported phrasebook',
    );

    const freeBooksAfterPhrasebook = await freeStudent.storage('getBooks');
    assert(
      !freeBooksAfterPhrasebook.some((book) => book.title === 'Follow-up Drill'),
      'other students should not see another user\'s phrasebook',
    );

    const freeStudentCommercialRequest = await freeStudent.storage('submitCommercialRequest', {
      kind: 'PERSONAL_UPGRADE',
      contactName: freeStudentUser.displayName,
      contactEmail: freeStudentUser.email,
      message: '広告なしの個人利用と学校導入の違いを相談したいです。',
      source: 'DASHBOARD_ACCOUNT',
    });
    assert(freeStudentCommercialRequest.status === 'OPEN', 'logged-in student commercial request should start as OPEN');

    const freeStudentCommercialStatus = await freeStudent.storage('getCommercialRequestStatus');
    assert(
      freeStudentCommercialStatus.some((request) => request.id === freeStudentCommercialRequest.id),
      'logged-in student should see their submitted commercial request status',
    );

    const crossOrgAssignment = await groupAdmin.storageRaw('assignStudentInstructor', {
      studentUid: freeStudentUser.uid,
      instructorUid: groupAdminUser.uid,
    });
    assert(crossOrgAssignment.status === 403, 'group admin should not assign a student from another organization');

    await groupAdmin.storage('assignStudentInstructor', {
      studentUid: orgStudentUser.uid,
      instructorUid: groupAdminUser.uid,
    });

    const settingsAfterAssignment = await groupAdmin.storage('getOrganizationSettingsSnapshot');
    assert(settingsAfterAssignment.organizationId, 'organization settings should expose organizationId');
    assert(settingsAfterAssignment.members.some((member) => member.userUid === groupAdminUser.uid), 'organization settings should include the current group admin in the roster');
    assert(
      settingsAfterAssignment.auditEvents.some((event) => event.actionType === 'STUDENT_ASSIGNMENT_CHANGED'),
      'assignment changes should append an organization audit event',
    );

    const readingCohort = await groupAdmin.storage('upsertOrganizationCohort', {
      name: '読解クラス',
    });
    const reviewCohort = await groupAdmin.storage('upsertOrganizationCohort', {
      name: '復習クラス',
    });

    await groupAdmin.storage('setStudentCohort', {
      studentUid: cohortStudentUser.uid,
      cohortId: readingCohort.id,
    });
    await groupAdmin.storage('setStudentCohort', {
      studentUid: otherCohortStudentUser.uid,
      cohortId: reviewCohort.id,
    });
    await groupAdmin.storage('setStudentCohort', {
      studentUid: orgStudentUser.uid,
      cohortId: reviewCohort.id,
    });

    const instructorBeforeCohortAssignment = await instructor.storage('getAllStudentsProgress');
    assert(
      !instructorBeforeCohortAssignment.some((student) => student.uid === cohortStudentUser.uid),
      'instructor without cohort membership should not see unassigned cohort students',
    );

    const forbiddenWorksheetBeforeCohortAssignment = await instructor.storageRaw('getStudentWorksheetSnapshot', {
      studentUid: cohortStudentUser.uid,
    });
    assert(
      forbiddenWorksheetBeforeCohortAssignment.status === 403,
      'instructor without cohort membership should be blocked from worksheet access',
    );

    await groupAdmin.storage('setInstructorCohorts', {
      instructorUid: instructorUser.uid,
      cohortIds: [readingCohort.id],
    });

    const settingsAfterCohortUpdate = await groupAdmin.storage('getOrganizationSettingsSnapshot');
    assert(
      settingsAfterCohortUpdate.cohorts.some((cohort) => cohort.id === readingCohort.id && cohort.name === '読解クラス'),
      'settings snapshot should include saved cohorts',
    );
    assert(
      settingsAfterCohortUpdate.cohorts.some((cohort) => cohort.id === reviewCohort.id && cohort.name === '復習クラス'),
      'settings snapshot should include multiple cohorts',
    );
    assert(
      (settingsAfterCohortUpdate.instructorCohorts[instructorUser.uid] || []).includes(readingCohort.id),
      'settings snapshot should include instructor cohort memberships',
    );
    assert(
      settingsAfterCohortUpdate.auditEvents.some((event) => event.actionType === 'ORGANIZATION_COHORT_CREATED'),
      'cohort creation should append an organization audit event',
    );
    assert(
      settingsAfterCohortUpdate.auditEvents.some((event) => event.actionType === 'STUDENT_COHORT_CHANGED'),
      'student cohort changes should append an organization audit event',
    );
    assert(
      settingsAfterCohortUpdate.auditEvents.some((event) => event.actionType === 'INSTRUCTOR_COHORTS_CHANGED'),
      'instructor cohort changes should append an organization audit event',
    );

    const instructorAfterCohortAssignment = await instructor.storage('getAllStudentsProgress');
    assert(
      instructorAfterCohortAssignment.some((student) => (
        student.uid === cohortStudentUser.uid
        && student.cohortId === readingCohort.id
        && student.cohortName === '読解クラス'
      )),
      'same-cohort unassigned student should appear in instructor progress',
    );
    assert(
      !instructorAfterCohortAssignment.some((student) => student.uid === otherCohortStudentUser.uid),
      'other-cohort unassigned student should stay hidden from instructor progress',
    );

    const allowedWorksheet = await instructor.storage('getStudentWorksheetSnapshot', {
      studentUid: cohortStudentUser.uid,
    });
    assert(
      allowedWorksheet.studentUid === cohortStudentUser.uid,
      'same-cohort unassigned student should be visible for worksheet access',
    );

    const forbiddenOtherWorksheet = await instructor.storageRaw('getStudentWorksheetSnapshot', {
      studentUid: otherCohortStudentUser.uid,
    });
    assert(
      forbiddenOtherWorksheet.status === 403,
      'other-cohort unassigned student should be blocked from worksheet access',
    );

    const todayDateKey = toTokyoDateKey(Date.now());
    let orgSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    assert(Array.isArray(orgSnapshot.trend) && orgSnapshot.trend.length === 14, 'organization snapshot should expose a 14-day trend');
    const assignmentEvent = orgSnapshot.assignmentEvents.find((event) => (
      event.studentUid === orgStudentUser.uid && event.nextInstructorUid === groupAdminUser.uid
    ));
    assert(assignmentEvent, 'assignment event was not recorded for the reassignment');
    const assignedStudent = orgSnapshot.studentAssignments.find((student) => student.uid === orgStudentUser.uid);
    assert(assignedStudent?.cohortId === reviewCohort.id, 'student summary should expose cohortId after cohort assignment');
    assert(assignedStudent?.cohortName === '復習クラス', 'student summary should expose cohortName after cohort assignment');
    assert(assignedStudent?.assignmentUpdatedAt, 'assigned student summary should include assignmentUpdatedAt');
    assert(orgSnapshot.assignmentCoverageRate > 0, 'organization snapshot should expose a non-zero assignment coverage rate');
    const todayTrendAfterAssignment = findTrendPoint(orgSnapshot, todayDateKey);
    assert(todayTrendAfterAssignment?.assignedStudents >= 1, 'today trend should reflect assigned students after reassignment');

    const planCountBeforeSave = orgSnapshot.learningPlanCount;
    const todayPlanStudentsBeforeSave = todayTrendAfterAssignment?.planStudents || 0;

    await orgStudent.storage('saveLearningPlan', {
      plan: {
        uid: orgStudentUser.uid,
        createdAt: Date.now(),
        targetDate: '2026-04-15',
        goalDescription: '14日で基礎単語を安定させる',
        dailyWordGoal: 15,
        selectedBookIds: [orgBooks[0].id],
        status: 'ACTIVE',
      },
    });

    orgSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    const orgStudentAfterPlan = orgSnapshot.studentAssignments.find((student) => student.uid === orgStudentUser.uid);
    const todayTrendAfterPlan = findTrendPoint(orgSnapshot, todayDateKey);
    assert(orgStudentAfterPlan?.hasLearningPlan === true, 'saved learning plan should be reflected in the student summary');
    assert(orgSnapshot.planCoverageRate >= 0, 'organization snapshot should expose a plan coverage rate');
    assert((todayTrendAfterPlan?.planStudents || 0) >= todayPlanStudentsBeforeSave, 'today trend should keep or increase plan coverage after saving a plan');
    if (!assignedStudent?.hasLearningPlan) {
      assert(orgSnapshot.learningPlanCount > planCountBeforeSave, 'saving a plan should increase organization learning plan coverage for an unplanned student');
    }

    const worksheetSnapshot = await groupAdmin.storage('getStudentWorksheetSnapshot', {
      studentUid: orgStudentUser.uid,
    });
    assert(worksheetSnapshot.words.length > 0, 'assigned group admin should be able to open the student worksheet snapshot');

    const forbiddenWorksheet = await instructor.storageRaw('getStudentWorksheetSnapshot', {
      studentUid: orgStudentUser.uid,
    });
    assert(forbiddenWorksheet.status === 403, 'non-assigned instructor should be blocked from worksheet access');

    const forbiddenNotification = await instructor.storageRaw('sendInstructorNotification', {
      studentUid: orgStudentUser.uid,
      message: '担当外の通知テスト',
      triggerReason: 'integration-test',
      usedAi: false,
      interventionKind: 'REVIEW_RESTART',
    });
    assert(forbiddenNotification.status === 403, 'non-assigned instructor should be blocked from notifying the student');

    await groupAdmin.storage('sendInstructorNotification', {
      studentUid: orgStudentUser.uid,
      message: '48時間以内に5語だけ見直しましょう。',
      triggerReason: 'integration-test',
      usedAi: false,
      interventionKind: 'REVIEW_RESTART',
    });

    const settingsAfterNotification = await groupAdmin.storage('getOrganizationSettingsSnapshot');
    assert(
      settingsAfterNotification.auditEvents.some((event) => event.actionType === 'INSTRUCTOR_NOTIFICATION_SAVED'),
      'notification saves should append an organization audit event',
    );

    orgSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    const reactivated7dBeforeStudy = orgSnapshot.reactivatedStudents7d;
    const todayTrendAfterNotification = findTrendPoint(orgSnapshot, todayDateKey);
    assert(todayTrendAfterNotification?.notifications >= 1, 'today trend should reflect recent notifications');
    const orgStudentSummaryAfterNotification = orgSnapshot.studentAssignments.find((student) => student.uid === orgStudentUser.uid);
    assert(orgStudentSummaryAfterNotification?.latestInterventionKind === 'REVIEW_RESTART', 'student summary should retain the latest intervention kind');
    assert(orgStudentSummaryAfterNotification?.latestInterventionOutcome === 'PENDING', 'student summary should mark the latest intervention as pending before reactivation');

    const reviewBook = orgBooks.find((book) => book.title === 'Starter 120') || orgBooks[0];
    assert(reviewBook, 'business student did not receive any visible books');
    const reviewWords = await orgStudent.storage('getWordsByBook', { bookId: reviewBook.id });
    assert(reviewWords.length > 0, 'imported test catalog should contain at least one word');

    const weeklyMission = await groupAdmin.storage('createWeeklyMission', {
      learningTrack: 'EIKEN_2',
      title: 'Integration Weekly Mission',
      rationale: '今週の主課題を1本に絞って確認します。',
      bookId: reviewBook.id,
      bookTitle: reviewBook.title,
      newWordsTarget: 12,
      reviewWordsTarget: 6,
      quizTargetCount: 1,
    });
    assert(weeklyMission.learningTrack === 'EIKEN_2', 'weekly mission should persist the selected learning track');

    const forbiddenMissionAssignment = await groupAdmin.storageRaw('assignWeeklyMission', {
      missionId: weeklyMission.id,
      studentUid: freeStudentUser.uid,
    });
    assert(forbiddenMissionAssignment.status === 403, 'group admin should not assign a mission to a student in another organization');

    const assignedMission = await groupAdmin.storage('assignWeeklyMission', {
      missionId: weeklyMission.id,
      studentUid: orgStudentUser.uid,
    });
    assert(assignedMission.studentUid === orgStudentUser.uid, 'assigned mission should target the requested student');
    assert(assignedMission.progress.status === 'ASSIGNED', 'newly assigned missions should start as ASSIGNED');

    const missionBoardBeforeStudy = await orgStudent.storage('getWeeklyMissionBoard');
    assert(
      missionBoardBeforeStudy.assignments.some((assignment) => assignment.id === assignedMission.id),
      'student should receive the assigned weekly mission',
    );

    const forbiddenMissionUpdate = await freeStudent.storageRaw('updateMissionProgress', {
      assignmentId: assignedMission.id,
      eventType: 'OPENED',
    });
    assert(forbiddenMissionUpdate.status === 403, 'another student should not be able to update someone else\'s mission');

    const openedMission = await orgStudent.storage('updateMissionProgress', {
      assignmentId: assignedMission.id,
      eventType: 'OPENED',
    });
    assert(openedMission.progress.status === 'IN_PROGRESS', 'opening a mission should move it into IN_PROGRESS');

    const studentDashboardBeforeMissionStudy = await orgStudent.storage('getDashboardSnapshot');
    assert(studentDashboardBeforeMissionStudy.primaryMission?.assignmentId === assignedMission.id, 'student dashboard should expose the assigned primary mission');
    assert(
      !studentDashboardBeforeMissionStudy.weaknessProfile || studentDashboardBeforeMissionStudy.weaknessProfile.hasSufficientData === false,
      'new students should start without a populated weakness focus',
    );

    await orgStudent.storage('saveSRSHistory', {
      word: reviewWords[0],
      rating: 3,
      responseTimeMs: 1200,
    });

    orgSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    const todayTrendAfterStudy = findTrendPoint(orgSnapshot, todayDateKey);
    assert(orgSnapshot.reactivatedStudents7d >= 1, 'organization snapshot should count a student who resumed after notification');
    assert(orgSnapshot.reactivatedStudents7d >= reactivated7dBeforeStudy, 'study should keep or increase 7-day reactivation counts');
    assert((todayTrendAfterStudy?.reactivatedStudents || 0) >= (todayTrendAfterNotification?.reactivatedStudents || 0), 'today trend should keep or increase reactivation counts after study');
    assert(orgSnapshot.followUpCoverageRate48h >= 0, 'organization snapshot should expose 48-hour follow-up coverage');
    assert(orgSnapshot.trackCompletion.some((track) => track.track === 'EIKEN_2' && track.assignedCount >= 1), 'organization snapshot should aggregate weekly missions by track');
    assert(orgSnapshot.missionStartedRate >= 1, 'organization snapshot should expose a non-zero mission started rate after mission activity');

    const missionBoardAfterStudy = await orgStudent.storage('getWeeklyMissionBoard');
    const studiedMission = missionBoardAfterStudy.assignments.find((assignment) => assignment.id === assignedMission.id);
    assert(studiedMission, 'student mission board should keep the assigned mission after study');
    assert((studiedMission?.progress.newWordsCompleted || 0) >= 1, 'studying the mission book should advance mission new-word progress');

    const studentDashboardAfterMissionStudy = await orgStudent.storage('getDashboardSnapshot');
    assert(studentDashboardAfterMissionStudy.weaknessProfile?.signals?.length === 5, 'student dashboard should materialize weakness signals after study');

    const masteryBeforeQuiz = await orgStudent.storage('getMasteryDistribution');
    assert(masteryBeforeQuiz.total === 1, 'study history should create exactly one mastery row');
    assert(masteryBeforeQuiz.learning === 1, 'studied word should remain in learning after the first study rating');

    await orgStudent.storage('recordQuizAttempt', {
      wordId: reviewWords[0].id,
      bookId: reviewBook.id,
      correct: false,
      questionMode: 'JA_TO_EN',
      responseTimeMs: 850,
    });

    const masteryAfterQuiz = await orgStudent.storage('getMasteryDistribution');
    assert(masteryAfterQuiz.total === 1, 'quiz attempt on a studied word should not create an extra mastery row');
    assert(masteryAfterQuiz.learning === 1, 'quiz attempt should not downgrade the studied word mastery status');
    assert(masteryAfterQuiz.review === 0, 'quiz attempt should not move a studied word into review by itself');

    const progressBeforeQuizOnly = await orgStudent.storage('getBookProgress', { bookId: reviewBook.id });
    assert(progressBeforeQuizOnly.learnedCount === 1, 'study history should count toward book progress');

    await orgStudent.storage('recordQuizAttempt', {
      wordId: reviewWords[1].id,
      bookId: reviewBook.id,
      correct: false,
      questionMode: 'SPELLING_HINT',
      responseTimeMs: 900,
    });

    const progressAfterQuizOnly = await orgStudent.storage('getBookProgress', { bookId: reviewBook.id });
    assert(progressAfterQuizOnly.learnedCount === 1, 'quiz-only history must not inflate book progress');

    const dueCountAfterQuizOnly = await orgStudent.storage('getDueCount');
    assert(dueCountAfterQuizOnly === 0, 'quiz-only history must not create due reviews');

    const studiedWordIdsAfterQuizOnly = await orgStudent.storage('getStudiedWordIdsByBook', { bookId: reviewBook.id });
    assert(studiedWordIdsAfterQuizOnly.length === 1, 'learned-only quiz candidates should still come only from study history');
    assert(studiedWordIdsAfterQuizOnly[0] === reviewWords[0].id, 'quiz-only history should not enter learned-only eligibility');

    const worksheetAfterQuizOnly = await groupAdmin.storage('getStudentWorksheetSnapshot', {
      studentUid: orgStudentUser.uid,
    });
    assert(
      !worksheetAfterQuizOnly.words.some((word) => word.wordId === reviewWords[1].id),
      'quiz-only history should not appear in worksheet mastery output',
    );

    orgSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    const todayTrendAfterQuizOnly = findTrendPoint(orgSnapshot, todayDateKey);
    assert(orgSnapshot.notifications7d >= 1, 'organization snapshot should count recent notifications');
    assert(orgSnapshot.reactivatedStudents7d >= 1, 'organization snapshot should count a student who resumed after notification');
    assert(orgSnapshot.reactivationRate7d >= 1, 'organization snapshot should report a non-zero reactivation rate');
    assert((todayTrendAfterQuizOnly?.reactivatedStudents || 0) === (todayTrendAfterStudy?.reactivatedStudents || 0), 'quiz-only activity must not increase trend reactivation counts');
    assert((todayTrendAfterQuizOnly?.activeStudents || 0) === (todayTrendAfterStudy?.activeStudents || 0), 'quiz-only activity must not increase trend active counts');
    const orgStudentSummaryAfterQuiz = orgSnapshot.studentAssignments.find((student) => student.uid === orgStudentUser.uid);
    assert(orgStudentSummaryAfterQuiz?.totalLearned === 1, 'organization totalLearned should ignore quiz-only rows');
    assert(Boolean(orgStudentSummaryAfterQuiz?.weaknessProfileUpdatedAt), 'organization student summaries should expose weakness metadata');

    await executeLocalSql(
      persistDir,
      `UPDATE learning_histories SET interaction_source = NULL WHERE user_id = '${orgStudentUser.uid}' AND word_id = '${reviewWords[0].id}'`,
    );
    const studiedWordIdsWithoutSource = await orgStudent.storage('getStudiedWordIdsByBook', { bookId: reviewBook.id });
    assert(studiedWordIdsWithoutSource.length === 0, 'null interaction_source should drop mastery eligibility before backfill');

    await executeLocalSqlFile(persistDir, 'migrations/0011_backfill_learning_history_source.sql');
    const studiedWordIdsAfterBackfill = await orgStudent.storage('getStudiedWordIdsByBook', { bookId: reviewBook.id });
    assert(
      studiedWordIdsAfterBackfill.includes(reviewWords[0].id),
      'backfill migration should restore legacy study rows to mastery eligibility',
    );

    const writingTemplates = await groupAdmin.get('/api/writing/templates');
    assert(writingTemplates.templates.length >= 2, 'writing templates should be available');

    const hiddenGeneratedAssignment = await groupAdmin.post('/api/writing/assignments/generate', {
      studentUid: otherCohortStudentUser.uid,
      templateId: writingTemplates.templates[0].id,
      topicHint: 'cohort visibility',
      notes: 'hidden cohort writing assignment',
    });
    const hiddenIssuedAssignment = await groupAdmin.post('/api/writing/assignments/issue', {
      assignmentId: hiddenGeneratedAssignment.id,
    });
    assert(hiddenIssuedAssignment.status === 'ISSUED', 'hidden cohort writing assignment should move to ISSUED');

    const hiddenUpload = await otherCohortStudent.post('/api/writing/upload-url', {
      assignmentId: hiddenIssuedAssignment.id,
      fileName: 'cohort-hidden.png',
      mimeType: 'image/png',
      byteSize: 18,
      assetOrder: 1,
      attemptNo: 1,
    });
    const hiddenUploadResponse = await fetch(`${baseUrl}${hiddenUpload.uploadUrl}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.from('cohort-hidden-binary'),
    });
    assert(hiddenUploadResponse.status === 204, 'hidden cohort upload should succeed');

    const hiddenFinalize = await otherCohortStudent.post('/api/writing/submissions/finalize', {
      assignmentId: hiddenIssuedAssignment.id,
      source: 'STUDENT_MOBILE',
      assetIds: [hiddenUpload.assetId],
      attemptNo: 1,
    });
    const forbiddenWritingDetail = await instructor.request(`/api/writing/submissions/${hiddenFinalize.submission.id}`, { method: 'GET' });
    assert(
      forbiddenWritingDetail.status === 403,
      'instructor should be blocked from writing detail outside cohort scope',
    );

    await groupAdmin.storage('assignStudentInstructor', {
      studentUid: otherCohortStudentUser.uid,
      instructorUid: instructorUser.uid,
    });

    const instructorAfterDirectAssignment = await instructor.storage('getAllStudentsProgress');
    assert(
      instructorAfterDirectAssignment.some((student) => student.uid === otherCohortStudentUser.uid),
      'direct assignment should override cohort scope in instructor progress',
    );

    const directAssignmentWorksheet = await instructor.storage('getStudentWorksheetSnapshot', {
      studentUid: otherCohortStudentUser.uid,
    });
    assert(
      directAssignmentWorksheet.studentUid === otherCohortStudentUser.uid,
      'direct assignment should override cohort scope for worksheet access',
    );

    const allowedWritingDetail = await instructor.request(`/api/writing/submissions/${hiddenFinalize.submission.id}`, { method: 'GET' });
    assert(
      allowedWritingDetail.status === 200,
      'direct assignment should override cohort scope for writing detail',
    );

    const generatedAssignment = await groupAdmin.post('/api/writing/assignments/generate', {
      studentUid: orgStudentUser.uid,
      templateId: writingTemplates.templates[0].id,
      topicHint: 'school tablet use',
      notes: 'integration test assignment',
    });
    assert(generatedAssignment.status === 'DRAFT', 'generated writing assignment should start as DRAFT');

    const issuedAssignment = await groupAdmin.post('/api/writing/assignments/issue', {
      assignmentId: generatedAssignment.id,
    });
    assert(issuedAssignment.status === 'ISSUED', 'writing assignment should move to ISSUED');

    const studentAssignments = await orgStudent.get('/api/writing/assignments?scope=mine');
    const assignedWriting = studentAssignments.assignments.find((assignment) => assignment.id === issuedAssignment.id);
    assert(assignedWriting, 'student should receive the issued writing assignment');

    const firstUpload = await orgStudent.post('/api/writing/upload-url', {
      assignmentId: issuedAssignment.id,
      fileName: 'attempt-1.png',
      mimeType: 'image/png',
      byteSize: 16,
      assetOrder: 1,
      attemptNo: 1,
    });
    const firstUploadResponse = await fetch(`${baseUrl}${firstUpload.uploadUrl}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.from('fake-image-binary'),
    });
    assert(firstUploadResponse.status === 204, 'first writing upload should succeed');

    const firstFinalize = await orgStudent.post('/api/writing/submissions/finalize', {
      assignmentId: issuedAssignment.id,
      source: 'STUDENT_MOBILE',
      assetIds: [firstUpload.assetId],
      attemptNo: 1,
    });
    assert(firstFinalize.submission.evaluations.length === 3, 'writing submission should persist evaluations from 3 providers');
    assert(firstFinalize.submission.ocrProvider === 'OPENAI', 'writing OCR should rerun with OPENAI when fallback confidence is low');
    assert(firstFinalize.submission.ocrMeta?.mode === 'fixture', 'fixture mode should expose OCR provenance');
    assert(firstFinalize.submission.evaluations.every((evaluation) => evaluation.provenance?.mode), 'writing evaluations should expose provenance');

    const renamedSettings = await groupAdmin.storage('updateOrganizationProfile', {
      displayName: 'Phase 4 Academy Renamed',
    });
    assert(renamedSettings.displayName === 'Phase 4 Academy Renamed', 'group admin should be able to update the organization display name');
    assert(
      renamedSettings.auditEvents.some((event) => event.actionType === 'ORGANIZATION_RENAMED'),
      'organization rename should append an audit event',
    );

    const renamedSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    assert(renamedSnapshot.organizationName === 'Phase 4 Academy Renamed', 'dashboard should continue loading after organization rename');
    const renamedGroupAdminSession = await groupAdmin.get('/api/session');
    assert(renamedGroupAdminSession.organizationName === 'Phase 4 Academy Renamed', 'group admin session should reflect the renamed organization on reload');
    const renamedStudentSession = await orgStudent.get('/api/session');
    assert(renamedStudentSession.organizationName === 'Phase 4 Academy Renamed', 'student session should reflect the renamed organization on reload');
    const firstAssetUrl = firstFinalize.submission.assets[0]?.assetUrl;
    assert(firstAssetUrl, 'first writing submission should expose an uploaded asset URL');
    const firstAssetResponse = await orgStudent.request(firstAssetUrl, { method: 'GET' });
    assert(firstAssetResponse.status === 200, 'pre-rename writing assets should remain downloadable after organization rename');

    const forbiddenStudentDetail = await orgStudent.request(`/api/writing/submissions/${firstFinalize.submission.id}`, { method: 'GET' });
    assert(forbiddenStudentDetail.status === 403, 'student should not see feedback before teacher approval');

    const reviewQueue = await groupAdmin.get('/api/writing/review-queue?scope=QUEUE');
    const queueItem = reviewQueue.items.find((item) => item.assignmentId === issuedAssignment.id);
    assert(queueItem, 'writing submission should appear in the teacher review queue');

    const queueDetail = await groupAdmin.get(`/api/writing/submissions/${queueItem.submissionId}`);
    assert(queueDetail.submission.evaluations.length === 3, 'teacher detail should expose all provider evaluations');

    const revisionDecision = await groupAdmin.post(`/api/writing/submissions/${queueItem.submissionId}/request-revision`, {
      selectedEvaluationId: queueDetail.submission.selectedEvaluationId || queueDetail.submission.evaluations[0].id,
      publicComment: '理由のつながりを整えて、もう一度書き直しましょう。',
      privateMemo: 'integration test revision',
    });
    assert(revisionDecision.assignment.status === 'REVISION_REQUESTED', 'first review should be able to request a revision');

    const revisedAssignments = await orgStudent.get('/api/writing/assignments?scope=mine');
    const revisedAssignment = revisedAssignments.assignments.find((assignment) => assignment.id === issuedAssignment.id);
    assert(revisedAssignment?.status === 'REVISION_REQUESTED', 'student should see revision requested status after teacher review');

    const secondUpload = await orgStudent.post('/api/writing/upload-url', {
      assignmentId: issuedAssignment.id,
      fileName: 'attempt-2.png',
      mimeType: 'image/png',
      byteSize: 24,
      assetOrder: 1,
      attemptNo: 2,
    });
    const secondUploadResponse = await fetch(`${baseUrl}${secondUpload.uploadUrl}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.from('fake-image-binary-2'),
    });
    assert(secondUploadResponse.status === 204, 'second writing upload should succeed');

    const secondFinalize = await orgStudent.post('/api/writing/submissions/finalize', {
      assignmentId: issuedAssignment.id,
      source: 'STUDENT_MOBILE',
      assetIds: [secondUpload.assetId],
      attemptNo: 2,
      manualTranscript: 'I agree that students should use tablets in class because they can review lessons quickly and share ideas more easily. For example, they can check notes at home and ask better questions in class. However, teachers should give clear rules so students do not lose focus.',
    });
    assert(secondFinalize.submission.transcriptConfidence >= 0.9, 'manual transcript should produce high OCR confidence on the second attempt');
    assert(secondFinalize.submission.ocrMeta?.notes === 'manual-transcript', 'manual transcripts should be labeled in OCR provenance');

    const secondQueue = await groupAdmin.get('/api/writing/review-queue?scope=QUEUE');
    const secondQueueItem = secondQueue.items.find((item) => item.assignmentId === issuedAssignment.id);
    assert(secondQueueItem?.attemptNo === 2, 'second attempt should re-enter the teacher review queue');

    const secondDetail = await groupAdmin.get(`/api/writing/submissions/${secondQueueItem.submissionId}`);
    const finalReturn = await groupAdmin.post(`/api/writing/submissions/${secondQueueItem.submissionId}/approve-return`, {
      selectedEvaluationId: secondDetail.submission.selectedEvaluationId || secondDetail.submission.evaluations[0].id,
      publicComment: '構成が安定しました。次回は語彙の幅も意識しましょう。',
      privateMemo: 'integration test final return',
    });
    assert(finalReturn.assignment.status === 'COMPLETED', 'second approved return should complete the assignment');

    const finalAssignments = await orgStudent.get('/api/writing/assignments?scope=mine');
    const completedAssignment = finalAssignments.assignments.find((assignment) => assignment.id === issuedAssignment.id);
    assert(completedAssignment?.status === 'COMPLETED', 'student should see the writing assignment as completed');
    assert(completedAssignment?.latestSubmissionId, 'student should receive visible submission detail after teacher approval');

    const printableFeedback = await orgStudent.get(`/api/writing/submissions/${completedAssignment.latestSubmissionId}/printable-feedback`);
    assert(printableFeedback.html.includes('自由英作文返却'), 'printable feedback should contain the feedback HTML');

    const futureAnnouncement = await admin.storage('upsertProductAnnouncement', {
      title: '翌週公開の案内',
      body: 'まだ表示されない future announcement です。',
      severity: 'UPDATE',
      subscriptionPlans: ['TOC_FREE'],
      audienceRoles: ['STUDENT'],
      startsAt: Date.now() + 60 * 60 * 1000,
    });
    const hiddenAnnouncementFeed = await freeStudent.storage('listProductAnnouncements');
    assert(
      !hiddenAnnouncementFeed.announcements.some((announcement) => announcement.id === futureAnnouncement.id),
      'future announcement should stay hidden before its publish window starts',
    );

    const majorAnnouncement = await admin.storage('upsertProductAnnouncement', {
      title: 'Phase 4 major update',
      body: '学校導線とお知らせ機能を更新しました。',
      severity: 'MAJOR',
      subscriptionPlans: ['TOC_FREE'],
      audienceRoles: ['STUDENT'],
    });
    const majorAnnouncementFeed = await freeStudent.storage('listProductAnnouncements');
    assert(
      majorAnnouncementFeed.highestPriorityModal?.id === majorAnnouncement.id,
      'MAJOR announcement should appear as the highest-priority modal for an unseen target user',
    );
    await freeStudent.storage('markAnnouncementSeen', { announcementId: majorAnnouncement.id });
    const seenMajorFeed = await freeStudent.storage('listProductAnnouncements');
    assert(
      seenMajorFeed.highestPriorityModal?.id !== majorAnnouncement.id,
      'seen MAJOR announcement should not reopen the modal',
    );

    const criticalAnnouncement = await admin.storage('upsertProductAnnouncement', {
      title: 'Phase 4 critical notice',
      body: '重大なお知らせの確認導線を有効化しました。',
      severity: 'CRITICAL',
      subscriptionPlans: ['TOC_FREE'],
      audienceRoles: ['STUDENT'],
    });
    const criticalAnnouncementFeed = await freeStudent.storage('listProductAnnouncements');
    assert(
      criticalAnnouncementFeed.highestPriorityModal?.id === criticalAnnouncement.id,
      'CRITICAL announcement should take over the modal slot',
    );
    assert(
      criticalAnnouncementFeed.stickyBanner?.id === criticalAnnouncement.id,
      'CRITICAL announcement should also appear in the sticky banner',
    );
    await freeStudent.storage('acknowledgeAnnouncement', { announcementId: criticalAnnouncement.id });
    const acknowledgedCriticalFeed = await freeStudent.storage('listProductAnnouncements');
    assert(
      acknowledgedCriticalFeed.highestPriorityModal?.id !== criticalAnnouncement.id,
      'acknowledged CRITICAL announcement should not reopen the modal',
    );
    assert(
      acknowledgedCriticalFeed.stickyBanner?.id !== criticalAnnouncement.id,
      'acknowledged CRITICAL announcement should clear the sticky banner',
    );

    const adminCommercialQueue = await admin.storage('listCommercialRequests');
    assert(
      adminCommercialQueue.some((request) => request.id === freeStudentCommercialRequest.id),
      'admin should be able to see the logged-in user commercial request',
    );

    const provisionedCommercialRequest = await admin.storage('updateCommercialRequest', {
      id: freeStudentCommercialRequest.id,
      status: 'PROVISIONED',
      resolutionNote: '導入案内を送付し、組織アカウントへ反映しました。',
      linkedUserUid: freeStudentUser.uid,
      targetSubscriptionPlan: 'TOB_FREE',
      targetOrganizationName: 'Phase 4 Integration Academy',
      targetOrganizationRole: 'GROUP_ADMIN',
    });
    assert(provisionedCommercialRequest.status === 'PROVISIONED', 'admin should be able to provision a commercial request');

    const provisionedSession = await freeStudent.get('/api/session');
    assert(provisionedSession.subscriptionPlan === 'TOB_FREE', 'provisioned user should receive the target subscription plan');
    assert(provisionedSession.organizationName === 'Phase 4 Integration Academy', 'provisioned user should receive the target organization name');
    assert(provisionedSession.organizationRole === 'GROUP_ADMIN', 'provisioned user should receive the target organization role');
    assert(provisionedSession.role === 'INSTRUCTOR', 'GROUP_ADMIN provisioning should elevate the user to instructor role');
    assert(provisionedSession.organizationId, 'provisioned user should receive a concrete organizationId');

    const provisionedSettings = await freeStudent.storage('getOrganizationSettingsSnapshot');
    assert(
      provisionedSettings.auditEvents.some((event) => event.actionType === 'COMMERCIAL_PROVISIONED'),
      'commercial provisioning should append an organization audit event',
    );

    const groupAdminReset = await groupAdmin.storageRaw('resetAllData');
    assert(groupAdminReset.status === 403, 'group admin should not be allowed to reset all data');

    const adminReset = await admin.storageRaw('resetAllData');
    assert(adminReset.status === 204, 'admin reset should succeed');

    console.log('API integration tests passed.');
  } finally {
    if (server?.child) {
      await stopChildProcess(server.child);
    }
    await rm(persistDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
