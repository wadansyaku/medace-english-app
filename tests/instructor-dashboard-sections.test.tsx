import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import InstructorDashboardSections from '../components/dashboard/InstructorDashboardSections';
import type { useInstructorDashboardController } from '../hooks/useInstructorDashboardController';
import {
  InstructorWorkspaceView,
  StudentRiskLevel,
  UserRole,
  WeeklyMissionStatus,
  type StudentSummary,
  type UserProfile,
} from '../types';

type Controller = ReturnType<typeof useInstructorDashboardController>;
const user: UserProfile = {
  uid: 'demo-instructor',
  displayName: 'デモ講師',
  email: 'teacher@example.invalid',
  role: UserRole.INSTRUCTOR,
};
const student: StudentSummary = {
  uid: 'demo-student',
  name: 'デモ生徒',
  email: 'student@example.invalid',
  totalLearned: 0,
  totalAttempts: 0,
  lastActive: 0,
  riskLevel: StudentRiskLevel.DANGER,
  assignedInstructorUid: user.uid,
};
const render = (
  view: InstructorWorkspaceView,
  loaded: boolean,
  selectedStudent: StudentSummary | null = null,
  loading = false,
  overrides: Partial<React.ComponentProps<typeof InstructorDashboardSections>> = {},
) => {
  const rows = selectedStudent ? [selectedStudent] : [];
  const controller = {
    studentScope: 'ASSIGNED',
    filter: 'ALL',
    query: '',
    assignedStudents: rows,
    sortedStudents: rows,
    filteredStudents: rows,
    focusedStudent: selectedStudent,
    setStudentScope: vi.fn(),
    setFilter: vi.fn(),
    setQuery: vi.fn(),
    setFocusedStudentUid: vi.fn(),
    openComposer: vi.fn(),
  } as unknown as Controller;
  return renderToStaticMarkup(
    <InstructorDashboardSections
      user={user}
      onSelectBook={vi.fn()}
      activeView={view}
      onChangeView={vi.fn()}
      controller={controller}
      students={rows}
      writingAssignments={[]}
      writingQueue={[]}
      hasStudentsData={loaded}
      hasAssignmentsData={loaded}
      hasQueueData={loaded}
      loading={loading}
      {...overrides}
    />,
  );
};

describe('instructor workspace confirmed states', () => {
  it('shows actionable students once and keeps routine work in its existing tabs', () => {
    const controller = {
      studentScope: 'ASSIGNED',
      assignedStudents: [student],
      sortedStudents: [student, { ...student, uid: 'stable', name: '安定した生徒', riskLevel: StudentRiskLevel.SAFE }],
    } as unknown as Controller;
    const html = render(InstructorWorkspaceView.OVERVIEW, true, student, false, { controller });
    expect(html).toContain('対応が必要な生徒');
    expect(html.match(/デモ生徒/g)).toHaveLength(1);
    expect(html).not.toContain('安定した生徒');
    expect(html).not.toContain('小テスト・課題を準備');
    expect(html).not.toContain('単語の小テストを作る');
    expect(html).toContain('生徒一覧へ');
    expect(html).toContain('添削・返却を開く');
    expect(html).toContain('表示する生徒の範囲');
  });

  it('includes overdue work even for a safe student and preserves its deadline', () => {
    const html = render(InstructorWorkspaceView.OVERVIEW, true, {
      ...student, riskLevel: StudentRiskLevel.SAFE,
      primaryMissionStatus: WeeklyMissionStatus.OVERDUE, missionDueAt: 1780000000000,
    });
    expect(html).toContain('デモ生徒');
    expect(html).toContain('課題期限超過');
    expect(html).toContain('課題期限');
    expect(html).not.toContain('>安定<');
  });

  it('keeps partial acquisition unknown independently of the confirmed student collection', () => {
    const html = render(InstructorWorkspaceView.OVERVIEW, true, student, false, { hasQueueData: false });
    expect(html).toContain('デモ生徒');
    expect(html).toContain('添削待ちの有無をまだ確認できません');
    expect(html).not.toContain('現在、添削待ちの提出はありません');
    expect(html).toContain('再提出待ち');
    expect(html).toContain('>0件<');
  });

  it('bounds the overview without losing the path to all actionable students', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ ...student, uid: `synthetic-${index}`, name: `合成生徒${index}` }));
    const html = render(InstructorWorkspaceView.OVERVIEW, true, null, false, {
      controller: { studentScope: 'ASSIGNED', assignedStudents: rows, sortedStudents: rows } as unknown as Controller,
    });
    expect(html.match(/data-testid="instructor-action-student-/g)).toHaveLength(4);
    expect(html).toContain('対応が必要な5名と全生徒を見る');
    expect(html).not.toContain('合成生徒4');
  });

  it('opens the correct student details or notification composer without changing authorization scope', () => {
    const setFilter = vi.fn();
    const setQuery = vi.fn();
    const setFocusedStudentUid = vi.fn();
    const openComposer = vi.fn();
    const onChangeView = vi.fn();
    const controller = {
      studentScope: 'ASSIGNED', assignedStudents: [student], sortedStudents: [student],
      setFilter, setQuery, setFocusedStudentUid, openComposer,
    } as unknown as Controller;
    const view = InstructorDashboardSections({
      user, onSelectBook: vi.fn(), activeView: InstructorWorkspaceView.OVERVIEW,
      onChangeView, controller, students: [student], writingAssignments: [], writingQueue: [],
      hasStudentsData: true, hasAssignmentsData: true, hasQueueData: true, loading: false,
    });
    if (!React.isValidElement(view)) throw new Error('Instructor sections did not return an element.');
    const callbacks = new Map<string, () => void>();
    const visit = (node: React.ReactNode) => React.Children.forEach(node, (child) => {
      if (!React.isValidElement<{ children?: React.ReactNode; 'data-testid'?: string; onClick?: () => void }>(child)) return;
      if (child.type === 'button' && child.props['data-testid'] && child.props.onClick) callbacks.set(child.props['data-testid'], child.props.onClick);
      visit(child.props.children);
    });
    visit(view);
    callbacks.get(`instructor-action-details-${student.uid}`)!();
    expect(setFilter).toHaveBeenCalledWith('ALL');
    expect(setQuery).toHaveBeenCalledWith('');
    expect(setFocusedStudentUid).toHaveBeenCalledWith(student.uid);
    expect(onChangeView).toHaveBeenCalledWith(InstructorWorkspaceView.STUDENTS);
    callbacks.get(`send-notification-${student.uid}`)!();
    expect(openComposer).toHaveBeenCalledWith(student);
    expect(controller.studentScope).toBe('ASSIGNED');
  });

  it('does not turn missing collections into empty queues or zero students', () => {
    const html = render(InstructorWorkspaceView.OVERVIEW, false);
    expect(html).toContain('未取得');
    expect(html).toContain('添削待ちの有無をまだ確認できません');
    expect(html).not.toContain('添削待ちの提出はありません');
    expect(html).not.toContain('>0名<');
    expect(html).not.toContain('>0件<');
    expect(html).not.toContain('今日フォローが必要な生徒はいません');
  });

  it('shows an empty queue only after its collection was acquired', () => {
    const html = render(InstructorWorkspaceView.OVERVIEW, true);
    expect(html).toContain('現在、添削待ちの提出はありません');
    expect(html).toContain('>0件<');
    expect(html).toContain('担当設定');
  });

  it('distinguishes loading from failed acquisition', () => {
    const html = render(InstructorWorkspaceView.OVERVIEW, false, null, true);
    expect(html).toContain('担当生徒の状況を確認しています');
    expect(html).toContain('読込中');
    expect(html).not.toContain('>0名<');
  });

  it('keeps missing student metrics uncomputed and makes the next action prominent', () => {
    const html = render(InstructorWorkspaceView.STUDENTS, true, student);
    expect(html).toContain('未集計');
    expect(html).not.toContain('0%');
    expect(html).not.toContain('>0日<');
    expect(html.indexOf('次にできること')).toBeLessThan(html.indexOf('直近7日の学習'));
    expect(html).toContain('aria-controls="instructor-student-details"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('preserves measured zeroes rather than presenting them as missing', () => {
    const html = render(InstructorWorkspaceView.STUDENTS, true, {
      ...student,
      activeStudyDays7d: 0,
      primaryMissionCompletionRate: 0,
    });
    expect(html).toContain('>0日<');
    expect(html).toContain('>0%<');
    expect(html).toContain('未学習');
  });
});
