import { writeFile } from 'node:fs/promises';
import { BUSINESS_ADMIN_WORKSPACE_SECTIONS, INSTRUCTOR_WORKSPACE_SECTIONS } from '../../config/workspace';
import { expect, test } from './diagnostics';
import { loginBusinessStudentDemo, loginGroupAdminDemo, loginInstructorDemo, seedPhrasebook, storageAction } from './smoke-support';

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
