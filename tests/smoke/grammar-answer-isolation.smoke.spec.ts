import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';

// Render the real ReactDOM component. Only storage/AI services are replaced,
// and every browser request is intercepted so no live account or server is used.
const learningFixture = `
const fixture = globalThis.__grammarFixture;
const word = {
  id: 'synthetic-organize', bookId: 'synthetic-book', number: 1,
  word: 'organize', definition: '整理する',
  exampleSentence: 'Students organize their notes before class.',
  exampleMeaning: '生徒は 授業前に ノートを 整理する。',
};
export const learningService = {
  getDailySessionWords: () => Promise.resolve(fixture.oneWord ? [word] : []),
  recordEnglishPracticeAttempt: (_uid, payload) => {
    fixture.attempts.push(payload);
    return Promise.resolve();
  },
};
`;

let bundle: string;
test.beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import EnglishPracticeHub from './components/practice/EnglishPracticeHub';
        createRoot(document.getElementById('root')).render(<EnglishPracticeHub
          user={{ uid: 'synthetic-grammar-student', displayName: '合成生徒', role: 'STUDENT', englishLevel: 'B1' }}
          initialLane="grammar" variant="embedded" />);`,
      loader: 'tsx',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'synthetic-grammar-services',
      setup(builder) {
        builder.onResolve({ filter: /services\/learning$/ }, () => ({ path: 'learning', namespace: 'synthetic-learning' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic-learning' }, () => ({ contents: learningFixture, loader: 'js' }));
        builder.onResolve({ filter: /services\/gemini$/ }, () => ({ path: 'gemini', namespace: 'synthetic-ai' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic-ai' }, () => ({
          contents: 'export const evaluateJapaneseTranslationAnswer = () => { throw new Error("AI must not run in the grammar fixture"); };',
          loader: 'js',
        }));
      },
    }],
  });
  bundle = output.outputFiles[0].text;
});

const mount = async (page: Page, oneWord = false) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', (route) => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ja"><title>Steady Study | 合成文法回答テスト</title><style>body{font-family:system-ui}svg{width:16px;height:16px}article{border:1px solid #e2e8f0;margin:12px 0;padding:12px}button{font:inherit;margin:4px;min-height:40px}button[aria-pressed=true]{background:#FDF3ED;border:2px solid #F66D0B}button:disabled{opacity:.5}</style><div id="root"></div></html>' })
    : route.abort());
  await page.goto('http://127.0.0.1:41826/synthetic-grammar-isolation');
  await page.evaluate((useOneWord) => {
    (globalThis as any).__grammarFixture = { oneWord: useOneWord, attempts: [] };
  }, oneWord);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(5);
  return errors;
};

test('fallback cloze selection and checking affect only the selected occurrence', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await mount(page);
  const questions = page.locator('article');
  const first = questions.nth(0);
  const fifth = questions.nth(4);
  const firstCheck = first.getByRole('button', { name: '判定する', exact: true });
  const fifthCheck = fifth.getByRole('button', { name: '判定する', exact: true });

  await expect(firstCheck).toBeDisabled();
  await expect(fifthCheck).toBeDisabled();
  await first.getByRole('button', { name: 'is', exact: true }).click();
  await expect(firstCheck).toBeEnabled();
  await expect(fifthCheck).toBeDisabled();
  await expect(fifth.locator('button[aria-pressed="true"]')).toHaveCount(0);
  const evidencePath = testInfo.outputPath('only-first-question-selected.png');
  await page.screenshot({ path: evidencePath, fullPage: true });
  await testInfo.attach('only-first-question-selected', { path: evidencePath, contentType: 'image/png' });

  await firstCheck.click();
  await expect(first.locator('[aria-live="polite"]')).toContainText('正解');
  await expect(fifth.locator('[aria-live="polite"]')).toHaveCount(0);
  await expect(fifth.getByRole('button', { name: 'are', exact: true })).toBeEnabled();
  await fifth.getByRole('button', { name: 'are', exact: true }).click();
  await fifthCheck.click();
  await expect(fifth.locator('[aria-live="polite"]')).toContainText('正解');
  await expect(questions.nth(1).getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  // Sample answers remain excluded from stored progress and its sync service.
  expect(await page.evaluate(() => (globalThis as any).__grammarFixture.attempts)).toEqual([]);
  expect(errors).toEqual([]);
});

test('fallback word-order chips and checking stay independent for repeated words', async ({ page }) => {
  const errors = await mount(page);
  await page.getByRole('button', { name: '英語並び替え', exact: true }).click();
  const questions = page.locator('article');
  await expect(questions).toHaveCount(5);
  const first = questions.nth(0);
  const fifth = questions.nth(4);
  const firstChipPool = first.locator(':scope > div').nth(2);
  const fifthChipPool = fifth.locator(':scope > div').nth(2);
  const fifthChipCount = await fifthChipPool.getByRole('button').count();
  const firstChipCount = await firstChipPool.getByRole('button').count();

  for (let index = 0; index < firstChipCount; index += 1) {
    await firstChipPool.getByRole('button').first().click();
    await expect(fifthChipPool.getByRole('button')).toHaveCount(fifthChipCount);
    await expect(fifth.locator(':scope > div').nth(1).getByRole('button')).toHaveCount(0);
  }
  await expect(first.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  await expect(fifth.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  await first.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(first.locator('[aria-live="polite"]')).toBeVisible();
  await expect(fifth.locator('[aria-live="polite"]')).toHaveCount(0);
  await expect(fifthChipPool.getByRole('button').first()).toBeEnabled();
  expect(errors).toEqual([]);
});

test('one-word sessions can record separate answers while preserving source identity', async ({ page }) => {
  const errors = await mount(page, true);
  const questions = page.locator('article');
  for (const index of [0, 4]) {
    const question = questions.nth(index);
    await question.locator('button[aria-pressed]').first().click();
    await question.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(question.locator('[aria-live="polite"]')).toBeVisible();
  }
  await expect(questions.nth(1).getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (globalThis as any).__grammarFixture.attempts.length)).toBe(2);
  const attempts = await page.evaluate(() => (globalThis as any).__grammarFixture.attempts);
  expect(attempts.map((attempt: any) => [attempt.wordId, attempt.bookId, attempt.mode])).toEqual([
    ['synthetic-organize', 'synthetic-book', 'GRAMMAR_CLOZE'],
    ['synthetic-organize', 'synthetic-book', 'GRAMMAR_CLOZE'],
  ]);
  expect(new Set(attempts.map((attempt: any) => attempt.clientAttemptId)).size).toBe(2);

  await page.getByRole('button', { name: '問題を更新', exact: true }).click();
  await expect(questions.locator('[aria-live="polite"]')).toHaveCount(0);
  await expect(questions.locator('button[aria-pressed="true"]')).toHaveCount(0);
  for (let index = 0; index < 5; index += 1) {
    await expect(questions.nth(index).getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  }
  expect(errors).toEqual([]);
});

test('changing the scope allocation never carries a checked answer into a different question', async ({ page }) => {
  const errors = await mount(page);
  const first = page.locator('article').first();
  const originalQuestion = await first.innerText();
  await first.locator('button[aria-pressed]').first().click();
  await first.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(first.locator('[aria-live="polite"]')).toBeVisible();
  await page.getByRole('button', { name: 'ランダム演習', exact: true }).click();
  await expect(first).not.toHaveText(originalQuestion);
  await expect(first.locator('[aria-live="polite"]')).toHaveCount(0);
  await expect(first.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(first.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
