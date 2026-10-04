import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './diagnostics';
import { loginAdminDemo, loginBusinessStudentDemo, loginInstructorDemo } from './smoke-support';

const input = (title: string) => ({ title, version: 'synthetic-review-v1', screen: '講師の担当生徒', steps: '匿名の講師でログインし、担当画面を開く', expected: '次の操作が見える', actual: '操作が見つからない', impact: '確認を続けられない' });
const labels = { title: '件名', version: '試した版', screen: '画面・操作の場所', steps: '再現する手順', expected: '期待する動作', actual: '実際の動作', impact: '困ったこと・影響' };
const open = async (page: Page) => { await page.getByRole('button', { name: 'FAQ・製品の報告', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'FAQ・製品の報告' })).toBeVisible(); await expect(page.getByText('報告を取得しています…', { exact: true })).toHaveCount(0); };
const fill = async (page: Page, title: string) => { await page.getByRole('button', { name: '報告を入力する', exact: true }).click(); const form = page.getByTestId('product-feedback-create'); for (const [key, value] of Object.entries(input(title))) await form.getByLabel(labels[key as keyof typeof labels], { exact: true }).fill(value); await form.getByRole('checkbox').check(); return form; };
const card = (page: Page, title: string) => page.getByTestId('product-feedback-report').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const expand = async (report: Locator) => { const details = report.locator('details'); if (!(await details.getAttribute('open') !== null)) await report.getByText('内容と次の操作・履歴を確認', { exact: true }).click(); await expect(report.getByText('対応履歴を取得しています…')).toHaveCount(0); };
const refresh = async (page: Page) => { await page.getByRole('button', { name: '一覧を更新', exact: true }).click(); await expect(page.getByText('報告を取得しています…', { exact: false })).toHaveCount(0); };

test.beforeEach(async ({ baseURL }) => { test.skip(!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname), 'Synthetic D1 writes are local-only.'); });

test('teacher report persists through owner triage, manual export, failed retest, second fix and success', async ({ page, browser }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await loginInstructorDemo(page); await open(page);
  const title = `匿名操作の報告 ${randomUUID()}`; const form = await fill(page, title);
  await form.getByRole('button', { name: '報告をサーバーに保存' }).click();
  await expect(card(page, title)).toBeVisible(); await expect(page.getByText('サーバーへの報告保存を確認しました。', { exact: false })).toBeVisible();
  await page.reload(); await open(page); await expect(card(page, title)).toBeVisible();
  const summary = card(page, title).locator(':scope > details > summary');
  await page.getByRole('button', { name: '一覧を更新', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(summary).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '戻る・閉じる' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(summary).toBeFocused(); await page.keyboard.press('Enter'); await expect(card(page, title).locator('ol li')).toHaveCount(1);
  const adminContext = await browser.newContext(); const admin = await adminContext.newPage();
  try {
    await admin.goto('/'); await loginAdminDemo(admin); await expect(admin.getByRole('button', { name: 'FAQ・製品の報告', exact: true })).toBeVisible(); await open(admin);
    const report = card(admin, title); await expand(report);
    await report.getByRole('combobox', { name: /優先度/ }).selectOption('P1'); await report.getByLabel('受入条件', { exact: true }).fill('320pxで次の操作を確認できる'); await report.getByRole('button', { name: '優先度・受入条件を保存' }).click();
    await expect(report.getByRole('button', { name: '手動引継ぎを準備' })).toBeEnabled(); await report.getByRole('button', { name: '手動引継ぎを準備' }).click();
    await expect(report.getByRole('button', { name: '引継ぎJSONを保存' })).toBeEnabled();
    const downloadPromise = admin.waitForEvent('download'); await report.getByRole('button', { name: '引継ぎJSONを保存' }).click(); const download = await downloadPromise;
    const payload = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(payload.report.title).toBe(title); expect(payload.report.history).toHaveLength(3); expect(JSON.stringify(payload)).not.toMatch(/reporter_user_id|actor_user_id|org_id|email|displayName/);
    await admin.screenshot({ path: testInfo.outputPath('feedback-owner-handoff.png') });
    await report.getByLabel('修正版・コミット').fill('synthetic-fix-v1'); await report.getByLabel('修正内容', { exact: true }).fill('操作入口を整理'); await report.getByRole('button', { name: '修正版を記録して再テストへ' }).click();
    await expect(report.getByText('再テスト対象版: synthetic-fix-v1')).toBeVisible();
    await refresh(page); const own = card(page, title); await expand(own); await expect(own.getByLabel('優先度', { exact: true })).toHaveCount(0);
    await own.getByLabel('再テストした条件と結果').fill('320pxで操作がまだ見えない'); await own.getByRole('button', { name: '再テスト失敗を記録' }).click(); await expect(own.getByText('次は管理者が修正を再記録し、もう一度再テストします。')).toBeVisible();
    await refresh(admin); await expand(report); await report.getByLabel('修正版・コミット').fill('synthetic-fix-v2'); await report.getByLabel('修正内容', { exact: true }).fill('スマホで操作を表示'); await report.getByRole('button', { name: '修正版を記録して再テストへ' }).click(); await expect(report.getByText('再テスト対象版: synthetic-fix-v2')).toBeVisible();
    await refresh(page); await expand(own); await own.getByLabel('再テストした条件と結果').fill('320pxと390pxで操作を確認'); await own.getByRole('button', { name: '再テスト成功を記録' }).click(); await expect(own.getByText('再テスト成功が記録されています。')).toBeVisible();
    await page.reload(); await open(page); await expand(card(page, title)); await expect(card(page, title).locator('ol li')).toHaveCount(7);
    await card(page, title).locator('ol').scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath('feedback-retest-history.png') });
    expect(errors).toEqual([]);
  } finally { await adminContext.close(); }
});

test('lost create response retries the same report, while list failure stays unknown and keyboard close preserves draft', async ({ page }) => {
  await page.goto('/'); await loginInstructorDemo(page);
  let failList = true; let loseCreate = true; const creates: unknown[] = [];
  await page.route('**/api/product-feedback', async route => {
    const request = route.request().postDataJSON();
    if (request.action === 'list' && failList) { await route.fulfill({ status: 503, json: { error: 'synthetic list unavailable' } }); return; }
    if (request.action === 'create') { creates.push(request); const response = await route.fetch(); if (loseCreate) { loseCreate = false; await route.fulfill({ status: 503, json: { error: 'synthetic response lost after commit' } }); return; } await route.fulfill({ response }); return; }
    await route.continue();
  });
  await open(page); await expect(page.getByRole('alert').filter({ hasText: '件数はまだ確認できていません' })).toBeVisible(); await expect(page.getByText('保存された報告はありません。', { exact: false })).toHaveCount(0);
  failList = false; await refresh(page);
  await page.getByText('学習・報告のよくある質問', { exact: true }).click(); await page.getByLabel('質問を検索').fill('未確認の質問です'); await page.getByRole('button', { name: '回答を確認' }).click(); await expect(page.getByText('この質問の答えは、確認できていません。', { exact: false })).toBeVisible(); await page.getByRole('button', { name: '質問を報告の下書きへ' }).click(); await expect(page.getByLabel('件名', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'FAQ・製品の報告', exact: true })).toBeFocused(); await open(page); await expect(page.getByLabel('件名', { exact: true })).toHaveValue('未確認の質問です'); await expect(page.getByTestId('product-feedback-create').getByRole('checkbox')).not.toBeChecked();
  const title = `応答消失 ${randomUUID()}`; const form = page.getByTestId('product-feedback-create'); for (const [key, value] of Object.entries(input(title))) await form.getByLabel(labels[key as keyof typeof labels], { exact: true }).fill(value); await form.getByRole('checkbox').check(); await form.getByRole('button', { name: '報告をサーバーに保存' }).click();
  await expect(page.getByRole('button', { name: '同じ内容で再試行' })).toBeVisible(); await expect(form.getByLabel('件名', { exact: true })).toHaveValue(title); await page.getByRole('button', { name: '同じ内容で再試行' }).click(); await expect(card(page, title)).toHaveCount(1); await expand(card(page, title)); await expect(card(page, title).locator('ol li')).toHaveCount(1); expect(creates).toHaveLength(2); expect(creates[0]).toEqual(creates[1]);
});

test('anonymous and student cannot read or create teacher product reports', async ({ page }) => {
  await page.goto('/'); const anonymous = await page.request.post('/api/product-feedback', { data: { action: 'list' }, headers: { Origin: new URL(page.url()).origin } }); expect(anonymous.status()).toBe(401);
  await loginBusinessStudentDemo(page); const student = await page.request.post('/api/product-feedback', { data: { action: 'list' }, headers: { Origin: new URL(page.url()).origin } }); expect(student.status()).toBe(403); await expect(page.getByRole('button', { name: 'FAQ・製品の報告', exact: true })).toHaveCount(0);
});

test('retrying an old committed receipt keeps a newer displayed revision', async ({ page }) => {
  await page.goto('/'); await loginAdminDemo(page); await open(page);
  const title = `旧応答の再送 ${randomUUID()}`; const form = await fill(page, title); await form.getByRole('button', { name: '報告をサーバーに保存' }).click();
  const report = card(page, title); await expand(report); let lostRequest: { id: string } | undefined; let lose = true;
  await page.route('**/api/product-feedback', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'advance' && body.change.type === 'triage' && lose) { lose = false; lostRequest = body; await route.fetch(); await route.fulfill({ status: 503, json: { error: 'synthetic response lost after commit' } }); return; }
    await route.continue();
  });
  await report.getByLabel('受入条件', { exact: true }).fill('表示中の新版を保持する'); await report.getByRole('button', { name: '優先度・受入条件を保存' }).click(); await expect(page.getByRole('button', { name: '同じ内容で再試行' })).toBeVisible(); expect(lostRequest).toBeDefined();
  const next = await page.request.post('/api/product-feedback', { headers: { Origin: new URL(page.url()).origin }, data: { action: 'advance', id: lostRequest!.id, expectedRevision: 2, mutationId: randomUUID(), change: { type: 'prepare-handoff' } } }); expect(next.ok()).toBe(true); expect((await next.json()).revision).toBe(3);
  await refresh(page); await expect(report.getByText('次は管理者が修正版を記録します。準備済みは送信・受領を示しません。')).toBeVisible(); await page.getByRole('button', { name: '同じ内容で再試行' }).click(); await expect(page.getByText('この操作のサーバー保存を確認しました。', { exact: false })).toBeVisible();
  await expect(report.getByText('次は管理者が修正版を記録します。準備済みは送信・受領を示しません。')).toBeVisible(); await expect(report.getByRole('button', { name: '手動引継ぎを準備' })).toHaveCount(0); await expect(report.locator('ol li')).toHaveCount(3);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
  test(`feedback is readable with reachable close and retained inputs at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); await page.goto('/'); await loginInstructorDemo(page); await open(page);
    const dialog = page.getByRole('dialog', { name: 'FAQ・製品の報告' }); await expect(page.getByTestId('product-feedback-create')).toBeHidden(); await expect(dialog).toBeVisible(); await page.screenshot({ path: testInfo.outputPath(`feedback-initial-${viewport.width}.png`) });
    const form = await fill(page, `表示の確認 ${randomUUID()}`); await form.getByRole('button', { name: '報告をサーバーに保存' }).scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const close = dialog.getByRole('button', { name: '戻る・閉じる' }); const box = await close.boundingBox(); expect(box).not.toBeNull(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: testInfo.outputPath(`feedback-form-${viewport.width}.png`) }); await close.click(); await expect(dialog).toHaveCount(0); await open(page); await expect(form.getByLabel('件名', { exact: true })).toHaveValue(/^表示の確認/); await expect(form.getByRole('checkbox')).not.toBeChecked();
  });
}
