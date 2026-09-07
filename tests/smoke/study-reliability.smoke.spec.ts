import type { Page, Route } from '@playwright/test';
import type { WordData } from '../../types';
import { expect, test } from './diagnostics';
import { MOBILE_FLOW_TEST_IDS, maybeCompleteOnboarding, seedPhrasebook } from './smoke-support';

const prepareStudy = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const imported = await seedPhrasebook(page, 'Study Reliability Fixture');
  const bookId = imported.importedBookIds[0] as string;
  await page.reload();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  return bookId;
};

const loadFixtureWords = (page: Page, bookId: string): Promise<WordData[]> => page.evaluate(async (id) => {
  const response = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getWordsByBook', payload: { bookId: id } }),
  });
  if (!response.ok) throw new Error('Could not load study fixture words');
  return response.json();
}, bookId);

const openExampleHint = async (page: Page) => {
  await page.getByTestId('study-flip-button').click();
  await page.getByRole('button', { name: /まだ難しいときだけヒントを見る/ }).click();
  await page.getByRole('button', { name: '例文を作る', exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
};

test.describe('study reliability', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('failed lesson load is distinct from an empty lesson and can be retried', async ({ page }) => {
    const bookId = await prepareStudy(page);
    let fail = true;
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'getBookSession' && fail) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary fixture failure' }) });
        return;
      }
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await expect(page.getByTestId('study-load-error')).toBeVisible();
    await expect(page.getByText('学習対象の単語はありません', { exact: true })).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'もう一度読み込む', exact: true }).click();
    await expect(page.getByTestId('study-card-front')).toBeVisible();
    await expect(page.getByTestId('study-load-error')).toHaveCount(0);
  });

  test('rapid clicks submit once and a lost response retries the exact same answer', async ({ page }) => {
    const bookId = await prepareStudy(page);
    const answers: Array<{ clientAttemptId: string; rating: number; responseTimeMs: number }> = [];
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'saveSRSHistory') {
        answers.push(body.payload);
        if (answers.length === 1) {
          const response = await route.fetch();
          expect(response.ok()).toBeTruthy();
          // The database accepted the answer, but the client never received its response.
          await route.abort('failed');
          return;
        }
      }
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await page.getByTestId('study-flip-button').click();
    await page.getByTestId('study-rate-3').evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByTestId('study-save-error')).toBeVisible();
    expect(answers).toHaveLength(1);
    expect(answers[0].clientAttemptId).toBeTruthy();
    await page.getByRole('button', { name: '同じ回答を保存する', exact: true }).click();
    await expect(page.getByTestId('study-flip-button')).toBeVisible();
    await expect(page.getByTestId('study-card-front')).toContainText('stabilize');
    expect(answers).toHaveLength(2);
    expect(answers[1]).toEqual(answers[0]);
    await expect(page.getByTestId('study-save-error')).toHaveCount(0);
  });

  test('uncertain XP does not repeat the answer or claim an award', async ({ page }) => {
    const bookId = await prepareStudy(page);
    let answerCount = 0;
    let awardCount = 0;
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'saveSRSHistory') answerCount += 1;
      if (body?.action === 'addXP') {
        awardCount += 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unconfirmed award fixture' }) });
        return;
      }
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    for (let card = 0; card < 2; card += 1) {
      await page.getByTestId('study-flip-button').click();
      await page.getByTestId('study-rate-3').click();
    }
    await expect(page.getByTestId('study-finish-exit')).toBeVisible();
    await expect(page.getByTestId('study-reward-unconfirmed')).toContainText('学習は保存済み');
    await expect(page.getByText(/\+\d+ XP/)).toHaveCount(0);
    expect(answerCount).toBe(2);
    expect(awardCount).toBe(1);
    await page.getByTestId('study-finish-exit').click();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    expect(awardCount).toBe(1);
  });

  test('late hints cannot replace the next card or clear its pending hint', async ({ page }) => {
    const bookId = await prepareStudy(page);
    const words = await loadFixtureWords(page, bookId);
    const pending: Array<{ route: Route; wordId: string }> = [];
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'generateWordHintAsset') {
        pending.push({ route, wordId: body.payload.wordId });
        return;
      }
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await openExampleHint(page);
    await expect.poll(() => pending.length).toBe(1);
    await page.getByTestId('study-rate-3').click();
    await expect(page.getByTestId('study-card-front')).toContainText('stabilize');
    await openExampleHint(page);
    await expect.poll(() => pending.length).toBe(2);

    await Promise.all([
      page.waitForEvent('requestfinished', { predicate: (request) => request === pending[0].route.request() }),
      pending[0].route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        ...words.find((word) => word.id === pending[0].wordId),
        exampleSentence: 'Stale first card hint.', exampleMeaning: '古いカードのヒント',
      }) }),
    ]);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText('例文を作成中...', { exact: true })).toBeVisible();
    await expect(page.getByText('Stale first card hint.')).toHaveCount(0);
    await pending[1].route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      ...words.find((word) => word.id === pending[1].wordId),
      exampleSentence: 'Current second card hint.', exampleMeaning: '現在のカードのヒント',
    }) });
    await expect(page.getByText('Current second card hint.')).toBeVisible();
    await expect(page.getByText('Stale first card hint.')).toHaveCount(0);
  });

  test('a lesson change invalidates a pending hint even at the same card index', async ({ page }) => {
    const firstBookId = await prepareStudy(page);
    const secondImport = await seedPhrasebook(page, 'Second Study Reliability Fixture');
    const secondBookId = secondImport.importedBookIds[0] as string;
    const words = await loadFixtureWords(page, firstBookId);
    let pending: { route: Route; wordId: string } | undefined;
    const answers: Array<{ word: { bookId: string; id: string } }> = [];
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'generateWordHintAsset') {
        pending = { route, wordId: body.payload.wordId };
        return;
      }
      if (body?.action === 'saveSRSHistory') answers.push(body.payload);
      await route.continue();
    });
    await page.getByTestId(`book-study-${firstBookId}`).click();
    await openExampleHint(page);
    await expect.poll(() => Boolean(pending)).toBe(true);
    await page.evaluate((id) => {
      window.history.pushState(null, '', `/study/${encodeURIComponent(id)}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, secondBookId);
    await expect(page.getByTestId('study-flip-button')).toBeVisible();
    const oldHint = pending!;
    await oldHint.route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      ...words.find((word) => word.id === oldHint.wordId),
      word: 'stale-other-lesson', exampleSentence: 'Stale other lesson hint.',
    }) });
    await page.getByTestId('study-flip-button').click();
    await page.getByRole('button', { name: /まだ難しいときだけヒントを見る/ }).click();
    await expect(page.getByText('Stale other lesson hint.')).toHaveCount(0);
    await page.getByTestId('study-rate-3').click();
    await expect(page.getByTestId('study-card-front')).toContainText('stabilize');
    expect(answers).toHaveLength(1);
    expect(answers[0].word.bookId).toBe(secondBookId);
    expect(answers[0].word.id).not.toBe(oldHint.wordId);
  });

  test('failed definition edits preserve the input and support a retry', async ({ page }) => {
    const bookId = await prepareStudy(page);
    let editCount = 0;
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'updateWord') {
        editCount += 1;
        if (editCount === 1) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary edit fixture failure' }) });
          return;
        }
      }
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await page.getByTestId('study-flip-button').click();
    await page.getByRole('button', { name: '定義を編集', exact: true }).click();
    await page.getByLabel('単語の意味').fill('編集後の定義');
    await page.getByRole('button', { name: '定義の変更を保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('変更を保存できませんでした');
    await expect(page.getByLabel('単語の意味')).toHaveValue('編集後の定義');
    await page.getByRole('button', { name: '定義の変更を保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '定義を編集', exact: true })).toBeVisible();
    await expect(page.getByTestId('study-card-back')).toContainText('編集後の定義');
    expect(editCount).toBe(2);
  });

  test('failed reports preserve the input and duplicate clicks submit once', async ({ page }) => {
    const bookId = await prepareStudy(page);
    let reportCount = 0;
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'getBooks') {
        const response = await route.fetch();
        const books = await response.json();
        await route.fulfill({ response, json: books.map((book: { id: string; description?: string }) => book.id === bookId ? { ...book, description: '{}' } : book) });
        return;
      }
      if (body?.action === 'reportWord') {
        reportCount += 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary report fixture failure' }) });
        return;
      }
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await page.getByTestId('study-flip-button').click();
    await page.getByRole('button', { name: '問題を報告する', exact: true }).click();
    await page.getByLabel('報告する内容').fill('定義を確認してください');
    await page.getByRole('button', { name: '報告する', exact: true }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByRole('alert')).toContainText('入力内容は残っています');
    await expect(page.getByLabel('報告する内容')).toHaveValue('定義を確認してください');
    await expect(page.getByRole('button', { name: '報告する', exact: true })).toBeEnabled();
    expect(reportCount).toBe(1);
  });
});
