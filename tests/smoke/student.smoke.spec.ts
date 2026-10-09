import { exposeStudentDemo } from './smoke-support';
import { formatDateKey } from '../../utils/date';
import { ORIGINAL_TRANSLATION_QUESTIONS } from '../../config/translationQuestionBank';
import { attachSmokeDiagnostics, expect, test } from './diagnostics';

import {
  MOBILE_FLOW_TEST_IDS,
  findUnexpectedHorizontalOverflow,
  finishStudySession,
  getCurrentSessionUser,
  loginBusinessStudentDemo,
  loginGroupAdminDemo,
  maybeCompleteOnboarding,
  openDashboardReference,
  openDashboardTaskDetails,
  seedPhrasebook,
  storageAction,
  updateSessionProfile,
} from './smoke-support';

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 },
]) {
  test(`Japanese chip ordering keeps unknown order editable and accepts a reviewed natural order at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await exposeStudentDemo(page);
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    await updateSessionProfile(page, { englishLevel: 'A1' });
    const attempts: any[] = [];
    page.on('request', request => {
      if (!request.url().includes('/api/storage') || request.method() !== 'POST') return;
      const body = request.postDataJSON();
      if (body.action === 'recordEnglishPracticeAttempt') attempts.push(body.payload);
    });
    await page.goto('/english-practice/translation');
    await page.getByRole('button', { name: '訳の骨組みを並べる', exact: true }).click();
    const question = page.getByTestId('translation-practice-question');
    await expect(question).toHaveCount(1);
    const id = await question.getAttribute('data-question-id');
    const source = ORIGINAL_TRANSLATION_QUESTIONS.find(item => item.id === id)!;
    expect(source.alternateOrders.length).toBeGreaterThan(0);
    for (const chunk of [...source.orderChunks].reverse()) await question.getByRole('button', { name: chunk, exact: true }).click();
    await question.getByRole('button', { name: '判定する', exact: true }).click();
    const notice = question.getByTestId('translation-order-assessment-notice');
    await expect(notice).toContainText('未登録の並び・未採点');
    await expect(notice).toContainText('点数・誤答履歴には保存していません');
    await expect(question.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
    await expect(question.getByRole('button', { name: source.orderChunks[0], exact: true })).toBeEnabled();
    expect(attempts).toEqual([]);
    await question.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(question).toContainText(source.referenceTranslation);
    expect(await findUnexpectedHorizontalOverflow(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`translation-order-unassessed-${viewport.width}.png`), fullPage: true });
    await question.getByRole('button', { name: '並びをクリア', exact: true }).click();
    await expect(notice).toHaveCount(0);
    for (const index of source.alternateOrders[0]) await question.getByRole('button', { name: source.orderChunks[index], exact: true }).click();
    await question.getByRole('button', { name: '判定する', exact: true }).evaluate(button => {
      (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
    });
    await expect(question.getByText('正解', { exact: true })).toBeVisible();
    await expect.poll(() => attempts.length).toBe(1);
    expect(attempts[0]).toMatchObject({ lane: 'translation', correct: true });
    expect(attempts[0].wordId).toBeUndefined();
    expect(attempts[0].bookId).toBeUndefined();
    await page.screenshot({ path: testInfo.outputPath(`translation-order-correct-${viewport.width}.png`), fullPage: true });
    await question.getByRole('button', { name: '別の和訳問題へ', exact: true }).click();
    await page.getByRole('button', { name: '前の問題を確認', exact: true }).click();
    await expect(question).toHaveAttribute('data-question-id', source.id);
    await expect(question.getByText('正解', { exact: true })).toBeVisible();
    expect(attempts).toHaveLength(1);
  });

  test(`material Japanese chip ordering never saves an unknown order and accepts a registered order at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await exposeStudentDemo(page);
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    const source = ORIGINAL_TRANSLATION_QUESTIONS.find(item => item.id.endsWith('-clock-time-01'))!;
    const title = `Synthetic Translation Order ${viewport.width}`;
    const imported = await storageAction<{ importedBookIds: string[] }>(page, 'batchImportWords', {
      defaultBookName: title,
      source: { kind: 'rows', rows: [{ bookName: title, number: 1, word: 'library', definition: '図書館',
        exampleSentence: source.sourceSentence, exampleMeaning: source.orderChunks.join(' ') }] },
    });
    const attempts: any[] = [];
    page.on('request', request => {
      if (!request.url().includes('/api/storage') || request.method() !== 'POST') return;
      const body = request.postDataJSON();
      if (body.action === 'recordQuizAttempt') attempts.push(body.payload);
    });
    await page.goto(`/quiz/${imported.importedBookIds[0]}`);
    await expect(page.getByTestId('quiz-setup-view')).toBeVisible();
    await page.locator('summary').filter({ hasText: '詳細設定' }).click();
    await page.getByTestId('quiz-direction-ja_translation_order').click();
    await page.getByTestId('quiz-setup-primary-cta').click();
    const quiz = page.getByTestId('quiz-running-view');
    await expect(quiz).toBeVisible();
    await expect(quiz).toContainText(source.sourceSentence);
    const chunks = source.orderChunks.map(chunk => chunk.replace(/。$/, ''));
    for (const index of [0, 2, 1]) await quiz.getByRole('button', { name: chunks[index], exact: true }).click();
    await quiz.getByTestId('quiz-order-submit').click();
    await expect(quiz.getByTestId('quiz-order-unassessed')).toContainText('未登録の並び・未採点');
    await expect(quiz.getByTestId('quiz-order-unassessed')).toContainText('点数・誤答履歴には保存していません');
    await expect(quiz.getByTestId('quiz-order-submit')).toBeDisabled();
    await expect(quiz.getByRole('button', { name: 'やり直す', exact: true })).toBeEnabled();
    expect(attempts).toEqual([]);
    const review = quiz.getByTestId('translation-unassessed-review');
    await review.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(review).toContainText(chunks.join(' '));
    expect(await findUnexpectedHorizontalOverflow(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`material-order-unassessed-${viewport.width}.png`), fullPage: true });
    await quiz.getByRole('button', { name: 'やり直す', exact: true }).click();
    await expect(quiz.getByTestId('quiz-order-unassessed')).toHaveCount(0);
    for (const index of source.alternateOrders[0]) await quiz.getByRole('button', { name: chunks[index], exact: true }).click();
    await quiz.getByTestId('quiz-order-submit').evaluate(button => {
      (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
    });
    await expect.poll(() => attempts.length).toBe(1);
    expect(attempts[0]).toMatchObject({ bookId: imported.importedBookIds[0], correct: true, questionMode: 'JA_TRANSLATION_ORDER' });
    await expect(quiz.getByText('正解です', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`material-order-correct-${viewport.width}.png`) });
    await expect(page.getByTestId('quiz-result-view')).toBeVisible();
    expect(attempts).toHaveLength(1);
  });

  test(`reviewed translation keeps unknown answers unassessed in the actual app at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await exposeStudentDemo(page);
    await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
    await expect(page.getByTestId('student-dashboard')).toBeVisible();
    const attempts: any[] = [];
    const aiRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/ai')) aiRequests.push(request.url());
      if (request.url().includes('/api/storage') && request.method() === 'POST') {
        const body = request.postDataJSON();
        if (body.action === 'recordEnglishPracticeAttempt') attempts.push(body.payload);
      }
    });
    await page.goto('/english-practice/translation');
    const question = page.getByTestId('translation-practice-question');
    await expect(question).toHaveCount(1);
    const id = await question.getAttribute('data-question-id');
    const source = ORIGINAL_TRANSLATION_QUESTIONS.find(item => item.id === id)!;
    expect(source).toBeTruthy();
    await expect(question).toContainText(source.sourceSentence);
    await expect(question).not.toContainText(source.referenceTranslation);
    await expect(question.getByTestId('english-practice-translation-feedback-card')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    const initialScreenshot = testInfo.outputPath(`translation-question-before-answer-${viewport.width}.png`);
    await page.screenshot({ path: initialScreenshot, fullPage: true });
    await testInfo.attach('translation-question-before-answer', { path: initialScreenshot, contentType: 'image/png' });
    const input = question.getByRole('textbox');
    const unknown = 'この答案は未確認の別表現です。';
    await input.fill(unknown);
    await question.getByRole('button', { name: '答案チェック', exact: true }).click();
    const notice = question.getByTestId('translation-assessment-notice');
    await expect(notice).toContainText('未採点');
    await expect(notice).toContainText('点数・誤答履歴には保存していません');
    await expect(input).toHaveValue(unknown);
    await expect(question.getByRole('button', { name: '修正した訳を確認', exact: true })).toBeDisabled();
    await expect(notice).toContainText('未登録の別訳');
    await expect(notice).toContainText('同じ入力では判定は変わりません');
    await question.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue(unknown);
    expect(attempts).toEqual([]);
    await question.getByRole('button', { name: '別の和訳問題へ', exact: true }).click();
    await expect(question).not.toHaveAttribute('data-question-id', source.id);
    await page.getByRole('button', { name: '前の問題を確認', exact: true }).click();
    await expect(question).toHaveAttribute('data-question-id', source.id);
    await expect(input).toHaveValue(unknown);
    await expect(notice).toContainText('未採点');
    await input.fill(source.acceptedTranslations[0]);
    await question.getByRole('button', { name: '修正した訳を確認', exact: true }).click();
    await expect(question.getByTestId('english-practice-translation-feedback-card')).toContainText('10 / 10');
    await expect.poll(() => attempts.length).toBe(1);
    expect(attempts[0]).toMatchObject({ lane: 'translation', correct: true });
    expect(attempts[0].wordId).toBeUndefined();
    expect(attempts[0].bookId).toBeUndefined();
    expect(aiRequests).toEqual([]);
    expect(await findUnexpectedHorizontalOverflow(page)).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    const screenshot = testInfo.outputPath(`reviewed-translation-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('reviewed-translation-actual-app', { path: screenshot, contentType: 'image/png' });
    await question.getByRole('button', { name: '次の和訳へ', exact: true }).click();
    await page.getByRole('button', { name: '前の問題を確認', exact: true }).click();
    await expect(input).toHaveValue(source.acceptedTranslations[0]);
    await expect(question.getByTestId('english-practice-translation-feedback-card')).toContainText('10 / 10');
    expect(attempts).toHaveLength(1);
  });
}

test('reviewed translation retries the same saved payload after a failed cloud response', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  const requests: any[] = [];
  let releaseRetry!: () => void;
  const heldRetry = new Promise<void>(resolve => { releaseRetry = resolve; });
  await page.route('**/api/storage', async route => {
    const body = route.request().postDataJSON();
    if (body.action !== 'recordEnglishPracticeAttempt') return route.continue();
    requests.push(body.payload);
    if (requests.length === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic response unavailable' }) });
    if (requests.length === 2) await heldRetry;
    return route.continue();
  });
  await page.goto('/english-practice/translation');
  const question = page.getByTestId('translation-practice-question');
  await expect(question).toHaveCount(1);
  const id = await question.getAttribute('data-question-id');
  const source = ORIGINAL_TRANSLATION_QUESTIONS.find(item => item.id === id)!;
  await question.getByRole('textbox').fill(source.acceptedTranslations[0]);
  await question.getByRole('button', { name: '答案チェック', exact: true }).click();
  const notice = page.getByTestId('english-practice-save-error');
  await expect(notice).toContainText('保存できませんでした');
  await page.getByTestId('english-practice-save-retry').evaluate(button => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
  });
  await expect.poll(() => requests.length).toBe(2);
  await expect(notice).toContainText('同じ回答で保存と進捗を再確認しています');
  await expect(page.getByTestId('english-practice-save-retry')).toBeDisabled();
  expect(requests[1]).toEqual(requests[0]);
  releaseRetry();
  await expect(notice).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await page.reload();
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByTestId('english-practice-save-error')).toHaveCount(0);
  expect(requests).toHaveLength(2);
});

test('demo student can start immediately without onboarding and reach the dashboard', async ({ page }) => {
  await page.goto('/');

  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await expect(page.getByTestId('onboarding-profile')).toHaveCount(0);
  await expect(page.getByText('今日やること')).toBeVisible();
  await expect(page.getByTestId('dashboard-english-practice-entry')).toHaveCount(1);
  await expect(page.getByTestId('dashboard-learning-route-englishPractice')).toHaveCount(0);
  await expect(page.getByTestId('student-hero-primary-cta')).toBeVisible();
  const grammarEntry = page.getByTestId('dashboard-practice-lane-grammar');
  await expect(page.getByTestId('student-hero-primary-cta')).toContainText('単語');
  await page.getByTestId('student-hero-primary-cta').click();
  await expect(page).toHaveURL(/\/study\//);
  await expect(page.getByTestId('study-card-front')).toBeVisible();
  await page.getByRole('button', { name: '学習を中断してダッシュボードに戻る', exact: true }).click();
  await expect(page.getByTestId('student-dashboard')).toBeVisible();
  await expect(grammarEntry).toBeVisible();
  await expect(page.getByTestId('dashboard-practice-lane-translation')).toBeVisible();
  await expect(page.getByTestId('dashboard-practice-lane-reading')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-lane-writing')).toHaveCount(0);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByText('今日の英語演習')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);

  await grammarEntry.click();
  await expect(page).toHaveURL(/\/english-practice\/grammar$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-focus')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-hero-section')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-reference-rail')).toHaveCount(0);
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByRole('heading', { name: '参考書型の文法演習' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByTestId('student-hero-primary-cta')).toBeVisible();

  await grammarEntry.click();
  await expect(page).toHaveURL(/\/english-practice\/grammar$/);
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toHaveCount(0);
  await expect(page.getByTestId('dashboard-reference-rail')).toHaveCount(0);
  await page.getByTestId('english-practice-close').click();
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('desktop student dashboard keeps the command center calm and above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');

  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  const commandCenter = page.getByTestId('dashboard-command-center');
  const primaryCta = page.getByTestId('student-hero-primary-cta');
  await expect(commandCenter).toBeVisible();
  await expect(primaryCta).toHaveCount(1);
  await expect(page.getByTestId('dashboard-task-overview-rail')).toBeVisible();
  await expect(page.getByTestId('dashboard-task-overview-today')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-task-reference-library')).toBeVisible();

  const ctaBox = await primaryCta.boundingBox();
  const commandBox = await commandCenter.boundingBox();
  expect(ctaBox, 'primary CTA should have a layout box').not.toBeNull();
  expect(commandBox, 'command center should have a layout box').not.toBeNull();
  expect(ctaBox!.y + ctaBox!.height, 'primary CTA should stay inside the first desktop viewport').toBeLessThanOrEqual(768);
  expect(commandBox!.y + commandBox!.height, 'command center should stay inside the first desktop viewport').toBeLessThanOrEqual(768);

  const palette = await commandCenter.evaluate((element) => {
    const centerStyle = window.getComputedStyle(element);
    const cta = element.querySelector('[data-testid="student-hero-primary-cta"]');
    const ctaStyle = cta ? window.getComputedStyle(cta) : null;
    return {
      centerBackground: centerStyle.backgroundColor,
      centerBackgroundImage: centerStyle.backgroundImage,
      ctaBackground: ctaStyle?.backgroundColor || '',
      ctaForeground: ctaStyle?.color || '',
    };
  });
  expect(palette.centerBackground).toBe('rgb(255, 255, 255)');
  expect(palette.centerBackgroundImage).toBe('none');
  expect(palette.ctaBackground).toBe('rgb(246, 109, 11)');
  expect(palette.ctaForeground).toBe('rgb(47, 22, 9)');
  await expect(page.getByTestId('app-shell')).toHaveCSS('background-color', 'rgb(253, 243, 237)');
  await expect(page.getByTestId('app-shell')).toHaveCSS('background-image', 'none');

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(commandCenter).toBeVisible();
  const mediumDesktopBox = await commandCenter.boundingBox();
  expect(mediumDesktopBox, 'command center should have a medium desktop layout box').not.toBeNull();
  expect(
    mediumDesktopBox!.y + mediumDesktopBox!.height,
    'command center should not collapse into a tall single column on 1024px web',
  ).toBeLessThanOrEqual(768);
  await expect(page.getByTestId('dashboard-reference-panel')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-library-section')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-progress-section')).toHaveCount(0);
  const referencePanel = await openDashboardReference(page, 'library');
  const referencePanelBox = await referencePanel.boundingBox();
  const referenceRailBox = await page.getByTestId('dashboard-reference-rail').boundingBox();
  expect(referencePanelBox, 'selected details should have a full-width layout box').not.toBeNull();
  expect(referenceRailBox).not.toBeNull();
  expect(Math.round(referencePanelBox!.x)).toBe(Math.round(referenceRailBox!.x));
  expect(Math.round(referencePanelBox!.width)).toBe(Math.round(referenceRailBox!.width));
  await expect(page.getByTestId('dashboard-library-section')).toBeInViewport();
  expect(await findUnexpectedHorizontalOverflow(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(referencePanel).toHaveCount(0);
  await expect(page.getByTestId('dashboard-task-reference-library')).toBeFocused();
  await expect(page.getByTestId('dashboard-task-reference-library')).toHaveAttribute('aria-pressed', 'false');

  const announcementsEntry = page.getByTestId('dashboard-task-reference-announcements');
  if (await announcementsEntry.count()) {
    const menuSummary = announcementsEntry.locator('xpath=ancestor::details').locator('summary');
    await openDashboardReference(page, 'announcements');
    await expect(page.getByTestId('dashboard-announcements-section')).toBeVisible();
    await expect(page.getByTestId('dashboard-library-section')).toHaveCount(0);
    await page.getByRole('button', { name: '閉じて今日の画面に戻る', exact: true }).click();
    await expect(page.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(menuSummary).toBeFocused();
  }

  await primaryCta.scrollIntoViewIfNeeded();
  await primaryCta.click();
  await expect.poll(async () => {
    if (await page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront).count()) {
      return 'study';
    }
    if (await page.getByTestId('phrasebook-create-modal').count()) {
      return 'phrasebook';
    }
    if (await page.getByTestId('english-practice-hub').count()) {
      await expect(page).toHaveURL(/\/english-practice\/grammar$/);
      return 'practice';
    }
    const mainText = await page.locator('main').innerText({ timeout: 1000 }).catch(() => '');
    if (mainText.includes('今日のクエスト') && mainText.includes('答えを確認')) {
      return 'study';
    }
    return 'pending';
  }, {
    message: 'primary CTA should open the available study, grammar trial, or phrasebook creation route',
    timeout: 20000,
  }).not.toBe('pending');
});

test('desktop dashboard keeps one selected resource full-width and mission deadlines visible', async ({ browser, baseURL }, testInfo) => {
  test.skip(!baseURL, 'smoke baseURL is required for API-seeded dashboard state');
  const appBaseURL = baseURL!;
  const adminContext = await browser.newContext({
    baseURL: appBaseURL,
    viewport: { width: 1366, height: 900 },
  });
  const studentContext = await browser.newContext({
    baseURL: appBaseURL,
    viewport: { width: 1366, height: 900 },
  });
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();
  attachSmokeDiagnostics(adminPage, testInfo, 'desktop-right-rail-admin');
  attachSmokeDiagnostics(studentPage, testInfo, 'desktop-right-rail-student');

  try {
    await loginGroupAdminDemo(adminPage);
    await loginBusinessStudentDemo(studentPage);
    await updateSessionProfile(studentPage, {
      grade: 'JHS3',
      englishLevel: 'B1',
    });
    const student = await getCurrentSessionUser(studentPage);
    expect(student?.uid).toBeTruthy();

    const importResult = await seedPhrasebook(studentPage, 'Right Rail Regression Drill');
    const bookId = importResult.importedBookIds?.[0];
    expect(bookId).toBeTruthy();

    const weeklyMission = await storageAction<any>(adminPage, 'createWeeklyMission', {
      learningTrack: 'EIKEN_2',
      title: 'Right Rail Regression Mission',
      rationale: 'desktop lower details should not stay in the right rail',
      bookId,
      bookTitle: 'Right Rail Regression Drill',
      newWordsTarget: 2,
      reviewWordsTarget: 0,
      quizTargetCount: 0,
    });
    expect(weeklyMission.id).toBeTruthy();
    await storageAction(adminPage, 'assignWeeklyMission', {
      missionId: weeklyMission.id,
      studentUid: student?.uid,
    });

    await studentPage.goto('/dashboard');
    await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
    await expect(studentPage.getByTestId('dashboard-primary-stack')).toBeVisible();
    await expect(studentPage.getByTestId('student-hero-primary-cta')).toHaveCount(1);
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    const missionDetails = studentPage.getByTestId('dashboard-task-details-mission');
    await expect(missionDetails.locator('summary')).toContainText(`期限 ${formatDateKey(weeklyMission.dueAt)}`);
    await expect(studentPage.getByTestId('dashboard-mission-section')).toBeHidden();
    await openDashboardTaskDetails(studentPage, 'mission');
    await expect(studentPage.getByTestId('dashboard-mission-section')).toContainText('Right Rail Regression Mission');
    await missionDetails.locator('summary').click();

    await openDashboardReference(studentPage, 'library');
    await expect(studentPage.getByTestId('dashboard-progress-section')).toHaveCount(0);
    const { commandBox, referenceBox, libraryBox } = await studentPage.evaluate(() => {
      const box = (testId: string) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return { commandBox: box('dashboard-command-center'), referenceBox: box('dashboard-reference-panel'), libraryBox: box('dashboard-library-section') };
    });
    expect(commandBox).not.toBeNull();
    expect(referenceBox).not.toBeNull();
    expect(libraryBox).not.toBeNull();
    expect(Math.abs(referenceBox!.x - commandBox!.x)).toBeLessThanOrEqual(1);
    expect(referenceBox!.width).toBeGreaterThanOrEqual(commandBox!.width - 2);
    expect(libraryBox!.width).toBeGreaterThanOrEqual(commandBox!.width - 2);
    await studentPage.getByRole('button', { name: '閉じて今日の画面に戻る', exact: true }).click();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(studentPage.getByTestId('dashboard-task-reference-library')).toBeFocused();
    await openDashboardReference(studentPage, 'progress');
    await expect(studentPage.getByTestId('dashboard-library-section')).toHaveCount(0);
    await expect(studentPage.getByTestId('dashboard-progress-section')).toBeVisible();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(1);
    await studentPage.keyboard.press('Escape');
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(studentPage.getByTestId('dashboard-task-reference-progress')).toBeFocused();

    const planEntry = studentPage.getByTestId('dashboard-task-reference-plan');
    const otherMenu = planEntry.locator('xpath=ancestor::details');
    const otherSummary = otherMenu.locator('summary');
    await otherSummary.click();
    await expect(planEntry).toBeVisible();
    await planEntry.focus();
    await studentPage.keyboard.press('Escape');
    await expect(otherMenu).not.toHaveAttribute('open', '');
    await expect(otherSummary).toBeFocused();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await openDashboardReference(studentPage, 'plan');
    await expect(studentPage.getByTestId('dashboard-plan-anchor')).toBeVisible();
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1366, height: 900 }]) {
      await studentPage.setViewportSize(viewport);
      await studentPage.getByTestId('dashboard-plan-anchor').scrollIntoViewIfNeeded();
      expect(await studentPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await studentPage.screenshot({ path: testInfo.outputPath(`standard-plan-${viewport.width}.png`) });
    }
    await expect(studentPage.getByTestId('dashboard-progress-section')).toHaveCount(0);
    await studentPage.getByRole('button', { name: '閉じて今日の画面に戻る', exact: true }).click();
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(otherSummary).toBeFocused();

    // These reference sections also own a task ref; reselecting must keep panel focus.
    const repeatSection = await studentPage.getByTestId('dashboard-task-reference-weakness').count() ? 'weakness' : 'writing';
    const repeatEntry = studentPage.getByTestId(`dashboard-task-reference-${repeatSection}`);
    await expect(repeatEntry).toHaveCount(1);
    const repeatSummary = repeatEntry.locator('xpath=ancestor::details').locator('summary');
    await openDashboardReference(studentPage, repeatSection);
    await repeatSummary.click();
    await expect(repeatEntry).toBeVisible();
    await repeatEntry.focus();
    await studentPage.keyboard.press('Enter');
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(1);
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toBeFocused();
    await studentPage.keyboard.press('Escape');
    await expect(studentPage.getByTestId('dashboard-reference-panel')).toHaveCount(0);
    await expect(repeatSummary).toBeVisible();
    await expect(repeatSummary).toBeFocused();
    await expect(repeatEntry).toBeHidden();

    const offenders = await findUnexpectedHorizontalOverflow(studentPage);
    expect(offenders).toEqual([]);
  } finally {
    await adminContext.close();
    await studentContext.close();
  }
});

test('study routes survive reload and finish back on the dashboard path', async ({ page }) => {
  await page.goto('/');

  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId('student-dashboard')).toBeVisible();

  const importResult = await seedPhrasebook(page, 'Route Persistence Drill');
  const bookId = importResult.importedBookIds?.[0];
  expect(bookId).toBeTruthy();

  await page.goto(`/study/${bookId}`);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront)).toBeVisible();
  await page.reload();
  await Promise.race([
    page.getByTestId(MOBILE_FLOW_TEST_IDS.studyCardFront).waitFor({ state: 'visible', timeout: 10_000 }),
    page.getByTestId(MOBILE_FLOW_TEST_IDS.studyRate3).waitFor({ state: 'visible', timeout: 10_000 }),
  ]);

  await finishStudySession(page, 4);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
});

test('student can open the dedicated practice screen from a direct route', async ({ page }) => {
  await page.goto('/');

  await exposeStudentDemo(page);
  await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
  await maybeCompleteOnboarding(page);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();

  await page.goto('/english-practice/grammar');
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toHaveCount(0);
  await expect(page.getByTestId('dashboard-practice-focus')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-hero-section')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-reference-rail')).toHaveCount(0);
  await expect(page.getByTestId('english-practice-hub')).toBeVisible();
  await expect(page.getByTestId('layout-nav-home')).toBeVisible();
  await expect(page.getByTestId('layout-nav-english-practice-current')).toBeVisible();
  await expect(page.getByTestId('layout-nav-english-practice-current')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('english-practice-lane-grammar')).toBeVisible();
  await expect(page.getByTestId('english-practice-lane-overview')).toHaveCount(0);
  await expect(page.getByText('文法範囲を選ぶ')).toBeVisible();
  await expect(page.getByText('今日の英語演習')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);

  await page.getByTestId('english-practice-lane-translation').click();
  await expect(page).toHaveURL(/\/english-practice\/translation$/);
  await expect(page.getByRole('heading', { name: '和訳トレーニング' })).toBeVisible();

  await page.getByTestId('english-practice-lane-reading').click();
  await expect(page).toHaveURL(/\/english-practice\/reading$/);
  await expect(page.getByTestId('reading-practice-view')).toBeVisible();

  await page.getByTestId('english-practice-lane-writing').click();
  await expect(page).toHaveURL(/\/english-practice\/writing$/);
  await expect(page.getByTestId('english-practice-lane-writing-panel')).toBeVisible();

  await page.getByTestId('english-practice-close').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();

  await page.goto('/english-practice');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId(MOBILE_FLOW_TEST_IDS.studentDashboard)).toBeVisible();
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
  await expect(page.getByText('英語演習のおすすめ')).toHaveCount(0);
});


for (const viewport of [{ width: 320, height: 568 }, { width: 1366, height: 900 }]) {
  for (const mode of ['ja_translation_order', 'ja_translation_input'] as const) {
    test(`material translation eligibility matches actual questions in ${mode} at ${viewport.width}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await exposeStudentDemo(page);
      await page.getByTestId(MOBILE_FLOW_TEST_IDS.demoLoginStudent).click();
      await expect(page.getByTestId('student-dashboard')).toBeVisible();
      const source = ORIGINAL_TRANSLATION_QUESTIONS.find(item => item.id.endsWith('-clock-time-01'))!;
      const title = `Synthetic Translation Eligibility ${mode} ${viewport.width}`;
      const imported = await storageAction<{ importedBookIds: string[] }>(page, 'batchImportWords', {
        defaultBookName: title, source: { kind: 'rows', rows: [
          { bookName: title, number: 1, word: 'library', definition: '図書館', exampleSentence: source.sourceSentence, exampleMeaning: source.orderChunks.join(' ') },
          { bookName: title, number: 2, word: 'walk', definition: '歩く' },
          { bookName: title, number: 3, word: 'read', definition: '読む', exampleSentence: 'I read books every day.' },
          { bookName: title, number: 4, word: 'compare', definition: '比較する', exampleSentence: 'The cats sleep on the mat.', exampleMeaning: '猫は マットの上で 眠ります。' },
        ] },
      });
      const attempts: unknown[] = [];
      page.on('request', request => {
        if (request.method() !== 'POST' || !request.url().includes('/api/storage')) return;
        const body = request.postDataJSON();
        if (body.action === 'recordQuizAttempt') attempts.push(body.payload);
      });
      await page.goto(`/quiz/${imported.importedBookIds[0]}`);
      const setup = page.getByTestId('quiz-setup-view');
      await expect(setup).toBeVisible();
      await page.getByTestId('quiz-advanced-settings-toggle').click();
      await page.getByTestId(`quiz-direction-${mode}`).click();
      await expect(page.getByTestId('quiz-setup-compact-summary')).toContainText('候補 1語');
      await expect(setup.getByRole('heading', { name: '1問クイズ', exact: true })).toBeVisible();
      await page.getByTestId('quiz-selection-range_random').click();
      await page.getByLabel('開始番号', { exact: true }).fill('2');
      await page.getByLabel('終了番号', { exact: true }).fill('4');
      await expect(page.getByTestId('quiz-setup-compact-summary')).toContainText('候補 0語');
      await expect(page.getByTestId('quiz-empty-state')).toContainText('和訳問題に使える英文と日本語訳');
      await expect(setup.getByRole('heading', { name: '和訳の練習', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: /^\d+問クイズ$/ })).toHaveCount(0);
      await expect(page.getByTestId('quiz-setup-primary-cta')).toBeDisabled();
      expect(await findUnexpectedHorizontalOverflow(page)).toEqual([]);
      await page.getByTestId('quiz-advanced-settings-toggle').click();
      await page.screenshot({ path: testInfo.outputPath(`translation-empty-${mode}-${viewport.width}.png`) });
      await page.getByTestId('quiz-advanced-settings-toggle').click();
      await page.getByTestId('quiz-direction-en_to_ja').click();
      await expect(page.getByTestId('quiz-setup-compact-summary')).toContainText('候補 3語');
      await expect(page.getByTestId('quiz-setup-primary-cta')).toBeEnabled();
      await page.getByTestId(`quiz-direction-${mode}`).click();
      await page.getByTestId('quiz-selection-full_random').click();
      await expect(page.getByTestId('quiz-setup-primary-cta')).toHaveText('1問はじめる');
      await page.getByTestId('quiz-setup-primary-cta').click();
      await expect(page.getByTestId('quiz-running-view')).toBeVisible();
      await expect(page.getByTestId('quiz-running-view')).toContainText(source.sourceSentence);
      expect(attempts).toEqual([]);
    });
  }
}
