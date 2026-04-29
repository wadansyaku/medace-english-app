import { expect, test } from '@playwright/test';

import { loginGroupAdminDemo } from './smoke-support';

test('idb mode blocks B2B workspace clients instead of serving mock success', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByText('組織ダッシュボードとミッション機能は Cloudflare storage mode でのみ利用できます。')).toBeVisible();
  await expect(page.getByTestId('business-admin-dashboard')).toHaveCount(0);
  await expect(page.getByTestId('organization-kpi-trend-section')).toHaveCount(0);
});
