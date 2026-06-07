import { describe, expect, it, vi } from 'vitest';

const {
  readAllMock,
  readMissionAssignmentsByStudentMock,
  readWeaknessProfilesByUserIdsMock,
} = vi.hoisted(() => ({
  readAllMock: vi.fn(),
  readMissionAssignmentsByStudentMock: vi.fn(),
  readWeaknessProfilesByUserIdsMock: vi.fn(),
}));

vi.mock('../functions/_shared/storage-support', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/storage-support')>('../functions/_shared/storage-support');
  return {
    ...actual,
    readAll: readAllMock,
  };
});

vi.mock('../functions/_shared/storage-mission-actions', () => ({
  readMissionAssignmentsByStudent: readMissionAssignmentsByStudentMock,
}));

vi.mock('../functions/_shared/weakness-actions', () => ({
  readWeaknessProfilesByUserIds: readWeaknessProfilesByUserIdsMock,
}));

import { handleGetAllStudentsProgress } from '../functions/_shared/organization-student-read-model';
import { SubscriptionPlan, UserRole } from '../types';

const makeStudentRow = () => ({
  uid: 'student-1',
  name: 'Student One',
  email: 'student@example.test',
  subscription_plan: SubscriptionPlan.TOB_PAID,
  organization_name: 'Demo School',
  cohort_id: null,
  cohort_name: null,
  total_learned: 0,
  total_correct: 0,
  total_attempts: 0,
  last_active: null,
  active_study_days_7d: 0,
  last_notification_at: null,
  last_notification_message: null,
  last_intervention_kind: null,
  last_recommended_action_type: null,
  last_reactivated_at: null,
  assigned_instructor_uid: null,
  assigned_instructor_name: null,
  assignment_updated_at: null,
  has_learning_plan: 0,
});

describe('organization student read model', () => {
  it('filters book-linked English practice attempts by learner-selectable material quality', async () => {
    readAllMock.mockReset();
    readMissionAssignmentsByStudentMock.mockReset();
    readWeaknessProfilesByUserIdsMock.mockReset();
    readAllMock
      .mockResolvedValueOnce([makeStudentRow()])
      .mockResolvedValueOnce([]);
    readMissionAssignmentsByStudentMock.mockResolvedValue(new Map());
    readWeaknessProfilesByUserIdsMock.mockResolvedValue(new Map());

    await handleGetAllStudentsProgress({ DB: { prepare: vi.fn() } } as any, {
      id: 'admin-1',
      role: UserRole.ADMIN,
    } as any);

    const practiceSql = readAllMock.mock.calls[1]?.[1] as string;
    expect(practiceSql).toContain('FROM english_practice_attempts e');
    expect(practiceSql).toContain('LEFT JOIN books b ON b.id = e.book_id');
    expect(practiceSql).toContain('LEFT JOIN material_source_ledger m ON m.book_id = b.id');
    expect(practiceSql).toContain('e.book_id IS NULL');
    expect(practiceSql).toContain('b.created_by = e.user_id');
    expect(practiceSql).toContain("m.rights_status = 'approved'");
    expect(practiceSql).toContain("m.review_status = 'approved'");
    expect(practiceSql).toContain('COALESCE(m.qa_required_blank_rows, 0) = 0');
  });
});
