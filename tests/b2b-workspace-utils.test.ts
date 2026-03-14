import { describe, expect, it } from 'vitest';

import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import {
  StudentRiskLevel,
  type StudentSummary,
  type WritingAssignment,
  type WritingQueueItem,
} from '../types';
import {
  filterAssignmentStudents,
  resolveSelectedAssignmentStudentUid,
} from '../utils/businessAdminDashboard';
import {
  filterStudentsForInstructorView,
  resolveFocusedStudentUid,
  sortStudentsByPriority,
} from '../utils/instructorDashboard';
import {
  resolveSelectedAssignmentId,
  resolveSelectedEvaluationId,
  resolveSelectedSubmissionId,
} from '../utils/writingOps';

const makeStudent = (overrides: Partial<StudentSummary>): StudentSummary => ({
  uid: overrides.uid || 'student-1',
  name: overrides.name || 'Alpha',
  email: overrides.email || 'alpha@example.com',
  totalLearned: overrides.totalLearned || 10,
  totalAttempts: overrides.totalAttempts || 12,
  lastActive: overrides.lastActive || 100,
  riskLevel: overrides.riskLevel || StudentRiskLevel.SAFE,
  ...overrides,
});

describe('b2b workspace helpers', () => {
  it('filters assignment students by risk, assignment state, and query', () => {
    const students = [
      makeStudent({ uid: 'danger-unassigned', name: 'Danger Uno', email: 'danger@example.com', riskLevel: StudentRiskLevel.DANGER }),
      makeStudent({ uid: 'warning-assigned', name: 'Warning Duo', email: 'warning@example.com', riskLevel: StudentRiskLevel.WARNING, assignedInstructorUid: 'inst-1' }),
      makeStudent({ uid: 'safe-unassigned', name: 'Safe Trio', email: 'safe@example.com', riskLevel: StudentRiskLevel.SAFE }),
    ];

    expect(filterAssignmentStudents(students, 'DANGER', '').map((student) => student.uid)).toEqual(['danger-unassigned']);
    expect(filterAssignmentStudents(students, 'UNASSIGNED', '').map((student) => student.uid)).toEqual(['danger-unassigned', 'safe-unassigned']);
    expect(filterAssignmentStudents(students, 'ALL', 'warning').map((student) => student.uid)).toEqual(['warning-assigned']);
  });

  it('repairs assignment and instructor selections when the current row disappears', () => {
    const filteredStudents = [
      makeStudent({ uid: 'student-a' }),
      makeStudent({ uid: 'student-b' }),
    ];

    expect(resolveSelectedAssignmentStudentUid(filteredStudents, 'missing')).toBe('student-a');
    expect(resolveFocusedStudentUid(filteredStudents, 'missing')).toBe('student-a');
    expect(resolveSelectedAssignmentStudentUid([], 'student-a')).toBeNull();
    expect(resolveFocusedStudentUid([], 'student-a')).toBeNull();
  });

  it('sorts instructor student queues by risk first and oldest activity next', () => {
    const students = [
      makeStudent({ uid: 'safe', riskLevel: StudentRiskLevel.SAFE, lastActive: 500 }),
      makeStudent({ uid: 'warning-recent', riskLevel: StudentRiskLevel.WARNING, lastActive: 400 }),
      makeStudent({ uid: 'danger-recent', riskLevel: StudentRiskLevel.DANGER, lastActive: 300 }),
      makeStudent({ uid: 'danger-oldest', riskLevel: StudentRiskLevel.DANGER, lastActive: 100 }),
    ];

    expect(sortStudentsByPriority(students).map((student) => student.uid)).toEqual([
      'danger-oldest',
      'danger-recent',
      'warning-recent',
      'safe',
    ]);

    expect(filterStudentsForInstructorView(sortStudentsByPriority(students), 'WARNING', '').map((student) => student.uid)).toEqual([
      'danger-oldest',
      'danger-recent',
      'warning-recent',
    ]);
  });

  it('repairs writing review selections to the first available item', () => {
    const assignments = [
      { id: 'assignment-a' },
      { id: 'assignment-b' },
    ] as WritingAssignment[];
    const reviewList = [
      { submissionId: 'submission-a' },
      { submissionId: 'submission-b' },
    ] as WritingQueueItem[];

    expect(resolveSelectedAssignmentId(assignments, 'missing')).toBe('assignment-a');
    expect(resolveSelectedSubmissionId(reviewList, 'missing')).toBe('submission-a');
    expect(resolveSelectedAssignmentId([], 'assignment-a')).toBe('');
    expect(resolveSelectedSubmissionId([], 'submission-a')).toBe('');
  });

  it('falls back to the stored teacher-selected evaluation when the current selection disappears', () => {
    const detail = {
      submission: {
        evaluations: [
          { id: 'eval-a', isDefault: false },
          { id: 'eval-b', isDefault: true },
        ],
        teacherReview: {
          selectedEvaluationId: 'eval-a',
        },
        selectedEvaluationId: 'eval-b',
      },
    } as WritingSubmissionDetailResponse;

    expect(resolveSelectedEvaluationId(detail, 'missing')).toBe('eval-a');
    expect(resolveSelectedEvaluationId(detail, 'eval-b')).toBe('eval-b');
  });
});
