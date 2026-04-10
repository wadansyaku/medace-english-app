import { expect, type Page } from '@playwright/test';

import {
  MOBILE_FLOW_BUTTON_LABELS,
  MOBILE_FLOW_TEST_IDS,
  MOBILE_FLOW_WRITING,
} from '../../config/mobileFlow.js';
import {
  PUBLIC_BUSINESS_ROLE_KEYS,
  getPublicBusinessRoleConfig,
  getPublicBusinessRolePath,
  type PublicBusinessRoleKey,
} from '../../shared/publicBusinessRoles';

export const mobileViewport = { width: 390, height: 844 };
export const iphoneUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const expectPreviewDeployment = process.env.PLAYWRIGHT_EXPECT_PREVIEW === '1';
const expectIdbStorageMode = process.env.VITE_STORAGE_MODE === 'idb';

export const toUploadBuffer = (value: string): Buffer => Buffer.from(value);

const finishStudySession = async (page: Page, maxCards = 12) => {
  const finishButton = page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFinishExit);
  const dashboardReturnButton = page.getByRole('button', { name: 'ダッシュボードに戻る' });
  const flipButton = page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFlipButton);
  const rateButton = page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3);
  const quizRunningView = page.getByTestId(MOBILE_FLOW_TEST_IDS.quizRunningView);
  const quizResultView = page.getByTestId(MOBILE_FLOW_TEST_IDS.quizResultView);
  const studentDashboard = page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard);

  for (let index = 0; index < maxCards * 2; index += 1) {
    if (await finishButton.isVisible().catch(() => false)) {
      await finishButton.click();
      await expect(studentDashboard).toBeVisible();
      return;
    }
    if (await dashboardReturnButton.isVisible().catch(() => false)) {
      await dashboardReturnButton.click();
      await expect(studentDashboard).toBeVisible();
      return;
    }
    if (await quizResultView.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.quizResultBack }).click();
      await expect(studentDashboard).toBeVisible();
      return;
    }
    if (await studentDashboard.isVisible().catch(() => false)) {
      return;
    }
    if (await quizRunningView.isVisible().catch(() => false)) {
      await answerSeededQuizQuestion(page);
      await Promise.race([
        quizResultView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        quizRunningView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      ]);
      continue;
    }
    if (await rateButton.isVisible().catch(() => false)) {
      await rateButton.click();
      await Promise.race([
        finishButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        quizRunningView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        quizResultView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        studentDashboard.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        flipButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      ]);
      continue;
    }
    if (await flipButton.isVisible().catch(() => false)) {
      await flipButton.click();
      await Promise.race([
        rateButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        finishButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        dashboardReturnButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        quizRunningView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        quizResultView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
        studentDashboard.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      ]);
      continue;
    }

    await Promise.race([
      finishButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      dashboardReturnButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      flipButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      rateButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      quizRunningView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      quizResultView.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
      studentDashboard.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => null),
    ]);
  }

  if (await finishButton.isVisible().catch(() => false)) {
    await finishButton.click();
    await expect(studentDashboard).toBeVisible();
    return;
  }
  if (await dashboardReturnButton.isVisible().catch(() => false)) {
    await dashboardReturnButton.click();
    await expect(studentDashboard).toBeVisible();
    return;
  }
  if (await quizResultView.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.quizResultBack }).click();
    await expect(studentDashboard).toBeVisible();
    return;
  }
  if (await quizRunningView.isVisible().catch(() => false)) {
    throw new Error('Study session switched into quiz mode but did not finish within the smoke helper step budget.');
  }
  if (await studentDashboard.isVisible().catch(() => false)) {
    return;
  }
  throw new Error('Study session did not reach a finishable state within the smoke helper step budget.');
};

export const completeDiagnostic = async (page: Page) => {
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.onboardingTest)).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.diagnosticOption).first().click();
    const nextButton = index === 11
      ? page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.onboardingResult })
      : page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.onboardingNext });
    await nextButton.click();
  }
};

export const maybeCompleteOnboarding = async (page: Page) => {
  const dashboard = page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard);
  const onboarding = page.getByTestId(MOBILE_FLOW_TEST_IDS.onboardingProfile);
  await Promise.race([
    dashboard.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
    onboarding.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
  ]);

  if (await onboarding.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: new RegExp(MOBILE_FLOW_BUTTON_LABELS.onboardingGrade) }).click();
    await page.getByRole('button', { name: new RegExp(MOBILE_FLOW_BUTTON_LABELS.onboardingConfidence) }).click();
    await page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.onboardingStart }).click();
    await completeDiagnostic(page);
    await page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.onboardingCommit }).click();
  }
};

export const seedPhrasebook = async (page: Page, title: string, timeoutMs = 10_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async (bookTitle) => {
      const response = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      });

      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, title);

    if (result.ok) {
      return JSON.parse(result.text);
    }
    if (result.status !== 401) {
      throw new Error(`batchImportWords failed with status ${result.status}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`batchImportWords failed with status ${timeoutMs}ms`);
};

export const seedLeveledPhrasebooks = async (
  page: Page,
  options?: {
    levels?: number[];
    wordsPerLevel?: number;
  },
) => {
  const payload = {
    levels: options?.levels ?? [1, 2, 3, 4],
    wordsPerLevel: options?.wordsPerLevel ?? 10,
  };
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    const result = await page.evaluate(async ({ levels, wordsPerLevel }) => {
      const targetLevels = Array.isArray(levels) && levels.length > 0 ? levels : [1, 2, 3, 4];
      const count = Number.isFinite(wordsPerLevel) && Number(wordsPerLevel) > 0 ? Number(wordsPerLevel) : 10;
      const rows = targetLevels.flatMap((level) => Array.from({ length: count }, (_, index) => ({
        bookName: `レベル${level}`,
        number: index + 1,
        word: `level${level}_word_${index + 1}`,
        definition: `レベル${level}の意味${index + 1}`,
      })));

      const response = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'batchImportWords',
          payload: {
            defaultBookName: 'レベル教材',
            source: {
              kind: 'rows',
              rows,
            },
          },
        }),
      });

      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, payload);

    if (result.ok) {
      return JSON.parse(result.text);
    }
    if (result.status !== 401) {
      throw new Error(`batchImportWords failed with status ${result.status}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error('batchImportWords failed with status 401 after 10000ms');
};

export const getLatestWritingAssignmentForStudentUid = async (
  page: Page,
  scope: 'all' | 'mine',
  studentUid: string,
  status: string,
) => page.evaluate(async ({ nextScope, nextStudentUid, nextStatus }) => {
  const response = await fetch(`/api/writing/assignments?scope=${nextScope}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`writing assignments fetch failed with status ${response.status}`);
  }

  const payload = await response.json();
  const assignments = (payload.assignments || []) as Array<{
    id: string;
    studentUid: string;
    status: string;
    submissionCode: string;
    updatedAt: number;
  }>;

  return assignments
    .filter((assignment) => assignment.status === nextStatus && assignment.studentUid === nextStudentUid)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] || null;
}, { nextScope: scope, nextStudentUid: studentUid, nextStatus: status });

export const getWritingAssignmentById = async (
  page: Page,
  scope: 'all' | 'mine',
  assignmentId: string,
) => page.evaluate(async ({ nextScope, nextAssignmentId }) => {
  const response = await fetch(`/api/writing/assignments?scope=${nextScope}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`writing assignments fetch failed with status ${response.status}`);
  }

  const payload = await response.json();
  const assignments = (payload.assignments || []) as Array<{
    id: string;
    status: string;
    latestSubmissionId?: string | null;
    updatedAt: number;
  }>;

  return assignments.find((assignment) => assignment.id === nextAssignmentId) || null;
}, { nextScope: scope, nextAssignmentId: assignmentId });

export const waitForWritingAssignment = async (
  page: Page,
  scope: 'all' | 'mine',
  assignmentId: string,
  expectedStatuses: string[],
  timeoutMs = 20_000,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const assignment = await getWritingAssignmentById(page, scope, assignmentId);
    if (assignment && expectedStatuses.includes(assignment.status)) {
      return assignment;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Assignment ${assignmentId} did not reach [${expectedStatuses.join(', ')}] within ${timeoutMs}ms`);
};

export const getCurrentSessionUser = async (page: Page, timeoutMs = 10_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/session', { cache: 'no-store' });
      if (response.status === 204) {
        return { ok: true, session: null, empty: true } as const;
      }
      if (!response.ok) {
        return { ok: false, status: response.status } as const;
      }

      const text = await response.text();
      if (!text.trim()) {
        return { ok: true, session: null, empty: true } as const;
      }

      return {
        ok: true,
        session: JSON.parse(text) as {
          uid: string;
          email: string;
          displayName: string;
          role: string;
          organizationId?: string;
          organizationName?: string;
          organizationRole?: string;
        } | null,
        empty: false,
      } as const;
    });

    if (!result.ok) {
      throw new Error(`session fetch failed with status ${result.status}`);
    }
    if (result.session || !result.empty) {
      return result.session;
    }

    await page.waitForTimeout(250);
  }

  return null;
};

export const updateSessionProfile = async (
  page: Page,
  user: { grade?: string; englishLevel?: string; studyMode?: string },
  timeoutMs = 10_000,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async (nextUser) => {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: nextUser }),
      });

      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, user);

    if (result.ok) {
      return result.text ? JSON.parse(result.text) : null;
    }
    if (result.status !== 401) {
      throw new Error(`profile update failed with status ${result.status}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`profile update failed with status 401 after ${timeoutMs}ms`);
};

export const getBookBandIndex = (title?: string) => {
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

export const openBusinessPreview = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('business-role-preview-section').scrollIntoViewIfNeeded();
};

export const openBusinessRolePage = async (
  page: Page,
  roleKey: PublicBusinessRoleKey,
  surface: 'login' | 'public' = 'login',
) => {
  const role = getPublicBusinessRoleConfig(roleKey);
  if (surface === 'public') {
    await page.goto('/public');
    await expect(page.getByTestId('business-role-preview-section')).toBeVisible();
  } else {
    await openBusinessPreview(page);
  }
  await page.getByTestId(role.cardActionTestId).click();
  await expect(page).toHaveURL(new RegExp(`${getPublicBusinessRolePath(roleKey)}$`));
  await expect(page.getByTestId(role.pageTestId)).toBeVisible();
  return role;
};

const waitForAuthenticatedSession = async (
  page: Page,
  timeoutMs = 15_000,
  fallbackDashboardTestId?: string,
) => {
  if (expectIdbStorageMode && fallbackDashboardTestId) {
    const fallbackDashboard = page.getByTestId(fallbackDashboardTestId);
    const onboardingProfile = fallbackDashboardTestId === MOBILE_FLOW_TEST_IDS.studentDashboard
      ? page.getByTestId(MOBILE_FLOW_TEST_IDS.onboardingProfile)
      : null;
    const readinessChecks = [
      fallbackDashboard.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => null),
    ];

    if (onboardingProfile) {
      readinessChecks.push(
        onboardingProfile.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => null),
      );
    }

    await Promise.race(readinessChecks);

    if (await fallbackDashboard.isVisible().catch(() => false)) {
      return null;
    }
    if (onboardingProfile && await onboardingProfile.isVisible().catch(() => false)) {
      return null;
    }

    await expect(fallbackDashboard).toBeVisible({ timeout: 1 });
    return null;
  }

  const session = await getCurrentSessionUser(page, timeoutMs);
  if (!session) {
    throw new Error(`Session was not established within ${timeoutMs}ms.`);
  }
  return session;
};

export const loginBusinessStudentDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'student');
  await page.getByTestId(role.primaryActionTestId).click();
  await waitForAuthenticatedSession(page, 15_000, MOBILE_FLOW_TEST_IDS.studentDashboard);
};

export const loginInstructorDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'instructor');
  await page.getByTestId(role.primaryActionTestId).click();
  await waitForAuthenticatedSession(page, 15_000, 'instructor-dashboard');
};

export const loginGroupAdminDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'group-admin');
  await page.getByTestId(role.primaryActionTestId).click();
  await waitForAuthenticatedSession(page, 15_000, 'business-admin-dashboard');
};

export const loginAdminDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'service-admin');
  await page.getByTestId(role.primaryActionTestId).click();
  await expect(page.getByTestId('admin-demo-password')).toBeVisible();
  await page.getByTestId('admin-demo-password').fill('admin');
  await page.getByTestId('admin-demo-submit').click();
};

export const resolveWritingStudentSelectValue = async (
  page: Page,
  target: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  },
  options?: {
    timeoutMs?: number;
    onRetry?: () => Promise<void>;
  },
): Promise<string> => {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const select = page.getByTestId('writing-student-select');
  const startedAt = Date.now();
  let lastOptions: Array<{ value: string; text: string }> = [];
  let lastRetryAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const resolved = await select.evaluate((element, nextTarget) => {
      const options = Array.from((element as HTMLSelectElement).options).map((option) => ({
        value: option.value,
        text: option.text,
      }));

      const byValue = nextTarget.uid
        ? options.find((option) => option.value === nextTarget.uid)
        : null;
      if (byValue) {
        return { value: byValue.value, options };
      }

      const byEmail = nextTarget.email
        ? options.find((option) => option.text.includes(nextTarget.email || ''))
        : null;
      if (byEmail) {
        return { value: byEmail.value, options };
      }

      const byNameMatches = nextTarget.displayName
        ? options.filter((option) => option.text.includes(nextTarget.displayName || ''))
        : [];
      if (byNameMatches.length === 1) {
        return { value: byNameMatches[0].value, options };
      }

      return { value: '', options };
    }, target);

    lastOptions = resolved.options;
    if (resolved.value) {
      return resolved.value;
    }

    if (options?.onRetry && Date.now() - lastRetryAt >= 1_000) {
      lastRetryAt = Date.now();
      await options.onRetry();
      continue;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Could not resolve writing student option for ${JSON.stringify(target)} from ${JSON.stringify(lastOptions)}`);
};

export const getInstructorSegmentLabel = (student: {
  riskLevel?: string;
  latestInterventionAt?: number;
  latestInterventionOutcome?: string;
  needsFollowUpNow?: boolean;
  primaryMissionStatus?: string;
  missionOverdue?: boolean;
}) => {
  const missionOverdue = Boolean(student.missionOverdue || student.primaryMissionStatus === 'OVERDUE');
  const missionUnstarted = student.primaryMissionStatus === 'ASSIGNED';
  if (missionOverdue) return '要即対応';
  if (student.latestInterventionOutcome === 'REACTIVATED') {
    return missionUnstarted ? '再開待ち' : '再開済み';
  }
  if (
    student.needsFollowUpNow
    || (
      student.riskLevel !== 'SAFE'
      && (!student.latestInterventionAt || Number(student.latestInterventionAt) <= 0)
    )
  ) {
    return '要即対応';
  }
  return '再開待ち';
};

export const emailAuth = async (
  page: Page,
  payload: {
    email: string;
    password: string;
    isSignUp: boolean;
    role?: string;
    displayName?: string;
  },
  timeoutMs = 10_000,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async (nextPayload) => {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'email-auth',
          ...nextPayload,
        }),
      });

      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, payload);

    if (result.ok) {
      return result.text ? JSON.parse(result.text) : null;
    }
    if (result.status !== 401) {
      throw new Error(`email-auth failed with status ${result.status}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`email-auth failed with status 401 after ${timeoutMs}ms`);
};

export const storageAction = async <T,>(
  page: Page,
  action: string,
  payload?: Record<string, unknown>,
  timeoutMs = 10_000,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async ({ nextAction, nextPayload }) => {
      const response = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nextPayload === undefined ? { action: nextAction } : { action: nextAction, payload: nextPayload }),
      });

      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, { nextAction: action, nextPayload: payload });

    if (result.ok) {
      if (!result.text.trim()) {
        return null as T;
      }
      return JSON.parse(result.text) as T;
    }
    if (result.status !== 401) {
      throw new Error(`${action} failed with status ${result.status}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`${action} failed with status 401 after ${timeoutMs}ms`);
};

export const runtimeAdminPost = async <T,>(
  page: Page,
  pathname: string,
  payload?: Record<string, unknown>,
  timeoutMs = 10_000,
) => {
  const startedAt = Date.now();
  const resolvedPathname = pathname.startsWith('/api/') ? pathname : `/api/${pathname.replace(/^\/+/, '')}`;

  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async ({ nextPathname, nextPayload }) => {
      const response = await fetch(nextPathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nextPayload || {}),
      });

      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, { nextPathname: resolvedPathname, nextPayload: payload });

    if (result.ok) {
      if (!result.text.trim()) {
        return null as T;
      }
      return JSON.parse(result.text) as T;
    }
    if (result.status !== 401) {
      throw new Error(`${resolvedPathname} failed with status ${result.status}`);
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`${resolvedPathname} failed with status 401 after ${timeoutMs}ms`);
};

export const completeSeededStudySession = async (page: Page, bookId: string) => {
  await page.getByTestId(`book-study-${bookId}`).click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();

  await finishStudySession(page);
};

export const completeCoachCtaStudySession = async (page: Page) => {
  await page.getByTestId('coach-follow-up-cta').click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();

  await finishStudySession(page);
};

export const completeMissionCtaStudySession = async (page: Page) => {
  await page.getByTestId('dashboard-mission-primary-cta').click();

  const studyCard = page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront);
  const quizRunningView = page.getByTestId(MOBILE_FLOW_TEST_IDS.quizRunningView);

  await Promise.race([
    studyCard.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
    quizRunningView.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
  ]);

  if (await studyCard.isVisible().catch(() => false)) {
    await finishStudySession(page);
    return;
  }

  await expect(quizRunningView).toBeVisible();
  await answerSeededQuizQuestion(page);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.quizResultView)).toBeVisible();
  await page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.quizResultBack }).click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
};

export const answerSeededQuizQuestion = async (page: Page, correct = true) => {
  const promptText = await page.getByTestId(MOBILE_FLOW_TEST_IDS.quizQuestionCard).innerText();
  const correctAnswer = promptText.includes('triage') ? 'トリアージ' : '安定させる';
  const runningView = page.getByTestId(MOBILE_FLOW_TEST_IDS.quizRunningView);

  await page.getByTestId(MOBILE_FLOW_TEST_IDS.quizShowOptions).click();
  if (correct) {
    await runningView.getByRole('button', { name: correctAnswer, exact: true }).click();
    return;
  }

  const optionLabels = await runningView.locator('button').allTextContents();
  const wrongAnswer = optionLabels
    .map((label) => label.trim())
    .find((label) => label && label !== correctAnswer);

  if (!wrongAnswer) {
    throw new Error('Could not find a wrong quiz answer option.');
  }

  await page.getByRole('button', { name: wrongAnswer }).click();
};

export const findUnexpectedHorizontalOverflow = async (page: Page) => page.evaluate(() => {
  const viewportWidth = window.innerWidth;
  const offenders: Array<{ tag: string; className: string; text: string; right: number; left: number; width: number }> = [];

  for (const element of document.querySelectorAll('body *')) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
    if (rect.right <= viewportWidth + 1) continue;

    let current: HTMLElement | null = element as HTMLElement;
    let withinScrollable = false;
    while (current && current !== document.body) {
      const currentStyle = window.getComputedStyle(current);
      if ((currentStyle.overflowX === 'auto' || currentStyle.overflowX === 'scroll') && current.scrollWidth > current.clientWidth + 1) {
        withinScrollable = true;
        break;
      }
      current = current.parentElement;
    }

    if (withinScrollable) continue;

    offenders.push({
      tag: element.tagName,
      className: (element as HTMLElement).className,
      text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      right: Math.round(rect.right),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
    });
  }

  return offenders;
});

export {
  MOBILE_FLOW_BUTTON_LABELS,
  MOBILE_FLOW_TEST_IDS,
  MOBILE_FLOW_WRITING,
  PUBLIC_BUSINESS_ROLE_KEYS,
};
