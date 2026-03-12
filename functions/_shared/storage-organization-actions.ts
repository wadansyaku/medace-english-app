import {
  AssignmentEvent,
  InstructorNotification,
  LearningHistory,
  OrganizationDashboardSnapshot,
  OrganizationInstructorSummary,
  OrganizationRole,
  StudentRiskLevel,
  StudentSummary,
  StudentWorksheetSnapshot,
  SubscriptionPlan,
  UserRole,
} from '../../types';
import { requireOrganizationRole } from './auth';
import { buildOrganizationDashboardSnapshot } from './organization-dashboard';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';
import {
  DAY_MS,
  FALLBACK_WORKSHEET_WORD_LIMIT,
  WORKSHEET_STATUSES,
  canBypassInstructorAssignment,
  getMasteryProgressSql,
  getUserSubscriptionPlan,
  readAll,
  readFirst,
  readVisibleBookRows,
  toTokyoDateKey,
  type DbAssignmentEventRow,
  type DbWordRow,
} from './storage-support';

export const handleGetAllStudentsProgress = async (env: AppEnv, currentUser: DbUserRow): Promise<StudentSummary[]> => {
  const organizationName = currentUser.role === UserRole.ADMIN ? null : currentUser.organization_name || null;
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
    last_notification_at: number | null;
    last_notification_message: string | null;
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
       u.subscription_plan AS subscription_plan,
       u.organization_name AS organization_name,
       COALESCE(SUM(CASE WHEN ${getMasteryProgressSql('h')} THEN 1 ELSE 0 END), 0) AS total_learned,
       COALESCE(SUM(h.correct_count), 0) AS total_correct,
       COALESCE(SUM(h.attempt_count), 0) AS total_attempts,
       MAX(h.last_studied_at) AS last_active,
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
       assign.instructor_user_id AS assigned_instructor_uid,
       assigned.display_name AS assigned_instructor_name,
       assign.updated_at AS assignment_updated_at,
       CASE WHEN lp.user_id IS NULL THEN 0 ELSE 1 END AS has_learning_plan
     FROM users u
     LEFT JOIN learning_histories h ON h.user_id = u.id
     LEFT JOIN learning_plans lp ON lp.user_id = u.id
     LEFT JOIN student_instructor_assignments assign ON assign.student_user_id = u.id
     LEFT JOIN users assigned ON assigned.id = assign.instructor_user_id
     WHERE u.role = ?
       AND (? IS NULL OR u.organization_name = ?)
       AND (? = 1 OR assign.instructor_user_id = ? OR assign.instructor_user_id IS NULL)
     GROUP BY
       u.id,
       u.display_name,
       u.email,
       u.subscription_plan,
       u.organization_name,
       assign.instructor_user_id,
       assigned.display_name,
       has_learning_plan
     ORDER BY last_active DESC, name ASC`,
    UserRole.STUDENT,
    organizationName,
    organizationName,
    bypassInstructorAssignment ? 1 : 0,
    currentUser.id,
  );

  return rows.map((row) => {
    const lastActive = Number(row.last_active || 0);
    const daysSinceActive = lastActive > 0 ? Math.floor((Date.now() - lastActive) / DAY_MS) : Number.POSITIVE_INFINITY;
    const accuracy = row.total_attempts ? Number(row.total_correct || 0) / Number(row.total_attempts || 1) : 0;
    const riskLevel =
      daysSinceActive >= 3
        ? StudentRiskLevel.DANGER
        : daysSinceActive >= 1
          ? StudentRiskLevel.WARNING
          : StudentRiskLevel.SAFE;
    const riskReasons: string[] = [];

    if (daysSinceActive >= 3) riskReasons.push('3日以上学習が空いています');
    else if (daysSinceActive >= 1) riskReasons.push('前回学習から1日以上空いています');
    if (accuracy > 0 && accuracy < 0.7) riskReasons.push(`正答率が ${Math.round(accuracy * 100)}% です`);
    if (!row.has_learning_plan) riskReasons.push('学習プランが未設定です');
    if (riskReasons.length === 0) riskReasons.push('学習ペースは安定しています');

    const recommendedAction =
      riskLevel === StudentRiskLevel.DANGER
        ? '短い復習タスクを講師から指定して再開を促す'
        : riskLevel === StudentRiskLevel.WARNING
          ? '前回教材の復習を小さく区切って続けてもらう'
          : '現状の教材進行を維持しつつ次の単元を提案する';

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
      lastNotificationAt: Number(row.last_notification_at || 0) || undefined,
      lastNotificationMessage: row.last_notification_message || undefined,
      assignedInstructorUid: row.assigned_instructor_uid || undefined,
      assignedInstructorName: row.assigned_instructor_name || undefined,
      assignmentUpdatedAt: Number(row.assignment_updated_at || 0) || undefined,
      hasLearningPlan: Boolean(row.has_learning_plan),
      riskReasons,
      recommendedAction,
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
  const student = await readFirst<{
    id: string;
    display_name: string;
    role: string;
    organization_name: string | null;
  }>(env, 'SELECT id, display_name, role, organization_name FROM users WHERE id = ?', studentUid);

  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '対象生徒が見つかりません。');
  }

  if (
    currentUser.role !== UserRole.ADMIN &&
    (!visibleStudent || currentUser.organization_name !== student.organization_name)
  ) {
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
  const organizationName = user.organization_name || '';
  if (!organizationName) {
    throw new HttpError(403, '組織情報が設定されていません。');
  }

  const students = await handleGetAllStudentsProgress(env, user);
  const [memberCountRow, instructorCountRow, learningPlanCountRow, notifications7dRow, instructorRows, reactivationStats, assignmentEvents] = await Promise.all([
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM users
       WHERE organization_name = ?
         AND email NOT GLOB 'demo_*@medace.app'`,
      organizationName,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM users
       WHERE role = ? AND organization_name = ?
         AND email NOT GLOB 'demo_*@medace.app'`,
      UserRole.INSTRUCTOR,
      organizationName,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM learning_plans lp
       JOIN users u ON u.id = lp.user_id
       WHERE u.role = ? AND u.organization_name = ?`,
      UserRole.STUDENT,
      organizationName,
    ),
    readFirst<{ count: number }>(
      env,
      `SELECT COUNT(*) AS count
       FROM instructor_notifications n
       JOIN users s ON s.id = n.student_user_id
       WHERE s.organization_name = ? AND n.created_at >= ?`,
      organizationName,
      Date.now() - 7 * DAY_MS,
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
         u.organization_role AS organization_role,
         COALESCE(stats.notified_student_count, 0) AS notified_student_count,
         COALESCE(stats.notifications_7d, 0) AS notifications_7d,
         COALESCE(assignments.assigned_student_count, 0) AS assigned_student_count
       FROM users u
       LEFT JOIN (
         SELECT
           n.instructor_user_id AS instructor_user_id,
           COUNT(DISTINCT n.student_user_id) AS notified_student_count,
           SUM(CASE WHEN n.created_at >= ? THEN 1 ELSE 0 END) AS notifications_7d
         FROM instructor_notifications n
         JOIN users s ON s.id = n.student_user_id
         WHERE s.organization_name = ?
         GROUP BY n.instructor_user_id
       ) stats ON stats.instructor_user_id = u.id
       LEFT JOIN (
         SELECT
           instructor_user_id,
           COUNT(*) AS assigned_student_count
         FROM student_instructor_assignments
         GROUP BY instructor_user_id
       ) assignments ON assignments.instructor_user_id = u.id
       WHERE u.role = ? AND u.organization_name = ?
         AND u.email NOT GLOB 'demo_*@medace.app'
       ORDER BY
         CASE WHEN u.organization_role = ? THEN 0 ELSE 1 END,
         notifications_7d DESC,
         u.display_name ASC`,
      Date.now() - 7 * DAY_MS,
      organizationName,
      UserRole.INSTRUCTOR,
      organizationName,
      OrganizationRole.GROUP_ADMIN,
    ),
    readFirst<{ notified_student_count: number; reactivated_student_count: number }>(
      env,
      `SELECT
         COUNT(DISTINCT n.student_user_id) AS notified_student_count,
         COUNT(
           DISTINCT CASE
             WHEN EXISTS (
               SELECT 1
               FROM learning_histories h
               WHERE h.user_id = n.student_user_id
                 AND h.last_studied_at >= n.created_at
                 AND h.last_studied_at <= n.created_at + ?
             ) THEN n.student_user_id
             ELSE NULL
           END
         ) AS reactivated_student_count
       FROM instructor_notifications n
       JOIN users s ON s.id = n.student_user_id
       WHERE s.organization_name = ? AND n.created_at >= ?`,
      3 * DAY_MS,
      organizationName,
      Date.now() - 7 * DAY_MS,
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
       JOIN users changer ON changer.id = e.changed_by_user_id
       LEFT JOIN users prev ON prev.id = e.previous_instructor_user_id
       LEFT JOIN users next ON next.id = e.next_instructor_user_id
       WHERE s.organization_name = ?
       ORDER BY e.created_at DESC
       LIMIT 12`,
      organizationName,
    ),
  ]);

  const instructors: OrganizationInstructorSummary[] = instructorRows.map((row) => ({
    uid: row.uid,
    displayName: row.display_name,
    email: row.email,
    organizationRole: row.organization_role ? row.organization_role as OrganizationRole : undefined,
    notifiedStudentCount: Number(row.notified_student_count || 0),
    notifications7d: Number(row.notifications_7d || 0),
    assignedStudentCount: Number(row.assigned_student_count || 0),
  }));

  const reactivatedStudents7d = Number(reactivationStats?.reactivated_student_count || 0);
  const notifiedStudents7d = Number(reactivationStats?.notified_student_count || 0);
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
    organizationName,
    subscriptionPlan: getUserSubscriptionPlan(user),
    totalMembers: Number(memberCountRow?.count || 0),
    totalInstructors: Number(instructorCountRow?.count || 0),
    learningPlanCount: Number(learningPlanCountRow?.count || 0),
    notifications7d: Number(notifications7dRow?.count || 0),
    instructors,
    students,
    assignmentEvents: mappedAssignmentEvents,
    reactivatedStudents7d,
    notifiedStudents7d,
  });
};

export const handleSendInstructorNotification = async (
  env: AppEnv,
  instructor: DbUserRow,
  studentUid: string,
  message: string,
  triggerReason: string,
  usedAi: boolean,
): Promise<void> => {
  const trimmedMessage = message.trim();
  const trimmedReason = triggerReason.trim() || '学習フォローアップ';
  if (!trimmedMessage) {
    throw new HttpError(400, '通知メッセージを入力してください。');
  }

  const student = await readFirst<{ id: string; role: string; organization_name: string | null }>(
    env,
    'SELECT id, role, organization_name FROM users WHERE id = ?',
    studentUid,
  );
  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '通知対象の生徒が見つかりません。');
  }
  if (instructor.role !== UserRole.ADMIN && instructor.organization_name && instructor.organization_name !== student.organization_name) {
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

  await env.DB.prepare(`
    INSERT INTO instructor_notifications (
      student_user_id, instructor_user_id, message, trigger_reason, delivery_channel, used_ai, created_at
    ) VALUES (?, ?, ?, ?, 'IN_APP', ?, ?)
  `).bind(
    studentUid,
    instructor.id,
    trimmedMessage,
    trimmedReason,
    usedAi ? 1 : 0,
    Date.now(),
  ).run();
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
       n.created_at
     FROM instructor_notifications n
     JOIN users s ON s.id = n.student_user_id
     JOIN users i ON i.id = n.instructor_user_id
     WHERE n.student_user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 3`,
    userId,
  );

  return rows.map((row) => ({
    id: row.id,
    studentUid: row.student_user_id,
    studentName: row.student_name,
    instructorUid: row.instructor_user_id,
    instructorName: row.instructor_name,
    message: row.message,
    triggerReason: row.trigger_reason,
    deliveryChannel: row.delivery_channel,
    usedAi: Boolean(row.used_ai),
    createdAt: row.created_at,
  }));
};

export const handleAssignStudentInstructor = async (
  env: AppEnv,
  currentUser: DbUserRow,
  studentUid: string,
  instructorUid: string | null,
): Promise<void> => {
  if (!studentUid) throw new HttpError(400, '生徒を指定してください。');
  if (currentUser.role !== UserRole.ADMIN) {
    requireOrganizationRole(currentUser, [OrganizationRole.GROUP_ADMIN]);
  }

  const student = await readFirst<{ id: string; organization_name: string | null; role: string }>(
    env,
    'SELECT id, organization_name, role FROM users WHERE id = ?',
    studentUid,
  );
  if (!student || student.role !== UserRole.STUDENT) throw new HttpError(404, '対象生徒が見つかりません。');
  if (currentUser.role !== UserRole.ADMIN && student.organization_name !== currentUser.organization_name) {
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
    const instructor = await readFirst<{ id: string; organization_name: string | null; role: string }>(
      env,
      'SELECT id, organization_name, role FROM users WHERE id = ?',
      instructorUid,
    );
    if (!instructor || instructor.role !== UserRole.INSTRUCTOR) {
      throw new HttpError(404, '担当講師が見つかりません。');
    }
    if (!student.organization_name) {
      throw new HttpError(400, '組織に所属していない生徒には担当割当できません。');
    }
    if (instructor.organization_name !== student.organization_name) {
      throw new HttpError(400, '生徒と同じ組織の講師にのみ割り当てできます。');
    }
    if (currentUser.role !== UserRole.ADMIN && instructor.organization_name !== currentUser.organization_name) {
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
};
