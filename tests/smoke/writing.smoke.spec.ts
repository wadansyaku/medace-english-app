import { expect, test } from '@playwright/test';

import {
  MOBILE_FLOW_TEST_IDS,
  MOBILE_FLOW_WRITING,
  getCurrentSessionUser,
  getLatestWritingAssignmentForStudentUid,
  loginBusinessStudentDemo,
  loginGroupAdminDemo,
  maybeCompleteOnboarding,
  resolveWritingStudentSelectValue,
  runtimeAdminPost,
  storageAction,
  toUploadBuffer,
  waitForWritingAssignment,
} from './smoke-support';

test('group admin and business student can complete the writing workflow with one revision', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  const bootstrap = await runtimeAdminPost<{ studentUid: string }>(adminPage, 'runtime-admin/bootstrap-demo-organization');
  await storageAction(adminPage, 'sendInstructorNotification', {
    studentUid: bootstrap.studentUid,
    message: '導入確認のため、最初のフォロー通知を送ります。',
    triggerReason: 'smoke-writing-bootstrap',
    usedAi: false,
    interventionKind: 'REVIEW_RESTART',
  });
  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  const businessStudent = await getCurrentSessionUser(studentPage);
  expect(businessStudent?.uid).toBeTruthy();

  await adminPage.reload();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();

  const selectedStudentUid = await resolveWritingStudentSelectValue(adminPage, businessStudent, {
    timeoutMs: 10_000,
    onRetry: async () => {
      await adminPage.reload();
      await adminPage.getByTestId('workspace-tab-writing').click();
      await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();
    },
  });
  await adminPage.getByTestId('writing-student-select').selectOption(selectedStudentUid);
  await adminPage.getByTestId('writing-template-select').selectOption({ index: 1 });
  await adminPage.getByTestId('writing-generate-submit').click();
  await expect(adminPage.getByText(/自由英作文課題を生成しました/)).toBeVisible();
  const generatedAssignment = await getLatestWritingAssignmentForStudentUid(adminPage, 'all', selectedStudentUid, 'DRAFT');
  expect(generatedAssignment?.id).toBeTruthy();
  await adminPage.getByRole('button', { name: new RegExp(generatedAssignment.submissionCode) }).click();
  await expect(adminPage.getByTestId('writing-issue-assignment')).toBeVisible();
  await adminPage.getByTestId('writing-issue-assignment').click();
  await expect(adminPage.getByText(/配布状態にしました/)).toBeVisible();
  await waitForWritingAssignment(adminPage, 'all', generatedAssignment.id, ['ISSUED']);
  await expect(studentPage.getByTestId('writing-refresh-button')).toBeEnabled();
  await studentPage.getByTestId('writing-refresh-button').click();
  await waitForWritingAssignment(studentPage, 'mine', generatedAssignment.id, ['ISSUED']);
  await expect(studentPage.getByTestId(`writing-open-submit-${generatedAssignment.id}`)).toBeVisible();
  await studentPage.getByTestId(`writing-open-submit-${generatedAssignment.id}`).click();
  await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles([
    {
      name: 'attempt-1.pdf',
      mimeType: 'application/pdf',
      buffer: toUploadBuffer('student-attempt-one-pdf'),
    },
    {
      name: 'attempt-1.png',
      mimeType: 'image/png',
      buffer: toUploadBuffer('student-attempt-one-image'),
    },
  ]);
  await expect(studentPage.getByTestId('writing-file-validation-message')).toContainText('PDF と画像は混在できません');
  await expect(studentPage.getByTestId('writing-submit-upload')).toBeDisabled();
  await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles({
    name: 'attempt-1.png',
    mimeType: 'image/png',
    buffer: toUploadBuffer('student-attempt-one'),
  });
  await studentPage.getByTestId('writing-submit-upload').click();
  await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

  await adminPage.reload();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await adminPage.getByRole('button', { name: '添削キュー' }).click();
  await expect(adminPage.getByTestId('writing-review-queue')).toBeVisible();
  await adminPage.locator('[data-testid^="writing-review-item-"]').first().click();
  await expect(adminPage.getByTestId('writing-review-public-comment')).toBeVisible();
  await adminPage.getByTestId('writing-review-public-comment').fill('理由のつながりを整えて、もう一度書き直しましょう。');
  await adminPage.getByRole('button', { name: '再提出を依頼' }).click();
  await expect(adminPage.getByText(/再提出依頼を保存しました。/)).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  await studentPage.locator('[data-testid^="writing-open-submit-"]').first().click();
  await studentPage.getByTestId(MOBILE_FLOW_TEST_IDS.writingStudentFileInput).setInputFiles({
    name: 'attempt-2.png',
    mimeType: 'image/png',
    buffer: toUploadBuffer('student-attempt-two'),
  });
  await studentPage.getByPlaceholder(MOBILE_FLOW_WRITING.transcriptPlaceholder).fill(
    'I agree that students should use tablets because they can review lessons quickly and share ideas more easily. For example, they can check notes at home and ask better questions in class.',
  );
  await studentPage.getByTestId('writing-submit-upload').click();
  await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

  await adminPage.reload();
  await adminPage.getByTestId('workspace-tab-writing').click();
  await adminPage.getByRole('button', { name: '添削キュー' }).click();
  await adminPage.locator('[data-testid^="writing-review-item-"]').first().click();
  await adminPage.getByTestId('writing-review-public-comment').fill('構成が安定しました。次は語彙の幅も意識しましょう。');
  await adminPage.getByTestId('writing-approve-return').click();
  await expect(adminPage.getByText(/返却内容を確定しました。/)).toBeVisible();
  await adminPage.getByRole('button', { name: '返却履歴' }).click();
  await expect(adminPage.locator('[data-testid^="writing-review-item-"]').first()).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  await studentPage.locator('[data-testid^="writing-open-feedback-"]').first().click();
  await expect(studentPage.getByTestId('writing-feedback-comment')).toBeVisible();
  await expect(studentPage.getByText('訂正文例', { exact: true })).toBeVisible();

  await adminContext.close();
  await studentContext.close();
});
