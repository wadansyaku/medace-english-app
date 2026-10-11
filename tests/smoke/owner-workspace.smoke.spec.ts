import { expect, test } from './diagnostics';
import type { Page } from '@playwright/test';

const localTarget = !process.env.PLAYWRIGHT_BASE_URL || ['localhost', '127.0.0.1'].includes(new URL(process.env.PLAYWRIGHT_BASE_URL).hostname);
const selector = (page: Page) => page.getByRole('combobox', { name: '業務画面を切り替える' });
const teacher = (page: Page) => page.getByTestId('instructor-dashboard');
const school = (page: Page) => page.getByTestId('business-admin-dashboard');
const service = (page: Page) => page.getByRole('heading', { name: 'Steady Study 運営ダッシュボード', exact: true });
const login = async (page: Page) => {
  await page.goto('/teacher');
  await page.getByTestId('auth-email-input').fill('320@long-term-smoke.example.invalid');
  await page.getByTestId('auth-password-input').fill('local-only-staff-login');
  await page.getByTestId('auth-submit').click();
  await expect(teacher(page)).toBeVisible();
  await expect(selector(page)).toHaveValue('instructor');
};
const checkLayout = async (page: Page) => {
  const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
  const select = await selector(page).boundingBox();
  expect(select!.height).toBeGreaterThanOrEqual(44);
  expect(select!.x).toBeGreaterThanOrEqual(0);
  expect(select!.x + select!.width).toBeLessThanOrEqual(metrics.width);
};

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
  test(`owner workspace switch preserves scope and keyboard focus at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(!localTarget, 'Existing disposable local identity/grant only; no deployed account setup');
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport); await login(page); await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('teacher.png'), animations: 'disabled' });
    await selector(page).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await expect(school(page)).toBeVisible(); await expect(selector(page)).toHaveValue('group-admin');
    await expect(selector(page)).toBeFocused(); await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('school.png'), animations: 'disabled' });
    await selector(page).selectOption('service-admin'); await expect(service(page)).toBeVisible();
    await expect(selector(page)).toBeFocused(); await checkLayout(page);
    await page.reload(); await expect(service(page)).toBeVisible(); await expect(selector(page)).toHaveValue('service-admin');
    await page.screenshot({ path: testInfo.outputPath('service.png'), animations: 'disabled' });
    await selector(page).selectOption('personal');
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await expect(page.getByTestId('staff-workspace-selector')).toHaveCount(0);
    await expect(page.locator('#study-main-content')).toBeFocused();
    const identity = await page.request.get('/api/session'); expect(identity.status()).toBe(200);
    expect(await identity.json()).toMatchObject({ uid: 'long-term-ui-320', role: 'STUDENT' });
    await page.reload(); await expect(page.getByTestId('student-dashboard')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('same identity cookie keeps teacher and service scope isolated in two tabs and history', async ({ page, context }) => {
  test.skip(!localTarget, 'Disposable local grant only');
  await login(page); await selector(page).selectOption('service-admin'); await expect(service(page)).toBeVisible();
  const other = await context.newPage(); await other.goto('/teacher');
  await expect(other.getByTestId('staff-entry-open-home')).toBeVisible(); await other.getByTestId('staff-entry-open-home').click();
  await expect(teacher(other)).toBeVisible(); await expect(selector(other)).toHaveValue('instructor');
  await page.reload(); await expect(service(page)).toBeVisible(); await expect(selector(page)).toHaveValue('service-admin');
  await other.reload(); await expect(teacher(other)).toBeVisible(); await expect(selector(other)).toHaveValue('instructor');
  await other.evaluate(() => { history.pushState({}, '', '/teacher'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(other.getByTestId('staff-entry-open-home')).toBeVisible();
  await other.goBack(); await expect(teacher(other)).toBeVisible(); await expect(selector(other)).toHaveValue('instructor');
  await other.goForward(); await expect(other.getByTestId('staff-entry-open-home')).toBeVisible();
  await expect(service(page)).toBeVisible(); await other.close();
});

test('failed workspace verification clears the old privileged view and focuses recovery', async ({ page }) => {
  test.skip(!localTarget, 'Disposable local grant only');
  await login(page);
  await page.route('**/api/session', route => route.request().headers()['x-medace-workspace'] === 'group-admin'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成通信失敗。ログインし直してください。' }) })
    : route.continue());
  await selector(page).selectOption('group-admin');
  await expect(page.getByTestId('workspace-switch-error')).toContainText('合成通信失敗');
  await expect(page.getByTestId('workspace-switch-error')).toBeFocused();
  await expect(teacher(page)).toHaveCount(0); await expect(school(page)).toHaveCount(0);
  await expect(page.getByTestId('staff-workspace-selector')).toHaveCount(0);
  await page.unroute('**/api/session'); await page.goto('/teacher');
  await page.getByTestId('staff-entry-open-home').click(); await expect(teacher(page)).toBeVisible();
});
