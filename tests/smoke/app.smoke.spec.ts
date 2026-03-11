import { expect, test, type Page } from '@playwright/test';

const mobileViewport = { width: 390, height: 844 };
const iphoneUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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

const seedPhrasebook = async (page: Page, title: string) => page.evaluate(async (bookTitle) => {
  const response = await fetch('/api/storage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'batchImportWords',
      payload: {
        defaultBookName: bookTitle,
        source: {
          kind: 'rows',
          rows: [
            { bookName: bookTitle, number: 1, word: 'triage', definition: 'トリアージ' },
            { bookName: bookTitle, number: 2, word: 'stabilize', definition: '安定させる' },
          ],
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`batchImportWords failed with status ${response.status}`);
  }

  return response.json();
}, title);

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
  await page.getByTestId('workspace-tab-assignments').click();
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
  await page.getByTestId('workspace-tab-students').click();
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
  await adminPage.getByTestId('workspace-tab-writing').click();
  await expect(adminPage.getByTestId('writing-ops-panel')).toBeVisible();

  await openBusinessMenu(studentPage);
  await studentPage.getByTestId('demo-login-business-student').click();
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();

  await adminPage.reload();
  await adminPage.getByTestId('workspace-tab-writing').click();
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
  await adminPage.getByTestId('workspace-tab-writing').click();
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

test.describe('student mobile ux', () => {
  test.use({
    viewport: mobileViewport,
    userAgent: iphoneUserAgent,
    hasTouch: true,
    isMobile: true,
  });

  test('student dashboard keeps the primary CTA inside the first viewport on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('demo-login-student').click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const primaryCta = page.getByRole('button', { name: /今日のクエストを開始|復習をもう1セットやる|学習できる教材がありません/ }).first();
    await expect(primaryCta).toBeVisible();
    const box = await primaryCta.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 1000) + (box?.height ?? 0)).toBeLessThan(844);
  });

  test('student can open a seeded phrasebook and flip a study card on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('demo-login-student').click();
    await maybeCompleteOnboarding(page);
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const importResult = await seedPhrasebook(page, 'Mobile Flip Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();

    const studyButton = page.getByTestId(`book-study-${bookId}`);
    await studyButton.scrollIntoViewIfNeeded();
    await studyButton.click();

    await expect(page.getByTestId('study-card-front')).toBeVisible();
    await expect(page.getByTestId('study-flip-button')).toBeVisible();
    await page.getByTestId('study-flip-button').click();
    await expect(page.getByTestId('study-rate-0')).toBeVisible();
    await expect(page.getByTestId('study-rate-3')).toBeVisible();
  });

  test('business student can use the mobile writing submit flow', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const studentContext = await browser.newContext({
      viewport: mobileViewport,
      userAgent: iphoneUserAgent,
      hasTouch: true,
      isMobile: true,
    });
    const adminPage = await adminContext.newPage();
    const studentPage = await studentContext.newPage();

    const openBusinessMenu = async (currentPage: Page) => {
      await currentPage.goto('/');
      await currentPage.getByRole('button', { name: '学校・先生向けの体験メニュー' }).click();
    };

    await openBusinessMenu(adminPage);
    await adminPage.getByTestId('demo-login-group-admin').click();
    await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
    await adminPage.getByTestId('workspace-tab-writing').click();

    await openBusinessMenu(studentPage);
    await studentPage.getByTestId('demo-login-business-student').click();
    await maybeCompleteOnboarding(studentPage);
    await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
    await expect(studentPage.getByTestId('writing-student-section')).toBeVisible();

    await adminPage.reload();
    await adminPage.getByTestId('workspace-tab-writing').click();

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
    await adminPage.getByRole('button', { name: /下書き/ }).first().click();
    await expect(adminPage.getByTestId('writing-issue-assignment')).toBeVisible();
    await adminPage.getByTestId('writing-issue-assignment').click();
    await expect(adminPage.getByText(/配布状態にしました/)).toBeVisible();

    await studentPage.reload();
    await studentPage.locator('[data-testid^="writing-open-submit-"]').first().click();
    await expect(studentPage.getByText('ファイル選択へ進む')).toBeVisible();
    await studentPage.getByRole('button', { name: 'ファイル選択へ進む' }).click();
    await studentPage.getByTestId('writing-student-file-input').setInputFiles({
      name: 'mobile-attempt.png',
      mimeType: 'image/png',
      buffer: Buffer.from('mobile-writing-attempt'),
    });
    await studentPage.getByRole('button', { name: '最終送信へ進む' }).click();
    await studentPage.getByPlaceholder('OCR が読み取りにくいときのために、書いた英文をおおまかに入力できます。').fill(
      'Students should use tablets because they can review notes quickly and organize homework more clearly.',
    );
    await studentPage.getByTestId('writing-submit-upload').click();
    await expect(studentPage.getByText(/答案を提出しました/)).toBeVisible();

    await adminContext.close();
    await studentContext.close();
  });
});
