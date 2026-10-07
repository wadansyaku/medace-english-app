import { type Page } from '@playwright/test';
import { expect, test } from './diagnostics';

const openNaru = async (page: Page) => {
  await page.goto('/'); await page.getByTestId('start-first-guest').click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByTestId('guest-selected-book')).toContainText('Naruシスト');
  await expect(page.getByTestId('guest-study-start')).toBeEnabled();
};
const readDevice = (page: Page) => page.evaluate(() => new Promise<any>((resolve, reject) => {
  const request = indexedDB.open('steady-study-guest-learning', 1);
  request.onerror = () => reject(new Error('Cannot read device'));
  request.onsuccess = () => { const db = request.result; const tx = db.transaction('progress', 'readonly');
    const get = tx.objectStore('progress').get('current'); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); tx.oncomplete = () => db.close(); };
}));

test('guest six basic exercises stay local without AI or submission requests', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const mutations: string[] = []; const aiRequests: string[] = []; const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) mutations.push(url.pathname);
    if (/^\/api\/(ai|writing)(\/|$)/.test(url.pathname)
      || /(^|\.)(generativelanguage|aiplatform)\.googleapis\.com$/.test(url.hostname)) aiRequests.push(request.url());
  });
  await openNaru(page);
  await page.getByRole('button', { name: 'クイズ・英語練習', exact: true }).click();
  const modes = page.getByRole('group', { name: '練習の種類' });
  for (const mode of ['意味クイズ', 'スペル', '文法', '和訳', '読解', '英作文']) {
    await modes.getByRole('button', { name: mode, exact: true }).click();
    if (mode === '意味クイズ' || mode === '文法') {
      await page.getByTestId('guest-practice-question').locator('button[type="button"]').first().click();
      await page.getByRole('button', { name: '答えを確認する', exact: true }).click();
      await expect(page.getByTestId('guest-practice-feedback')).toBeVisible();
    } else if (mode === 'スペル') {
      await page.getByRole('textbox', { name: /^英単語/ }).fill('synthetic answer');
      await page.getByRole('button', { name: '答えを確認する', exact: true }).click();
      await expect(page.getByTestId('guest-practice-feedback')).toBeVisible();
    } else if (mode === '和訳') {
      await page.getByLabel('自分の日本語訳').fill('合成データの和訳です。');
      await page.getByRole('button', { name: '参考訳を確認する', exact: true }).click();
      await expect(page.getByText('参考訳と自分の訳を比べてみましょう', { exact: true })).toBeVisible();
    } else if (mode === '読解') {
      await page.getByTestId('guest-reading-practice').locator('button[type="button"]').first().click();
      await page.getByRole('button', { name: '答えを確認する', exact: true }).click();
      await expect(page.getByText('根拠の英文', { exact: true })).toBeVisible();
    } else {
      await page.getByLabel('自分の英文').fill('I keep this draft on my own device.');
      await page.getByRole('checkbox').first().check();
      await expect(page.getByText('現在8語', { exact: false })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.screenshot({ path: info.outputPath(`guest-six-${mode}.png`), fullPage: true });
  }
  expect(errors).toEqual([]); expect(mutations).toEqual([]); expect(aiRequests).toEqual([]);
  await info.attach('guest-six-network', { body: JSON.stringify({ mutations, aiRequests, errors, modes: 6 }), contentType: 'application/json' });
});

test('guest Naru learns beyond five words and shows a stable accepted rating at five widths', async ({ browser }, info) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); const writes: string[] = [];
    page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.url()); });
    try {
      await openNaru(page); await page.getByTestId('guest-study-start').click();
      for (let i = 0; i < 7; i++) {
        const front = page.getByTestId('guest-card-front'); const word = await front.locator('h2').innerText();
        await page.getByTestId('guest-flip').click(); await expect(page.getByTestId('guest-card-back')).toHaveAttribute('aria-hidden', 'false');
        // Record the accepted state in its render, before the timed next-card
        // transition can remove it between separate browser protocol calls.
        const before = await page.getByTestId('guest-rating-actions').evaluate(element => {
          const height = element.getBoundingClientRect().height;
          (window as any).__medaceGuestRatingGeometry = null;
          const observer = new MutationObserver(() => {
            const button = element.querySelector('[data-testid="guest-rate-3"]');
            if (button?.getAttribute('aria-pressed') !== 'true') return;
            (window as any).__medaceGuestRatingGeometry = {
              pressed: true, disabled: (button as HTMLButtonElement).disabled,
              height: element.getBoundingClientRect().height,
            };
            observer.disconnect();
          });
          observer.observe(element, { attributes: true, subtree: true, attributeFilter: ['aria-pressed'] });
          return height;
        });
        const clicked = Date.now(); await page.getByTestId('guest-rate-3').click();
        await expect.poll(() => page.evaluate(() => (window as any).__medaceGuestRatingGeometry)).toMatchObject({ pressed: true, disabled: true });
        const after = await page.evaluate(() => (window as any).__medaceGuestRatingGeometry);
        expect(after.height).toBeCloseTo(before, 0);
        if (i === 0) await page.screenshot({ path: info.outputPath(`guest-rating-${viewport.width}x${viewport.height}.png`) });
        await expect(front.locator('h2')).not.toHaveText(word); expect(Date.now() - clicked).toBeGreaterThanOrEqual(350);
        await expect(page.getByTestId('guest-card-back')).toHaveAttribute('aria-hidden', 'true');
      }
      const progress = await readDevice(page); expect(progress.attempts).toHaveLength(7); expect(new Set(progress.attempts.map((a: any) => a.attemptId)).size).toBe(7);
      expect(writes).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      await page.reload(); await expect(page.getByTestId('guest-session-result')).toBeVisible(); expect((await readDevice(page)).attempts).toEqual(progress.attempts);
      await page.getByRole('button', { name: '教材へ戻る', exact: true }).last().click(); await page.getByTestId('guest-study-start').click();
      expect((await readDevice(page)).attempts).toHaveLength(7);
    } finally { await context.close(); }
  }
});

test('guest catalog failure retries and authentication closes back to the lesson', async ({ page }) => {
  let failing = true;
  await page.route('**/api/guest-learning/naru', async route => { if (failing) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic failure' }) }); else await route.continue(); });
  await page.goto('/start'); await expect(page.getByRole('alert')).toContainText('読み込めません');
  failing = false;
  await page.getByRole('button', { name: '教材をもう一度読み込む' }).click(); await expect(page.getByTestId('guest-study-start')).toBeEnabled();
  await page.getByTestId('guest-study-start').click(); await page.getByTestId('guest-flip').click();
  const word = await page.getByTestId('guest-card-back').innerText();
  await page.getByTestId('guest-learning-login').click(); await expect(page.getByTestId('auth-email-input')).toBeFocused();
  await expect(page).toHaveURL(/guest=study&auth=login/); await page.keyboard.press('Escape');
  await expect(page.getByTestId('auth-focused-form')).toBeHidden(); await expect(page.getByTestId('guest-learning-login')).toBeFocused();
  await expect.poll(() => page.getByTestId('guest-card-back').innerText()).toBe(word);
  await page.goBack(); await expect.poll(() => page.getByTestId('guest-card-back').innerText()).toBe(word);
  await page.goBack(); await expect(page.getByTestId('guest-selected-book')).toBeVisible();
});

for (const clockSkewMs of [0, 120_000, 2 * 86400_000, -2 * 86400_000]) {
test(`guest signup explicitly imports immutable Naru answers after a lost response with clock skew ${clockSkewMs}`, async ({ page }) => {
  await page.addInitScript(skew => {
    const actualNow = Date.now.bind(Date);
    Date.now = () => actualNow() + skew;
  }, clockSkewMs);
  await openNaru(page); await page.getByTestId('guest-study-start').click(); await page.getByTestId('guest-flip').click(); await page.getByTestId('guest-rate-3').click(); await expect(page.getByTestId('guest-flip')).toBeVisible();
  const original = await readDevice(page);
  expect(Math.abs(original.serverTimeOffsetMs + clockSkewMs)).toBeLessThan(5000);
  await page.reload();
  await expect(page.getByTestId('guest-session-result')).toBeVisible();
  expect(await readDevice(page)).toEqual(original);
  await page.getByTestId('guest-learning-login').click(); await page.getByRole('button', { name: '新規登録', exact: true }).last().click();
  await page.getByTestId('auth-display-name-input').fill('合成Naru生徒'); await page.getByTestId('auth-email-input').fill(`guest-naru-${Date.now()}@example.test`);
  await page.getByTestId('auth-password-input').fill('synthetic-naru-pass'); await page.getByTestId('auth-confirm-password-input').fill('synthetic-naru-pass'); await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('onboarding-choice')).toBeVisible(); await expect(page.getByTestId('guest-learning-import-confirm')).toBeVisible();
  expect((await page.request.get(`/api/guest-learning/summary?sessionId=${original.sessionId}`)).status()).toBe(204);
  const payloads: any[] = [];
  await page.route('**/api/guest-learning/import', async route => { payloads.push(route.request().postDataJSON()); const response = await route.fetch();
    if (payloads.length === 1) { expect(response.status()).toBe(200); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Lost response' }) }); } else await route.fulfill({ response }); });
  await page.getByTestId('guest-learning-import-confirm').click(); await expect(page.getByTestId('guest-learning-import')).toContainText('保存を確認できなかった');
  expect((await readDevice(page)).importedAttemptIds).toEqual([]);
  await page.getByTestId('guest-learning-import-confirm').click(); await expect(page.getByTestId('guest-learning-import')).toContainText('1回答を保存しました');
  expect(payloads).toHaveLength(2); expect(payloads[1]).toEqual(payloads[0]); expect((await readDevice(page)).attempts).toEqual(original.attempts);
  expect(payloads[0].attempts[0].answeredAt).toBe(original.attempts[0].answeredAt + original.serverTimeOffsetMs);
  expect((await readDevice(page)).importedAttemptIds).toEqual([original.attempts[0].attemptId]);
  let releaseLogout!: () => void;
  let logoutRequests = 0;
  const pendingLogout = new Promise<void>(resolve => { releaseLogout = resolve; });
  await page.route('**/api/session', async route => {
    if (route.request().method() !== 'DELETE') { await route.continue(); return; }
    logoutRequests++;
    if (clockSkewMs === 0 && logoutRequests === 1) { await route.fulfill({ status: 503, json: { error: '合成のログアウト失敗' } }); return; }
    const response = await route.fetch();
    await pendingLogout; await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  if (clockSkewMs === 0) {
    await expect(page.getByTestId('logout-error')).toContainText('ログアウトを確認できませんでした');
    await page.getByRole('button', { name: 'ログアウトを再試行', exact: true }).click();
  }
  try {
    await expect.poll(() => logoutRequests).toBe(clockSkewMs === 0 ? 2 : 1);
    await expect(page.getByTestId('logout-error')).toHaveCount(0);
    await expect(page.getByTestId('start-first-signup')).toHaveCount(0);
  } finally { releaseLogout(); }
  await page.getByTestId('start-first-signup').click();
  await expect(page.getByTestId('auth-display-name-input')).toHaveValue('');
  await page.getByTestId('auth-display-name-input').fill('別の合成生徒');
  await page.getByTestId('auth-email-input').fill(`guest-naru-other-${Date.now()}@example.test`);
  await page.getByTestId('auth-password-input').fill('synthetic-naru-pass'); await page.getByTestId('auth-confirm-password-input').fill('synthetic-naru-pass'); await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('guest-learning-import')).toContainText('別のアカウント');
  await expect(page.getByTestId('guest-learning-import')).not.toContainText('1回答を保存しました');
  await expect(page.getByTestId('guest-learning-import-confirm')).toHaveCount(0);
});
}

test('long device-only books wrap at 320px and long words remain scrollable with result focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 }); await openNaru(page);
  await page.getByRole('button', { name: '自分の単語帳を作る・取り込む', exact: true }).click();
  await page.getByLabel('単語帳名（80文字以内）').fill('LongTitle'.repeat(8));
  await page.getByLabel('英単語', { exact: true }).fill('longword'.repeat(15));
  await page.getByLabel('意味', { exact: true }).fill('meaning'.repeat(100));
  await page.getByRole('button', { name: '下書きに追加', exact: true }).click(); await page.getByRole('button', { name: '単語帳を作成する', exact: true }).click();
  await page.getByRole('button', { name: 'この単語帳で学ぶ', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: info.outputPath('local-book-title-320.png'), fullPage: true });
  await page.getByTestId('guest-study-start').click();
  const scroll = page.getByTestId('guest-word-scroll');
  expect(await scroll.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
  const face = await page.getByTestId('guest-card-front').boundingBox(); const audio = await page.getByRole('button', { name: '発音を聞く', exact: true }).boundingBox();
  expect(audio!.y).toBeGreaterThanOrEqual(face!.y); expect(audio!.y + audio!.height).toBeLessThanOrEqual(face!.y + face!.height + 1);
  await page.getByTestId('guest-flip').click(); await expect(page.getByTestId('guest-card-back').locator('h2')).toBeFocused();
  await page.screenshot({ path: info.outputPath('local-book-meaning-320.png'), fullPage: true });
  await page.getByTestId('guest-rate-2').click(); await expect(page.getByTestId('guest-session-result').locator('h2')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('guest advance and single-word requeue never expose answers, including reduced motion and rapid clicks', async ({ browser }) => {
  for (const scenario of ['next', 'repeat'] as const) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion }); const page = await context.newPage();
    try {
      await openNaru(page);
      if (scenario === 'repeat') { const catalog = await (await page.request.get('/api/guest-learning/naru')).json(); await page.getByRole('spinbutton', { name: '開始番号' }).fill(String(Math.max(...catalog.words.map((w: any) => w.number)))); }
      await page.getByTestId('guest-study-start').click(); await page.getByTestId('guest-flip').click();
      await page.evaluate(() => {
        const state = { bad: 0, samples: 0 }; (window as any).__guestFrames = state;
        const start = performance.now(); const sample = () => {
          const card = document.querySelector('.study-card-inner') as HTMLElement | null;
          const front = document.querySelector('[data-testid="guest-card-front"]'); const next = front?.querySelector('h2')?.textContent;
          if (card && next && !card.classList.contains('is-flipped') && front?.getAttribute('aria-hidden') === 'false') {
            state.samples++; if (new DOMMatrix(getComputedStyle(card).transform).m11 < -0.01) state.bad++;
          }
          if (performance.now() - start < 950) requestAnimationFrame(sample);
        }; requestAnimationFrame(sample);
      });
      const box = (await page.getByTestId(`guest-rate-${scenario === 'repeat' ? 0 : 3}`).boundingBox())!; await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 });
      await expect(page.getByTestId('guest-flip')).toBeVisible(); await page.waitForTimeout(650);
      const frames = await page.evaluate(() => (window as any).__guestFrames); expect(frames.bad).toBe(0); expect(frames.samples).toBeGreaterThan(0);
      expect((await readDevice(page)).attempts).toHaveLength(1);
    } finally { await context.close(); }
  }
});
