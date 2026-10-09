import type { Page, TestInfo } from '@playwright/test';
import type { CatalogImportRequest, CatalogImportResult } from '../../contracts/storage';
import { expect, test } from './diagnostics';
import { finishStudySession, getCurrentSessionUser, loginBusinessStudentDemo, maybeCompleteOnboarding, openDashboardReference, storageAction } from './smoke-support';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const login = async (page: Page) => {
  // The canonical business demo creates a new synthetic UID on every login.
  // This preserves plan entitlements and keeps parallel UI audits independent.
  await loginBusinessStudentDemo(page);
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  return getCurrentSessionUser(page);
};

const openCreate = async (page: Page) => {
  await openDashboardReference(page, 'library');
  const first = page.getByTestId('library-create-first-personal-book');
  if (await first.isVisible().catch(() => false)) await first.click();
  else await page.getByTestId('dashboard-library-section').getByRole('button', { name: /^(作成|新規作成)$/ }).click();
  const modal = page.getByRole('dialog', { name: 'My単語帳 作成', exact: true });
  await expect(modal).toBeVisible();
  return modal;
};

const fillWord = async (page: Page, word: string, definition: string) => {
  const modal = page.getByRole('dialog', { name: 'My単語帳 作成', exact: true });
  await modal.getByLabel('単語', { exact: true }).fill(word);
  await modal.getByRole('textbox', { name: '意味', exact: true }).fill(definition);
  await expect(modal.getByLabel('単語', { exact: true })).toHaveValue(word);
  await expect(modal.getByRole('textbox', { name: '意味', exact: true })).toHaveValue(definition);
};

const confirm = async (page: Page) => {
  const modal = page.getByRole('dialog', { name: 'My単語帳 作成', exact: true });
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByTestId('personal-wordbook-confirmation')).toBeVisible();
  await expect(modal.getByTestId('phrasebook-create-submit')).toHaveText('この内容で保存');
  return modal;
};

const save = async (page: Page): Promise<CatalogImportResult> => {
  const response = page.waitForResponse(res => res.url().endsWith('/api/storage')
    && res.request().postDataJSON()?.action === 'batchImportWords' && res.ok());
  await page.getByTestId('phrasebook-create-submit').click();
  const result = await (await response).json();
  await expect(page.getByTestId('personal-wordbook-saved')).toBeVisible();
  return result;
};

const screenshot = async (page: Page, info: TestInfo, name: string) => {
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
};

const monitor = (page: Page) => {
  const errors: string[] = [];
  const ai: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/ai' || /(?:generativelanguage\.googleapis\.com|api\.openai\.com)$/.test(url.hostname)) ai.push(url.pathname);
  });
  return { errors, ai };
};

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 },
]) {
  test(`personal direct one-word save starts its actual book at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const observed = monitor(page);
    await login(page);
    const modal = await openCreate(page);
    await expect(page).toHaveTitle(/Steady Study/);
    await expect(modal.getByLabel('単語', { exact: true })).toBeFocused();
    await expect(modal.getByLabel('単語', { exact: true })).toBeInViewport();
    if (viewport.height >= 500) await expect(modal.getByRole('textbox', { name: '意味', exact: true })).toBeInViewport();
    await expect(modal.getByLabel('単語帳名（変更は任意）', { exact: true })).toHaveValue('自分の単語帳');
    await expect(modal.getByLabel('CSVを貼り付ける', { exact: true })).toBeHidden();
    const geometry = await modal.evaluate(el => ({
      panel: el.getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      word: el.querySelector('#personal-wordbook-word')!.getBoundingClientRect().toJSON(),
      meaning: el.querySelector('#personal-wordbook-definition')!.getBoundingClientRect().toJSON(),
      submit: el.querySelector('[data-testid="phrasebook-create-submit"]')!.getBoundingClientRect().toJSON(),
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(geometry.word.bottom).toBeLessThanOrEqual(geometry.submit.top);
    await screenshot(page, info, 'direct-entry-initial');
    if (viewport.height < 500) {
      // A short landscape viewport can require scrolling. Keyboard navigation
      // must bring the next required field into view above the fixed footer.
      await page.keyboard.press('Tab');
      const meaning = modal.getByRole('textbox', { name: '意味', exact: true });
      await expect(meaning).toBeFocused(); await expect(meaning).toBeInViewport();
      const focused = await meaning.boundingBox(); const footer = await modal.getByTestId('phrasebook-create-submit').boundingBox();
      expect(focused!.y + focused!.height).toBeLessThanOrEqual(footer!.y);
      await screenshot(page, info, 'landscape-required-field-reachable');
    }
    await fillWord(page, 'one-word-entry', '入力中のこの1語を保存する');
    await confirm(page);
    const requests: CatalogImportRequest[] = [];
    const bookSessions: string[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/storage', async route => {
      const body = route.request().postDataJSON();
      if (body?.action === 'getBookSession') bookSessions.push(body.payload.bookId);
      if (body?.action === 'batchImportWords') { requests.push(body.payload); await held; }
      await route.continue();
    });
    const response = page.waitForResponse(res => res.url().endsWith('/api/storage') && res.request().postDataJSON()?.action === 'batchImportWords' && res.ok());
    await modal.getByTestId('phrasebook-create-submit').evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    try {
      await expect.poll(() => requests.length).toBe(1);
      await expect(modal.locator('button[aria-label="閉じる"]')).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(modal).toBeVisible();
      await expect(modal.getByTestId('phrasebook-create-submit')).toBeDisabled();
    } finally { release(); }
    const result: CatalogImportResult = await (await response).json();
    await expect(modal.getByTestId('personal-wordbook-saved')).toContainText('1語を保存しました');
    expect(result.importedBookIds).toHaveLength(1);
    expect(result.importedWordCount).toBe(1);
    expect(requests).toHaveLength(1);
    const words = await storageAction<any[]>(page, 'getWordsByBook', { bookId: result.importedBookIds[0] });
    expect(words).toEqual([expect.objectContaining({ word: 'one-word-entry', definition: '入力中のこの1語を保存する' })]);
    await screenshot(page, info, 'one-word-saved');
    await modal.getByTestId('personal-wordbook-start-study').click();
    await expect(page.getByTestId('study-card-front')).toContainText('one-word-entry');
    await expect.poll(() => bookSessions).toEqual([result.importedBookIds[0]]);
    await screenshot(page, info, 'saved-book-card-learning');
    await finishStudySession(page, 2);
    expect(observed.errors).toEqual([]); expect(observed.ai).toEqual([]);
    await info.attach('one-word-acceptance', { body: JSON.stringify({ viewport, geometry, result, startedBookId: bookSessions[0], saves: requests.length, ...observed }), contentType: 'application/json' });
  });
}

test('personal editor validates half rows, edits three words, undoes deletion and preserves homographs and punctuation', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const observed = monitor(page); await login(page); const modal = await openCreate(page);
  const word = modal.getByLabel('単語', { exact: true });
  await word.fill('light');
  await word.dispatchEvent('compositionstart');
  await word.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await word.dispatchEvent('compositionend', { data: 'light' });
  await expect(word).toBeFocused();
  await expect(modal.getByTestId('personal-wordbook-confirmation')).toHaveCount(0);
  await expect(modal.getByText('入力中も含めて 1 / 500語', { exact: true })).toBeVisible();
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByRole('alert')).toContainText('1語目の単語と意味を両方入力');
  await expect(modal.getByRole('alert')).toBeFocused();
  await modal.getByRole('textbox', { name: '意味', exact: true }).fill('光');
  await modal.getByRole('button', { name: '次の単語を追加', exact: true }).click();
  await expect(word).toBeFocused(); await fillWord(page, 'light', '軽い');
  await modal.getByRole('button', { name: '次の単語を追加', exact: true }).click();
  await fillWord(page, 'take "care", of', '気をつける\n世話をする');
  await modal.getByRole('button', { name: '2語目を編集', exact: true }).click();
  await expect(modal.getByRole('textbox', { name: '意味', exact: true })).toHaveValue('軽い');
  await modal.getByRole('textbox', { name: '意味', exact: true }).fill('軽い（重さ）');
  await modal.getByRole('button', { name: '3語目を削除', exact: true }).click();
  await modal.getByRole('button', { name: '削除を取り消す', exact: true }).click();
  await expect(word).toHaveValue('take "care", of');
  await modal.getByRole('button', { name: '次の単語を追加', exact: true }).click();
  await fillWord(page, 'light', '光');
  await confirm(page);
  await expect(modal.getByTestId('personal-wordbook-confirmation')).toContainText('3語をMy単語帳に保存');
  await expect(modal.getByRole('status')).toContainText('4行目は同じ内容の重複');
  const multilineMeaning = modal.getByTestId('personal-wordbook-confirmation').getByRole('listitem').nth(2).locator('p').first();
  const renderedLines = await multilineMeaning.evaluate(element => {
    const text = element.firstChild;
    if (!(text instanceof Text)) throw new Error('The multiline definition must render as text.');
    const newline = text.data.indexOf('\n');
    if (newline < 0) throw new Error('The definition lost its newline before rendering.');
    const first = document.createRange(); first.setStart(text, 0); first.setEnd(text, newline);
    const second = document.createRange(); second.setStart(text, newline + 1); second.setEnd(text, text.length);
    return { value: text.data, first: first.getBoundingClientRect().toJSON(), second: second.getBoundingClientRect().toJSON() };
  });
  expect(renderedLines.value).toBe('気をつける\n世話をする');
  expect(renderedLines.first.height).toBeGreaterThan(0);
  expect(renderedLines.second.top).toBeGreaterThan(renderedLines.first.top);
  await screenshot(page, info, 'three-words-confirmed');
  const result = await save(page);
  expect(result.importedWordCount).toBe(3); expect(result.skippedRowCount).toBe(1);
  await expect(modal.getByTestId('personal-wordbook-saved')).toContainText('重複した 1行を除きました');
  const words = await storageAction<any[]>(page, 'getWordsByBook', { bookId: result.importedBookIds[0] });
  expect(words.map(w => [w.word, w.definition])).toEqual([['light', '光'], ['light', '軽い（重さ）'], ['take "care", of', '気をつける\n世話をする']]);
  expect(observed.errors).toEqual([]); expect(observed.ai).toEqual([]);
});

test('personal editor keeps the active word on the correct page after deleting and restoring boundary and first rows', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const observed = monitor(page); await login(page); const modal = await openCreate(page);
  const rows = Array.from({ length: 12 }, (_, index) => ({ word: `paging-word-${String(index + 1).padStart(2, '0')}`, definition: `${index + 1}語目の意味` }));
  await modal.getByText('CSVから取り込む', { exact: true }).click();
  await modal.getByLabel('CSVを貼り付ける', { exact: true }).fill(['Word,Meaning', ...rows.map(row => `${row.word},${row.definition}`)].join('\n'));
  await modal.getByRole('button', { name: 'CSVを入力欄へ取り込む', exact: true }).click();
  const editor = modal.getByTestId('personal-wordbook-editor');
  const word = editor.getByLabel('単語', { exact: true });
  const meaning = editor.getByRole('textbox', { name: '意味', exact: true });
  const expectSelection = async (visibleRowNumber: number, originalRowNumber: number) => {
    const original = rows[originalRowNumber - 1];
    await expect(word).toHaveValue(original.word);
    await expect(meaning).toHaveValue(original.definition);
    await expect(word).toBeFocused();
    const selected = editor.getByRole('button', { name: `${visibleRowNumber}語目を編集`, exact: true });
    await expect(selected).toBeVisible();
    await expect(selected).toContainText(original.word);
    await expect(selected).toContainText(original.definition);
    await expect(editor.getByText('1 / 2', { exact: true })).toBeVisible();
    await expect(editor.getByRole('button', { name: '前の10語', exact: true })).toBeDisabled();
  };
  await expect(editor.getByText('入力中も含めて 12 / 500語', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: '10語目を編集', exact: true }).click();
  await expectSelection(10, 10);
  await editor.getByRole('button', { name: '10語目を削除', exact: true }).click();
  // The old eleventh word is now the tenth row, still on the first page.
  await expectSelection(10, 11);
  await expect(editor.getByText('入力中も含めて 11 / 500語', { exact: true })).toBeVisible();
  await screenshot(page, info, 'paging-boundary-row-deleted');
  await editor.getByRole('button', { name: '削除を取り消す', exact: true }).click();
  await expectSelection(10, 10);
  await expect(editor.getByText('入力中も含めて 12 / 500語', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: '1語目を削除', exact: true }).click();
  await expectSelection(1, 2);
  await editor.getByRole('button', { name: '削除を取り消す', exact: true }).click();
  await expectSelection(1, 1);
  await expect(editor.getByText('入力中も含めて 12 / 500語', { exact: true })).toBeVisible();
  await screenshot(page, info, 'paging-first-row-restored');
  await confirm(page);
  const confirmation = modal.getByTestId('personal-wordbook-confirmation');
  await expect(confirmation).toContainText('12語をMy単語帳に保存');
  await expect(confirmation.getByRole('listitem')).toHaveCount(10);
  await confirmation.getByRole('button', { name: '次の10語', exact: true }).click();
  await expect(confirmation.getByRole('listitem')).toHaveCount(2);
  await expect(confirmation.getByRole('listitem').first()).toContainText(rows[10].word);
  await expect(confirmation.getByRole('listitem').last()).toContainText(rows[11].word);
  const result = await save(page);
  expect(result.importedBookIds).toHaveLength(1); expect(result.importedWordCount).toBe(12); expect(result.skippedRowCount).toBe(0);
  const savedWords = await storageAction<any[]>(page, 'getWordsByBook', { bookId: result.importedBookIds[0] });
  expect(savedWords.map(row => ({ word: row.word, definition: row.definition }))).toEqual(rows);
  const startedBookIds: string[] = [];
  await page.route('**/api/storage', async route => {
    const body = route.request().postDataJSON();
    if (body?.action === 'getBookSession') startedBookIds.push(body.payload.bookId);
    await route.continue();
  });
  await modal.getByTestId('personal-wordbook-start-study').click();
  await expect(page.getByTestId('study-card-front')).toContainText(rows[0].word);
  await expect.poll(() => startedBookIds).toEqual([result.importedBookIds[0]]);
  expect(observed.errors).toEqual([]); expect(observed.ai).toEqual([]);
  await info.attach('paging-recovery', { body: JSON.stringify({ inputAndListStayedOnPageOne: true, restoredOriginalOrder: true, savedWordCount: savedWords.length, startedReturnedBookId: true }), contentType: 'application/json' });
});

test('personal draft retains current input across close, browser back and reload', async ({ page }, info) => {
  await login(page); let modal = await openCreate(page);
  await fillWord(page, 'unfinished-current-row', '現在入力している語');
  await modal.getByRole('button', { name: '次の単語を追加', exact: true }).click();
  await fillWord(page, 'second-draft-row', '2語目の入力');
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
  await expect(page.getByTestId('library-create-first-personal-book')).toBeFocused();
  modal = await openCreate(page);
  await expect(modal.getByRole('button', { name: '2語目を編集', exact: true })).toContainText('second-draft-row');
  await page.reload(); await expect(page.getByTestId('student-dashboard')).toBeVisible(); modal = await openCreate(page);
  await expect(modal.getByRole('button', { name: '1語目を編集', exact: true })).toContainText('unfinished-current-row');
  await expect(modal.getByRole('button', { name: '2語目を編集', exact: true })).toContainText('second-draft-row');
  await confirm(page); await modal.getByRole('button', { name: '入力へ戻る', exact: true }).click();
  await expect(modal.getByRole('button', { name: '2語目を編集', exact: true })).toContainText('second-draft-row');
  await page.goto('/public'); await page.goBack();
  await expect(page.getByTestId('student-dashboard')).toBeVisible(); modal = await openCreate(page);
  await expect(modal.getByRole('button', { name: '2語目を編集', exact: true })).toContainText('second-draft-row');
  await screenshot(page, info, 'draft-revisited');
});

test('personal lost reply retries the same immutable ID and payload after reload and creates one book', async ({ page }, info) => {
  await login(page); let modal = await openCreate(page);
  await fillWord(page, 'committed-lost-reply', '応答が失われても1冊だけ'); await confirm(page);
  const requests: CatalogImportRequest[] = [];
  const results: CatalogImportResult[] = [];
  await page.route('**/api/storage', async route => {
    if (route.request().postDataJSON()?.action !== 'batchImportWords') return route.continue();
    requests.push(route.request().postDataJSON().payload);
    const response = await route.fetch(); expect(response.ok()).toBe(true); results.push(await response.json());
    if (requests.length === 1) return route.abort('failed');
    await route.fulfill({ response });
  });
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByTestId('personal-wordbook-saved')).toHaveCount(0);
  await expect(modal.getByRole('button', { name: '保存を再確認', exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: '入力へ戻る', exact: true })).toHaveCount(0);
  await screenshot(page, info, 'lost-reply-frozen');
  await page.reload(); await expect(page.getByTestId('student-dashboard')).toBeVisible(); modal = await openCreate(page);
  await expect(modal.getByRole('button', { name: '保存を再確認', exact: true })).toBeFocused();
  await save(page);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect(results[1]).toEqual(results[0]);
  const books = await storageAction<any[]>(page, 'getBooks');
  expect(books.filter(book => book.id === results[0].importedBookIds[0])).toHaveLength(1);
  expect(await storageAction<any[]>(page, 'getWordsByBook', { bookId: results[0].importedBookIds[0] })).toHaveLength(1);
  await screenshot(page, info, 'lost-reply-recovered');
  await info.attach('lost-reply-receipt', { body: JSON.stringify({ requests, results, oneBook: true }), contentType: 'application/json' });
});

for (const lateOutcome of ['success', 'lost-response'] as const) {
  test(`personal late save reply in another tab preserves the newer draft after a shared retry succeeds (${lateOutcome})`, async ({ page }, info) => {
    await login(page); const modalA = await openCreate(page);
    await fillWord(page, 'shared-committed-word', '2タブでも1冊だけ'); await confirm(page);
    const observedA = monitor(page);
    const requests: CatalogImportRequest[] = [];
    const receipts: CatalogImportResult[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/storage', async route => {
      if (route.request().postDataJSON()?.action !== 'batchImportWords') return route.continue();
      requests.push(route.request().postDataJSON().payload);
      const response = await route.fetch(); expect(response.ok()).toBe(true); receipts.push(await response.json());
      await held;
      if (lateOutcome === 'lost-response') await route.abort('failed');
      else await route.fulfill({ response });
    });
    const pageB = await page.context().newPage();
    const observedB = monitor(pageB);
    await pageB.route('**/api/storage', async route => {
      if (route.request().postDataJSON()?.action === 'batchImportWords') requests.push(route.request().postDataJSON().payload);
      await route.continue();
    });
    let result: CatalogImportResult | undefined;
    try {
      await modalA.getByTestId('phrasebook-create-submit').click();
      // The server has committed A, but A has not received its receipt yet.
      await expect.poll(() => receipts.length).toBe(1);
      await pageB.goto('/'); await expect(pageB.getByTestId('student-dashboard')).toBeVisible();
      const modalB = await openCreate(pageB);
      await expect(modalB.getByRole('button', { name: '保存を再確認', exact: true })).toBeFocused();
      result = await save(pageB);
      expect(result).toEqual(receipts[0]); expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
      await modalB.getByRole('button', { name: 'もう1冊作る', exact: true }).click();
      await fillWord(pageB, 'newer-unfinished-draft', '遅い応答で上書きしない');
      await expect(modalB.getByLabel('単語', { exact: true })).toHaveValue('newer-unfinished-draft');
      await expect(modalB.getByRole('textbox', { name: '意味', exact: true })).toHaveValue('遅い応答で上書きしない');
      await expect(modalA.getByTestId('phrasebook-create-submit')).toBeDisabled();
    } finally { release(); }
    // Waiting for A's pending save to settle catches a completion that would
    // replace the newer draft with the already-resolved saved-result screen.
    await expect(modalA.getByTestId('phrasebook-create-submit')).toBeEnabled();
    await expect(modalA.getByLabel('単語', { exact: true })).toHaveValue('newer-unfinished-draft');
    await expect(modalA.getByRole('textbox', { name: '意味', exact: true })).toHaveValue('遅い応答で上書きしない');
    await expect(pageB.getByLabel('単語', { exact: true })).toHaveValue('newer-unfinished-draft');
    await expect(modalA.getByTestId('personal-wordbook-saved')).toHaveCount(0);
    await expect(modalA.getByRole('button', { name: '保存を再確認', exact: true })).toHaveCount(0);
    await expect(modalA.getByRole('alert')).toHaveCount(0);
    await screenshot(page, info, `two-tab-${lateOutcome}-new-draft-preserved`);
    await pageB.reload(); await expect(pageB.getByTestId('student-dashboard')).toBeVisible();
    const reopenedB = await openCreate(pageB);
    await expect(reopenedB.getByLabel('単語', { exact: true })).toHaveValue('newer-unfinished-draft');
    await expect(reopenedB.getByRole('textbox', { name: '意味', exact: true })).toHaveValue('遅い応答で上書きしない');
    const books = await storageAction<any[]>(pageB, 'getBooks');
    expect(books.filter(book => book.id === result!.importedBookIds[0])).toHaveLength(1);
    expect(await storageAction<any[]>(pageB, 'getWordsByBook', { bookId: result!.importedBookIds[0] })).toEqual([expect.objectContaining({ word: 'shared-committed-word', definition: '2タブでも1冊だけ' })]);
    expect(observedA.errors).toEqual([]); expect(observedB.errors).toEqual([]);
    expect(observedA.ai).toEqual([]); expect(observedB.ai).toEqual([]);
    await info.attach('two-tab-recovery', { body: JSON.stringify({ lateOutcome, identicalRequest: true, originalBookId: result!.importedBookIds[0], originalWordCount: 1, newerDraftRetained: true }), contentType: 'application/json' });
  });
}

test('personal definite rejection unlocks correction while retaining the entered word', async ({ page }) => {
  await login(page); const modal = await openCreate(page); await fillWord(page, 'correct-after-reject', '訂正前'); await confirm(page);
  const requests: CatalogImportRequest[] = [];
  await page.route('**/api/storage', async route => {
    if (route.request().postDataJSON()?.action !== 'batchImportWords') return route.continue();
    requests.push(route.request().postDataJSON().payload);
    if (requests.length === 1) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic definite rejection' }) });
    await route.continue();
  });
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByRole('alert')).toContainText('Synthetic definite rejection');
  await expect(modal.getByLabel('単語', { exact: true })).toHaveValue('correct-after-reject');
  await expect(modal.getByRole('textbox', { name: '意味', exact: true })).toHaveValue('訂正前');
  await modal.getByRole('textbox', { name: '意味', exact: true }).fill('訂正後'); await confirm(page);
  const result = await save(page);
  expect(requests).toHaveLength(2); expect(requests[1].clientImportId).not.toBe(requests[0].clientImportId);
  const words = await storageAction<any[]>(page, 'getWordsByBook', { bookId: result.importedBookIds[0] });
  expect(words[0].definition).toBe('訂正後');
});

const holdPersonalCsv = async (page: Page) => {
  await page.evaluate(() => {
    const original = File.prototype.text;
    Object.assign(window, { personalCsvStarted: false });
    File.prototype.text = function () {
      if (this.name !== 'held-personal.csv') return original.call(this);
      Object.assign(window, { personalCsvStarted: true });
      return new Promise<string>(resolve => {
        Object.assign(window, { releasePersonalCsv: () => resolve('Word,Meaning\ncsv-word,取り込む予定だった語') });
      });
    };
  });
  const modal = page.getByRole('dialog', { name: 'My単語帳 作成', exact: true });
  await modal.getByText('CSVから取り込む', { exact: true }).click();
  await modal.getByLabel('CSVファイル', { exact: true }).setInputFiles({ name: 'held-personal.csv', mimeType: 'text/csv', buffer: Buffer.from('Word,Meaning\ncsv-word,取り込む予定だった語') });
  await expect.poll(() => page.evaluate(() => (window as unknown as { personalCsvStarted: boolean }).personalCsvStarted)).toBe(true);
};

const releasePersonalCsv = (page: Page) => page.evaluate(() => (window as unknown as { releasePersonalCsv: () => void }).releasePersonalCsv());

for (const storageDelivery of ['delivered', 'held'] as const) {
test(`personal delayed CSV never replaces a newer draft from another tab (${storageDelivery} storage event)`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (storageDelivery === 'held') await page.addInitScript(() => {
    // Install before the app registers listeners; window is itself the event
    // target, so a later capture listener cannot reliably precede old handlers.
    window.addEventListener('storage', event => {
      if (event.key?.startsWith('steady-study:personal-wordbook-draft:')) event.stopImmediatePropagation();
    }, true);
  });
  const user = await login(page); const modalA = await openCreate(page);
  await modalA.getByLabel('単語帳名（変更は任意）', { exact: true }).fill('original draft');
  await fillWord(page, 'original', '元の下書き');
  await holdPersonalCsv(page);
  const pageB = await page.context().newPage(); await pageB.goto('/');
  await expect(pageB.getByTestId('student-dashboard')).toBeVisible(); const modalB = await openCreate(pageB);
  await modalB.getByLabel('単語帳名（変更は任意）', { exact: true }).fill('newer draft');
  await fillWord(pageB, 'newer-tab-word', '別タブの新しい下書き');
  await expect(modalA.getByLabel('単語', { exact: true })).toHaveValue(storageDelivery === 'held' ? 'original' : 'newer-tab-word');
  await screenshot(page, info, 'csv-pending-newer-draft-visible');
  await releasePersonalCsv(page);
  await expect(modalA.getByTestId('phrasebook-create-submit')).toBeEnabled();
  await expect(modalA.getByLabel('単語帳名（変更は任意）', { exact: true })).toHaveValue('newer draft');
  await expect(modalA.getByLabel('単語', { exact: true })).toHaveValue('newer-tab-word');
  await expect(modalA.getByRole('alert')).toContainText('CSVは取り込んでいません');
  await expect(modalA.getByText('1語を取り込みました。単語を選ぶと編集できます。', { exact: true })).toHaveCount(0);
  const stored = await page.evaluate(uid => JSON.parse(localStorage.getItem(`steady-study:personal-wordbook-draft:v1:${encodeURIComponent(uid)}`)!), user!.uid);
  expect(stored.title).toBe('newer draft'); expect(stored.rows.map((row: { word: string }) => row.word)).toEqual(['newer-tab-word']);
  await screenshot(page, info, 'csv-late-completion-newer-draft-retained');
  await pageB.reload(); await expect(pageB.getByTestId('student-dashboard')).toBeVisible();
  const reopened = await openCreate(pageB); await expect(reopened.getByLabel('単語', { exact: true })).toHaveValue('newer-tab-word');
  await confirm(pageB); const result = await save(pageB);
  expect(await storageAction<any[]>(pageB, 'getWordsByBook', { bookId: result.importedBookIds[0] })).toEqual([expect.objectContaining({ word: 'newer-tab-word', definition: '別タブの新しい下書き' })]);
});
}

test('personal definite rejection remains editable when clearing its persisted request fails', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const user = await login(page); const modal = await openCreate(page);
  await fillWord(page, 'before-rejected-write', '訂正前'); await confirm(page);
  const requests: CatalogImportRequest[] = [];
  await page.route('**/api/storage', async route => {
    if (route.request().postDataJSON()?.action !== 'batchImportWords') return route.continue();
    requests.push(route.request().postDataJSON().payload);
    if (requests.length !== 1) return route.continue();
    const stored = await page.evaluate(uid => JSON.parse(localStorage.getItem(`steady-study:personal-wordbook-draft:v1:${encodeURIComponent(uid)}`)!), user!.uid);
    expect(stored.pendingRequest).toEqual(requests[0]);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Object.assign(window, { restorePersonalDraftWrites: () => { Storage.prototype.setItem = original; } });
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('steady-study:personal-wordbook-draft:')) throw new DOMException('Synthetic rejected-request quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic definite 400 rejection' }) });
  });
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByRole('alert')).toContainText('Synthetic definite 400 rejection');
  await expect(modal.getByText(/下書きをこのブラウザーに保存できません/)).toBeVisible();
  await modal.getByLabel('単語', { exact: true }).fill('corrected-after-rejected-write');
  await expect(modal.getByTestId('personal-wordbook-confirmation')).toHaveCount(0);
  await expect(modal.getByLabel('単語', { exact: true })).toHaveValue('corrected-after-rejected-write');
  await modal.getByRole('textbox', { name: '意味', exact: true }).fill('訂正後も編集を保持');
  await screenshot(page, info, 'rejected-pending-clear-quota-remains-editable');
  await page.evaluate(() => (window as unknown as { restorePersonalDraftWrites: () => void }).restorePersonalDraftWrites());
  await confirm(page); const result = await save(page);
  expect(requests).toHaveLength(2); expect(requests[1].clientImportId).not.toBe(requests[0].clientImportId);
  expect(await storageAction<any[]>(page, 'getWordsByBook', { bookId: result.importedBookIds[0] })).toEqual([expect.objectContaining({ word: 'corrected-after-rejected-write', definition: '訂正後も編集を保持' })]);
});

test('personal delayed CSV after modal unmount cannot update the old owner draft', async ({ page }) => {
  const user = await login(page); const modal = await openCreate(page); await fillWord(page, 'before-unmount', '閉じた下書きを保持');
  const before = await page.evaluate(uid => localStorage.getItem(`steady-study:personal-wordbook-draft:v1:${encodeURIComponent(uid)}`), user!.uid);
  await holdPersonalCsv(page);
  // Emulate an auth-driven SPA unmount while File.text is unresolved. A normal
  // modal close remains locked during the read; the underlying logout handler
  // exercises teardown without replacing the browser document or its promise.
  await page.evaluate(() => {
    const logout = document.querySelector<HTMLButtonElement>('button[aria-label="ログアウト"]');
    if (!logout) throw new Error('Synthetic logout control missing');
    logout.click();
  });
  await expect(page.getByTestId('start-first-home')).toBeVisible();
  await releasePersonalCsv(page);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(uid => localStorage.getItem(`steady-study:personal-wordbook-draft:v1:${encodeURIComponent(uid)}`), user!.uid)).toBe(before);
});

test('personal slow committed response becomes recoverable and a late reply cannot duplicate or clear the saved result', async ({ page }, info) => {
  await login(page); const modal = await openCreate(page); await fillWord(page, 'slow-committed-reply', '遅い応答も1冊だけ'); await confirm(page);
  const requests: CatalogImportRequest[] = [];
  let release!: () => void; let markDelivered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const delivered = new Promise<void>(resolve => { markDelivered = resolve; });
  await page.route('**/api/storage', async route => {
    if (route.request().postDataJSON()?.action !== 'batchImportWords') return route.continue();
    requests.push(route.request().postDataJSON().payload);
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    if (requests.length === 1) { await held; await route.fulfill({ response }); markDelivered(); }
    else await route.fulfill({ response });
  });
  let result: CatalogImportResult | undefined;
  try {
    await modal.getByTestId('phrasebook-create-submit').click();
    await expect(modal.getByRole('alert')).toContainText('保存の応答を確認できませんでした', { timeout: 30_000 });
    await expect(modal.getByRole('button', { name: '保存を再確認', exact: true })).toBeEnabled();
    await expect(modal.getByTestId('personal-wordbook-saved')).toHaveCount(0);
    await screenshot(page, info, 'slow-response-recoverable');
    result = await save(page);
    expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  } finally { release(); }
  await delivered;
  await expect(modal.getByTestId('personal-wordbook-saved')).toContainText('1語を保存しました');
  const books = await storageAction<any[]>(page, 'getBooks');
  expect(books.filter(book => book.id === result!.importedBookIds[0])).toHaveLength(1);
  expect(await storageAction<any[]>(page, 'getWordsByBook', { bookId: result!.importedBookIds[0] })).toHaveLength(1);
});

test('personal local draft storage failure explains memory-only retention and keeps a failed save retryable', async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('steady-study:personal-wordbook-draft:')) throw new DOMException('Synthetic quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await login(page); const modal = await openCreate(page); await fillWord(page, 'memory-only-draft', '端末保存不可でも保持');
  await expect(modal.getByText(/下書きをこのブラウザーに保存できません/)).toBeVisible(); await confirm(page);
  let calls = 0;
  await page.route('**/api/storage', async route => {
    if (route.request().postDataJSON()?.action === 'batchImportWords' && ++calls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic memory-only save unavailable' }) });
    await route.continue();
  });
  await modal.getByTestId('phrasebook-create-submit').click();
  await expect(modal.getByRole('alert')).toContainText('Synthetic memory-only save unavailable');
  await expect(modal.getByTestId('personal-wordbook-confirmation')).toContainText('memory-only-draft');
  await screenshot(page, info, 'memory-only-retry');
  expect((await save(page)).importedWordCount).toBe(1); expect(calls).toBe(2);
});

test('personal logout and another account never reveal the previous UID draft', async ({ page }) => {
  const userA = await login(page); let modal = await openCreate(page); await fillWord(page, 'first-uid-private-draft', '別accountへ表示しない');
  await page.keyboard.press('Escape');
  const firstSessionCookies = await page.context().cookies();
  // While A is authenticated, use the same demo API rather than navigating to
  // a public role page that the signed-in router may intentionally redirect.
  const switched = await page.evaluate(async () => {
    const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'demo-login', role: 'STUDENT', organizationRole: 'STUDENT' }) });
    return response.ok;
  });
  expect(switched).toBe(true); await page.reload(); await maybeCompleteOnboarding(page);
  const userB = await getCurrentSessionUser(page); expect(userA!.uid).not.toBe(userB!.uid);
  modal = await openCreate(page); await expect(modal.getByLabel('単語', { exact: true })).toHaveValue(''); await expect(modal.getByRole('textbox', { name: '意味', exact: true })).toHaveValue('');
  await fillWord(page, 'second-uid-draft', '2つ目account'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByTestId('start-first-home')).toBeVisible(); await expect(page.locator('body')).not.toContainText('first-uid-private-draft');
  await expect(page.locator('body')).not.toContainText('second-uid-draft');
  // The first account's own still-valid session simulates returning to that UID.
  // Cookies stay in this local browser fixture and are never printed or attached.
  await page.context().addCookies(firstSessionCookies); await page.goto('/');
  await expect(page.getByTestId('student-dashboard')).toBeVisible(); modal = await openCreate(page);
  await expect(modal.getByLabel('単語', { exact: true })).toHaveValue('first-uid-private-draft');
  await expect(modal).not.toContainText('second-uid-draft');
  expect(userB!.email).not.toBe(userA!.email);
});

test.describe('personal 200-percent-equivalent viewport reflow', () => {
  test.use({ viewport: { width: 683, height: 450 }, deviceScaleFactor: 2 });
  test('personal direct entry remains reachable in the equivalent layout viewport', async ({ page }, info) => {
    // A 1366x900 window at 200% has half the CSS viewport and twice the pixel
    // density. This tests that reflow; the native browser zoom menu is separate.
    await login(page); const modal = await openCreate(page);
    await modal.getByLabel('単語', { exact: true }).fill('zoom-entry'); await modal.getByRole('textbox', { name: '意味', exact: true }).fill('拡大相当の配置でも保存できる');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(683);
    await expect(modal.getByTestId('phrasebook-create-submit')).toBeInViewport(); await confirm(page);
    await expect(modal.getByTestId('phrasebook-create-submit')).toBeInViewport();
    expect((await save(page)).importedWordCount).toBe(1);
    await expect(modal.getByTestId('personal-wordbook-start-study')).toBeInViewport();
    await screenshot(page, info, 'desktop-200-percent-equivalent-reflow');
  });
});

test('personal confirmed save remains usable when dashboard refresh fails', async ({ page }, info) => {
  await login(page); const modal = await openCreate(page); await fillWord(page, 'saved-refresh-failure', '保存は成功した'); await confirm(page);
  let saved = false;
  await page.route('**/api/storage', async route => {
    const action = route.request().postDataJSON()?.action;
    if (action === 'batchImportWords') { const response = await route.fetch(); expect(response.ok()).toBe(true); saved = true; return route.fulfill({ response }); }
    if (saved && action === 'getDashboardSnapshot') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic post-save dashboard unavailable' }) });
    await route.continue();
  });
  const result = await save(page); expect(result.importedWordCount).toBe(1);
  await expect(modal.getByTestId('personal-wordbook-start-study')).toBeEnabled();
  await screenshot(page, info, 'saved-with-refresh-failure');
  await modal.getByTestId('personal-wordbook-start-study').click();
  await expect(page.getByTestId('study-card-front')).toContainText('saved-refresh-failure');
});
