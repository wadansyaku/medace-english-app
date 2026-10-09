import { exposeStudentDemo, loginBusinessStudentDemo, maybeCompleteOnboarding, storageAction } from './smoke-support';
import { expect, test } from './diagnostics';
import { MOBILE_FLOW_TEST_IDS, openDashboardReference } from './smoke-support';

test('dashboard recovery keeps failed data unknown and retries without creating a book', async ({ page }) => {
  let shouldFail = true;
  let dashboardRequests = 0;
  await page.route('**/api/storage', async (route) => {
    const body = route.request().postDataJSON() as { action?: string } | null;
    if (body?.action === 'getDashboardSnapshot') {
      dashboardRequests += 1;
      if (shouldFail) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
        return;
      }
    }
    await route.continue();
  });

  await page.goto('/');
  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('dashboard-load-error')).toBeVisible();
  await expect(page.getByTestId('student-dashboard')).toHaveCount(0);
  await expect(page.getByTestId('student-hero-primary-cta')).toHaveCount(0);
  await expect(page.getByTestId('phrasebook-create-modal')).toHaveCount(0);
  const failedRequestCount = dashboardRequests;

  shouldFail = false;
  await page.getByRole('button', { name: 'もう一度読み込む', exact: true }).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await expect(page.getByTestId('student-hero-primary-cta')).toBeVisible();
  await expect(page.getByTestId('dashboard-load-error')).toHaveCount(0);
  expect(dashboardRequests).toBe(failedRequestCount + 1);
  await expect(page.getByTestId('dashboard-reference-panel')).toHaveCount(0);
  await openDashboardReference(page, 'library');
  if (await page.getByTestId('dashboard-library-empty').count()) {
    await expect(page.getByTestId('dashboard-command-metrics')).toHaveCount(0);
    await expect(page.getByText('今日の進捗', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('dashboard-weakness-anchor')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-plan-anchor')).toHaveCount(0);
  }

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dashboard-reference-panel')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-task-reference-library')).toBeFocused();

  const evidenceDirectory = process.env.MEDACE_UI_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: `${evidenceDirectory}/ui-dashboard-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('dashboard-task-overview-rail')).toBeVisible();
    await page.screenshot({ path: `${evidenceDirectory}/ui-dashboard-mobile.png`, fullPage: true, animations: 'disabled' });
  }
});

for (const width of [320, 1366]) {
  test(`personal prepared CSV keeps failed input and saves examples without AI at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let saveCalls = 0;
    const requests: unknown[] = [];
    const aiRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/ai' || /(?:generativelanguage\.googleapis\.com|api\.openai\.com)$/.test(url.hostname)) aiRequests.push(url.pathname);
    });
    await page.route('**/api/storage', async route => {
      if (route.request().postDataJSON()?.action === 'batchImportWords') {
        saveCalls += 1;
        requests.push(route.request().postDataJSON().payload);
        if (saveCalls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic prepared-book save unavailable' }) });
      }
      await route.continue();
    });
    await loginBusinessStudentDemo(page);
    await maybeCompleteOnboarding(page);
    await openDashboardReference(page, 'library');
    const firstCreate = page.getByTestId('library-create-first-personal-book');
    if (await firstCreate.isVisible().catch(() => false)) await firstCreate.click();
    else await page.getByTestId('dashboard-library-section').getByRole('button', { name: /^(作成|新規作成)$/ }).click();
    const modal = page.getByRole('dialog', { name: 'My単語帳 作成', exact: true });
    const title = `Synthetic prepared CSV ${width} ${Date.now()}`;
    const csv = 'Word,Meaning,ExampleSentence,ExampleMeaning\nsource,出典,Please check the source.,出典を確認してください。';
    await modal.getByLabel('単語帳名（変更は任意）', { exact: true }).fill(title);
    await modal.getByText('CSVから取り込む', { exact: true }).click();
    await modal.locator('input[type="file"]').setInputFiles({ name: 'synthetic-not-sent.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic only') });
    await expect(modal.getByRole('alert')).toContainText('自動抽出は現在利用できません');
    await expect(modal.getByTestId('phrasebook-create-submit')).toBeDisabled();
    expect(saveCalls).toBe(0); expect(aiRequests).toEqual([]);
    await modal.getByLabel('CSVを貼り付ける', { exact: true }).fill(csv);
    await modal.getByRole('button', { name: 'CSVを入力欄へ取り込む', exact: true }).click();
    await expect(modal.getByLabel('単語', { exact: true })).toHaveValue('source');
    await expect(modal.getByRole('textbox', { name: '意味', exact: true })).toHaveValue('出典');
    await modal.getByTestId('phrasebook-create-submit').click();
    const confirmation = modal.getByTestId('personal-wordbook-confirmation');
    await expect(confirmation).toContainText('Please check the source.');
    await expect(confirmation).toContainText('出典を確認してください。');
    await modal.getByTestId('phrasebook-create-submit').click();
    await expect(modal.getByRole('alert')).toContainText('Synthetic prepared-book save unavailable');
    await expect(modal.getByRole('alert')).toBeFocused();
    await expect(modal.getByRole('alert')).toBeInViewport();
    await expect(confirmation).toContainText(title);
    await expect(confirmation).toContainText('Please check the source.');
    await expect(modal.getByTestId('phrasebook-create-submit')).toHaveText('保存を再確認');
    expect(saveCalls).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    const geometry = await modal.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: innerHeight };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
    await page.screenshot({ path: info.outputPath(`prepared-import-held-${width}.png`), animations: 'disabled' });
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/storage')
      && response.request().postDataJSON()?.action === 'batchImportWords' && response.ok());
    await modal.getByTestId('phrasebook-create-submit').evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    const result = await (await responsePromise).json();
    await expect(modal.getByTestId('personal-wordbook-saved')).toContainText('1語を保存しました');
    expect(saveCalls).toBe(2); expect(requests[1]).toEqual(requests[0]);
    expect(result.importedBookCount).toBe(1);
    expect(result.importedWordCount).toBe(1);
    const words = await storageAction<any[]>(page, 'getWordsByBook', { bookId: result.importedBookIds[0] });
    expect(words).toEqual([expect.objectContaining({ word: 'source', definition: '出典', exampleSentence: 'Please check the source.', exampleMeaning: '出典を確認してください。' })]);
    await modal.getByRole('button', { name: '一覧へ', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    const revisited = await storageAction<any[]>(page, 'getWordsByBook', { bookId: result.importedBookIds[0] });
    expect(revisited).toEqual(words);
    expect(pageErrors).toEqual([]); expect(aiRequests).toEqual([]);
    await info.attach('prepared-import-acceptance', { body: JSON.stringify({ width, saveCalls, savedBookCount: 1, savedWordCount: 1, repeatedClickAdditionalSaves: 0, aiRequests, pageErrors, revisited: true }), contentType: 'application/json' });
  });
}

for (const width of [320, 1366]) {
  test(`standard plan saves after a failed response and revisits without AI at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    let saves = 0;
    const aiRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/ai' || /(?:generativelanguage\.googleapis\.com|api\.openai\.com)$/.test(url.hostname)) aiRequests.push(url.pathname);
    });
    await page.route('**/api/storage', async route => {
      if (route.request().postDataJSON()?.action === 'saveLearningPlan') {
        saves += 1;
        if (saves === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic plan save unavailable' }) });
      }
      await route.continue();
    });
    await loginBusinessStudentDemo(page);
    await maybeCompleteOnboarding(page);
    expect(await storageAction(page, 'getLearningPlan')).toBeNull();
    await openDashboardReference(page, 'plan');
    const section = page.getByTestId('dashboard-plan-anchor');
    const create = section.getByRole('button', { name: 'プランを作る', exact: true });
    await create.click();
    await expect(page.getByText('学習プランの保存を確認できませんでした。プランを再取得してから再度操作してください。')).toBeVisible();
    await expect(section.getByText('プラン未作成', { exact: true })).toBeVisible();
    expect(await storageAction(page, 'getLearningPlan')).toBeNull();
    const savedResponse = page.waitForResponse(response => response.url().endsWith('/api/storage')
      && response.request().postDataJSON()?.action === 'saveLearningPlan' && response.ok());
    await create.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await savedResponse;
    await expect(section.getByText('今日の学習プラン', { exact: true })).toBeVisible();
    expect(saves).toBe(2);
    const saved = await storageAction<any>(page, 'getLearningPlan');
    expect(saved.selectedBookIds.length).toBeGreaterThan(0);
    expect(saved.dailyWordGoal).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await openDashboardReference(page, 'plan');
    await expect(section.getByText('今日の学習プラン', { exact: true })).toBeVisible();
    expect(await storageAction(page, 'getLearningPlan')).toEqual(saved);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`standard-plan-saved-${width}.png`) });
    if (width === 1366) {
      await openDashboardReference(page, 'account');
      const account = page.getByTestId('dashboard-account-section');
      // The account shortcut opens these details; toggle only if still closed.
      if (await account.getByText('従来AIの参考記録', { exact: true }).count() === 0) {
        await account.getByRole('button', { name: /プラン・学習環境の詳細/ }).click();
      }
      await expect(account.getByText('従来AIの参考記録', { exact: true })).toBeVisible();
      await expect(account).not.toContainText('画像/PDFの単語抽出');
      await expect(account).not.toContainText('専用AI予算');
      await expect(account).toContainText('標準');
      await account.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('available-plan-features-1366.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    expect(aiRequests).toEqual([]);
    await info.attach('standard-plan-acceptance', { body: JSON.stringify({ width, saves, duplicateSaves: 0, selectedBookCount: saved.selectedBookIds.length, aiRequests, revisited: true }), contentType: 'application/json' });
  });
}
