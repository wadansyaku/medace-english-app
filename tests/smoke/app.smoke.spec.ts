import { expect, test, type Page } from '@playwright/test';
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

const mobileViewport = { width: 390, height: 844 };
const iphoneUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const expectPreviewDeployment = process.env.PLAYWRIGHT_EXPECT_PREVIEW === '1';
const toUploadBuffer = (value: string): Buffer => Buffer.from(value);

const completeDiagnostic = async (page: Page) => {
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.onboardingTest)).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.diagnosticOption).first().click();
    const nextButton = index === 11
      ? page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.onboardingResult })
      : page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.onboardingNext });
    await nextButton.click();
  }
};

const maybeCompleteOnboarding = async (page: Page) => {
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

const seedPhrasebook = async (page: Page, title: string, timeoutMs = 10_000) => {
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

  throw new Error(`batchImportWords failed with status 401 after ${timeoutMs}ms`);
};

const seedLeveledPhrasebooks = async (
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

const getLatestWritingAssignmentForStudentUid = async (
  page: Page,
  scope: 'all' | 'mine',
  studentUid: string,
  status: string,
) => page.evaluate(async ({ nextScope, nextStudentUid, nextStatus }) => {
  const response = await fetch(`/api/writing/assignments?scope=${nextScope}`);
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

const getWritingAssignmentById = async (
  page: Page,
  scope: 'all' | 'mine',
  assignmentId: string,
) => page.evaluate(async ({ nextScope, nextAssignmentId }) => {
  const response = await fetch(`/api/writing/assignments?scope=${nextScope}`);
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

const waitForWritingAssignment = async (
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

const getCurrentSessionUser = async (page: Page, timeoutMs = 10_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/session');
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

const updateSessionProfile = async (
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

const getBookBandIndex = (title?: string) => {
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

const openBusinessPreview = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('business-role-preview-section').scrollIntoViewIfNeeded();
};

const openBusinessRolePage = async (
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

const loginBusinessStudentDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'student');
  await page.getByTestId(role.primaryActionTestId).click();
};

const loginInstructorDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'instructor');
  await page.getByTestId(role.primaryActionTestId).click();
};

const loginGroupAdminDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'group-admin');
  await page.getByTestId(role.primaryActionTestId).click();
};

const getInstructorSegmentLabel = (student: {
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

const loginAdminDemo = async (page: Page) => {
  const role = await openBusinessRolePage(page, 'service-admin');
  await page.getByTestId(role.primaryActionTestId).click();
  await expect(page.getByTestId('admin-demo-password')).toBeVisible();
  await page.getByTestId('admin-demo-password').fill('admin');
  await page.getByTestId('admin-demo-submit').click();
};

const emailAuth = async (
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

const storageAction = async <T,>(
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

const completeSeededStudySession = async (page: Page, bookId: string) => {
  await page.getByTestId(`book-study-${bookId}`).click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();

  for (let index = 0; index < 2; index += 1) {
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFlipButton).click();
    await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3)).toBeVisible();
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3).click();
  }

  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFinishExit)).toBeVisible();
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFinishExit).click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
};

const completeCoachCtaStudySession = async (page: Page) => {
  await page.getByTestId('coach-follow-up-cta').click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();

  for (let index = 0; index < 2; index += 1) {
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFlipButton).click();
    await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3)).toBeVisible();
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3).click();
  }

  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFinishExit)).toBeVisible();
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFinishExit).click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
};

const completeMissionCtaStudySession = async (page: Page) => {
  await page.getByTestId('dashboard-mission-primary-cta').click();

  const studyCard = page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront);
  const quizRunningView = page.getByTestId(MOBILE_FLOW_TEST_IDS.quizRunningView);

  await Promise.race([
    studyCard.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
    quizRunningView.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
  ]);

  if (await studyCard.isVisible().catch(() => false)) {
    for (let index = 0; index < 2; index += 1) {
      await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFlipButton).click();
      await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3)).toBeVisible();
      await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3).click();
    }

    await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFinishExit)).toBeVisible();
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFinishExit).click();
    await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
    return;
  }

  await expect(quizRunningView).toBeVisible();
  await answerSeededQuizQuestion(page);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.quizResultView)).toBeVisible();
  await page.getByRole('button', { name: MOBILE_FLOW_BUTTON_LABELS.quizResultBack }).click();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
};

const answerSeededQuizQuestion = async (page: Page, correct = true) => {
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

const findUnexpectedHorizontalOverflow = async (page: Page) => page.evaluate(() => {
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

test('public home shows the live motivation board before login', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('みんなの学習ライブ')).toBeVisible();
  await expect(page.getByText(/直近15分/)).toBeVisible();
  await expect(page.getByText(/いまの積み上がり/)).toBeVisible();
});

test('public guide updates the URL and browser back returns to login', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'アプリの説明・料金を見る' }).click();
  await expect(page).toHaveURL(/\/public$/);
  await expect(page.getByText('アプリの説明と')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '学習を再開する' })).toBeVisible();
});

test('public guide keeps the business role previews visible', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'アプリの説明・料金を見る' }).click();
  await expect(page).toHaveURL(/\/public$/);
  await expect(page.getByTestId('business-role-preview-section')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-student')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-instructor')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-admin')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-service-admin')).toBeVisible();
});

test('public guide links every business role card to its dedicated route and browser back returns to the hub', async ({ page }) => {
  await page.goto('/public');
  await expect(page.getByTestId('business-role-preview-section')).toBeVisible();

  for (const roleKey of PUBLIC_BUSINESS_ROLE_KEYS) {
    const role = getPublicBusinessRoleConfig(roleKey);
    await page.getByTestId(role.cardActionTestId).click();
    await expect(page).toHaveURL(new RegExp(`${getPublicBusinessRolePath(roleKey)}$`));
    await expect(page.getByTestId(role.pageTestId)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/public$/);
    await expect(page.getByTestId('business-role-preview-section')).toBeVisible();
  }
});

test('public role pages always emit a noindex robots tag and service admin demo opens the password gate', async ({ page }) => {
  await page.goto('/public/roles/service-admin');

  await expect(page.getByTestId('public-role-page-service-admin')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,\s*nofollow,\s*noarchive/i);
  await page.getByTestId('demo-login-admin').click();
  await expect(page.getByTestId('admin-demo-password')).toBeVisible();
});

test('demo student can complete onboarding and reach the dashboard', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('onboarding-profile')).toBeVisible();

  await page.getByRole('button', { name: /中学2年生/ }).click();
  await page.getByRole('button', { name: /学校英語はだいたい分かる/ }).click();
  await page.getByRole('button', { name: '診断を始める' }).click();

  await completeDiagnostic(page);

  await expect(page.getByTestId('onboarding-result')).toBeVisible();
  await page.getByRole('button', { name: 'このレベルで学習を始める' }).click();

  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await expect(page.getByText('今日やることは 1 つだけ')).toBeVisible();
});

test('study routes survive reload and finish back on the dashboard path', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  const importResult = await seedPhrasebook(page, 'Route Persistence Drill');
  const bookId = importResult.importedBookIds?.[0];
  expect(bookId).toBeTruthy();

  await page.goto(`/study/${bookId}`);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();

  for (let index = 0; index < 2; index += 1) {
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyFlipButton).click();
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3).click();
  }

  await page.getByRole('button', { name: 'ダッシュボードに戻る' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
});

test('group admin can open the organization dashboard and update an assignment', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await expect(page.getByTestId('organization-kpi-trend-section')).toBeVisible();
  await page.getByTestId('workspace-tab-assignments').click();
  const assignmentSelect = page.locator('[data-testid^="assignment-select-"]').first();
  await assignmentSelect.selectOption({ index: 1 });

  await expect(page.getByText(/担当講師を .* に更新しました。/)).toBeVisible();
  await expect(page.getByTestId('assignment-history-section')).toContainText('変更者');
});

test('group admin can open settings and organization rename survives reload across business roles', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentContext = await browser.newContext({ viewport: mobileViewport, userAgent: iphoneUserAgent });
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentPage = await studentContext.newPage();
  const renamedOrganization = 'Smoke Rename Academy';

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-settings').click();
  await expect(adminPage.getByTestId('organization-members-section')).toBeVisible();
  await expect(adminPage.getByTestId('organization-audit-section')).toBeVisible();

  await loginInstructorDemo(instructorPage);
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  await adminPage.getByTestId('organization-settings-name-input').fill(renamedOrganization);
  await adminPage.getByTestId('organization-settings-save').click();
  await expect(adminPage.getByText('組織表示名を更新しました。')).toBeVisible();

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-settings').click();
  await expect(adminPage.getByTestId('organization-settings-name-input')).toHaveValue(renamedOrganization);

  await instructorPage.reload();
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();
  const instructorSession = await getCurrentSessionUser(instructorPage);
  expect(instructorSession?.organizationName).toBe(renamedOrganization);

  await studentPage.reload();
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  const studentSession = await getCurrentSessionUser(studentPage);
  expect(studentSession?.organizationName).toBe(renamedOrganization);

  await adminContext.close();
  await instructorContext.close();
  await studentContext.close();
});

test('group admin can scope cohorts and instructor dashboard only shows assigned cohort students', async ({ browser }) => {
  const platformAdminContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentAContext = await browser.newContext({ viewport: mobileViewport, userAgent: iphoneUserAgent });
  const studentBContext = await browser.newContext({ viewport: mobileViewport, userAgent: iphoneUserAgent });
  const platformAdminPage = await platformAdminContext.newPage();
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentAPage = await studentAContext.newPage();
  const studentBPage = await studentBContext.newPage();

  await loginAdminDemo(platformAdminPage);
  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await instructorPage.goto('/');
  const provisionedInstructor = await emailAuth(instructorPage, {
    email: 'smoke-cohort-instructor@example.jp',
    password: 'smoke-pass-123',
    isSignUp: true,
    role: 'STUDENT',
    displayName: 'Smoke Cohort Instructor',
  });

  await loginBusinessStudentDemo(studentAPage);
  await maybeCompleteOnboarding(studentAPage);
  await expect(studentAPage.getByTestId('student-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentBPage);
  await maybeCompleteOnboarding(studentBPage);
  await expect(studentBPage.getByTestId('student-dashboard')).toBeVisible();

  const adminUser = await getCurrentSessionUser(adminPage);
  const studentAUser = await getCurrentSessionUser(studentAPage);
  const studentBUser = await getCurrentSessionUser(studentBPage);
  expect(adminUser?.organizationId).toBeTruthy();
  expect(provisionedInstructor?.uid).toBeTruthy();
  expect(studentAUser?.uid).toBeTruthy();
  expect(studentBUser?.uid).toBeTruthy();

  const instructorRequest = await storageAction<any>(instructorPage, 'submitCommercialRequest', {
    kind: 'BUSINESS_ROLE_CONVERSION',
    contactName: 'Smoke Cohort Instructor',
    contactEmail: 'smoke-cohort-instructor@example.jp',
    organizationName: adminUser!.organizationName,
    requestedWorkspaceRole: 'INSTRUCTOR',
    seatEstimate: '1-30名',
    message: 'smoke cohort instructor provisioning',
    source: 'DASHBOARD_ACCOUNT',
  });
  await storageAction(platformAdminPage, 'updateCommercialRequest', {
    id: instructorRequest.id,
    status: 'PROVISIONED',
    resolutionNote: 'smoke cohort instructor provisioning',
    linkedUserUid: provisionedInstructor.uid,
    targetSubscriptionPlan: 'TOB_PAID',
    targetOrganizationId: adminUser!.organizationId,
    targetOrganizationName: adminUser!.organizationName,
    targetOrganizationRole: 'INSTRUCTOR',
  });

  await instructorPage.goto('/instructor');
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();
  const instructorUser = await getCurrentSessionUser(instructorPage);
  expect(instructorUser?.organizationRole).toBe('INSTRUCTOR');

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-settings').click();

  await adminPage.getByTestId('cohort-create-input').fill('Smoke Cohort A');
  await adminPage.getByTestId('cohort-create-submit').click();
  await expect(adminPage.getByText('クラス/担当グループを追加しました。')).toBeVisible();

  await adminPage.getByTestId('cohort-create-input').fill('Smoke Cohort B');
  await adminPage.getByTestId('cohort-create-submit').click();
  await expect(adminPage.getByText('クラス/担当グループを追加しました。')).toBeVisible();

  const settingsSnapshot = await storageAction<any>(adminPage, 'getOrganizationSettingsSnapshot');
  const cohortA = settingsSnapshot.cohorts.find((cohort: { name: string }) => cohort.name === 'Smoke Cohort A');
  const cohortB = settingsSnapshot.cohorts.find((cohort: { name: string }) => cohort.name === 'Smoke Cohort B');
  expect(cohortA?.id).toBeTruthy();
  expect(cohortB?.id).toBeTruthy();

  await adminPage.getByTestId(`instructor-cohort-checkbox-${instructorUser!.uid}-${cohortA.id}`).check();
  await adminPage.getByTestId(`instructor-cohort-save-${instructorUser!.uid}`).click();
  await expect(adminPage.getByText('講師のクラス/担当グループ範囲を更新しました。')).toBeVisible();

  await adminPage.getByTestId('workspace-tab-assignments').click();
  await adminPage.getByTestId(`assignment-row-${studentAUser!.uid}`).click();
  await adminPage.getByTestId(`student-cohort-select-${studentAUser!.uid}`).selectOption(cohortA.id);
  await expect(adminPage.getByText('生徒のクラス/担当グループを更新しました。')).toBeVisible();

  await adminPage.getByTestId(`assignment-row-${studentBUser!.uid}`).click();
  await adminPage.getByTestId(`student-cohort-select-${studentBUser!.uid}`).selectOption(cohortB.id);
  await expect(adminPage.getByText('生徒のクラス/担当グループを更新しました。')).toBeVisible();

  await instructorPage.reload();
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  const visibleStudents = await storageAction<any[]>(instructorPage, 'getAllStudentsProgress');
  const visibleStudentA = visibleStudents.find((student) => student.uid === studentAUser!.uid);
  const visibleStudentB = visibleStudents.find((student) => student.uid === studentBUser!.uid);
  expect(visibleStudentA?.cohortId).toBe(cohortA.id);
  expect(visibleStudentB).toBeUndefined();

  await instructorPage.getByTestId('workspace-tab-students').click();
  await instructorPage.getByRole('button', { name: getInstructorSegmentLabel(visibleStudentA), exact: true }).first().click();
  await expect(instructorPage.getByTestId(`instructor-student-row-${studentAUser!.uid}`)).toBeVisible();
  await expect(instructorPage.getByTestId(`instructor-student-row-${studentBUser!.uid}`)).toHaveCount(0);

  await platformAdminContext.close();
  await adminContext.close();
  await instructorContext.close();
  await studentAContext.close();
  await studentBContext.close();
});

test('instructor can keep and send a fallback follow-up draft after an AI attempt', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await loginInstructorDemo(instructorPage);
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  const instructorUser = await getCurrentSessionUser(instructorPage);
  const studentUser = await getCurrentSessionUser(studentPage);
  expect(instructorUser?.uid).toBeTruthy();
  expect(studentUser?.uid).toBeTruthy();
  await storageAction(adminPage, 'assignStudentInstructor', {
    studentUid: studentUser!.uid,
    instructorUid: instructorUser!.uid,
  });

  await instructorPage.reload();
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();
  await instructorPage.getByTestId('workspace-tab-students').click();
  await instructorPage.locator('[data-testid^="send-notification-"]').first().click();

  await expect(instructorPage.getByTestId('notification-composer')).toBeVisible();
  const draftField = instructorPage.getByTestId('notification-message-draft');
  await expect(draftField).not.toHaveValue('');

  const aiDraftButton = instructorPage.getByRole('button', { name: 'AIで下書きを作る' });
  await aiDraftButton.click();
  await expect(aiDraftButton).toBeEnabled();
  await expect(draftField).not.toHaveValue('');

  await instructorPage.getByTestId('notification-send-submit').click();
  await expect(instructorPage.getByText(/フォロー通知を保存しました。/)).toBeVisible();

  await adminContext.close();
  await instructorContext.close();
  await studentContext.close();
});

test('admin reload sees organization KPI changes after notification and study', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentContext = await browser.newContext({ viewport: mobileViewport, userAgent: iphoneUserAgent });
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await loginInstructorDemo(instructorPage);
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  const instructorUser = await getCurrentSessionUser(instructorPage);
  const businessStudent = await getCurrentSessionUser(studentPage);
  expect(instructorUser?.uid).toBeTruthy();
  expect(businessStudent?.uid).toBeTruthy();

  await storageAction(adminPage, 'assignStudentInstructor', {
    studentUid: businessStudent?.uid,
    instructorUid: instructorUser?.uid,
  });

  const beforeSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const beforeTodayTrend = beforeSnapshot.trend[beforeSnapshot.trend.length - 1];

  await storageAction(instructorPage, 'sendInstructorNotification', {
    studentUid: businessStudent?.uid,
    message: '5語だけでも今日中に見直しましょう。',
    triggerReason: 'smoke-test',
    usedAi: false,
    interventionKind: 'REVIEW_RESTART',
  });

  const importResult = await seedPhrasebook(studentPage, 'Smoke KPI Drill');
  expect(importResult.importedBookIds?.[0]).toBeTruthy();
  if (!importResult.importedBookIds?.[0]) {
    throw new Error('Smoke KPI Drill did not return an imported book id.');
  }
  await studentPage.reload();
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('coach-follow-up-cta')).toBeVisible();
  await completeCoachCtaStudySession(studentPage);

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  const afterSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const afterTodayTrend = afterSnapshot.trend[afterSnapshot.trend.length - 1];
  const studentAfter = afterSnapshot.studentAssignments.find((student: { uid: string; hasReactivatedSinceNotification?: boolean }) => student.uid === businessStudent?.uid);

  expect(afterSnapshot.reactivatedStudents7d).toBeGreaterThanOrEqual(beforeSnapshot.reactivatedStudents7d);
  expect(afterTodayTrend?.reactivatedStudents || 0).toBeGreaterThanOrEqual(beforeTodayTrend?.reactivatedStudents || 0);
  expect(studentAfter?.hasReactivatedSinceNotification).toBeTruthy();

  await adminContext.close();
  await instructorContext.close();
  await studentContext.close();
});

test('group admin can issue a weekly mission and student can restart it from the dashboard', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext({ viewport: mobileViewport, userAgent: iphoneUserAgent });
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  const businessStudent = await getCurrentSessionUser(studentPage);
  expect(businessStudent?.uid).toBeTruthy();
  const importResult = await seedPhrasebook(studentPage, 'Smoke Mission Drill');
  expect(importResult.importedBookIds?.[0]).toBeTruthy();
  if (!importResult.importedBookIds?.[0]) {
    throw new Error('Smoke Mission Drill did not return an imported book id.');
  }

  const beforeSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const weeklyMission = await storageAction<any>(adminPage, 'createWeeklyMission', {
    learningTrack: 'EIKEN_2',
    title: 'Smoke Weekly Mission',
    rationale: 'smoke mission distribution',
    bookId: importResult.importedBookIds[0],
    bookTitle: 'Smoke Mission Drill',
    newWordsTarget: 8,
    reviewWordsTarget: 4,
    quizTargetCount: 1,
  });
  await storageAction(adminPage, 'assignWeeklyMission', {
    missionId: weeklyMission.id,
    studentUid: businessStudent?.uid,
  });

  await studentPage.reload();
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('dashboard-mission-section')).toBeVisible();
  await expect(studentPage.getByText('Smoke Weekly Mission')).toBeVisible();

  await completeMissionCtaStudySession(studentPage);

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  const afterSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const studentAfter = afterSnapshot.studentAssignments.find((student: { uid: string; primaryMissionStatus?: string; primaryMissionCompletionRate?: number }) => (
    student.uid === businessStudent?.uid
  ));

  expect(afterSnapshot.missionStartedRate).toBeGreaterThanOrEqual(beforeSnapshot.missionStartedRate);
  expect(studentAfter?.primaryMissionStatus).not.toBe('ASSIGNED');
  expect(studentAfter?.primaryMissionCompletionRate || 0).toBeGreaterThan(0);

  await adminContext.close();
  await studentContext.close();
});

test('group admin and business student can complete the writing workflow with one revision', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  const businessStudent = await getCurrentSessionUser(studentPage);
  expect(businessStudent?.uid).toBeTruthy();

  await adminPage.reload();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();

  await adminPage.getByTestId('writing-student-select').selectOption(businessStudent!.uid);
  await adminPage.getByTestId('writing-template-select').selectOption({ index: 1 });
  await adminPage.getByTestId('writing-generate-submit').click();
  await expect(adminPage.getByText(/自由英作文課題を生成しました/)).toBeVisible();
  const generatedAssignment = await getLatestWritingAssignmentForStudentUid(adminPage, 'all', businessStudent!.uid, 'DRAFT');
  expect(generatedAssignment?.id).toBeTruthy();
  await adminPage.getByRole('button', { name: new RegExp(generatedAssignment.submissionCode) }).click();
  await expect(adminPage.getByTestId('writing-issue-assignment')).toBeVisible();
  await adminPage.getByTestId('writing-issue-assignment').click();
  await expect(adminPage.getByText(/配布状態にしました/)).toBeVisible();
  await waitForWritingAssignment(adminPage, 'all', generatedAssignment.id, ['ISSUED']);
  await waitForWritingAssignment(studentPage, 'mine', generatedAssignment.id, ['ISSUED']);

  await studentPage.reload();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  await studentPage.getByTestId(`writing-open-submit-${generatedAssignment.id}`).click();
  await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles({
    name: 'attempt-1.png',
    mimeType: 'image/png',
    buffer: toUploadBuffer('student-attempt-one'),
  });
  await studentPage.getByTestId('writing-submit-upload').click();
  await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

  await adminPage.reload();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await adminPage.getByRole('button', { name: '添削キュー' }).click();
  await expect(adminPage.getByTestId('writing-review-queue')).toBeVisible();
  await adminPage.locator('[data-testid^="writing-review-item-"]').first().click();
  await expect(adminPage.getByTestId('writing-review-public-comment')).toBeVisible();
  await adminPage.getByTestId('writing-review-public-comment').fill('理由のつながりを整えて、もう一度書き直しましょう。');
  await adminPage.getByRole('button', { name: '再提出を依頼' }).click();
  await expect(adminPage.getByText(/再提出依頼を保存しました。/)).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  await studentPage.locator('[data-testid^="writing-open-submit-"]').first().click();
  await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles({
    name: 'attempt-2.png',
    mimeType: 'image/png',
    buffer: toUploadBuffer('student-attempt-two'),
  });
  await studentPage.getByPlaceholder(MOBILE_FLOW_WRITING.transcriptPlaceholder).fill(
    'I agree that students should use tablets because they can review lessons quickly and share ideas more easily. For example, they can check notes at home and ask better questions in class.',
  );
  await studentPage.getByTestId('writing-submit-upload').click();
  await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

  await adminPage.reload();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await adminPage.getByRole('button', { name: '添削キュー' }).click();
  await adminPage.locator('[data-testid^="writing-review-item-"]').first().click();
  await adminPage.getByTestId('writing-review-public-comment').fill('構成が安定しました。次は語彙の幅も意識しましょう。');
  await adminPage.getByTestId('writing-approve-return').click();
  await expect(adminPage.getByText(/返却内容を確定しました。/)).toBeVisible();
  await adminPage.getByRole('button', { name: '返却履歴' }).click();
  await expect(adminPage.locator('[data-testid^="writing-review-item-"]').first()).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  await studentPage.locator('[data-testid^="writing-open-feedback-"]').first().click();
  await expect(studentPage.getByText('講師コメント')).toBeVisible();
  await expect(studentPage.getByText('訂正文例')).toBeVisible();

  await adminContext.close();
  await studentContext.close();
});

test('idb mode keeps the B2B warning banner and hides KPI trend cards', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await expect(page.getByTestId('b2b-storage-mode-banner')).toBeVisible();
  await expect(page.getByTestId('organization-kpi-trend-section')).toHaveCount(0);
});

test('student can submit an upgrade request and admin can approve it with a one-time major announcement', async ({ browser }) => {
  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminPage = await adminContext.newPage();
  const announcementTitle = 'Phase 4 smoke announcement';
  const announcementBody = '導入相談の動線とお知らせ表示を追加しました。';

  await studentPage.goto('/');
  await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  await studentPage.getByRole('button', { name: /プラン・学習環境の詳細/ }).click();
  await expect(studentPage.getByTestId('commercial-upgrade-panel')).toBeVisible();
  await studentPage.locator('[data-testid="commercial-request-form"] textarea').fill('学校・教室向けの導入相談と上位プランの違いを知りたいです。');
  await studentPage.getByTestId('commercial-request-submit').click();
  await expect(studentPage.getByTestId('commercial-request-status-list')).toBeVisible();
  await expect(studentPage.getByTestId('commercial-request-status-list')).toContainText('受付済み');

  await loginAdminDemo(adminPage);
  await expect(adminPage.getByRole('button', { name: '導入・お知らせ' })).toBeVisible();
  await adminPage.getByRole('button', { name: '導入・お知らせ' }).click();
  const requestItem = adminPage.locator('[data-testid^="admin-commercial-request-"]').first();
  await expect(requestItem).toBeVisible();
  await requestItem.click();
  await adminPage.getByRole('button', { name: '承認済み' }).click();
  await expect(requestItem).toContainText('承認済み');

  await adminPage.getByTestId('admin-announcement-title').fill(announcementTitle);
  await adminPage.getByTestId('admin-announcement-body').fill(announcementBody);
  await adminPage.getByTestId('admin-announcement-severity').selectOption('MAJOR');
  await adminPage.getByTestId('admin-announcement-submit').click();
  await expect(adminPage.getByText(announcementTitle)).toBeVisible();

  const smokeAnnouncement = (await storageAction<Array<{ id: string; title: string; }>>(adminPage, 'listProductAnnouncementsAdmin'))
    .find((announcement) => announcement.title === announcementTitle);
  expect(smokeAnnouncement?.id).toBeTruthy();

  await studentPage.reload();
  await expect(studentPage.getByTestId('announcement-modal')).toBeVisible();
  await expect(studentPage.getByTestId('announcement-modal')).toContainText(announcementTitle);
  await studentPage.getByRole('button', { name: '閉じる' }).click();
  await expect(studentPage.getByTestId('announcement-modal')).toHaveCount(0);
  await expect(studentPage.getByTestId('dashboard-announcement-section')).toContainText(announcementTitle);

  await storageAction(adminPage, 'upsertProductAnnouncement', {
    id: smokeAnnouncement!.id,
    title: announcementTitle,
    body: announcementBody,
    severity: 'MAJOR',
    subscriptionPlans: ['TOC_FREE'],
    audienceRoles: ['STUDENT'],
    endsAt: Date.now() - 60_000,
  });

  await studentPage.reload();
  await expect(studentPage.getByTestId('announcement-modal')).toHaveCount(0);
  await studentPage.getByRole('button', { name: /プラン・学習環境の詳細/ }).click();
  await expect(studentPage.getByTestId('commercial-request-status-list')).toContainText('承認済み');

  await adminContext.close();
  await studentContext.close();
});

test.describe('student mobile ux', () => {
  test.use({
    viewport: mobileViewport,
    userAgent: iphoneUserAgent,
    hasTouch: true,
    isMobile: true,
  });

  test('public landing keeps demo CTA inside the first viewport on mobile', async ({ page }) => {
    await page.goto('/');

    const demoButton = page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent);
    await expect(demoButton).toBeVisible();
    const box = await demoButton.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 1000) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
  });

  test('public landing keeps the school guide CTA inside the first viewport on mobile', async ({ page }) => {
    await page.goto('/');

    const guideButton = page.getByTestId('open-business-guide-mobile');
    await expect(guideButton).toBeVisible();
    const box = await guideButton.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 1000) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
  });

  test('preview deployment surfaces a visible preview banner and noindex marker', async ({ page }) => {
    test.skip(!expectPreviewDeployment, 'preview-only deployment validation');

    await page.goto('/');

    await expect(page.getByTestId('preview-deployment-banner')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);
  });

  test('student dashboard keeps the primary CTA inside the first viewport on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await expect(page.getByTestId('demo-banner-toggle')).toBeVisible();
    const primaryCta = page.getByTestId(MOBILE_FLOW_TEST_IDS.studentHeroPrimaryCta);
    await expect(primaryCta).toBeVisible();
    const box = await primaryCta.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 1000) + (box?.height ?? 0)).toBeLessThan(844);
  });

  test('student dashboard quick nav jumps between today and the library on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await seedPhrasebook(page, 'Mobile Quick Nav Drill');
    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await expect(page.getByTestId('dashboard-mobile-quick-nav')).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('dashboard-quicknav-library').click();

    await expect.poll(async () => {
      const box = await page.getByTestId('dashboard-library-section').boundingBox();
      return box?.y ?? 9999;
    }).toBeLessThanOrEqual(220);
    await expect(page.getByTestId('dashboard-quicknav-library')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('dashboard-quicknav-today').click();
    await expect.poll(async () => {
      const box = await page.getByTestId('dashboard-hero-section').boundingBox();
      return box?.y ?? 9999;
    }).toBeLessThanOrEqual(220);
    await expect(page.getByTestId('dashboard-quicknav-today')).toHaveAttribute('aria-pressed', 'true');
  });

  test('student dashboard avoids unintended horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByRole('button', { name: /くわしい学習記録/ }).click();
    await page.getByRole('button', { name: /プラン・学習環境の詳細/ }).click();
    await page.getByRole('button', { name: /公式コース/ }).click();

    const offenders = await findUnexpectedHorizontalOverflow(page);
    expect(offenders).toEqual([]);
  });

  test('student settings keeps the save action reachable on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByTestId('student-hero-settings').click();
    await expect(page.getByTestId('settings-modal-mobile')).toBeVisible();

    const saveButton = page.getByTestId('settings-save-button');
    await expect(saveButton).toBeVisible();
    const saveBox = await saveButton.boundingBox();
    expect(saveBox).not.toBeNull();
    expect((saveBox?.y ?? 1000) + (saveBox?.height ?? 0)).toBeLessThanOrEqual(844);
  });

  test('student without books can open phrasebook creation from the hero on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const primaryCta = page.getByTestId(MOBILE_FLOW_TEST_IDS.studentHeroPrimaryCta);
    await expect(primaryCta).toContainText('My単語帳を作る');
    await primaryCta.click();

    await expect(page.getByTestId('phrasebook-create-modal')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My単語帳 作成' })).toBeVisible();
  });

  test('student with a generated plan can reach the plan editor save action on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await seedPhrasebook(page, 'Mobile Plan Drill');
    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByRole('button', { name: '最初のプランを作る' }).click();
    await expect(page.getByText('今日の学習プラン')).toBeVisible();
    await page.getByRole('button', { name: '編集' }).click();

    await expect(page.getByTestId('plan-editor-modal')).toBeVisible();
    const saveButton = page.getByTestId('plan-editor-save-button');
    await expect(saveButton).toBeVisible();
    const saveBox = await saveButton.boundingBox();
    expect(saveBox).not.toBeNull();
    expect((saveBox?.y ?? 1000) + (saveBox?.height ?? 0)).toBeLessThanOrEqual(844);
  });

  test('student onboarding keeps mobile start and next actions within reach', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await expect(page.getByTestId('onboarding-profile')).toBeVisible();

    await page.getByRole('button', { name: '中学3年生' }).click();
    await page.getByRole('button', { name: '学校英語はだいたい分かる' }).click();

    const startButton = page.getByTestId('onboarding-start-button');
    await expect(startButton).toBeVisible();
    const startBox = await startButton.boundingBox();
    expect(startBox).not.toBeNull();
    expect((startBox?.y ?? 1000) + (startBox?.height ?? 0)).toBeLessThanOrEqual(844);

    await startButton.click();
    await expect(page.getByTestId('onboarding-test')).toBeVisible();
    await page.getByTestId('diagnostic-option').first().click();

    const nextButton = page.getByTestId('onboarding-next-button');
    await expect(nextButton).toBeVisible();
    const nextBox = await nextButton.boundingBox();
    expect(nextBox).not.toBeNull();
    expect((nextBox?.y ?? 1000) + (nextBox?.height ?? 0)).toBeLessThanOrEqual(844);
  });

  test('student can reach the finish action after a short study session on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Finish Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByTestId(`book-study-${bookId}`).click();
    await expect(page.getByTestId('study-card-front')).toBeVisible();

    for (let index = 0; index < 2; index += 1) {
      await page.getByTestId('study-flip-button').click();
      await expect(page.getByTestId('study-rate-3')).toBeVisible();
      await page.getByTestId('study-rate-3').click();
    }

    const finishButton = page.getByTestId('study-finish-exit');
    await expect(finishButton).toBeVisible();
    const finishBox = await finishButton.boundingBox();
    expect(finishBox).not.toBeNull();
    expect((finishBox?.y ?? 1000) + (finishBox?.height ?? 0)).toBeLessThanOrEqual(844);
  });

  test('study resets the next card to the top of the mobile viewport', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Scroll Reset Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByTestId(`book-study-${bookId}`).click();
    await expect(page.getByTestId('study-card-front')).toBeVisible();
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-rate-3')).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByTestId('study-rate-3').click();
    await expect(page.getByTestId('study-flip-button')).toBeVisible();
    await expect(page.getByTestId('study-flip-button')).toBeEnabled();
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(4);
  });

test('student can open a seeded phrasebook and flip a study card on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Flip Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const studyButton = page.getByTestId(`book-study-${bookId}`);
    await studyButton.scrollIntoViewIfNeeded();
    await studyButton.click();

  await expect(page.getByTestId('study-card-front')).toBeVisible();
  await expect(page.getByTestId('study-flip-button')).toBeVisible();
  await page.getByTestId('study-flip-button').click();
  await expect(page.getByTestId('study-rate-0')).toBeVisible();
  await expect(page.getByTestId('study-rate-3')).toBeVisible();
  await page.getByTestId('study-card-back').click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('study-flip-button')).toBeVisible();
});

test('cold-start smart session respects a higher diagnosed band before any study history exists', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  await seedLeveledPhrasebooks(page, {
    levels: [1, 2, 3, 4],
    wordsPerLevel: 10,
  });

  await updateSessionProfile(page, {
    grade: 'JHS2',
    englishLevel: 'B2',
  });
  await page.reload();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  const books = await storageAction<Array<{ id: string; title: string }>>(page, 'getBooks');
  const words = await storageAction<Array<{ id: string; bookId: string }>>(page, 'getDailySessionWords', { limit: 10 });
  const bandByBookId = new Map(books.map((book) => [book.id, getBookBandIndex(book.title)]));
  const selectedBands = words
    .map((word) => bandByBookId.get(word.bookId) || null)
    .filter((band): band is number => band !== null);

  expect(selectedBands.length).toBeGreaterThan(0);
  expect(selectedBands.filter((band) => band === 3).length).toBeGreaterThanOrEqual(5);
  expect(selectedBands.slice(0, 5).every((band) => band === 1)).toBeFalsy();
});

test('student weakness focus card populates after the first smart-session on mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  await seedLeveledPhrasebooks(page, {
    levels: [1, 2, 3, 4],
    wordsPerLevel: 10,
  });
  await page.reload();
  await expect(page.getByTestId('dashboard-weakness-section')).toBeVisible();
  await expect(page.getByTestId('dashboard-weakness-section')).toContainText('まだ苦手分析は育成中');

  await page.getByTestId('weakness-focus-cta').click();
  await expect(page.getByTestId('study-card-front')).toBeVisible();

  for (let index = 0; index < 10; index += 1) {
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-rate-3')).toBeVisible();
    await page.getByTestId('study-rate-3').click();
  }

  await expect(page.getByTestId('study-finish-exit')).toBeVisible();
  await page.getByTestId('study-finish-exit').click();

  await expect(page.getByTestId('dashboard-weakness-section')).toBeVisible();
  await expect(page.getByTestId('dashboard-weakness-section')).not.toContainText('まだ苦手分析は育成中');
  await expect(page.getByTestId('dashboard-weakness-section')).toContainText('今日はここを先に整える');
});

  test('student quiz shows an empty learned-only state before any study ratings on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('demo-login-student').click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Quiz Empty Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByTestId(`book-quiz-${bookId}`).click();
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.quizSelectionLearnedOnly).click();

    await expect(page.getByTestId('quiz-empty-state')).toBeVisible();
    await expect(page.getByTestId('quiz-empty-state')).toContainText('学習モードで評価した単語');
    await expect(page.getByTestId('quiz-setup-primary-cta')).toBeDisabled();
  });

  test('student can complete the learned-only quiz flow on mobile after studying', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Quiz Learned Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await completeSeededStudySession(page, bookId);

    await page.getByTestId(`book-quiz-${bookId}`).click();
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.quizSelectionLearnedOnly).click();
    await expect(page.getByTestId('quiz-setup-primary-cta')).toBeEnabled();
    await page.getByTestId('quiz-setup-primary-cta').click();

    await expect(page.getByTestId('quiz-ready-view')).toBeVisible();
    await page.getByTestId('quiz-ready-start').click();
    await expect(page.getByTestId('quiz-running-view')).toBeVisible();

    await answerSeededQuizQuestion(page);
    await expect(page.getByText(/第 2 問/)).toBeVisible();
    await answerSeededQuizQuestion(page);

    await expect(page.getByTestId('quiz-result-view')).toBeVisible();
    await expect(page.getByTestId('quiz-result-retry')).toBeVisible();
  });

  test('quiz-only mobile attempts do not inflate dashboard progress or due counts', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Quiz Semantics Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByTestId(`book-quiz-${bookId}`).click();
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await page.getByTestId('quiz-setup-primary-cta').click();
    await expect(page.getByTestId('quiz-ready-view')).toBeVisible();
    await page.getByTestId('quiz-ready-start').click();
    await expect(page.getByTestId('quiz-running-view')).toBeVisible();

    await answerSeededQuizQuestion(page, false);
    await expect(page.getByText(/第 2 問/)).toBeVisible();
    await answerSeededQuizQuestion(page, false);

    await expect(page.getByTestId('quiz-result-view')).toBeVisible();
    await page.getByTestId('quiz-result-back-dashboard').click();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const progress = await storageAction<{ learnedCount: number; percentage: number }>(page, 'getBookProgress', { bookId });
    const dueCount = await storageAction<number>(page, 'getDueCount');
    const masteryDist = await storageAction<{ total: number }>(page, 'getMasteryDistribution');
    const studiedWordIds = await storageAction<string[]>(page, 'getStudiedWordIdsByBook', { bookId });

    expect(progress.learnedCount).toBe(0);
    expect(progress.percentage).toBe(0);
    expect(dueCount).toBe(0);
    expect(masteryDist.total).toBe(0);
    expect(studiedWordIds).toEqual([]);
  });

  test('mobile quiz does not downgrade mastery for previously studied words', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Quiz Preserve Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await completeSeededStudySession(page, bookId);

    const masteryBeforeQuiz = await storageAction<{
      learning: number;
      review: number;
      total: number;
    }>(page, 'getMasteryDistribution');
    expect(masteryBeforeQuiz.learning).toBe(2);
    expect(masteryBeforeQuiz.review).toBe(0);

    await page.getByTestId(`book-quiz-${bookId}`).click();
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await page.getByTestId('quiz-setup-primary-cta').click();
    await expect(page.getByTestId('quiz-ready-view')).toBeVisible();
    await page.getByTestId('quiz-ready-start').click();
    await expect(page.getByTestId('quiz-running-view')).toBeVisible();

    await answerSeededQuizQuestion(page, false);
    await expect(page.getByText(/第 2 問/)).toBeVisible();
    await answerSeededQuizQuestion(page, false);

    await expect(page.getByTestId('quiz-result-view')).toBeVisible();
    await page.getByTestId('quiz-result-back-dashboard').click();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const masteryAfterQuiz = await storageAction<{
      learning: number;
      review: number;
      total: number;
    }>(page, 'getMasteryDistribution');
    const progressAfterQuiz = await storageAction<{ learnedCount: number }>(page, 'getBookProgress', { bookId });

    expect(masteryAfterQuiz.total).toBe(2);
    expect(masteryAfterQuiz.learning).toBe(2);
    expect(masteryAfterQuiz.review).toBe(0);
    expect(progressAfterQuiz.learnedCount).toBe(2);
  });

  test('student can back out from a running quiz with confirmation on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Quiz Back Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    await page.getByTestId(`book-quiz-${bookId}`).click();
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await page.getByTestId('quiz-setup-primary-cta').click();
    await expect(page.getByTestId('quiz-ready-view')).toBeVisible();
    await page.getByTestId('quiz-ready-start').click();
    await expect(page.getByTestId('quiz-running-view')).toBeVisible();

    await page.getByTestId('quiz-back-button').click();
    await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.quizExitConfirmDialog)).toBeVisible();
    await page.getByTestId('quiz-exit-cancel').click();
    await expect(page.getByTestId('quiz-running-view')).toBeVisible();

    await page.getByTestId('quiz-back-button').click();
    await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.quizExitConfirmDialog)).toBeVisible();
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.quizExitConfirm).click();
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
  });

  test('business student can use the mobile writing submit flow', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const studentContext = await browser.newContext({
      viewport: mobileViewport,
      userAgent: iphoneUserAgent,
      hasTouch: true,
      isMobile: true,
    });
    const adminPage = await adminContext.newPage();
    const studentPage = await studentContext.newPage();

    await loginGroupAdminDemo(adminPage);
    await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
    await adminPage.getByTestId('workspace-tab-writing').click();

    await loginBusinessStudentDemo(studentPage);
    await maybeCompleteOnboarding(studentPage);
    await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    const businessStudent = await getCurrentSessionUser(studentPage);
    expect(businessStudent?.uid).toBeTruthy();

    await adminPage.reload();
    await adminPage.getByTestId('workspace-tab-writing').click();

    await adminPage.getByTestId('writing-student-select').selectOption(businessStudent!.uid);
    await adminPage.getByTestId('writing-template-select').selectOption({ index: 1 });
    await adminPage.getByTestId('writing-generate-submit').click();
    await expect(adminPage.getByText(/自由英作文課題を生成しました/)).toBeVisible();
    const generatedAssignment = await getLatestWritingAssignmentForStudentUid(adminPage, 'all', businessStudent!.uid, 'DRAFT');
    expect(generatedAssignment?.id).toBeTruthy();
    await adminPage.getByRole('button', { name: new RegExp(generatedAssignment.submissionCode) }).click();
    await expect(adminPage.getByTestId('writing-issue-assignment')).toBeVisible();
    await adminPage.getByTestId('writing-issue-assignment').click();
    await expect(adminPage.getByText(/配布状態にしました/)).toBeVisible();
    await waitForWritingAssignment(adminPage, 'all', generatedAssignment.id, ['ISSUED']);
    await waitForWritingAssignment(studentPage, 'mine', generatedAssignment.id, ['ISSUED']);

    await studentPage.reload();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    await studentPage.getByTestId(`writing-open-submit-${generatedAssignment.id}`).click();
    await expect(studentPage.getByText('ファイル選択へ進む')).toBeVisible();
    await studentPage.getByRole('button', { name: 'ファイル選択へ進む' }).click();
    await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles({
      name: 'mobile-attempt.png',
      mimeType: 'image/png',
      buffer: toUploadBuffer('mobile-writing-attempt'),
    });
    await studentPage.getByRole('button', { name: '最終送信へ進む' }).click();
    await studentPage.getByPlaceholder(MOBILE_FLOW_WRITING.transcriptPlaceholder).fill(
      'Students should use tablets because they can review notes quickly and organize homework more clearly.',
    );
    await studentPage.getByTestId('writing-submit-upload').click();
    await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

    await adminContext.close();
    await studentContext.close();
  });

  test('business student can read returned feedback in a single mobile column', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const studentContext = await browser.newContext({
      viewport: mobileViewport,
      userAgent: iphoneUserAgent,
      hasTouch: true,
      isMobile: true,
    });
    const adminPage = await adminContext.newPage();
    const studentPage = await studentContext.newPage();

    await loginGroupAdminDemo(adminPage);
    await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
    await adminPage.getByTestId('workspace-tab-writing').click();

    await loginBusinessStudentDemo(studentPage);
    await maybeCompleteOnboarding(studentPage);
    await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    const businessStudent = await getCurrentSessionUser(studentPage);
    expect(businessStudent?.uid).toBeTruthy();

    await adminPage.reload();
    await adminPage.getByTestId('workspace-tab-writing').click();

    await adminPage.getByTestId('writing-student-select').selectOption(businessStudent!.uid);
    await adminPage.getByTestId('writing-template-select').selectOption({ index: 1 });
    await adminPage.getByTestId('writing-generate-submit').click();
    await expect(adminPage.getByText(/自由英作文課題を生成しました/)).toBeVisible();
    const generatedAssignment = await getLatestWritingAssignmentForStudentUid(adminPage, 'all', businessStudent!.uid, 'DRAFT');
    expect(generatedAssignment?.id).toBeTruthy();
    await adminPage.getByRole('button', { name: new RegExp(generatedAssignment.submissionCode) }).click();
    await expect(adminPage.getByTestId('writing-issue-assignment')).toBeVisible();
    await adminPage.getByTestId('writing-issue-assignment').click();
    await expect(adminPage.getByText(/配布状態にしました/)).toBeVisible();
    await waitForWritingAssignment(adminPage, 'all', generatedAssignment.id, ['ISSUED']);
    await waitForWritingAssignment(studentPage, 'mine', generatedAssignment.id, ['ISSUED']);

    await studentPage.reload();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    await studentPage.getByTestId(`writing-open-submit-${generatedAssignment.id}`).click();
    await studentPage.getByRole('button', { name: 'ファイル選択へ進む' }).click();
    await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles({
      name: 'mobile-feedback.png',
      mimeType: 'image/png',
      buffer: toUploadBuffer('mobile-feedback-attempt'),
    });
    await studentPage.getByRole('button', { name: '最終送信へ進む' }).click();
    await studentPage.getByPlaceholder(MOBILE_FLOW_WRITING.transcriptPlaceholder).fill(
      'Students should use tablets because they can review lessons quickly and share information with classmates.',
    );
    await studentPage.getByTestId('writing-submit-upload').click();
    await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

    await adminPage.reload();
    await adminPage.getByTestId('workspace-tab-writing').click();
    await adminPage.getByRole('button', { name: '添削キュー' }).click();
    await adminPage.locator('[data-testid^="writing-review-item-"]').first().click();
    await adminPage.getByTestId('writing-review-public-comment').fill('理由のつながりが伝わっています。次は語彙の選び方も広げましょう。');
    await adminPage.getByTestId('writing-approve-return').click();
    await expect(adminPage.getByText(/返却内容を確定しました。/)).toBeVisible();
    await waitForWritingAssignment(adminPage, 'all', generatedAssignment.id, ['RETURNED', 'COMPLETED']);
    await waitForWritingAssignment(studentPage, 'mine', generatedAssignment.id, ['RETURNED', 'COMPLETED']);

    await studentPage.reload();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    await studentPage.getByTestId(`writing-open-feedback-${generatedAssignment.id}`).click();
    await expect(studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingFeedbackMobileView)).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-comment')).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-improvements')).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-corrected')).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-strengths')).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-transcript')).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-assets')).toBeVisible();
    await expect(studentPage.getByRole('button', { name: 'AI比較を開く' })).toBeVisible();
    await expect(studentPage.locator('[data-testid^="writing-feedback-provider-"]')).toHaveCount(0);

    const commentBox = await studentPage.getByTestId('writing-feedback-comment').boundingBox();
    const improvementBox = await studentPage.getByTestId('writing-feedback-improvements').boundingBox();
    const strengthsBox = await studentPage.getByTestId('writing-feedback-strengths').boundingBox();
    expect(commentBox).not.toBeNull();
    expect(improvementBox).not.toBeNull();
    expect(strengthsBox).not.toBeNull();
    expect((commentBox?.y ?? 1000)).toBeLessThan(improvementBox?.y ?? 0);
    expect((improvementBox?.y ?? 1000)).toBeLessThan(strengthsBox?.y ?? 0);

    await studentPage.getByRole('button', { name: 'AI比較を開く' }).click();
    await expect(studentPage.locator('[data-testid^="writing-feedback-provider-"]').first()).toBeVisible();

    await adminContext.close();
    await studentContext.close();
  });
});
