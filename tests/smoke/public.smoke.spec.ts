import { expect, test } from './diagnostics';

import {
  expectPreviewDeployment,
  loginBusinessStudentDemo,
  maybeCompleteOnboarding,
  PUBLIC_BUSINESS_ROLE_KEYS,
} from './smoke-support';
import {
  getPublicBusinessRoleConfig,
  getPublicBusinessRoleDirectPath,
} from '../../shared/publicBusinessRoles';

const expectedDeploymentSha = process.env.PLAYWRIGHT_EXPECT_DEPLOYMENT_SHA?.trim();

test('public home starts with the learner CTA and edge login before auth', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('start-first-home')).toBeVisible();
  await expect(page.getByRole('heading', { name: /最初の画面から、すぐ単語学習を始める/ })).toBeVisible();
  await expect(page.getByTestId('demo-login-student')).toBeVisible();
  await expect(page.getByTestId('auth-edge-panel')).toBeVisible();
});

test('public readonly session endpoint is reachable before login', async ({ page }) => {
  const response = await page.request.get('/api/session');
  expect([200, 204]).toContain(response.status());
  if (expectedDeploymentSha) {
    expect(response.headers()['x-deployment-sha']).toBe(expectedDeploymentSha);
  }
  if (response.status() === 200) {
    await expect(response.json()).resolves.toBeNull();
  } else {
    await expect(response.text()).resolves.toBe('');
  }
});

test('public role card updates the URL and browser back returns to the start screen', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('open-public-role-instructor').click();
  await expect(page).toHaveURL(new RegExp(`${getPublicBusinessRoleDirectPath('instructor')}$`));
  await expect(page.getByTestId('public-role-page-instructor')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('start-first-home')).toBeVisible();
  await expect(page.getByTestId('demo-login-student')).toBeVisible();
});

test('public role link hub keeps the business role previews visible', async ({ page }) => {
  await page.goto('/public');

  await expect(page).toHaveURL(/\/public$/);
  await expect(page.getByTestId('business-role-preview-section')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-student')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-instructor')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-admin')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-service-admin')).toBeVisible();
});

test('public role link hub links every business role card to its dedicated route and browser back returns to the hub', async ({ page }) => {
  await page.goto('/public');
  await expect(page.getByTestId('business-role-preview-section')).toBeVisible();

  for (const roleKey of PUBLIC_BUSINESS_ROLE_KEYS) {
    const role = getPublicBusinessRoleConfig(roleKey);
    await page.getByTestId(role.cardActionTestId).click();
    await expect(page).toHaveURL(new RegExp(`${getPublicBusinessRoleDirectPath(roleKey)}$`));
    await expect(page.getByTestId(role.pageTestId)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/public$/);
    await expect(page.getByTestId('business-role-preview-section')).toBeVisible();
  }
});

test('public role pages always emit a noindex robots tag and service admin action stays safe', async ({ page }) => {
  await page.goto('/service-admin');

  await expect(page.getByTestId('public-role-page-service-admin')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,\s*nofollow,\s*noarchive/i);
  const previewSection = page.getByTestId('public-role-preview-service-admin');
  const previewTopBeforeClick = await previewSection.evaluate((element) => element.getBoundingClientRect().top);
  await page.getByTestId('demo-login-admin').click();

  const passwordGate = page.getByTestId('admin-demo-password');
  if (await passwordGate.isVisible({ timeout: 1000 }).catch(() => false)) {
    await expect(passwordGate).toBeVisible();
    return;
  }

  expect(previewTopBeforeClick).toBeGreaterThan(160);
  await expect.poll(
    async () => previewSection.evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    { timeout: 3000 },
  ).toBeLessThan(160);
});

test('service admin dedicated access link resolves to the protected admin entrypoint', async ({ page }) => {
  await page.goto('/admin-access');

  await expect(page.getByTestId('public-role-page-service-admin')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,\s*nofollow,\s*noarchive/i);
  await expect(page.getByTestId('demo-login-admin')).toBeVisible();
});

test('preview deployment surfaces a visible preview banner and noindex marker', async ({ page }) => {
  test.skip(!expectPreviewDeployment, 'preview-only deployment validation');

  await page.goto('/');

  await expect(page.getByTestId('preview-deployment-banner')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);
});

test('preview deployment supports demo login, D1 read, and Writing visibility', async ({ page }) => {
  test.skip(!expectPreviewDeployment, 'preview-only deployment validation');

  await loginBusinessStudentDemo(page);
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const writingDetails = page.getByTestId('dashboard-task-details-writing');
  if (await writingDetails.count()) {
    if (await writingDetails.getAttribute('open') === null) {
      await writingDetails.locator('summary').click();
    }
    await expect(writingDetails).toHaveAttribute('open', '');
  }
  const writingSection = page.getByTestId('writing-student-section');
  await writingSection.scrollIntoViewIfNeeded();
  await expect(writingSection).toBeVisible();
  await expect(writingSection).toBeInViewport();
  await expect(writingSection.getByRole('heading', { name: '自由英作文', exact: true })).toBeVisible();
  await expect(writingSection.getByTestId('writing-refresh-button')).toBeEnabled();
  await expect(writingSection.getByTestId('writing-last-refreshed')).not.toContainText('未取得');
  await expect(writingSection.getByRole('alert')).toHaveCount(0);
});
