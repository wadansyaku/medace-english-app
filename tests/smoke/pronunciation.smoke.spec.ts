import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { installPronunciation, readPronunciation } from './pronunciation-support';
import { exposeStudentDemo, maybeCompleteOnboarding, openDashboardReference, storageAction } from './smoke-support';

const harnessSource = `
import React, { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWordPronunciation } from './hooks/useWordPronunciation';
import WordPronunciationControls from './components/study/WordPronunciationControls';
import AnnouncementOverlay from './components/announcements/AnnouncementOverlay';
import StudyReportDialogs from './components/study/StudyReportDialogs';
import { AnnouncementSeverity } from './types';
function Harness() {
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [renders, setRenders] = useState(0);
  const [revealed, setRevealed] = useState(true);
  const [modal, setModal] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  const [acknowledged, setAcknowledged] = useState(0);
  const [dismissed, setDismissed] = useState(0);
  const [reportNotice, setReportNotice] = useState(null);
  const wordRef = useRef(null); const scopeRef = useRef(null);
  const word = ['learn', 'read'][index];
  const p = useWordPronunciation({ presentationKey: round + ':' + index + ':' + word,
    text: revealed ? word : undefined, visible: revealed, targetRef: wordRef, scopeRef });
  globalThis.__audioHarness = p;
  globalThis.__finishPendingReport = () => Promise.resolve().then(() => setReportNotice('合成報告を保存しました。'));
  return <main>
    <nav><button onClick={() => setRenders(x => x + 1)}>再描画</button>
      <button onClick={() => setIndex(1)}>次の語</button><button onClick={() => setIndex(0)}>前の語</button>
      <button onClick={() => setRound(x => x + 1)}>再出題</button>
      <button onClick={() => setRevealed(x => !x)}>解答表示切替</button>
      <button onClick={() => setModal(x => !x)}>モーダル切替</button>
      <button onClick={() => setOffscreen(x => !x)}>画面外切替</button>
      <button data-testid="announcement-opener" onClick={() => setAnnouncement(AnnouncementSeverity.MAJOR)}>お知らせを表示</button>
      <button data-testid="critical-announcement-opener" onClick={() => setAnnouncement(AnnouncementSeverity.CRITICAL)}>緊急のお知らせを表示</button></nav>
    <span data-testid="render-count">{renders}</span>
    <span data-testid="announcement-acknowledged">{acknowledged}</span>
    <span data-testid="announcement-dismissed">{dismissed}</span>
    <section ref={scopeRef} inert={modal} style={{ marginTop: offscreen ? '200vh' : 0 }}>
      {revealed && <h2 ref={wordRef} lang="en">{word}</h2>}
      <WordPronunciationControls pronunciation={p} disabled={!revealed} />
    </section>
    {modal && <div role="dialog" aria-modal="true">確認中</div>}
    <AnnouncementOverlay feed={{ highestPriorityModal: announcement ? { id: 'fixture', severity: announcement,
      title: '合成のお知らせ', body: '音声の停止境界を確認します。' } : null }}
      onAcknowledge={() => { setAcknowledged(x => x + 1); setAnnouncement(null); }}
      onDismissMajor={() => { setDismissed(x => x + 1); setAnnouncement(null); }} />
    <StudyReportDialogs mode="sheet" showReportModal={false} reportReason="" reportNotice={reportNotice}
      onChangeReportReason={() => {}} onCloseReportModal={() => {}} onSubmitReport={() => {}}
      onCloseNotice={() => setReportNotice(null)} />
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Harness /></StrictMode>);
`;
let bundle: string;
test.beforeAll(async () => {
  const result = await build({ stdin: { contents: harnessSource, loader: 'tsx', resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent' });
  bundle = result.outputFiles[0].text;
});
const openHarness = async (page: Page, options = {}) => {
  await installPronunciation(page, options);
  await page.route('**/audio-hook-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' }));
  await page.goto('/audio-hook-fixture'); await page.addScriptTag({ content: bundle });
  await expect(page.getByRole('heading', { name: 'learn', exact: true })).toBeVisible();
};
const calls = (page: Page) => readPronunciation(page).then(value => value.spoken.map(item => item.text));

test('pronunciation StrictMode reads each visible presentation once through rerender, late voices, manual and back', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openHarness(page); await expect.poll(() => calls(page)).toEqual(['learn']);
  expect((await readPronunciation(page)).cancels).toBe(0);
  await page.getByRole('button', { name: '再描画', exact: true }).click();
  await page.evaluate(() => speechSynthesis.dispatchEvent(new Event('voiceschanged')));
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click();
  await expect.poll(() => calls(page)).toEqual(['learn', 'learn']);
  await page.getByRole('button', { name: '次の語', exact: true }).click();
  await expect.poll(() => calls(page)).toEqual(['learn', 'learn', 'read']);
  await page.getByRole('button', { name: '前の語', exact: true }).click();
  await expect.poll(() => calls(page)).toEqual(['learn', 'learn', 'read', 'learn']);
  await page.getByRole('button', { name: '再出題', exact: true }).click();
  await expect.poll(() => calls(page)).toEqual(['learn', 'learn', 'read', 'learn', 'learn']);
  await page.getByRole('button', { name: '解答表示切替', exact: true }).click();
  await expect(page.getByRole('button', { name: '発音を聞く', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '解答表示切替', exact: true }).click();
  expect(await calls(page)).toHaveLength(5); expect(errors).toEqual([]);
  await info.attach('strict-once-receipt', { body: JSON.stringify(await readPronunciation(page)), contentType: 'application/json' });
});

test('pronunciation rejects stale speech callbacks, stops on inert/modal and never queues an offscreen word', async ({ page }) => {
  await openHarness(page, { delayed: true }); await expect.poll(() => calls(page)).toEqual(['learn']);
  await page.getByRole('button', { name: '次の語', exact: true }).click(); await expect.poll(() => calls(page)).toEqual(['learn', 'read']);
  await page.evaluate(() => { const f = (window as any).__pronunciationFixture; f.emit(0, 'start'); f.emit(0, 'error', 'synthesis-failed'); });
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'モーダル切替', exact: true }).click();
  await expect.poll(() => readPronunciation(page).then(value => value.cancels)).toBe(2);
  await page.evaluate(() => (window as any).__pronunciationFixture.emit(1, 'error', 'not-allowed'));
  await page.getByRole('button', { name: 'モーダル切替', exact: true }).click();
  expect(await calls(page)).toHaveLength(2); await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: '画面外切替', exact: true }).click();
  await page.getByRole('button', { name: '再出題', exact: true }).click();
  expect(await calls(page)).toHaveLength(2);
  await page.getByRole('button', { name: '画面外切替', exact: true }).click();
  await expect.poll(() => calls(page)).toEqual(['learn', 'read', 'read']);
});

test('pronunciation mute consumes auto, persists on reload, and blocked speech recovers through a manual click', async ({ page }) => {
  await openHarness(page, { blocked: true }); await expect.poll(() => calls(page)).toEqual(['learn']);
  await expect(page.getByRole('status')).toHaveText('「発音を聞く」を押して再生してください。');
  await page.getByRole('button', { name: '再描画', exact: true }).click(); expect(await calls(page)).toHaveLength(1);
  await page.evaluate(() => { (window as any).__pronunciationFixture.mode = 'normal'; });
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click();
  await expect(page.getByRole('status')).toHaveCount(0); expect(await calls(page)).toEqual(['learn', 'learn']);
  await page.getByRole('button', { name: '音声をオフにする', exact: true }).click();
  await page.getByRole('button', { name: '次の語', exact: true }).click(); expect(await calls(page)).toHaveLength(2);
  await page.getByRole('button', { name: '音声をオンにする', exact: true }).click(); expect(await calls(page)).toHaveLength(2);
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click(); expect(await calls(page)).toEqual(['learn', 'learn', 'read']);
  await page.getByRole('button', { name: '音声をオフにする', exact: true }).click();
  await page.reload(); await page.addScriptTag({ content: bundle });
  await expect(page.getByRole('button', { name: '音声をオンにする', exact: true })).toBeVisible(); expect(await calls(page)).toEqual([]);
});

test('pronunciation unavailable browser keeps learning controls usable without an exception', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openHarness(page, { unsupported: true });
  await expect(page.getByRole('status')).toHaveText('このブラウザーでは発音を利用できません。');
  await page.getByRole('button', { name: '次の語', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'read', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '音声をオフにする', exact: true }).click(); expect(errors).toEqual([]);
});

test('pronunciation authenticated Study keeps rate and manual example, cancels old sound and advances after saving', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPronunciation(page, { delayed: true });
  await page.goto('/'); await exposeStudentDemo(page); await page.getByTestId('demo-login-student').click();
  await maybeCompleteOnboarding(page); await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const seeded = await storageAction<{ importedBookIds: string[] }>(page, 'batchImportWords', { defaultBookName: 'Pronunciation Study Fixture', source: { kind: 'rows', rows: [
    { bookName: 'Pronunciation Study Fixture', number: 1, word: 'triage', definition: 'トリアージ', exampleSentence: 'Triage patients carefully.' },
    { bookName: 'Pronunciation Study Fixture', number: 2, word: 'stabilize', definition: '安定させる', exampleSentence: 'Stabilize the patient first.' },
  ] } }); const bookId = seeded.importedBookIds[0];
  await page.reload(); await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await openDashboardReference(page, 'library'); await page.getByTestId(`book-study-${bookId}`).click();
  await expect.poll(() => calls(page)).toEqual(['triage']);
  expect((await readPronunciation(page)).spoken[0]).toMatchObject({ rate: 0.9, lang: 'en-US', voice: 'Samantha' });
  await page.getByTestId('study-flip-button').click();
  await expect.poll(() => readPronunciation(page).then(value => value.cancels)).toBe(1);
  await page.getByTestId('study-details-open').click();
  await expect(page.getByRole('dialog', { name: '例文・補足' })).toBeVisible();
  const exampleDialog = page.getByRole('dialog', { name: '例文・補足' });
  await exampleDialog.getByRole('button', { name: '音声をオフにする', exact: true }).click();
  await expect(exampleDialog.getByRole('button', { name: '例文を読み上げる', exact: true })).toBeDisabled();
  await exampleDialog.getByRole('button', { name: '音声をオンにする', exact: true }).click();
  await page.getByRole('button', { name: '例文を読み上げる', exact: true }).click();
  await expect.poll(() => calls(page)).toEqual(['triage', 'Triage patients carefully.']);
  await page.getByRole('dialog', { name: '例文・補足' }).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect.poll(() => readPronunciation(page).then(value => value.cancels)).toBe(2);
  await page.getByTestId('study-rate-3').click(); await expect.poll(() => calls(page)).toEqual(['triage', 'Triage patients carefully.', 'stabilize']);
  await page.evaluate(() => { const f = (window as any).__pronunciationFixture; f.emit(0, 'start'); f.emit(0, 'error', 'synthesis-failed'); });
  await expect(page.getByRole('status').filter({ hasText: '発音を開始できませんでした' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.screenshot({ path: info.outputPath('study-audio-390.png') });
});


test('pronunciation real announcement traps focus, restores background state and stops speech without repeating', async ({ page }) => {
  await openHarness(page, { delayed: true }); await expect.poll(() => calls(page)).toEqual(['learn']);
  await page.evaluate(() => {
    const alreadyInert = document.createElement('div');
    alreadyInert.id = 'already-inert'; alreadyInert.setAttribute('inert', '');
    document.body.append(alreadyInert);
  });
  const opener = page.getByTestId('announcement-opener');
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '合成のお知らせ', exact: true });
  const acknowledge = dialog.getByRole('button', { name: '確認しました', exact: true });
  const dismiss = dialog.getByRole('button', { name: '閉じる', exact: true });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(acknowledge).toBeFocused();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(page.locator('#already-inert')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab'); await expect(dismiss).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dismiss).toBeFocused();
  await page.keyboard.press('Tab'); await expect(acknowledge).toBeFocused();
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[data-testid="announcement-opener"]')!.focus();
    const laterBackground = document.createElement('div');
    laterBackground.id = 'later-background'; document.body.append(laterBackground);
  });
  await expect(acknowledge).toBeFocused();
  await expect(page.locator('#later-background')).toHaveAttribute('inert', '');
  await expect.poll(() => readPronunciation(page).then(value => value.cancels)).toBe(1);
  await page.evaluate(() => {
    const fixture = (window as any).__pronunciationFixture;
    fixture.emit(0, 'start'); fixture.emit(0, 'error', 'not-allowed');
  });
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await expect(page.locator('#later-background')).not.toHaveAttribute('inert');
  await expect(page.locator('#already-inert')).toHaveAttribute('inert', '');
  await expect(page.getByTestId('announcement-acknowledged')).toHaveText('1');
  await expect(page.getByTestId('announcement-dismissed')).toHaveText('0');
  await page.getByRole('button', { name: '再描画', exact: true }).click();
  expect(await calls(page)).toEqual(['learn']);
  await expect(page.getByRole('status')).toHaveCount(0);
  await opener.click(); await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  await expect(page.getByTestId('announcement-dismissed')).toHaveText('1');
  await expect(page.getByTestId('announcement-acknowledged')).toHaveText('1');
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await expect(page.locator('#already-inert')).toHaveAttribute('inert', '');
  expect(await calls(page)).toEqual(['learn']);
});

test('pronunciation critical announcement retains its acknowledgment gate through keyboard and backdrop dismissal', async ({ page }) => {
  await openHarness(page, { delayed: true }); await expect.poll(() => calls(page)).toEqual(['learn']);
  const opener = page.getByTestId('critical-announcement-opener');
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '合成のお知らせ', exact: true });
  const acknowledge = dialog.getByRole('button', { name: '確認しました', exact: true });
  await expect(acknowledge).toBeFocused();
  await expect(dialog.getByRole('button', { name: '閉じる', exact: true })).toHaveCount(0);
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab'); await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Escape');
  await dialog.evaluate(element => (element.parentElement!.parentElement as HTMLElement).click());
  await expect(dialog).toBeVisible(); await expect(acknowledge).toBeFocused();
  await expect(page.getByTestId('announcement-acknowledged')).toHaveText('0');
  await expect(page.getByTestId('announcement-dismissed')).toHaveText('0');
  await expect.poll(() => readPronunciation(page).then(value => value.cancels)).toBe(1);
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  await expect(page.getByTestId('announcement-acknowledged')).toHaveText('1');
  await expect(page.getByTestId('announcement-dismissed')).toHaveText('0');
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  expect(await calls(page)).toEqual(['learn']);
});

test('pronunciation critical announcement keeps focus through an asynchronous real report dialog and releases it after acknowledgment', async ({ page }) => {
  await openHarness(page, { delayed: true }); await expect.poll(() => calls(page)).toEqual(['learn']);
  await page.getByTestId('critical-announcement-opener').click();
  const announcement = page.getByRole('dialog', { name: '合成のお知らせ', exact: true });
  const acknowledge = announcement.getByRole('button', { name: '確認しました', exact: true });
  await expect(acknowledge).toBeFocused();
  await page.evaluate(() => (window as any).__finishPendingReport());
  const report = page.getByRole('dialog', { name: '報告受付完了', exact: true, includeHidden: true });
  await expect(report).toHaveCount(1);
  await expect.poll(() => report.evaluate(element => Boolean(element.closest('[inert]')))).toBe(true);
  await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Tab'); await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Escape');
  await announcement.evaluate(element => (element.parentElement!.parentElement as HTMLElement).click());
  await expect(announcement).toBeVisible(); await expect(acknowledge).toBeFocused();
  await expect(report).toHaveCount(1);
  await expect(page.getByTestId('announcement-acknowledged')).toHaveText('0');
  await expect(page.getByTestId('announcement-dismissed')).toHaveText('0');
  await expect.poll(() => readPronunciation(page).then(value => value.cancels)).toBe(1);
  await page.keyboard.press('Enter');
  await expect(announcement).toHaveCount(0);
  await expect.poll(() => report.evaluate(element => Boolean(element.closest('[inert]')))).toBe(false);
  await expect(report).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(report.getByRole('button', { name: '閉じる', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(report.getByRole('button', { name: '閉じる', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(report).toHaveCount(0);
  await expect(page.getByTestId('announcement-acknowledged')).toHaveText('1');
  await expect(page.getByTestId('announcement-dismissed')).toHaveText('0');
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: '再描画', exact: true }).click();
  expect(await calls(page)).toEqual(['learn']);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('pronunciation pagehide stops pending speech and stale start cannot resume it after pageshow', async ({ page }) => {
  await openHarness(page, { delayed: true }); await expect.poll(() => calls(page)).toEqual(['learn']);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect.poll(() => readPronunciation(page).then(value => value.cancels)).toBe(1);
  await page.evaluate(() => { (window as any).__pronunciationFixture.emit(0, 'start'); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  await page.getByRole('button', { name: '再描画', exact: true }).click(); expect(await calls(page)).toEqual(['learn']);
});

test('pronunciation mute remains usable when preference storage is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { configurable: true, value: () => { throw new DOMException('Denied', 'SecurityError'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { configurable: true, value: () => { throw new DOMException('Denied', 'SecurityError'); } });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openHarness(page); await expect.poll(() => calls(page)).toEqual(['learn']);
  await page.getByRole('button', { name: '音声をオフにする', exact: true }).click();
  await page.getByRole('button', { name: '次の語', exact: true }).click(); expect(await calls(page)).toEqual(['learn']);
  await page.getByRole('button', { name: '音声をオンにする', exact: true }).click(); expect(await calls(page)).toEqual(['learn']);
  await page.getByRole('button', { name: '発音を聞く', exact: true }).click(); expect(await calls(page)).toEqual(['learn', 'read']);
  expect(errors).toEqual([]);
});
