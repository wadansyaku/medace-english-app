import { expect, test } from './diagnostics';
import { loginAdminDemo } from './smoke-support';

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
  test(`admin sees missing examples and an estimate before explicit preparation at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    let generationCalls = 0;
    let failRead = true;
    const syntheticBook = { id: 'synthetic-admin-example-book', title: 'Synthetic admin example preview', wordCount: 2, isPriority: false, catalogSource: 'STEADY_STUDY_ORIGINAL', accessScope: 'ALL_PLANS' };
    const words = [
      { id: 'synthetic-example-1', bookId: syntheticBook.id, number: 1, word: 'ready', definition: '準備できた', exampleSentence: 'I am ready.', exampleMeaning: '' },
      { id: 'synthetic-example-2', bookId: syntheticBook.id, number: 2, word: 'next', definition: '次の', exampleSentence: null, exampleMeaning: null },
    ];
    await page.route('**/api/storage', async route => {
      const body = route.request().postDataJSON();
      if (body?.action === 'getBooks') return route.fulfill({ contentType: 'application/json', body: JSON.stringify([syntheticBook]) });
      if (body?.action === 'getWordsByBook' && body.payload.bookId === syntheticBook.id) {
        if (failRead) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic catalog unavailable' }) });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(words) });
      }
      if (body?.action === 'prepareBookExamples') {
        generationCalls += 1;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ bookId: syntheticBook.id, preparedCount: 0, remainingCount: 1 }) });
      }
      await route.continue();
    });
    await page.goto('/');
    await loginAdminDemo(page);
    await page.getByRole('button', { name: '教材運用', exact: true }).click();
    const previewButton = page.getByRole('button', { name: '欠損・見積もりを確認', exact: true });
    await previewButton.click();
    const modal = page.getByRole('dialog', { name: '例文の事前準備', exact: true });
    await expect(modal.getByRole('alert')).toContainText('Synthetic catalog unavailable');
    expect(generationCalls).toBe(0);
    failRead = false;
    await modal.getByRole('button', { name: '一覧を再取得', exact: true }).click();
    await expect(modal).toContainText('表示できる例文は 1件');
    await expect(modal).toContainText('訳がない例文は 1件');
    await expect(modal).toContainText('概算上限 1.2円');
    await expect(modal).toContainText('承認待ちで保存');
    expect(generationCalls).toBe(0);
    await modal.getByText(/表示できる例文がない単語/).click();
    await expect(modal).toContainText('next');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`admin-example-preview-${viewport.width}.png`) });
    const confirmation = modal.getByRole('button', { name: '見積もりを確認して最大10件準備する', exact: true });
    await confirmation.scrollIntoViewIfNeeded();
    const geometry = await confirmation.evaluate(button => {
      const panel = button.closest('[role="dialog"]')!;
      const panelRect = panel.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return { panelTop: panelRect.top, panelBottom: panelRect.bottom, buttonTop: buttonRect.top, buttonBottom: buttonRect.bottom, viewportHeight: innerHeight };
    });
    expect(geometry.panelTop).toBeGreaterThanOrEqual(-1);
    expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.buttonTop).toBeGreaterThanOrEqual(geometry.panelTop - 1);
    expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.panelBottom + 1);
    await page.screenshot({ path: testInfo.outputPath(`admin-example-confirmation-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(previewButton).toBeFocused();
    expect(generationCalls).toBe(0);
    await previewButton.click();
    await modal.getByRole('button', { name: '見積もりを確認して最大10件準備する', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect.poll(() => generationCalls).toBe(1);
    await expect(modal.getByRole('button', { name: '見積もりを確認して最大10件準備する', exact: true })).toBeEnabled();
  });
}
