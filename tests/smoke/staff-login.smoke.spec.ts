import { writeFile } from 'node:fs/promises';
import { expect, test } from './diagnostics';
import { loginBusinessStudentDemo } from './smoke-support';

const entries = [
  { path: '/teacher', role: 'instructor', title: '講師としてログイン', email: 'instructor@staff-smoke.example.invalid', home: '/instructor', workspace: 'instructor-dashboard' },
  { path: '/school-admin', role: 'group-admin', title: '学校管理者としてログイン', email: 'school-admin@staff-smoke.example.invalid', home: '/instructor', workspace: 'business-admin-dashboard' },
  { path: '/service-admin', role: 'service-admin', title: 'サービス管理者としてログイン', email: 'service-admin@staff-smoke.example.invalid', home: '/admin', workspace: 'admin-header' },
] as const;
const fixturePassword = 'local-only-staff-login';
const localTarget = !process.env.PLAYWRIGHT_BASE_URL || ['localhost', '127.0.0.1'].includes(new URL(process.env.PLAYWRIGHT_BASE_URL).hostname);
const existingAccounts = [
  { role: 'student', home: '/dashboard', workspace: 'student-dashboard', email: undefined },
  ...entries,
] as const;

const expectOwnWorkspace = async (page: Parameters<typeof loginBusinessStudentDemo>[0], account: typeof existingAccounts[number]) => {
  const workspace = account.role === 'service-admin'
    ? page.getByRole('heading', { name: 'Steady Study 運営ダッシュボード', exact: true })
    : page.getByTestId(account.workspace);
  await expect(workspace).toBeVisible();
};

const loginExistingFixture = async (page: Parameters<typeof loginBusinessStudentDemo>[0], account: typeof existingAccounts[number]) => {
  if (account.role === 'student') await loginBusinessStudentDemo(page);
  else {
    await page.goto(account.path);
    await page.getByTestId('auth-email-input').fill(account.email);
    await page.getByTestId('auth-password-input').fill(fixturePassword);
    await page.getByTestId('auth-submit').click();
  }
  await expect(page).toHaveURL(new RegExp(`${account.home}$`));
  await expectOwnWorkspace(page, account);
};

for (const account of existingAccounts) {
  test(`staff route restoration normalizes public URLs for ${account.role} without changing identity`, async ({ page }, testInfo) => {
    test.skip(!localTarget, 'Existing disposable local accounts only');
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.setViewportSize(account.role === 'student' ? { width: 390, height: 844 } : { width: 1366, height: 900 });
    await loginExistingFixture(page, account);
    const before = await (await page.request.get('/api/session')).json();
    for (const path of ['/public', '/student', '/public/roles/student']) {
      await page.goto(path); await expect(page).toHaveURL(new RegExp(`${account.home}$`));
      await expectOwnWorkspace(page, account);
      await page.reload(); await expect(page).toHaveURL(new RegExp(`${account.home}$`));
      await expectOwnWorkspace(page, account);
      expect((await (await page.request.get('/api/session')).json()).uid).toBe(before.uid);
    }
    await page.screenshot({ path: testInfo.outputPath(`${account.role}-restored-home.png`), animations: 'disabled' });
    // A browser-history entry can predate authentication. It must not retain a public URL over a private home.
    await page.evaluate(home => {
      window.history.pushState({}, '', '/public'); window.history.pushState({}, '', home);
    }, account.home);
    await page.goBack(); await expect(page).toHaveURL(new RegExp(`${account.home}$`));
    await expectOwnWorkspace(page, account);
    await page.goForward(); await expect(page).toHaveURL(new RegExp(`${account.home}$`));
    expect((await (await page.request.get('/api/session')).json()).uid).toBe(before.uid);
    expect(runtimeErrors).toEqual([]);
  });

  test(`staff route restoration keeps dedicated entries and Back/Forward for ${account.role} without account switching`, async ({ page }) => {
    test.skip(!localTarget, 'Existing disposable local accounts only');
    await loginExistingFixture(page, account);
    const before = await (await page.request.get('/api/session')).json();
    for (const path of ['/teacher', '/school-admin', '/service-admin', '/admin-access', '/public/roles/instructor', '/public/roles/group-admin', '/public/roles/service-admin']) {
      await page.goto(path);
      await expect(page.getByTestId('staff-entry-open-home')).toBeVisible();
      await expect(page.getByTestId('auth-email-input')).toHaveCount(0);
      await page.reload(); await expect(page.getByTestId('staff-entry-open-home')).toBeVisible();
      const directPath = path === '/admin-access' || path.endsWith('/service-admin') ? '/service-admin'
        : path.endsWith('/instructor') ? '/teacher' : path.endsWith('/group-admin') ? '/school-admin' : path;
      await expect(page).toHaveURL(new RegExp(`${directPath}$`));
      expect((await (await page.request.get('/api/session')).json()).uid).toBe(before.uid);
    }
    await page.getByTestId('staff-entry-open-home').click();
    await expect(page).toHaveURL(new RegExp(`${account.home}$`)); await expectOwnWorkspace(page, account);
    await page.evaluate(() => { window.history.pushState({}, '', '/teacher'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByTestId('staff-entry-open-home')).toBeVisible();
    await page.goBack(); await expect(page).toHaveURL(new RegExp(`${account.home}$`));
    await expectOwnWorkspace(page, account);
    await page.goForward(); await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByTestId('staff-entry-open-home')).toBeVisible();
    expect((await (await page.request.get('/api/session')).json()).uid).toBe(before.uid);
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
  for (const entry of entries) {
    test(`staff entry ${entry.role} shows the form directly at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(entry.path);
      await expect(page.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      await expect(page.getByTestId('auth-email-input')).toBeVisible();
      await expect(page.getByTestId('auth-password-input')).toBeVisible();
      for (const id of ['auth-display-name-input', 'auth-confirm-password-input', 'demo-login-admin', 'demo-login-instructor', 'demo-login-group-admin', 'business-role-preview-section']) await expect(page.getByTestId(id)).toHaveCount(0);
      await expect(page.getByRole('button', { name: '新規登録', exact: true })).toHaveCount(0);
      const metrics = await page.evaluate(() => ({ viewport: window.innerWidth, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
      const email = await page.getByTestId('auth-email-input').boundingBox();
      expect(email!.y).toBeGreaterThanOrEqual(0); expect(email!.y + email!.height).toBeLessThan(viewport.height);
      const password = await page.getByTestId('auth-password-input').boundingBox();
      const submit = await page.getByTestId('auth-submit').boundingBox();
      expect(password!.y).toBeGreaterThanOrEqual(0);
      expect(password!.y + password!.height).toBeLessThan(viewport.height);
      expect(submit!.y).toBeGreaterThanOrEqual(0);
      expect(submit!.y + submit!.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: testInfo.outputPath(`${entry.role}-${viewport.width}x${viewport.height}.png`), animations: 'disabled' });
      await writeFile(testInfo.outputPath('layout-metrics.json'), JSON.stringify({ entry: entry.path, viewport, metrics, email, password, submit }, null, 2));
      await page.getByTestId('auth-email-input').focus(); await page.keyboard.press('Tab');
      await expect(page.getByTestId('auth-password-input')).toBeFocused();
      await page.keyboard.press('Escape'); await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId('start-first-home')).toBeVisible();
      for (const staff of entries) await expect(page.locator(`a[href="${staff.path}"]`)).toHaveCount(0);
    });
  }
}

for (const [path, title] of [
  ['/admin-access?auth=signup', 'サービス管理者としてログイン'],
  ['/public/roles/instructor?auth=signup', '講師としてログイン'],
  ['/public/roles/group-admin?auth=signup', '学校管理者としてログイン'],
  ['/public/roles/service-admin?auth=signup', 'サービス管理者としてログイン'],
] as const) {
  test(`staff legacy entry ${path} retains a login-only form on reload`, async ({ page }) => {
    await page.goto(path); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page).toHaveURL(/auth=login$/);
    await expect(page.getByTestId('auth-display-name-input')).toHaveCount(0);
    await page.reload(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByTestId('auth-close').click(); await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('start-first-home')).toBeVisible();
  });
}

for (const entry of entries) {
  test(`staff real ${entry.role} login opens only its existing permitted workspace`, async ({ page }) => {
    test.skip(!localTarget, 'Disposable local D1 credentials are never created on deployed databases');
    await page.goto(entry.path);
    await page.getByTestId('auth-email-input').fill(entry.email);
    await page.getByTestId('auth-password-input').fill(fixturePassword);
    const request = page.waitForRequest(req => req.url().endsWith('/api/auth') && req.postDataJSON()?.action === 'email-auth');
    await page.getByTestId('auth-submit').click();
    expect((await request).postDataJSON()).toMatchObject({ loginEntry: entry.role, isSignUp: false });
    await expect(page).toHaveURL(new RegExp(`${entry.home}$`));
    if (entry.role === 'service-admin') await expect(page.getByRole('heading', { name: 'Steady Study 運営ダッシュボード', exact: true })).toBeVisible();
    else await expect(page.getByTestId(entry.workspace)).toBeVisible();
    await page.reload(); await expect(page).toHaveURL(new RegExp(`${entry.home}$`));
    const session = await page.request.get('/api/session');
    expect(session.status()).toBe(200); expect((await session.json()).email).toBe(entry.email);
  });
}

test('staff wrong-entry error preserves inputs and permits retry with the correct existing account', async ({ page }) => {
  test.skip(!localTarget, 'Local fixture authentication only');
  await page.goto('/school-admin');
  await page.getByTestId('auth-email-input').fill(entries[0].email); await page.getByTestId('auth-password-input').fill(fixturePassword);
  await page.getByTestId('auth-submit').click(); await expect(page.getByTestId('auth-error')).toContainText('権限');
  await expect(page.getByTestId('auth-error')).toContainText('案内元にアカウントの利用権限をご確認ください');
  await expect(page.getByTestId('auth-error')).toBeFocused();
  await expect(page.getByTestId('auth-email-input')).toHaveValue(entries[0].email); await expect(page.getByTestId('auth-password-input')).toHaveValue(fixturePassword);
  const session = await page.request.get('/api/session'); expect([200, 204]).toContain(session.status());
  if (session.status() === 200) expect(await session.json()).toBeNull();
  await page.getByTestId('auth-email-input').fill(entries[1].email); await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
});

test('signed-in student staff URLs preserve the session and offer only a return to learning', async ({ page }) => {
  test.skip(!localTarget, 'Existing local demo fixture only');
  await loginBusinessStudentDemo(page); const before = await (await page.request.get('/api/session')).json();
  for (const entry of entries) {
    await page.goto(entry.path);
    await expect(page.getByRole('heading', { name: 'この入口は利用できません', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '自分の学習へ戻る', exact: true })).toBeVisible();
    for (const id of ['auth-email-input', 'demo-login-admin', 'demo-login-instructor', 'demo-login-group-admin']) await expect(page.getByTestId(id)).toHaveCount(0);
    expect((await (await page.request.get('/api/session')).json()).uid).toBe(before.uid);
  }
  await page.getByTestId('staff-entry-open-home').click(); await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
});

test('staff pending login blocks duplicate submission and respects browser Back after success', async ({ page }) => {
  test.skip(!localTarget, 'Local real auth fixture only');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/auth', async route => {
    if (route.request().postDataJSON()?.action !== 'email-auth') { await route.continue(); return; }
    requests += 1; const response = await route.fetch(); await pending; await route.fulfill({ response });
  });
  await page.goto('/'); await expect(page.getByTestId('start-first-home')).toBeVisible();
  await page.evaluate(() => { window.history.pushState({}, '', '/teacher'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByTestId('auth-email-input').fill(entries[0].email); await page.getByTestId('auth-password-input').fill(fixturePassword);
  await page.getByTestId('auth-submit').click(); await expect(page.getByTestId('auth-submit')).toBeDisabled();
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await expect(page).toHaveURL(/\/teacher$/);
  await page.goBack(); await expect(page).toHaveURL(/\/$/);
  await page.goForward(); await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByTestId('auth-submit')).toBeDisabled();
  await page.goBack(); await expect(page).toHaveURL(/\/$/); release();
  await expect(page.getByRole('heading', { name: 'ログインが完了しました', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/); expect(requests).toBe(1);
  await expect(page.getByTestId('student-dashboard')).toHaveCount(0);
  await page.getByTestId('staff-entry-open-home').click(); await expect(page).toHaveURL(/\/instructor$/);
  await expect(page.getByTestId('instructor-dashboard')).toBeVisible();
});
