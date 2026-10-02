import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { expect, test, type Page } from '@playwright/test';
import tailwindConfig from '../../tailwind.config.js';

// Real ReactDOM renders and native controls; only application services are synthetic.
// This fixture never contacts an application server or AI provider.
const serviceFixture = `
const f = globalThis.__writingFixture;
const historyStatus = () => f.completed ? 'COMPLETED' : f.historyRevision ? 'REVISION_REQUESTED' : 'RETURNED';
const assignment = (id) => ({
  id: 'assignment-' + id, studentUid: 'student-' + id, studentName: '合成生徒' + id,
  promptTitle: '課題' + id, promptText: 'Synthetic prompt.', guidance: '',
  status: id === 'A' && (f.historyReturned || f.historyRevision) ? historyStatus() : 'ISSUED', attemptCount: 0, maxAttempts: 2, wordCountMin: 80, wordCountMax: 120,
  submissionCode: 'SYNTHETIC-' + id, createdAt: 1, updatedAt: 2,
});
const evaluation = (id) => ({
  id: 'evaluation-' + id, provider: 'GEMINI', isDefault: true, overallScore: 12,
  structureScore: 1, transcriptAlignment: 1, confidence: 1, latencyMs: 1, costMilliYen: 0,
  rubric: [], strengths: [], improvementPoints: [], correctedDraft: 'Synthetic draft.', modelAnswer: 'Synthetic answer.',
});
const detail = (id) => ({ assignment: { ...assignment(id), status: id === 'A' && (f.historyReturned || f.historyRevision) ? historyStatus() : 'REVIEW_READY' }, submission: {
  id, assignmentId: 'assignment-' + id, attemptNo: 1, assets: [], evaluations: [evaluation(id)],
  transcript: '答案' + id, transcriptConfidence: 1, submittedAt: 2, submissionSource: 'STAFF_SCANNER',
}});
const queue = (id) => ({ assignmentId: 'assignment-' + id, submissionId: id,
  studentUid: 'student-' + id, studentName: '合成生徒' + id, promptTitle: '課題' + id,
  attemptNo: 1, status: id === 'A' && (f.historyReturned || f.historyRevision) ? historyStatus() : 'REVIEW_READY', submittedAt: 2, transcriptConfidence: 1,
});
const acquire = (value) => f.failCollections ? Promise.reject(new Error('合成取得エラー')) : Promise.resolve(value);
export const workspaceService = { getAllStudentsProgress: () => acquire(['A', 'B'].map(id => ({
  uid: 'student-' + id, name: '合成生徒' + id, email: id + '@example.invalid', subscriptionPlan: 'TOB_PAID',
}))) };
export const listWritingTemplates = () => acquire({ templates: [{ id: 'template', title: '合成テンプレート', defaultWordCountMin: 80, defaultWordCountMax: 120 }] });
export const listWritingAssignments = () => acquire({ assignments: ['A', 'B'].map(assignment) });
export const listWritingReviewQueue = (tab) => acquire({ items: f.historyReturned || f.historyRevision ? (tab === 'HISTORY' ? [queue('A')] : []) : (tab === 'QUEUE' ? ['A', 'B'].map(queue) : []) });
export const getStaffWritingSubmissionDetail = (id) => {
  f.detailCalls.push(id);
  if (id === 'B' && f.delayB) return new Promise((resolve, reject) => { f.pendingB = { resolve: () => resolve(detail(id)), reject }; });
  return Promise.resolve(detail(id));
};
export const approveWritingReturn = (id) => { f.reviewCalls.push(id); return Promise.resolve(detail(id)); };
export const requestWritingRevision = approveWritingReturn;
export const completeWritingAssignment = (id) => { f.reviewCalls.push(id); f.completed = true; return Promise.resolve({ ...assignment('A'), status: 'COMPLETED' }); };
export const generateWritingAssignment = () => Promise.resolve(assignment('A'));
export const issueWritingAssignment = () => Promise.resolve(assignment('A'));
export const calculateWritingAssetSha256Base64 = () => Promise.resolve('synthetic-hash');
export const createWritingUploadUrl = (input) => { f.uploadCalls.push(input); return Promise.resolve({ assetId: 'asset', uploadUrl: 'synthetic' }); };
export const uploadWritingAsset = () => Promise.resolve();
export const finalizeStaffWritingSubmission = (input) => {
  f.scanCalls.push(input);
  if (f.delayScan) return new Promise((resolve, reject) => { f.pendingScan = { resolve: () => resolve(detail('A')), reject }; });
  return Promise.resolve(detail('A'));
};
`;

let bundle: string;
let stylesheet: string;
test.beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import WritingOpsPanel from './components/WritingOpsPanel';
        createRoot(document.getElementById('root')).render(<WritingOpsPanel user={{ uid: 'synthetic-instructor', displayName: '合成講師', role: 'INSTRUCTOR' }} />);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'synthetic-writing-services', setup(builder) {
      builder.onResolve({ filter: /services\/(writing|workspace)$/ }, () => ({ path: 'writing-services', namespace: 'synthetic' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: serviceFixture, loader: 'js' }));
      builder.onResolve({ filter: /WritingPrintLauncher$/ }, () => ({ path: 'print', namespace: 'synthetic-print' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic-print' }, () => ({ contents: 'export default () => null;', loader: 'js' }));
    } }],
  });
  bundle = output.outputFiles[0].text;
  stylesheet = (await postcss([tailwindcss(tailwindConfig)]).process(
    await readFile('styles.css', 'utf8'), { from: 'styles.css' },
  )).css;
});

const mount = async (page: Page, settings: Record<string, boolean> = {}) => {
  await page.route('**/*', (route) => route.abort());
  await page.setContent(`<html lang="ja"><style>${stylesheet}</style><div id="root"></div></html>`);
  await page.evaluate((initial) => {
    (globalThis as any).__writingFixture = { ...initial, detailCalls: [], reviewCalls: [], uploadCalls: [], scanCalls: [] };
  }, settings);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByTestId('writing-ops-panel')).toBeVisible();
};

test('writing operations keep failed acquisition unknown and provide retry', async ({ page }) => {
  await mount(page, { failCollections: true });
  await expect(page.getByRole('alert')).toContainText('合成取得エラー');
  await expect(page.getByTestId('writing-generate-submit')).toHaveCount(0);
  await expect(page.getByText('対象になる有料ビジネス生徒がまだいません。')).toHaveCount(0);
  await expect(page.getByText('未取得', { exact: true }).first()).toBeVisible();
  await page.evaluate(() => { (globalThis as any).__writingFixture.failCollections = false; });
  await page.getByRole('button', { name: '再取得する', exact: true }).click();
  await expect(page.getByTestId('writing-student-select')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('switching answers clears A operations while B is delayed or fails, then retries B', async ({ page }) => {
  await mount(page, { delayB: true });
  await expect(page.getByTestId('writing-student-select')).toBeVisible();
  await page.getByRole('button', { name: '添削キュー', exact: true }).click();
  await expect(page.getByTestId('writing-approve-return')).toBeEnabled();
  await page.getByRole('button', { name: '添削キュー', exact: true }).click();
  await expect(page.getByTestId('writing-approve-return')).toBeEnabled();
  await page.getByTestId('writing-review-item-B').click();
  await expect(page.getByTestId('writing-approve-return')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('答案を読み込んでいます');
  await page.evaluate(() => { (globalThis as any).__writingFixture.pendingB.reject(new Error('合成答案取得エラー')); });
  await expect(page.getByTestId('writing-review-detail-error')).toContainText('合成答案取得エラー');
  await expect(page.getByTestId('writing-approve-return')).toHaveCount(0);
  await page.getByRole('button', { name: '答案を再取得する', exact: true }).click();
  await page.evaluate(() => { (globalThis as any).__writingFixture.pendingB.resolve(); });
  await expect(page.getByTestId('writing-review-detail')).toContainText('合成生徒B');
  await page.getByTestId('writing-approve-return').click();
  expect(await page.evaluate(() => (globalThis as any).__writingFixture.reviewCalls)).toEqual(['B']);
});

test('scanner preserves pending input and reports a failed save inside the dialog', async ({ page }) => {
  await mount(page, { delayScan: true });
  await expect(page.getByTestId('writing-student-select')).toBeVisible();
  await page.getByRole('button', { name: '印刷 / 配布', exact: true }).click();
  await page.getByRole('button', { name: '校舎スキャナー提出', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'synthetic-A.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic') });
  await dialog.getByPlaceholder('OCR 補助のために本文を入力できます。').fill('合成の補助文A');
  await dialog.getByRole('button', { name: 'スキャン答案を登録する', exact: true }).click();
  await expect(dialog.locator('input[type="file"]')).toBeDisabled();
  await expect(dialog.getByPlaceholder('OCR 補助のために本文を入力できます。')).toHaveAttribute('readonly');
  await expect(dialog.getByRole('button', { name: 'キャンセル', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as any).__writingFixture.pendingScan))).toBe(true);
  await page.evaluate(() => { (globalThis as any).__writingFixture.pendingScan.reject(new Error('合成提出保存エラー')); });
  await expect(dialog.getByRole('alert')).toContainText('合成提出保存エラー');
  await expect(dialog.getByRole('alert')).toBeFocused();
  await expect(dialog.locator('input[type="file"]')).toBeEnabled();
  await expect(dialog.getByPlaceholder('OCR 補助のために本文を入力できます。')).toHaveValue('合成の補助文A');
  await expect(dialog.getByText('synthetic-A.pdf')).toBeVisible();
  await dialog.getByRole('button', { name: 'スキャン答案を登録する', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (globalThis as any).__writingFixture.scanCalls.length)).toBe(2);
  await page.evaluate(() => { (globalThis as any).__writingFixture.pendingScan.resolve(); });
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).__writingFixture.scanCalls.map((call: any) => call.manualTranscript))).toEqual(['合成の補助文A', '合成の補助文A']);
});

test('writing form controls have explicit accessible labels', async ({ page }) => {
  await mount(page);
  await expect(page.getByLabel('対象生徒', { exact: true })).toBeVisible();
  await expect(page.getByLabel('テンプレート', { exact: true })).toBeVisible();
  await expect(page.getByLabel('テーマ補足', { exact: true })).toBeVisible();
  await expect(page.getByLabel('講師メモ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '添削キュー', exact: true }).click();
  await expect(page.getByLabel('生徒に見せるコメント', { exact: true })).toBeVisible();
  await expect(page.getByLabel('講師メモ', { exact: true })).toBeVisible();
});

test('completion updates the same history answer and removes the completed action', async ({ page }) => {
  await mount(page, { historyReturned: true });
  await expect(page.getByTestId('writing-student-select')).toBeVisible();
  await page.getByRole('navigation', { name: '英作文の作業' }).getByRole('button', { name: '返却履歴', exact: true }).click();
  const detail = page.getByTestId('writing-review-detail');
  await expect(detail.getByRole('button', { name: '完了にする', exact: true })).toBeEnabled();
  await detail.getByRole('button', { name: '完了にする', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('課題を完了済みにしました。');
  await expect(page.getByTestId('writing-review-item-A')).toContainText('完了');
  await expect(detail).toContainText('完了');
  await expect(detail.getByRole('button', { name: '完了にする', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).__writingFixture.reviewCalls)).toEqual(['assignment-A']);
  expect(await page.evaluate(() => (globalThis as any).__writingFixture.detailCalls)).toEqual(['A']);
});

test('revision-requested history waits for resubmission without offering completion', async ({ page }) => {
  await mount(page, { historyRevision: true });
  await expect(page.getByTestId('writing-student-select')).toBeVisible();
  await page.getByRole('navigation', { name: '英作文の作業' }).getByRole('button', { name: '返却履歴', exact: true }).click();
  const detail = page.getByTestId('writing-review-detail');
  await expect(detail).toContainText('再提出を待っています。');
  await expect(detail.getByRole('button', { name: '完了にする', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).__writingFixture.reviewCalls)).toEqual([]);
});

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 768, height: 1024 }, { width: 1440, height: 900 },
]) {
  test(`writing controls precede optional guidance at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mount(page);
    const student = page.getByLabel('対象生徒', { exact: true });
    await expect(student).toBeVisible();
    const measurements = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="writing-ops-panel"]')!;
      const select = document.querySelector('[data-testid="writing-student-select"]')!;
      return {
        width: innerWidth, height: innerHeight,
        studentDistance: select.getBoundingClientRect().top - panel.getBoundingClientRect().top,
        pageHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    const measurementPath = testInfo.outputPath('writing-layout.json');
    await writeFile(measurementPath, JSON.stringify(measurements, null, 2));
    await testInfo.attach('writing-layout.json', { path: measurementPath, contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('writing-create.png'), fullPage: true });
    // Record the unchanged layout once before the fix, using the same production CSS.
    if (process.env.WRITING_DENSITY_BASELINE === '1') return;

    expect(measurements.studentDistance).toBeLessThan(800);
    expect(measurements.horizontalOverflow).toBe(false);
    const nav = page.getByRole('navigation', { name: '英作文の作業' });
    await expect(nav.getByRole('button')).toHaveCount(4);
    const queueTab = nav.getByRole('button', { name: '添削キュー', exact: true });
    await queueTab.focus();
    await expect(queueTab).toBeFocused();
    await page.keyboard.press('Space');
    await expect(queueTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('writing-review-detail')).toContainText('合成生徒A');
    const historyTab = nav.getByRole('button', { name: '返却履歴', exact: true });
    await page.keyboard.press('Tab');
    await expect(historyTab).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(historyTab).toHaveAttribute('aria-pressed', 'true');
    const createTab = nav.getByRole('button', { name: '問題作成', exact: true });
    await createTab.focus();
    await page.keyboard.press('Tab');
    const printTab = nav.getByRole('button', { name: '印刷 / 配布', exact: true });
    await expect(printTab).toBeFocused();
    await page.keyboard.press('Space');
    await expect(printTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '校舎スキャナー提出', exact: true })).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(createTab).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(createTab).toHaveAttribute('aria-pressed', 'true');
    await expect(student).toBeVisible();
    const guidance = page.getByTestId('writing-ops-guidance');
    await expect(guidance).not.toHaveAttribute('open');
    await expect(guidance.getByText('Step 1', { exact: true })).toBeHidden();
    const summary = guidance.locator('summary');
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(guidance).toHaveAttribute('open');
    await expect(guidance.getByText('Step 1', { exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(guidance).not.toHaveAttribute('open');
    await expect(summary).toBeFocused();
  });
}
