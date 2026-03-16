import { describe, expect, it } from 'vitest';

import {
  buildAssignedStudentCountsByDate,
  buildOrganizationKpiSeries,
  toOrganizationKpiTrendPoints,
} from '../functions/_shared/organization-kpi';

const tokyoMs = (dateTime: string): number => Date.parse(`${dateTime}+09:00`);

describe('organization KPI aggregation', () => {
  it('does not count quiz-only activity as active or reactivated', () => {
    const series = buildOrganizationKpiSeries({
      organizationId: 'org_demo_academy',
      organizationName: 'Steady Study Demo Academy',
      dateKeys: ['2026-03-12', '2026-03-13'],
      students: [
        { uid: 'student-1', createdAt: tokyoMs('2026-03-10T09:00:00') },
      ],
      plans: [],
      currentAssignments: [],
      assignmentEvents: [],
      studyEvents: [
        { studentUid: 'student-1', studiedAt: tokyoMs('2026-03-12T10:00:00'), interactionSource: 'QUIZ' },
      ],
      notifications: [
        { studentUid: 'student-1', createdAt: tokyoMs('2026-03-12T08:00:00') },
      ],
    });

    expect(series.dailySnapshots[0]).toMatchObject({
      snapshotDate: '2026-03-12',
      activeStudents: 0,
      notifications: 1,
      notifiedStudents: 1,
      reactivatedStudents: 0,
    });
    expect(series.summary7d.reactivatedStudents7d).toBe(0);
  });

  it('replays assignment events backwards to restore per-day assigned counts', () => {
    const counts = buildAssignedStudentCountsByDate(
      ['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'],
      [
        { studentUid: 'student-2', instructorUid: 'inst-1' },
      ],
      [
        {
          studentUid: 'student-1',
          previousInstructorUid: null,
          nextInstructorUid: 'inst-1',
          createdAt: tokyoMs('2026-03-11T09:00:00'),
        },
        {
          studentUid: 'student-2',
          previousInstructorUid: null,
          nextInstructorUid: 'inst-1',
          createdAt: tokyoMs('2026-03-12T10:00:00'),
        },
        {
          studentUid: 'student-1',
          previousInstructorUid: 'inst-1',
          nextInstructorUid: null,
          createdAt: tokyoMs('2026-03-13T08:00:00'),
        },
      ],
    );

    expect(counts.get('2026-03-10')).toBe(0);
    expect(counts.get('2026-03-11')).toBe(1);
    expect(counts.get('2026-03-12')).toBe(2);
    expect(counts.get('2026-03-13')).toBe(1);
  });

  it('fills missing trend days with zeros and avoids divide-by-zero rates', () => {
    const trend = toOrganizationKpiTrendPoints(
      [
        {
          organizationId: 'org_demo_academy',
          organizationName: 'Steady Study Demo Academy',
          snapshotDate: '2026-03-12',
          totalStudents: 0,
          assignedStudents: 0,
          planStudents: 0,
          activeStudents: 0,
          notifications: 0,
          notifiedStudents: 0,
          reactivatedStudents: 0,
          students4PlusDaysActive: 0,
          atRiskStudents: 0,
          followedUpAtRiskStudents: 0,
        },
      ],
      ['2026-03-11', '2026-03-12', '2026-03-13'],
    );

    expect(trend).toHaveLength(3);
    expect(trend[0]).toMatchObject({
      date: '2026-03-11',
      totalStudents: 0,
      assignmentCoverageRate: 0,
      planCoverageRate: 0,
      reactivationRate: 0,
      weeklyContinuityRate: 0,
      followUpCoverageRate48h: 0,
    });
    expect(trend[1].reactivationRate).toBe(0);
    expect(trend[2]).toMatchObject({
      date: '2026-03-13',
      notifications: 0,
      reactivatedStudents: 0,
    });
  });

  it('tracks weekly continuity and 48-hour follow-up coverage in trend points', () => {
    const series = buildOrganizationKpiSeries({
      organizationId: 'org_demo_academy',
      organizationName: 'Steady Study Demo Academy',
      dateKeys: ['2026-03-13'],
      students: [
        { uid: 'student-1', createdAt: tokyoMs('2026-03-01T09:00:00') },
      ],
      plans: [],
      currentAssignments: [],
      assignmentEvents: [],
      studyEvents: [
        { studentUid: 'student-1', studiedAt: tokyoMs('2026-03-07T09:00:00'), interactionSource: 'STUDY' },
        { studentUid: 'student-1', studiedAt: tokyoMs('2026-03-08T09:00:00'), interactionSource: 'STUDY' },
        { studentUid: 'student-1', studiedAt: tokyoMs('2026-03-09T09:00:00'), interactionSource: 'STUDY' },
        { studentUid: 'student-1', studiedAt: tokyoMs('2026-03-10T09:00:00'), interactionSource: 'STUDY' },
      ],
      notifications: [
        { studentUid: 'student-1', createdAt: tokyoMs('2026-03-12T10:00:00') },
      ],
    });

    const [point] = toOrganizationKpiTrendPoints(series.dailySnapshots, ['2026-03-13']);
    expect(point).toMatchObject({
      students4PlusDaysActive: 1,
      atRiskStudents: 1,
      followedUpAtRiskStudents: 1,
      weeklyContinuityRate: 100,
      followUpCoverageRate48h: 100,
    });
  });
});
