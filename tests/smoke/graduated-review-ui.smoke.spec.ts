import { writeFile } from 'node:fs/promises';
import { expect, test } from './diagnostics';
import { emailAuth, openDashboardReference, storageAction } from './smoke-support';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../../shared/naruBook';
import { createNaruChapterTask } from '../../shared/naruStudy';
import { buildTaskQueryString } from '../../shared/learningTask';
import type { BookStudyOverview, DashboardSnapshot } from '../../types';

test.skip(process.env.PLAYWRIGHT_LOCAL_SYNTHETIC_RUNTIME !== '1', 'The synthetic history fixture exists only in disposable local D1.');

for (const viewport of [
  { label: '320', width: 320, height: 568 }, { label: '390', width: 390, height: 844 },
  { label: 'landscape', width: 844, height: 390 }, { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop', width: 1366, height: 900 },
]) {
  test(`graduated review shows a bounded chapter opportunity and usable card at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await emailAuth(page, { email: `${viewport.label}@long-term-smoke.example.invalid`, password: 'local-only-staff-login', isSignUp: false });
    await page.goto('/dashboard');
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await expect(page.getByTestId('dashboard-long-term-review')).toContainText('最大5語');
    const initial = await storageAction<DashboardSnapshot>(page, 'getDashboardSnapshot');
    expect(initial.dueCount).toBe(0);
    expect(initial.longTermReviewAvailableCount).toBe(5);
    await page.getByTestId('dashboard-long-term-review').getByRole('button').click();
    await expect(page.getByTestId(`book-study-${NARU_BOOK_ID}`)).toBeVisible();
    const task = createNaruChapterTask(NARU_RANGE_PRESETS[0], 'due');
    await page.goto(`/study/${NARU_BOOK_ID}${buildTaskQueryString(task)}`);
    await expect(page.getByTestId('naru-study-setup')).toBeVisible();
    await expect(page.getByTestId('naru-study-count-due')).toContainText('0');
    await expect(page.getByTestId('naru-study-long-term-available')).toContainText('最大2語');
    await expect(page.getByTestId('naru-study-start')).toBeEnabled();
    const otherChapter = NARU_RANGE_PRESETS[2];
    await page.getByTestId(`naru-study-chapter-${otherChapter.id}`).click();
    await expect(page.getByTestId('naru-study-overview')).toBeVisible();
    await expect(page.getByTestId('naru-study-start')).toBeDisabled();
    await expect(page.getByTestId('naru-study-long-term-available')).toHaveCount(0);
    await page.getByTestId(`naru-study-chapter-${NARU_RANGE_PRESETS[0].id}`).click();
    await expect(page.getByTestId('naru-study-start')).toBeEnabled();
    await page.getByTestId('naru-study-start').click();
    await expect(page.getByTestId('study-card-front')).toBeVisible();
    await expect(page.getByTestId('study-long-term-review-badge')).toBeVisible();
    await expect(page.getByTestId('study-long-term-review-note')).toContainText('自己評価');
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-rate-0')).toBeVisible();
    const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      action: document.querySelector('[data-testid="study-rate-0"]')?.getBoundingClientRect().toJSON() }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
    expect(metrics.action?.y).toBeGreaterThanOrEqual(0);
    expect(metrics.action!.y + metrics.action!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: testInfo.outputPath(`long-term-${viewport.label}.png`), animations: 'disabled' });
    await writeFile(testInfo.outputPath('layout-metrics.json'), JSON.stringify(metrics, null, 2));
    const beforeAnswer = await storageAction<BookStudyOverview>(page, 'getBookStudyOverview', { bookId: NARU_BOOK_ID, wordRange: task.wordRange });
    expect(beforeAnswer.dueCount).toBe(0);
    expect(beforeAnswer.longTermReviewAvailableCount).toBe(3);
    // A forgotten long-term card uses the ordinary SRS receipt and re-practice.
    await page.getByTestId('study-rate-0').click();
    await expect(page.getByTestId('study-save-error')).toHaveCount(0);
    await expect(page.getByTestId('study-card-front')).toBeVisible();
    const afterAnswer = await storageAction<BookStudyOverview>(page, 'getBookStudyOverview', { bookId: NARU_BOOK_ID, wordRange: task.wordRange });
    expect(afterAnswer.dueCount).toBe(1);
    expect(afterAnswer.longTermReviewAvailableCount).toBe(3);
  });
}
