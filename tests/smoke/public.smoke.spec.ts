import { expect, test } from './diagnostics';

import {
  expectPreviewDeployment,
  loginBusinessStudentDemo,
  maybeCompleteOnboarding,
  openDashboardWriting,
  PUBLIC_BUSINESS_ROLE_KEYS,
} from './smoke-support';
import {
  getPublicBusinessRoleConfig,
  getPublicBusinessRoleDirectPath,
} from '../../shared/publicBusinessRoles';

const expectedDeploymentSha = process.env.PLAYWRIGHT_EXPECT_DEPLOYMENT_SHA?.trim();

test('public home offers clear account and learner trial actions before auth', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('start-first-home')).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日の単語学習', exact: true })).toBeVisible();
  await expect(page.getByTestId('start-first-guest')).toBeVisible();
  await expect(page.getByTestId('demo-login-student')).toBeHidden();
  await expect(page.getByTestId('start-first-login')).toBeVisible();
  await expect(page.getByTestId('start-first-signup')).toBeVisible();
  await expect(page.getByTestId('auth-product-explanation')).toHaveCount(0);
  await expect(page.getByTestId('business-role-preview-section')).toHaveCount(0);
  for (const roleKey of PUBLIC_BUSINESS_ROLE_KEYS) {
    await expect(page.getByTestId(getPublicBusinessRoleConfig(roleKey).cardActionTestId)).toHaveCount(0);
  }
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

test('a dedicated staff URL opens its entry and browser back returns to the student start screen', async ({ page }) => {
  await page.goto('/');

  await page.goto(getPublicBusinessRoleDirectPath('instructor'));
  await expect(page).toHaveURL(new RegExp(`${getPublicBusinessRoleDirectPath('instructor')}$`));
  await expect(page.getByTestId('public-role-page-instructor')).toBeVisible();
  await expect(page.getByTestId('auth-email-input')).toBeVisible();
  await expect(page.getByTestId('instructor-dashboard')).toHaveCount(0);
  const sessionResponse = await page.request.get('/api/session');
  expect([200, 204]).toContain(sessionResponse.status());
  if (sessionResponse.status() === 200) await expect(sessionResponse.json()).resolves.toBeNull();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('start-first-home')).toBeVisible();
  await expect(page.getByTestId('start-first-guest')).toBeVisible();
});

test('public learner guide exposes only the student entry', async ({ page }) => {
  await page.goto('/public');

  await expect(page).toHaveURL(/\/public$/);
  await expect(page.getByTestId('business-role-preview-section')).toBeVisible();
  await expect(page.getByTestId('business-role-preview-student')).toBeVisible();
  for (const id of ['business-role-preview-instructor', 'business-role-preview-admin', 'business-role-preview-service-admin']) await expect(page.getByTestId(id)).toHaveCount(0);
});

test('public learner guide links to the student route and browser back returns to the guide', async ({ page }) => {
  await page.goto('/public');
  await expect(page.getByTestId('business-role-preview-section')).toBeVisible();

  for (const roleKey of ['student'] as const) {
    const role = getPublicBusinessRoleConfig(roleKey);
    await page.getByTestId(role.cardActionTestId).click();
    await expect(page).toHaveURL(new RegExp(`${getPublicBusinessRoleDirectPath(roleKey)}$`));
    await expect(page.getByTestId(role.pageTestId)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/public$/);
    await expect(page.getByTestId('business-role-preview-section')).toBeVisible();
  }
});

test('public staff entry emits noindex and keeps the administrator workspace behind real login', async ({ page }) => {
  await page.goto('/service-admin');

  await expect(page.getByTestId('public-role-page-service-admin')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,\s*nofollow,\s*noarchive/i);
  await expect(page.getByTestId('auth-email-input')).toBeVisible();
  await expect(page.getByTestId('auth-password-input')).toBeVisible();
  await expect(page.getByTestId('demo-login-admin')).toHaveCount(0);
  await expect(page.getByTestId('public-role-preview-service-admin')).toHaveCount(0);
  await expect(page.getByTestId('admin-password-recovery-requests')).toHaveCount(0);
});

test('service admin dedicated access link resolves to the protected admin entrypoint', async ({ page }) => {
  await page.goto('/admin-access');

  await expect(page.getByTestId('public-role-page-service-admin')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex,\s*nofollow,\s*noarchive/i);
  await expect(page.getByTestId('auth-email-input')).toBeVisible();
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
  await openDashboardWriting(page);
  const writingSection = page.getByTestId('writing-student-section');
  await writingSection.scrollIntoViewIfNeeded();
  await expect(writingSection).toBeVisible();
  await expect(writingSection).toBeInViewport();
  await expect(writingSection.getByRole('heading', { name: '自由英作文', exact: true })).toBeVisible();
  await expect(writingSection.getByTestId('writing-refresh-button')).toBeEnabled();
  await expect(writingSection.getByTestId('writing-last-refreshed')).not.toContainText('未取得');
  await expect(writingSection.getByRole('alert')).toHaveCount(0);
});
