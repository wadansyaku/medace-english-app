import { expect, test } from '@playwright/test';

import {
  MOBILE_FLOW_TEST_IDS,
  completeDiagnostic,
  findUnexpectedHorizontalOverflow,
  maybeCompleteOnboarding,
  seedPhrasebook,
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
  await expect(page.getByText('今日の入口')).toBeVisible();
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
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
  await expect(page.getByTestId('dashboard-practice-focus')).toBeVisible();
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByRole('heading', { name: '参考書型の文法演習' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-dock')).toBeVisible();

  await page.getByTestId('dashboard-practice-lane-grammar').click();
  await expect(page).toHaveURL(/\/english-practice\/grammar$/);
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
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
  expect(palette.ctaBackground).toBe('rgb(194, 65, 12)');

  const offenders = await findUnexpectedHorizontalOverflow(page);
  expect(offenders).toEqual([]);
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

test('student can open the integrated practice section from a direct route', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();

  await page.goto('/english-practice/grammar');
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
  await expect(page.getByTestId('dashboard-practice-focus')).toBeVisible();
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
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

  await page.goto('/english-practice');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);
});
