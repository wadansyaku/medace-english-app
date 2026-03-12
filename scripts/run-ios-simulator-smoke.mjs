import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const cwd = process.cwd();
const args = process.argv.slice(2);

const readArg = (name, fallback) => {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
};

const hasFlag = (name) => args.includes(`--${name}`);

const smokePort = Number(readArg('port', '41731'));
const appiumPort = Number(readArg('appium-port', '4725'));
const deviceName = readArg('device-name', 'iPhone 15 Pro');
const platformVersion = readArg('platform-version', '17.5');
const udid = readArg('udid', 'A07DF556-5901-4F5E-87DA-3D9E7F833995');
const skipBuild = hasFlag('skip-build');
const appUrl = `http://127.0.0.1:${smokePort}/`;
const outputDir = path.join(cwd, 'output', 'simulator');
const screenshotPath = path.join(outputDir, 'ios-appium-study-flip.png');
const writingFeedbackScreenshotPath = path.join(outputDir, 'ios-appium-writing-feedback.png');
const appiumBaseUrl = `http://127.0.0.1:${appiumPort}`;

const managedChildren = [];

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const spawnCommand = (command, commandArgs, options = {}) => {
  const child = spawn(command, commandArgs, {
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      ...options.env,
    },
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
  return child;
};

const runCommand = (command, commandArgs, options = {}) => new Promise((resolve, reject) => {
  const child = spawnCommand(command, commandArgs, options);
  let stdout = '';
  let stderr = '';

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (options.printOutput) process.stdout.write(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (options.printOutput) process.stderr.write(chunk);
    });
  }

  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error(`${command} ${commandArgs.join(' ')} failed with code ${code}\n${stderr || stdout}`));
  });
});

const startManagedProcess = async (name, command, commandArgs, readyPattern) => {
  const child = spawnCommand(command, commandArgs);
  let logs = '';

  managedChildren.push(child);

  const ready = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const text = chunk.toString();
      logs += text;
      process.stdout.write(text);
      if (readyPattern.test(text)) {
        resolve();
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      reject(new Error(`${name} exited before becoming ready (code ${code ?? 'null'})\n${logs}`));
    });
  });

  await ready;
  return {
    child,
    getLogs: () => logs,
  };
};

const cleanup = async () => {
  await Promise.all(managedChildren.map((child) => new Promise((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    child.once('close', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 2000);
  })));
};

const webdriver = async (method, endpoint, body) => {
  const response = await fetch(`${appiumBaseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok || payload.value?.error) {
    throw new Error(`WebDriver request failed for ${method} ${endpoint}: ${raw}`);
  }
  return payload.value;
};

const execute = (sessionId, script, argsList = []) => webdriver('POST', `/session/${sessionId}/execute/sync`, {
  script,
  args: argsList,
});

const apiRequest = (sessionId, method, pathname, body = null, headers = {}) => execute(sessionId, `
  const [requestMethod, requestPath, requestBody, requestHeaders] = arguments;
  const xhr = new XMLHttpRequest();
  xhr.open(requestMethod, requestPath, false);
  const headersToApply = requestHeaders || {};
  Object.entries(headersToApply).forEach(([key, value]) => {
    xhr.setRequestHeader(key, value);
  });
  if (requestBody !== null && !headersToApply['Content-Type']) {
    xhr.setRequestHeader('Content-Type', 'application/json');
  }
  const payload = requestBody === null
    ? null
    : (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody));
  xhr.send(payload);

  let data = null;
  try {
    data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
  } catch (error) {
    data = xhr.responseText;
  }

  return {
    ok: xhr.status >= 200 && xhr.status < 300,
    httpStatus: xhr.status,
    data,
  };
`, [method, pathname, body, headers]);

const extractSessionCookie = (response) => {
  const setCookieHeader = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()[0]
    : response.headers.get('set-cookie');
  if (!setCookieHeader) return null;
  return setCookieHeader.split(';')[0] || null;
};

const serverRequest = async (method, pathname, body = null, { cookie, headers = {} } = {}) => {
  const nextHeaders = {
    ...headers,
  };
  if (cookie) nextHeaders.Cookie = cookie;
  if (body !== null && !nextHeaders['Content-Type']) {
    nextHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(new URL(pathname, appUrl), {
    method,
    headers: nextHeaders,
    body: body === null
      ? undefined
      : typeof body === 'string'
      ? body
      : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (error) {
    data = raw;
  }

  return {
    ok: response.ok,
    httpStatus: response.status,
    data,
    sessionCookie: extractSessionCookie(response),
  };
};

const waitFor = async (label, predicate, timeoutMs = 20000, intervalMs = 250) => {
  const startedAt = Date.now();
  let lastValue = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastValue = await predicate();
      if (lastValue) return lastValue;
    } catch (error) {
      lastValue = String(error);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
};

const isVisibleByTestId = (sessionId, testId) => execute(sessionId, `
  const target = arguments[0];
  const element = document.querySelector(\`[data-testid="\${target}"]\`);
  if (!element) return null;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
    ariaHidden: element.getAttribute('aria-hidden'),
    text: element.textContent || '',
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
  };
`, [testId]);

const clickByTestId = async (sessionId, testId) => {
  const clicked = await execute(sessionId, `
    const target = arguments[0];
    const element = document.querySelector(\`[data-testid="\${target}"]\`);
    if (!element) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
    return true;
  `, [testId]);

  if (!clicked) {
    throw new Error(`Could not find element with data-testid="${testId}"`);
  }
};

const clickFirstBySelector = async (sessionId, selector) => {
  const clicked = await execute(sessionId, `
    const target = arguments[0];
    const element = document.querySelector(target);
    if (!element) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
    return true;
  `, [selector]);

  if (!clicked) {
    throw new Error(`Could not find element matching selector "${selector}"`);
  }
};

const clickVisibleButtonContaining = async (sessionId, label) => {
  const clicked = await execute(sessionId, `
    const target = arguments[0];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const candidate = buttons.find((button) => {
      const text = (button.innerText || button.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text.includes(target)) return false;
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (!candidate) return false;
    candidate.scrollIntoView({ block: 'center', inline: 'center' });
    candidate.click();
    return true;
  `, [label]);

  if (!clicked) {
    throw new Error(`Could not find visible button containing "${label}"`);
  }
};

const waitForVisibleText = async (sessionId, text, timeoutMs = 12000) => waitFor(
  `visible text "${text}"`,
  async () => {
    const result = await execute(sessionId, `
      const target = arguments[0];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const element = walker.currentNode;
        const content = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!content.includes(target)) continue;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
          return {
            text: content,
            top: rect.top,
            bottom: rect.bottom,
          };
        }
      }
      return null;
    `, [text]);
    return result || null;
  },
  timeoutMs,
);

const setFileInputByTestId = async (sessionId, testId, fileName, mimeType, contents) => {
  const updated = await execute(sessionId, `
    const [target, nextFileName, nextMimeType, fileContents] = arguments;
    const input = document.querySelector(\`[data-testid="\${target}"]\`);
    if (!(input instanceof HTMLInputElement)) return false;
    const transfer = new DataTransfer();
    transfer.items.add(new File([fileContents], nextFileName, { type: nextMimeType }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files?.length || 0;
  `, [testId, fileName, mimeType, contents]);

  if (!updated) {
    throw new Error(`Could not set files for ${testId}`);
  }
};

const setTextareaByPlaceholder = async (sessionId, placeholder, value) => {
  const updated = await execute(sessionId, `
    const [targetPlaceholder, nextValue] = arguments;
    const element = Array.from(document.querySelectorAll('textarea')).find((candidate) => candidate.getAttribute('placeholder') === targetPlaceholder);
    if (!(element instanceof HTMLTextAreaElement)) return false;
    element.value = nextValue;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `, [placeholder, value]);

  if (!updated) {
    throw new Error(`Could not set textarea with placeholder "${placeholder}"`);
  }
};

const loginDemoViaApi = async (sessionId, role, organizationRole) => {
  const response = await apiRequest(sessionId, 'POST', '/api/auth', {
    action: 'demo-login',
    role,
    organizationRole,
  });

  if (!response.ok) {
    throw new Error(`Demo login failed: ${JSON.stringify(response)}`);
  }
};

const createServerSession = async (role, organizationRole) => {
  const response = await serverRequest('POST', '/api/auth', {
    action: 'demo-login',
    role,
    organizationRole,
  });

  if (!response.ok || !response.sessionCookie) {
    throw new Error(`Server demo login failed: ${JSON.stringify(response)}`);
  }

  return {
    cookie: response.sessionCookie,
    user: response.data,
  };
};

const getSessionUser = async (sessionId) => {
  const response = await apiRequest(sessionId, 'GET', '/api/session');
  if (!response.ok || !response.data) {
    throw new Error(`Could not retrieve session user: ${JSON.stringify(response)}`);
  }
  return response.data;
};

const waitForEither = async (sessionId, testIds, timeoutMs = 12000) => waitFor(
  testIds.join(' or '),
  async () => {
    for (const testId of testIds) {
      const state = await isVisibleByTestId(sessionId, testId);
      if (state?.visible) {
        return testId;
      }
    }
    return null;
  },
  timeoutMs,
);

const maybeCompleteOnboarding = async (sessionId) => {
  const landingState = await waitForEither(sessionId, ['student-dashboard', 'onboarding-profile'], 12000);
  if (landingState === 'student-dashboard') return;

  await clickVisibleButtonContaining(sessionId, '中学3年生');
  await clickVisibleButtonContaining(sessionId, '学校英語はだいたい分かる');
  await clickVisibleButtonContaining(sessionId, '診断を始める');

  await waitFor('diagnostic test', async () => {
    const state = await isVisibleByTestId(sessionId, 'onboarding-test');
    return state?.visible ? state : null;
  });

  for (let index = 0; index < 12; index += 1) {
    await clickByTestId(sessionId, 'diagnostic-option');
    await sleep(150);
    if (index === 11) {
      await clickVisibleButtonContaining(sessionId, '判定を見る');
    } else {
      await clickVisibleButtonContaining(sessionId, '次へ');
    }
  }

  await waitFor('onboarding result', async () => {
    const state = await isVisibleByTestId(sessionId, 'onboarding-result');
    return state?.visible ? state : null;
  });

  await clickVisibleButtonContaining(sessionId, 'このレベルで学習を始める');
};

const verifyPrimaryCta = async (sessionId) => {
  const result = await waitFor('mobile primary CTA in viewport', () => execute(sessionId, `
    const target = document.querySelector('[data-testid="student-hero-primary-cta"]');
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return {
      text: (target.innerText || target.textContent || '').trim(),
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      insideViewport: rect.bottom <= window.innerHeight,
    };
  `), 12000);

  if (!result.insideViewport) {
    throw new Error(`Primary CTA fell below the first viewport: ${JSON.stringify(result)}`);
  }

  return result;
};

const seedPhrasebook = async (sessionId, title) => {
  const response = await execute(sessionId, `
    const bookTitle = arguments[0];
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/storage', false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({
      action: 'batchImportWords',
      payload: {
        defaultBookName: bookTitle,
        source: {
          kind: 'rows',
          rows: [
            { bookName: bookTitle, number: 1, word: 'triage', definition: 'トリアージ' },
            { bookName: bookTitle, number: 2, word: 'stabilize', definition: '安定させる' },
          ],
        },
      },
    }));

    let data = null;
    try {
      data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch (error) {
      data = { parseError: String(error), raw: xhr.responseText };
    }

    return {
      ok: xhr.status >= 200 && xhr.status < 300,
      httpStatus: xhr.status,
      data,
    };
  `, [title]);

  if (!response.ok) {
    throw new Error(`Failed to seed phrasebook: ${JSON.stringify(response)}`);
  }

  return response.data;
};

const seedReturnedWritingFeedback = async (adminCookie, studentUid) => {
  const templatesResponse = await serverRequest('GET', '/api/writing/templates', null, {
    cookie: adminCookie,
  });
  const templateId = templatesResponse.data?.templates?.[0]?.id;
  if (!templatesResponse.ok || !templateId) {
    throw new Error(`Could not load writing templates: ${JSON.stringify(templatesResponse)}`);
  }

  const generated = await serverRequest('POST', '/api/writing/assignments/generate', {
    studentUid,
    templateId,
    topicHint: 'tablets for classroom learning',
  }, {
    cookie: adminCookie,
  });
  const assignmentId = generated.data?.id;
  if (!generated.ok || !assignmentId) {
    throw new Error(`Could not generate assignment: ${JSON.stringify(generated)}`);
  }

  const issued = await serverRequest('POST', '/api/writing/assignments/issue', { assignmentId }, {
    cookie: adminCookie,
  });
  if (!issued.ok) {
    throw new Error(`Could not issue assignment: ${JSON.stringify(issued)}`);
  }

  return assignmentId;
};

const submitBusinessWritingAttempt = async (sessionId, assignmentId) => {
  await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
  await maybeCompleteOnboarding(sessionId);

  await waitFor('business student writing section', async () => {
    const state = await isVisibleByTestId(sessionId, 'writing-student-section');
    return state?.visible ? state : null;
  }, 20000);

  await clickFirstBySelector(sessionId, `[data-testid="writing-open-submit-${assignmentId}"]`);
  await waitForVisibleText(sessionId, 'ファイル選択へ進む');
  await clickVisibleButtonContaining(sessionId, 'ファイル選択へ進む');
  await waitFor('writing file input', async () => {
    const state = await isVisibleByTestId(sessionId, 'writing-student-file-input');
    return state?.visible ? state : null;
  });
  await setFileInputByTestId(sessionId, 'writing-student-file-input', 'ios-writing-attempt.png', 'image/png', 'ios simulator writing attempt');
  await clickVisibleButtonContaining(sessionId, '最終送信へ進む');
  await setTextareaByPlaceholder(
    sessionId,
    'OCR が読み取りにくいときのために、書いた英文をおおまかに入力できます。',
    'Students should use tablets because they can review lessons quickly and share notes with classmates after class.',
  );
  await clickByTestId(sessionId, 'writing-submit-upload');
  await waitForVisibleText(sessionId, '答案を提出しました');

  const latestAssignment = await waitFor('submitted writing assignment status', async () => {
    const response = await apiRequest(sessionId, 'GET', '/api/writing/assignments?scope=mine');
    if (!response.ok) return null;
    return response.data?.assignments?.find((assignment) => (
      assignment.id === assignmentId
      && ['SUBMITTED', 'REVIEW_READY', 'RETURNED', 'REVISION_REQUESTED', 'COMPLETED'].includes(assignment.status)
    )) || null;
  }, 20000);

  return latestAssignment.id;
};

const findReviewQueueSubmissionId = async (adminCookie, assignmentId) => waitFor('review queue submission id', async () => {
  const response = await serverRequest('GET', '/api/writing/review-queue?scope=QUEUE', null, {
    cookie: adminCookie,
  });
  if (!response.ok) return null;
  const queueItem = response.data?.items?.find((item) => item.assignmentId === assignmentId);
  return queueItem?.submissionId || null;
}, 20000);

const waitForReturnedAssignment = async (sessionId, assignmentId) => waitFor('returned writing assignment', async () => {
  const response = await apiRequest(sessionId, 'GET', '/api/writing/assignments?scope=mine');
  if (!response.ok) return null;
  const assignment = response.data?.assignments?.find((item) => item.id === assignmentId);
  if (!assignment?.latestSubmissionId) return null;
  if (!['RETURNED', 'REVISION_REQUESTED', 'COMPLETED'].includes(assignment.status)) return null;
  return assignment;
}, 20000);

const approveReturnedWritingFeedback = async (adminCookie, submissionId) => {
  const detail = await serverRequest('GET', `/api/writing/submissions/${submissionId}`, null, {
    cookie: adminCookie,
  });
  const selectedEvaluationId = detail.data?.submission?.evaluations?.[0]?.id;
  if (!detail.ok || !selectedEvaluationId) {
    throw new Error(`Could not load submission detail: ${JSON.stringify(detail)}`);
  }

  const approved = await serverRequest('POST', `/api/writing/submissions/${submissionId}/approve-return`, {
    selectedEvaluationId,
    publicComment: '理由の流れは伝わっています。次は語彙の選び方をもう一段広げましょう。',
  }, {
    cookie: adminCookie,
  });
  if (!approved.ok) {
    throw new Error(`Could not approve returned writing feedback: ${JSON.stringify(approved)}`);
  }
};

const verifyBusinessFeedbackView = async (sessionId, assignmentId) => {
  await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
  await maybeCompleteOnboarding(sessionId);

  await waitFor('business student feedback button', async () => {
    const state = await execute(sessionId, `
      const assignmentId = arguments[0];
      const button = document.querySelector(\`[data-testid="writing-open-feedback-\${assignmentId}"]\`);
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { top: rect.top, bottom: rect.bottom } : null;
    `, [assignmentId]);
    return state;
  }, 20000);

  await clickFirstBySelector(sessionId, `[data-testid="writing-open-feedback-${assignmentId}"]`);
  await waitFor('writing feedback mobile view', async () => {
    const state = await isVisibleByTestId(sessionId, 'writing-feedback-mobile-view');
    return state?.visible ? state : null;
  }, 15000);

  const sectionOrder = await execute(sessionId, `
    const selectors = [
      'writing-feedback-comment',
      'writing-feedback-strengths',
      'writing-feedback-improvements',
      'writing-feedback-corrected',
      'writing-feedback-transcript',
      'writing-feedback-assets',
    ];
    return selectors.map((selector) => {
      const element = document.querySelector(\`[data-testid="\${selector}"]\`);
      if (!element) return { selector, top: null };
      return { selector, top: element.getBoundingClientRect().top };
    });
  `);
  const validTops = sectionOrder.map((item) => item.top).filter((value) => typeof value === 'number');
  if (validTops.length !== 6 || validTops.some((value, index) => index > 0 && value < validTops[index - 1])) {
    throw new Error(`Writing feedback sections were not laid out in a single column: ${JSON.stringify(sectionOrder)}`);
  }

  await runCommand('xcrun', ['simctl', 'io', 'booted', 'screenshot', writingFeedbackScreenshotPath]);
  console.log(`Saved simulator screenshot: ${writingFeedbackScreenshotPath}`);
};

const runFlow = async (sessionId) => {
  await waitFor('home screen', async () => {
    const state = await isVisibleByTestId(sessionId, 'demo-login-student');
    return state?.visible ? state : null;
  }, 20000);

  await clickByTestId(sessionId, 'demo-login-student');
  await maybeCompleteOnboarding(sessionId);

  await waitFor('student dashboard', async () => {
    const state = await isVisibleByTestId(sessionId, 'student-dashboard');
    return state?.visible ? state : null;
  }, 20000);
  await waitFor('mobile demo banner toggle', async () => {
    const state = await isVisibleByTestId(sessionId, 'demo-banner-toggle');
    return state?.visible ? state : null;
  }, 12000);

  const ctaMetrics = await verifyPrimaryCta(sessionId);
  console.log(`Verified primary CTA in first viewport: ${ctaMetrics.text}`);

  const importResult = await seedPhrasebook(sessionId, 'iOS Appium Mobile Drill');
  const bookId = importResult.importedBookIds?.[0];
  if (!bookId) {
    throw new Error(`Seeded phrasebook did not return a book id: ${JSON.stringify(importResult)}`);
  }

  await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
  await waitFor('student dashboard after reload', async () => {
    const state = await isVisibleByTestId(sessionId, 'student-dashboard');
    return state?.visible ? state : null;
  }, 20000);

  await clickByTestId(sessionId, `book-study-${bookId}`);
  await waitFor('study card front', async () => {
    const state = await isVisibleByTestId(sessionId, 'study-card-front');
    return state?.visible && state.ariaHidden !== 'true' ? state : null;
  }, 15000);

  await clickByTestId(sessionId, 'study-flip-button');
  await waitFor('study card back', async () => {
    const state = await isVisibleByTestId(sessionId, 'study-card-back');
    if (!state?.visible) return null;
    return state.ariaHidden === 'false' ? state : null;
  }, 15000);

  await waitFor('rating buttons', async () => {
    const state = await isVisibleByTestId(sessionId, 'study-rate-0');
    return state?.visible ? state : null;
  }, 15000);

  await execute(sessionId, `
    const element = document.querySelector('[data-testid="study-card-back"]');
    if (element) {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    return Boolean(element);
  `);
  await sleep(400);
  await runCommand('xcrun', ['simctl', 'io', 'booted', 'screenshot', screenshotPath]);
  console.log(`Saved simulator screenshot: ${screenshotPath}`);

  await loginDemoViaApi(sessionId, 'STUDENT', 'STUDENT');
  await webdriver('POST', `/session/${sessionId}/url`, { url: appUrl });
  await maybeCompleteOnboarding(sessionId);
  const businessStudentSession = await getSessionUser(sessionId);
  const adminSession = await createServerSession('INSTRUCTOR', 'GROUP_ADMIN');
  const assignmentId = await seedReturnedWritingFeedback(adminSession.cookie, businessStudentSession.uid);
  await submitBusinessWritingAttempt(sessionId, assignmentId);
  const submissionId = await findReviewQueueSubmissionId(adminSession.cookie, assignmentId);
  await approveReturnedWritingFeedback(adminSession.cookie, submissionId);
  await waitForReturnedAssignment(sessionId, assignmentId);
  await verifyBusinessFeedbackView(sessionId, assignmentId);
};

const ensureXcuitestDriver = async () => {
  const { stdout, stderr } = await runCommand('npx', ['--yes', 'appium', 'driver', 'list', '--installed']);
  const inventory = `${stdout}\n${stderr}`;
  if (inventory.includes('xcuitest')) return;

  console.log('Installing Appium XCUITest driver...');
  await runCommand('npx', ['--yes', 'appium', 'driver', 'install', 'xcuitest'], { printOutput: true });
};

const main = async () => {
  await mkdir(outputDir, { recursive: true });

  if (!skipBuild) {
    console.log('Building app...');
    await runCommand('npm', ['run', 'build'], { printOutput: true });
  }

  await ensureXcuitestDriver();

  console.log(`Booting simulator ${deviceName} (${platformVersion})...`);
  await runCommand('xcrun', ['simctl', 'boot', udid]).catch((error) => {
    if (!String(error).includes('Unable to boot device in current state: Booted')) {
      throw error;
    }
  });
  await runCommand('xcrun', ['simctl', 'bootstatus', udid, '-b']);
  await runCommand('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]);

  const smokeServer = await startManagedProcess(
    'wrangler-pages-dev',
    'node',
    ['scripts/start-smoke-server.mjs', '--port', String(smokePort)],
    new RegExp(`Ready on http://127\\.0\\.0\\.1:${smokePort}`),
  );
  const appiumServer = await startManagedProcess(
    'appium',
    'npx',
    ['--yes', 'appium', '--port', String(appiumPort), '--log-no-colors'],
    /Appium REST http interface listener started on/,
  );

  let sessionId = null;

  try {
    const session = await webdriver('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          platformName: 'iOS',
          browserName: 'Safari',
          'appium:automationName': 'XCUITest',
          'appium:deviceName': deviceName,
          'appium:platformVersion': platformVersion,
          'appium:udid': udid,
          'appium:newCommandTimeout': 240,
          'appium:connectHardwareKeyboard': false,
          'appium:autoWebview': true,
          'appium:safariInitialUrl': appUrl,
        },
        firstMatch: [{}],
      },
    });
    sessionId = session.sessionId;
    console.log(`Created Appium Safari session: ${sessionId}`);
    await webdriver('POST', `/session/${sessionId}/timeouts`, {
      script: 30000,
      pageLoad: 300000,
      implicit: 0,
    });

    await runFlow(sessionId);
    console.log('iOS simulator smoke completed successfully.');
    console.log(`Smoke server logs captured: ${smokeServer.getLogs().split('\n').length} lines`);
    console.log(`Appium logs captured: ${appiumServer.getLogs().split('\n').length} lines`);
  } finally {
    if (sessionId) {
      await webdriver('DELETE', `/session/${sessionId}`).catch(() => {});
    }
    await cleanup();
  }
};

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
