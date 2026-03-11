import { expect, test, type Page } from '@playwright/test';

const completeDiagnostic = async (page: Page) => {
  await expect(page.getByTestId('onboarding-test')).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    await page.getByTestId('diagnostic-option').first().click();
    const nextButton = index === 11
      ? page.getByRole('button', { name: '判定を見る' })
      : page.getByRole('button', { name: '次へ' });
    await nextButton.click();
  }
};

const maybeCompleteOnboarding = async (page: Page) => {
  const dashboard = page.getByTestId('student-dashboard');
  const onboarding = page.getByTestId('onboarding-profile');
  await Promise.race([
    dashboard.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
    onboarding.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
  ]);

  if (await onboarding.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /中学3年生/ }).click();
    await page.getByRole('button', { name: /学校英語はだいたい分かる/ }).click();
    await page.getByRole('button', { name: '診断を始める' }).click();
    await completeDiagnostic(page);
    await page.getByRole('button', { name: 'このレベルで学習を始める' }).click();
  }
};

test('public home shows the live motivation board before login', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('みんなの学習ライブ')).toBeVisible();
  await expect(page.getByText(/直近15分/)).toBeVisible();
  await expect(page.getByText(/いまの積み上がり/)).toBeVisible();
});

test('demo student can complete onboarding and reach the dashboard', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('demo-login-student').click();
  await expect(page.getByTestId('onboarding-profile')).toBeVisible();

  await page.getByRole('button', { name: /中学2年生/ }).click();
  await page.getByRole('button', { name: /学校英語はだいたい分かる/ }).click();
  await page.getByRole('button', { name: '診断を始める' }).click();

  await completeDiagnostic(page);

  await expect(page.getByTestId('onboarding-result')).toBeVisible();
  await page.getByRole('button', { name: 'このレベルで学習を始める' }).click();

  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await expect(page.getByText('今日やることは 1 つだけ')).toBeVisible();
});

test('group admin can open the organization dashboard and update an assignment', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '学校・先生向けの体験メニュー' }).click();
  await page.getByTestId('demo-login-group-admin').click();

  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  const assignmentSelect = page.locator('[data-testid^="assignment-select-"]').first();
  await assignmentSelect.selectOption({ index: 1 });

  await expect(page.getByText(/担当講師を .* に更新しました。/)).toBeVisible();
  await expect(page.getByTestId('assignment-history-section')).toContainText('変更者');
});

test('instructor can keep and send a fallback follow-up draft after an AI attempt', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '学校・先生向けの体験メニュー' }).click();
  await page.getByTestId('demo-login-instructor').click();

  await expect(page.getByTestId('instructor-dashboard')).toBeVisible();
  await page.locator('[data-testid^="send-notification-"]').first().click();

  await expect(page.getByTestId('notification-composer')).toBeVisible();
  const draftField = page.getByTestId('notification-message-draft');
  await expect(draftField).not.toHaveValue('');

  const aiDraftButton = page.getByRole('button', { name: 'AIで下書きを作る' });
  await aiDraftButton.click();
  await expect(aiDraftButton).toBeEnabled();
  await expect(draftField).not.toHaveValue('');

  await page.getByTestId('notification-send-submit').click();
  await expect(page.getByText(/フォロー通知を保存しました。/)).toBeVisible();
});

test('group admin and business student can complete the writing workflow with one revision', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();

  const openBusinessMenu = async (currentPage: Page) => {
    await currentPage.goto('/');
    await currentPage.getByRole('button', { name: '学校・先生向けの体験メニュー' }).click();
  };

  await openBusinessMenu(adminPage);
  await adminPage.getByTestId('demo-login-group-admin').click();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();

  await openBusinessMenu(studentPage);
  await studentPage.getByTestId('demo-login-business-student').click();
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();

  await adminPage.reload();
  await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();

  const demoStudentValue = await adminPage.getByTestId('writing-student-select').evaluate((element) => {
    const select = element as HTMLSelectElement;
    const option = Array.from(select.options).find((candidate) => candidate.text.includes('グループ生徒 Demo'));
    return option?.value || '';
  });
  expect(demoStudentValue).not.toBe('');

  await adminPage.getByTestId('writing-student-select').selectOption(demoStudentValue);
  await adminPage.getByTestId('writing-template-select').selectOption({ index: 1 });
  await adminPage.getByTestId('writing-generate-submit').click();
  await expect(adminPage.getByText(/自由英作文課題を生成しました/)).toBeVisible();
  await adminPage.getByTestId('writing-issue-assignment').click();
  await expect(adminPage.getByText(/配布状態にしました/)).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  await studentPage.locator('[data-testid^="writing-open-submit-"]').first().click();
  await studentPage.getByTestId('writing-student-file-input').setInputFiles({
    name: 'attempt-1.png',
    mimeType: 'image/png',
    buffer: Buffer.from('student-attempt-one'),
  });
  await studentPage.getByTestId('writing-submit-upload').click();
  await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

  await adminPage.reload();
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
  await studentPage.getByTestId('writing-student-file-input').setInputFiles({
    name: 'attempt-2.png',
    mimeType: 'image/png',
    buffer: Buffer.from('student-attempt-two'),
  });
  await studentPage.getByPlaceholder('OCR が読み取りにくいときのために、書いた英文をおおまかに入力できます。').fill(
    'I agree that students should use tablets because they can review lessons quickly and share ideas more easily. For example, they can check notes at home and ask better questions in class.',
  );
  await studentPage.getByTestId('writing-submit-upload').click();
  await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

  await adminPage.reload();
  await adminPage.getByRole('button', { name: '添削キュー' }).click();
  await adminPage.locator('[data-testid^="writing-review-item-"]').first().click();
  await adminPage.getByTestId('writing-review-public-comment').fill('構成が安定しました。次は語彙の幅も意識しましょう。');
  await adminPage.getByTestId('writing-approve-return').click();
  await expect(adminPage.getByText(/返却内容を確定しました。/)).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();
  await studentPage.locator('[data-testid^="writing-open-feedback-"]').first().click();
  await expect(studentPage.getByText('講師コメント')).toBeVisible();
  await expect(studentPage.getByText('訂正文例')).toBeVisible();

  await adminContext.close();
  await studentContext.close();
});
