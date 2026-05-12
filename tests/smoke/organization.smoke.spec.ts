import { expect, test } from '@playwright/test';

import {
  emailAuth,
  getCurrentSessionUser,
  getInstructorSegmentLabel,
  loginAdminDemo,
  loginBusinessStudentDemo,
  loginGroupAdminDemo,
  loginInstructorDemo,
  maybeCompleteOnboarding,
  seedPhrasebook,
  runtimeAdminPost,
  storageAction,
  completeCoachCtaStudySession,
  completeMissionCtaStudySession,
} from './smoke-support';

test('group admin can open the organization dashboard and update an assignment', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await runtimeAdminPost(page, 'runtime-admin/bootstrap-demo-organization');
  await page.reload();
  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await expect(page.getByTestId('organization-kpi-trend-section')).toBeVisible();
  await page.getByTestId('workspace-tab-assignments').click();
  const assignmentRows = page.locator('[data-testid^="assignment-row-"]');
  await expect(assignmentRows.first()).toBeVisible();
  await assignmentRows.first().click();
  const assignmentSelect = page.locator('[data-testid^="assignment-select-"]').first();
  await expect(assignmentSelect).toBeVisible();
  const nextInstructorUid = await assignmentSelect.evaluate((element) => {
    const select = element as HTMLSelectElement;
    return Array.from(select.options)
      .map((option) => option.value)
      .find((value) => value && value !== select.value) || '';
  });
  expect(nextInstructorUid).toBeTruthy();
  await assignmentSelect.selectOption(nextInstructorUid);

  await expect(page.getByText(/担当講師を .* に更新しました。/)).toBeVisible();
  await expect(page.getByTestId('assignment-history-section')).toContainText('変更者');
});

test('group admin can create a grammar worksheet from studied vocabulary', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await page.getByTestId('workspace-tab-worksheets').click();
  await expect(page.getByText('配布用PDF問題を独立して作る')).toBeVisible();

  await page.getByRole('button', { name: '生徒別にPDF問題を作る' }).click();
  await expect(page.getByText('学習済み単語を A4 1枚で確認する')).toBeVisible();
  await page.getByRole('button', { name: /英語語順並び替え/ }).click();
  await expect(page.getByText('文法化できる語数')).toBeVisible();
  await expect(page.getByText(/英字の単語と日本語の意味/)).toBeVisible();

  await page.getByRole('button', { name: '問題を開く' }).click();
  await expect(page.getByText('印刷プレビュー')).toBeVisible();
  await expect(page.locator('iframe[title="Worksheet print preview"]')).toBeVisible();
});

test('instructor direct english practice route returns to the instructor workspace', async ({ page }) => {
  await loginInstructorDemo(page);
  await expect(page.getByTestId('instructor-dashboard')).toBeVisible();

  await page.goto('/english-practice/grammar');
  await expect(page.getByTestId('instructor-dashboard')).toBeVisible();
  await expect(page.getByTestId('english-practice-hub')).toHaveCount(0);
});

test('group admin bootstrap seeds the demo activation loop and leaves guided next steps', async ({ page }) => {
  await loginGroupAdminDemo(page);
  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await expect(page.getByTestId('organization-kpi-trend-section')).toBeVisible();

  const bootstrap = await runtimeAdminPost<{
    cohortId: string;
    missionId: string;
    studentUid: string;
    instructorUid: string;
  }>(page, 'runtime-admin/bootstrap-demo-organization');
  expect(bootstrap.cohortId).toBeTruthy();
  expect(bootstrap.missionId).toBeTruthy();
  expect(bootstrap.studentUid).toBeTruthy();
  expect(bootstrap.instructorUid).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();

  const snapshot = await storageAction<any>(page, 'getOrganizationDashboardSnapshot');
  expect(['SEND_FIRST_NOTIFICATION', 'ACTIVE']).toContain(snapshot.activationState);
  expect(snapshot.assignmentCoverageRate).toBeGreaterThan(0);
  expect(
    snapshot.studentAssignments.some((student: {
      uid: string;
      primaryMissionStatus?: string;
      primaryMissionTitle?: string;
    }) => (
      student.uid === bootstrap.studentUid
      && (student.primaryMissionStatus === 'ASSIGNED' || Boolean(student.primaryMissionTitle))
    )),
  ).toBeTruthy();

  const settings = await storageAction<any>(page, 'getOrganizationSettingsSnapshot');
  expect(settings.cohorts.length).toBeGreaterThan(0);

  if (snapshot.activationState === 'SEND_FIRST_NOTIFICATION') {
    await expect(page.getByTestId('business-admin-decision-panel').getByRole('heading', { name: '最初のフォロー通知を送る' })).toBeVisible();
    const notificationTarget = snapshot.studentAssignments.find((student: {
      assignedInstructorUid?: string;
      assignedInstructorName?: string;
      lastNotificationAt?: number;
      name: string;
      primaryMissionTitle?: string;
      uid: string;
    }) => (
      student.assignedInstructorUid
      && student.primaryMissionTitle
      && !student.lastNotificationAt
    ));
    if (!notificationTarget) {
      throw new Error('Business Admin first notification target was not found after bootstrap.');
    }
    const targetInstructorName = notificationTarget.assignedInstructorName
      || snapshot.instructors.find((instructor: { uid: string; displayName: string }) => (
        instructor.uid === notificationTarget.assignedInstructorUid
      ))?.displayName;
    expect(targetInstructorName).toBeTruthy();

    await page.getByTestId('workspace-tab-instructors').click();
    await expect(page.getByTestId('business-admin-first-notification-card')).toBeVisible();
    await expect(page.getByTestId('first-notification-target-student')).toContainText(notificationTarget.name);
    await expect(page.getByTestId('first-notification-target-instructor')).toContainText(targetInstructorName || '');
    await expect(page.getByTestId('first-notification-target-mission')).toContainText(notificationTarget.primaryMissionTitle);
    await page.getByTestId('business-admin-first-notification-send').click();
    await expect(page.getByTestId('first-notification-status')).toContainText('初回フォロー通知を保存しました');

    const notifiedSnapshot = await storageAction<any>(page, 'getOrganizationDashboardSnapshot');
    expect(notifiedSnapshot.activationState).not.toBe('SEND_FIRST_NOTIFICATION');
    expect(notifiedSnapshot.notifications7d).toBeGreaterThanOrEqual(snapshot.notifications7d + 1);
    expect(notifiedSnapshot.nextRequiredActionTarget?.kind || 'DONE').toMatch(/WRITING_ASSIGNMENT|DONE/);

    await page.getByTestId('workspace-tab-writing').click();
    await expect(page.getByTestId('writing-ops-panel')).toBeVisible();
    await expect(page.getByTestId('business-admin-activation-gate')).toHaveCount(0);
  } else {
    await expect(page.getByTestId('business-admin-decision-panel').getByRole('heading', { name: '導入完了' })).toBeVisible();
  }

  await page.getByTestId('workspace-tab-assignments').click();
  const assignmentRows = page.locator('[data-testid^="assignment-row-"]');
  await expect(assignmentRows.first()).toBeVisible();
  await assignmentRows.first().click();
  await expect(page.getByTestId('weekly-mission-form')).toBeVisible();
  await expect(page.getByTestId('assignment-history-section')).not.toContainText('まだ担当変更の履歴はありません。');

  await page.getByTestId('workspace-tab-writing').click();
  if (snapshot.activationState === 'SEND_FIRST_NOTIFICATION') {
    await expect(page.getByTestId('writing-ops-panel')).toBeVisible();
  } else {
    await expect(page.getByTestId('writing-ops-panel')).toBeVisible();
  }
});

test('group admin can open settings and organization rename survives reload across business roles', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentPage = await studentContext.newPage();
  const renamedOrganization = 'Smoke Rename Academy';

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-settings').click();
  await expect(adminPage.getByTestId('organization-members-section')).toBeVisible();
  await expect(adminPage.getByTestId('organization-audit-section')).toBeVisible();

  await loginInstructorDemo(instructorPage);
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  await adminPage.getByTestId('organization-settings-name-input').fill(renamedOrganization);
  await adminPage.getByTestId('organization-settings-save').click();
  await expect(adminPage.getByText(renamedOrganization).first()).toBeVisible();

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-settings').click();
  await expect(adminPage.getByTestId('organization-settings-name-input')).toHaveValue(renamedOrganization);

  await instructorPage.reload();
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();
  const instructorSession = await getCurrentSessionUser(instructorPage);
  expect(instructorSession?.organizationName).toBe(renamedOrganization);

  await studentPage.reload();
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  const studentSession = await getCurrentSessionUser(studentPage);
  expect(studentSession?.organizationName).toBe(renamedOrganization);

  await adminContext.close();
  await instructorContext.close();
  await studentContext.close();
});

test('group admin can scope cohorts and instructor dashboard only shows assigned cohort students', async ({ browser }) => {
  const platformAdminContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentAContext = await browser.newContext();
  const studentBContext = await browser.newContext();
  const platformAdminPage = await platformAdminContext.newPage();
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentAPage = await studentAContext.newPage();
  const studentBPage = await studentBContext.newPage();

  await loginAdminDemo(platformAdminPage);
  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await instructorPage.goto('/');
  const provisionedInstructor = await emailAuth(instructorPage, {
    email: 'smoke-cohort-instructor@example.jp',
    password: 'smoke-pass-123',
    isSignUp: true,
    role: 'STUDENT',
    displayName: 'Smoke Cohort Instructor',
  });

  await loginBusinessStudentDemo(studentAPage);
  await maybeCompleteOnboarding(studentAPage);
  await expect(studentAPage.getByTestId('student-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentBPage);
  await maybeCompleteOnboarding(studentBPage);
  await expect(studentBPage.getByTestId('student-dashboard')).toBeVisible();

  const adminUser = await getCurrentSessionUser(adminPage);
  const studentAUser = await getCurrentSessionUser(studentAPage);
  const studentBUser = await getCurrentSessionUser(studentBPage);
  expect(adminUser?.organizationId).toBeTruthy();
  expect(provisionedInstructor?.uid).toBeTruthy();
  expect(studentAUser?.uid).toBeTruthy();
  expect(studentBUser?.uid).toBeTruthy();

  const instructorRequest = await storageAction<any>(instructorPage, 'submitCommercialRequest', {
    kind: 'BUSINESS_ROLE_CONVERSION',
    contactName: 'Smoke Cohort Instructor',
    contactEmail: 'smoke-cohort-instructor@example.jp',
    organizationName: adminUser!.organizationName,
    requestedWorkspaceRole: 'INSTRUCTOR',
    seatEstimate: '1-30名',
    message: 'smoke cohort instructor provisioning',
    source: 'DASHBOARD_ACCOUNT',
  });

  await storageAction(platformAdminPage, 'updateCommercialRequest', {
    id: instructorRequest.id,
    status: 'PROVISIONED',
    resolutionNote: 'smoke cohort instructor provisioning',
    linkedUserUid: provisionedInstructor.uid,
    targetSubscriptionPlan: 'TOB_PAID',
    targetOrganizationId: adminUser!.organizationId,
    targetOrganizationName: adminUser!.organizationName,
    targetOrganizationRole: 'INSTRUCTOR',
  });

  await instructorPage.goto('/instructor');
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();
  const instructorUser = await getCurrentSessionUser(instructorPage);
  expect(instructorUser?.organizationRole).toBe('INSTRUCTOR');

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  await adminPage.getByTestId('workspace-tab-settings').click();

  await adminPage.getByTestId('cohort-create-input').fill('Smoke Cohort A');
  await adminPage.getByTestId('cohort-create-submit').click();
  await expect(adminPage.getByText('クラス/担当グループを追加しました。')).toBeVisible();

  await adminPage.getByTestId('cohort-create-input').fill('Smoke Cohort B');
  await adminPage.getByTestId('cohort-create-submit').click();
  await expect(adminPage.getByText('クラス/担当グループを追加しました。')).toBeVisible();

  const settingsSnapshot = await storageAction<any>(adminPage, 'getOrganizationSettingsSnapshot');
  const cohortA = settingsSnapshot.cohorts.find((cohort: { name: string }) => cohort.name === 'Smoke Cohort A');
  const cohortB = settingsSnapshot.cohorts.find((cohort: { name: string }) => cohort.name === 'Smoke Cohort B');
  expect(cohortA?.id).toBeTruthy();
  expect(cohortB?.id).toBeTruthy();

  await adminPage.getByTestId(`instructor-cohort-checkbox-${instructorUser!.uid}-${cohortA.id}`).check();
  await adminPage.getByTestId(`instructor-cohort-save-${instructorUser!.uid}`).click();
  await expect(adminPage.getByText('講師のクラス/担当グループ範囲を更新しました。')).toBeVisible();

  await adminPage.getByTestId('workspace-tab-assignments').click();
  await adminPage.getByTestId(`assignment-row-${studentAUser!.uid}`).click();
  await adminPage.getByTestId(`student-cohort-select-${studentAUser!.uid}`).selectOption(cohortA.id);
  await expect(adminPage.getByText('生徒のクラス/担当グループを更新しました。')).toBeVisible();

  await adminPage.getByTestId(`assignment-row-${studentBUser!.uid}`).click();
  await adminPage.getByTestId(`student-cohort-select-${studentBUser!.uid}`).selectOption(cohortB.id);
  await expect(adminPage.getByText('生徒のクラス/担当グループを更新しました。')).toBeVisible();

  await instructorPage.reload();
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  const visibleStudents = await storageAction<any[]>(instructorPage, 'getAllStudentsProgress');
  const visibleStudentA = visibleStudents.find((student) => student.uid === studentAUser!.uid);
  const visibleStudentB = visibleStudents.find((student) => student.uid === studentBUser!.uid);
  expect(visibleStudentA?.cohortId).toBe(cohortA.id);
  expect(visibleStudentB).toBeUndefined();

  await instructorPage.getByTestId('workspace-tab-students').click();
  await instructorPage.getByRole('button', { name: getInstructorSegmentLabel(visibleStudentA), exact: true }).first().click();
  await expect(instructorPage.getByTestId(`instructor-student-row-${studentAUser!.uid}`)).toBeVisible();
  await expect(instructorPage.getByTestId(`instructor-student-row-${studentBUser!.uid}`)).toHaveCount(0);

  await platformAdminContext.close();
  await adminContext.close();
  await instructorContext.close();
  await studentAContext.close();
  await studentBContext.close();
});

test('instructor can keep and send a fallback follow-up draft after an AI attempt', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await loginInstructorDemo(instructorPage);
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  const instructorUser = await getCurrentSessionUser(instructorPage);
  const studentUser = await getCurrentSessionUser(studentPage);
  expect(instructorUser?.uid).toBeTruthy();
  expect(studentUser?.uid).toBeTruthy();
  await storageAction(adminPage, 'assignStudentInstructor', {
    studentUid: studentUser!.uid,
    instructorUid: instructorUser!.uid,
  });

  await instructorPage.reload();
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();
  await instructorPage.getByTestId('workspace-tab-students').click();
  await instructorPage.locator('[data-testid^="send-notification-"]').first().click();

  await expect(instructorPage.getByTestId('notification-composer')).toBeVisible();
  const draftField = instructorPage.getByTestId('notification-message-draft');
  await expect(draftField).not.toHaveValue('');

  const aiDraftButton = instructorPage.getByRole('button', { name: 'AIで下書きを作る' });
  await aiDraftButton.click();
  await expect(aiDraftButton).toBeEnabled();
  await expect(draftField).not.toHaveValue('');

  await instructorPage.getByTestId('notification-send-submit').click();
  await expect(instructorPage.getByText(/フォロー通知を保存しました。/)).toBeVisible();

  await adminContext.close();
  await instructorContext.close();
  await studentContext.close();
});

test('admin reload sees organization KPI changes after notification and study', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const instructorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const instructorPage = await instructorContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await loginInstructorDemo(instructorPage);
  await expect(instructorPage.getByTestId('instructor-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  const instructorUser = await getCurrentSessionUser(instructorPage);
  const businessStudent = await getCurrentSessionUser(studentPage);
  expect(instructorUser?.uid).toBeTruthy();
  expect(businessStudent?.uid).toBeTruthy();

  await storageAction(adminPage, 'assignStudentInstructor', {
    studentUid: businessStudent?.uid,
    instructorUid: instructorUser?.uid,
  });

  const beforeSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const beforeTodayTrend = beforeSnapshot.trend[beforeSnapshot.trend.length - 1];

  await storageAction(instructorPage, 'sendInstructorNotification', {
    studentUid: businessStudent?.uid,
    message: '5語だけでも今日中に見直しましょう。',
    triggerReason: 'smoke-test',
    usedAi: false,
    interventionKind: 'REVIEW_RESTART',
  });

  const importResult = await seedPhrasebook(studentPage, 'Smoke KPI Drill');
  expect(importResult.importedBookIds?.[0]).toBeTruthy();
  if (!importResult.importedBookIds?.[0]) {
    throw new Error('Smoke KPI Drill did not return an imported book id.');
  }
  await studentPage.reload();
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('coach-follow-up-cta')).toBeVisible();
  await completeCoachCtaStudySession(studentPage);

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  const afterSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const afterTodayTrend = afterSnapshot.trend[afterSnapshot.trend.length - 1];
  const studentAfter = afterSnapshot.studentAssignments.find((student: { uid: string; hasReactivatedSinceNotification?: boolean }) => student.uid === businessStudent?.uid);

  expect(afterSnapshot.reactivatedStudents7d).toBeGreaterThanOrEqual(beforeSnapshot.reactivatedStudents7d);
  expect(afterTodayTrend?.reactivatedStudents || 0).toBeGreaterThanOrEqual(beforeTodayTrend?.reactivatedStudents || 0);
  expect(studentAfter?.hasReactivatedSinceNotification).toBeTruthy();

  await adminContext.close();
  await instructorContext.close();
  await studentContext.close();
});

test('group admin can issue a weekly mission and student can restart it from the dashboard', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();

  await loginGroupAdminDemo(adminPage);
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();

  await loginBusinessStudentDemo(studentPage);
  await maybeCompleteOnboarding(studentPage);
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();

  const businessStudent = await getCurrentSessionUser(studentPage);
  expect(businessStudent?.uid).toBeTruthy();
  const importResult = await seedPhrasebook(studentPage, 'Smoke Mission Drill');
  expect(importResult.importedBookIds?.[0]).toBeTruthy();
  if (!importResult.importedBookIds?.[0]) {
    throw new Error('Smoke Mission Drill did not return an imported book id.');
  }

  const beforeSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const weeklyMission = await storageAction<any>(adminPage, 'createWeeklyMission', {
    learningTrack: 'EIKEN_2',
    title: 'Smoke Weekly Mission',
    rationale: 'smoke mission distribution',
    bookId: importResult.importedBookIds[0],
    bookTitle: 'Smoke Mission Drill',
    newWordsTarget: 8,
    reviewWordsTarget: 4,
    quizTargetCount: 1,
  });
  await storageAction(adminPage, 'assignWeeklyMission', {
    missionId: weeklyMission.id,
    studentUid: businessStudent?.uid,
  });

  await studentPage.reload();
  await expect(studentPage.getByTestId('student-dashboard')).toBeVisible();
  await expect(studentPage.getByTestId('dashboard-mission-section')).toBeVisible();
  await expect(studentPage.getByText('Smoke Weekly Mission')).toBeVisible();

  await completeMissionCtaStudySession(studentPage);

  await adminPage.reload();
  await expect(adminPage.getByTestId('business-admin-dashboard')).toBeVisible();
  const afterSnapshot = await storageAction<any>(adminPage, 'getOrganizationDashboardSnapshot');
  const studentAfter = afterSnapshot.studentAssignments.find((student: { uid: string; primaryMissionStatus?: string; primaryMissionCompletionRate?: number }) => (
    student.uid === businessStudent?.uid
  ));

  expect(afterSnapshot.missionStartedRate).toBeGreaterThanOrEqual(beforeSnapshot.missionStartedRate);
  expect(studentAfter?.primaryMissionStatus).not.toBe('ASSIGNED');
  expect(studentAfter?.primaryMissionCompletionRate || 0).toBeGreaterThan(0);

  await adminContext.close();
  await studentContext.close();
});
