import { expect, test } from './diagnostics';
import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

// This helper cannot reach a deployed database: only the runner's private
// mkdtemp generation, --local SQL and matching runtime/source SHA are allowed.
const disposableD1 = async (page: Page) => {
  const stateFile = process.env.PLAYWRIGHT_LOCAL_D1_STATE_FILE;
  if (!localTarget || process.env.PLAYWRIGHT_LOCAL_SYNTHETIC_RUNTIME !== '1' || !stateFile) throw new Error('Disposable local D1 test bridge is unavailable.');
  const stats = statSync(stateFile);
  if (!stats.isFile() || (stats.mode & 0o077) !== 0) throw new Error('Local D1 metadata must be private.');
  const { persistDir, sourceSha } = JSON.parse(readFileSync(stateFile, 'utf8'));
  const actualDir = realpathSync(persistDir);
  if (path.dirname(actualDir) !== realpathSync(os.tmpdir()) || !/^medace-smoke-[a-zA-Z0-9]+$/.test(path.basename(actualDir))) throw new Error('Local D1 generation is invalid.');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (sourceSha !== head || sourceSha !== process.env.DEPLOYMENT_SHA) throw new Error('Local D1 source differs from the tested source.');
  const session = await page.request.get('/api/session');
  if (session.headers()['x-deployment-sha'] !== sourceSha) throw new Error('Served runtime differs from the local D1 source.');
  if (session.headers()['x-medace-smoke-generation'] !== path.basename(actualDir)) throw new Error('Served runtime differs from the disposable D1 generation.');
  const query = (sql: string) => JSON.parse(execFileSync(process.execPath, [
    'node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'medace-db', '--local', '--persist-to', actualDir, '--command', sql, '--json',
  ], { encoding: 'utf8', env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  const marker = query('SELECT generation, source_sha FROM smoke_runtime_identity;');
  expect(marker[0].results).toEqual([{ generation: path.basename(actualDir), source_sha: sourceSha }]);
  return query;
};

const openOwnerDraft = async (page: Page) => {
  await page.route('**/api/writing/ai-capabilities?*', async route => {
    const response = await route.fetch(); const payload = await response.json();
    await route.fulfill({ response, json: { ...payload, gradingEnabled: false } });
  });
  await page.getByTestId('workspace-tab-writing').click();
  await page.getByRole('button', { name: '印刷 / 配布', exact: true }).click();
  await page.getByRole('button', { name: /OWNER-REVOKE/ }).click();
  await page.getByRole('button', { name: '答案の下書き / GPT補助', exact: true }).click();
  const manual = page.getByTestId('writing-teacher-draft-manual');
  await expect(manual).toBeEditable();
  return manual;
};

for (const change of ['revoke', 'version'] as const) {
  test(`owner ${change} clears confirmed staff PII and unsaved answers after a real local D1 grant change`, async ({ page }, testInfo) => {
    test.skip(!localTarget || process.env.PLAYWRIGHT_LOCAL_SYNTHETIC_RUNTIME !== '1', 'Disposable local D1 only');
    await page.setViewportSize(change === 'revoke' ? { width: 390, height: 844 } : { width: 1366, height: 900 });
    await login(page);
    const query = await disposableD1(page);
    try {
      await expect(teacher(page)).toContainText('Synthetic revoke pupil');
      const manual = await openOwnerDraft(page);
      await manual.fill('Synthetic unsaved private answer before access loss.');
      await page.getByTestId('writing-teacher-draft-files').setInputFiles({ name: 'private-unsaved-answer.png', mimeType: 'image/png', buffer: Buffer.from('synthetic-local-answer') });
      await page.screenshot({ path: testInfo.outputPath(`owner-${change}-before.png`), animations: 'disabled' });
      query(change === 'revoke'
        ? "UPDATE workspace_access_grants SET status='REVOKED', grant_version=8 WHERE user_id='long-term-ui-320' AND grant_version=7;"
        : "UPDATE workspace_access_grants SET grant_version=8 WHERE user_id='long-term-ui-320' AND grant_version=7;");
      await page.getByRole('button', { name: '下書きを再取得', exact: true }).click();
      await expect(page.getByTestId('student-dashboard')).toBeVisible();
      await expect(page.getByTestId('workspace-switch-error')).toContainText('権限が更新');
      await expect(page.getByTestId('workspace-switch-error')).toBeFocused();
      await expect(teacher(page)).toHaveCount(0); await expect(manual).toHaveCount(0);
      await expect(page.getByText('Synthetic revoke pupil', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/private-unsaved-answer/)).toHaveCount(0);
      await expect(page).toHaveURL(/\/dashboard$/);
      const identity = await page.request.get('/api/session');
      expect(await identity.json()).toMatchObject({ uid: 'long-term-ui-320', role: 'STUDENT' });
      await page.screenshot({ path: testInfo.outputPath(`owner-${change}-after.png`), animations: 'disabled' });
      await page.reload(); await expect(page.getByTestId('student-dashboard')).toBeVisible();
      query("UPDATE workspace_access_grants SET status='ACTIVE', grant_version=7 WHERE user_id='long-term-ui-320';");
      await page.goto('/teacher'); await page.getByTestId('staff-entry-open-home').click();
      await expect(teacher(page)).toBeVisible();
      const reopened = await openOwnerDraft(page);
      await expect(reopened).toHaveValue('');
      await expect(page.getByText(/private-unsaved-answer/)).toHaveCount(0);
    } finally {
      query("UPDATE workspace_access_grants SET status='ACTIVE', grant_version=7 WHERE user_id='long-term-ui-320';");
    }
  });
}

test('ordinary staff 403 and network failure retain confirmed PII and the unsaved answer', async ({ page }) => {
  test.skip(!localTarget, 'Disposable local identity only');
  await login(page); await expect(teacher(page)).toContainText('Synthetic revoke pupil');
  const manual = await openOwnerDraft(page); const text = 'Synthetic answer preserved during temporary failure.';
  await manual.fill(text);
  await page.route('**/api/writing/input-draft?*', route => route.fulfill({ status: 403, json: { error: '担当外の合成403' } }));
  await page.getByRole('button', { name: '下書きを再取得', exact: true }).click();
  await expect(page.getByTestId('writing-teacher-draft-error')).toBeVisible();
  await expect(manual).toHaveValue(text); await expect(teacher(page)).toBeVisible();
  await page.unroute('**/api/writing/input-draft?*');
  await page.route('**/api/writing/input-draft?*', route => route.abort('failed'));
  await page.getByRole('button', { name: '下書きを再取得', exact: true }).click();
  await expect(page.getByTestId('writing-teacher-draft-error')).toBeVisible();
  await expect(manual).toHaveValue(text); await expect(teacher(page)).toBeVisible();
  await expect(page.getByTestId('workspace-switch-error')).toHaveCount(0);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
  test(`owner workspace switch preserves scope and focus at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(!localTarget, 'Existing disposable local identity/grant only; no deployed account setup');
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport); await login(page); await checkLayout(page);
    await page.screenshot({ path: testInfo.outputPath('teacher.png'), animations: 'disabled' });
    await selector(page).focus(); await expect(selector(page)).toBeFocused();
    await page.keyboard.press('Tab'); await expect(selector(page)).not.toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(selector(page)).toBeFocused();
    // macOS native pickers ignore synthesized arrows even in an isolated select.
    // Exercise native selection separately from the actual Tab/focus checks.
    await selector(page).selectOption('group-admin');
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

test('an owner staff evidence link retains its verified tab scope across full navigation and return', async ({ page }, testInfo) => {
  test.skip(!localTarget, 'Disposable local grant only');
  await login(page);
  await page.locator('[data-product-support-trigger]').click();
  const support = page.getByRole('dialog', { name: '公開案内の会話', exact: true });
  await support.getByRole('textbox', { name: '製品についての質問', exact: true }).fill('講師や学校管理者のログイン入口は？');
  await support.getByRole('checkbox', { name: 'Bot専用のCloudflare送信に同意する', exact: true }).check();
  await support.getByTestId('support-submit').click();
  const evidence = support.getByTestId('support-source');
  await expect(evidence).toHaveCount(1);
  await evidence.locator('summary').click();
  await evidence.getByRole('link', { name: 'この根拠を別のページで読む', exact: true }).click();
  await expect(page).toHaveURL(/\/public\?supportSource=staff-login-entry$/);
  const body = page.getByTestId('product-support-source-body');
  await expect(body).toContainText('staff-login-entry');
  await expect(body).toContainText('仕様版');
  await expect(body).toContainText('/teacher');
  await page.screenshot({ path: testInfo.outputPath('owner-staff-evidence.png'), animations: 'disabled' });
  await page.reload(); await expect(body).toBeVisible();
  await page.getByRole('button', { name: '自分の画面へ戻る', exact: true }).click();
  await expect(teacher(page)).toBeVisible(); await expect(selector(page)).toHaveValue('instructor');
  const rawIdentity = await page.request.get('/api/session');
  expect(await rawIdentity.json()).toMatchObject({ uid: 'long-term-ui-320', role: 'STUDENT' });
});
