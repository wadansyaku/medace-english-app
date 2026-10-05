import { exposeStudentDemo } from './smoke-support';
import { formatDateKey } from '../../utils/date';
import { attachSmokeDiagnostics, expect, test } from './diagnostics';

import {
  MOBILE_FLOW_TEST_IDS,
  findUnexpectedHorizontalOverflow,
  finishStudySession,
  getCurrentSessionUser,
  loginBusinessStudentDemo,
  loginGroupAdminDemo,
  maybeCompleteOnboarding,
  openDashboardReference,
  openDashboardTaskDetails,
  seedPhrasebook,
  storageAction,
  updateSessionProfile,
} from './smoke-support';

test('demo student can start immediately without onboarding and reach the dashboard', async ({ page }) => {
  await page.goto('/');

  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await expect(page.getByTestId('onboarding-profile')).toHaveCount(0);
  await expect(page.getByText('今日やること')).toBeVisible();
  await expect(page.getByTestId('dashboard-english-practice-entry')).toHaveCount(1);
  await expect(page.getByTestId('dashboard-learning-route-englishPractice')).toHaveCount(0);
  await expect(page.getByTestId('student-hero-primary-cta')).toBeVisible();
  const grammarEntry = page.getByTestId('dashboard-practice-lane-grammar');
  if (await grammarEntry.count()) await expect(grammarEntry).toBeVisible();
  else await expect(page.getByTestId('student-hero-primary-cta')).toContainText('文法');
  await expect(page.getByTestId('dashboard-practice-lane-translation')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-lane-reading')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-lane-writing')).toHaveCount(0);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByText('今日の英語演習')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);

  await (await grammarEntry.count() ? grammarEntry : page.getByTestId('student-hero-primary-cta')).click();
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
  await expect(page.getByTestId('student-hero-primary-cta')).toBeVisible();

  await (await grammarEntry.count() ? grammarEntry : page.getByTestId('student-hero-primary-cta')).click();
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

  await exposeStudentDemo(page);
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
      centerBackgroundImage: centerStyle.backgroundImage,
      ctaBackground: ctaStyle?.backgroundColor || '',
      ctaForeground: ctaStyle?.color || '',
    };
  });
  expect(palette.centerBackground).toBe('rgb(255, 255, 255)');
  expect(palette.centerBackgroundImage).toBe('none');
  expect(palette.ctaBackground).toBe('rgb(246, 109, 11)');
  expect(palette.ctaForeground).toBe('rgb(47, 22, 9)');
  await expect(page.getByTestId('app-shell')).toHaveCSS('background-color', 'rgb(253, 243, 237)');
  await expect(page.getByTestId('app-shell')).toHaveCSS('background-image', 'none');

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(commandCenter).toBeVisible();
  const mediumDesktopBox = await commandCenter.boundingBox();
  expect(mediumDesktopBox, 'command center should have a medium desktop layout box').not.toBeNull();
  expect(
    mediumDesktopBox!.y + mediumDesktopBox!.height,
    'command center should not collapse into a tall single column on 1024px web',
  ).toBeLessThanOrEqual(768);
  await expect(page.getByTestId('dashboard-reference-panel')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-library-section')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-progress-section')).toHaveCount(0);
  const referencePanel = await openDashboardReference(page, 'library');
  const referencePanelBox = await referencePanel.boundingBox();
  const referenceRailBox = await page.getByTestId('dashboard-reference-rail').boundingBox();
  expect(referencePanelBox, 'selected details should have a full-width layout box').not.toBeNull();
  expect(referenceRailBox).not.toBeNull();
  expect(Math.round(referencePanelBox!.x)).toBe(Math.round(referenceRailBox!.x));
  expect(Math.round(referencePanelBox!.width)).toBe(Math.round(referenceRailBox!.width));
  await expect(page.getByTestId('dashboard-library-section')).toBeInViewport();
  expect(await findUnexpectedHorizontalOverflow(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(referencePanel).toHaveCount(0);
  await expect(page.getByTestId('dashboard-task-reference-library')).toBeFocused();
  await expect(page.getByTestId('dashboard-task-reference-library')).toHaveAttribute('aria-pressed', 'false');

  const announcementsEntry = page.getByTestId('dashboard-task-reference-announcements');
  if (await announcementsEntry.count()) {
    const menuSummary = announcementsEntry.locator('xpath=ancestor::details').locator('summary');
    await openDashboardReference(page, 'announcements');
    await expect(page.getByTestId('dashboard-announcements-section')).toBeVisible();
    await expect(page.getByTestId('dashboard-library-section')).toHaveCount(0);
    await page.getByRole('button', { name: '閉じて今日の画面に戻る', exact: true }).click();
    await expect(page.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(menuSummary).toBeFocused();
  }

  await primaryCta.scrollIntoViewIfNeeded();
  await primaryCta.click();
  await expect.poll(async () => {
    if (await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront).count()) {
      return 'study';
    }
    if (await page.getByTestId('phrasebook-create-modal').count()) {
      return 'phrasebook';
    }
    if (await page.getByTestId('english-practice-hub').count()) {
      await expect(page).toHaveURL(/\/english-practice\/grammar$/);
      return 'practice';
    }
    const mainText = await page.locator('main').innerText({ timeout: 1000 }).catch(() => '');
    if (mainText.includes('今日のクエスト') && mainText.includes('答えを確認')) {
      return 'study';
    }
    return 'pending';
  }, {
    message: 'primary CTA should open the available study, grammar trial, or phrasebook creation route',
    timeout: 20000,
  }).not.toBe('pending');
});

test('desktop dashboard keeps one selected resource full-width and mission deadlines visible', async ({ browser, baseURL }, testInfo) => {
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
    await expect(studentPage.getByTestId('student-hero-primary-cta')).toHaveCount(1);
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    const missionDetails = studentPage.getByTestId('dashboard-task-details-mission');
    await expect(missionDetails.locator('summary')).toContainText(`期限 ${formatDateKey(weeklyMission.dueAt)}`);
    await expect(studentPage.getByTestId('dashboard-mission-section')).toBeHidden();
    await openDashboardTaskDetails(studentPage, 'mission');
    await expect(studentPage.getByTestId('dashboard-mission-section')).toContainText('Right Rail Regression Mission');
    await missionDetails.locator('summary').click();

    await openDashboardReference(studentPage, 'library');
    await expect(studentPage.getByTestId('dashboard-progress-section')).toHaveCount(0);
    const { commandBox, referenceBox, libraryBox } = await studentPage.evaluate(() => {
      const box = (testId: string) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return { commandBox: box('dashboard-command-center'), referenceBox: box('dashboard-reference-panel'), libraryBox: box('dashboard-library-section') };
    });
    expect(commandBox).not.toBeNull();
    expect(referenceBox).not.toBeNull();
    expect(libraryBox).not.toBeNull();
    expect(Math.abs(referenceBox!.x - commandBox!.x)).toBeLessThanOrEqual(1);
    expect(referenceBox!.width).toBeGreaterThanOrEqual(commandBox!.width - 2);
    expect(libraryBox!.width).toBeGreaterThanOrEqual(commandBox!.width - 2);
    await studentPage.getByRole('button', { name: '閉じて今日の画面に戻る', exact: true }).click();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(studentPage.getByTestId('dashboard-task-reference-library')).toBeFocused();
    await openDashboardReference(studentPage, 'progress');
    await expect(studentPage.getByTestId('dashboard-library-section')).toHaveCount(0);
    await expect(studentPage.getByTestId('dashboard-progress-section')).toBeVisible();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(1);
    await studentPage.keyboard.press('Escape');
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(studentPage.getByTestId('dashboard-task-reference-progress')).toBeFocused();

    const planEntry = studentPage.getByTestId('dashboard-task-reference-plan');
    const otherMenu = planEntry.locator('xpath=ancestor::details');
    const otherSummary = otherMenu.locator('summary');
    await otherSummary.click();
    await expect(planEntry).toBeVisible();
    await planEntry.focus();
    await studentPage.keyboard.press('Escape');
    await expect(otherMenu).not.toHaveAttribute('open', '');
    await expect(otherSummary).toBeFocused();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await openDashboardReference(studentPage, 'plan');
    await expect(studentPage.getByTestId('dashboard-plan-anchor')).toBeVisible();
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1366, height: 900 }]) {
      await studentPage.setViewportSize(viewport);
      await studentPage.getByTestId('dashboard-plan-anchor').scrollIntoViewIfNeeded();
      expect(await studentPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await studentPage.screenshot({ path: testInfo.outputPath(`standard-plan-${viewport.width}.png`) });
    }
    await expect(studentPage.getByTestId('dashboard-progress-section')).toHaveCount(0);
    await studentPage.getByRole('button', { name: '閉じて今日の画面に戻る', exact: true }).click();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(otherSummary).toBeFocused();

    // These reference sections also own a task ref; reselecting must keep panel focus.
    const repeatSection = await studentPage.getByTestId('dashboard-task-reference-weakness').count() ? 'weakness' : 'writing';
    const repeatEntry = studentPage.getByTestId(`dashboard-task-reference-${repeatSection}`);
    await expect(repeatEntry).toHaveCount(1);
    const repeatSummary = repeatEntry.locator('xpath=ancestor::details').locator('summary');
    await openDashboardReference(studentPage, repeatSection);
    await repeatSummary.click();
    await expect(repeatEntry).toBeVisible();
    await repeatEntry.focus();
    await studentPage.keyboard.press('Enter');
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(1);
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toBeFocused();
    await studentPage.keyboard.press('Escape');
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(repeatSummary).toBeVisible();
    await expect(repeatSummary).toBeFocused();
    await expect(repeatEntry).toBeHidden();

    const offenders = await findUnexpectedHorizontalOverflow(studentPage);
    expect(offenders).toEqual([]);
  } finally {
    await adminContext.close();
    await studentContext.close();
  }
});

test('study routes survive reload and finish back on the dashboard path', async ({ page }) => {
  await page.goto('/');

  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  const importResult = await seedPhrasebook(page, 'Route Persistence Drill');
  const bookId = importResult.importedBookIds?.[0];
  expect(bookId).toBeTruthy();

  await page.goto(`/study/${bookId}`);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();
  await page.reload();
  await Promise.race([
    page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront).waitFor({ state: 'visible', timeout: 10_000 }),
    page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3).waitFor({ state: 'visible', timeout: 10_000 }),
  ]);

  await finishStudySession(page, 4);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
});

test('student can open the dedicated practice screen from a direct route', async ({ page }) => {
  await page.goto('/');

  await exposeStudentDemo(page);
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
