import { expect, test } from '@playwright/test';

import {
  MOBILE_FLOW_TEST_IDS,
  completeDiagnostic,
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

test('student can open the english practice workspace from a direct route', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();

  await page.goto('/english-practice');
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByTestId('english-practice-lane-overview')).toBeVisible();
});
