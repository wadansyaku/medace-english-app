import { writeFile } from 'node:fs/promises';
import { BUSINESS_ADMIN_WORKSPACE_SECTIONS, INSTRUCTOR_WORKSPACE_SECTIONS } from '../../config/workspace';
import { expect, test } from './diagnostics';
import { loginBusinessStudentDemo, loginGroupAdminDemo, loginInstructorDemo, seedPhrasebook, storageAction } from './smoke-support';

for (const role of ['student'] as const) {
  for (const width of [320, 390]) {
    test(`catalog actions keep Japanese labels readable for ${role} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await loginBusinessStudentDemo(page);
      const title = `Synthetic catalog actions ${width}`;
      await seedPhrasebook(page, title);
      const books = await storageAction<Array<{ id: string; title: string; catalogSource: string }>>(page, 'getBooks');
      const book = books.find(item => item.title === title);
      expect(book).toBeTruthy();
      await page.reload();
      await page.getByTestId('dashboard-task-reference-library').click();
      const study = page.getByTestId(`book-study-${book!.id}`);
      const quiz = page.getByTestId(`book-quiz-${book!.id}`);
      const measurements = [];
      for (const action of [study, quiz]) {
        await expect(action).toBeEnabled();
        const layout = await action.evaluate(button => {
          const bounds = button.getBoundingClientRect();
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          const textRects = [];
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            textRects.push(...Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => ({ y: r.y, left: r.left, right: r.right })));
          }
          return { height: bounds.height, left: bounds.left, right: bounds.right, textRects };
        });
        expect(layout.height).toBeGreaterThanOrEqual(44);
        expect(layout.textRects.length).toBeGreaterThan(0);
        expect(new Set(layout.textRects.map(r => Math.round(r.y))).size).toBe(1);
        for (const rect of layout.textRects) {
          expect(rect.left).toBeGreaterThanOrEqual(layout.left);
          expect(rect.right).toBeLessThanOrEqual(layout.right);
        }
        measurements.push(layout);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await study.focus();
      await page.keyboard.press('Tab');
      await expect(quiz).toBeFocused();
      await writeFile(testInfo.outputPath('catalog-action-layout.json'), JSON.stringify({ role, width, measurements }, null, 2));
      await study.click();
      await expect(page.getByTestId('study-book-label')).toHaveText(book!.title);
    });
  }
}

for (const role of ['instructor', 'group-admin'] as const) {
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1366, height: 900 }, { width: 844, height: 390 },
  ]) {
    test(`workspace navigation keeps overflow internal and keyboard items reachable for ${role} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await (role === 'instructor' ? loginInstructorDemo(page) : loginGroupAdminDemo(page));
      const sections = role === 'instructor' ? INSTRUCTOR_WORKSPACE_SECTIONS : BUSINESS_ADMIN_WORKSPACE_SECTIONS;
      const buttons = page.locator('[data-testid^="workspace-tab-"]');
      await expect(buttons).toHaveCount(sections.length);
      await expect(page.getByTestId('workspace-tab-overview')).toHaveAttribute('aria-current', 'page');
      const readLayout = () => page.evaluate(() => {
        const first = document.querySelector<HTMLButtonElement>('[data-testid^="workspace-tab-"]')!;
        const nav = first.parentElement!;
        const rect = nav.getBoundingClientRect();
        const focused = document.activeElement as HTMLButtonElement;
        const focusRect = focused.getBoundingClientRect();
        return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
          pageX: scrollX, pageY: scrollY, navWidth: nav.clientWidth, navScrollWidth: nav.scrollWidth, navLeft: nav.scrollLeft,
          navRight: rect.right, navStart: rect.left, overflowX: getComputedStyle(nav).overflowX,
          focusedTestId: focused.getAttribute('data-testid'), focusedLeft: focusRect.left, focusedRight: focusRect.right };
      });
      const initial = await readLayout();
      expect(initial.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(initial.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(initial.overflowX).toBe('auto');
      expect(initial.navScrollWidth).toBeGreaterThan(initial.navWidth);
      await buttons.first().focus();
      const measurements = [initial];
      for (let index = 0; index < sections.length; index += 1) {
        const section = sections[index];
        const button = page.getByTestId(`workspace-tab-${section.id.toLowerCase()}`);
        await expect(button).toBeFocused();
        await expect(button).toHaveAccessibleName(`${section.label} ${section.description}`);
        const layout = await readLayout();
        expect(layout.pageX).toBe(0);
        expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
        expect(layout.focusedLeft).toBeGreaterThanOrEqual(layout.navStart + 6);
        expect(layout.focusedRight).toBeLessThanOrEqual(layout.navRight - 6);
        measurements.push(layout);
        if (index < sections.length - 1) await page.keyboard.press('Tab');
      }
      expect(measurements.at(-1)!.navLeft).toBeGreaterThan(0);
      await page.screenshot({ path: testInfo.outputPath('workspace-last-item-focused.png'), animations: 'disabled' });
      await page.keyboard.press('Enter');
      await expect(buttons.last()).toHaveAttribute('aria-current', 'page');
      await expect(buttons.last()).toBeFocused();
      await expect(page.getByTestId('workspace-tab-overview')).not.toHaveAttribute('aria-current', 'page');
      await page.screenshot({ path: testInfo.outputPath('workspace-last-item-active.png'), animations: 'disabled' });
      await page.keyboard.press('Shift+Tab');
      await expect(buttons.nth(sections.length - 2)).toBeFocused();
      await buttons.first().focus();
      await page.keyboard.press('Enter');
      await expect(buttons.first()).toHaveAttribute('aria-current', 'page');
      const restored = await readLayout();
      expect(restored.pageX).toBe(0);
      expect(restored.documentWidth).toBeLessThanOrEqual(viewport.width);
      measurements.push(restored);
      const header = page.getByTestId('app-sticky-header');
      await expect(header).toHaveCSS('position', viewport.width >= 768 && viewport.height > 500 ? 'sticky' : 'static');
      await writeFile(testInfo.outputPath('workspace-layout.json'), JSON.stringify({ role, viewport, measurements }, null, 2));
      await page.screenshot({ path: testInfo.outputPath('workspace-overview-restored.png'), animations: 'disabled' });
    });
  }
}

test('worksheet Escape closes only the top preview and releases scrolling after the settings close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginGroupAdminDemo(page);
  const originalOverflow = await page.evaluate(() => ({ body: document.body.style.overflow, html: document.documentElement.style.overflow }));
  await seedPhrasebook(page, 'Synthetic nested worksheet');
  const books = await storageAction<Array<{ id: string; title: string }>>(page, 'getBooks');
  const book = books.find(item => item.title === 'Synthetic nested worksheet');
  expect(book).toBeTruthy();
  await page.getByTestId('workspace-tab-worksheets').click();
  const opener = page.getByRole('button', { name: '単語帳範囲からPDF問題を作る', exact: true });
  await opener.click();
  const settings = page.getByRole('dialog', { name: 'PDF問題作成', exact: true });
  await expect(settings).toBeVisible();
  await page.getByTestId('worksheet-catalog-book-select').selectOption(book!.id);
  const previewOpener = settings.getByRole('button', { name: '問題を開く', exact: true });
  await previewOpener.click();
  const preview = page.getByRole('dialog', { name: '印刷プレビュー', exact: true });
  await expect(preview).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(previewOpener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => ({ body: document.body.style.overflow, html: document.documentElement.style.overflow }))).toEqual(originalOverflow);
});

test('teacher mobile and landscape headers leave the workspace controls usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginInstructorDemo(page);
  await expect(page.getByTestId('instructor-dashboard')).toBeVisible();
  const header = page.getByTestId('app-sticky-header');
  expect((await header.boundingBox())!.height).toBeLessThan(220);
  await expect(page.getByTestId('demo-banner-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '小テスト・印刷', exact: true }).click();
  await expect(page.getByRole('heading', { name: '今日の小テストを準備する', exact: true })).toBeVisible();
  const imagePath = testInfo.outputPath('teacher-mobile.png');
  await page.screenshot({ path: imagePath });
  await testInfo.attach('teacher-mobile.png', { path: imagePath, contentType: 'image/png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(header).toHaveCSS('position', 'static');
  await page.getByRole('button', { name: '担当生徒', exact: true }).click();
  await expect(page.getByRole('heading', { name: '担当生徒を確認する', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
});

test('learner keeps the selected book identity and can leave a scrolled quiz', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginBusinessStudentDemo(page);
  const title = 'Synthetic UI context';
  await seedPhrasebook(page, title);
  const books = await storageAction<Array<{ id: string; title: string }>>(page, 'getBooks');
  const book = books.find(item => item.title === title);
  expect(book).toBeTruthy();
  await page.goto(`/quiz/${book!.id}`);
  await expect(page.getByTestId('quiz-book-label')).toHaveText(title);
  await page.locator('summary').filter({ hasText: '詳細設定' }).click();
  await page.getByRole('button', { name: '10問', exact: true }).click();
  await page.getByTestId('quiz-back-button').click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await page.goto(`/study/${book!.id}`);
  await expect(page.getByTestId('study-book-label')).toHaveText(title);
  await page.getByRole('button', { name: '学習を中断してダッシュボードに戻る', exact: true }).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
});

for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }]) {
  test(`short landscape study keeps the word clear of answer controls at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await loginBusinessStudentDemo(page);
    const title = 'Synthetic landscape study';
    await seedPhrasebook(page, title);
    const books = await storageAction<Array<{ id: string; title: string }>>(page, 'getBooks');
    const book = books.find(item => item.title === title)!;
    await page.goto(`/study/${book.id}`);
    const word = page.getByTestId('study-card-front').getByRole('heading');
    await expect(word).toHaveText('triage');
    const bar = page.locator('.mobile-sticky-action-bar');
    await expect(bar).toHaveCSS('position', 'static');
    const wordBounds = await word.boundingBox();
    const barBounds = await bar.boundingBox();
    expect(wordBounds!.y + wordBounds!.height).toBeLessThanOrEqual(barBounds!.y);
    await word.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await expect(word).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath('landscape-word-visible.png') });
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-card-back')).toBeVisible();
    await page.getByTestId('study-rate-3').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await expect(page.getByTestId('study-rate-3')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath('landscape-answer-controls.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(bar).toHaveCSS('position', 'sticky');
    await expect(page.getByTestId('study-rate-3')).toBeVisible();
    await page.getByTestId('study-rate-3').click();
    await expect(page.getByTestId('study-card-front')).toContainText('stabilize');
    const progress = await storageAction<{ learnedCount: number }>(page, 'getBookProgress', { bookId: book.id });
    expect(progress.learnedCount).toBe(1);
  });
}
