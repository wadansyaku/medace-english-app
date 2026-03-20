import { expect, test } from '@playwright/test';

import {
  expectPreviewDeployment,
  PUBLIC_BUSINESS_ROLE_KEYS,
} from './smoke-support';
import {
  getPublicBusinessRoleConfig,
  getPublicBusinessRolePath,
} from '../../shared/publicBusinessRoles';

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

test('preview deployment surfaces a visible preview banner and noindex marker', async ({ page }) => {
  test.skip(!expectPreviewDeployment, 'preview-only deployment validation');

  await page.goto('/');

  await expect(page.getByTestId('preview-deployment-banner')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);
});
