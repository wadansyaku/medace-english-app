import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { ORIGINAL_GRAMMAR_QUESTIONS, type OriginalGrammarQuestion } from '../../config/grammarQuestionBank';
import { type GrammarCurriculumScopeId } from '../../types';
import { getGrammarScopesForPracticeSelection } from '../../utils/grammarScope';

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
  getDailySessionWords: () => {
    fixture.returnedWordCount = fixture.oneWord ? 1 : 0;
    return Promise.resolve(fixture.oneWord ? [word] : []);
  },
  recordEnglishPracticeAttempt: (_uid, payload) => {
    fixture.attempts.push(payload);
    return Promise.resolve({ id: payload.clientAttemptId, deduplicated: false, delegatedQuizAttempt: false, projectionStatus: 'COMPLETE' });
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
    (globalThis as any).__grammarFixture = { oneWord: useOneWord, returnedWordCount: null, attempts: [] };
  }, oneWord);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByTestId('grammar-practice-question')).toHaveCount(1);
  // Authored drills no longer fetch unrelated vocabulary, including empty books.
  expect(await page.evaluate(() => (globalThis as any).__grammarFixture.returnedWordCount)).toBeNull();
  return errors;
};

// The DOM identifies the authored question; its displayed answer is never the
// answer key. Correct answers, distractors and chip order come from the bank.
const getAuthoredQuestion = async (page: Page): Promise<OriginalGrammarQuestion> => {
  const id = await page.getByTestId('grammar-practice-question').getAttribute('data-question-id');
  const source = ORIGINAL_GRAMMAR_QUESTIONS.find(question => question.id === id);
  expect(source, `Unknown authored grammar ID: ${id}`).toBeTruthy();
  return source!;
};
const attemptList = (page: Page) => page.evaluate(() => (globalThis as any).__grammarFixture.attempts);
const expectUnansweredCloze = async (page: Page, source: OriginalGrammarQuestion) => {
  const question = page.getByTestId('grammar-practice-question');
  await expect(question).toContainText(source.contextJa);
  await expect(question).toContainText(source.recommendedGradeJa);
  await expect(question).not.toContainText(source.sourceSentence);
  await expect(question).not.toContainText(source.translationJa);
  await expect(question).not.toContainText(source.explanationJa);
  await expect(question.getByTestId('grammar-answer-feedback')).toHaveCount(0);
  await expect(question.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(question.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
};
const expectScopeAttempt = (attempt: any, source: OriginalGrammarQuestion, mode: string, correct: boolean) => {
  expect(attempt).toMatchObject({ lane: 'grammar', mode, correct, grammarScopeId: source.scopeId, level: source.level });
  expect(attempt.wordId).toBeUndefined();
  expect(attempt.bookId).toBeUndefined();
  expect(attempt.word).toBeUndefined();
  expect(attempt).not.toHaveProperty('curatedQuestionId');
};
const selectOnlyScope = async (page: Page, scopeId: GrammarCurriculumScopeId) => {
  await page.getByRole('button', { name: '範囲を変更', exact: true }).click();
  await page.getByRole('button', { name: '全範囲', exact: true }).click();
  const scopes = getGrammarScopesForPracticeSelection({ mode: 'GRAMMAR_CLOZE' });
  const scopeButton = (label: string) => page.getByRole('button').filter({
    has: page.getByText(label, { exact: true }),
  });
  const target = scopes.find(scope => scope.id === scopeId)!;
  const selected = scopeButton(target.labelJa);
  if (await selected.getAttribute('aria-pressed') !== 'true') await selected.click();
  for (const scope of scopes.filter(scope => scope.id !== scopeId)) {
    const button = scopeButton(scope.labelJa);
    if (await button.getAttribute('aria-pressed') === 'true') await button.click();
  }
  await expect.poll(async () => (await getAuthoredQuestion(page)).scopeId).toBe(scopeId);
};
const orderChunkText = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/[“”‘’]/g, "'").replace(/[.!?;:]/g, '').replace(/\s+/g, ' ').trim();

test('curated cloze keeps its answer and one saved attempt when moving next and back', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await mount(page);
  const question = page.getByTestId('grammar-practice-question');
  const first = await getAuthoredQuestion(page);
  await expectUnansweredCloze(page, first);
  await expect(page.getByRole('button', { name: '次の問題へ', exact: true })).toBeDisabled();
  const wrong = first.options.find(option => option !== first.answer)!;
  await question.getByRole('button', { name: wrong, exact: true }).click();
  const evidencePath = testInfo.outputPath('one-authored-question-selected.png');
  await page.screenshot({ path: evidencePath, fullPage: true });
  await testInfo.attach('one-authored-question-selected', { path: evidencePath, contentType: 'image/png' });
  const check = question.getByRole('button', { name: '判定する', exact: true });
  await check.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(question.getByTestId('grammar-answer-feedback')).toContainText(first.explanationJa);
  await expect(question.getByTestId('grammar-answer-feedback')).toContainText(first.distractorReasons[wrong]);
  await expect(question).toContainText(first.sourceSentence);
  await expect(question).toContainText(first.translationJa);
  await expect.poll(async () => (await attemptList(page)).length).toBe(1);
  const committedAttempt = (await attemptList(page))[0];
  expectScopeAttempt(committedAttempt, first, 'GRAMMAR_CLOZE', false);

  await page.getByRole('button', { name: '次の問題へ', exact: true }).click();
  const second = await getAuthoredQuestion(page);
  expect(second.id).not.toBe(first.id);
  await expectUnansweredCloze(page, second);
  await page.getByRole('button', { name: '前の問題を確認', exact: true }).click();
  await expect(question).toHaveAttribute('data-question-id', first.id);
  await expect(question.getByRole('button', { name: wrong, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(check).toBeDisabled();
  await expect(question.getByTestId('grammar-answer-feedback')).toContainText(first.explanationJa);
  expect(await attemptList(page)).toEqual([committedAttempt]);
  expect(errors).toEqual([]);
});

test('curated word-order answers and unfinished chip selections stay independent across questions', async ({ page }) => {
  const errors = await mount(page);
  await page.getByRole('button', { name: '英語並び替え', exact: true }).click();
  const question = page.getByTestId('grammar-practice-question');
  await expect(question).toHaveCount(1);
  const first = await getAuthoredQuestion(page);
  await expect(question).toContainText(first.contextJa);
  await expect(question).not.toContainText(first.sourceSentence);
  const chosen = question.locator(':scope > div').nth(1);
  const pool = question.locator(':scope > div').nth(2);
  for (const chunk of first.orderChunks) await pool.getByRole('button', { name: orderChunkText(chunk), exact: true }).first().click();
  await expect(chosen.getByRole('button')).toHaveCount(first.orderChunks.length);
  await question.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(question.getByTestId('grammar-answer-feedback')).toContainText(first.sourceSentence);
  await expect.poll(async () => (await attemptList(page)).length).toBe(1);
  expectScopeAttempt((await attemptList(page))[0], first, 'EN_WORD_ORDER', true);
  await page.getByRole('button', { name: '次の問題へ', exact: true }).click();
  const second = await getAuthoredQuestion(page);
  expect(second.id).not.toBe(first.id);
  await expect(chosen.getByRole('button')).toHaveCount(0);
  await expect(question.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  const secondChunk = orderChunkText(second.orderChunks[0]);
  await pool.getByRole('button', { name: secondChunk, exact: true }).first().click();
  await expect(chosen.getByRole('button')).toHaveCount(1);
  await page.getByRole('button', { name: '前の問題を確認', exact: true }).click();
  await expect(question).toHaveAttribute('data-question-id', first.id);
  await expect(chosen.getByRole('button')).toHaveCount(first.orderChunks.length);
  await expect(question.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '次の問題へ', exact: true }).click();
  await expect(question).toHaveAttribute('data-question-id', second.id);
  await expect(chosen.getByRole('button')).toHaveCount(1);
  await expect(chosen.getByRole('button')).toHaveText([secondChunk]);
  await expect(question.getByTestId('grammar-answer-feedback')).toHaveCount(0);
  expect((await attemptList(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test('a one-word vocabulary session still saves curated scope answers without word or book association', async ({ page }) => {
  const errors = await mount(page, true);
  const question = page.getByTestId('grammar-practice-question');
  const sources: OriginalGrammarQuestion[] = [];
  for (let index = 0; index < 2; index += 1) {
    const source = await getAuthoredQuestion(page); sources.push(source);
    await expectUnansweredCloze(page, source);
    await question.getByRole('button', { name: source.answer, exact: true }).click();
    await question.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(question.getByTestId('grammar-answer-feedback')).toContainText(source.explanationJa);
    if (index === 0) await page.getByRole('button', { name: '次の問題へ', exact: true }).click();
  }
  expect(sources[0].id).not.toBe(sources[1].id);
  await expect.poll(async () => (await attemptList(page)).length).toBe(2);
  const attempts = await attemptList(page);
  attempts.forEach((attempt: any, index: number) => expectScopeAttempt(attempt, sources[index], 'GRAMMAR_CLOZE', true));
  expect(new Set(attempts.map((attempt: any) => attempt.clientAttemptId)).size).toBe(2);
  await page.getByRole('button', { name: '問題を更新', exact: true }).click();
  const next = await getAuthoredQuestion(page);
  expect(sources.map(source => source.id)).not.toContain(next.id);
  await expectUnansweredCloze(page, next);
  expect((await attemptList(page)).length).toBe(2);
  expect(errors).toEqual([]);
});

test('refresh and scope changes clear unfinished answers without leaking an authored answer before checking', async ({ page }) => {
  const errors = await mount(page);
  const question = page.getByTestId('grammar-practice-question');
  const first = await getAuthoredQuestion(page);
  await question.getByRole('button', { name: first.answer, exact: true }).click();
  await question.getByRole('button', { name: '判定する', exact: true }).click();
  await expect.poll(async () => (await attemptList(page)).length).toBe(1);
  await page.getByRole('button', { name: '問題を更新', exact: true }).click();
  const refreshed = await getAuthoredQuestion(page);
  expect(refreshed.id).not.toBe(first.id);
  await expectUnansweredCloze(page, refreshed);
  const wrong = refreshed.options.find(option => option !== refreshed.answer)!;
  await question.getByRole('button', { name: wrong, exact: true }).click();
  await expect(question.locator('button[aria-pressed="true"]')).toHaveCount(1);
  const targetScope = refreshed.scopeId === 'basic-svo' ? 'be-verb' : 'basic-svo';
  await selectOnlyScope(page, targetScope);
  const scoped = await getAuthoredQuestion(page);
  expect(scoped.scopeId).toBe(targetScope);
  expect(scoped.id).not.toBe(refreshed.id);
  await expectUnansweredCloze(page, scoped);
  expect((await attemptList(page)).length).toBe(1);
  expect(errors).toEqual([]);
});
