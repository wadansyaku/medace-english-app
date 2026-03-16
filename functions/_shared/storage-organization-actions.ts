import {
  AssignmentEvent,
  InterventionKind,
  InterventionOutcome,
  InstructorNotification,
  LearningHistory,
  type MissionAssignment,
  OrganizationAuditEvent,
  OrganizationDashboardSnapshot,
  OrganizationInstructorSummary,
  OrganizationMemberSummary,
  OrganizationRole,
  OrganizationSettingsSnapshot,
  RecommendedActionType,
  StudentRiskLevel,
  StudentSummary,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserRole,
  WeeklyMissionStatus,
} from '../../types';
import {
  FOLLOW_UP_WINDOW_MS,
  getContinuityBand,
  resolveInterventionOutcome,
  resolveNeedsFollowUpNow,
  resolveRecommendedActionType,
} from '../../shared/retention';
import { buildOrganizationDashboardSnapshot } from './organization-dashboard';
import {
  ORGANIZATION_KPI_REACTIVATION_WINDOW_MS,
  readOrganizationKpiSeriesFromSnapshots,
  rebuildOrganizationKpiSnapshots,
  toOrganizationKpiTrendPoints,
} from './organization-kpi';
import { HttpError } from './http';
import { handleGetWeeklyMissionBoard, readMissionAssignmentsByStudent } from './storage-mission-actions';
import { readWeaknessProfilesByUserIds } from './weakness-actions';
import {
  appendOrganizationAuditLog,
  normalizeOrganizationNameKey,
  requireActiveOrganizationContext,
  syncOrganizationShadowForActiveMembers,
} from './organization-memberships';
import type { AppEnv, DbUserRow } from './types';
import {
  DAY_MS,
  FALLBACK_WORKSHEET_WORD_LIMIT,
  WORKSHEET_STATUSES,
  canBypassInstructorAssignment,
  getMasteryProgressSql,
  getMasterySourceSql,
  getUserSubscriptionPlan,
  readAll,
  readFirst,
  readVisibleBookRows,
  toTokyoDateKey,
  toTokyoDateKeySql,
  type DbAssignmentEventRow,
  type DbWordRow,
} from './storage-support';

const isInterventionKind = (value: string): value is InterventionKind => (
  Object.values(InterventionKind).includes(value as InterventionKind)
);

const isRecommendedActionType = (value: string): value is RecommendedActionType => (
  Object.values(RecommendedActionType).includes(value as RecommendedActionType)
);

const buildRecommendedAction = ({
  riskLevel,
  hasLearningPlan,
  latestInterventionOutcome,
  needsFollowUpNow,
  missionOverdue,
  missionStatus,
}: {
  riskLevel: StudentRiskLevel;
  hasLearningPlan: boolean;
  latestInterventionOutcome?: InterventionOutcome;
  needsFollowUpNow: boolean;
  missionOverdue?: boolean;
  missionStatus?: WeeklyMissionStatus;
}): string => {
  if (missionOverdue) {
    return '期限超過の今週ミッションを最優先に再開させ、残りタスクを1つだけに絞る';
  }
  if (missionStatus === WeeklyMissionStatus.ASSIGNED) {
    return '今週ミッションの最初の1アクションを明示し、未着手のまま止まらないようにする';
  }
  if (latestInterventionOutcome === InterventionOutcome.REACTIVATED) {
    return hasLearningPlan
      ? '再開できたので称賛し、今日の学習プランに戻して継続へつなぐ'
      : '再開できたので称賛し、次の短い復習タスクへつなぐ';
  }
  if (needsFollowUpNow && !hasLearningPlan) {
    return '短い復習タスクを指定しつつ、学習プランの設定有無を確認する';
  }
  if (needsFollowUpNow) {
    return '今日は10語だけの復習再開を促し、48時間以内に反応を確認する';
  }
  if (riskLevel === StudentRiskLevel.WARNING) {
    return '前回フォロー後の再開を待ち、次回の継続へつなぐ';
  }
  return hasLearningPlan
    ? '現状の学習プランを維持し、良いリズムを称賛する'
    : '安定しているので、このペースを称賛して次の学習計画へつなぐ';
};

const readActiveOrganizationMember = async (
  env: AppEnv,
  userId: string,
): Promise<{
  id: string;
  display_name: string;
  role: string;
  organization_id: string | null;
  organization_name: string | null;
} | null> => readFirst(
  env,
  `SELECT
     u.id AS id,
     u.display_name AS display_name,
     u.role AS role,
     m.organization_id AS organization_id,
     o.display_name AS organization_name
   FROM users u
   LEFT JOIN organization_memberships m
     ON m.user_id = u.id
    AND m.status = 'ACTIVE'
   LEFT JOIN organizations o ON o.id = m.organization_id
   WHERE u.id = ?`,
  userId,
);

export const handleGetAllStudentsProgress = async (env: AppEnv, currentUser: DbUserRow): Promise<StudentSummary[]> => {
  const now = Date.now();
  const activeStudyWindowStart = now - 6 * DAY_MS;
  const organizationId = currentUser.role === UserRole.ADMIN
    ? null
    : (await requireActiveOrganizationContext(env, currentUser)).organizationId;
  const bypassInstructorAssignment = canBypassInstructorAssignment(currentUser);
  const rows = await readAll<{
    uid: string;
    name: string;
    email: string;
    subscription_plan: string | null;
    organization_name: string | null;
    total_learned: number;
    total_correct: number;
    total_attempts: number;
    last_active: number | null;
    active_study_days_7d: number;
    last_notification_at: number | null;
    last_notification_message: string | null;
    last_intervention_kind: string | null;
    last_recommended_action_type: string | null;
    last_reactivated_at: number | null;
    assigned_instructor_uid: string | null;
    assigned_instructor_name: string | null;
    assignment_updated_at: number | null;
    has_learning_plan: number;
  }>(
    env,
    `SELECT
       u.id AS uid,
       u.display_name AS name,
       u.email AS email,
       COALESCE(org.subscription_plan, u.subscription_plan) AS subscription_plan,
       COALESCE(org.display_name, u.organization_name) AS organization_name,
       COALESCE(SUM(CASE WHEN ${getMasteryProgressSql('h')} THEN 1 ELSE 0 END), 0) AS total_learned,
       COALESCE(SUM(h.correct_count), 0) AS total_correct,
       COALESCE(SUM(h.attempt_count), 0) AS total_attempts,
       MAX(CASE WHEN ${getMasterySourceSql('h')} THEN h.last_studied_at ELSE NULL END) AS last_active,
       COUNT(DISTINCT CASE
         WHEN ${getMasterySourceSql('h')} AND h.last_studied_at >= ? THEN ${toTokyoDateKeySql('h.last_studied_at')}
         ELSE NULL
       END) AS active_study_days_7d,
       (
         SELECT n.created_at
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_notification_at,
       (
         SELECT n.message
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_notification_message,
       (
         SELECT n.intervention_kind
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_intervention_kind,
       (
         SELECT n.recommended_action_type
         FROM instructor_notifications n
         WHERE n.student_user_id = u.id
         ORDER BY n.created_at DESC
         LIMIT 1
       ) AS last_recommended_action_type,
       (
         SELECT MIN(h2.last_studied_at)
         FROM instructor_notifications n
         JOIN learning_histories h2
           ON h2.user_id = n.student_user_id
          AND h2.interaction_source = 'STUDY'
          AND h2.last_studied_at >= n.created_at
          AND h2.last_studied_at <= n.created_at + ?
         WHERE n.student_user_id = u.id
           AND n.created_at = (
             SELECT MAX(n2.created_at)
             FROM instructor_notifications n2
             WHERE n2.student_user_id = u.id
           )
       ) AS last_reactivated_at,
       assign.instructor_user_id AS assigned_instructor_uid,
       assigned.display_name AS assigned_instructor_name,
       assign.updated_at AS assignment_updated_at,
       CASE WHEN lp.user_id IS NULL THEN 0 ELSE 1 END AS has_learning_plan
     FROM users u
     LEFT JOIN learning_histories h ON h.user_id = u.id
     LEFT JOIN learning_plans lp ON lp.user_id = u.id
     LEFT JOIN student_instructor_assignments assign ON assign.student_user_id = u.id
     LEFT JOIN users assigned ON assigned.id = assign.instructor_user_id
     LEFT JOIN organization_memberships student_membership
       ON student_membership.user_id = u.id
      AND student_membership.status = 'ACTIVE'
     LEFT JOIN organizations org ON org.id = student_membership.organization_id
     WHERE u.role = ?
       AND (? IS NULL OR student_membership.organization_id = ?)
       AND (? = 1 OR assign.instructor_user_id = ? OR assign.instructor_user_id IS NULL)
     GROUP BY
       u.id,
       u.display_name,
       u.email,
       org.subscription_plan,
       org.display_name,
       assign.instructor_user_id,
       assigned.display_name,
       assign.updated_at,
       lp.user_id
     ORDER BY last_active DESC, name ASC`,
    activeStudyWindowStart,
    ORGANIZATION_KPI_REACTIVATION_WINDOW_MS,
    UserRole.STUDENT,
    organizationId,
    organizationId,
    bypassInstructorAssignment ? 1 : 0,
    currentUser.id,
  );
  const missionAssignmentsByStudent = await readMissionAssignmentsByStudent(env, rows.map((row) => row.uid));
  const weaknessProfilesByStudent = await readWeaknessProfilesByUserIds(env, rows.map((row) => row.uid));

  return rows.map((row) => {
    const missionAssignment = missionAssignmentsByStudent.get(row.uid);
    const weaknessProfile = weaknessProfilesByStudent.get(row.uid);
    const missionProgress = missionAssignment?.progress;
    const missionOverdue = Boolean(
      missionProgress?.overdue
      || missionProgress?.status === WeeklyMissionStatus.OVERDUE,
    );
    const lastActive = Number(row.last_active || 0);
    const daysSinceActive = lastActive > 0 ? Math.floor((now - lastActive) / DAY_MS) : Number.POSITIVE_INFINITY;
    const accuracy = row.total_attempts ? Number(row.total_correct || 0) / Number(row.total_attempts || 1) : 0;
    const activeStudyDays7d = Number(row.active_study_days_7d || 0);
    const continuityBand = getContinuityBand(activeStudyDays7d);
    const latestInterventionAt = Number(row.last_notification_at || 0) || undefined;
    const lastReactivatedAt = Number(row.last_reactivated_at || 0) || undefined;
    const latestInterventionKind = row.last_intervention_kind && isInterventionKind(row.last_intervention_kind)
      ? row.last_intervention_kind
      : undefined;
    const latestInterventionOutcome = resolveInterventionOutcome({
      latestInterventionAt,
      lastReactivatedAt,
      now,
    });
    const latestRecommendedActionType = row.last_recommended_action_type && isRecommendedActionType(row.last_recommended_action_type)
      ? row.last_recommended_action_type
      : (latestInterventionAt
        ? resolveRecommendedActionType({
            interventionKind: latestInterventionKind,
            hasLearningPlan: Boolean(row.has_learning_plan),
          })
        : undefined);
    const riskLevel =
      daysSinceActive >= 3
        ? StudentRiskLevel.DANGER
        : daysSinceActive >= 1
          ? StudentRiskLevel.WARNING
          : StudentRiskLevel.SAFE;
    const needsFollowUpNow = resolveNeedsFollowUpNow({
      riskLevel,
      latestInterventionAt,
      latestInterventionOutcome,
      missionOverdue,
      now,
    });
    const riskReasons: string[] = [];

    if (daysSinceActive >= 3) riskReasons.push('3日以上学習が空いています');
    else if (daysSinceActive >= 1) riskReasons.push('前回学習から1日以上空いています');
    if (activeStudyDays7d < 4) riskReasons.push(`直近7日で${activeStudyDays7d}日学習です`);
    if (accuracy > 0 && accuracy < 0.7) riskReasons.push(`正答率が ${Math.round(accuracy * 100)}% です`);
    if (!row.has_learning_plan) riskReasons.push('学習プランが未設定です');
    if (missionOverdue) riskReasons.push('今週ミッションが期限超過です');
    else if (missionProgress?.status === WeeklyMissionStatus.ASSIGNED) riskReasons.push('今週ミッションが未着手です');
    if (latestInterventionOutcome === InterventionOutcome.EXPIRED) {
      riskReasons.push('前回フォローが72時間以内に再開されず失効しています');
    } else if (
      riskLevel !== StudentRiskLevel.SAFE
      && (!latestInterventionAt || (now - latestInterventionAt > FOLLOW_UP_WINDOW_MS && latestInterventionOutcome !== InterventionOutcome.REACTIVATED))
    ) {
      riskReasons.push('48時間以内の講師フォローがありません');
    }
    if (riskReasons.length === 0) riskReasons.push('学習ペースは安定しています');

    return {
      uid: row.uid,
      name: row.name,
      email: row.email,
      totalLearned: Number(row.total_learned || 0),
      totalAttempts: Number(row.total_attempts || 0),
      lastActive,
      riskLevel,
      accuracy,
      subscriptionPlan: (row.subscription_plan as SubscriptionPlan | null) || SubscriptionPlan.TOC_FREE,
      organizationName: row.organization_name || undefined,
      lastNotificationAt: latestInterventionAt,
      lastNotificationMessage: row.last_notification_message || undefined,
      hasReactivatedSinceNotification: latestInterventionOutcome === InterventionOutcome.REACTIVATED,
      lastReactivatedAt,
      assignedInstructorUid: row.assigned_instructor_uid || undefined,
      assignedInstructorName: row.assigned_instructor_name || undefined,
      assignmentUpdatedAt: Number(row.assignment_updated_at || 0) || undefined,
      hasLearningPlan: Boolean(row.has_learning_plan),
      activeStudyDays7d,
      continuityBand,
      latestInterventionAt,
      latestInterventionKind,
      latestInterventionOutcome,
      latestRecommendedActionType,
      needsFollowUpNow,
      primaryMissionStatus: missionProgress?.status,
      primaryMissionTrack: missionAssignment?.mission.learningTrack,
      primaryMissionTitle: missionAssignment?.mission.title,
      primaryMissionCompletionRate: missionProgress?.completionRate,
      missionDueAt: missionAssignment?.mission.dueAt,
      missionOverdue,
      missionLastActivityAt: missionProgress?.lastActivityAt,
      topWeaknesses: weaknessProfile?.topWeaknesses,
      weaknessProfileUpdatedAt: weaknessProfile?.updatedAt,
      riskReasons,
      recommendedAction: buildRecommendedAction({
        riskLevel,
        hasLearningPlan: Boolean(row.has_learning_plan),
        latestInterventionOutcome,
        needsFollowUpNow,
        missionOverdue,
        missionStatus: missionProgress?.status,
      }),
    };
  });
};

export const handleGetStudentWorksheetSnapshot = async (
  env: AppEnv,
  currentUser: DbUserRow,
  studentUid: string,
): Promise<StudentWorksheetSnapshot> => {
  if (!studentUid) {
    throw new HttpError(400, '対象生徒を指定してください。');
  }

  const visibleStudents = await handleGetAllStudentsProgress(env, currentUser);
  const visibleStudent = visibleStudents.find((student) => student.uid === studentUid);
  const student = await readActiveOrganizationMember(env, studentUid);

  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '対象生徒が見つかりません。');
  }

  if (currentUser.role !== UserRole.ADMIN && !visibleStudent) {
    throw new HttpError(403, '担当範囲の生徒のみ問題印刷できます。');
  }

  const rows = await readAll<{
    word_id: string;
    book_id: string;
    book_title: string;
    word: string;
    definition: string;
    status: LearningHistory['status'];
    last_studied_at: number;
    attempt_count: number;
    correct_count: number;
  }>(
    env,
    `SELECT
       w.id AS word_id,
       w.book_id AS book_id,
       b.title AS book_title,
       w.word AS word,
       w.definition AS definition,
       h.status AS status,
       h.last_studied_at AS last_studied_at,
       h.attempt_count AS attempt_count,
       h.correct_count AS correct_count
     FROM learning_histories h
     JOIN words w ON w.id = h.word_id
     JOIN books b ON b.id = h.book_id
     WHERE h.user_id = ?
       AND ${getMasteryProgressSql('h')}
     ORDER BY
       CASE h.status
         WHEN 'graduated' THEN 0
         WHEN 'review' THEN 1
         ELSE 2
       END,
       h.last_studied_at DESC,
       b.title ASC,
       w.word_number ASC`,
    studentUid,
  );

  if (rows.length === 0) {
    const fullStudent = await readFirst<DbUserRow>(env, 'SELECT * FROM users WHERE id = ?', studentUid);
    const fallbackBooks = fullStudent ? await readVisibleBookRows(env, fullStudent) : [];
    const fallbackWords: StudentWorksheetSnapshot['words'] = [];
    const candidateBooks = fallbackBooks.slice(0, Math.min(5, fallbackBooks.length));
    const perBookLimit = Math.max(4, Math.ceil(FALLBACK_WORKSHEET_WORD_LIMIT / Math.max(candidateBooks.length, 1)));

    for (const [bookIndex, book] of candidateBooks.entries()) {
      const bookWords = await readAll<DbWordRow>(
        env,
        `SELECT *
         FROM words
         WHERE book_id = ?
         ORDER BY word_number ASC
         LIMIT ?`,
        book.id,
        perBookLimit,
      );

      bookWords.forEach((word, wordIndex) => {
        if (fallbackWords.length >= FALLBACK_WORKSHEET_WORD_LIMIT) return;
        fallbackWords.push({
          wordId: word.id,
          bookId: book.id,
          bookTitle: book.title,
          word: word.word,
          definition: word.definition,
          status: WORKSHEET_STATUSES[wordIndex % WORKSHEET_STATUSES.length],
          lastStudiedAt: Date.now() - (bookIndex + wordIndex + 1) * DAY_MS,
          attemptCount: 3 + wordIndex,
          correctCount: 2 + wordIndex,
        });
      });
      if (fallbackWords.length >= FALLBACK_WORKSHEET_WORD_LIMIT) break;
    }

    if (fallbackWords.length > 0) {
      return {
        studentUid: student.id,
        studentName: student.display_name,
        organizationName: student.organization_name || undefined,
        words: fallbackWords,
      };
    }

    return {
      studentUid: student.id,
      studentName: student.display_name,
      organizationName: student.organization_name || undefined,
      words: [
        {
          wordId: 'worksheet-1',
          bookId: 'mock-book-1',
          bookTitle: 'スターター確認問題',
          word: 'diagnosis',
          definition: '診断',
          status: 'graduated',
          lastStudiedAt: Date.now() - DAY_MS,
          attemptCount: 6,
          correctCount: 5,
        },
        {
          wordId: 'worksheet-2',
          bookId: 'mock-book-1',
          bookTitle: 'スターター確認問題',
          word: 'treatment',
          definition: '治療',
          status: 'review',
          lastStudiedAt: Date.now() - 2 * DAY_MS,
          attemptCount: 4,
          correctCount: 3,
        },
        {
          wordId: 'worksheet-3',
          bookId: 'mock-book-2',
          bookTitle: '医療英語ベーシック',
          word: 'symptom',
          definition: '症状',
          status: 'learning',
          lastStudiedAt: Date.now() - 3 * DAY_MS,
          attemptCount: 2,
          correctCount: 1,
        },
      ],
    };
  }

  return {
    studentUid: student.id,
    studentName: student.display_name,
    organizationName: student.organization_name || undefined,
    words: rows.map((row) => ({
      wordId: row.word_id,
      bookId: row.book_id,
      bookTitle: row.book_title,
      word: row.word,
      definition: row.definition,
      status: row.status,
      lastStudiedAt: Number(row.last_studied_at || 0),
      attemptCount: Number(row.attempt_count || 0),
      correctCount: Number(row.correct_count || 0),
    })),
  };
};

export const handleGetOrganizationDashboardSnapshot = async (env: AppEnv, user: DbUserRow): Promise<OrganizationDashboardSnapshot> => {
  const organization = await requireActiveOrganizationContext(env, user);

  const [students, missionBoard, kpiSeries, memberCountRow, instructorCountRow, instructorRows, assignmentEvents] = await Promise.all([
    handleGetAllStudentsProgress(env, user),
    handleGetWeeklyMissionBoard(env, user),
    readOrganizationKpiSeriesFromSnapshots(env, organization.organizationId),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
         AND email NOT GLOB 'demo_*@medace.app'`,
      organization.organizationId,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
         AND u.role = ?
         AND email NOT GLOB 'demo_*@medace.app'`,
      organization.organizationId,
      UserRole.INSTRUCTOR,
    ),
    readAll<{
      uid: string;
      display_name: string;
      email: string;
      organization_role: string | null;
      notified_student_count: number;
      notifications_7d: number;
      assigned_student_count: number;
    }>(
      env,
       `SELECT
         u.id AS uid,
         u.display_name AS display_name,
         u.email AS email,
         m.role AS organization_role,
         COALESCE(stats.notified_student_count, 0) AS notified_student_count,
         COALESCE(stats.notifications_7d, 0) AS notifications_7d,
         COALESCE(assignments.assigned_student_count, 0) AS assigned_student_count
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN (
         SELECT
           n.instructor_user_id AS instructor_user_id,
           COUNT(DISTINCT n.student_user_id) AS notified_student_count,
           SUM(CASE WHEN n.created_at >= ? THEN 1 ELSE 0 END) AS notifications_7d
         FROM instructor_notifications n
         JOIN users s ON s.id = n.student_user_id
         JOIN organization_memberships student_membership
           ON student_membership.user_id = s.id
          AND student_membership.status = 'ACTIVE'
         WHERE student_membership.organization_id = ?
         GROUP BY n.instructor_user_id
       ) stats ON stats.instructor_user_id = u.id
       LEFT JOIN (
         SELECT
           a.instructor_user_id AS instructor_user_id,
           COUNT(*) AS assigned_student_count
         FROM student_instructor_assignments a
         JOIN users s ON s.id = a.student_user_id
         JOIN organization_memberships student_membership
           ON student_membership.user_id = s.id
          AND student_membership.status = 'ACTIVE'
         WHERE student_membership.organization_id = ?
         GROUP BY a.instructor_user_id
       ) assignments ON assignments.instructor_user_id = u.id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
         AND u.role = ?
         AND u.email NOT GLOB 'demo_*@medace.app'
       ORDER BY
         CASE WHEN m.role = ? THEN 0 ELSE 1 END,
         notifications_7d DESC,
         u.display_name ASC`,
      Date.now() - 7 * DAY_MS,
      organization.organizationId,
      organization.organizationId,
      organization.organizationId,
      UserRole.INSTRUCTOR,
      OrganizationRole.GROUP_ADMIN,
    ),
    readAll<DbAssignmentEventRow>(
      env,
      `SELECT
         e.id AS id,
         s.id AS student_uid,
         s.display_name AS student_name,
         prev.id AS previous_instructor_uid,
         prev.display_name AS previous_instructor_name,
         next.id AS next_instructor_uid,
         next.display_name AS next_instructor_name,
         changer.id AS changed_by_uid,
         changer.display_name AS changed_by_name,
         e.created_at AS created_at
       FROM student_instructor_assignment_events e
       JOIN users s ON s.id = e.student_user_id
       JOIN organization_memberships student_membership
         ON student_membership.user_id = s.id
        AND student_membership.status = 'ACTIVE'
       JOIN users changer ON changer.id = e.changed_by_user_id
       LEFT JOIN users prev ON prev.id = e.previous_instructor_user_id
       LEFT JOIN users next ON next.id = e.next_instructor_user_id
       WHERE student_membership.organization_id = ?
       ORDER BY e.created_at DESC
       LIMIT 12`,
      organization.organizationId,
    ),
  ]);
  const trend = toOrganizationKpiTrendPoints(kpiSeries.dailySnapshots);

  const instructors: OrganizationInstructorSummary[] = instructorRows.map((row) => ({
    uid: row.uid,
    displayName: row.display_name,
    email: row.email,
    organizationRole: row.organization_role ? row.organization_role as OrganizationRole : undefined,
    notifiedStudentCount: Number(row.notified_student_count || 0),
    notifications7d: Number(row.notifications_7d || 0),
    assignedStudentCount: Number(row.assigned_student_count || 0),
  }));

  const mappedAssignmentEvents = assignmentEvents.map((event): AssignmentEvent => ({
    id: event.id,
    studentUid: event.student_uid,
    studentName: event.student_name,
    previousInstructorUid: event.previous_instructor_uid || undefined,
    previousInstructorName: event.previous_instructor_name || undefined,
    nextInstructorUid: event.next_instructor_uid || undefined,
    nextInstructorName: event.next_instructor_name || undefined,
    changedByUid: event.changed_by_uid,
    changedByName: event.changed_by_name,
    createdAt: Number(event.created_at || 0),
  }));

  return buildOrganizationDashboardSnapshot({
    organizationId: organization.organizationId,
    organizationName: organization.organizationName,
    subscriptionPlan: organization.subscriptionPlan,
    totalMembers: Number(memberCountRow?.count || 0),
    totalInstructors: Number(instructorCountRow?.count || 0),
    learningPlanCount: students.filter((student) => student.hasLearningPlan).length,
    notifications7d: kpiSeries.summary7d.notifications7d,
    instructors,
    students,
    missionAssignments: missionBoard.assignments,
    assignmentEvents: mappedAssignmentEvents,
    reactivatedStudents7d: kpiSeries.summary7d.reactivatedStudents7d,
    notifiedStudents7d: kpiSeries.summary7d.notifiedStudents7d,
    trend,
  });
};

export const handleSendInstructorNotification = async (
  env: AppEnv,
  instructor: DbUserRow,
  studentUid: string,
  message: string,
  triggerReason: string,
  usedAi: boolean,
  interventionKind: string,
  recommendedActionType?: string,
): Promise<void> => {
  const trimmedMessage = message.trim();
  const trimmedReason = triggerReason.trim() || '学習フォローアップ';
  if (!trimmedMessage) {
    throw new HttpError(400, '通知メッセージを入力してください。');
  }
  if (!isInterventionKind(interventionKind)) {
    throw new HttpError(400, '介入種別が不正です。');
  }
  if (recommendedActionType && !isRecommendedActionType(recommendedActionType)) {
    throw new HttpError(400, '推奨アクションが不正です。');
  }

  const instructorOrganization = instructor.role === UserRole.ADMIN
    ? null
    : await requireActiveOrganizationContext(env, instructor);

  const student = await readFirst<{
    id: string;
    role: string;
    organization_id: string | null;
    organization_name: string | null;
    has_learning_plan: number;
  }>(
    env,
    `SELECT
       u.id AS id,
       u.role AS role,
       membership.organization_id AS organization_id,
       org.display_name AS organization_name,
       CASE WHEN lp.user_id IS NULL THEN 0 ELSE 1 END AS has_learning_plan
     FROM users u
     LEFT JOIN learning_plans lp ON lp.user_id = u.id
     LEFT JOIN organization_memberships membership
       ON membership.user_id = u.id
      AND membership.status = 'ACTIVE'
     LEFT JOIN organizations org ON org.id = membership.organization_id
     WHERE u.id = ?`,
    studentUid,
  );
  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '通知対象の生徒が見つかりません。');
  }
  if (instructorOrganization && instructorOrganization.organizationId !== student.organization_id) {
    throw new HttpError(403, '同じ組織の生徒にのみ通知できます。');
  }
  if (!canBypassInstructorAssignment(instructor)) {
    const assignment = await readFirst<{ instructor_user_id: string | null }>(
      env,
      'SELECT instructor_user_id FROM student_instructor_assignments WHERE student_user_id = ?',
      studentUid,
    );
    if (assignment?.instructor_user_id && assignment.instructor_user_id !== instructor.id) {
      throw new HttpError(403, '担当外の生徒には通知できません。');
    }
  }

  const resolvedRecommendedActionType = recommendedActionType || resolveRecommendedActionType({
    interventionKind,
    hasLearningPlan: Boolean(student.has_learning_plan),
  });

  await env.DB.prepare(`
    INSERT INTO instructor_notifications (
      student_user_id, instructor_user_id, message, trigger_reason, delivery_channel, used_ai,
      intervention_kind, recommended_action_type, created_at
    ) VALUES (?, ?, ?, ?, 'IN_APP', ?, ?, ?, ?)
  `).bind(
    studentUid,
    instructor.id,
    trimmedMessage,
    trimmedReason,
    usedAi ? 1 : 0,
    interventionKind,
    resolvedRecommendedActionType,
    Date.now(),
  ).run();

  if (student.organization_id) {
    await appendOrganizationAuditLog(env, {
      organizationId: student.organization_id,
      actorUserId: instructor.id,
      actionType: 'INSTRUCTOR_NOTIFICATION_SAVED',
      targetType: 'student',
      targetId: studentUid,
      payload: {
        interventionKind,
        recommendedActionType: resolvedRecommendedActionType,
        usedAi,
      },
    });
    await rebuildOrganizationKpiSnapshots(env, student.organization_id, {
      dateKeys: [toTokyoDateKey(Date.now())],
    });
  }
};

export const handleGetCoachNotifications = async (env: AppEnv, userId: string): Promise<InstructorNotification[]> => {
  const rows = await readAll<{
    id: number;
    student_user_id: string;
    student_name: string;
    instructor_user_id: string;
    instructor_name: string;
    message: string;
    trigger_reason: string;
    delivery_channel: 'IN_APP';
    used_ai: number;
    intervention_kind: string;
    recommended_action_type: string | null;
    has_learning_plan: number;
    reactivated_at: number | null;
    created_at: number;
  }>(
    env,
    `SELECT
       n.id,
       n.student_user_id,
       s.display_name AS student_name,
       n.instructor_user_id,
       i.display_name AS instructor_name,
       n.message,
       n.trigger_reason,
       n.delivery_channel,
       n.used_ai,
       n.intervention_kind,
       n.recommended_action_type,
       CASE WHEN EXISTS(
         SELECT 1
         FROM learning_plans lp
         WHERE lp.user_id = n.student_user_id
       ) THEN 1 ELSE 0 END AS has_learning_plan,
       (
         SELECT MIN(h.last_studied_at)
         FROM learning_histories h
         WHERE h.user_id = n.student_user_id
           AND h.interaction_source = 'STUDY'
           AND h.last_studied_at >= n.created_at
           AND h.last_studied_at <= n.created_at + ?
       ) AS reactivated_at,
       n.created_at
     FROM instructor_notifications n
     JOIN users s ON s.id = n.student_user_id
     JOIN users i ON i.id = n.instructor_user_id
     WHERE n.student_user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 3`,
    ORGANIZATION_KPI_REACTIVATION_WINDOW_MS,
    userId,
  );

  return rows.map((row) => {
    const interventionKind = isInterventionKind(row.intervention_kind) ? row.intervention_kind : InterventionKind.MANUAL_OTHER;
    const recommendedActionType = row.recommended_action_type && isRecommendedActionType(row.recommended_action_type)
      ? row.recommended_action_type
      : resolveRecommendedActionType({
          interventionKind,
          hasLearningPlan: Boolean(row.has_learning_plan),
        });

    return {
      id: row.id,
      studentUid: row.student_user_id,
      studentName: row.student_name,
      instructorUid: row.instructor_user_id,
      instructorName: row.instructor_name,
      message: row.message,
      triggerReason: row.trigger_reason,
      deliveryChannel: row.delivery_channel,
      usedAi: Boolean(row.used_ai),
      interventionKind,
      recommendedActionType,
      interventionOutcome: resolveInterventionOutcome({
        latestInterventionAt: row.created_at,
        lastReactivatedAt: Number(row.reactivated_at || 0) || undefined,
      }),
      createdAt: row.created_at,
    };
  });
};

export const handleAssignStudentInstructor = async (
  env: AppEnv,
  currentUser: DbUserRow,
  studentUid: string,
  instructorUid: string | null,
): Promise<void> => {
  if (!studentUid) throw new HttpError(400, '生徒を指定してください。');
  const currentOrganization = currentUser.role === UserRole.ADMIN
    ? null
    : await requireActiveOrganizationContext(env, currentUser, [OrganizationRole.GROUP_ADMIN]);

  const student = await readActiveOrganizationMember(env, studentUid);
  if (!student || student.role !== UserRole.STUDENT) throw new HttpError(404, '対象生徒が見つかりません。');
  if (currentOrganization && student.organization_id !== currentOrganization.organizationId) {
    throw new HttpError(403, '同じ組織の生徒のみ担当変更できます。');
  }

  const existingAssignment = await readFirst<{ instructor_user_id: string | null }>(
    env,
    'SELECT instructor_user_id FROM student_instructor_assignments WHERE student_user_id = ?',
    studentUid,
  );
  const previousInstructorUid = existingAssignment?.instructor_user_id || null;

  if (previousInstructorUid === instructorUid) {
    return;
  }

  if (instructorUid) {
    const instructor = await readActiveOrganizationMember(env, instructorUid);
    if (!instructor || instructor.role !== UserRole.INSTRUCTOR) {
      throw new HttpError(404, '担当講師が見つかりません。');
    }
    if (!student.organization_id) {
      throw new HttpError(400, '組織に所属していない生徒には担当割当できません。');
    }
    if (instructor.organization_id !== student.organization_id) {
      throw new HttpError(400, '生徒と同じ組織の講師にのみ割り当てできます。');
    }
    if (currentOrganization && instructor.organization_id !== currentOrganization.organizationId) {
      throw new HttpError(403, '同じ組織の講師にのみ割り当てできます。');
    }
    await env.DB.prepare(`
      INSERT INTO student_instructor_assignments (student_user_id, instructor_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_user_id) DO UPDATE SET
        instructor_user_id = excluded.instructor_user_id,
        updated_at = excluded.updated_at
    `).bind(studentUid, instructorUid, Date.now(), Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM student_instructor_assignments WHERE student_user_id = ?').bind(studentUid).run();
  }

  await env.DB.prepare(`
    INSERT INTO student_instructor_assignment_events (
      student_user_id,
      previous_instructor_user_id,
      next_instructor_user_id,
      changed_by_user_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(
    studentUid,
    previousInstructorUid,
    instructorUid,
    currentUser.id,
    Date.now(),
  ).run();

  if (student.organization_id) {
    await appendOrganizationAuditLog(env, {
      organizationId: student.organization_id,
      actorUserId: currentUser.id,
      actionType: 'STUDENT_ASSIGNMENT_CHANGED',
      targetType: 'student',
      targetId: studentUid,
      payload: {
        previousInstructorUid,
        nextInstructorUid: instructorUid,
      },
    });
    await rebuildOrganizationKpiSnapshots(env, student.organization_id, {
      dateKeys: [toTokyoDateKey(Date.now())],
    });
  }
};

export const handleGetOrganizationSettingsSnapshot = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<OrganizationSettingsSnapshot> => {
  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  const organizationRow = await readFirst<{
    id: string;
    display_name: string;
    name_key: string;
    subscription_plan: string;
    updated_at: number;
  }>(
    env,
    `SELECT id, display_name, name_key, subscription_plan, updated_at
     FROM organizations
     WHERE id = ?`,
    organization.organizationId,
  );

  if (!organizationRow) {
    throw new HttpError(404, '組織情報が見つかりません。');
  }

  const [memberRows, auditRows] = await Promise.all([
    readAll<{
      user_uid: string;
      display_name: string;
      email: string;
      user_role: string;
      organization_role: string;
      subscription_plan: string;
      joined_at: number;
      updated_at: number;
    }>(
      env,
      `SELECT
         u.id AS user_uid,
         u.display_name AS display_name,
         u.email AS email,
         u.role AS user_role,
         m.role AS organization_role,
         u.subscription_plan AS subscription_plan,
         m.created_at AS joined_at,
         m.updated_at AS updated_at
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.status = 'ACTIVE'
       ORDER BY
         CASE m.role
           WHEN 'GROUP_ADMIN' THEN 0
           WHEN 'INSTRUCTOR' THEN 1
           ELSE 2
         END,
         u.display_name ASC`,
      organization.organizationId,
    ),
    readAll<{
      id: number;
      organization_id: string;
      actor_user_id: string;
      actor_display_name: string;
      action_type: string;
      target_type: string;
      target_id: string | null;
      payload_json: string | null;
      created_at: number;
    }>(
      env,
      `SELECT
         l.id AS id,
         l.organization_id AS organization_id,
         l.actor_user_id AS actor_user_id,
         actor.display_name AS actor_display_name,
         l.action_type AS action_type,
         l.target_type AS target_type,
         l.target_id AS target_id,
         l.payload_json AS payload_json,
         l.created_at AS created_at
       FROM organization_audit_logs l
       JOIN users actor ON actor.id = l.actor_user_id
       WHERE l.organization_id = ?
       ORDER BY l.created_at DESC
       LIMIT 20`,
      organization.organizationId,
    ),
  ]);

  const members: OrganizationMemberSummary[] = memberRows.map((row) => ({
    userUid: row.user_uid,
    displayName: row.display_name,
    email: row.email,
    userRole: row.user_role as UserRole,
    organizationRole: row.organization_role as OrganizationRole,
    subscriptionPlan: row.subscription_plan as SubscriptionPlan,
    joinedAt: Number(row.joined_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }));

  const auditEvents: OrganizationAuditEvent[] = auditRows.map((row) => ({
    id: Number(row.id || 0),
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    actionType: row.action_type,
    targetType: row.target_type,
    targetId: row.target_id || undefined,
    payload: row.payload_json ? JSON.parse(row.payload_json) as Record<string, unknown> : undefined,
    createdAt: Number(row.created_at || 0),
  }));

  return {
    organizationId: organizationRow.id,
    displayName: organizationRow.display_name,
    nameKey: organizationRow.name_key,
    subscriptionPlan: organizationRow.subscription_plan as SubscriptionPlan,
    members,
    auditEvents,
    updatedAt: Number(organizationRow.updated_at || 0),
  };
};

export const handleUpdateOrganizationProfile = async (
  env: AppEnv,
  user: DbUserRow,
  displayName: string,
): Promise<OrganizationSettingsSnapshot> => {
  const organization = await requireActiveOrganizationContext(env, user, [OrganizationRole.GROUP_ADMIN]);
  const trimmedDisplayName = displayName.trim();
  if (!trimmedDisplayName) {
    throw new HttpError(400, '組織名を入力してください。');
  }

  const nextNameKey = normalizeOrganizationNameKey(trimmedDisplayName);
  const currentOrganization = await readFirst<{
    id: string;
    display_name: string;
    name_key: string;
  }>(
    env,
    `SELECT id, display_name, name_key
     FROM organizations
     WHERE id = ?`,
    organization.organizationId,
  );

  if (!currentOrganization) {
    throw new HttpError(404, '組織情報が見つかりません。');
  }

  const duplicate = await readFirst<{ id: string }>(
    env,
    `SELECT id
     FROM organizations
     WHERE name_key = ?
       AND id != ?`,
    nextNameKey,
    organization.organizationId,
  );
  if (duplicate) {
    throw new HttpError(409, '同じ組織名が既に使われています。');
  }

  if (
    currentOrganization.display_name !== trimmedDisplayName
    || currentOrganization.name_key !== nextNameKey
  ) {
    const now = Date.now();
    await env.DB.prepare(`
      UPDATE organizations
         SET display_name = ?,
             name_key = ?,
             updated_at = ?
       WHERE id = ?
    `).bind(
      trimmedDisplayName,
      nextNameKey,
      now,
      organization.organizationId,
    ).run();

    await syncOrganizationShadowForActiveMembers(env, organization.organizationId);

    await env.DB.prepare(`
      UPDATE writing_assignments
         SET organization_name = ?,
             updated_at = ?
       WHERE organization_id = ?
    `).bind(
      trimmedDisplayName,
      now,
      organization.organizationId,
    ).run();

    await env.DB.prepare(`
      UPDATE organization_kpi_daily_snapshots
         SET organization_name = ?,
             updated_at = ?
       WHERE organization_id = ?
    `).bind(
      trimmedDisplayName,
      now,
      organization.organizationId,
    ).run();

    await appendOrganizationAuditLog(env, {
      organizationId: organization.organizationId,
      actorUserId: user.id,
      actionType: 'ORGANIZATION_RENAMED',
      targetType: 'organization',
      targetId: organization.organizationId,
      payload: {
        previousDisplayName: currentOrganization.display_name,
        nextDisplayName: trimmedDisplayName,
      },
    });
  }

  return handleGetOrganizationSettingsSnapshot(env, user);
};
