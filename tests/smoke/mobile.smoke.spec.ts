import { expect, test, type Page } from '@playwright/test';

import {
  MOBILE_FLOW_TEST_IDS,
  MOBILE_FLOW_WRITING,
  answerSeededQuizQuestion,
  completeSeededStudySession,
  findUnexpectedHorizontalOverflow,
  getCurrentSessionUser,
  getLatestWritingAssignmentForStudentUid,
  getBookBandIndex,
  loginBusinessStudentDemo,
  loginGroupAdminDemo,
  maybeCompleteOnboarding,
  resolveWritingStudentSelectValue,
  runtimeAdminPost,
  seedLeveledPhrasebooks,
  seedPhrasebook,
  storageAction,
  toUploadBuffer,
  updateSessionProfile,
  waitForWritingAssignment,
} from './smoke-support';

const openWritingOpsPanel = async (page: Page) => {
  await page.reload();
  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await page.getByTestId('workspace-tab-writing').click();
  await expect(page.getByTestId('writing-ops-panel')).toBeVisible();
};

const dismissAnnouncementModalIfPresent = async (page: Page) => {
  const modal = page.getByTestId('announcement-modal');
  const isVisible = await modal.isVisible({ timeout: 500 }).catch(() => false);
  if (!isVisible) return;

  await modal.getByRole('button', { name: '閉じる' }).click();
  await expect(modal).toHaveCount(0);
};

const bootstrapDemoWritingOps = async (page: Page) => {
  const bootstrap = await runtimeAdminPost<{ studentUid: string }>(page, 'runtime-admin/bootstrap-demo-organization');
  await storageAction(page, 'sendInstructorNotification', {
    studentUid: bootstrap.studentUid,
    message: '導入確認のため、最初のフォロー通知を送ります。',
    triggerReason: 'smoke-mobile-writing-bootstrap',
    usedAi: false,
    interventionKind: 'REVIEW_RESTART',
  });
  await openWritingOpsPanel(page);
};

const selectWritingStudent = async (
  adminPage: Page,
  student: { uid?: string | null; email?: string | null; displayName?: string | null },
) => {
  const selectedStudentUid = await resolveWritingStudentSelectValue(adminPage, student, {
    timeoutMs: 10_000,
    onRetry: async () => openWritingOpsPanel(adminPage),
  });
  await adminPage.getByTestId('writing-student-select').selectOption(selectedStudentUid);
  return selectedStudentUid;
};

const expectMobileFeedbackSingleColumn = async (page: Page) => {
  const sectionBoxes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    right: number;
  }> = [];

  for (const id of MOBILE_FLOW_WRITING.feedbackSectionOrder) {
    const section = page.getByTestId(id);
    await expect(section).toBeVisible();
    const box = await section.boundingBox();
    expect(box, `${id} should render with a measurable mobile box`).not.toBeNull();
    sectionBoxes.push({
      id,
      x: box?.x ?? 0,
      y: box?.y ?? 0,
      width: box?.width ?? 0,
      right: (box?.x ?? 0) + (box?.width ?? 0),
    });
  }

  const firstLeft = Math.round(sectionBoxes[0]?.x ?? 0);
  for (const box of sectionBoxes) {
    expect(Math.round(box.x), `${box.id} should align to the feedback column`).toBeGreaterThanOrEqual(firstLeft - 2);
    expect(Math.round(box.x), `${box.id} should align to the feedback column`).toBeLessThanOrEqual(firstLeft + 2);
    expect(box.width, `${box.id} should fit within the mobile viewport`).toBeLessThanOrEqual(390);
    expect(box.right, `${box.id} should not overflow the mobile viewport`).toBeLessThanOrEqual(391);
  }

  for (let index = 1; index < sectionBoxes.length; index += 1) {
    expect(sectionBoxes[index].y, `${sectionBoxes[index].id} should remain below ${sectionBoxes[index - 1].id}`).toBeGreaterThan(sectionBoxes[index - 1].y);
  }

  const offenders = await findUnexpectedHorizontalOverflow(page);
  expect(offenders).toEqual([]);
};

test.describe('student mobile ux', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
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
    await page.getByTestId('dashboard-quicknav-english-practice').click();

    await expect.poll(async () => {
      const box = await page.getByTestId('dashboard-english-practice-entry').boundingBox();
      return box?.y ?? 9999;
    }).toBeLessThanOrEqual(220);

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
    await dismissAnnouncementModalIfPresent(page);

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
    await expect(page.getByTestId('phrasebook-create-submit')).toBeDisabled();
    await expect(page.getByTestId('phrasebook-create-plan-warning')).toContainText('AI教材化は使えません');
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
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      hasTouch: true,
      isMobile: true,
    });
    const adminPage = await adminContext.newPage();
    const studentPage = await studentContext.newPage();

    await loginGroupAdminDemo(adminPage);
    await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
    await bootstrapDemoWritingOps(adminPage);

    await loginBusinessStudentDemo(studentPage);
    await maybeCompleteOnboarding(studentPage);
    await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    const businessStudent = await getCurrentSessionUser(studentPage);
    expect(businessStudent?.uid).toBeTruthy();

    await openWritingOpsPanel(adminPage);
    const selectedStudentUid = await selectWritingStudent(adminPage, businessStudent!);
    await adminPage.getByTestId('writing-template-select').selectOption({ index: 1 });
    await adminPage.getByTestId('writing-generate-submit').click();
    await expect(adminPage.getByText(/自由英作文課題を生成しました/)).toBeVisible();
    const generatedAssignment = await getLatestWritingAssignmentForStudentUid(adminPage, 'all', selectedStudentUid, 'DRAFT');
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
    await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles([
      {
        name: 'mobile-attempt.pdf',
        mimeType: 'application/pdf',
        buffer: toUploadBuffer('mobile-writing-attempt-pdf'),
      },
      {
        name: 'mobile-attempt.png',
        mimeType: 'image/png',
        buffer: toUploadBuffer('mobile-writing-attempt-image'),
      },
    ]);
    await expect(studentPage.getByTestId('writing-file-validation-message')).toContainText('PDF と画像は混在できません');
    await expect(studentPage.getByRole('button', { name: '最終送信へ進む' })).toBeDisabled();
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
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      hasTouch: true,
      isMobile: true,
    });
    const adminPage = await adminContext.newPage();
    const studentPage = await studentContext.newPage();

    await loginGroupAdminDemo(adminPage);
    await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
    await bootstrapDemoWritingOps(adminPage);

    await loginBusinessStudentDemo(studentPage);
    await maybeCompleteOnboarding(studentPage);
    await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    const businessStudent = await getCurrentSessionUser(studentPage);
    expect(businessStudent?.uid).toBeTruthy();

    await openWritingOpsPanel(adminPage);
    const selectedStudentUid = await selectWritingStudent(adminPage, businessStudent!);
    await adminPage.getByTestId('writing-template-select').selectOption({ index: 1 });
    await adminPage.getByTestId('writing-generate-submit').click();
    await expect(adminPage.getByText(/自由英作文課題を生成しました/)).toBeVisible();
    const generatedAssignment = await getLatestWritingAssignmentForStudentUid(adminPage, 'all', selectedStudentUid, 'DRAFT');
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
    await adminPage.getByRole('button', { name: '添削キュー', exact: true }).click();
    await adminPage.locator('[data-testid^="writing-review-item-"]').first().click();
    await adminPage.getByTestId('writing-review-public-comment').fill('理由のつながりが伝わっています。次は語彙の選び方も広げましょう。');
    await adminPage.getByTestId('writing-approve-return').click();
    await expect(adminPage.getByText(/返却内容を確定しました。/)).toBeVisible();

    await studentPage.reload();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
    await studentPage.locator('[data-testid^="writing-open-feedback-"]').first().click();
    await expect(studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingFeedbackMobileView)).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-comment')).toBeVisible();
    await expect(studentPage.getByTestId('writing-feedback-corrected')).toBeVisible();
    await expectMobileFeedbackSingleColumn(studentPage);

    await adminContext.close();
    await studentContext.close();
  });
});
