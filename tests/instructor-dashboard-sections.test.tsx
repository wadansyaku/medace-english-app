import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import InstructorDashboardSections from '../components/dashboard/InstructorDashboardSections';
import type { useInstructorDashboardController } from '../hooks/useInstructorDashboardController';
import {
  InstructorWorkspaceView,
  StudentRiskLevel,
  UserRole,
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
    />,
  );
};

describe('instructor workspace confirmed states', () => {
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
