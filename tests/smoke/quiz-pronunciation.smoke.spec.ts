import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import type { QuizAttemptInput } from '../../shared/quizAttempt';
import { installPronunciation, readPronunciation } from './pronunciation-support';

type QuizController = ReturnType<typeof import('../../hooks/useQuizModeController')['useQuizModeController']>;
type VocabularyMode = 'EN_TO_JA' | 'JA_TO_EN' | 'SPELLING_HINT';
interface QuizAudioFixture {
  controller: QuizController;
  start: (mode: VocabularyMode, range?: [number, number]) => void;
  saves: Array<{ uid: string; payload: QuizAttemptInput }>;
  pendingSaves: Array<{ resolve: () => void; reject: () => void }>;
}
type FixtureWindow = typeof window & {
  __quizAudioFixture: QuizAudioFixture;
  __pronunciationFixture: {
    mode: 'normal' | 'blocked' | 'error' | 'delayed';
    active: number | null;
    utterances: SpeechSynthesisUtterance[];
    voices: Array<{ name: string; lang: string }>;
    emit: (index: number, type: string, error?: string) => void;
  };
};

// Real controller, question generation, receipt handling, view, modal and
// pronunciation hook. Only learning I/O, AI and analytics are synthetic.
const harnessSource = `
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useQuizModeController } from './hooks/useQuizModeController';
import QuizRunningView from './components/quiz/QuizRunningView';
import QuizExitConfirmDialog from './components/quiz/QuizExitConfirmDialog';
import { learningService } from './services/learning';
const f = globalThis.__quizAudioFixture;
const words = ['learn', 'read', 'write'].map((word, index) => ({
  id: 'synthetic-audio-word-' + index, bookId: 'synthetic-audio-book', number: index + 1,
  word, definition: ['学ぶ', '読む', '書く'][index], searchKey: word,
}));
Object.assign(learningService, {
  getBooks: async () => [{ id: 'synthetic-audio-book', title: '音声用合成教材', wordCount: words.length }],
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
      resolve: () => resolve({ clientAttemptId, wordId, bookId, committedAt: Date.now(),
        storageMode: 'cloudflare', projectionStatus: 'COMPLETE' }),
      reject: () => reject(new Error('synthetic-audio-response-lost')),
    }));
  },
});
const user = { uid: 'synthetic-audio-student', displayName: '音声用合成生徒',
  role: 'STUDENT', englishLevel: 'B1' };
function Harness() {
  const c = useQuizModeController({ user, bookId: 'synthetic-audio-book' });
  const [revision, setRevision] = useState(0);
  f.controller = c;
  f.start = (questionMode, range) => c.startQuiz({ ...c.setupConfig,
    questionMode, questionCount: 5, selectionMode: range ? 'RANGE_RANDOM' : 'FULL_RANDOM',
    rangeStart: range?.[0] ?? 1, rangeEnd: range?.[1] ?? 3 });
  return <main>
    <h1>語彙クイズ音声の実操作回帰</h1>
    <nav aria-label="合成テスト操作">
      <button data-testid="start-en" disabled={c.loading} onClick={() => f.start('EN_TO_JA')}>英→日を開始</button>
      <button data-testid="start-ja" disabled={c.loading} onClick={() => f.start('JA_TO_EN')}>日→英を開始</button>
      <button data-testid="start-spelling" disabled={c.loading} onClick={() => f.start('SPELLING_HINT')}>スペルを開始</button>
      <button data-testid="rerender" onClick={() => setRevision(value => value + 1)}>表示を更新</button>
      <button data-testid="exit" onClick={() => c.setShowExitConfirm(true)}>終了確認</button>
      <button data-testid="reset" onClick={c.resetToSetup}>合成セッションを戻す</button>
    </nav>
    <output data-testid="audio-controller-state">{JSON.stringify({ screen: c.screen,
      index: c.currentQIndex, runId: c.runId, revision })}</output>
    {c.showExitConfirm && <QuizExitConfirmDialog onCancel={() => c.setShowExitConfirm(false)}
      onConfirm={() => c.confirmExitRunning()} exitBlocked={c.exitBlocked} />}
    {c.screen === 'RUNNING' && c.currentQuestion && <QuizRunningView {...c}
      pronunciationPaused={c.showExitConfirm}
      questionsLength={c.questions.length} hasPendingAttempt={Boolean(c.pendingAttempt)}
      onShowOptions={() => c.setShowOptions(true)} onChangeAnswerInput={c.setAnswerInput}
      onHintSubmit={c.handleHintSubmit} onRevealSpellingHint={c.revealSpellingHint}
      onOptionClick={c.handleOptionClick} onOrderTokenSelect={c.handleOrderTokenSelect}
      onOrderTokenRemove={c.handleOrderTokenRemove} onOrderTokenMove={c.handleOrderTokenMove}
      onOrderTokensClear={c.handleOrderTokensClear} onOrderSubmit={c.handleOrderSubmit}
      onRetrySave={c.handleRetrySave} onAdvanceAfterTranslationFeedback={c.handleAdvanceAfterTranslationFeedback} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
`;

let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: harnessSource, loader: 'tsx', resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    define: { 'import.meta.env': '{"VITE_STORAGE_MODE":"cloudflare"}', 'process.env.NODE_ENV': '"development"' },
    logLevel: 'silent',
    plugins: [{ name: 'synthetic-quiz-pronunciation-io', setup(builder) {
      builder.onResolve({ filter: /services\/gemini$/ }, () => ({ path: 'ai', namespace: 'quiz-audio-fixture' }));
      builder.onResolve({ filter: /services\/productEvents$/ }, () => ({ path: 'events', namespace: 'quiz-audio-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'quiz-audio-fixture' }, ({ path }) => ({
        contents: path === 'ai'
          ? 'export const generateGrammarPracticeQuestions = async () => []; export const evaluateJapaneseTranslationAnswer = async () => { throw new Error("unexpected-ai-boundary"); };'
          : 'export const recordClientProductEvent = async () => {};',
        loader: 'js',
      }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

let unexpectedRequests: string[] = [];
let unexpectedConsole: string[] = [];
test.beforeEach(async ({ context, page }) => {
  unexpectedRequests = [];
  unexpectedConsole = [];
  page.on('pageerror', error => unexpectedConsole.push(error.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    if (message.text().startsWith('Quiz attempt save failed')
      && message.text().includes('synthetic-audio-response-lost')) return;
    unexpectedConsole.push(message.text());
  });
  await context.route('**/*', route => {
    if (route.request().url() === 'https://quiz-pronunciation.test/') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="ja"><meta charset="utf-8">
        <title>Steady Study | 語彙クイズ音声回帰</title><style>
        body{font:15px system-ui;margin:12px}main{max-width:850px;margin:auto}
        h1{font-size:18px}button,input{font:inherit;min-height:44px;margin:3px}
        button:disabled{opacity:.5}svg{width:18px;height:18px}section{border:1px solid #ddd;padding:10px;margin:8px 0}
        h2{margin:8px 0}output{display:block;overflow-wrap:anywhere;font-size:11px}
        [role=dialog]{background:white;border:2px solid #777;padding:12px}
        [data-testid=quiz-visible-answer]{background:#FDF3ED;padding:8px}
        [data-testid=quiz-visible-answer-word]{font-size:24px;font-weight:bold;margin:4px 0}
        </style><div id="root"></div></html>` });
    }
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-08T12:00:01Z'));
  await installPronunciation(page);
  await page.goto('https://quiz-pronunciation.test/');
  await page.evaluate(() => {
    (window as FixtureWindow).__quizAudioFixture = {
      saves: [], pendingSaves: [],
    } as unknown as QuizAudioFixture;
    (window as FixtureWindow).__pronunciationFixture.voices = [];
  });
  await page.addScriptTag({ content: bundle });
  await expect(page.getByTestId('start-en')).toBeEnabled();
});

test.afterEach(async () => {
  expect(unexpectedRequests, 'all learning and AI I/O must stay inside synthetic fixtures').toEqual([]);
  expect(unexpectedConsole, 'no unhandled React, pronunciation, modal or receipt error').toEqual([]);
});

const frames = (page: Page) => page.clock.runFor(64);
const start = async (page: Page, mode: 'en' | 'ja' | 'spelling', advanceFrames = true) => {
  await page.getByTestId(`start-${mode}`).click();
  await expect(page.getByTestId('quiz-running-view')).toBeVisible();
  if (advanceFrames) await frames(page);
};
const question = (page: Page) => page.evaluate(() => (window as FixtureWindow).__quizAudioFixture.controller.currentQuestion!);
const state = (page: Page) => page.evaluate(() => {
  const c = (window as FixtureWindow).__quizAudioFixture.controller;
  return { screen: c.screen, index: c.currentQIndex, runId: c.runId,
    selectedOption: c.selectedOption, inputResult: c.inputResult, hint: c.showSpellingHint,
    saving: c.persistingAttempt, saveError: c.saveError };
});
const saves = (page: Page) => page.evaluate(() => (window as FixtureWindow).__quizAudioFixture.saves);
const settleSave = (page: Page, index: number, fail = false) => page.evaluate(({ index, fail }) => {
  const pending = (window as FixtureWindow).__quizAudioFixture.pendingSaves[index];
  if (fail) pending.reject();
  else pending.resolve();
}, { index, fail });
const spokenTexts = async (page: Page) => (await readPronunciation(page)).spoken.map(item => item.text);
const showOptions = (page: Page) => page.getByRole('button', { name: '選択肢を表示する', exact: true }).click();
const submitSpelling = async (page: Page, input: string) => {
  await page.getByRole('textbox', { name: '英語を入力', exact: true }).fill(input);
  await page.getByTestId('quiz-answer-submit').click();
};
const lateVoicesAndRender = async (page: Page) => {
  await page.evaluate(() => {
    (window as FixtureWindow).__pronunciationFixture.voices = [{ name: 'Samantha', lang: 'en-US' }];
    window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await page.getByTestId('rerender').click();
  await frames(page);
};

test('English prompt speaks once through StrictMode, feedback, parent renders and late voices, then once for the next ordinal', async ({ page }) => {
  await start(page, 'en');
  const first = await question(page);
  await expect(page.getByTestId('quiz-question-card').getByRole('heading', { name: first.promptText, exact: true })).toBeVisible();
  expect(await spokenTexts(page)).toEqual([first.promptText]);
  expect((await readPronunciation(page)).spoken[0]).toMatchObject({ lang: 'en-US', rate: 0.9 });
  await lateVoicesAndRender(page);
  await showOptions(page);
  await page.getByRole('button', { name: first.answer, exact: true }).click();
  await frames(page);
  expect(await spokenTexts(page)).toEqual([first.promptText]);
  await settleSave(page, 0);
  await expect.poll(() => state(page)).toMatchObject({ saving: false, index: 0 });
  await page.clock.runFor(1000);
  await expect.poll(() => state(page)).toMatchObject({ index: 1 });
  await frames(page);
  const second = await question(page);
  expect(await spokenTexts(page)).toEqual([first.promptText, second.promptText]);
});

for (const correct of [true, false]) {
  test(`Japanese prompt keeps options silent, then speaks the visible full answer after a ${correct ? 'correct' : 'wrong'} choice without repeating on save retry`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, 'ja');
    const current = await question(page);
    await expect(page.getByTestId('quiz-visible-answer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '発音を聞く', exact: true })).toBeDisabled();
    await showOptions(page);
    await frames(page);
    expect(await spokenTexts(page)).toEqual([]);
    const choice = correct ? current.answer : current.options!.find(option => option !== current.answer)!;
    await page.getByRole('button', { name: choice, exact: true }).click();
    await expect(page.getByTestId('quiz-visible-answer-word')).toBeVisible();
    await expect(page.getByTestId('quiz-visible-answer-word')).toHaveText(current.answer);
    await frames(page);
    expect(await spokenTexts(page)).toEqual([current.answer]);
    const original = (await saves(page))[0];
    expect(original.payload.correct).toBe(correct);
    await settleSave(page, 0, true);
    await expect(page.getByTestId('quiz-save-error')).toBeVisible();
    await lateVoicesAndRender(page);
    await page.getByTestId('quiz-save-retry').click();
    await expect.poll(() => saves(page).then(items => items.length)).toBe(2);
    expect((await saves(page))[1]).toEqual(original);
    await settleSave(page, 1);
    await expect.poll(() => state(page)).toMatchObject({ saving: false, saveError: null, index: 0 });
    await frames(page);
    expect(await spokenTexts(page)).toEqual([current.answer]);
    await testInfo.attach('visible-full-answer-with-pronunciation', {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
  });
}

test('spelling hint and first wrong input stay silent, and a correct suffix reveals and speaks the full word', async ({ page }) => {
  await start(page, 'spelling');
  const current = await question(page);
  await submitSpelling(page, 'definitely-wrong');
  await expect(page.getByTestId('quiz-spelling-prefix')).toContainText(current.maskedAnswer!);
  await expect(page.getByTestId('quiz-visible-answer')).toHaveCount(0);
  await frames(page);
  expect(await spokenTexts(page)).toEqual([]);
  expect(await saves(page)).toHaveLength(0);
  const suffix = current.answer.slice(current.hintPrefix!.length);
  expect(suffix).toBeTruthy();
  await submitSpelling(page, suffix);
  await expect(page.getByTestId('quiz-visible-answer-word')).toBeVisible();
  await expect(page.getByTestId('quiz-visible-answer-word')).toHaveText(current.answer);
  await expect.poll(() => state(page)).toMatchObject({ inputResult: 'correct', saving: true });
  await frames(page);
  expect(await spokenTexts(page)).toEqual([current.answer]);
  expect((await saves(page))[0].payload.correct).toBe(true);
  await lateVoicesAndRender(page);
  expect(await spokenTexts(page)).toEqual([current.answer]);
});

test('explicit spelling hint does not speak until a final wrong answer reveals the full correct word', async ({ page }) => {
  await start(page, 'spelling');
  const current = await question(page);
  await page.getByRole('button', { name: 'ヒントを見る', exact: true }).click();
  await expect(page.getByTestId('quiz-spelling-prefix')).toContainText(current.maskedAnswer!);
  await frames(page);
  expect(await spokenTexts(page)).toEqual([]);
  await expect(page.getByRole('button', { name: '発音を聞く', exact: true })).toBeDisabled();
  await submitSpelling(page, 'still-wrong');
  await expect.poll(() => state(page)).toMatchObject({ inputResult: 'incorrect', saving: true });
  await expect(page.getByTestId('quiz-visible-answer-word')).toHaveText(current.answer);
  await frames(page);
  expect(await spokenTexts(page)).toEqual([current.answer]);
  expect((await saves(page))[0].payload.correct).toBe(false);
});

test('mute can be chosen before hidden answer exposure, persists to a new run and never unmutes into an automatic replay', async ({ page }) => {
  await start(page, 'ja');
  await page.getByRole('button', { name: '音声をオフにする', exact: true }).click();
  await showOptions(page);
  const current = await question(page);
  await page.getByRole('button', { name: current.answer, exact: true }).click();
  await expect(page.getByTestId('quiz-visible-answer-word')).toHaveText(current.answer);
  await frames(page);
  expect(await spokenTexts(page)).toEqual([]);
  await page.getByRole('button', { name: '音声をオンにする', exact: true }).click();
  await frames(page);
  expect(await spokenTexts(page)).toEqual([]);
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click();
  expect(await spokenTexts(page)).toEqual([current.answer]);
  await page.getByRole('button', { name: '音声をオフにする', exact: true }).click();
  await page.getByTestId('reset').click();
  await start(page, 'en');
  await expect(page.getByRole('button', { name: '音声をオンにする', exact: true })).toBeVisible();
  expect(await spokenTexts(page)).toEqual([current.answer]);
  await page.getByRole('button', { name: '音声をオンにする', exact: true }).click();
  await frames(page);
  expect(await spokenTexts(page)).toEqual([current.answer]);
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click();
  const next = await question(page);
  expect(await spokenTexts(page)).toEqual([current.answer, next.promptText]);
});

test('opening the real exit modal cancels delayed playback and late callbacks cannot replay or show an error after continuing', async ({ page }) => {
  await page.evaluate(() => { (window as FixtureWindow).__pronunciationFixture.mode = 'delayed'; });
  await start(page, 'en');
  const current = await question(page);
  expect(await spokenTexts(page)).toEqual([current.promptText]);
  const before = await readPronunciation(page);
  await page.getByTestId('exit').click();
  await expect(page.getByTestId('quiz-exit-confirm-dialog')).toBeVisible();
  await expect(page.getByTestId('quiz-exit-cancel')).toBeFocused();
  expect((await readPronunciation(page)).cancels).toBeGreaterThan(before.cancels);
  await page.evaluate(() => {
    const audio = (window as FixtureWindow).__pronunciationFixture;
    audio.emit(0, 'start');
    audio.emit(0, 'error', 'not-allowed');
  });
  await page.getByTestId('quiz-exit-cancel').click();
  await frames(page);
  await page.clock.runFor(5000);
  expect(await spokenTexts(page)).toEqual([current.promptText]);
  await expect(page.getByText('「発音を聞く」を押して再生してください。', { exact: true })).toHaveCount(0);
  await expect(page.getByText('発音を開始できませんでした。もう一度お試しください。', { exact: true })).toHaveCount(0);
  await page.getByTestId('exit').click();
  await page.getByTestId('quiz-exit-confirm').click();
  await expect(page.getByTestId('quiz-running-view')).toHaveCount(0);
  await page.clock.runFor(5000);
  expect(await spokenTexts(page)).toEqual([current.promptText]);
});

test('rapid replacement before the first frame speaks only the final visible word and restart gives the same word a fresh presentation', async ({ page }) => {
  await page.evaluate(() => (window as FixtureWindow).__quizAudioFixture.start('EN_TO_JA', [1, 1]));
  await expect(page.getByTestId('quiz-running-view')).toBeVisible();
  const first = await question(page);
  await page.evaluate(() => {
    const f = (window as FixtureWindow).__quizAudioFixture;
    f.controller.resetToSetup();
    f.start('EN_TO_JA', [2, 2]);
  });
  await expect(page.getByTestId('quiz-question-card').getByRole('heading', { name: 'read', exact: true })).toBeVisible();
  await frames(page);
  expect(first.promptText).toBe('learn');
  expect(await spokenTexts(page)).toEqual(['read']);
  const previous = await state(page);
  const previousQuestion = await question(page);
  await page.getByTestId('reset').click();
  await page.evaluate(() => (window as FixtureWindow).__quizAudioFixture.start('EN_TO_JA', [2, 2]));
  await expect(page.getByTestId('quiz-running-view')).toBeVisible();
  await frames(page);
  expect((await question(page)).id).toBe(previousQuestion.id);
  expect((await state(page)).runId).toBeGreaterThan(previous.runId);
  expect(await spokenTexts(page)).toEqual(['read', 'read']);
  await page.evaluate(() => {
    const audio = (window as FixtureWindow).__pronunciationFixture;
    audio.emit(0, 'error', 'not-allowed');
    audio.emit(0, 'end');
  });
  await frames(page);
  expect(await spokenTexts(page)).toEqual(['read', 'read']);
  await expect(page.getByText('「発音を聞く」を押して再生してください。', { exact: true })).toHaveCount(0);
});

test('autoplay refusal offers a manual retry without changing the question or submitting an answer', async ({ page }) => {
  await page.evaluate(() => { (window as FixtureWindow).__pronunciationFixture.mode = 'blocked'; });
  await start(page, 'en');
  const current = await question(page);
  await expect(page.getByText('「発音を聞く」を押して再生してください。', { exact: true })).toBeVisible();
  expect(await spokenTexts(page)).toEqual([current.promptText]);
  await lateVoicesAndRender(page);
  expect(await spokenTexts(page)).toEqual([current.promptText]);
  await page.evaluate(() => { (window as FixtureWindow).__pronunciationFixture.mode = 'normal'; });
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click();
  await frames(page);
  expect(await spokenTexts(page)).toEqual([current.promptText, current.promptText]);
  expect(await saves(page)).toHaveLength(0);
  await expect.poll(() => state(page)).toMatchObject({ index: 0, selectedOption: null });
});
