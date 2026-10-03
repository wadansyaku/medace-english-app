import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';

// Exercise the actual ReactDOM component and native browser controls. Only services
// are synthetic; all network requests are blocked and no student or AI data is used.
const serviceFixture = `
const f = globalThis.__worksheetFixture;
const books = ['A', 'B'].map(id => ({ id, title: '合成教材' + id, wordCount: 1 }));
const words = id => [{ id: 'word-' + id, bookId: id, number: 1,
  word: 'synthetic-' + id, definition: '合成語義' + id }];
const snapshot = id => ({ studentUid: id, studentName: '合成生徒' + id,
  source: 'history', sourceLabel: '合成学習履歴' + id,
  words: words(id).map(word => ({ ...word, wordId: word.id, bookTitle: '合成教材' + id,
    status: 'review', lastStudiedAt: 1, attemptCount: 1, correctCount: 1 })) });
const request = (kind, id, value) => {
  f.calls.push({ kind, id });
  if (f.fail === kind) return Promise.reject(new Error('合成' + kind + '取得エラー'));
  if (f.delay === kind + ':' + id) return new Promise((resolve, reject) => {
    f.pending.push({ kind, id, resolve: () => resolve(value), reject });
  });
  return Promise.resolve(value);
};
export const learningService = {
  getBooks: () => request('books', '', books),
  getWordsByBook: id => request('words', id, words(id)),
};
export const workspaceService = {
  getAllStudentsProgress: () => request('students', '', ['A', 'B'].map(id => ({ uid: id, name: '合成生徒' + id }))),
  getStudentWorksheetSnapshot: id => request('snapshot', id, snapshot(id)),
  recordClassroomWorksheetLifecycleEvent: () => Promise.resolve(),
};
`;

let bundle: string;
let stylesheet: string;
test.beforeAll(async () => {
  stylesheet = (await postcss([tailwindcss()]).process(await readFile('styles.css', 'utf8'), { from: 'styles.css' })).css;
  const output = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import WorksheetPrintLauncher from './components/WorksheetPrintLauncher';
        createRoot(document.getElementById('root')).render(<WorksheetPrintLauncher
          user={{ uid: 'synthetic-instructor', displayName: '合成講師', role: 'INSTRUCTOR' }}
          defaultSourceMode={globalThis.__worksheetFixture.mode || 'BOOK_RANGE'} />);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'synthetic-worksheet-services', setup(builder) {
      builder.onResolve({ filter: /services\/(learning|workspace)$/ }, () => ({ path: 'worksheet-services', namespace: 'synthetic' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: serviceFixture, loader: 'js' }));
    } }],
  });
  bundle = output.outputFiles[0].text;
});

const mount = async (page: Page, settings: Record<string, string> = {}) => {
  await page.route('**/*', route => route.abort());
  await page.setContent(`<html lang="ja"><style>${stylesheet}</style><div id="root"></div></html>`);
  await page.evaluate(initial => {
    (globalThis as any).__worksheetFixture = { ...initial, calls: [], pending: [] };
  }, settings);
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'PDF問題を作る', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'PDF問題作成', exact: true })).toBeVisible();
};

const settle = (page: Page, index = 0, fail = false) => page.evaluate(({ index, fail }) => {
  const pending = (globalThis as any).__worksheetFixture.pending[index];
  if (fail) pending.reject(new Error('合成切替取得エラー'));
  else pending.resolve();
}, { index, fail });

test('late vocabulary from A cannot replace selected book B', async ({ page }) => {
  await mount(page, { delay: 'words:A' });
  await expect.poll(() => page.evaluate(() => (globalThis as any).__worksheetFixture.pending.length)).toBe(1);
  await page.getByTestId('worksheet-catalog-book-select').selectOption('B');
  await expect(page.getByText('synthetic-B', { exact: true })).toBeVisible();
  await settle(page);
  await expect(page.getByText('synthetic-A', { exact: true })).toHaveCount(0, { timeout: 1500 });
  await expect(page.getByText('synthetic-B', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as any).__worksheetFixture.calls.filter((call: any) => call.kind === 'books').length)).toBe(1);
});

test('student B load failure removes A questions and retries B without reloading the roster', async ({ page }) => {
  await mount(page, { mode: 'STUDENT_HISTORY', delay: 'snapshot:B' });
  await expect(page.getByText('synthetic-A', { exact: true })).toBeVisible();
  await page.getByRole('combobox').first().selectOption('B');
  await expect.poll(() => page.evaluate(() => (globalThis as any).__worksheetFixture.pending.length)).toBe(1);
  await expect(page.getByText('synthetic-A', { exact: true })).toHaveCount(0);
  await settle(page, 0, true);
  await expect(page.getByText('synthetic-A', { exact: true })).toHaveCount(0, { timeout: 1500 });
  await expect(page.getByRole('button', { name: '問題を開く', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('合成切替取得エラー');
  await page.getByRole('button', { name: 'もう一度読み込む', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (globalThis as any).__worksheetFixture.pending.length)).toBe(2);
  await settle(page, 1);
  await expect(page.getByText('synthetic-B', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as any).__worksheetFixture.calls.filter((call: any) => call.kind === 'students').length)).toBe(1);
});

test('late student A response cannot replace the selected student B', async ({ page }) => {
  await mount(page, { mode: 'STUDENT_HISTORY', delay: 'snapshot:A' });
  await expect.poll(() => page.evaluate(() => (globalThis as any).__worksheetFixture.pending.length)).toBe(1);
  await page.getByRole('combobox').first().selectOption('B');
  await expect(page.getByText('synthetic-B', { exact: true })).toBeVisible();
  await settle(page);
  await expect(page.getByText('synthetic-A', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '問題を開く', exact: true }).click();
  await expect(page.frameLocator('iframe').getByRole('heading')).toContainText('合成生徒B');
});

for (const [kind, mode] of [['books', 'BOOK_RANGE'], ['words', 'BOOK_RANGE'], ['students', 'STUDENT_HISTORY']] as const) {
  test(`${kind} acquisition failure is recoverable without closing the worksheet`, async ({ page }) => {
    await mount(page, { mode, fail: kind });
    await expect(page.getByRole('alert')).toContainText('合成' + kind + '取得エラー', { timeout: 1500 });
    await expect(page.getByRole('button', { name: '問題を開く', exact: true })).toHaveCount(0);
    await page.evaluate(() => { (globalThis as any).__worksheetFixture.fail = ''; });
    await page.getByRole('button', { name: 'もう一度読み込む', exact: true }).click();
    await expect(page.getByText('synthetic-A', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('closed worksheet ignores its old request after reopening', async ({ page }) => {
  await mount(page, { delay: 'words:A' });
  await expect.poll(() => page.evaluate(() => (globalThis as any).__worksheetFixture.pending.length)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => { (globalThis as any).__worksheetFixture.delay = ''; });
  await page.getByRole('button', { name: 'PDF問題を作る', exact: true }).click();
  await page.getByTestId('worksheet-catalog-book-select').selectOption('B');
  await expect(page.getByText('synthetic-B', { exact: true })).toBeVisible();
  await settle(page);
  await expect(page.getByText('synthetic-A', { exact: true })).toHaveCount(0, { timeout: 1500 });
});

test('new print tab loads successfully with an isolated opener and no false popup error', async ({ page }) => {
  await mount(page);
  await expect(page.getByText('synthetic-A', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '問題を開く', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '印刷プレビュー', exact: true });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    preview.getByText('この版を新しいタブで開く', { exact: true }).click(),
  ]);
  await expect(popup.getByRole('heading', { name: '英語 -> 日本語 配布プリント', exact: true })).toBeVisible();
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await expect(page.getByText('プレビュータブを開けませんでした。ポップアップを許可してください。', { exact: true })).toHaveCount(0);
  await popup.close();
});

test('worksheet controls and both close actions have accessible names', async ({ page }) => {
  await mount(page);
  await expect(page.getByText('synthetic-A', { exact: true })).toBeVisible();
  await expect(page.getByLabel('単語帳', { exact: true })).toBeVisible({ timeout: 1500 });
  await expect(page.getByLabel('開始番号', { exact: true })).toBeVisible();
  await expect(page.getByLabel('終了番号', { exact: true })).toBeVisible();
  await expect(page.getByLabel('問題数', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF問題作成を閉じる', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '問題を開く', exact: true }).click();
  await page.getByRole('button', { name: '印刷プレビューを閉じる', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'PDF問題作成', exact: true })).toBeVisible();
});

test('print failures are reported inside the active preview with the new-tab alternative', async ({ page }) => {
  await mount(page);
  await expect(page.getByText('synthetic-A', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '問題を開く', exact: true }).click();
  await page.frameLocator('iframe').locator('body').evaluate(() => {
    window.print = () => { throw new Error('Synthetic browser print failure'); };
  });
  const preview = page.getByRole('dialog', { name: '印刷プレビュー', exact: true });
  await preview.getByRole('button', { name: 'この版を印刷 / PDF保存', exact: true }).click();
  await expect(preview.getByRole('alert')).toContainText('新しいタブで開いて印刷してください。');
  await expect(preview.getByRole('link', { name: 'この版を新しいタブで開く', exact: true })).toBeVisible();
});

test('worksheet creation and preview fit small phones, landscape, tablet and desktop', async ({ browser }, testInfo) => {
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    try {
      await mount(page);
      await expect(page.getByText('synthetic-A', { exact: true })).toBeVisible();
      const dialog = page.getByRole('dialog', { name: 'PDF問題作成', exact: true });
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      const heading = await dialog.locator('h3').evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const { x, width } = range.getBoundingClientRect();
        return { x, width };
      });
      const close = await dialog.getByRole('button', { name: 'PDF問題作成を閉じる', exact: true }).boundingBox();
      expect(heading!.x + heading!.width).toBeLessThanOrEqual(close!.x);
      await dialog.evaluate(element => element.querySelector('h3')?.scrollIntoView());
      await page.screenshot({ path: testInfo.outputPath(`worksheet-${viewport.width}x${viewport.height}.png`) });
      await page.getByRole('button', { name: '問題を開く', exact: true }).click();
      const preview = page.getByRole('dialog', { name: '印刷プレビュー', exact: true });
      await expect(preview.getByRole('button', { name: '印刷プレビューを閉じる', exact: true })).toBeVisible();
      const frame = await preview.locator('iframe').boundingBox();
      expect(frame!.height).toBeGreaterThan(50);
      await page.screenshot({ path: testInfo.outputPath(`worksheet-preview-${viewport.width}x${viewport.height}.png`) });
    } finally {
      await page.close();
    }
  }
});
