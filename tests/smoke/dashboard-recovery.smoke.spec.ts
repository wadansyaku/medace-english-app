import { expect, test } from './diagnostics';
import { MOBILE_FLOW_TEST_IDS } from './smoke-support';

test('dashboard recovery keeps failed data unknown and retries without creating a book', async ({ page }) => {
  let shouldFail = true;
  let dashboardRequests = 0;
  await page.route('**/api/storage', async (route) => {
    const body = route.request().postDataJSON() as { action?: string } | null;
    if (body?.action === 'getDashboardSnapshot') {
      dashboardRequests += 1;
      if (shouldFail) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
        return;
      }
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('dashboard-load-error')).toBeVisible();
  await expect(page.getByTestId('student-dashboard')).toHaveCount(0);
  await expect(page.getByTestId('student-hero-primary-cta')).toHaveCount(0);
  await expect(page.getByTestId('phrasebook-create-modal')).toHaveCount(0);
  const failedRequestCount = dashboardRequests;

  shouldFail = false;
  await page.getByRole('button', { name: 'もう一度読み込む', exact: true }).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await expect(page.getByTestId('student-hero-primary-cta')).toBeVisible();
  await expect(page.getByTestId('dashboard-load-error')).toHaveCount(0);
  expect(dashboardRequests).toBe(failedRequestCount + 1);
  if (await page.getByTestId('dashboard-library-empty').count()) {
    await expect(page.getByTestId('dashboard-command-metrics')).toHaveCount(0);
    await expect(page.getByText('今日の進捗', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('dashboard-weakness-anchor')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-plan-anchor')).toHaveCount(0);
  }

  const evidenceDirectory = process.env.MEDACE_UI_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: `${evidenceDirectory}/ui-dashboard-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('dashboard-mobile-quick-nav')).toBeVisible();
    await page.screenshot({ path: `${evidenceDirectory}/ui-dashboard-mobile.png`, fullPage: true, animations: 'disabled' });
  }
});
