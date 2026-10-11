import { exposeStudentDemo } from './smoke-support';
import { expect, test } from './diagnostics';
import { MOBILE_FLOW_TEST_IDS } from './smoke-support';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../../shared/naruBook';
import { createNaruChapterTask } from '../../shared/naruStudy';
import { buildTaskQueryString } from '../../shared/learningTask';

test('malformed encoded book routes recover on initial load and popstate', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  for (const path of ['/study/%', '/quiz/%E0%A4%A']) {
    await page.goto(path);
    await expect(page.getByTestId('start-first-guest')).toBeVisible();
  }
  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  for (const path of ['/study/%', '/quiz/%E0%A4%A']) {
    await page.evaluate(next => {
      window.history.pushState({}, '', next);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    // Popstate intentionally preserves the browser's location. Verify that
    // parsing an invalid ID keeps a safe screen and subsequent valid routes
    // still work, rather than requiring a new redirect policy.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/english-practice/grammar');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('english-practice-hub')).toBeVisible();
    await expect(page).toHaveURL(/\/english-practice\/grammar$/);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  expect(pageErrors).toEqual([]);
});

test('reselecting the current chapter or study kind preserves Back and only a real start adds history', async ({ page }) => {
  await page.goto('/');
  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await page.goto('/dashboard');
  const chapter = NARU_RANGE_PRESETS[0];
  const setupPath = `/study/${NARU_BOOK_ID}${buildTaskQueryString(createNaruChapterTask(chapter, 'new'))}`;
  await page.goto(setupPath);
  await expect(page.getByTestId('naru-study-overview')).toBeVisible();
  const starts: string[] = [];
  page.on('request', request => {
    if (!request.url().includes('/api/storage') || request.method() !== 'POST') return;
    const body = request.postDataJSON();
    if (body?.action === 'getBookSession') starts.push(body.payload.clientSessionId);
  });
  const before = await page.evaluate(() => ({ length: history.length, url: location.href }));
  for (const id of [`naru-study-chapter-${chapter.id}`, 'naru-study-kind-new', `naru-study-chapter-${chapter.id}`, 'naru-study-kind-new']) {
    await page.getByTestId(id).click();
    // Wait for the navigation effect, not just the already-selected button.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => ({ length: history.length, url: location.href }))).toEqual(before);
  }
  expect(starts).toEqual([]);
  await page.getByTestId(`naru-study-chapter-${NARU_RANGE_PRESETS[2].id}`).click();
  await expect(page.getByTestId(`naru-study-chapter-${NARU_RANGE_PRESETS[2].id}`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => history.length)).toBe(before.length + 1);
  await page.goBack();
  await expect(page.getByTestId(`naru-study-chapter-${chapter.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(before.url);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId('naru-study-setup')).toBeVisible();
  await expect(page.getByTestId('naru-study-start')).toBeEnabled();
  await page.getByTestId('naru-study-start').click();
  await expect(page.getByTestId('study-card-front')).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(starts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(await page.evaluate(() => history.length)).toBe(before.length + 1);
  await page.goBack();
  await expect(page.getByTestId('naru-study-setup')).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId('study-card-front')).toBeVisible();
  expect(starts).toHaveLength(2);
  expect(starts[1]).toBe(starts[0]);
});
