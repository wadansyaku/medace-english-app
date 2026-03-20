import { expect, test } from '@playwright/test';

import {
  storageAction,
  loginAdminDemo,
  maybeCompleteOnboarding,
} from './smoke-support';

test('student can submit an upgrade request and admin can approve it with a one-time major announcement', async ({ browser }) => {
  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminPage = await adminContext.newPage();
  const announcementTitle = 'Phase 4 smoke announcement';
  const announcementBody = '導入相談の動線とお知らせ表示を追加しました。';

  await studentPage.goto('/');
  await studentPage.getByTestId('demo-login-student').click();
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  await studentPage.getByRole('button', { name: /プラン・学習環境の詳細/ }).click();
  await expect(studentPage.getByTestId('commercial-upgrade-panel')).toBeVisible();
  await studentPage.locator('[data-testid="commercial-request-form"] textarea').fill('学校・教室向けの導入相談と上位プランの違いを知りたいです。');
  await studentPage.getByTestId('commercial-request-submit').click();
  await expect(studentPage.getByTestId('commercial-request-status-list')).toBeVisible();
  await expect(studentPage.getByTestId('commercial-request-status-list')).toContainText('受付済み');

  await loginAdminDemo(adminPage);
  await expect(adminPage.getByRole('button', { name: '導入・お知らせ' })).toBeVisible();
  await adminPage.getByRole('button', { name: '導入・お知らせ' }).click();
  const requestItem = adminPage.locator('[data-testid^="admin-commercial-request-"]').first();
  await expect(requestItem).toBeVisible();
  await requestItem.click();
  await adminPage.getByRole('button', { name: '承認済み' }).click();
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
  await studentPage.getByRole('button', { name: /プラン・学習環境の詳細/ }).click();
  await expect(studentPage.getByTestId('commercial-request-status-list')).toContainText('承認済み');

  await adminContext.close();
  await studentContext.close();
});
