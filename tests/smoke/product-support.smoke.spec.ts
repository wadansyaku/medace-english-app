import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from './diagnostics';
import { loginBusinessStudentDemo, loginInstructorDemo } from './smoke-support';
import { PRODUCT_SUPPORT_KNOWLEDGE, PRODUCT_SUPPORT_TARGET_VERSION, resolveProductSupportSources, type ProductSupportRole } from '../../shared/productSupportKnowledge';
import type { ProductSupportRequest, ProductSupportResponse } from '../../contracts/productSupport';

// Local disposable Pages/D1 only. This file sends five real guest asks in
// total (also within the five/minute bucket), one student and one teacher ask.
// Viewport/delay fixtures do not reach the provider or consume the real bucket.
test.beforeEach(async ({ baseURL }) => {
  test.skip(!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)
    || process.env.VITE_STORAGE_MODE === 'idb', 'Use the owner\'s disposable local Pages/D1 headless runner.');
});
test.describe.configure({ retries: 0 });

type Ask = Extract<ProductSupportRequest, { action: 'ask' }>;
const trigger = (page: Page) => page.locator('[data-product-support-trigger]');
const dialog = (page: Page) => page.getByRole('dialog', { name: '公開案内の会話', exact: true });
const question = (page: Page) => dialog(page).getByRole('textbox', { name: '製品についての質問', exact: true });
const consent = (page: Page) => dialog(page).getByRole('checkbox', { name: 'Bot専用のCloudflare送信に同意する', exact: true });
const open = async (page: Page) => { await trigger(page).click(); await expect(dialog(page)).toBeVisible(); };
const ask = async (page: Page, text: string) => {
  await question(page).fill(text); await consent(page).check();
  await dialog(page).getByTestId('support-submit').click();
};
const latestTurn = (page: Page) => dialog(page).getByTestId('support-turn').last();
const expectSources = async (turn: Locator, ids: readonly string[]) => {
  await expect(turn.getByTestId('support-source')).toHaveCount(ids.length);
  for (const id of ids) await expect(turn.getByTestId('support-source').filter({ hasText: `根拠ID: ${id}` })).toHaveCount(1);
};
const fixtureAnswer = (request: Ask, role: ProductSupportRole = 'GUEST'): ProductSupportResponse => {
  const sources = resolveProductSupportSources(['study-recall'], role)!;
  return { requestId: request.requestId, version: PRODUCT_SUPPORT_TARGET_VERSION, status: 'ANSWERED', kind: 'ANSWER',
    providerUsed: false, answer: sources[0].content, sourceIds: sources.map(source => source.sourceId),
    references: sources.map(source => ({ sourceId: source.sourceId, title: source.title, excerpt: source.content, version: source.targetVersion, checkedAt: source.checkedAt })) };
};
const attachGeometry = async (page: Page, info: TestInfo, name: string) => {
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
    const panel = document.querySelector('[role="dialog"][aria-label="公開案内の会話"]');
    return { viewport: { width: innerWidth, height: innerHeight }, pageWidth: document.documentElement.scrollWidth,
      dialog: box('[role="dialog"][aria-label="公開案内の会話"]'), close: box('[data-support-dialog-close]'),
      input: box('textarea[aria-label="製品についての質問"]'), trigger: box('[data-product-support-trigger]'),
      panelWidth: panel ? { client: panel.clientWidth, scroll: panel.scrollWidth } : null };
  });
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport.width + 1);
  if (geometry.panelWidth) expect(geometry.panelWidth.scroll).toBeLessThanOrEqual(geometry.panelWidth.client + 1);
  await info.attach(`${name}-geometry`, { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
  const image = info.outputPath(`${name}.png`);
  await page.screenshot({ path: image, animations: 'disabled', fullPage: !geometry.dialog });
  await info.attach(name, { path: image, contentType: 'image/png' });
  return geometry;
};

test('real safe input rejection preserves the question and focus for an explicit corrected ask', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginBusinessStudentDemo(page);
  const bodies: ProductSupportRequest[] = [];
  const rejectedResponses: unknown[] = [];
  await page.route('**/api/product-support', async route => {
    bodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (!response.ok()) rejectedResponses.push(await response.json());
    await route.fulfill({ response });
  });
  await open(page);
  const rejectedText = 'synthetic@example.test のNaru記録は？';
  await ask(page, rejectedText);
  await expect(dialog(page).getByRole('alert')).toHaveText('個人情報や秘密情報を取り除いて、操作だけを入力してください。');
  await expect(question(page)).toHaveValue(rejectedText);
  await expect(question(page)).toBeEditable(); await expect(question(page)).toBeFocused();
  await expect(dialog(page).getByTestId('support-pending')).toHaveCount(0);
  await expect(consent(page)).toBeChecked();
  expect(bodies).toHaveLength(1);
  expect(rejectedResponses).toEqual([expect.objectContaining({ productSupportAdmission: 'NOT_ADMITTED' })]);
  await attachGeometry(page, info, 'support-safe-rejection-390');
  await question(page).fill('理解度を選んだ後の復習方法は？');
  await dialog(page).getByTestId('support-submit').click();
  await expect(latestTurn(page).getByTestId('support-answer')).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[0].action).toBe('ask'); expect(bodies[1].action).toBe('ask');
  expect(bodies[1].requestId).not.toBe(bodies[0].requestId);
  await attachGeometry(page, info, 'support-corrected-question-390');
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
  test(`support input, evidence and keyboard remain usable at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const requests: ProductSupportRequest[] = [];
    await page.route('**/api/product-support', async route => {
      const body = route.request().postDataJSON() as Ask; requests.push(body);
      await route.fulfill({ json: fixtureAnswer(body) });
    });
    await page.goto('/'); await expect(trigger(page)).toBeVisible();
    const initialUrl = page.url();
    // Two synchronous clicks must produce one history entry, not two dialogs.
    await trigger(page).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(dialog(page)).toBeVisible(); await expect(dialog(page).getByRole('heading', { name: '公開案内の会話', exact: true })).toBeVisible();
    await expect(dialog(page)).toContainText('生成OFF · 確認済みの公開案内から答えます。');
    await expect(page.locator('[data-support-dialog-close]')).toBeFocused();
    await expect(question(page)).toHaveAttribute('maxlength', '600');
    const initialInput = (await question(page).boundingBox())!;
    expect(initialInput.y).toBeGreaterThanOrEqual(0);
    expect(initialInput.y + initialInput.height).toBeLessThanOrEqual(viewport.height + 1);
    await attachGeometry(page, info, `support-initial-${viewport.width}x${viewport.height}`);
    await question(page).fill('理解度を選んだ後の復習方法は？');
    await expect(dialog(page).getByTestId('support-submit')).toBeDisabled(); expect(requests).toHaveLength(0);
    await question(page).scrollIntoViewIfNeeded();
    const inputBox = (await question(page).boundingBox())!;
    expect(inputBox.y).toBeGreaterThanOrEqual(0); expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(viewport.height + 1);
    await consent(page).check(); await dialog(page).getByTestId('support-submit').click();
    await expect(latestTurn(page).getByTestId('support-answer')).toBeVisible(); await expectSources(latestTurn(page), ['study-recall']);
    await latestTurn(page).getByText('根拠を読む: 思い出す練習と復習', { exact: true }).click();
    await expect(latestTurn(page)).toContainText('確認日: 2026-10-11'); await expect(latestTurn(page)).toContainText(`仕様版: ${PRODUCT_SUPPORT_TARGET_VERSION}`);
    await expect(latestTurn(page).getByRole('link', { name: 'この根拠を別のページで読む' })).toHaveAttribute('href', '/public?supportSource=study-recall');
    const geometry = await attachGeometry(page, info, `support-answer-${viewport.width}x${viewport.height}`);
    expect(geometry.close!.y).toBeGreaterThanOrEqual(0); expect(geometry.close!.y + geometry.close!.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.locator('[data-support-dialog-close]').focus(); await page.keyboard.press('Shift+Tab');
    await expect(consent(page)).toBeFocused(); await page.keyboard.press('Tab');
    await expect(page.locator('[data-support-dialog-close]')).toBeFocused(); await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0); await expect(trigger(page)).toBeFocused(); await expect(page).toHaveURL(initialUrl);
    await open(page); await expect(question(page)).toHaveValue(''); await expect(consent(page)).not.toBeChecked();
    await expect(dialog(page).getByTestId('support-answer')).toHaveCount(0);
    await page.goBack(); await expect(dialog(page)).toHaveCount(0); await expect(trigger(page)).toBeFocused();
    await page.goForward(); await expect(dialog(page)).toHaveCount(0); expect(requests).toHaveLength(1);
  });
}

test('real Pages conversation handles reordered guest CSV, its follow-up and Naru plus My scopes with generation off', async ({ page }, info) => {
  const bodies: ProductSupportRequest[] = []; const replies: ProductSupportResponse[] = []; const aiRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/product-support' && request.method() === 'POST') bodies.push(request.postDataJSON());
    if (/^\/api\/(ai|writing)(\/|$)/.test(url.pathname) || /(^|\.)(generativelanguage|aiplatform)\.googleapis\.com$/.test(url.hostname)) aiRequests.push(url.pathname);
  });
  await page.route('**/api/product-support', async route => {
    const response = await route.fetch(); expect(response.ok()).toBe(true); replies.push(await response.json()); await route.fulfill({ response });
  });
  await page.goto('/'); await open(page);
  await ask(page, 'CSVの取り込み方を、ゲストの単語帳について教えて');
  await expectSources(latestTurn(page), ['guest-local-wordbooks']); await expect(latestTurn(page).getByTestId('support-answer')).toContainText('256KB');
  await ask(page, 'CSVの上限は？'); await expect(dialog(page).getByTestId('support-turn')).toHaveCount(2);
  await expectSources(latestTurn(page), ['guest-local-wordbooks']); await expect(latestTurn(page).getByTestId('support-answer')).toContainText('200語');
  await ask(page, 'Naruの記録の引継ぎとMy単語帳の直接入力は？'); await expect(dialog(page).getByTestId('support-turn')).toHaveCount(3);
  await expectSources(latestTurn(page), ['guest-naru-records', 'my-wordbook-create']);
  await expect(latestTurn(page).getByTestId('support-answer')).toContainText('自動保存しません');
  await expect(latestTurn(page).getByTestId('support-answer')).toContainText('CSVの用意は必須ではありません');
  await ask(page, 'それは自動ですか？'); await expect(latestTurn(page).getByTestId('support-answer')).toContainText('どの機能についての続き');
  await expect(question(page)).toHaveValue('それは自動ですか？'); await expect(dialog(page).getByTestId('support-turn')).toHaveCount(3);
  await expect(dialog(page).getByText('公開案内からの回答（生成OFF）', { exact: true })).toHaveCount(3);
  expect(bodies).toHaveLength(4); expect(replies).toHaveLength(4); expect(aiRequests).toEqual([]);
  for (const reply of replies) expect(reply).toMatchObject({ status: 'ANSWERED', providerUsed: false, version: PRODUCT_SUPPORT_TARGET_VERSION });
  expect(bodies[1]).toMatchObject({ history: [{ userText: 'CSVの取り込み方を、ゲストの単語帳について教えて' }] });
  expect((bodies[3] as Ask).history).toHaveLength(3);
  expect(JSON.stringify((bodies[3] as Ask).history)).not.toContain('256KB');
  expect(bodies.every(body => !Object.hasOwn(body, 'role'))).toBe(true);
  await attachGeometry(page, info, 'support-real-conversation');
  await info.attach('support-real-network', { body: JSON.stringify({ bodies, replies, aiRequests }), contentType: 'application/json' });
});

test('lost Pages response permits only one same-ID state inquiry and never regenerates automatically', async ({ page }, info) => {
  const bodies: ProductSupportRequest[] = []; let original: ProductSupportResponse | undefined;
  await page.route('**/api/product-support', async route => {
    const body = route.request().postDataJSON() as ProductSupportRequest; bodies.push(body);
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    if (body.action === 'ask') { original = await response.json(); await route.fulfill({ status: 503, json: { error: 'Synthetic response lost after completion' } }); }
    else await route.fulfill({ response });
  });
  await page.goto('/'); await open(page); await question(page).fill('発音が聞こえない場合は？'); await consent(page).check();
  await dialog(page).getByTestId('support-form').evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect(dialog(page).getByTestId('support-pending')).toContainText('通信が完了せず');
  expect(bodies).toHaveLength(1); expect(original).toMatchObject({ status: 'ANSWERED', providerUsed: false });
  await expect(question(page)).toHaveValue('発音が聞こえない場合は？'); await expect(question(page)).toHaveJSProperty('readOnly', true);
  await dialog(page).getByTestId('support-recheck').click();
  await expect(dialog(page).getByTestId('support-pending')).toContainText('自動で作り直しません');
  await expect(dialog(page).getByTestId('support-recheck')).toHaveCount(0); await expect(dialog(page).getByTestId('support-answer')).toHaveCount(0);
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual({ action: 'recheck', requestId: bodies[0].requestId });
  await expect(dialog(page).getByTestId('support-submit')).toBeDisabled();
  await dialog(page).getByTestId('support-new-question').click(); await expect(question(page)).toHaveValue(''); expect(bodies).toHaveLength(2);
  await info.attach('support-same-id-inquiry', { body: JSON.stringify({ bodies, originalProviderUsed: original && 'providerUsed' in original ? original.providerUsed : null }), contentType: 'application/json' });
});

test('all seven canonical public source URLs render body/date/version and unknown or stale sources stay unavailable', async ({ page }, info) => {
  expect(PRODUCT_SUPPORT_KNOWLEDGE).toHaveLength(7);
  for (const source of PRODUCT_SUPPORT_KNOWLEDGE) {
    const proposed = new URL(source.sourceURL);
    await page.goto(`${proposed.pathname}${proposed.search}`);
    const body = page.getByTestId('product-support-source-body'); await expect(body).toBeVisible();
    await expect(body.getByRole('heading', { name: source.title, exact: true })).toBeVisible();
    await expect(body).toContainText(source.content); await expect(body).toContainText(source.sourceId);
    await expect(body).toContainText(source.checkedAt); await expect(body).toContainText(source.targetVersion);
    await expect(page).toHaveURL(new RegExp(`supportSource=${source.sourceId}$`));
    expect(await body.locator('a').count()).toBe(0); await attachGeometry(page, info, `support-source-${source.sourceId}`);
  }
  for (const path of ['/public?supportSource=unknown-synthetic-source', '/public?supportSource=study-recall&supportVersion=obsolete']) {
    await page.goto(path); await expect(page.getByTestId('product-support-source-body')).toHaveCount(0);
    await expect(page.getByTestId('product-support-source-page')).toContainText('この根拠を現在の案内で確認できません');
  }
  await page.getByRole('button', { name: '公開案内へ戻る', exact: true }).click(); await expect(page).toHaveURL(/\/public$/);
});

test('student staff question and direct staff evidence stay denied without exposing staff links or a staff form', async ({ page }) => {
  await page.goto('/'); await loginBusinessStudentDemo(page); await open(page);
  let reply: ProductSupportResponse | undefined;
  await page.route('**/api/product-support', async route => { const response = await route.fetch(); expect(response.ok()).toBe(true); reply = await response.json(); await route.fulfill({ response }); });
  await ask(page, '講師や学校管理者のログイン入口は？'); await expect(latestTurn(page).getByTestId('support-draft')).toBeVisible();
  expect(reply).toMatchObject({ status: 'ANSWERED', providerUsed: false, sourceIds: [] });
  await expect(latestTurn(page)).not.toContainText('/teacher'); await expect(latestTurn(page)).not.toContainText('/school-admin');
  await expect(latestTurn(page)).not.toContainText('/service-admin'); await expect(latestTurn(page)).not.toContainText('/admin-access');
  await latestTurn(page).getByTestId('support-draft').click(); await expect(dialog(page).getByTestId('support-local-draft')).toContainText('まだ送信していません');
  await expect(page.getByTestId('product-feedback-create')).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.goto('/public?supportSource=staff-login-entry');
  await expect(page.getByTestId('product-support-source-body')).toHaveCount(0); await expect(page.getByTestId('product-support-source-page')).not.toContainText('/teacher');
  await page.getByRole('button', { name: '自分の画面へ戻る', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
});

test('teacher unknown question becomes a scoped manual report draft only after explicit action', async ({ page }, info) => {
  await page.goto('/'); await loginInstructorDemo(page); await expect(page.getByTestId('instructor-dashboard')).toBeVisible();
  const feedbackMutations: unknown[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/product-feedback' && request.method() === 'POST') {
    const body = request.postDataJSON(); if (body.action === 'create' || body.action === 'advance') feedbackMutations.push(body);
  } });
  await page.route('**/api/product-support', async route => {
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: 'ANSWERED', kind: 'CLARIFICATION', providerUsed: false });
    await route.fulfill({ response });
  });
  await open(page); await ask(page, '公開案内にない機能を確認したいです');
  await expect(latestTurn(page).getByTestId('support-draft')).toBeVisible(); await expect(page.getByTestId('product-feedback-create')).toHaveCount(0);
  await latestTurn(page).getByTestId('support-draft').click(); await expect(dialog(page)).toHaveCount(0);
  const form = page.getByTestId('product-feedback-create'); await expect(form).toBeVisible();
  await expect(form.getByLabel('件名', { exact: true })).toHaveValue('公開案内にない機能を確認したいです');
  await expect(form.getByRole('checkbox')).not.toBeChecked(); await expect(form.getByRole('button', { name: '報告をサーバーに保存' })).toBeDisabled();
  expect(feedbackMutations).toEqual([]); await info.attach('support-manual-draft', { body: JSON.stringify({ feedbackMutations, automaticSave: false }), contentType: 'application/json' });
});

test('closing and logout discard a delayed prior-user reply before opening a fresh guest conversation', async ({ page }) => {
  await page.goto('/'); await loginBusinessStudentDemo(page);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let started = false; let completed = false;
  const requestFailures: string[] = [];
  page.on('requestfailed', request => { if (new URL(request.url()).pathname === '/api/product-support') requestFailures.push(request.failure()?.errorText ?? ''); });
  await page.route('**/api/product-support', async route => {
    const body = route.request().postDataJSON() as Ask; started = true; await held;
    const answer = fixtureAnswer(body, 'STUDENT');
    await route.fulfill({ json: { ...answer, answer: `${resolveProductSupportSources(['study-recall'], 'STUDENT')![0].content}\n旧利用者だけの合成回答。` } }).catch(() => undefined);
    completed = true;
  });
  try {
    await open(page); await ask(page, '理解度を選んだ後の復習方法は？'); await expect.poll(() => started).toBe(true);
    await expect(question(page)).toBeDisabled(); await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'ログアウト', exact: true }).click(); await expect(page.getByTestId('start-first-login')).toBeVisible();
    await open(page); await expect(question(page)).toHaveValue(''); await expect(consent(page)).not.toBeChecked();
    release(); await expect.poll(() => completed).toBe(true); await expect.poll(() => requestFailures.some(message => /abort/i.test(message))).toBe(true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(dialog(page).getByTestId('support-answer')).toHaveCount(0);
    await expect(dialog(page)).not.toContainText('旧利用者だけの合成回答'); await expect(dialog(page).getByTestId('support-pending')).toHaveCount(0);
  } finally { release(); }
});
