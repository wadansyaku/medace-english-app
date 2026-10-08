import type { Page } from '@playwright/test';
import { expect, test } from './diagnostics';
import { installPronunciation, readPronunciation } from './pronunciation-support';
import { NARU_BOOK_ID } from '../../shared/naruBook';
import type { GuestLearningCatalogResponse } from '../../contracts/guestLearning';
import type { WordData } from '../../types';

// Only this test context receives these synthetic catalogue entries. The app's
// actual rendering, guest persistence and navigation remain in use.
const words: WordData[] = [
  { id: 'audio-synthetic-apple', bookId: NARU_BOOK_ID, number: 1, word: 'apple', definition: 'リンゴ', exampleSentence: 'I eat an apple.', exampleMeaning: '私はリンゴを食べます。' },
  { id: 'audio-synthetic-carry', bookId: NARU_BOOK_ID, number: 2, word: 'carry', definition: '運ぶ', exampleSentence: 'I carry a bag.', exampleMeaning: '私はかばんを運びます。' },
  { id: 'audio-synthetic-quiet', bookId: NARU_BOOK_ID, number: 3, word: 'quiet', definition: '静かな', exampleSentence: 'The room is quiet.', exampleMeaning: '部屋は静かです。' },
];
const widths = [
  { width: 1366, height: 900 },
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

const installCatalogue = async (page: Page, entries = words) => {
  await page.route('**/api/guest-learning/naru', route => {
    const catalogue: GuestLearningCatalogResponse = {
      serverTimeMs: Date.now(),
      book: { id: NARU_BOOK_ID, title: 'Naruシスト', wordCount: entries.length, isPriority: true },
      words: entries,
    };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalogue) });
  });
};

const settleFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => {
  let remaining = 4;
  const next = () => { if (--remaining === 0) resolve(); else requestAnimationFrame(next); };
  requestAnimationFrame(next);
}));
const spokenTexts = async (page: Page) => (await readPronunciation(page)).spoken.map(item => item.text);
const expectSpoken = async (page: Page, expected: string[]) => {
  await expect.poll(() => spokenTexts(page)).toEqual(expected);
  await settleFrames(page);
  expect(await spokenTexts(page)).toEqual(expected);
};
const expectNoAdditionalSpeech = async (page: Page, expected: string[]) => {
  await settleFrames(page);
  expect(await spokenTexts(page)).toEqual(expected);
};
const openHome = async (page: Page) => {
  await page.goto('/start');
  await expect(page.getByTestId('guest-study-start')).toBeEnabled();
};
const openStudy = async (page: Page) => {
  await openHome(page);
  await page.getByTestId('guest-study-start').click();
  await page.getByTestId('guest-card-front').locator('h2').scrollIntoViewIfNeeded();
};
const openPractice = async (page: Page) => {
  await openHome(page);
  await page.getByRole('button', { name: 'クイズ・英語練習', exact: true }).click();
  await expect(page.getByTestId('guest-practice-question')).toBeVisible();
  await page.getByTestId('guest-practice-question').locator('h2').scrollIntoViewIfNeeded();
};
const assertFits = async (page: Page) => {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBe(0);
};

for (const viewport of widths) {
  const size = `${viewport.width}x${viewport.height}`;

  test(`guest study pronounces each visible card once, preserves manual examples and auth Back at ${size}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await installPronunciation(page);
    await installCatalogue(page);
    await openStudy(page);
    await expectSpoken(page, ['apple']);
    expect((await readPronunciation(page)).spoken[0]).toMatchObject({ lang: 'en-US', rate: 1 });

    // Both the media-driven React update and voices availability must leave
    // this same presentation consumed.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => speechSynthesis.dispatchEvent(new Event('voiceschanged')));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expectNoAdditionalSpeech(page, ['apple']);

    await page.getByTestId('guest-flip').click();
    await page.getByRole('button', { name: '例文の訳を表示', exact: true }).click();
    await expectNoAdditionalSpeech(page, ['apple']);
    const examplePanel = page.getByTestId('guest-saved-example');
    await examplePanel.getByRole('button', { name: '音声をオフにする', exact: true }).click();
    await expect(examplePanel.getByRole('button', { name: '例文を読み上げる', exact: true })).toBeDisabled();
    await expectNoAdditionalSpeech(page, ['apple']);
    await examplePanel.getByRole('button', { name: '音声をオンにする', exact: true }).scrollIntoViewIfNeeded();
    await assertFits(page);
    await page.screenshot({ path: info.outputPath(`guest-audio-back-mute-${size}.png`) });
    await examplePanel.getByRole('button', { name: '音声をオンにする', exact: true }).click();
    await expect(examplePanel.getByRole('button', { name: '例文を読み上げる', exact: true })).toBeEnabled();
    await expectNoAdditionalSpeech(page, ['apple']);
    await page.getByRole('button', { name: '例文を読み上げる', exact: true }).click();
    await expectSpoken(page, ['apple', 'I eat an apple.']);

    await page.getByTestId('guest-rate-3').click();
    const front = page.getByTestId('guest-card-front');
    await expect(front.locator('h2')).toHaveText('carry');
    await front.locator('h2').scrollIntoViewIfNeeded();
    await expectSpoken(page, ['apple', 'I eat an apple.', 'carry']);
    await front.getByRole('button', { name: '発音を聞く', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expectSpoken(page, ['apple', 'I eat an apple.', 'carry', 'carry']);
    await assertFits(page);
    await page.screenshot({ path: info.outputPath(`guest-audio-study-${size}.png`), fullPage: true });

    await page.getByTestId('guest-learning-login').click();
    await expect(page.getByTestId('auth-focused-form')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('auth-focused-form')).toBeHidden();
    await expect(front.locator('h2')).toHaveText('carry');
    await page.getByTestId('guest-learning-login').click();
    await expect(page.getByTestId('auth-focused-form')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('auth-focused-form')).toBeHidden();
    await front.locator('h2').scrollIntoViewIfNeeded();
    await expectNoAdditionalSpeech(page, ['apple', 'I eat an apple.', 'carry', 'carry']);

    await page.getByRole('button', { name: '教材へ戻る', exact: true }).click();
    await expect(page.getByTestId('guest-study-start')).toBeVisible();
    await expectNoAdditionalSpeech(page, ['apple', 'I eat an apple.', 'carry', 'carry']);
    await page.getByRole('button', { name: '同じ範囲をもう一度学ぶ', exact: true }).click();
    await expect(front.locator('h2')).toHaveText('apple');
    await front.locator('h2').scrollIntoViewIfNeeded();
    await expectSpoken(page, ['apple', 'I eat an apple.', 'carry', 'carry', 'apple']);
  });

  test(`guest practice reads the meaning prompt and only disclosed spelling answers at ${size}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await installPronunciation(page);
    await installCatalogue(page);
    await openPractice(page);
    await expectSpoken(page, ['apple']);
    await page.getByTestId('guest-practice-choice').filter({ hasText: /^リンゴ$/ }).click();
    await expectNoAdditionalSpeech(page, ['apple']);
    await page.getByRole('button', { name: '答えを確認する', exact: true }).click();
    await expect(page.getByTestId('guest-practice-feedback')).toContainText('正解です');
    await expectNoAdditionalSpeech(page, ['apple']);
    await page.getByRole('button', { name: '次の問題へ', exact: true }).click();
    await page.getByTestId('guest-practice-question').locator('h2').scrollIntoViewIfNeeded();
    await expectSpoken(page, ['apple', 'carry']);

    const modes = page.getByRole('group', { name: '練習の種類' });
    await modes.getByRole('button', { name: '意味クイズ', exact: true }).click();
    await page.getByTestId('guest-practice-question').locator('h2').scrollIntoViewIfNeeded();
    await expectSpoken(page, ['apple', 'carry', 'apple']);
    await modes.getByRole('button', { name: 'スペル', exact: true }).click();
    await expect(page.getByTestId('guest-practice-question').locator('h2')).toHaveText('リンゴ');
    await expect(page.getByTestId('guest-practice-feedback')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '発音を聞く', exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: /^英単語/ }).fill('app');
    await page.getByRole('textbox', { name: /^英単語/ }).fill('apple');
    await expectNoAdditionalSpeech(page, ['apple', 'carry', 'apple']);
    await page.getByRole('button', { name: '答えを確認する', exact: true }).click();
    const disclosedWord = page.getByTestId('guest-practice-feedback').locator('strong[lang="en"]');
    await expect(disclosedWord).toHaveText('apple');
    await disclosedWord.scrollIntoViewIfNeeded();
    await expectSpoken(page, ['apple', 'carry', 'apple', 'apple']);
    await assertFits(page);
    await page.screenshot({ path: info.outputPath(`guest-audio-spelling-${size}.png`), fullPage: true });

    await page.getByRole('button', { name: '次の問題へ', exact: true }).click();
    await expect(page.getByTestId('guest-practice-question').locator('h2')).toHaveText('運ぶ');
    await page.getByRole('textbox', { name: /^英単語/ }).fill('wrong');
    await expectNoAdditionalSpeech(page, ['apple', 'carry', 'apple', 'apple']);
    await page.getByRole('button', { name: '答えを確認する', exact: true }).click();
    await expect(disclosedWord).toHaveText('carry');
    await disclosedWord.scrollIntoViewIfNeeded();
    const expected = ['apple', 'carry', 'apple', 'apple', 'carry'];
    await expectSpoken(page, expected);

    await modes.getByRole('button', { name: '文法', exact: true }).click();
    await page.getByTestId('guest-practice-choice').first().click();
    await page.getByRole('button', { name: '答えを確認する', exact: true }).click();
    await expect(page.getByTestId('guest-practice-feedback')).toBeVisible();
    await expectNoAdditionalSpeech(page, expected);
    for (const mode of ['和訳', '読解', '英作文']) {
      await modes.getByRole('button', { name: mode, exact: true }).click();
      if (mode === '英作文') await page.getByLabel('自分の英文').fill('I write a draft myself.');
      await expectNoAdditionalSpeech(page, expected);
      await assertFits(page);
    }
  });

  test(`guest trial waits for restored progress, keeps a question once and restarts at ${size}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await installPronunciation(page);
    await page.goto('/try');
    await page.getByRole('heading', { name: 'bright', exact: true }).scrollIntoViewIfNeeded();
    await expectSpoken(page, ['bright']);
    await page.getByTestId('guest-choice-0').click();
    await expectNoAdditionalSpeech(page, ['bright']);
    await page.getByTestId('guest-trial-confirm').click();
    await expect(page.getByTestId('guest-trial-feedback')).toContainText('正解です');
    await expectNoAdditionalSpeech(page, ['bright']);
    await page.getByTestId('guest-save-account').click();
    await expect(page.getByTestId('auth-focused-form')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('auth-focused-form')).toBeHidden();
    await expectNoAdditionalSpeech(page, ['bright']);

    // A new document resets only the speech fixture. Persisted trial data must
    // skip the answered first word without briefly pronouncing index zero.
    await page.reload();
    await page.getByRole('heading', { name: 'carry', exact: true }).scrollIntoViewIfNeeded();
    await expectSpoken(page, ['carry']);
    await page.getByTestId('guest-choice-1').click();
    await page.getByTestId('guest-trial-confirm').click();
    await expect(page.getByTestId('guest-trial-feedback')).toContainText('正解です');
    await expectNoAdditionalSpeech(page, ['carry']);
    await page.getByTestId('guest-trial-next').click();
    await page.getByRole('heading', { name: 'quiet', exact: true }).scrollIntoViewIfNeeded();
    await expectSpoken(page, ['carry', 'quiet']);
    await assertFits(page);
    await page.screenshot({ path: info.outputPath(`guest-audio-trial-${size}.png`), fullPage: true });

    await page.getByTestId('guest-clear-opener').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoAdditionalSpeech(page, ['carry', 'quiet']);
    await page.getByTestId('guest-clear-confirm').click();
    await page.getByRole('heading', { name: 'bright', exact: true }).scrollIntoViewIfNeeded();
    await expectSpoken(page, ['carry', 'quiet', 'bright']);
  });
}

test('guest study treats a requeued identical word as a new card', async ({ page }) => {
  await installPronunciation(page);
  await installCatalogue(page, words.slice(0, 1));
  await openStudy(page);
  await expectSpoken(page, ['apple']);
  await page.getByTestId('guest-flip').click();
  await page.getByTestId('guest-rate-0').click();
  await expect(page.getByTestId('guest-card-back')).toHaveAttribute('aria-hidden', 'true');
  await page.getByTestId('guest-card-front').locator('h2').scrollIntoViewIfNeeded();
  await expectSpoken(page, ['apple', 'apple']);
  await page.getByTestId('guest-flip').click();
  await page.getByTestId('guest-rate-3').click();
  await expect(page.getByTestId('guest-session-result')).toBeVisible();
  await expectNoAdditionalSpeech(page, ['apple', 'apple']);
});

test('guest audio mute persists across next card and reload without replaying an already shown word', async ({ page }) => {
  await installPronunciation(page);
  await installCatalogue(page);
  await openStudy(page);
  await expectSpoken(page, ['apple']);
  await page.getByRole('button', { name: '音声をオフにする', exact: true }).click();
  await expect(page.getByRole('button', { name: '発音を聞く', exact: true })).toBeDisabled();
  await page.getByTestId('guest-flip').click();
  await page.getByTestId('guest-rate-3').click();
  await expect(page.getByTestId('guest-card-front').locator('h2')).toHaveText('carry');
  await expectNoAdditionalSpeech(page, ['apple']);
  await page.reload();
  await expect(page.getByTestId('guest-session-result')).toBeVisible();
  await expectNoAdditionalSpeech(page, []);
  await page.getByRole('button', { name: '教材へ戻る', exact: true }).first().click();
  await page.getByRole('button', { name: '同じ範囲をもう一度学ぶ', exact: true }).click();
  await page.getByTestId('guest-card-front').locator('h2').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '音声をオンにする', exact: true })).toBeVisible();
  await expectNoAdditionalSpeech(page, []);
  await page.getByRole('button', { name: '音声をオンにする', exact: true }).click();
  await expectNoAdditionalSpeech(page, []);
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click();
  await expectSpoken(page, ['apple']);
  await page.getByTestId('guest-flip').click();
  await page.getByTestId('guest-rate-3').click();
  await expect(page.getByTestId('guest-card-front').locator('h2')).toHaveText('carry');
  await page.getByTestId('guest-card-front').locator('h2').scrollIntoViewIfNeeded();
  await expectSpoken(page, ['apple', 'carry']);
});

test('guest reduced-motion reverse face keeps manual example playback and its retry message', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installPronunciation(page);
  await installCatalogue(page);
  await openStudy(page);
  await expectSpoken(page, ['apple']);
  await page.getByTestId('guest-flip').click();
  await expect(page.getByTestId('guest-card-front')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__pronunciationFixture.mode = 'error'; });
  await page.getByRole('button', { name: '例文を読み上げる', exact: true }).click();
  await expect(page.getByTestId('guest-saved-example').getByRole('status')).toContainText('もう一度お試しください');
  await expectSpoken(page, ['apple', 'I eat an apple.']);
  await page.evaluate(() => { (window as any).__pronunciationFixture.mode = 'normal'; });
  await page.getByRole('button', { name: '例文を読み上げる', exact: true }).click();
  await expectSpoken(page, ['apple', 'I eat an apple.', 'I eat an apple.']);
  await expect(page.getByTestId('guest-saved-example').getByRole('status')).toHaveCount(0);
  await assertFits(page);
});

test('guest delayed speech cancels on flip, reverse-face auth and rapid exit without reviving stale callbacks', async ({ page }) => {
  await installPronunciation(page, { delayed: true });
  await installCatalogue(page);
  await openStudy(page);
  await expectSpoken(page, ['apple']);
  const first = await page.evaluate(() => (window as any).__pronunciationFixture.active as number);
  await page.getByTestId('guest-flip').click();
  await expect.poll(async () => (await readPronunciation(page)).cancels).toBeGreaterThan(0);
  await page.evaluate(index => { (window as any).__pronunciationFixture.emit(index, 'start'); }, first);
  await expectNoAdditionalSpeech(page, ['apple']);

  await page.getByRole('button', { name: '例文を読み上げる', exact: true }).click();
  await expectSpoken(page, ['apple', 'I eat an apple.']);
  const example = await page.evaluate(() => (window as any).__pronunciationFixture.active as number);
  await page.evaluate(index => { (window as any).__pronunciationFixture.emit(index, 'start'); }, example);
  const beforeModal = (await readPronunciation(page)).cancels;
  await page.getByTestId('guest-learning-login').click();
  await expect(page.getByTestId('auth-focused-form')).toBeVisible();
  await expect.poll(async () => (await readPronunciation(page)).cancels).toBeGreaterThan(beforeModal);
  await expect.poll(() => page.evaluate(() => (window as any).__pronunciationFixture.active)).toBeNull();
  await page.evaluate(index => {
    const fixture = (window as any).__pronunciationFixture;
    fixture.emit(index, 'start'); fixture.emit(index, 'end'); fixture.emit(index, 'error');
  }, example);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('auth-focused-form')).toBeHidden();
  await expectNoAdditionalSpeech(page, ['apple', 'I eat an apple.']);

  await page.getByRole('button', { name: '教材へ戻る', exact: true }).click();
  await page.getByTestId('guest-study-start').click();
  await page.getByTestId('guest-card-front').locator('h2').scrollIntoViewIfNeeded();
  await expectSpoken(page, ['apple', 'I eat an apple.', 'apple']);
  const latest = await page.evaluate(() => (window as any).__pronunciationFixture.active as number);
  const beforeExit = (await readPronunciation(page)).cancels;
  await page.getByRole('button', { name: '教材へ戻る', exact: true }).click();
  await expect.poll(async () => (await readPronunciation(page)).cancels).toBeGreaterThan(beforeExit);
  await page.evaluate(index => { (window as any).__pronunciationFixture.emit(index, 'start'); }, latest);
  await expectNoAdditionalSpeech(page, ['apple', 'I eat an apple.', 'apple']);
});

test('guest front delayed speech is canceled by auth and closing auth does not repeat the same word', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPronunciation(page, { delayed: true });
  await installCatalogue(page);
  await openStudy(page);
  await expectSpoken(page, ['apple']);
  const pending = await page.evaluate(() => (window as any).__pronunciationFixture.active as number);
  expect(pending).toBeGreaterThanOrEqual(0);
  const beforeModal = (await readPronunciation(page)).cancels;
  await page.getByTestId('guest-learning-login').click();
  await expect(page.getByTestId('auth-focused-form')).toBeVisible();
  await expect(page.getByTestId('auth-email-input')).toBeFocused();
  await expect.poll(async () => (await readPronunciation(page)).cancels).toBeGreaterThan(beforeModal);
  await expect.poll(() => page.evaluate(() => (window as any).__pronunciationFixture.active)).toBeNull();
  await page.evaluate(index => {
    const fixture = (window as any).__pronunciationFixture;
    fixture.emit(index, 'start'); fixture.emit(index, 'end'); fixture.emit(index, 'error');
  }, pending);
  await expectNoAdditionalSpeech(page, ['apple']);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('auth-focused-form')).toBeHidden();
  await expect(page.getByTestId('guest-learning-login')).toBeFocused();
  const front = page.getByTestId('guest-card-front');
  await expect(front.locator('h2')).toHaveText('apple');
  await front.locator('h2').scrollIntoViewIfNeeded();
  await expectNoAdditionalSpeech(page, ['apple']);
  await expect(front.getByRole('status')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__pronunciationFixture.mode = 'normal'; });
  await front.getByRole('button', { name: '発音を聞く', exact: true }).click();
  await expectSpoken(page, ['apple', 'apple']);
});

test('guest blocked autoplay offers a manual retry without automatic retries on rerender', async ({ page }) => {
  await installPronunciation(page, { blocked: true });
  await installCatalogue(page);
  await openStudy(page);
  await expectSpoken(page, ['apple']);
  await expect(page.getByTestId('guest-card-front').getByRole('status')).toContainText('押して再生してください');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => speechSynthesis.dispatchEvent(new Event('voiceschanged')));
  await expectNoAdditionalSpeech(page, ['apple']);
  await page.evaluate(() => { (window as any).__pronunciationFixture.mode = 'normal'; });
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click();
  await expectSpoken(page, ['apple', 'apple']);
  await expect(page.getByTestId('guest-card-front').getByRole('status')).toHaveCount(0);
});

test('guest unsupported speech leaves the lesson usable and displays a short status', async ({ page }) => {
  await installPronunciation(page, { unsupported: true });
  await installCatalogue(page);
  await openStudy(page);
  await expect(page.getByTestId('guest-card-front').getByRole('status')).toContainText('このブラウザーでは発音を利用できません');
  await expectNoAdditionalSpeech(page, []);
  await page.getByTestId('guest-flip').click();
  await page.getByTestId('guest-rate-3').click();
  await expect(page.getByTestId('guest-card-front').locator('h2')).toHaveText('carry');
  await expectNoAdditionalSpeech(page, []);
});
