import { attachSmokeDiagnostics, expect, test } from './diagnostics';

import {
  MOBILE_FLOW_TEST_IDS,
  completeDiagnostic,
  findUnexpectedHorizontalOverflow,
  getCurrentSessionUser,
  loginBusinessStudentDemo,
  loginGroupAdminDemo,
  maybeCompleteOnboarding,
  seedPhrasebook,
  storageAction,
  updateSessionProfile,
} from './smoke-support';

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
  await expect(page.getByText('今日やること')).toBeVisible();
  await expect(page.getByTestId('dashboard-english-practice-entry')).toHaveCount(1);
  await expect(page.getByTestId('dashboard-learning-route-englishPractice')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-dock')).toBeVisible();
  await expect(page.getByTestId('dashboard-practice-lane-grammar')).toBeVisible();
  await expect(page.getByTestId('dashboard-practice-lane-translation')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-lane-reading')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-lane-writing')).toHaveCount(0);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByText('今日の英語演習')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);

  await page.getByTestId('dashboard-practice-lane-grammar').click();
  await expect(page).toHaveURL(/\/english-practice\/grammar$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-focus')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-hero-section')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-reference-rail')).toHaveCount(0);
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByRole('heading', { name: '参考書型の文法演習' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-dock')).toBeVisible();

  await page.getByTestId('dashboard-practice-lane-grammar').click();
  await expect(page).toHaveURL(/\/english-practice\/grammar$/);
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toHaveCount(0);
  await expect(page.getByTestId('dashboard-reference-rail')).toHaveCount(0);
  await page.getByTestId('english-practice-close').click();
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('desktop student dashboard keeps the command center calm and above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');

  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  const commandCenter = page.getByTestId('dashboard-command-center');
  const primaryCta = page.getByTestId('student-hero-primary-cta');
  await expect(commandCenter).toBeVisible();
  await expect(primaryCta).toHaveCount(1);
  await expect(page.getByTestId('dashboard-task-overview-rail')).toBeVisible();
  await expect(page.getByTestId('dashboard-task-overview-today')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-task-reference-library')).toBeVisible();

  const ctaBox = await primaryCta.boundingBox();
  const commandBox = await commandCenter.boundingBox();
  expect(ctaBox, 'primary CTA should have a layout box').not.toBeNull();
  expect(commandBox, 'command center should have a layout box').not.toBeNull();
  expect(ctaBox!.y + ctaBox!.height, 'primary CTA should stay inside the first desktop viewport').toBeLessThanOrEqual(768);
  expect(commandBox!.y + commandBox!.height, 'command center should stay inside the first desktop viewport').toBeLessThanOrEqual(768);

  const palette = await commandCenter.evaluate((element) => {
    const centerStyle = window.getComputedStyle(element);
    const cta = element.querySelector('[data-testid="student-hero-primary-cta"]');
    const ctaStyle = cta ? window.getComputedStyle(cta) : null;
    return {
      centerBackground: centerStyle.backgroundColor,
      ctaBackground: ctaStyle?.backgroundColor || '',
    };
  });
  expect(palette.centerBackground).toBe('rgb(255, 255, 255)');
  expect(palette.ctaBackground).toBe('rgb(255, 122, 0)');

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(commandCenter).toBeVisible();
  const mediumDesktopBox = await commandCenter.boundingBox();
  expect(mediumDesktopBox, 'command center should have a medium desktop layout box').not.toBeNull();
  expect(
    mediumDesktopBox!.y + mediumDesktopBox!.height,
    'command center should not collapse into a tall single column on 1024px web',
  ).toBeLessThanOrEqual(768);
  const referenceSections = page.getByTestId('dashboard-reference-sections');
  await expect(referenceSections).toBeVisible();
  const referenceSectionsBox = await referenceSections.boundingBox();
  expect(referenceSectionsBox, 'reference sections should have a full-width layout box').not.toBeNull();
  expect(
    Math.round(referenceSectionsBox!.x),
    'reference details should align with the command center instead of staying in the right rail',
  ).toBe(Math.round(mediumDesktopBox!.x));
  expect(
    referenceSectionsBox!.width,
    'reference details should span the main dashboard column, not only the right rail',
  ).toBeGreaterThanOrEqual(mediumDesktopBox!.width - 2);

  const offenders = await findUnexpectedHorizontalOverflow(page);
  expect(offenders).toEqual([]);

  await page.getByTestId('dashboard-task-reference-library').click();
  await expect.poll(async () => {
    const box = await page.getByTestId('dashboard-library-section').boundingBox();
    return box?.y ?? 9999;
  }).toBeLessThanOrEqual(260);

  const announcementsShortcut = page.getByTestId('dashboard-task-reference-announcements');
  if (await announcementsShortcut.count()) {
    await announcementsShortcut.scrollIntoViewIfNeeded();
    await announcementsShortcut.click();
    await expect.poll(async () => {
      const box = await page.getByTestId('dashboard-announcements-section').boundingBox();
      return box?.y ?? 9999;
    }).toBeLessThanOrEqual(260);
  }

  await primaryCta.scrollIntoViewIfNeeded();
  await primaryCta.click();
  const startedStudy = await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront).isVisible({ timeout: 5000 }).catch(() => false);
  if (!startedStudy) {
    await expect(page.getByTestId('phrasebook-create-modal')).toBeVisible();
  }
});

test('desktop dashboard keeps lower details full-width when the right rail is present', async ({ browser, baseURL }, testInfo) => {
  test.skip(!baseURL, 'smoke baseURL is required for API-seeded dashboard state');
  const appBaseURL = baseURL!;
  const adminContext = await browser.newContext({
    baseURL: appBaseURL,
    viewport: { width: 1366, height: 900 },
  });
  const studentContext = await browser.newContext({
    baseURL: appBaseURL,
    viewport: { width: 1366, height: 900 },
  });
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();
  attachSmokeDiagnostics(adminPage, testInfo, 'desktop-right-rail-admin');
  attachSmokeDiagnostics(studentPage, testInfo, 'desktop-right-rail-student');

  try {
    await loginGroupAdminDemo(adminPage);
    await loginBusinessStudentDemo(studentPage);
    await updateSessionProfile(studentPage, {
      grade: 'JHS3',
      englishLevel: 'B1',
    });
    const student = await getCurrentSessionUser(studentPage);
    expect(student?.uid).toBeTruthy();

    const importResult = await seedPhrasebook(studentPage, 'Right Rail Regression Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    const weeklyMission = await storageAction<any>(adminPage, 'createWeeklyMission', {
      learningTrack: 'EIKEN_2',
      title: 'Right Rail Regression Mission',
      rationale: 'desktop lower details should not stay in the right rail',
      bookId,
      bookTitle: 'Right Rail Regression Drill',
      newWordsTarget: 2,
      reviewWordsTarget: 0,
      quizTargetCount: 0,
    });
    expect(weeklyMission.id).toBeTruthy();
    await storageAction(adminPage, 'assignWeeklyMission', {
      missionId: weeklyMission.id,
      studentUid: student?.uid,
    });

    await studentPage.goto('/dashboard');
    await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
    await expect(studentPage.getByTestId('dashboard-primary-stack')).toBeVisible();
    await expect(studentPage.getByTestId('dashboard-reference-rail')).toBeVisible();
    await expect(studentPage.getByTestId('dashboard-reference-sections')).toBeVisible();

    const commandBox = await studentPage.getByTestId('dashboard-command-center').boundingBox();
    const railBox = await studentPage.getByTestId('dashboard-reference-rail').boundingBox();
    const referenceBox = await studentPage.getByTestId('dashboard-reference-sections').boundingBox();
    const libraryBox = await studentPage.getByTestId('dashboard-library-section').boundingBox();
    expect(commandBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    expect(referenceBox).not.toBeNull();
    expect(libraryBox).not.toBeNull();
    expect(Math.round(referenceBox!.x)).toBe(Math.round(commandBox!.x));
    expect(referenceBox!.width).toBeGreaterThanOrEqual(commandBox!.width - 2);
    expect(referenceBox!.x).toBeLessThan(railBox!.x - 16);
    expect(referenceBox!.width).toBeGreaterThan(railBox!.width * 1.8);
    expect(libraryBox!.width).toBeGreaterThan(railBox!.width * 1.8);

    const containment = await studentPage.evaluate(() => {
      const rail = document.querySelector('[data-testid="dashboard-reference-rail"]');
      const details = document.querySelector('[data-testid="dashboard-reference-sections"]');
      const library = document.querySelector('[data-testid="dashboard-library-section"]');
      return {
        detailsInsideRail: Boolean(rail && details && rail.contains(details)),
        libraryInsideRail: Boolean(rail && library && rail.contains(library)),
      };
    });
    expect(containment).toEqual({
      detailsInsideRail: false,
      libraryInsideRail: false,
    });

    const offenders = await findUnexpectedHorizontalOverflow(studentPage);
    expect(offenders).toEqual([]);
  } finally {
    await adminContext.close();
    await studentContext.close();
  }
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

test('student can open the dedicated practice screen from a direct route', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();

  await page.goto('/english-practice/grammar');
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-focus')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-hero-section')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-reference-rail')).toHaveCount(0);
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByTestId('layout-nav-home')).toBeVisible();
  await expect(page.getByTestId('layout-nav-english-practice-current')).toBeVisible();
  await expect(page.getByTestId('layout-nav-english-practice-current')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('english-practice-lane-grammar')).toBeVisible();
  await expect(page.getByTestId('english-practice-lane-overview')).toHaveCount(0);
  await expect(page.getByText('文法範囲を選ぶ')).toBeVisible();
  await expect(page.getByText('今日の英語演習')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);

  await page.getByTestId('english-practice-lane-translation').click();
  await expect(page).toHaveURL(/\/english-practice\/translation$/);
  await expect(page.getByRole('heading', { name: '和訳トレーニング' })).toBeVisible();

  await page.getByTestId('english-practice-lane-reading').click();
  await expect(page).toHaveURL(/\/english-practice\/reading$/);
  await expect(page.getByTestId('reading-practice-view')).toBeVisible();

  await page.getByTestId('english-practice-lane-writing').click();
  await expect(page).toHaveURL(/\/english-practice\/writing$/);
  await expect(page.getByTestId('english-practice-lane-writing-panel')).toBeVisible();

  await page.getByTestId('english-practice-close').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();

  await page.goto('/english-practice');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);
});
