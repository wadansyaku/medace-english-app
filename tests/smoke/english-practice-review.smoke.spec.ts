import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { ORIGINAL_GRAMMAR_QUESTIONS } from '../../config/grammarQuestionBank';
import { ORIGINAL_TRANSLATION_QUESTIONS } from '../../config/translationQuestionBank';

// Real ReactDOM, built production CSS and browser localStorage; all requests are synthetic.
let bundle: string;
let css: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import EnglishPracticeHub from './components/practice/EnglishPracticeHub';
      import { ORIGINAL_GRAMMAR_QUESTIONS } from './config/grammarQuestionBank';
      import { clearEnglishPracticeProgress } from './utils/englishPracticeProgress';
      globalThis.__clearReviewProgress = () => clearEnglishPracticeProgress('synthetic-review-student');
      if (globalThis.__reviewBankUpdated) {
        const recorded = JSON.parse(localStorage.getItem('medace:english-practice-progress:synthetic-review-student') || 'null')?.attempts?.[0];
        const question = ORIGINAL_GRAMMAR_QUESTIONS.find(question => question.id === recorded?.curatedQuestionId);
        if (question) {
          question.version = 99; question.explanationJa = '改版後の合成解説です。';
          question.contextJa = '改版後の合成文脈です。'; question.answer = 'revised-bank-answer';
          question.options = ['revised-bank-answer', 'synthetic-new-distractor'];
          question.clozeSentence = 'Synthetic ____ revision.'; question.sourceSentence = 'Synthetic revised-bank-answer revision.';
        }
      }
      globalThis.__reviewCurrentBank = ORIGINAL_GRAMMAR_QUESTIONS.map(question => ({
        id: question.id, version: question.version, answer: question.answer, explanationJa: question.explanationJa,
      }));
      createRoot(document.getElementById('root')).render(<EnglishPracticeHub
        user={{ uid: 'synthetic-review-student', displayName: '合成生徒', role: 'STUDENT', englishLevel: 'B1' }}
        initialLane="grammar" variant="embedded" />);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, format: 'iife',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'synthetic-review-services', setup(builder) {
      builder.onResolve({ filter: /services\/learning$/ }, () => ({ path: 'learning', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `export const learningService = {
        getDailySessionWords: () => Promise.resolve([]),
        recordEnglishPracticeAttempt: (_uid, payload) => {
          globalThis.__reviewPayloads.push(payload);
          return Promise.resolve({ id: payload.clientAttemptId, projectionStatus: 'COMPLETE' });
        }
      };` }));
    } }],
  });
  bundle = result.outputFiles[0].text;
  const index = await readFile('dist/index.html', 'utf8');
  const stylesheet = index.match(/href="([^"]+\.css)"/)?.[1];
  if (!stylesheet) throw new Error('Production CSS missing');
  css = await readFile(`dist${stylesheet}`, 'utf8');
});

const setup = async (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.request().url().endsWith('/synthetic-return')
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><h1>合成の戻り先</h1>' })
      : route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Steady Study | 合成回答履歴</title><style>${css}</style></head><body><div id="root"></div></body></html>` })
    : route.abort());
  await page.addInitScript(() => { (globalThis as any).__reviewPayloads = []; });
  await page.goto('http://127.0.0.1:41827/synthetic-practice-review');
  await page.addScriptTag({ content: bundle });
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  return errors;
};
const remount = async (page: Page) => {
  await page.reload(); await page.addScriptTag({ content: bundle });
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
};
const records = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('medace:english-practice-progress:synthetic-review-student')!).attempts);
const assertWidth = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

for (const viewport of [{ width: 320, height: 760 }, { width: 1366, height: 900 }]) {
  test(`device review keeps the same answer and feedback after reload at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors = await setup(page);
    await expect(page).toHaveTitle('Steady Study | 合成回答履歴');
    expect(page.url()).toContain('/synthetic-practice-review');
    const grammar = page.getByTestId('grammar-practice-question');
    const id = await grammar.getAttribute('data-question-id');
    const source = ORIGINAL_GRAMMAR_QUESTIONS.find(question => question.id === id)!;
    const wrong = source.options.find(option => option !== source.answer)!;
    await grammar.getByRole('button', { name: wrong, exact: true }).click();
    await grammar.getByRole('button', { name: '判定する', exact: true }).click();
    await expect.poll(async () => (await records(page))[0]?.syncStatus).toBe('synced');
    const original = (await records(page))[0];
    expect(original.review).toMatchObject({ questionId: source.id, questionVersion: source.version,
      submittedAnswer: wrong, assessment: 'incorrect', answerReasonJa: source.distractorReasons[wrong] });
    const payloads = await page.evaluate(() => (globalThis as any).__reviewPayloads);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).not.toHaveProperty('review');
    expect(payloads[0]).not.toHaveProperty('curatedQuestionId');
    await remount(page);
    const history = page.getByTestId('english-practice-review-history');
    await history.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
    const first = history.getByTestId('english-practice-review-attempt').first();
    await first.locator(':scope > summary').click();
    await expect(first).toContainText(wrong); await expect(first).toContainText(source.distractorReasons[wrong]);
    await expect(first).toContainText(source.explanationJa); await expect(first).toContainText('出題時の版 1');
    expect((await records(page))[0].review).toEqual(original.review);
    expect(await page.evaluate(() => (globalThis as any).__reviewPayloads)).toHaveLength(0);
    await assertWidth(page);
    await page.screenshot({ path: info.outputPath('grammar-review.png'), fullPage: true });

    await page.getByTestId('english-practice-lane-translation').click();
    const translation = page.getByTestId('translation-practice-question');
    const translationId = await translation.getAttribute('data-question-id');
    const translated = ORIGINAL_TRANSLATION_QUESTIONS.find(question => question.id === translationId)!;
    const input = translation.getByRole('textbox');
    await input.fill('未登録の合成答案です');
    await translation.getByRole('button', { name: '答案チェック', exact: true }).click();
    await expect(translation).toContainText('未採点');
    expect(await records(page)).toHaveLength(1);
    await input.fill(translated.knownIncorrectTranslations[0].text);
    await translation.getByRole('button', { name: '修正した訳を確認', exact: true }).click();
    await expect.poll(async () => (await records(page)).length).toBe(2);
    const incorrectReview = (await records(page))[1].review;
    expect(incorrectReview).toMatchObject({ questionId: translated.id, questionVersion: translated.version,
      submittedAnswer: translated.knownIncorrectTranslations[0].text, assessment: 'incorrect',
      answerReasonJa: translated.knownIncorrectTranslations[0].reasonJa });
    await remount(page);
    const review = page.getByTestId('english-practice-review-history');
    await review.locator(':scope > summary').click();
    const last = review.getByTestId('english-practice-review-attempt').first();
    await last.locator(':scope > summary').click();
    await expect(last).toContainText(incorrectReview.submittedAnswer);
    await expect(last).toContainText(incorrectReview.answerReasonJa);
    await expect(last).toContainText(translated.referenceTranslation);
    await last.getByText('出題時の選択肢・許容解答を確認', { exact: true }).click();
    await expect(last).toContainText(translated.acceptedTranslations[0]);
    expect((await records(page))[1].review).toEqual(incorrectReview);
    await assertWidth(page);
    await page.screenshot({ path: info.outputPath('translation-review.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('stored version and answers survive a revised bank, browser back, long content and device-history clearing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const errors = await setup(page);
  const question = page.getByTestId('grammar-practice-question');
  const questionId = await question.getAttribute('data-question-id');
  const source = ORIGINAL_GRAMMAR_QUESTIONS.find(item => item.id === questionId)!;
  const wrong = source.options.find(option => option !== source.answer)!;
  await question.getByRole('button', { name: wrong, exact: true }).click();
  await question.getByRole('button', { name: '判定する', exact: true }).click();
  await expect.poll(async () => (await records(page))[0]?.syncStatus).toBe('synced');
  const recorded = (await records(page))[0];
  await page.addInitScript(() => { (globalThis as any).__reviewBankUpdated = true; });
  const goAwayAndBack = async () => {
    await page.goto('http://127.0.0.1:41827/synthetic-return');
    await expect(page.getByRole('heading', { name: '合成の戻り先' })).toBeVisible();
    await page.goBack(); await page.addScriptTag({ content: bundle });
    await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  };
  await goAwayAndBack();
  const changed = await page.evaluate((id) => (globalThis as any).__reviewCurrentBank.find((question: any) => question.id === id), source.id);
  expect(changed).toMatchObject({ version: 99, answer: 'revised-bank-answer', explanationJa: '改版後の合成解説です。' });
  const openFirst = async () => {
    const history = page.getByTestId('english-practice-review-history');
    await history.locator(':scope > summary').click();
    const first = history.getByTestId('english-practice-review-attempt').first();
    await first.locator(':scope > summary').click(); return first;
  };
  let first = await openFirst();
  await expect(first).toContainText(wrong); await expect(first).toContainText(source.answer);
  await expect(first).toContainText(source.explanationJa); await expect(first).toContainText('出題時の版 1');
  await expect(first).not.toContainText(changed.answer); await expect(first).not.toContainText(changed.explanationJa);
  expect((await records(page))[0]).toEqual(recorded);
  expect(await page.evaluate(() => (globalThis as any).__reviewPayloads)).toEqual([]);
  const longAnswer = '長文'.repeat(5000) + '答案の終端';
  const longExplanation = '当時の長い合成解説'.repeat(800) + '解説の終端';
  await page.evaluate(({ longAnswer, longExplanation }) => {
    const key = 'medace:english-practice-progress:synthetic-review-student';
    const progress = JSON.parse(localStorage.getItem(key)!);
    progress.attempts[0].review.submittedAnswer = longAnswer;
    progress.attempts[0].review.explanationJa = longExplanation;
    localStorage.setItem(key, JSON.stringify(progress));
  }, { longAnswer, longExplanation });
  await remount(page); first = await openFirst();
  await expect(first).toContainText('答案の終端'); await expect(first).toContainText('解説の終端');
  expect((await records(page))[0].review.submittedAnswer).toBe(longAnswer);
  expect((await records(page))[0].clientAttemptId).toBe(recorded.clientAttemptId);
  await assertWidth(page);
  const otherKey = 'medace:english-practice-progress:another-synthetic-student';
  const otherRaw = await page.evaluate((key) => {
    const progress = JSON.parse(localStorage.getItem('medace:english-practice-progress:synthetic-review-student')!);
    progress.userUid = 'another-synthetic-student'; const raw = JSON.stringify(progress); localStorage.setItem(key, raw); return raw;
  }, otherKey);
  // Exercise the existing clear helper; the product has no new history-delete UI.
  await page.evaluate(() => (globalThis as any).__clearReviewProgress());
  await goAwayAndBack();
  await expect(page.getByTestId('english-practice-review-history')).toHaveCount(0);
  expect(await records(page)).toEqual([]);
  expect(await page.evaluate((key) => localStorage.getItem(key), otherKey)).toBe(otherRaw);
  expect(await page.evaluate(() => (globalThis as any).__reviewPayloads)).toEqual([]);
  expect(errors).toEqual([]);
});

test('real browser quota failure stays in memory and local-only retry preserves the attempt ID without another API call', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const errors = await setup(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('medace:english-practice-progress:synthetic-review-student'))).not.toBeNull();
  const before = await page.evaluate(() => localStorage.getItem('medace:english-practice-progress:synthetic-review-student'));
  const quota = await page.evaluate(() => {
    let count = 0; let failures = 0;
    for (const size of [131072, 8192, 512, 32, 1]) {
      for (let step = 0; step < 512; step += 1) {
        try { localStorage.setItem('synthetic-quota-buffer-' + count, '容'.repeat(size)); count += 1; }
        catch (error) { if ((error as DOMException).name !== 'QuotaExceededError') throw error; failures += 1; break; }
      }
    }
    return { count, failures };
  });
  expect(quota.failures).toBeGreaterThan(0);
  const question = page.getByTestId('grammar-practice-question');
  const id = await question.getAttribute('data-question-id');
  const source = ORIGINAL_GRAMMAR_QUESTIONS.find(item => item.id === id)!;
  const wrong = source.options.find(option => option !== source.answer)!;
  await question.getByRole('button', { name: wrong, exact: true }).click();
  await question.getByRole('button', { name: '判定する', exact: true }).click();
  const notice = page.getByTestId('english-practice-local-save-error');
  await expect(notice).toContainText('再読込すると失われる可能性');
  const history = page.getByTestId('english-practice-review-history');
  await history.locator(':scope > summary').click();
  const first = history.getByTestId('english-practice-review-attempt').first();
  await first.locator(':scope > summary').click();
  await expect(first).toContainText(wrong); await expect(first).toContainText(source.explanationJa);
  expect(await page.evaluate(() => localStorage.getItem('medace:english-practice-progress:synthetic-review-student'))).toBe(before);
  const apiCalls = await page.evaluate(() => (globalThis as any).__reviewPayloads);
  expect(apiCalls).toHaveLength(1);
  await assertWidth(page);
  await page.screenshot({ path: info.outputPath('device-storage-quota-notice.png'), fullPage: true });
  await page.evaluate(() => {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!);
    for (const key of keys) if (key.startsWith('synthetic-quota-buffer-')) localStorage.removeItem(key);
  });
  await notice.getByRole('button', { name: '端末の保存を再試行', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(async () => (await records(page)).length).toBe(1);
  expect((await records(page))[0].clientAttemptId).toBe(apiCalls[0].clientAttemptId);
  const stable = (await records(page))[0];
  expect(await page.evaluate(() => (globalThis as any).__reviewPayloads)).toEqual(apiCalls);
  await remount(page);
  expect((await records(page))[0]).toEqual(stable);
  expect(await page.evaluate(() => (globalThis as any).__reviewPayloads)).toEqual([]);
  expect(errors).toEqual([]);
});
