import { expect, test } from '@playwright/test';

import { loginGroupAdminDemo } from './smoke-support';

test('idb mode keeps the B2B warning banner and hides KPI trend cards', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await expect(page.getByTestId('b2b-storage-mode-banner')).toBeVisible();
  await expect(page.getByTestId('organization-kpi-trend-section')).toHaveCount(0);
});

