import { expect, test } from './diagnostics';
import { MOBILE_FLOW_TEST_IDS } from './smoke-support';

test('malformed encoded book routes recover on initial load and popstate', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  for (const path of ['/study/%', '/quiz/%E0%A4%A']) {
    await page.goto(path);
    await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent)).toBeVisible();
  }
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
