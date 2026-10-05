import { expect, test } from './diagnostics';
import { getCurrentSessionUser, loginAdminDemo, loginBusinessStudentDemo, loginGroupAdminDemo, maybeCompleteOnboarding, openDashboardWriting, resolveWritingStudentSelectValue, runtimeAdminPost, storageAction } from './smoke-support';

test('unassessed originals survive a lost save response and browser revisit without GPT or a formal submission', async ({ browser }, testInfo) => {
  const teacherContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();
  let formalCalls = 0;
  for (const page of [teacher, student]) {
    page.on('request', request => { if (/\/api\/writing\/(ai-drafts|submissions\/finalize)/.test(request.url())) formalCalls += 1; });
    // The full regression runner privately enables the legacy submission UI.
    // This test selects the ordinary disabled capability while using real D1/R2.
    await page.route('**/api/writing/ai-capabilities?*', async route => {
      const response = await route.fetch();
      const capability = await response.json();
      if (process.env.WRITING_SOURCE_DISABLED_REVIEW === '1') expect(capability.gradingEnabled).toBe(false);
      await route.fulfill({ response, json: { ...capability, gradingEnabled: false } });
    });
  }
  await loginGroupAdminDemo(teacher);
  const bootstrap = await runtimeAdminPost<{ studentUid: string }>(teacher, 'runtime-admin/bootstrap-demo-organization');
  await storageAction(teacher, 'sendInstructorNotification', { studentUid: bootstrap.studentUid, message: 'Synthetic draft acceptance only.', triggerReason: 'smoke-draft-bootstrap', usedAi: false, interventionKind: 'REVIEW_RESTART' });
  await loginBusinessStudentDemo(student);
  await maybeCompleteOnboarding(student);
  await teacher.reload();
  await teacher.getByTestId('workspace-tab-writing').click();
  const uid = await resolveWritingStudentSelectValue(teacher, await getCurrentSessionUser(student));
  const templateId = await teacher.getByTestId('writing-template-select').locator('option').nth(1).getAttribute('value');
  const assignment = await runtimeAdminPost<{ id: string; submissionCode: string }>(teacher, '/api/writing/assignments/generate', { studentUid: uid, templateId, topicHint: 'Synthetic draft reliability check' });
  await runtimeAdminPost(teacher, '/api/writing/assignments/issue', { assignmentId: assignment.id });
  await teacher.reload();
  await teacher.getByTestId('workspace-tab-writing').click();
  await teacher.getByRole('button', { name: '印刷 / 配布', exact: true }).click();
  await teacher.getByRole('button', { name: new RegExp(assignment.submissionCode) }).click();
  await teacher.getByRole('button', { name: '答案の下書き / GPT補助', exact: true }).click();
  const teacherDialog = teacher.getByRole('dialog');
  await teacher.getByTestId('writing-teacher-draft-manual').fill('Synthetic original saved by teacher.');
  await teacher.getByTestId('writing-teacher-draft-files').setInputFiles({ name: 'synthetic-original.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6q98AAAAASUVORK5CYII=', 'base64') });
  await teacher.getByTestId('writing-teacher-draft-save').click();
  await expect(teacherDialog.getByRole('status')).toContainText('下書きを保存しました');
  await expect(teacher.getByTestId('writing-gpt-ocr')).toBeDisabled();
  await expect(teacher.getByTestId('writing-gpt-feedback')).toBeDisabled();
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
    await teacher.setViewportSize(size);
    await expect(teacher.getByTestId('writing-teacher-draft-save')).toBeVisible();
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await teacher.screenshot({ path: testInfo.outputPath(`unassessed-teacher-${size.width}.png`) });
  }
  await teacher.keyboard.press('Escape');
  await expect(teacherDialog).toHaveCount(0);
  await expect(teacher.getByRole('button', { name: '答案の下書き / GPT補助', exact: true })).toBeFocused();

  await student.reload();
  await openDashboardWriting(student);
  let failRestore = true;
  await student.route('**/api/writing/input-draft?*', route => failRestore
    ? route.fulfill({ status: 503, json: { error: 'Synthetic initial draft read failure' } }) : route.continue());
  await student.getByTestId(`writing-open-submit-${assignment.id}`).click();
  const studentDialog = student.getByRole('dialog');
  const manual = student.getByLabel('答案本文（任意）');
  await expect(studentDialog.getByRole('alert')).toBeVisible();
  failRestore = false;
  await studentDialog.getByRole('button', { name: '下書きを再取得する', exact: true }).click();
  await expect(manual).toHaveValue('Synthetic original saved by teacher.');
  await expect(studentDialog).toContainText('synthetic-original.png');
  await manual.fill('Synthetic learner revision retained after a lost response.');
  let loseResponse = true;
  await student.route('**/api/writing/input-draft', async route => {
    if (route.request().method() !== 'POST' || !loseResponse) return route.continue();
    loseResponse = false;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed');
  });
  await student.getByTestId('writing-submit-upload').click();
  await expect(studentDialog.getByRole('alert')).toBeFocused();
  await expect(manual).toHaveValue('Synthetic learner revision retained after a lost response.');
  await student.getByTestId('writing-submit-upload').click();
  await expect(student.getByTestId('writing-draft-saved')).toContainText('未評価');
  const saved = await student.evaluate(async id => (await fetch(`/api/writing/input-draft?assignmentId=${id}&attemptNo=1`)).json(), assignment.id);
  expect(saved.draft.revision).toBe(3);
  expect(saved.draft.assets).toHaveLength(1);
  const concurrent = await teacher.evaluate(async ({ id, assetIds }) => {
    const response = await fetch('/api/writing/input-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), assignmentId: id, attemptNo: 1, expectedRevision: 3, assetIds, manualTranscript: 'Synthetic concurrent teacher edit.' }) });
    return response.status;
  }, { id: assignment.id, assetIds: saved.draft.assetIds });
  expect(concurrent).toBe(200);
  await manual.fill('Synthetic learner revision retained after a lost response.');
  await student.getByTestId('writing-submit-upload').click();
  await expect(studentDialog.getByRole('alert')).toBeVisible();
  await studentDialog.getByRole('button', { name: '下書きを再取得する', exact: true }).click();
  await expect(manual).toHaveValue('Synthetic learner revision retained after a lost response.');
  await expect(student.getByTestId('writing-submit-upload')).toBeEnabled();
  await student.getByTestId('writing-submit-upload').click();
  await expect(student.getByTestId('writing-draft-saved')).toContainText('未評価');
  await student.reload();
  await openDashboardWriting(student);
  await student.getByTestId(`writing-open-submit-${assignment.id}`).click();
  await expect(manual).toHaveValue('Synthetic learner revision retained after a lost response.');
  await student.setViewportSize({ width: 320, height: 568 });
  await student.getByRole('button', { name: 'ファイル選択へ進む', exact: true }).click();
  await student.getByRole('button', { name: '本文・保存へ進む', exact: true }).click();
  await expect(manual).toBeVisible();
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await student.screenshot({ path: testInfo.outputPath('unassessed-student-320.png') });

  // Replace an existing original in one save; archived originals retain their
  // rows/objects while the active draft and upload quota accept the replacement.
  await student.setViewportSize({ width: 1366, height: 900 });
  await studentDialog.getByRole('button', { name: '外す', exact: true }).click();
  await studentDialog.locator('input[type=file]').setInputFiles({ name: 'synthetic-replacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic replacement') });
  await student.getByTestId('writing-submit-upload').click();
  await expect(student.getByTestId('writing-draft-saved')).toContainText('未評価');
  const replaced = await student.evaluate(async id => (await fetch(`/api/writing/input-draft?assignmentId=${id}&attemptNo=1`)).json(), assignment.id);
  expect(replaced.draft.revision).toBe(7);
  expect(replaced.draft.assets.map((asset: any) => asset.fileName)).toEqual(['synthetic-replacement.pdf']);

  await teacher.reload();
  await teacher.getByTestId('workspace-tab-writing').click();
  await teacher.getByRole('button', { name: '印刷 / 配布', exact: true }).click();
  await teacher.getByRole('button', { name: new RegExp(assignment.submissionCode) }).click();
  let failTeacherRestore = true;
  await teacher.route('**/api/writing/input-draft?*', route => failTeacherRestore
    ? route.fulfill({ status: 503, json: { error: 'Synthetic teacher initial read failure' } }) : route.continue());
  await teacher.getByRole('button', { name: '答案の下書き / GPT補助', exact: true }).click();
  await expect(teacher.getByTestId('writing-teacher-draft-error')).toBeVisible();
  failTeacherRestore = false;
  await teacher.getByRole('button', { name: '下書きを再取得', exact: true }).click();
  await expect(teacher.getByTestId('writing-teacher-draft-manual')).toHaveValue('Synthetic learner revision retained after a lost response.');
  await teacher.getByRole('dialog').getByRole('button', { name: '外す', exact: true }).click();
  const images = [1, 2, 3, 4].map(index => ({ name: `synthetic-page-${index}.png`, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6q98AAAAASUVORK5CYII=', 'base64') }));
  await teacher.getByTestId('writing-teacher-draft-files').setInputFiles(images);
  await teacher.getByTestId('writing-teacher-draft-save').click();
  await expect(teacher.getByRole('dialog').getByRole('status')).toContainText('下書きを保存しました');
  await teacher.getByRole('dialog').getByRole('button', { name: '外す', exact: true }).first().click();
  await teacher.getByTestId('writing-teacher-draft-files').setInputFiles({ ...images[0], name: 'synthetic-final-page.png' });
  await teacher.getByTestId('writing-teacher-draft-save').click();
  await expect(teacher.getByRole('dialog').getByRole('status')).toContainText('下書きを保存しました');
  const finalDraft = await teacher.evaluate(async id => (await fetch(`/api/writing/input-draft?assignmentId=${id}&attemptNo=1`)).json(), assignment.id);
  expect(finalDraft.draft.revision).toBe(11);
  expect(finalDraft.draft.assets).toHaveLength(4);
  expect(finalDraft.draft.assets.some((asset: any) => asset.fileName === 'synthetic-final-page.png')).toBe(true);
  expect(formalCalls).toBe(0);
  await teacherContext.close();
  await studentContext.close();
});

test('administrator sees durable monthly usage separately from invoice totals and can retry failed reads', async ({ page }, testInfo) => {
  await loginAdminDemo(page);
  let failRead = true;
  await page.route('**/api/writing/ai-budget?*', route => failRead
    ? route.fulfill({ status: 503, json: { error: 'Synthetic budget read failure' } }) : route.continue());
  await page.getByRole('button', { name: 'GPT利用額', exact: true }).click();
  await expect(page.getByTestId('admin-ai-usage-error')).toBeVisible();
  await expect(page.getByTestId('admin-ai-usage-ready')).toHaveCount(0);
  failRead = false;
  await page.getByRole('button', { name: 'もう一度読み込む', exact: true }).click();
  await expect(page.getByTestId('admin-ai-usage-ready')).toBeVisible();
  await expect(page.getByTestId('admin-ai-usage-configured')).toContainText('未有効');
  await expect(page.getByTestId('admin-ai-usage-no-measurement')).toBeVisible();
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`admin-budget-${size.width}.png`), fullPage: true });
  }
  await page.getByTestId('admin-ai-usage-month').fill('2026-09');
  await expect(page.getByTestId('admin-ai-usage-ready')).toBeVisible();
  await expect(page.getByTestId('admin-ai-audit-empty')).toBeVisible();
});

test('lost original PUT and failed final draft saves remain recoverable after selecting a different PDF', async ({ page }) => {
  await page.route('**/api/writing/ai-capabilities?*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), gradingEnabled: false } });
  });
  await loginGroupAdminDemo(page);
  const bootstrap = await runtimeAdminPost<{ studentUid: string }>(page, 'runtime-admin/bootstrap-demo-organization');
  await storageAction(page, 'sendInstructorNotification', { studentUid: bootstrap.studentUid, message: 'Synthetic upload recovery only.', triggerReason: 'smoke-upload-bootstrap', usedAi: false, interventionKind: 'REVIEW_RESTART' });
  const templates = await page.evaluate(async () => (await fetch('/api/writing/templates')).json());
  const assignment = await runtimeAdminPost<{ id: string; submissionCode: string }>(page, '/api/writing/assignments/generate', { studentUid: bootstrap.studentUid, templateId: templates.templates[0].id });
  await runtimeAdminPost(page, '/api/writing/assignments/issue', { assignmentId: assignment.id });
  await page.reload();
  await page.getByTestId('workspace-tab-writing').click();
  await page.getByRole('button', { name: '印刷 / 配布', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(assignment.submissionCode) }).click();
  await page.getByRole('button', { name: '答案の下書き / GPT補助', exact: true }).click();
  await page.getByTestId('writing-teacher-draft-manual').fill('Synthetic text retained across upload failures.');
  let losePut = true;
  const putStatuses: number[] = [];
  await page.route('**/api/writing/upload/*', async route => {
    const response = await route.fetch();
    putStatuses.push(response.status());
    if (losePut) { losePut = false; return route.abort('failed'); }
    await route.fulfill({ response });
  });
  await page.getByTestId('writing-teacher-draft-files').setInputFiles({ name: 'synthetic-first.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic first') });
  await page.getByTestId('writing-teacher-draft-save').click();
  await expect(page.getByTestId('writing-teacher-draft-error')).toBeFocused();
  await page.getByTestId('writing-teacher-draft-manual').fill('Synthetic edited text after a lost successful PUT.');
  await page.getByTestId('writing-teacher-draft-save').click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('下書きを保存しました');
  expect(putStatuses).toEqual([204, 204]);
  await page.getByRole('dialog').getByRole('button', { name: '外す', exact: true }).click();
  let failFinal = true;
  await page.route('**/api/writing/input-draft', async route => {
    const body = route.request().postDataJSON();
    if (body.prepareUpload || !failFinal) return route.continue();
    failFinal = false;
    await route.fulfill({ status: 503, json: { error: 'Synthetic final save failed before commit' } });
  });
  await page.getByTestId('writing-teacher-draft-files').setInputFiles({ name: 'synthetic-orphan-a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic orphan A') });
  await page.getByTestId('writing-teacher-draft-save').click();
  await expect(page.getByTestId('writing-teacher-draft-error')).toBeVisible();
  await page.getByTestId('writing-teacher-draft-files').setInputFiles({ name: 'synthetic-reselected-b.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic replacement B') });
  await page.getByTestId('writing-teacher-draft-save').click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('下書きを保存しました');
  const draft = await page.evaluate(async id => (await fetch(`/api/writing/input-draft?assignmentId=${id}&attemptNo=1`)).json(), assignment.id);
  expect(draft.draft.revision).toBe(5);
  expect(draft.draft.assets.map((asset: any) => asset.fileName)).toEqual(['synthetic-reselected-b.pdf']);
  expect(draft.draft.manualTranscript).toBe('Synthetic edited text after a lost successful PUT.');
});
