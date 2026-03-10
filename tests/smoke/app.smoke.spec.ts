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
