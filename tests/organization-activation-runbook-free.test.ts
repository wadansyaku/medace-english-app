import { describe, expect, it } from 'vitest';

import { buildOrganizationActivationRunbook } from '../shared/organizationActivationRunbook';
import {
  BusinessAdminWorkspaceView,
  type OrganizationActivationStep,
} from '../types';

const organizationId = 'synthetic-free-runbook-organization';
const basicSteps: OrganizationActivationStep[] = [
  { id: 'CREATE_COHORT', label: 'クラス', description: 'クラスの作成', done: true,
    target: { kind: 'ORGANIZATION_SETTINGS', targetView: BusinessAdminWorkspaceView.SETTINGS, organizationId } },
  { id: 'ASSIGN_STUDENTS', label: '担当割当', description: '担当講師の割当', done: true,
    target: { kind: 'STUDENT_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.ASSIGNMENTS, organizationId } },
  { id: 'CREATE_FIRST_MISSION', label: '初回ミッション', description: '週次課題の配布', done: true,
    target: { kind: 'MISSION_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.ASSIGNMENTS, organizationId } },
  { id: 'SEND_FIRST_NOTIFICATION', label: '初回通知', description: '講師からの通知', done: true,
    target: { kind: 'INSTRUCTOR_NOTIFICATION', targetView: BusinessAdminWorkspaceView.INSTRUCTORS, organizationId } },
];
const writingSteps: OrganizationActivationStep[] = [
  { id: 'ISSUE_FIRST_WRITING_ASSIGNMENT', label: '作文配布', description: '作文の配布', done: false,
    target: { kind: 'WRITING_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.WRITING, organizationId } },
  { id: 'WAIT_FOR_FIRST_WRITING_SUBMISSION', label: '作文提出', description: '作文の提出', done: false,
    target: { kind: 'WRITING_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.WRITING, organizationId } },
  { id: 'REVIEW_FIRST_WRITING_SUBMISSION', label: '作文返却', description: '作文の返却', done: false,
    target: { kind: 'WRITING_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.WRITING, organizationId } },
];
const input = {
  organizationId,
  totalStudents: 1,
  activationSteps: [...basicSteps, ...writingSteps],
  historyBasedWorksheetStudentCount: 1,
};
const freeStageIds = ['cohort', 'assignment', 'mission', 'notification', 'worksheet'];

describe('organization activation runbook without writing entitlement', () => {
  it('finishes the basic and worksheet stages without requiring inaccessible writing', () => {
    const before = JSON.stringify(input);
    const runbook = buildOrganizationActivationRunbook({ ...input, includeWriting: false });
    expect(runbook.stages.map(stage => stage.id)).toEqual(freeStageIds);
    expect(runbook).toMatchObject({ completedStageCount: 5, totalStageCount: 5, progressPercent: 100,
      currentStage: null, stalledStage: null });
    expect(runbook.stages.every(stage => stage.status === 'complete')).toBe(true);
    expect(runbook.stages.some(stage => stage.target?.targetView === BusinessAdminWorkspaceView.WRITING)).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    ['CREATE_COHORT', 'cohort'],
    ['ASSIGN_STUDENTS', 'assignment'],
    ['CREATE_FIRST_MISSION', 'mission'],
    ['SEND_FIRST_NOTIFICATION', 'notification'],
  ] as const)('retains the incomplete %s stage and its actual navigation target', (stepId, stageId) => {
    const activationSteps = basicSteps.map(step => ({ ...step, done: step.id !== stepId }));
    const runbook = buildOrganizationActivationRunbook({ ...input, activationSteps, includeWriting: false });
    expect(runbook.stages.map(stage => stage.id)).toEqual(freeStageIds);
    expect(runbook.currentStage).toMatchObject({ id: stageId, status: 'stalled',
      target: basicSteps.find(step => step.id === stepId)!.target });
    expect(runbook.stalledStage).toEqual(runbook.currentStage);
    expect(runbook).toMatchObject({ completedStageCount: 4, totalStageCount: 5, progressPercent: 80 });
    expect(runbook.stages.some(stage => stage.target?.targetView === BusinessAdminWorkspaceView.WRITING)).toBe(false);
  });

  it('keeps fallback PDF candidates distinct from completed history-based worksheet preparation', () => {
    const runbook = buildOrganizationActivationRunbook({ ...input, includeWriting: false,
      historyBasedWorksheetStudentCount: 0, fallbackWorksheetStudentCount: 1 });
    expect(runbook).toMatchObject({ completedStageCount: 4, totalStageCount: 5, progressPercent: 80 });
    expect(runbook.currentStage).toMatchObject({ id: 'worksheet', status: 'stalled',
      actionLabel: '履歴ベースのPDF問題を作る',
      target: { kind: 'WORKSHEET', targetView: BusinessAdminWorkspaceView.WORKSHEETS, organizationId } });
    expect(runbook.stalledStage?.stalledReason).toContain('代替候補のみ');
    expect(runbook.worksheet).toMatchObject({ historyBasedStudentCount: 0, fallbackStudentCount: 1,
      hasOnlyFallback: true, sourceLabel: '履歴ベース 0名 / 代替候補 1名' });
  });

  it('ignores old writing records and writing step completion once writing is excluded', () => {
    const clean = buildOrganizationActivationRunbook({ ...input, includeWriting: false });
    const withOldWriting = buildOrganizationActivationRunbook({ ...input, includeWriting: false,
      activationSteps: [...basicSteps, ...writingSteps.map(step => ({ ...step, done: true }))],
      issuedWritingAssignmentCount: 9, submittedWritingAssignmentCount: 7,
      reviewReadyWritingAssignmentCount: 3, reviewedWritingAssignmentCount: 4 });
    expect(withOldWriting).toEqual(clean);
    expect(JSON.stringify(withOldWriting)).not.toContain('WRITING_ASSIGNMENT');
    expect(JSON.stringify(withOldWriting)).not.toContain('作文');
  });
});

describe('paid organization writing runbook compatibility', () => {
  it('keeps writing enabled by default and matches explicit paid inclusion', () => {
    const defaultRunbook = buildOrganizationActivationRunbook(input);
    expect(defaultRunbook).toEqual(buildOrganizationActivationRunbook({ ...input, includeWriting: true }));
    expect(defaultRunbook.stages.map(stage => stage.id)).toEqual([...freeStageIds, 'writing', 'submission', 'review']);
    expect(defaultRunbook).toMatchObject({ completedStageCount: 5, totalStageCount: 8, progressPercent: 63 });
    expect(defaultRunbook.currentStage).toMatchObject({ id: 'writing', status: 'stalled',
      target: { kind: 'WRITING_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.WRITING } });
  });

  it('still waits for an actual student submission after paid writing distribution', () => {
    const activationSteps = [...basicSteps, ...writingSteps.map(step => ({ ...step,
      done: step.id === 'ISSUE_FIRST_WRITING_ASSIGNMENT' }))];
    const runbook = buildOrganizationActivationRunbook({ ...input, includeWriting: true, activationSteps,
      issuedWritingAssignmentCount: 1 });
    expect(runbook.currentStage).toMatchObject({ id: 'submission', status: 'stalled',
      actionLabel: '提出状況を確認する',
      target: { kind: 'WRITING_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.WRITING } });
    expect(runbook.stalledStage?.stalledReason).toContain('提出がまだありません');
    expect(runbook).toMatchObject({ completedStageCount: 6, totalStageCount: 8, progressPercent: 75 });
  });

  it('keeps paid teacher review pending until an actual return is recorded', () => {
    const activationSteps = [...basicSteps, ...writingSteps.map(step => ({ ...step,
      done: step.id !== 'REVIEW_FIRST_WRITING_SUBMISSION' }))];
    const runbook = buildOrganizationActivationRunbook({ ...input, includeWriting: true, activationSteps,
      issuedWritingAssignmentCount: 1, submittedWritingAssignmentCount: 1, reviewReadyWritingAssignmentCount: 1 });
    expect(runbook.currentStage).toMatchObject({ id: 'review', status: 'stalled', actionLabel: '作文を返却する',
      target: { kind: 'WRITING_ASSIGNMENT', targetView: BusinessAdminWorkspaceView.WRITING } });
    expect(runbook.stalledStage?.stalledReason).toContain('添削待ちの作文');
    expect(runbook).toMatchObject({ completedStageCount: 7, totalStageCount: 8, progressPercent: 88 });
    const returned = buildOrganizationActivationRunbook({ ...input, includeWriting: true, activationSteps,
      issuedWritingAssignmentCount: 1, submittedWritingAssignmentCount: 1, reviewedWritingAssignmentCount: 1 });
    expect(returned).toMatchObject({ completedStageCount: 8, totalStageCount: 8, progressPercent: 100,
      currentStage: null, stalledStage: null });
  });
});
