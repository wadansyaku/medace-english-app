import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import type { QuizAttemptInput } from '../../shared/quizAttempt';

type QuizController = ReturnType<typeof import('../../hooks/useQuizModeController')['useQuizModeController']>;
interface QuizControllerFixture {
  controller: QuizController;
  saves: Array<{ uid: string; payload: QuizAttemptInput }>;
  pendingSaves: Array<{ resolve: (receiptOverride?: unknown) => void; reject: () => void }>;
  pendingGrades: Array<{ resolve: () => void }>;
  taskIntent: { missionAssignmentId: string; intentType: string };
}
type FixtureWindow = typeof window & { __quizControllerFixture: QuizControllerFixture };

// The application hook, ReactDOM, rendered question view and learningService
// object are real. Only its I/O methods and the AI boundary use synthetic data.
const harnessSource = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useQuizModeController } from './hooks/useQuizModeController';
import QuizRunningView from './components/quiz/QuizRunningView';
import { learningService } from './services/learning';
const f = globalThis.__quizControllerFixture;
const words = ['learn', 'read', 'write'].map((word, index) => ({
  id: 'synthetic-word-' + index, bookId: 'synthetic-quiz-book', number: index + 1,
  word, definition: ['学ぶ', '読む', '書く'][index], searchKey: word,
}));
Object.assign(learningService, {
  getBooks: async () => [{ id: 'synthetic-quiz-book', title: '合成教材', wordCount: words.length }],
  getWordsByBook: async () => words,
  getStudiedWordIdsByBook: async () => [],
  recordQuizAttempt: (uid, wordId, bookId, correct, questionMode, responseTimeMs,
    missionAssignmentId, taskIntentType, generatedProblemId, grammarScopeId,
    translationFeedback, clientAttemptId) => {
    const payload = { wordId, bookId, correct, questionMode, responseTimeMs,
      missionAssignmentId, taskIntentType, generatedProblemId, grammarScopeId,
      translationFeedback, clientAttemptId };
    f.saves.push(structuredClone({ uid, payload }));
    return new Promise((resolve, reject) => f.pendingSaves.push({
      resolve: (receiptOverride) => resolve(receiptOverride === undefined
        ? { clientAttemptId, wordId, bookId, committedAt: Date.now(), storageMode: 'cloudflare', projectionStatus: 'COMPLETE' }
        : receiptOverride),
      reject: () => reject(new Error('synthetic-response-lost')),
    }));
  },
});
const user = { uid: 'synthetic-controller-student', displayName: '合成生徒',
  role: 'STUDENT', englishLevel: 'B1' };
f.taskIntent = { missionAssignmentId: 'synthetic-original-mission',
  intentType: 'WEAKNESS_QUIZ', mode: 'QUIZ', autoStart: false };
function Harness() {
  const c = useQuizModeController({ user, bookId: 'synthetic-quiz-book', taskIntent: f.taskIntent });
  f.controller = c;
  const start = (questionMode) => c.startQuiz({ ...c.setupConfig,
    questionMode, questionCount: 5, grammarScopeId: 'be-verb' });
  return <main>
    <h1>実 hook のクイズ保存回帰</h1>
    <output data-testid="controller-state">{JSON.stringify({ screen: c.screen,
      loading: c.loading, index: c.currentQIndex, score: c.score,
      selectedOption: c.selectedOption, saving: c.persistingAttempt,
      saveError: c.saveError, awaitingAdvance: c.translationAwaitingAdvance })}</output>
    <nav>
      <button data-testid="start-choice" disabled={c.loading} onClick={() => start('EN_TO_JA')}>選択式を開始</button>
      <button data-testid="start-translation" disabled={c.loading} onClick={() => start('JA_TRANSLATION_INPUT')}>和訳を開始</button>
      <button data-testid="reset-session" onClick={c.resetToSetup}>セッションを終了</button>
    </nav>
    {c.screen === 'RUNNING' && c.currentQuestion && <QuizRunningView {...c}
      questionsLength={c.questions.length} hasPendingAttempt={Boolean(c.pendingAttempt)}
      onShowOptions={() => c.setShowOptions(true)} onChangeAnswerInput={c.setAnswerInput}
      onHintSubmit={c.handleHintSubmit} onRevealSpellingHint={c.revealSpellingHint}
      onOptionClick={c.handleOptionClick} onOrderTokenSelect={c.handleOrderTokenSelect}
      onOrderTokenRemove={c.handleOrderTokenRemove} onOrderTokenMove={c.handleOrderTokenMove}
      onOrderTokensClear={c.handleOrderTokensClear} onOrderSubmit={c.handleOrderSubmit}
      onRetrySave={c.handleRetrySave} onAdvanceAfterTranslationFeedback={c.handleAdvanceAfterTranslationFeedback} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
`;

const aiFixture = `
export const generateGrammarPracticeQuestions = async (words, mode) => words.map((word, index) => ({
  id: word.id + ':' + mode, wordId: word.id, bookId: word.bookId, mode,
  interactionType: 'TEXT_INPUT', promptLabel: '合成和訳',
  promptText: 'This is synthetic question ' + (index + 1) + '.',
  sourceSentence: 'This is synthetic question ' + (index + 1) + '.',
  sourceTranslation: 'これは合成問題です。', answer: 'これは合成問題です。',
  generatedProblemId: 'synthetic-problem-' + word.id,
  grammarScope: { scopeId: 'be-verb', labelJa: 'be動詞' },
}));
export const evaluateJapaneseTranslationAnswer = (payload) => new Promise(resolve => {
  globalThis.__quizControllerFixture.pendingGrades.push({ resolve: () => resolve({
    ...payload, isCorrect: false, score: 2, maxScore: 10, verdictLabel: '合成部分点',
    examTarget: 'GENERAL', summaryJa: '合成の採点結果', strengths: [], issues: ['合成の指摘'],
    improvedTranslation: payload.expectedTranslation, grammarAdviceJa: '合成文法',
    nextDrillJa: '合成練習', criteria: [], usedAi: true,
  }) });
});
`;

let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: harnessSource, loader: 'tsx', resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    define: {
      'import.meta.env': '{"VITE_STORAGE_MODE":"cloudflare"}',
      'process.env.NODE_ENV': '"development"',
    },
    logLevel: 'silent',
    plugins: [{ name: 'synthetic-quiz-ai-and-events', setup(builder) {
      builder.onResolve({ filter: /services\/gemini$/ }, () => ({ path: 'gemini', namespace: 'quiz-fixture' }));
      builder.onResolve({ filter: /services\/productEvents$/ }, () => ({ path: 'events', namespace: 'quiz-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'quiz-fixture' }, ({ path }) => ({
        contents: path === 'gemini' ? aiFixture : 'export const recordClientProductEvent = async () => {};',
        loader: 'js',
      }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

let unexpectedRequests: string[] = [];
let unexpectedConsole: string[] = [];
let expectedReceiptFailures = 0;
test.beforeEach(async ({ context, page }) => {
  unexpectedRequests = [];
  unexpectedConsole = [];
  expectedReceiptFailures = 0;
  page.on('pageerror', error => unexpectedConsole.push(error.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    // This error is explicitly injected in the lost-response test.
    if (message.text().startsWith('Quiz attempt save failed') && message.text().includes('synthetic-response-lost')) return;
    if (expectedReceiptFailures > 0 && message.text().startsWith('Quiz attempt save failed')
      && message.text().includes('小テスト保存のreceiptを確認できませんでした。')) {
      expectedReceiptFailures -= 1;
      return;
    }
    unexpectedConsole.push(message.text());
  });
  await context.route('**/*', route => {
    if (route.request().url() === 'https://quiz-controller-receipts.test/') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="ja"><meta charset="utf-8">
        <title>Steady Study | 実 hook のクイズ保存回帰</title>
        <style>body{font:15px system-ui;margin:16px}main{max-width:900px;margin:auto}
        button,textarea{font:inherit;margin:5px;min-height:40px}button:disabled{opacity:.5}
        svg{width:18px;height:18px}section{border:1px solid #ddd;padding:12px;margin:10px 0}
        output{display:block;overflow-wrap:anywhere}textarea{width:90%}</style><div id="root"></div></html>` });
    }
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  // Keep the real 900ms auto-advance timer stationary until a test advances it.
  await page.clock.install({ time: new Date('2026-10-03T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
  await page.goto('https://quiz-controller-receipts.test/');
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).__quizControllerFixture = {
      saves: [], pendingSaves: [], pendingGrades: [],
    } as unknown as QuizControllerFixture;
  });
  await page.addScriptTag({ content: bundle });
  await expect(page).toHaveTitle('Steady Study | 実 hook のクイズ保存回帰');
  await expect(page.getByRole('heading', { name: '実 hook のクイズ保存回帰' })).toBeVisible();
  await expect(page.getByTestId('start-choice')).toBeEnabled();
});

test.afterEach(async () => {
  expect(unexpectedRequests, 'every non-fixture request must remain blocked and unused').toEqual([]);
  expect(unexpectedConsole, 'no unhandled hook, React, or browser errors').toEqual([]);
  expect(expectedReceiptFailures, 'all deliberately invalid receipt responses were rejected').toBe(0);
});

const start = async (page: Page, mode: 'choice' | 'translation') => {
  await page.getByTestId(`start-${mode}`).click();
  await expect(page.getByTestId('quiz-running-view')).toBeVisible();
  await expect.poll(() => state(page)).toMatchObject({ screen: 'RUNNING', index: 0, score: 0 });
};
const state = (page: Page) => page.evaluate(() => {
  const c = (window as FixtureWindow).__quizControllerFixture.controller;
  return { screen: c.screen, index: c.currentQIndex, score: c.score,
    selectedOption: c.selectedOption, saving: c.persistingAttempt,
    saveError: c.saveError, awaitingAdvance: c.translationAwaitingAdvance,
    checking: c.checkingTranslationFeedback, answerInput: c.answerInput };
});
const saves = (page: Page) => page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.saves);
const settleSave = (page: Page, index: number, fail = false) => page.evaluate(({ index, fail }) => {
  const pending = (window as FixtureWindow).__quizControllerFixture.pendingSaves[index];
  if (fail) pending.reject();
  else pending.resolve();
}, { index, fail });
const submitTranslation = async (page: Page, answer?: string) => {
  const expected = answer ?? await page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.controller.currentQuestion.answer);
  await page.getByRole('textbox').fill(expected);
  await page.getByRole('button', { name: '和訳を判定する', exact: true }).click();
};

test('different choices in one tick preserve the first payload, visible choice and score with one save', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, 'choice');
  await page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.controller.setShowOptions(true));
  const question = await page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.controller.currentQuestion);
  const second = question.options!.find(option => option !== question.answer)!;
  expect(second).toBeTruthy();
  // Invoke one render's real click handler twice in one browser task, before
  // React commits disabled/selected state. Separate Playwright clicks would miss this race.
  await page.evaluate(({ first, second }) => {
    const click = (window as FixtureWindow).__quizControllerFixture.controller.handleOptionClick;
    void click(first);
    void click(second);
  }, { first: question.answer, second });
  await expect.poll(() => state(page)).toMatchObject({ selectedOption: question.answer, saving: true, score: 0 });
  expect(await saves(page)).toHaveLength(1);
  expect((await saves(page))[0]).toMatchObject({ uid: 'synthetic-controller-student', payload: {
    wordId: question.wordId, bookId: question.bookId, correct: true, questionMode: 'EN_TO_JA',
    missionAssignmentId: 'synthetic-original-mission',
  } });
  expect((await saves(page))[0].payload.clientAttemptId).toMatch(/^[a-zA-Z0-9_-]{1,160}$/);
  await settleSave(page, 0);
  await expect.poll(() => state(page)).toMatchObject({ selectedOption: question.answer, saving: false, score: 1, index: 0 });
  await expect(page.getByTestId('quiz-running-view')).toContainText('正解数: 1');
  const screenshot = testInfo.outputPath('first-choice-and-score.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('first-choice-and-score', { path: screenshot, contentType: 'image/png' });
});

test('committed pending projection stays on the answer until an identical retry confirms progress', async ({ page }, testInfo) => {
  await start(page, 'choice');
  await page.evaluate(() => {
    const f = (window as FixtureWindow).__quizControllerFixture;
    void f.controller.handleOptionClick(f.controller.currentQuestion!.answer);
  });
  await expect.poll(() => saves(page).then(items => items.length)).toBe(1);
  const original = (await saves(page))[0];
  await page.evaluate(() => {
    const f = (window as FixtureWindow).__quizControllerFixture;
    const p = f.saves[0].payload;
    f.pendingSaves[0].resolve({clientAttemptId:p.clientAttemptId,wordId:p.wordId,bookId:p.bookId,
      committedAt:Date.now(),storageMode:'cloudflare',projectionStatus:'PENDING'});
  });
  await expect(page.getByTestId('quiz-save-error')).toContainText('解答は保存済み');
  await page.clock.runFor(10000);
  await expect.poll(() => state(page)).toMatchObject({saving:false,score:0,index:0});
  await page.screenshot({path:testInfo.outputPath('answer-saved-progress-pending.png'),fullPage:true});
  await page.getByTestId('quiz-save-retry').evaluate((button:HTMLButtonElement) => {button.click();button.click();});
  await expect.poll(() => saves(page).then(items => items.length)).toBe(2);
  expect((await saves(page))[1]).toEqual(original);
  await settleSave(page,1);
  await expect(page.getByTestId('quiz-save-error')).toHaveCount(0);
  await expect.poll(() => state(page)).toMatchObject({saving:false,score:1,index:0});
  await page.clock.runFor(900);
  await expect.poll(() => state(page)).toMatchObject({score:1,index:1});
});

test('lost-response retry keeps the complete original payload and double retry starts one request', async ({ page }) => {
  await start(page, 'translation');
  await page.clock.runFor(500);
  await submitTranslation(page);
  await expect.poll(() => saves(page).then(value => value.length)).toBe(1);
  const original = (await saves(page))[0];
  expect(original.payload).toMatchObject({ questionMode: 'JA_TRANSLATION_INPUT', correct: true,
    grammarScopeId: 'be-verb', translationFeedback: { userTranslation: 'これは合成問題です。', isCorrect: true } });
  expect(original.payload.generatedProblemId).toBeTruthy();
  await settleSave(page, 0, true);
  await expect.poll(() => state(page)).toMatchObject({ saving: false, score: 0, index: 0 });
  await expect(page.getByTestId('quiz-running-view')).toContainText('同じ解答をもう一度保存してください');
  await page.clock.runFor(10_000);
  await page.evaluate(() => {
    const f = (window as FixtureWindow).__quizControllerFixture;
    // Change live question/task/feedback objects after the failed request. A
    // retry must use its detached saved request, never reconstruct from these.
    f.controller.currentQuestion.wordId = 'mutated-live-word';
    f.controller.currentQuestion.generatedProblemId = 'mutated-live-problem';
    f.controller.currentQuestion.grammarScope!.scopeId = 'mutated-live-scope' as never;
    f.taskIntent.missionAssignmentId = 'mutated-live-mission';
    f.controller.translationFeedback!.summaryJa = 'mutated-live-feedback';
    const retry = f.controller.handleRetrySave;
    void retry();
    void retry();
  });
  await expect.poll(() => saves(page).then(value => value.length)).toBe(2);
  expect((await saves(page))[1]).toEqual(original);
  await settleSave(page, 1);
  await expect.poll(() => state(page)).toMatchObject({ saving: false, saveError: null, score: 1, index: 0, awaitingAdvance: true });
  expect(await saves(page)).toHaveLength(2);
});

test('two translation next actions in one tick advance only to question one', async ({ page }) => {
  await start(page, 'translation');
  await submitTranslation(page);
  await expect.poll(() => saves(page).then(value => value.length)).toBe(1);
  await settleSave(page, 0);
  await expect(page.getByTestId('translation-feedback-next')).toBeEnabled();
  await page.evaluate(() => {
    const next = (window as FixtureWindow).__quizControllerFixture.controller.handleAdvanceAfterTranslationFeedback;
    next();
    next();
  });
  await expect.poll(() => state(page)).toMatchObject({ index: 1, score: 1, saving: false, awaitingAdvance: false });
  await expect(page.getByTestId('quiz-running-view')).toContainText('第 2 問 / 3');
  expect(await saves(page)).toHaveLength(1);
});

test('a late save response cannot score or advance a replacement session', async ({ page }) => {
  await start(page, 'choice');
  await page.evaluate(() => {
    const c = (window as FixtureWindow).__quizControllerFixture.controller;
    void c.handleOptionClick(c.currentQuestion.answer);
  });
  await expect.poll(() => saves(page).then(value => value.length)).toBe(1);
  await page.getByTestId('reset-session').click();
  await start(page, 'choice');
  await settleSave(page, 0);
  await page.clock.runFor(1_000);
  await expect.poll(() => state(page)).toMatchObject({ screen: 'RUNNING', index: 0, score: 0, selectedOption: null, saving: false });
  expect(await saves(page)).toHaveLength(1);
});

test('a previous session auto-advance timer cannot move a new question', async ({ page }) => {
  await start(page, 'choice');
  await page.evaluate(() => {
    const c = (window as FixtureWindow).__quizControllerFixture.controller;
    void c.handleOptionClick(c.currentQuestion.answer);
  });
  await expect.poll(() => saves(page).then(value => value.length)).toBe(1);
  await settleSave(page, 0);
  await expect.poll(() => state(page)).toMatchObject({ score: 1, saving: false, index: 0 });
  await page.getByTestId('reset-session').click();
  await start(page, 'choice');
  await page.clock.runFor(1_000);
  await expect.poll(() => state(page)).toMatchObject({ screen: 'RUNNING', index: 0, score: 0, selectedOption: null });
  expect(await saves(page)).toHaveLength(1);
});

test('late translation grading cannot create an attempt in a replacement session', async ({ page }) => {
  await start(page, 'translation');
  await submitTranslation(page, '合成の不正解');
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.pendingGrades.length)).toBe(1);
  await expect.poll(() => state(page)).toMatchObject({ checking: true });
  await page.getByTestId('reset-session').click();
  await start(page, 'translation');
  await page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.pendingGrades[0].resolve());
  await expect.poll(() => state(page)).toMatchObject({ screen: 'RUNNING', index: 0, score: 0, checking: false, answerInput: '', saving: false });
  expect(await saves(page)).toHaveLength(0);
});

test('missing or invalid receipts keep the answer unconfirmed until the same payload receives a matching receipt', async ({ page }, testInfo) => {
  const invalidReceipts = ['missing', 'wrong-attempt', 'wrong-word', 'wrong-book', 'malformed-body', 'non-finite-time'] as const;
  for (const kind of invalidReceipts) {
    await start(page, 'choice');
    const saveIndex = (await saves(page)).length;
    await page.getByRole('button', { name: '選択肢を表示する', exact: true }).click();
    const answer = await page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.controller.currentQuestion.answer);
    await page.getByRole('button', { name: answer, exact: true }).click();
    await expect.poll(() => saves(page).then(value => value.length)).toBe(saveIndex + 1);
    const original = (await saves(page))[saveIndex];
    expectedReceiptFailures += 1;
    await page.evaluate(({ index, kind }) => {
      const f = (window as FixtureWindow).__quizControllerFixture;
      const payload = f.saves[index].payload;
      const receipt = { clientAttemptId: payload.clientAttemptId, wordId: payload.wordId,
        bookId: payload.bookId, committedAt: Date.now(), storageMode: 'cloudflare', projectionStatus: 'COMPLETE' };
      if (kind === 'wrong-attempt') receipt.clientAttemptId = 'another-attempt';
      if (kind === 'wrong-word') receipt.wordId = 'another-word';
      if (kind === 'wrong-book') receipt.bookId = 'another-book';
      if (kind === 'non-finite-time') receipt.committedAt = Number.NaN;
      f.pendingSaves[index].resolve(kind === 'missing' ? null
        : kind === 'malformed-body' ? { success: true } : receipt);
    }, { index: saveIndex, kind });
    await expect.poll(() => state(page), { message: kind }).toMatchObject({ score: 0, index: 0, saving: false });
    await expect(page.getByTestId('quiz-save-error'), kind).toContainText('保存を確認できませんでした');
    await expect.poll(() => page.evaluate(() => (window as FixtureWindow).__quizControllerFixture.controller.pendingAttempt?.clientAttemptId), { message: kind })
      .toBe(original.payload.clientAttemptId);
    await page.clock.runFor(1_000);
    await expect.poll(() => state(page), { message: kind }).toMatchObject({ score: 0, index: 0 });
    expect(await saves(page), kind).toHaveLength(saveIndex + 1);
    if (kind === 'missing') {
      const screenshot = testInfo.outputPath('missing-receipt-remains-unconfirmed.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      await testInfo.attach('missing-receipt-remains-unconfirmed', { path: screenshot, contentType: 'image/png' });
    }
    await page.getByTestId('quiz-save-retry').click();
    await expect.poll(() => saves(page).then(value => value.length), { message: kind }).toBe(saveIndex + 2);
    expect((await saves(page))[saveIndex + 1], kind).toEqual(original);
    await settleSave(page, saveIndex + 1);
    await expect.poll(() => state(page), { message: kind }).toMatchObject({ score: 1, index: 0, saving: false, saveError: null });
    expect(await saves(page), kind).toHaveLength(saveIndex + 2);
    await page.getByTestId('reset-session').click();
  }
});
