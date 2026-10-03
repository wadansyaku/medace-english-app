import { writeFile } from 'node:fs/promises';
import { expect, test } from './diagnostics';

// Candidate visual/interaction acceptance tests. These must run in the local
// owner's supported localhost environment; cloud source checks are not a pass.
for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }, { width: 844, height: 390 }]) {
  test(`auth stays focused without expanding the landing page at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByTestId('start-first-login')).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.getByTestId('start-first-login').scrollIntoViewIfNeeded();
    const initial = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, y: window.scrollY, overflow: document.body.style.overflow }));
    await page.getByTestId('start-first-login').click();
    const dialog = page.getByRole('dialog', { name: 'ログイン', exact: true });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\?auth=login$/);
    await expect(page.getByTestId('auth-email-input')).toBeFocused();
    const metrics = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(metrics.height).toBe(initial.height);
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
    const email = await page.getByTestId('auth-email-input').boundingBox();
    expect(email!.y).toBeGreaterThanOrEqual(0); expect(email!.y + email!.height).toBeLessThan(height);
    await page.screenshot({ path: testInfo.outputPath(`auth-login-${width}x${height}.png`), animations: 'disabled' });
    await writeFile(testInfo.outputPath('layout-metrics.json'), JSON.stringify({ width, height, initial, opened: metrics, email }, null, 2));
    await expect(dialog.getByText('学習の流れを見る')).toHaveCount(0);
    await page.getByTestId('auth-close').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'パスワードを忘れた方', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('auth-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('start-first-login')).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(initial.overflow);
    expect(await page.evaluate(() => window.scrollY)).toBe(initial.y);
    await page.getByTestId('start-first-signup').click();
    await expect(page.getByRole('dialog', { name: '新規登録', exact: true })).toBeVisible();
    await expect(page.getByTestId('auth-display-name-input')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(initial.height);
    const close = await page.getByTestId('auth-close').boundingBox();
    expect(close!.y).toBeGreaterThanOrEqual(0); expect(close!.y + close!.height).toBeLessThanOrEqual(height);
    const signupImage = testInfo.outputPath(`auth-signup-${width}x${height}.png`);
    await page.screenshot({ path: signupImage, animations: 'disabled' });
    await testInfo.attach(`auth-signup-${width}x${height}.png`, { path: signupImage, contentType: 'image/png' });
  });
}

test('auth Back/Forward restores form state and retains the lesson deep link', async ({ page }) => {
  await page.goto('/study/synthetic-book');
  await page.getByTestId('start-first-login').click();
  await expect(page).toHaveURL(/\/study\/synthetic-book\?.*auth=login/);
  await page.goBack(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goForward(); await expect(page.getByRole('dialog', { name: 'ログイン', exact: true })).toBeVisible();
  await expect(page.getByTestId('auth-email-input')).toBeFocused();
  await page.getByRole('button', { name: '新規登録', exact: true }).last().click();
  await expect(page).toHaveURL(/\/study\/synthetic-book\?.*auth=signup/);
  await page.reload(); await expect(page.getByTestId('auth-display-name-input')).toBeFocused();
  await page.getByTestId('auth-close').click(); await expect(page).toHaveURL(/\/study\/synthetic-book\?/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('auth failure retains inputs and recovery offers resend and return', async ({ page }) => {
  let authRequests = 0;
  let recoveryRequests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth', async route => {
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === 'email-auth') {
      authRequests += 1;
      await pending;
      await route.fulfill({ status: 401, json: { error: '合成の認証失敗' } }); return;
    }
    if (body.action === 'password-recovery-request') {
      recoveryRequests += 1;
      await route.fulfill({ status: 200, json: { message: '再設定リクエストを受け付けました', requestedAt: Date.now() } }); return;
    }
    await route.continue();
  });
  await page.goto('/?auth=login');
  await page.getByTestId('auth-email-input').fill('synthetic@example.invalid');
  await page.getByTestId('auth-password-input').fill('synthetic-password');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-email-input')).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.getByRole('dialog')).toBeFocused();
  release();
  await expect(page.getByTestId('auth-error')).toBeVisible();
  expect(authRequests).toBe(1); await expect(page.getByTestId('auth-email-input')).toHaveValue('synthetic@example.invalid');
  await page.getByRole('dialog').focus(); await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'パスワードを忘れた方', exact: true })).toBeFocused();
  await page.getByTestId('open-password-recovery').click();
  await expect(page.getByRole('dialog', { name: 'パスワードの再設定', exact: true })).toBeVisible();
  await expect(page.getByTestId('auth-password-input')).toHaveCount(0);
  await page.getByTestId('submit-password-recovery').click(); await expect(page.getByTestId('password-recovery-message')).toBeVisible();
  await page.getByTestId('submit-password-recovery').click(); await expect.poll(() => recoveryRequests).toBe(2);
  await page.getByRole('button', { name: 'ログインに戻る', exact: true }).click();
  await expect(page.getByTestId('auth-password-input')).toBeVisible();
  await expect(page.getByTestId('auth-email-input')).toHaveValue('synthetic@example.invalid');
  await page.getByTestId('auth-close').click(); await expect(page.getByTestId('start-first-login')).toBeFocused();
});
