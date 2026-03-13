import { isStudyInteractionSource } from '../../shared/learningHistory';
import { shiftDateKey } from '../../utils/date';
import type { OrganizationKpiTrendPoint } from '../../types';
import type { AppEnv } from './types';
import {
  DAY_MS,
  getLastTokyoDateKeys,
  readAll,
  toTokyoDateKey,
} from './storage-support';

export const ORGANIZATION_KPI_TREND_DAYS = 14;
export const ORGANIZATION_KPI_SUMMARY_DAYS = 7;
export const ORGANIZATION_KPI_REACTIVATION_WINDOW_MS = 3 * DAY_MS;

export interface OrganizationKpiStudentRow {
  uid: string;
  createdAt: number;
}

export interface OrganizationKpiPlanRow {
  userUid: string;
  createdAt: number;
}

export interface OrganizationKpiAssignmentStateRow {
  studentUid: string;
  instructorUid: string | null;
}

export interface OrganizationKpiAssignmentEventRow {
  studentUid: string;
  previousInstructorUid: string | null;
  nextInstructorUid: string | null;
  createdAt: number;
}

export interface OrganizationKpiStudyEventRow {
  studentUid: string;
  studiedAt: number;
  interactionSource?: 'STUDY' | 'QUIZ' | null;
}

export interface OrganizationKpiNotificationRow {
  studentUid: string;
  createdAt: number;
}

export interface OrganizationKpiDailySnapshot {
  organizationName: string;
  snapshotDate: string;
  totalStudents: number;
  assignedStudents: number;
  planStudents: number;
  activeStudents: number;
  notifications: number;
  notifiedStudents: number;
  reactivatedStudents: number;
}

export interface OrganizationKpiSummary7d {
  notifications7d: number;
  notifiedStudents7d: number;
  reactivatedStudents7d: number;
}

export interface OrganizationKpiSeriesResult {
  dailySnapshots: OrganizationKpiDailySnapshot[];
  summary7d: OrganizationKpiSummary7d;
}

export interface RebuildOrganizationKpiSnapshotsOptions {
  dateKeys?: string[];
}

const TOKYO_OFFSET = '+09:00';

const toTokyoDayStart = (dateKey: string): number => Date.parse(`${dateKey}T00:00:00${TOKYO_OFFSET}`);

const toTokyoNextDayStart = (dateKey: string): number => Date.parse(`${shiftDateKey(dateKey, 1)}T00:00:00${TOKYO_OFFSET}`);

const sortDateKeysAscending = (dateKeys: string[]): string[] => [...new Set(dateKeys)].sort((left, right) => left.localeCompare(right));

const createDailySnapshot = (organizationName: string, snapshotDate: string): OrganizationKpiDailySnapshot => ({
  organizationName,
  snapshotDate,
  totalStudents: 0,
  assignedStudents: 0,
  planStudents: 0,
  activeStudents: 0,
  notifications: 0,
  notifiedStudents: 0,
  reactivatedStudents: 0,
});

const roundPercentage = (value: number, total: number): number => (
  total > 0 ? Math.round((value / total) * 100) : 0
);

const findFirstValueAtOrAfter = (values: number[], target: number): number | null => {
  let low = 0;
  let high = values.length - 1;
  let answer = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] >= target) {
      answer = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return answer >= 0 ? values[answer] : null;
};

const buildPlanCreatedAtByUser = (plans: OrganizationKpiPlanRow[]): Map<string, number> => {
  const createdAtByUser = new Map<string, number>();
  plans.forEach((plan) => {
    const current = createdAtByUser.get(plan.userUid);
    if (current === undefined || plan.createdAt < current) {
      createdAtByUser.set(plan.userUid, plan.createdAt);
    }
  });
  return createdAtByUser;
};

export const buildAssignedStudentCountsByDate = (
  dateKeys: string[],
  currentAssignments: OrganizationKpiAssignmentStateRow[],
  assignmentEvents: OrganizationKpiAssignmentEventRow[],
): Map<string, number> => {
  const orderedKeys = sortDateKeysAscending(dateKeys);
  const orderedKeysDesc = [...orderedKeys].reverse();
  const eventsDesc = [...assignmentEvents].sort((left, right) => right.createdAt - left.createdAt);
  const assignedStudentUids = new Set(
    currentAssignments
      .filter((row) => row.instructorUid)
      .map((row) => row.studentUid),
  );
  const countsByDate = new Map<string, number>();
  let eventIndex = 0;

  orderedKeysDesc.forEach((dateKey) => {
    const nextDayStart = toTokyoNextDayStart(dateKey);
    while (eventIndex < eventsDesc.length && eventsDesc[eventIndex].createdAt >= nextDayStart) {
      const event = eventsDesc[eventIndex];
      if (event.nextInstructorUid && !event.previousInstructorUid) {
        assignedStudentUids.delete(event.studentUid);
      } else if (!event.nextInstructorUid && event.previousInstructorUid) {
        assignedStudentUids.add(event.studentUid);
      }
      eventIndex += 1;
    }
    countsByDate.set(dateKey, assignedStudentUids.size);
  });

  return countsByDate;
};

export const buildOrganizationKpiSeries = ({
  organizationName,
  students,
  plans,
  currentAssignments,
  assignmentEvents,
  studyEvents,
  notifications,
  dateKeys = getLastTokyoDateKeys(ORGANIZATION_KPI_TREND_DAYS),
}: {
  organizationName: string;
  students: OrganizationKpiStudentRow[];
  plans: OrganizationKpiPlanRow[];
  currentAssignments: OrganizationKpiAssignmentStateRow[];
  assignmentEvents: OrganizationKpiAssignmentEventRow[];
  studyEvents: OrganizationKpiStudyEventRow[];
  notifications: OrganizationKpiNotificationRow[];
  dateKeys?: string[];
}): OrganizationKpiSeriesResult => {
  const orderedKeys = sortDateKeysAscending(dateKeys);
  const countsByAssignmentDate = buildAssignedStudentCountsByDate(orderedKeys, currentAssignments, assignmentEvents);
  const recentSummaryKeys = new Set(getLastTokyoDateKeys(ORGANIZATION_KPI_SUMMARY_DAYS));
  const snapshotsByDate = new Map<string, OrganizationKpiDailySnapshot>();
  const activeStudentsByDate = new Map<string, Set<string>>();
  const notifiedStudentsByDate = new Map<string, Set<string>>();
  const reactivatedStudentsByDate = new Map<string, Set<string>>();
  const studyTimesByStudent = new Map<string, number[]>();
  const planCreatedAtByUser = buildPlanCreatedAtByUser(plans);
  const summary7d = {
    notifications7d: 0,
    notifiedStudents7d: new Set<string>(),
    reactivatedStudents7d: new Set<string>(),
  };

  orderedKeys.forEach((dateKey) => {
    snapshotsByDate.set(dateKey, createDailySnapshot(organizationName, dateKey));
    activeStudentsByDate.set(dateKey, new Set<string>());
    notifiedStudentsByDate.set(dateKey, new Set<string>());
    reactivatedStudentsByDate.set(dateKey, new Set<string>());
  });

  studyEvents.forEach((event) => {
    if (!isStudyInteractionSource(event.interactionSource)) return;
    const studyTimes = studyTimesByStudent.get(event.studentUid) || [];
    studyTimes.push(event.studiedAt);
    studyTimesByStudent.set(event.studentUid, studyTimes);
    const dateKey = toTokyoDateKey(event.studiedAt);
    activeStudentsByDate.get(dateKey)?.add(event.studentUid);
  });

  studyTimesByStudent.forEach((times) => {
    times.sort((left, right) => left - right);
  });

  students.forEach((student) => {
    orderedKeys.forEach((dateKey) => {
      if (student.createdAt < toTokyoNextDayStart(dateKey)) {
        const snapshot = snapshotsByDate.get(dateKey);
        if (snapshot) snapshot.totalStudents += 1;
      }
    });
  });

  planCreatedAtByUser.forEach((createdAt) => {
    orderedKeys.forEach((dateKey) => {
      if (createdAt < toTokyoNextDayStart(dateKey)) {
        const snapshot = snapshotsByDate.get(dateKey);
        if (snapshot) snapshot.planStudents += 1;
      }
    });
  });

  orderedKeys.forEach((dateKey) => {
    const snapshot = snapshotsByDate.get(dateKey)!;
    snapshot.assignedStudents = countsByAssignmentDate.get(dateKey) || 0;
  });

  notifications.forEach((notification) => {
    const dateKey = toTokyoDateKey(notification.createdAt);
    const snapshot = snapshotsByDate.get(dateKey);
    if (snapshot) {
      snapshot.notifications += 1;
      notifiedStudentsByDate.get(dateKey)?.add(notification.studentUid);
    }

    if (recentSummaryKeys.has(dateKey)) {
      summary7d.notifications7d += 1;
      summary7d.notifiedStudents7d.add(notification.studentUid);
    }

    const firstStudyAt = findFirstValueAtOrAfter(
      studyTimesByStudent.get(notification.studentUid) || [],
      notification.createdAt,
    );
    if (firstStudyAt === null || firstStudyAt > notification.createdAt + ORGANIZATION_KPI_REACTIVATION_WINDOW_MS) {
      return;
    }

    reactivatedStudentsByDate.get(dateKey)?.add(notification.studentUid);
    if (recentSummaryKeys.has(dateKey)) {
      summary7d.reactivatedStudents7d.add(notification.studentUid);
    }
  });

  orderedKeys.forEach((dateKey) => {
    const snapshot = snapshotsByDate.get(dateKey)!;
    snapshot.activeStudents = activeStudentsByDate.get(dateKey)?.size || 0;
    snapshot.notifiedStudents = notifiedStudentsByDate.get(dateKey)?.size || 0;
    snapshot.reactivatedStudents = reactivatedStudentsByDate.get(dateKey)?.size || 0;
  });

  return {
    dailySnapshots: orderedKeys.map((dateKey) => snapshotsByDate.get(dateKey)!),
    summary7d: {
      notifications7d: summary7d.notifications7d,
      notifiedStudents7d: summary7d.notifiedStudents7d.size,
      reactivatedStudents7d: summary7d.reactivatedStudents7d.size,
    },
  };
};

export const toOrganizationKpiTrendPoints = (
  snapshots: OrganizationKpiDailySnapshot[],
  dateKeys = getLastTokyoDateKeys(ORGANIZATION_KPI_TREND_DAYS),
): OrganizationKpiTrendPoint[] => {
  const orderedKeys = sortDateKeysAscending(dateKeys);
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.snapshotDate, snapshot]));

  return orderedKeys.map((dateKey) => {
    const snapshot = snapshotMap.get(dateKey) || createDailySnapshot('', dateKey);
    return {
      date: dateKey,
      totalStudents: snapshot.totalStudents,
      assignedStudents: snapshot.assignedStudents,
      planStudents: snapshot.planStudents,
      activeStudents: snapshot.activeStudents,
      notifications: snapshot.notifications,
      notifiedStudents: snapshot.notifiedStudents,
      reactivatedStudents: snapshot.reactivatedStudents,
      assignmentCoverageRate: roundPercentage(snapshot.assignedStudents, snapshot.totalStudents),
      planCoverageRate: roundPercentage(snapshot.planStudents, snapshot.totalStudents),
      reactivationRate: roundPercentage(snapshot.reactivatedStudents, snapshot.notifiedStudents),
    };
  });
};

export const rebuildOrganizationKpiSnapshots = async (
  env: AppEnv,
  organizationName: string,
  options: RebuildOrganizationKpiSnapshotsOptions = {},
): Promise<OrganizationKpiSeriesResult> => {
  const requestedDateKeys = sortDateKeysAscending(
    options.dateKeys && options.dateKeys.length > 0
      ? options.dateKeys
      : getLastTokyoDateKeys(ORGANIZATION_KPI_TREND_DAYS),
  );
  const summaryDateKeys = getLastTokyoDateKeys(ORGANIZATION_KPI_SUMMARY_DAYS);
  const queryStartKey = sortDateKeysAscending([...requestedDateKeys, ...summaryDateKeys])[0];
  const queryStart = toTokyoDayStart(queryStartKey);
  const assignmentEventStart = toTokyoDayStart(queryStartKey);

  const [students, plans, currentAssignments, assignmentEvents, studyEvents, notifications] = await Promise.all([
    readAll<{ uid: string; created_at: number }>(
      env,
      `SELECT id AS uid, created_at
       FROM users
       WHERE role = ? AND organization_name = ?`,
      'STUDENT',
      organizationName,
    ),
    readAll<{ user_uid: string; created_at: number }>(
      env,
      `SELECT lp.user_id AS user_uid, lp.created_at AS created_at
       FROM learning_plans lp
       JOIN users u ON u.id = lp.user_id
       WHERE u.role = ? AND u.organization_name = ?`,
      'STUDENT',
      organizationName,
    ),
    readAll<{ student_uid: string; instructor_uid: string | null }>(
      env,
      `SELECT a.student_user_id AS student_uid, a.instructor_user_id AS instructor_uid
       FROM student_instructor_assignments a
       JOIN users u ON u.id = a.student_user_id
       WHERE u.role = ? AND u.organization_name = ?`,
      'STUDENT',
      organizationName,
    ),
    readAll<{ student_uid: string; previous_instructor_uid: string | null; next_instructor_uid: string | null; created_at: number }>(
      env,
      `SELECT
         e.student_user_id AS student_uid,
         e.previous_instructor_user_id AS previous_instructor_uid,
         e.next_instructor_user_id AS next_instructor_uid,
         e.created_at AS created_at
       FROM student_instructor_assignment_events e
       JOIN users u ON u.id = e.student_user_id
       WHERE u.role = ? AND u.organization_name = ? AND e.created_at >= ?`,
      'STUDENT',
      organizationName,
      assignmentEventStart,
    ),
    readAll<{ student_uid: string; studied_at: number; interaction_source: 'STUDY' | 'QUIZ' | null }>(
      env,
      `SELECT
         h.user_id AS student_uid,
         h.last_studied_at AS studied_at,
         h.interaction_source AS interaction_source
       FROM learning_histories h
       JOIN users u ON u.id = h.user_id
       WHERE u.role = ? AND u.organization_name = ? AND h.last_studied_at >= ?`,
      'STUDENT',
      organizationName,
      queryStart,
    ),
    readAll<{ student_uid: string; created_at: number }>(
      env,
      `SELECT
         n.student_user_id AS student_uid,
         n.created_at AS created_at
       FROM instructor_notifications n
       JOIN users u ON u.id = n.student_user_id
       WHERE u.role = ? AND u.organization_name = ? AND n.created_at >= ?`,
      'STUDENT',
      organizationName,
      queryStart,
    ),
  ]);

  const series = buildOrganizationKpiSeries({
    organizationName,
    students: students.map((row) => ({ uid: row.uid, createdAt: Number(row.created_at || 0) })),
    plans: plans.map((row) => ({ userUid: row.user_uid, createdAt: Number(row.created_at || 0) })),
    currentAssignments: currentAssignments.map((row) => ({
      studentUid: row.student_uid,
      instructorUid: row.instructor_uid,
    })),
    assignmentEvents: assignmentEvents.map((row) => ({
      studentUid: row.student_uid,
      previousInstructorUid: row.previous_instructor_uid,
      nextInstructorUid: row.next_instructor_uid,
      createdAt: Number(row.created_at || 0),
    })),
    studyEvents: studyEvents.map((row) => ({
      studentUid: row.student_uid,
      studiedAt: Number(row.studied_at || 0),
      interactionSource: row.interaction_source || undefined,
    })),
    notifications: notifications.map((row) => ({
      studentUid: row.student_uid,
      createdAt: Number(row.created_at || 0),
    })),
    dateKeys: requestedDateKeys,
  });

  if (series.dailySnapshots.length > 0) {
    const upserts = series.dailySnapshots.map((snapshot) => env.DB.prepare(`
      INSERT INTO organization_kpi_daily_snapshots (
        organization_name,
        snapshot_date,
        total_students,
        assigned_students,
        plan_students,
        active_students,
        notifications,
        notified_students,
        reactivated_students,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_name, snapshot_date) DO UPDATE SET
        total_students = excluded.total_students,
        assigned_students = excluded.assigned_students,
        plan_students = excluded.plan_students,
        active_students = excluded.active_students,
        notifications = excluded.notifications,
        notified_students = excluded.notified_students,
        reactivated_students = excluded.reactivated_students,
        updated_at = excluded.updated_at
    `).bind(
      organizationName,
      snapshot.snapshotDate,
      snapshot.totalStudents,
      snapshot.assignedStudents,
      snapshot.planStudents,
      snapshot.activeStudents,
      snapshot.notifications,
      snapshot.notifiedStudents,
      snapshot.reactivatedStudents,
      Date.now(),
      Date.now(),
    ));
    await env.DB.batch(upserts);
  }

  return series;
};
