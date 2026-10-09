import { writeFile } from 'node:fs/promises';
import { BUSINESS_ADMIN_WORKSPACE_SECTIONS, INSTRUCTOR_WORKSPACE_SECTIONS } from '../../config/workspace';
import { BRAND } from '../../config/brand';
import { expect, test } from './diagnostics';
import { installPronunciation, readPronunciation } from './pronunciation-support';
import { loginAdminDemo, loginBusinessStudentDemo, loginGroupAdminDemo, loginInstructorDemo, openDashboardReference, seedPhrasebook, storageAction } from './smoke-support';

for (const role of ['student'] as const) {
  for (const width of [320, 390]) {
    test(`catalog actions keep Japanese labels readable for ${role} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await loginBusinessStudentDemo(page);
      const header = page.getByTestId('app-sticky-header');
      await expect(header).toContainText(BRAND.officialName);
      await expect(header).toContainText(BRAND.productLabel);
      await expect(header).not.toContainText(/MedAse|メッドエース/);
      const title = `Synthetic catalog actions ${width}`;
      await seedPhrasebook(page, title);
      const books = await storageAction<Array<{ id: string; title: string; catalogSource: string }>>(page, 'getBooks');
      const book = books.find(item => item.title === title);
      expect(book).toBeTruthy();
      await page.reload();
      await openDashboardReference(page, 'library');
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
      await expect(page.getByTestId('study-book-label')).toHaveText(`${book!.title} / 教材学習`);
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
      const appHeader = page.getByTestId('app-sticky-header');
      await expect(appHeader).toContainText(BRAND.officialName);
      await expect(appHeader).toContainText(BRAND.productLabel);
      await expect(appHeader).not.toContainText(/MedAse|メッドエース/);
      const sections = role === 'instructor' ? INSTRUCTOR_WORKSPACE_SECTIONS : BUSINESS_ADMIN_WORKSPACE_SECTIONS;
      const expectReadableInstructorHeader = async () => {
        if (role !== 'instructor') return;
        const header = page.getByTestId('instructor-dashboard').locator(':scope > header');
        const heading = header.getByRole('heading', { level: 2 });
        const bounds = await heading.evaluate(element => {
          const title = element.getBoundingClientRect();
          const frame = element.closest('header')!.getBoundingClientRect();
          const actions = element.closest('header')!.children[1].getBoundingClientRect();
          return { title: title.toJSON(), frame: frame.toJSON(), actions: actions.toJSON(), lineHeight: parseFloat(getComputedStyle(element).lineHeight) };
        });
        // Title and context must retain readable lines after changing tabs,
        // while the refresh/FAQ controls remain separately reachable.
        expect(bounds.title.width).toBeGreaterThanOrEqual(Math.min(260, bounds.frame.width - 8));
        expect(bounds.title.height).toBeLessThanOrEqual(bounds.lineHeight * 3);
        if (viewport.width < 640) expect(bounds.actions.top).toBeGreaterThanOrEqual(bounds.title.bottom);
      };
      await expectReadableInstructorHeader();
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
      await expectReadableInstructorHeader();
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
  const overview = page.getByTestId('instructor-action-overview');
  await expect(overview).toBeVisible();
  await expect(overview.getByRole('heading')).toHaveCount(2);
  await expect(overview.getByRole('heading', { name: '対応が必要な生徒' })).toBeVisible();
  await expect(overview.getByRole('heading', { name: '提出・返却' })).toBeVisible();
  await expect(overview.getByRole('button', { name: '閲覧できる生徒すべて', exact: true })).toBeVisible();
  await expect(page.getByTestId('instructor-dashboard').getByRole('button', { name: '更新', exact: true })).toBeVisible();
  const header = page.getByTestId('app-sticky-header');
  expect((await header.boundingBox())!.height).toBeLessThan(220);
  await expect(page.getByTestId('demo-banner-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('navigation', { name: '講師の作業', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid^="workspace-tab-"]')).toHaveCount(INSTRUCTOR_WORKSPACE_SECTIONS.length);
  await page.getByTestId('workspace-tab-worksheets').click();
  await expect(page.getByRole('heading', { name: '今日の小テストを準備する', exact: true })).toBeVisible();
  const imagePath = testInfo.outputPath('teacher-mobile.png');
  await page.screenshot({ path: imagePath });
  await testInfo.attach('teacher-mobile.png', { path: imagePath, contentType: 'image/png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(header).toHaveCSS('position', 'static');
  await page.getByTestId('workspace-tab-students').click();
  await expect(page.getByRole('heading', { name: '担当生徒を確認する', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
  const viewHeadings = [
    ['overview', '今日の対応を確認する'],
    ['students', '担当生徒を確認する'],
    ['writing', '課題を配り、提出へ返す'],
    ['worksheets', '今日の小テストを準備する'],
    ['catalog', '教材と学習画面を確認する'],
  ] as const;
  for (const [view, title] of viewHeadings) {
    const tab = page.getByTestId(`workspace-tab-${view}`);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('instructor-dashboard').getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '講師の作業', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
  }
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
  await expect(page.getByTestId('study-book-label')).toHaveText(`${title} / 教材学習`);
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
    const bar = page.locator('.study-actions');
    await expect(bar).toHaveCSS('position', 'static');
    const wordBounds = await word.boundingBox();
    const barBounds = await bar.boundingBox();
    expect(wordBounds!.y + wordBounds!.height).toBeLessThanOrEqual(barBounds!.y);
    await expect(word).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('study-flip-button')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath('landscape-word-visible.png') });
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-card-back')).toBeVisible();
    await expect(page.getByTestId('study-rate-3')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath('landscape-answer-controls.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(bar).toHaveCSS('position', 'static');
    await expect(page.getByTestId('study-rate-3')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('study-rate-3')).toBeVisible();
    await page.getByTestId('study-rate-3').click();
    await expect(page.getByTestId('study-card-front')).toContainText('stabilize');
    const progress = await storageAction<{ learnedCount: number }>(page, 'getBookProgress', { bookId: book.id });
    expect(progress.learnedCount).toBe(1);
  });
}


for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }]) {
  test(`short landscape study keeps pronunciation failures and the word readable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await installPronunciation(page, { blocked: true });
    await loginBusinessStudentDemo(page);
    const title = `Synthetic pronunciation failure ${viewport.width}`;
    await seedPhrasebook(page, title);
    const books = await storageAction<Array<{ id: string; title: string }>>(page, 'getBooks');
    const book = books.find(item => item.title === title)!;
    await page.goto(`/study/${book.id}`);
    const front = page.getByTestId('study-card-front');
    const word = front.getByRole('heading');
    await expect(word).toHaveText('triage');
    await expect(front).toContainText('「発音を聞く」を押して再生してください。');
    await expect.poll(async () => (await readPronunciation(page)).spoken.length).toBe(1);
    const verifyReadable = async (state: string) => {
      await page.screenshot({ path: testInfo.outputPath(`landscape-pronunciation-${state}.png`) });
      await expect(word).toBeInViewport({ ratio: 1 });
      await expect(front.getByRole('status')).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('study-flip-button')).toBeInViewport({ ratio: 1 });
      for (const name of ['発音を聞く', '音声をオフにする']) {
        const control = front.getByRole('button', { name, exact: true });
        await expect(control).toBeInViewport({ ratio: 1 });
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const layout = await word.evaluate(element => {
        const wordRect = element.getBoundingClientRect();
        const cardRect = element.closest('[data-testid="study-card-front"]')!.getBoundingClientRect();
        return { top: wordRect.top, bottom: wordRect.bottom, cardTop: cardRect.top, cardBottom: cardRect.bottom };
      });
      expect(layout.top).toBeGreaterThanOrEqual(layout.cardTop);
      expect(layout.bottom).toBeLessThanOrEqual(layout.cardBottom);
    };
    await verifyReadable('blocked');
    await page.evaluate(() => { (window as any).__pronunciationFixture.mode = 'error'; });
    await front.getByRole('button', { name: '発音を聞く', exact: true }).click();
    await expect(front).toContainText('発音を開始できませんでした');
    await expect.poll(async () => (await readPronunciation(page)).spoken.length).toBe(2);
    await verifyReadable('failed');
    await page.setViewportSize({ width: viewport.width + 1, height: viewport.height });
    expect((await readPronunciation(page)).spoken).toHaveLength(2);
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-rate-3')).toBeInViewport({ ratio: 1 });
  });
}

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 768, height: 1024 }, { width: 1366, height: 900 },
]) {
  test(`service-admin keeps trend overflow internal and keyboard scroll reachable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    // Layout fixture only: retain the actual ADMIN authorization/status and all
    // other snapshot fields. This creates no provider request or paid ledger row.
    const syntheticTitle = 'SyntheticAdministrationVocabularyCollectionWithoutSpaces原文を全文表示';
    let fixtureResponses = 0;
    await page.route('**/api/storage', async route => {
      const request = route.request().postDataJSON();
      if (request?.action !== 'getAdminDashboardSnapshot') { await route.continue(); return; }
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const snapshot = await response.json();
      expect(Array.isArray(snapshot.topBooks)).toBe(true);
      expect(Array.isArray(snapshot.aiActions)).toBe(true);
      fixtureResponses += 1;
      await route.fulfill({ response, json: { ...snapshot,
        trend: snapshot.trend.map((point, index) => index === 0
          ? { ...point, studiedWords: 123456789, activeStudents: 12345678, notifications: 1234567 }
          : point),
        topBooks: [...snapshot.topBooks, { bookId: 'synthetic-layout-only', title: syntheticTitle,
          wordCount: 1531, learnerCount: 123, learnedEntries: 123456, averageProgress: 54, isOfficial: false }],
        aiActions: [...snapshot.aiActions, { action: 'evaluateWritingSubmissionLayoutFixture',
          label: '自由英作文添削（合成レイアウト確認）', requestCount: 2, estimatedCostMilliYen: 2000 }],
      } });
    });
    await loginAdminDemo(page);
    await expect(page.getByText(syntheticTitle, { exact: true })).toBeVisible();
    await expect(page.getByText('自由英作文添削（合成レイアウト確認）', { exact: true })).toBeVisible();
    expect(fixtureResponses).toBeGreaterThan(0);
    const section = page.getByTestId('admin-trend-section');
    const scroller = page.getByTestId('admin-trend-scroll');
    const plot = page.getByTestId('admin-trend-plot');
    await expect(section.getByRole('heading', { name: '直近14日間の推移', exact: true })).toBeVisible();
    await expect(scroller).toHaveAttribute('tabindex', '0');
    const originalText = await plot.textContent();
    expect(originalText).toMatch(/学習.*人.*通知/s);
    expect(originalText).toContain('123456789');
    const labelRows = plot.locator(':scope > div > div:last-child > div');
    await expect(labelRows).toHaveCount(42);
    const labelGeometry = await labelRows.evaluateAll(elements => elements.map(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = element.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0);
      return { text: element.textContent, lines: new Set(rects.map(rect => Math.round(rect.y))).size,
        contained: rects.every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1) };
    }));
    expect(labelGeometry.every(row => row.lines === 1), JSON.stringify(labelGeometry)).toBe(true);
    expect(labelGeometry.every(row => row.contained), JSON.stringify(labelGeometry)).toBe(true);
    const measure = () => scroller.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
        viewport: innerWidth, left: rect.left, right: rect.right, clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth, scrollLeft: element.scrollLeft, overflowX: getComputedStyle(element).overflowX };
    });
    await scroller.scrollIntoViewIfNeeded();
    const before = await measure();
    const overflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= innerWidth || getComputedStyle(element).position === 'fixed') return [];
      const ancestor = element.closest('[data-testid="admin-trend-scroll"]');
      if (ancestor && element !== ancestor) return [];
      return [{ tag: element.tagName, testId: element.dataset.testid, className: element.className,
        left: rect.left, right: rect.right, width: rect.width, text: element.innerText?.slice(0, 140) }];
    }));
    await writeFile(testInfo.outputPath('service-admin-overflow-diagnostics.json'), JSON.stringify({ viewport, before, overflow }, null, 2));
    expect(before.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(before.bodyWidth).toBeLessThanOrEqual(viewport.width);
    expect(before.left).toBeGreaterThanOrEqual(0);
    expect(before.right).toBeLessThanOrEqual(viewport.width);
    expect(before.overflowX).toBe('auto');
    expect(await plot.locator(':scope > div').count()).toBe(14);
    await scroller.focus();
    await expect(scroller).toBeFocused();
    if (before.scrollWidth > before.clientWidth) {
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBe(0);
    }
    await expect(scroller).toBeFocused();
    expect(await plot.textContent()).toBe(originalText);
    const after = await measure();
    expect(after.documentWidth).toBeLessThanOrEqual(viewport.width);
    await writeFile(testInfo.outputPath('service-admin-trend-layout.json'), JSON.stringify({ viewport, before, after, originalText }, null, 2));
    await page.screenshot({ path: testInfo.outputPath('service-admin-trend.png') });
  });
}
