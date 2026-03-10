import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = process.cwd();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

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
  const child = spawn('npx', [
    'wrangler',
    'pages',
    'dev',
    'dist',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--persist-to',
    persistDir,
  ], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    logs.push(chunk.toString());
  });
  child.stderr.on('data', (chunk) => {
    logs.push(chunk.toString());
  });

  return { child, logs };
};

const importOfficialCatalog = async (admin, title, accessScope, catalogSource) => {
  const result = await admin.storage('batchImportWords', {
    defaultBookName: title,
    source: {
      kind: 'rows',
      rows: [
        { bookName: title, number: 1, word: `${title} alpha`, definition: 'alpha definition' },
        { bookName: title, number: 2, word: `${title} beta`, definition: 'beta definition' },
      ],
    },
    options: {
      accessScope,
      catalogSource,
    },
  });

  assert(result.importedBookCount === 1, `[admin] expected one imported book for ${title}`);
};

const main = async () => {
  const persistDir = await mkdtemp(path.join(os.tmpdir(), 'medace-api-tests-'));
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let server;

  try {
    console.log('Applying local D1 migrations...');
    await runCommand('npx', [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'medace-db',
      '--local',
      '--persist-to',
      persistDir,
    ]);

    console.log('Starting local Pages Functions server...');
    server = startServer(persistDir, port);
    await waitForServer(baseUrl, server.logs);

    const admin = new SessionClient(baseUrl, 'admin');
    const freeStudent = new SessionClient(baseUrl, 'free-student');
    const orgStudent = new SessionClient(baseUrl, 'org-student');
    const groupAdmin = new SessionClient(baseUrl, 'group-admin');
    const instructor = new SessionClient(baseUrl, 'instructor');

    const adminUser = await admin.demoLogin('ADMIN', undefined, 'admin');
    assert(adminUser.role === 'ADMIN', 'admin session did not return an admin user');

    await importOfficialCatalog(admin, 'Starter 120', 'ALL_PLANS', 'STEADY_STUDY_ORIGINAL');
    await importOfficialCatalog(admin, 'Business 500', 'BUSINESS_ONLY', 'LICENSED_PARTNER');

    const freeStudentUser = await freeStudent.demoLogin('STUDENT');
    const freeBooks = await freeStudent.storage('getBooks');
    const freeBookTitles = freeBooks.map((book) => book.title);
    assert(freeBookTitles.includes('Starter 120'), 'free student should see ALL_PLANS official books');
    assert(!freeBookTitles.includes('Business 500'), 'free student should not see BUSINESS_ONLY official books');

    const orgStudentUser = await orgStudent.demoLogin('STUDENT', 'STUDENT');
    const groupAdminUser = await groupAdmin.demoLogin('INSTRUCTOR', 'GROUP_ADMIN');
    await instructor.demoLogin('INSTRUCTOR');

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

    const crossOrgAssignment = await groupAdmin.storageRaw('assignStudentInstructor', {
      studentUid: freeStudentUser.uid,
      instructorUid: groupAdminUser.uid,
    });
    assert(crossOrgAssignment.status === 403, 'group admin should not assign a student from another organization');

    await groupAdmin.storage('assignStudentInstructor', {
      studentUid: orgStudentUser.uid,
      instructorUid: groupAdminUser.uid,
    });

    let orgSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    const assignmentEvent = orgSnapshot.assignmentEvents.find((event) => (
      event.studentUid === orgStudentUser.uid && event.nextInstructorUid === groupAdminUser.uid
    ));
    assert(assignmentEvent, 'assignment event was not recorded for the reassignment');
    const assignedStudent = orgSnapshot.studentAssignments.find((student) => student.uid === orgStudentUser.uid);
    assert(assignedStudent?.assignmentUpdatedAt, 'assigned student summary should include assignmentUpdatedAt');
    assert(orgSnapshot.assignmentCoverageRate > 0, 'organization snapshot should expose a non-zero assignment coverage rate');

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
    });
    assert(forbiddenNotification.status === 403, 'non-assigned instructor should be blocked from notifying the student');

    await groupAdmin.storage('sendInstructorNotification', {
      studentUid: orgStudentUser.uid,
      message: '48時間以内に5語だけ見直しましょう。',
      triggerReason: 'integration-test',
      usedAi: false,
    });

    const reviewBook = orgBooks.find((book) => book.title === 'Starter 120') || orgBooks[0];
    assert(reviewBook, 'business student did not receive any visible books');
    const reviewWords = await orgStudent.storage('getWordsByBook', { bookId: reviewBook.id });
    assert(reviewWords.length > 0, 'imported test catalog should contain at least one word');

    await orgStudent.storage('saveSRSHistory', {
      word: reviewWords[0],
      rating: 3,
      responseTimeMs: 1200,
    });

    orgSnapshot = await groupAdmin.storage('getOrganizationDashboardSnapshot');
    assert(orgSnapshot.notifications7d >= 1, 'organization snapshot should count recent notifications');
    assert(orgSnapshot.reactivatedStudents7d >= 1, 'organization snapshot should count a student who resumed after notification');
    assert(orgSnapshot.reactivationRate7d >= 1, 'organization snapshot should report a non-zero reactivation rate');

    const groupAdminReset = await groupAdmin.storageRaw('resetAllData');
    assert(groupAdminReset.status === 403, 'group admin should not be allowed to reset all data');

    const adminReset = await admin.storageRaw('resetAllData');
    assert(adminReset.status === 204, 'admin reset should succeed');

    console.log('API integration tests passed.');
  } finally {
    if (server?.child) {
      server.child.kill('SIGTERM');
      await delay(1_000);
      if (!server.child.killed) {
        server.child.kill('SIGKILL');
      }
    }
    await rm(persistDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
