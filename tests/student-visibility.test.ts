import { describe, expect, it } from 'vitest';

import {
  isStudentVisibleByAccessRule,
} from '../functions/_shared/student-visibility';
import {
  OrganizationRole,
  UserRole,
} from '../types';

describe('isStudentVisibleByAccessRule', () => {
  it('allows group admins to see every student in the organization', () => {
    expect(isStudentVisibleByAccessRule({
      userRole: UserRole.INSTRUCTOR,
      organizationRole: OrganizationRole.GROUP_ADMIN,
      currentUserId: 'group-admin-1',
      studentUid: 'student-1',
      studentCohortId: null,
    })).toBe(true);
  });

  it('allows instructors to see unassigned students in the same cohort', () => {
    expect(isStudentVisibleByAccessRule({
      userRole: UserRole.INSTRUCTOR,
      organizationRole: OrganizationRole.INSTRUCTOR,
      currentUserId: 'inst-1',
      studentUid: 'student-1',
      studentCohortId: 'cohort-a',
      instructorCohortIds: ['cohort-a'],
    })).toBe(true);
  });

  it('hides unassigned students in other cohorts from instructors', () => {
    expect(isStudentVisibleByAccessRule({
      userRole: UserRole.INSTRUCTOR,
      organizationRole: OrganizationRole.INSTRUCTOR,
      currentUserId: 'inst-1',
      studentUid: 'student-2',
      studentCohortId: 'cohort-b',
      instructorCohortIds: ['cohort-a'],
    })).toBe(false);
  });

  it('allows direct assignment even when cohort does not match', () => {
    expect(isStudentVisibleByAccessRule({
      userRole: UserRole.INSTRUCTOR,
      organizationRole: OrganizationRole.INSTRUCTOR,
      currentUserId: 'inst-1',
      studentUid: 'student-3',
      assignedInstructorUid: 'inst-1',
      studentCohortId: 'cohort-b',
      instructorCohortIds: ['cohort-a'],
    })).toBe(true);
  });

  it('hides unassigned and unscoped students from instructors', () => {
    expect(isStudentVisibleByAccessRule({
      userRole: UserRole.INSTRUCTOR,
      organizationRole: OrganizationRole.INSTRUCTOR,
      currentUserId: 'inst-1',
      studentUid: 'student-4',
      studentCohortId: null,
      instructorCohortIds: ['cohort-a'],
    })).toBe(false);
  });
});
