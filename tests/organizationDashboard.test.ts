import { describe, expect, it } from 'vitest';

import { buildOrganizationDashboardSnapshot } from '../functions/_shared/organization-dashboard';
import { OrganizationRole, StudentRiskLevel, SubscriptionPlan, type AssignmentEvent, type OrganizationInstructorSummary, type StudentSummary } from '../types';

const instructors: OrganizationInstructorSummary[] = [
  {
    uid: 'inst-1',
    displayName: 'Oak 先生',
    email: 'oak@example.com',
    organizationRole: OrganizationRole.INSTRUCTOR,
    notifiedStudentCount: 2,
    notifications7d: 3,
    assignedStudentCount: 2,
  },
];

const students: StudentSummary[] = [
  {
    uid: 'student-a',
    name: 'Alpha',
    email: 'alpha@example.com',
    totalLearned: 20,
    totalAttempts: 30,
    lastActive: 1_000_000,
    riskLevel: StudentRiskLevel.DANGER,
    assignedInstructorUid: 'inst-1',
    assignedInstructorName: 'Oak 先生',
  },
  {
    uid: 'student-b',
    name: 'Beta',
    email: 'beta@example.com',
    totalLearned: 12,
    totalAttempts: 20,
    lastActive: 100_000,
    riskLevel: StudentRiskLevel.WARNING,
  },
  {
    uid: 'student-c',
    name: 'Gamma',
    email: 'gamma@example.com',
    totalLearned: 42,
    totalAttempts: 55,
    lastActive: 1_200_000,
    riskLevel: StudentRiskLevel.SAFE,
    assignedInstructorUid: 'inst-1',
    assignedInstructorName: 'Oak 先生',
  },
];

const assignmentEvents: AssignmentEvent[] = [
  {
    id: 1,
    studentUid: 'student-a',
    studentName: 'Alpha',
    nextInstructorUid: 'inst-1',
    nextInstructorName: 'Oak 先生',
    changedByUid: 'admin-1',
    changedByName: 'Manager',
    createdAt: 1_300_000,
  },
];

describe('buildOrganizationDashboardSnapshot', () => {
  it('calculates rates and sorts the queue from full student data, not the truncated list', () => {
    const snapshot = buildOrganizationDashboardSnapshot({
      organizationName: 'Steady Study Demo Academy',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      totalMembers: 5,
      totalInstructors: 1,
      learningPlanCount: 2,
      notifications7d: 4,
      instructors,
      students,
      assignmentEvents,
      reactivatedStudents7d: 2,
      notifiedStudents7d: 4,
      now: 2_000_000,
    });

    expect(snapshot.totalStudents).toBe(3);
    expect(snapshot.activeStudents7d).toBe(3);
    expect(snapshot.atRiskStudents).toBe(2);
    expect(snapshot.assignmentCoverageRate).toBe(67);
    expect(snapshot.unassignedStudents).toBe(1);
    expect(snapshot.reactivationRate7d).toBe(50);
    expect(snapshot.studentAssignments.map((student) => student.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(snapshot.atRiskStudentList.map((student) => student.name)).toEqual(['Beta', 'Alpha']);
    expect(snapshot.assignmentEvents).toHaveLength(1);
  });
});
