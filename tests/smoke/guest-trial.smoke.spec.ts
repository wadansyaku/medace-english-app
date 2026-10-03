import { type Page } from '@playwright/test';
import { expect, test } from './diagnostics';
import { GUEST_TRIAL_QUESTIONS } from '../../shared/guestTrial';

const openTrial = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('start-first-guest').click();
  await expect(page).toHaveURL(/\/try$/);
  await expect(page.getByTestId('guest-trial-question')).toBeVisible();
};
const confirmFirst = async (page: Page) => {
  await page.getByTestId('guest-choice-0').click();
  await page.getByTestId('guest-trial-confirm').click();
  await expect(page.getByTestId('guest-trial-feedback')).toContainText('bright');
};
const signUp = async (page: Page) => {
  await page.getByTestId('guest-save-account').click();
  await expect(page.getByTestId('auth-focused-form')).toBeVisible();
  await page.getByTestId('auth-display-name-input').fill('合成お試し生徒');
  const email = `guest-trial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill('synthetic-trial-pass');
  await page.getByTestId('auth-confirm-password-input').fill('synthetic-trial-pass');
  await expect(page.getByTestId('auth-display-name-input')).toHaveValue('合成お試し生徒');
  await expect(page.getByTestId('auth-email-input')).toHaveValue(email);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('onboarding-choice')).toBeVisible();
};
const readDevice = (page: Page) => page.evaluate(() => new Promise<{
  trialId: string; answers: { attemptId: string; questionId: string; choiceIndex: number; answeredAt: number }[];
  boundUserId?: string; importedAttemptIds: string[];
}>((resolve, reject) => {
  const request = indexedDB.open('steady-study-guest-trial', 1);
  request.onerror = () => reject(new Error('device read failed'));
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction('progress', 'readonly');
    const item = tx.objectStore('progress').get('current');
    item.onsuccess = () => resolve(item.result);
    item.onerror = () => reject(new Error('device read failed'));
    tx.oncomplete = () => db.close();
  };
}));

test('guest original trial reaches one word without auth or catalogue writes at five widths', async ({ browser }, testInfo) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const writes: string[] = [];
    const catalogueReads: string[] = [];
    page.on('request', r => {
      if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/')) writes.push(new URL(r.url()).pathname);
      if (new URL(r.url()).pathname === '/api/storage') catalogueReads.push(r.url());
    });
    try {
      await openTrial(page);
      await expect(page.getByRole('heading', { name: 'bright', exact: true })).toBeVisible();
      await confirmFirst(page);
      await expect(page.getByTestId('guest-trial-feedback')).toContainText('明るい');
      expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBe(0);
      expect(writes).toEqual([]);
      expect(catalogueReads).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`guest-feedback-${viewport.width}x${viewport.height}.png`) });
    } finally { await context.close(); }
  }
});

test('guest answers survive auth Escape, browser Back and reload without creating an account', async ({ page }) => {
  await openTrial(page);
  await confirmFirst(page);
  const before = await readDevice(page);
  await page.getByTestId('guest-save-account').click();
  await expect(page).toHaveURL(/\/try\?auth=signup$/);
  await expect(page.getByTestId('auth-display-name-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('auth-focused-form')).toBeHidden();
  await expect(page.getByTestId('guest-save-account')).toBeFocused();
  await expect(page.getByTestId('guest-trial-feedback')).toBeVisible();
  await page.getByTestId('guest-save-account').click();
  await page.goBack();
  await expect(page.getByTestId('auth-focused-form')).toBeHidden();
  expect((await readDevice(page)).answers).toEqual(before.answers);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'carry', exact: true })).toBeVisible();
  expect((await readDevice(page)).answers).toEqual(before.answers);
  expect((await page.request.get('/api/session')).status()).toBe(204);
});

test('guest signup requires explicit import and lost-response retry preserves one canonical answer', async ({ page }, testInfo) => {
  await openTrial(page);
  await confirmFirst(page);
  const original = await readDevice(page);
  await signUp(page);
  await page.screenshot({ path: testInfo.outputPath('optional-diagnostic-and-explicit-save.png'), fullPage: true });
  const before = await (await page.request.get('/api/session')).json();
  expect(before.englishLevel).toBeFalsy();
  expect((await page.request.get(`/api/guest-trial/summary?trialId=${original.trialId}`)).status()).toBe(204);
  const payloads: unknown[] = [];
  await page.route('**/api/guest-trial/import', async route => {
    payloads.push(route.request().postDataJSON());
    const committed = await route.fetch();
    if (payloads.length === 1) {
      expect(committed.status()).toBe(200);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic lost response' }) });
    } else await route.fulfill({ response: committed });
  });
  await page.getByTestId('guest-import-confirm').click();
  await expect(page.getByTestId('guest-import-message')).toContainText('保存を確認できませんでした');
  const afterFailure = await readDevice(page);
  expect(afterFailure.answers).toEqual(original.answers);
  expect(afterFailure.importedAttemptIds).toEqual([]);
  const committed = await (await page.request.get(`/api/guest-trial/summary?trialId=${original.trialId}`)).json();
  expect(committed.answerCount).toBe(1);
  await page.getByTestId('guest-import-confirm').click();
  await expect(page.getByTestId('guest-import-saved')).toContainText('1語');
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect((await readDevice(page)).importedAttemptIds).toEqual([original.answers[0].attemptId]);
  await page.getByTestId('onboarding-skip-button').click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const after = await (await page.request.get('/api/session')).json();
  expect(after.needsOnboarding).toBe(false);
  expect(after.englishLevel).toBeFalsy();
  expect(after.stats.xp).toBe(before.stats.xp);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('steady-study-guest-trial', 1);
    r.onsuccess = () => { const db = r.result; const tx = db.transaction('progress', 'readwrite'); tx.objectStore('progress').delete('current'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(new Error('clear failed')); };
  }));
  await page.reload();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const saved = page.getByTestId('guest-import-saved');
  await expect(saved).toContainText('1語');
  await saved.locator('summary').click();
  await expect(saved).toContainText('あなたの回答：明るい');
  await page.screenshot({ path: testInfo.outputPath('saved-trial-after-device-clear.png'), fullPage: true });
});

test('partial trial continues after signup and appends the remaining immutable answers', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTrial(page); await confirmFirst(page);
  const original = await readDevice(page);
  await signUp(page);
  await page.getByTestId('guest-import-confirm').click();
  await expect(page.getByTestId('guest-import-saved')).toContainText('1語');
  await page.getByTestId('onboarding-skip-button').click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const before = await (await page.request.get('/api/session')).json();
  await page.getByTestId('guest-continue-trial').click();
  await expect(page).toHaveURL(/\/try$/);
  await expect(page.getByRole('heading', { name: 'carry', exact: true })).toBeVisible();
  await expect(page.getByTestId('guest-save-account')).toHaveCount(0);
  for (let i = 1; i < GUEST_TRIAL_QUESTIONS.length; i++) {
    const question = GUEST_TRIAL_QUESTIONS[i];
    await expect(page.getByRole('heading', { name: question.word, exact: true })).toBeVisible();
    await page.getByTestId(`guest-choice-${i === 2 ? 0 : question.correctChoiceIndex}`).click();
    await page.getByTestId('guest-trial-confirm').click();
    await expect(page.getByTestId('guest-trial-feedback')).toContainText(question.explanation);
    await page.getByTestId('guest-trial-next').click();
  }
  await expect(page.getByTestId('guest-trial-result')).toContainText('4 / 5語 正解');
  await expect(page.getByTestId('guest-trial-result')).toContainText('レベル判定や通常教材の学習成績には含めません');
  const all = await readDevice(page);
  expect(all.answers).toHaveLength(5);
  expect(all.answers[0]).toEqual(original.answers[0]);
  expect(all.importedAttemptIds).toEqual([original.answers[0].attemptId]);
  await page.screenshot({ path: testInfo.outputPath('five-word-result-mobile.png'), fullPage: true });
  await page.getByTestId('guest-return-to-account').click();
  await expect(page.getByTestId('guest-trial-import')).toContainText('練習した5語');
  await page.getByTestId('guest-import-confirm').click();
  await expect(page.getByTestId('guest-import-saved')).toContainText('5語（4語正解）');
  const saved = await (await page.request.get(`/api/guest-trial/summary?trialId=${all.trialId}`)).json();
  expect(saved.answers).toEqual(all.answers);
  expect((await readDevice(page)).importedAttemptIds).toHaveLength(5);
  const after = await (await page.request.get('/api/session')).json();
  expect(after.englishLevel).toBeFalsy();
  expect(after.stats.xp).toBe(before.stats.xp);
  await page.goto('/try');
  await expect(page.getByTestId('guest-trial-result')).toBeVisible();
  await page.getByTestId('guest-clear-opener').click();
  await expect(page.getByTestId('guest-clear-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('guest-clear-opener')).toBeFocused();
  expect((await readDevice(page)).answers).toEqual(all.answers);
  await page.getByTestId('guest-clear-opener').click();
  await page.getByTestId('guest-clear-confirm').click();
  await expect(page.getByRole('heading', { name: 'bright', exact: true })).toBeVisible();
  expect((await readDevice(page)).trialId).not.toBe(all.trialId);
  await page.getByTestId('guest-return-to-account').click();
  await expect(page.getByTestId('guest-import-saved')).toContainText('5語（4語正解）');
  await page.reload();
  await expect(page.getByTestId('guest-import-saved')).toContainText('5語（4語正解）');
});

test('diagnostic defer handles failure and later diagnosis remains optional and reachable', async ({ page }) => {
  await openTrial(page);
  await signUp(page);
  let failed = false;
  await page.route('**/api/profile', async route => {
    if (!failed) { failed = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic profile failure' }) }); }
    else await route.continue();
  });
  await page.getByTestId('onboarding-skip-button').click();
  await expect(page.getByTestId('onboarding-defer-error')).toBeVisible();
  expect((await (await page.request.get('/api/session')).json()).needsOnboarding).toBe(true);
  await page.getByTestId('onboarding-skip-button').click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await page.getByTestId('student-hero-settings').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('未診断');
  await dialog.getByRole('button', { name: 'レベルを確認する', exact: true }).click();
  await expect(page.getByTestId('onboarding-profile')).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await (await page.request.get('/api/session')).json()).englishLevel).toBeFalsy();
});

test('guest account switch does not import the previous account-bound trial', async ({ page }) => {
  await openTrial(page); await confirmFirst(page); await signUp(page);
  await page.route('**/api/guest-trial/import', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic unavailable import' }) }));
  await page.getByTestId('guest-import-confirm').click();
  await expect(page.getByTestId('guest-import-message')).toBeVisible();
  const bound = await readDevice(page);
  await page.unroute('**/api/guest-trial/import');
  const other = await page.request.post('/api/auth', { headers: { Origin: new URL(page.url()).origin }, data: { action: 'email-auth', isSignUp: true, email: `other-trial-${Date.now()}@example.test`, password: 'synthetic-other-pass', displayName: '別の合成生徒' } });
  expect(other.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('guest-trial-import')).toContainText('このアカウントには引き継げません');
  await expect(page.getByTestId('guest-import-confirm')).toHaveCount(0);
  expect((await readDevice(page)).boundUserId).toBe(bound.boundUserId);
  expect((await page.request.get(`/api/guest-trial/summary?trialId=${bound.trialId}`)).status()).toBe(204);
});

test('guest storage unavailable is explicit and keeps the current practice usable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => { throw new DOMException('Synthetic blocked storage', 'SecurityError'); } }));
  await openTrial(page);
  await expect(page.getByTestId('guest-trial-screen')).toContainText('再読み込みすると消える場合');
  await confirmFirst(page);
  await page.getByTestId('guest-save-account').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('guest-trial-feedback')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'bright', exact: true })).toBeVisible();
  await expect(page.getByTestId('guest-trial-feedback')).toHaveCount(0);
});

test('guest concurrent tabs share one immutable answer and one attempt identifier', async ({ page, context }) => {
  await openTrial(page);
  const second = await context.newPage();
  try {
    await second.goto('/try');
    await expect(second.getByTestId('guest-trial-question')).toBeVisible();
    await page.getByTestId('guest-choice-0').click();
    await second.getByTestId('guest-choice-1').click();
    await Promise.all([
      page.getByTestId('guest-trial-confirm').evaluate((b: HTMLButtonElement) => b.click()),
      second.getByTestId('guest-trial-confirm').evaluate((b: HTMLButtonElement) => b.click()),
    ]);
    await expect(page.getByTestId('guest-trial-feedback')).toBeVisible();
    await expect(second.getByTestId('guest-trial-feedback')).toBeVisible();
    const firstState = await readDevice(page);
    const secondState = await readDevice(second);
    expect(firstState.answers).toHaveLength(1);
    expect(secondState).toEqual(firstState);
    expect(firstState.answers[0].questionId).toBe(GUEST_TRIAL_QUESTIONS[0].id);
  } finally { await second.close(); }
});
