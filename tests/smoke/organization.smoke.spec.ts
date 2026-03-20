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
  storageAction,
  completeCoachCtaStudySession,
  completeMissionCtaStudySession,
} from './smoke-support';

test('group admin can open the organization dashboard and update an assignment', async ({ page }) => {
  await loginGroupAdminDemo(page);

  await expect(page.getByTestId('business-admin-dashboard')).toBeVisible();
  await expect(page.getByTestId('organization-kpi-trend-section')).toBeVisible();
  await page.getByTestId('workspace-tab-assignments').click();
  const assignmentSelect = page.locator('[data-testid^="assignment-select-"]').first();
  await assignmentSelect.selectOption({ index: 1 });

  await expect(page.getByText(/担当講師を .* に更新しました。/)).toBeVisible();
  await expect(page.getByTestId('assignment-history-section')).toContainText('変更者');
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
