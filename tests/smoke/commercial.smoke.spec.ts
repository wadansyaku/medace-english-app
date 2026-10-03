import { attachSmokeDiagnostics, expect, test } from './diagnostics';

import {
  storageAction,
  loginAdminDemo,
  maybeCompleteOnboarding,
  openDashboardReference,
} from './smoke-support';

test('student plan panel hides intake forms while admin can approve an intake record and publish an announcement', async ({ browser }) => {
  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminPage = await adminContext.newPage();
  attachSmokeDiagnostics(studentPage, test.info(), 'commercial-student');
  attachSmokeDiagnostics(adminPage, test.info(), 'commercial-admin');
  const uniqueSuffix = Date.now();
  const contactEmail = `smoke-student-${uniqueSuffix}@example.test`;
  const announcementTitle = 'Phase 4 smoke announcement';
  const announcementBody = '受付キューの運用とお知らせ表示を更新しました。';

  await studentPage.goto('/');
  await studentPage.getByText('生徒画面の期間限定デモを見る', { exact: true }).click();
  await studentPage.getByTestId('demo-login-student').click();
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  await openDashboardReference(studentPage, 'account');
  await expect(studentPage.getByTestId('commercial-upgrade-panel')).toBeVisible();
  await expect(studentPage.locator('[data-testid="commercial-request-form"]')).toHaveCount(0);
  await storageAction(studentPage, 'submitCommercialRequest', {
    kind: 'BUSINESS_TRIAL',
    contactName: 'Smoke Student',
    contactEmail,
    organizationName: `Smoke Academy ${uniqueSuffix}`,
    teachingFormat: 'ONLINE',
    desiredStartTiming: '来月から試験運用',
    requestedWorkspaceRole: 'GROUP_ADMIN',
    seatEstimate: '31-100名',
    message: '組織アカウント発行の進め方を確認したいです。',
    source: 'SMOKE_BACKEND_INTAKE',
  });
  await studentPage.reload();
  await openDashboardReference(studentPage, 'account');
  await expect(studentPage.getByTestId('commercial-request-status-list')).toBeVisible();
  await expect(studentPage.getByTestId('commercial-request-status-list')).toContainText('受付済み');

  await loginAdminDemo(adminPage);
  await expect(adminPage.getByRole('button', { name: '受付・お知らせ' })).toBeVisible();
  await adminPage.getByRole('button', { name: '受付・お知らせ' }).click();
  const requestItem = adminPage
    .locator('[data-testid^="admin-commercial-request-"]')
    .filter({ hasText: contactEmail })
    .first();
  await expect(requestItem).toBeVisible();
  await requestItem.click();
  await adminPage.getByTestId('admin-commercial-request-status-APPROVED').click();
  await expect(requestItem).toContainText('承認済み');

  await adminPage.getByTestId('admin-announcement-title').fill(announcementTitle);
  await adminPage.getByTestId('admin-announcement-body').fill(announcementBody);
  await adminPage.getByTestId('admin-announcement-severity').selectOption('MAJOR');
  await adminPage.getByTestId('admin-announcement-submit').click();
  await expect(adminPage.getByText(announcementTitle)).toBeVisible();

  const smokeAnnouncement = (await storageAction<Array<{ id: string; title: string }>>(adminPage, 'listProductAnnouncementsAdmin'))
    .find((announcement) => announcement.title === announcementTitle);
  expect(smokeAnnouncement?.id).toBeTruthy();

  await studentPage.reload();
  await expect(studentPage.getByTestId('announcement-modal')).toBeVisible();
  await expect(studentPage.getByTestId('announcement-modal')).toContainText(announcementTitle);
  await studentPage.getByRole('button', { name: '閉じる' }).click();
  await expect(studentPage.getByTestId('announcement-modal')).toHaveCount(0);
  await openDashboardReference(studentPage, 'announcements');
  await expect(studentPage.getByTestId('dashboard-announcement-section')).toContainText(announcementTitle);

  await storageAction(adminPage, 'upsertProductAnnouncement', {
    id: smokeAnnouncement!.id,
    title: announcementTitle,
    body: announcementBody,
    severity: 'MAJOR',
    subscriptionPlans: ['TOC_FREE'],
    audienceRoles: ['STUDENT'],
    endsAt: Date.now() - 60_000,
  });

  await studentPage.reload();
  await expect(studentPage.getByTestId('announcement-modal')).toHaveCount(0);
  await openDashboardReference(studentPage, 'account');
  await expect(studentPage.getByTestId('commercial-request-status-list')).toContainText('承認済み');

  await adminContext.close();
  await studentContext.close();
});
