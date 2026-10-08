import { exposeStudentDemo } from './smoke-support';
import type { Page } from '@playwright/test';
import type { WordData } from '../../types';
import { expect, test } from './diagnostics';
import { MOBILE_FLOW_TEST_IDS, maybeCompleteOnboarding, openDashboardReference, seedPhrasebook, storageAction } from './smoke-support';

const prepareStudy = async (page: Page, includeDetails = false) => {
  await page.goto('/');
  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const title = 'Study Reliability Fixture';
  const imported = includeDetails
    ? await storageAction<{ importedBookIds: string[] }>(page, 'batchImportWords', {
      defaultBookName: title,
      source: { kind: 'rows', rows: [
        { bookName: title, number: 1, word: 'triage', definition: 'トリアージ', exampleSentence: 'Triage patients carefully.' },
        { bookName: title, number: 2, word: 'stabilize', definition: '安定させる', exampleSentence: 'Stabilize the patient first.' },
      ] },
    })
    : await seedPhrasebook(page, title);
  const bookId = imported.importedBookIds[0] as string;
  await page.reload();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await openDashboardReference(page, 'library');
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

type TransitionSample = { flipped: boolean; backFacing: boolean };
const waitForAnswerFace = (page: Page) => page.waitForFunction(() => {
  const inner = document.querySelector('.study-card-inner');
  return inner?.classList.contains('is-flipped')
    && new DOMMatrixReadOnly(getComputedStyle(inner).transform).m11 < -0.999
    && inner.getAnimations().every(animation => animation.playState === 'finished');
});

const watchCardTransition = (page: Page) => page.evaluate(() => {
  const samples: TransitionSample[] = [];
  const started = performance.now();
  const monitor = window as typeof window & { studyTransitionSamples: TransitionSample[]; studyTransitionDone: boolean };
  monitor.studyTransitionSamples = samples;
  monitor.studyTransitionDone = false;
  const sample = () => {
    const inner = document.querySelector('.study-card-inner');
    if (inner) samples.push({ flipped: inner.classList.contains('is-flipped'),
      backFacing: new DOMMatrixReadOnly(getComputedStyle(inner).transform).m11 < -0.02 });
    if (performance.now() - started < 1600) requestAnimationFrame(sample);
    else monitor.studyTransitionDone = true;
  };
  requestAnimationFrame(sample);
});

const expectFrontOnlyAfterAdvance = async (page: Page) => {
  await page.waitForFunction(() => (window as typeof window & { studyTransitionDone: boolean }).studyTransitionDone);
  const samples = await page.evaluate(() => (window as typeof window & { studyTransitionSamples: TransitionSample[] }).studyTransitionSamples);
  expect(samples.some(sample => sample.flipped)).toBe(true);
  expect(samples.some(sample => !sample.flipped)).toBe(true);
  // aria-hidden alone cannot hide a face while CSS is still rotating it toward the reader.
  expect(samples.filter(sample => !sample.flipped && sample.backFacing)).toEqual([]);
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

  test('requeued study cards preserve the original session XP award', async ({ page }) => {
    const bookId = await prepareStudy(page);
    const words = await loadFixtureWords(page, bookId);
    expect(words).toHaveLength(2);
    const streak = await page.evaluate(async () => {
      const response = await fetch('/api/session');
      if (!response.ok) throw new Error('Could not read the study fixture session');
      const profile = await response.json();
      return profile.stats?.currentStreak ?? 0;
    });
    expect(Number.isSafeInteger(streak)).toBeTruthy();
    expect(streak).toBeGreaterThanOrEqual(0);
    const expectedXp = 20 + Math.round(20 * Math.min(streak, 10) * 0.1);
    const answers: Array<{ word: { id: string }; rating: number; clientAttemptId: string }> = [];
    const awards: number[] = [];
    await page.route('**/api/storage', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === 'saveSRSHistory') answers.push(body.payload);
      if (body?.action === 'addXP') awards.push(body.payload.amount);
      await route.continue();
    });

    await page.getByTestId(`book-study-${bookId}`).click();
    for (const [word, rating] of [[words[0], 0], [words[1], 3], [words[0], 3]] as const) {
      await expect(page.getByTestId('study-card-front')).toContainText(word.word);
      await page.getByTestId('study-flip-button').click();
      await page.getByTestId(`study-rate-${rating}`).click();
    }

    await expect(page.getByTestId('study-finish-exit')).toBeVisible();
    await expect(page.getByTestId('study-reward-unconfirmed')).toHaveCount(0);
    expect(answers.map((answer) => answer.word.id)).toEqual([words[0].id, words[1].id, words[0].id]);
    expect(answers.map((answer) => answer.rating)).toEqual([0, 3, 3]);
    expect(new Set(answers.map((answer) => answer.clientAttemptId)).size).toBe(3);
    expect(awards).toEqual([expectedXp]);
    await page.getByTestId('study-finish-exit').click();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    expect(answers).toHaveLength(3);
    expect(awards).toEqual([expectedXp]);
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`next card hides its answer through delayed save at ${viewport.width}x${viewport.height}, motion ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion });
    const bookId = await prepareStudy(page, true);
    const words = await loadFixtureWords(page, bookId);
    expect(words[0].exampleSentence).toBe('Triage patients carefully.');
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/storage', async route => {
      if (route.request().postDataJSON()?.action === 'saveSRSHistory') await pending;
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await page.getByTestId('study-flip-button').click();
    await waitForAnswerFace(page);
    const bar = page.getByTestId('study-rating-actions');
    const before = await bar.boundingBox();
    await watchCardTransition(page);
    await page.getByTestId('study-rate-3').click();
    try {
      await expect(bar).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByTestId('study-rate-3')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('study-rate-3')).toBeDisabled();
      await expect(page.getByTestId('study-rate-3')).toHaveCSS('outline-style', 'solid');
      await expect(page.getByTestId('study-rate-3')).toHaveCSS('opacity', '1');
      for (const rating of [0, 1, 2]) {
        await expect(page.getByTestId(`study-rate-${rating}`)).toHaveAttribute('aria-pressed', 'false');
      }
      await expect(bar.getByRole('status')).toHaveText('「すぐ分かる」を保存中…');
      const saving = await bar.boundingBox();
      expect(before).not.toBeNull(); expect(saving).not.toBeNull();
      expect(Math.abs(saving!.height - before!.height)).toBeLessThan(1);
      await expect(page.getByTestId('study-card-back')).toContainText(words[0].definition);
      await expect(page.getByTestId('study-details-open')).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.getByTestId('study-card-front')).toContainText(words[1].word);
    await expectFrontOnlyAfterAdvance(page);
    if (reducedMotion === 'reduce') {
      await expect(page.getByTestId('study-card-back')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('study-card-back')).toHaveAttribute('aria-hidden', 'true');
    }
  });
  }}

  test('a single requeued word also restarts at the front without exposing its answer', async ({ page }) => {
    const bookId = await prepareStudy(page);
    const words = await loadFixtureWords(page, bookId);
    await page.route('**/api/storage', async route => {
      if (route.request().postDataJSON()?.action === 'getBookSession') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify([words[0]]) });
      } else await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await page.getByTestId('study-flip-button').click();
    await waitForAnswerFace(page);
    await watchCardTransition(page);
    await page.getByTestId('study-rate-0').click();
    await expect(page.getByTestId('study-flip-button')).toBeVisible();
    await expectFrontOnlyAfterAdvance(page);
    await expect(page.getByTestId('study-card-front')).toContainText(words[0].word);
    await expect(page.getByTestId('study-card-back')).toHaveAttribute('aria-hidden', 'true');
  });

  test('missing examples have no generation controls or paid requests', async ({ page }, testInfo) => {
    const bookId = await prepareStudy(page);
    const paidRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/ai')) paidRequests.push(request.url());
      if (request.url().endsWith('/api/storage') && ['generateWordHintAsset', 'prepareBookExamples'].includes(request.postDataJSON()?.action)) paidRequests.push(request.postData() || '');
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-card-back')).toBeVisible();
    await expect(page.getByTestId('study-example-missing')).toHaveCount(0);
    await expect(page.getByTestId('study-details-open')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('study-missing-example-mobile.png'), fullPage: true });
    await expect(page.getByRole('button', { name: /例文を作る|別の例文|画像を作る|新しく作る|追加のヒント/ })).toHaveCount(0);
    await page.getByTestId('study-rate-3').click();
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-card-back')).toBeVisible();
    await expect(page.getByTestId('study-example-missing')).toHaveCount(0);
    await expect(page.getByTestId('study-details-open')).toHaveCount(0);
    expect(paidRequests).toEqual([]);
  });

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
  test(`saved examples and images are read without paid calls and follow the current card at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const bookId = await prepareStudy(page);
    const words = await loadFixtureWords(page, bookId);
    const paidRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/ai')) paidRequests.push(request.url());
      if (request.url().endsWith('/api/storage') && ['generateWordHintAsset', 'prepareBookExamples'].includes(request.postDataJSON()?.action)) paidRequests.push(request.postData() || '');
    });
    await page.route('**/api/storage', async route => {
      if (route.request().postDataJSON()?.action === 'getBookSession') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(words.map((word, index) => ({
          ...word,
          exampleSentence: `Saved example card ${index + 1}.`,
          exampleMeaning: `保存済みの訳${index + 1}。`,
          exampleGeneratedAt: 1, exampleAuditStatus: 'APPROVED',
          exampleImageUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="orange"/></svg>'),
          exampleImageGeneratedAt: 1, exampleImageAuditStatus: 'APPROVED',
        }))) });
        return;
      }
      await route.continue();
    });
    await page.getByTestId(`book-study-${bookId}`).click();
    await page.getByTestId('study-flip-button').click();
    await page.getByTestId('study-details-open').click();
    await expect(page.getByTestId('study-original-example')).toContainText('Saved example card 1.');
    await page.getByRole('button', { name: '例文の訳を表示', exact: true }).click();
    await expect(page.getByTestId('study-original-example')).toContainText('保存済みの訳1。');
    await page.getByRole('button', { name: /保存済みの画像ヒント/ }).click();
    const savedImage = page.getByRole('img', { name: /保存済み画像ヒント/ });
    const imageDialog = page.getByRole('dialog', { name: '保存済みの画像ヒント', exact: true });
    await expect(imageDialog).toBeVisible();
    await expect(savedImage).toBeVisible();
    await expect(savedImage).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath(`study-saved-example-image-${viewport.width}x${viewport.height}.png`) });
    await page.keyboard.press('Escape');
    await expect(imageDialog).toHaveCount(0);
    await expect(page.getByTestId('study-details-open')).toBeFocused();
    await expect(page.getByRole('button', { name: /例文を作る|別の例文|画像を作る|新しく作る/ })).toHaveCount(0);
    await page.getByTestId('study-rate-3').click();
    await page.getByTestId('study-flip-button').click();
    await page.getByTestId('study-details-open').click();
    await expect(page.getByTestId('study-original-example')).toContainText('Saved example card 2.');
    await expect(page.getByText('Saved example card 1.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '例文の訳を表示', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /保存済み画像ヒント/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '定義を編集', exact: true }).click();
    await page.getByLabel('単語の意味', { exact: true }).fill('語義が変わった合成fixture');
    await page.getByRole('button', { name: '定義の変更を保存', exact: true }).click();
    await page.getByTestId('study-details-open').click();
    await expect(page.getByTestId('study-original-example')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '例文・補足', exact: true }).getByRole('status')).toContainText('例文を見直し中');
    await expect(page.getByRole('button', { name: /保存済みの画像ヒント/ })).toHaveCount(0);
    expect(paidRequests).toEqual([]);
  });
  }

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
    await page.getByLabel('単語の意味', { exact: true }).fill('編集後の定義');
    await page.getByRole('button', { name: '定義の変更を保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('変更を保存できませんでした');
    await expect(page.getByLabel('単語の意味', { exact: true })).toHaveValue('編集後の定義');
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
