import {
  BookAccessScope,
  BookCatalogSource,
  EnglishLevel,
  LearningTrack,
  MissionProgressEventType,
  LearningPreferenceIntensity,
  type MissionAssignment,
  type MissionProgressSummary,
  type PrimaryMissionSnapshot,
  UserGrade,
  OrganizationRole,
  WeeklyMissionStatus,
  type WeeklyMission,
  type WeeklyMissionBoard,
  WritingAssignmentStatus,
  UserRole,
} from '../../types';
import {
  buildMissionProgress,
  buildSuggestedMissionDraft,
  isWritingReturnedForMission,
  toPrimaryMissionSnapshot,
} from '../../shared/missions';
import { requireActiveOrganizationContext, appendOrganizationAuditLog } from './organization-memberships';
import { rebuildOrganizationKpiSnapshots } from './organization-kpi';
import type { AppEnv, DbUserRow } from './types';
import { HttpError } from './http';
import {
  readAll,
  readFirst,
  toTokyoDateKey,
} from './storage-support';

interface DbMissionBoardRow {
  assignment_id: string;
  student_uid: string;
  student_name: string;
  assigned_by_uid: string;
  assigned_by_name: string;
  assigned_at: number;
  started_at: number | null;
  restarted_at: number | null;
  last_activity_at: number | null;
  completed_at: number | null;
  assignment_status: string;
  new_word_ids_json: string | null;
  review_word_ids_json: string | null;
  quiz_day_keys_json: string | null;
  mission_id: string;
  organization_id: string | null;
  created_by_uid: string;
  learning_track: string;
  title: string;
  rationale: string;
  book_id: string | null;
  book_title: string | null;
  new_words_target: number;
  review_words_target: number;
  quiz_target_count: number;
  writing_assignment_id: string | null;
  writing_prompt_title: string | null;
  writing_status: string | null;
  due_at: number;
  mission_status: string;
  mission_created_at: number;
  mission_updated_at: number;
}

interface DbMissionProgressRow {
  assignment_id: string;
  student_uid: string;
  student_organization_id: string | null;
  assigned_at: number;
  started_at: number | null;
  restarted_at: number | null;
  last_activity_at: number | null;
  completed_at: number | null;
  assignment_status: string;
  new_word_ids_json: string | null;
  review_word_ids_json: string | null;
  quiz_day_keys_json: string | null;
  book_id: string | null;
  new_words_target: number;
  review_words_target: number;
  quiz_target_count: number;
  writing_assignment_id: string | null;
  writing_status: string | null;
  due_at: number;
}

const ACTIVE_ASSIGNMENT_STATUSES = [
  WeeklyMissionStatus.ASSIGNED,
  WeeklyMissionStatus.IN_PROGRESS,
  WeeklyMissionStatus.OVERDUE,
] as const;

const isLearningTrack = (value: string): value is LearningTrack => (
  Object.values(LearningTrack).includes(value as LearningTrack)
);

const isWeeklyMissionStatus = (value: string): value is WeeklyMissionStatus => (
  Object.values(WeeklyMissionStatus).includes(value as WeeklyMissionStatus)
);

const isMissionProgressEventType = (value: string): value is MissionProgressEventType => (
  Object.values(MissionProgressEventType).includes(value as MissionProgressEventType)
);

const isWritingAssignmentStatus = (value: string): value is WritingAssignmentStatus => (
  Object.values(WritingAssignmentStatus).includes(value as WritingAssignmentStatus)
);

const parseStringArray = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const stringifyUnique = (values: string[]): string => JSON.stringify([...new Set(values)]);

const toMissionProgress = (row: Pick<
  DbMissionBoardRow,
  | 'assigned_at'
  | 'started_at'
  | 'restarted_at'
  | 'last_activity_at'
  | 'completed_at'
  | 'due_at'
  | 'new_word_ids_json'
  | 'review_word_ids_json'
  | 'quiz_day_keys_json'
  | 'new_words_target'
  | 'review_words_target'
  | 'quiz_target_count'
  | 'writing_assignment_id'
  | 'writing_status'
  | 'assignment_status'
>, now = Date.now()): MissionProgressSummary => {
  const writingStatus = row.writing_status && isWritingAssignmentStatus(row.writing_status)
    ? row.writing_status
    : undefined;
  const computed = buildMissionProgress({
    assignedAt: row.assigned_at,
    startedAt: Number(row.started_at || 0) || undefined,
    restartedAt: Number(row.restarted_at || 0) || undefined,
    lastActivityAt: Number(row.last_activity_at || 0) || undefined,
    completedAt: Number(row.completed_at || 0) || undefined,
    dueAt: Number(row.due_at || 0),
    newWordsCompleted: parseStringArray(row.new_word_ids_json).length,
    newWordsTarget: Number(row.new_words_target || 0),
    reviewWordsCompleted: parseStringArray(row.review_word_ids_json).length,
    reviewWordsTarget: Number(row.review_words_target || 0),
    quizCompletedCount: parseStringArray(row.quiz_day_keys_json).length,
    quizTargetCount: Number(row.quiz_target_count || 0),
    writingRequired: Boolean(row.writing_assignment_id),
    writingCompleted: isWritingReturnedForMission(writingStatus),
    now,
  });

  if (row.assignment_status && isWeeklyMissionStatus(row.assignment_status) && row.assignment_status === WeeklyMissionStatus.ARCHIVED) {
    return { ...computed, status: WeeklyMissionStatus.ARCHIVED };
  }
  return computed;
};

const toMissionAssignment = (row: DbMissionBoardRow, now = Date.now()): MissionAssignment => {
  const progress = toMissionProgress(row, now);
  const mission: WeeklyMission = {
    id: row.mission_id,
    organizationId: row.organization_id || undefined,
    createdByUid: row.created_by_uid,
    learningTrack: isLearningTrack(row.learning_track) ? row.learning_track : LearningTrack.SCHOOL_TERM,
    title: row.title,
    rationale: row.rationale,
    bookId: row.book_id || undefined,
    bookTitle: row.book_title || undefined,
    newWordsTarget: Number(row.new_words_target || 0),
    reviewWordsTarget: Number(row.review_words_target || 0),
    quizTargetCount: Number(row.quiz_target_count || 0),
    writingAssignmentId: row.writing_assignment_id || undefined,
    writingPromptTitle: row.writing_prompt_title || undefined,
    dueAt: Number(row.due_at || 0),
    status: progress.status,
    isSuggested: false,
    createdAt: Number(row.mission_created_at || 0),
    updatedAt: Number(row.mission_updated_at || 0),
  };

  return {
    id: row.assignment_id,
    missionId: row.mission_id,
    studentUid: row.student_uid,
    studentName: row.student_name,
    assignedByUid: row.assigned_by_uid,
    assignedByName: row.assigned_by_name,
    assignedAt: Number(row.assigned_at || 0),
    progress,
    mission,
  };
};

const readMissionBoardRows = async (
  env: AppEnv,
  currentUser: DbUserRow,
  {
    studentUid,
    organizationId,
  }: {
    studentUid?: string;
    organizationId?: string | null;
  } = {},
): Promise<DbMissionBoardRow[]> => {
  if (currentUser.role === UserRole.STUDENT) {
    return readAll<DbMissionBoardRow>(
      env,
      `SELECT
         a.id AS assignment_id,
         a.student_user_id AS student_uid,
         student.display_name AS student_name,
         a.assigned_by_user_id AS assigned_by_uid,
         assigner.display_name AS assigned_by_name,
         a.assigned_at AS assigned_at,
         a.started_at AS started_at,
         a.restarted_at AS restarted_at,
         a.last_activity_at AS last_activity_at,
         a.completed_at AS completed_at,
         a.status AS assignment_status,
         a.new_word_ids_json AS new_word_ids_json,
         a.review_word_ids_json AS review_word_ids_json,
         a.quiz_day_keys_json AS quiz_day_keys_json,
         m.id AS mission_id,
         m.organization_id AS organization_id,
         m.created_by_user_id AS created_by_uid,
         m.learning_track AS learning_track,
         m.title AS title,
         m.rationale AS rationale,
         m.book_id AS book_id,
         m.book_title AS book_title,
         m.new_words_target AS new_words_target,
         m.review_words_target AS review_words_target,
         m.quiz_target_count AS quiz_target_count,
         m.writing_assignment_id AS writing_assignment_id,
         wa.prompt_title AS writing_prompt_title,
         wa.status AS writing_status,
         m.due_at AS due_at,
         m.status AS mission_status,
         m.created_at AS mission_created_at,
         m.updated_at AS mission_updated_at
       FROM weekly_mission_assignments a
       JOIN weekly_missions m ON m.id = a.mission_id
       JOIN users student ON student.id = a.student_user_id
       JOIN users assigner ON assigner.id = a.assigned_by_user_id
       LEFT JOIN writing_assignments wa ON wa.id = m.writing_assignment_id
       WHERE a.student_user_id = ?
         AND a.status != ?
       ORDER BY a.assigned_at DESC`,
      currentUser.id,
      WeeklyMissionStatus.ARCHIVED,
    );
  }

  if (currentUser.role !== UserRole.ADMIN) {
    const org = await requireActiveOrganizationContext(env, currentUser);
    const effectiveOrganizationId = organizationId || org.organizationId;
    if (effectiveOrganizationId !== org.organizationId) {
      throw new HttpError(403, '同じ組織のミッションのみ参照できます。');
    }

    return readAll<DbMissionBoardRow>(
      env,
      `SELECT
         a.id AS assignment_id,
         a.student_user_id AS student_uid,
         student.display_name AS student_name,
         a.assigned_by_user_id AS assigned_by_uid,
         assigner.display_name AS assigned_by_name,
         a.assigned_at AS assigned_at,
         a.started_at AS started_at,
         a.restarted_at AS restarted_at,
         a.last_activity_at AS last_activity_at,
         a.completed_at AS completed_at,
         a.status AS assignment_status,
         a.new_word_ids_json AS new_word_ids_json,
         a.review_word_ids_json AS review_word_ids_json,
         a.quiz_day_keys_json AS quiz_day_keys_json,
         m.id AS mission_id,
         m.organization_id AS organization_id,
         m.created_by_user_id AS created_by_uid,
         m.learning_track AS learning_track,
         m.title AS title,
         m.rationale AS rationale,
         m.book_id AS book_id,
         m.book_title AS book_title,
         m.new_words_target AS new_words_target,
         m.review_words_target AS review_words_target,
         m.quiz_target_count AS quiz_target_count,
         m.writing_assignment_id AS writing_assignment_id,
         wa.prompt_title AS writing_prompt_title,
         wa.status AS writing_status,
         m.due_at AS due_at,
         m.status AS mission_status,
         m.created_at AS mission_created_at,
         m.updated_at AS mission_updated_at
       FROM weekly_mission_assignments a
       JOIN weekly_missions m ON m.id = a.mission_id
       JOIN users student ON student.id = a.student_user_id
       JOIN users assigner ON assigner.id = a.assigned_by_user_id
       LEFT JOIN writing_assignments wa ON wa.id = m.writing_assignment_id
       LEFT JOIN student_instructor_assignments assign ON assign.student_user_id = a.student_user_id
       WHERE m.organization_id = ?
         AND a.status != ?
         AND (? IS NULL OR a.student_user_id = ?)
         AND (
           ? = 1
           OR assign.instructor_user_id IS NULL
           OR assign.instructor_user_id = ?
         )
       ORDER BY
         CASE a.status
           WHEN 'OVERDUE' THEN 0
           WHEN 'IN_PROGRESS' THEN 1
           WHEN 'ASSIGNED' THEN 2
           ELSE 3
         END,
         m.due_at ASC,
         student.display_name ASC`,
      effectiveOrganizationId,
      WeeklyMissionStatus.ARCHIVED,
      studentUid || null,
      studentUid || null,
      org.organizationRole === OrganizationRole.GROUP_ADMIN ? 1 : 0,
      currentUser.id,
    );
  }

  return readAll<DbMissionBoardRow>(
    env,
    `SELECT
       a.id AS assignment_id,
       a.student_user_id AS student_uid,
       student.display_name AS student_name,
       a.assigned_by_user_id AS assigned_by_uid,
       assigner.display_name AS assigned_by_name,
       a.assigned_at AS assigned_at,
       a.started_at AS started_at,
       a.restarted_at AS restarted_at,
       a.last_activity_at AS last_activity_at,
       a.completed_at AS completed_at,
       a.status AS assignment_status,
       a.new_word_ids_json AS new_word_ids_json,
       a.review_word_ids_json AS review_word_ids_json,
       a.quiz_day_keys_json AS quiz_day_keys_json,
       m.id AS mission_id,
       m.organization_id AS organization_id,
       m.created_by_user_id AS created_by_uid,
       m.learning_track AS learning_track,
       m.title AS title,
       m.rationale AS rationale,
       m.book_id AS book_id,
       m.book_title AS book_title,
       m.new_words_target AS new_words_target,
       m.review_words_target AS review_words_target,
       m.quiz_target_count AS quiz_target_count,
       m.writing_assignment_id AS writing_assignment_id,
       wa.prompt_title AS writing_prompt_title,
       wa.status AS writing_status,
       m.due_at AS due_at,
       m.status AS mission_status,
       m.created_at AS mission_created_at,
       m.updated_at AS mission_updated_at
     FROM weekly_mission_assignments a
     JOIN weekly_missions m ON m.id = a.mission_id
     JOIN users student ON student.id = a.student_user_id
     JOIN users assigner ON assigner.id = a.assigned_by_user_id
     LEFT JOIN writing_assignments wa ON wa.id = m.writing_assignment_id
     WHERE a.status != ?
       AND (? IS NULL OR a.student_user_id = ?)
       AND (? IS NULL OR m.organization_id = ?)
     ORDER BY a.assigned_at DESC`,
    WeeklyMissionStatus.ARCHIVED,
    studentUid || null,
    studentUid || null,
    organizationId || null,
    organizationId || null,
  );
};

const updateAssignmentProgressRow = async ({
  env,
  row,
  nextNewWordIds,
  nextReviewWordIds,
  nextQuizDayKeys,
  startedAt,
  restartedAt,
  lastActivityAt,
  completedAt,
  status,
}: {
  env: AppEnv;
  row: DbMissionProgressRow;
  nextNewWordIds: string[];
  nextReviewWordIds: string[];
  nextQuizDayKeys: string[];
  startedAt?: number;
  restartedAt?: number;
  lastActivityAt?: number;
  completedAt?: number;
  status: WeeklyMissionStatus;
}): Promise<void> => {
  await env.DB.prepare(`
    UPDATE weekly_mission_assignments
    SET started_at = ?,
        restarted_at = ?,
        last_activity_at = ?,
        completed_at = ?,
        status = ?,
        new_word_ids_json = ?,
        review_word_ids_json = ?,
        quiz_day_keys_json = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    startedAt || null,
    restartedAt || null,
    lastActivityAt || null,
    completedAt || null,
    status,
    stringifyUnique(nextNewWordIds),
    stringifyUnique(nextReviewWordIds),
    stringifyUnique(nextQuizDayKeys),
    Date.now(),
    row.assignment_id,
  ).run();
};

const syncAssignmentProgress = async (
  env: AppEnv,
  row: DbMissionProgressRow,
  {
    nextNewWordIds,
    nextReviewWordIds,
    nextQuizDayKeys,
    activityAt,
  }: {
    nextNewWordIds: string[];
    nextReviewWordIds: string[];
    nextQuizDayKeys: string[];
    activityAt: number;
  },
): Promise<void> => {
  const currentProgress = buildMissionProgress({
    assignedAt: Number(row.assigned_at || 0),
    startedAt: Number(row.started_at || 0) || undefined,
    restartedAt: Number(row.restarted_at || 0) || undefined,
    lastActivityAt: Number(row.last_activity_at || 0) || undefined,
    completedAt: Number(row.completed_at || 0) || undefined,
    dueAt: Number(row.due_at || 0),
    newWordsCompleted: nextNewWordIds.length,
    newWordsTarget: Number(row.new_words_target || 0),
    reviewWordsCompleted: nextReviewWordIds.length,
    reviewWordsTarget: Number(row.review_words_target || 0),
    quizCompletedCount: nextQuizDayKeys.length,
    quizTargetCount: Number(row.quiz_target_count || 0),
    writingRequired: Boolean(row.writing_assignment_id),
    writingCompleted: isWritingReturnedForMission(
      row.writing_status && isWritingAssignmentStatus(row.writing_status) ? row.writing_status : undefined,
    ),
    now: activityAt,
  });

  const nextStartedAt = Number(row.started_at || 0) || activityAt;
  const nextRestartedAt = Number(row.restarted_at || 0) || activityAt;
  await updateAssignmentProgressRow({
    env,
    row,
    nextNewWordIds,
    nextReviewWordIds,
    nextQuizDayKeys,
    startedAt: nextStartedAt,
    restartedAt: nextRestartedAt,
    lastActivityAt: activityAt,
    completedAt: currentProgress.status === WeeklyMissionStatus.COMPLETED
      ? Number(row.completed_at || 0) || activityAt
      : undefined,
    status: currentProgress.status,
  });
};

const readActiveMissionProgressRowsForStudent = async (
  env: AppEnv,
  studentUid: string,
): Promise<DbMissionProgressRow[]> => readAll<DbMissionProgressRow>(
  env,
  `SELECT
     a.id AS assignment_id,
     a.student_user_id AS student_uid,
     membership.organization_id AS student_organization_id,
     a.assigned_at AS assigned_at,
     a.started_at AS started_at,
     a.restarted_at AS restarted_at,
     a.last_activity_at AS last_activity_at,
     a.completed_at AS completed_at,
     a.status AS assignment_status,
     a.new_word_ids_json AS new_word_ids_json,
     a.review_word_ids_json AS review_word_ids_json,
     a.quiz_day_keys_json AS quiz_day_keys_json,
     m.book_id AS book_id,
     m.new_words_target AS new_words_target,
     m.review_words_target AS review_words_target,
     m.quiz_target_count AS quiz_target_count,
     m.writing_assignment_id AS writing_assignment_id,
     wa.status AS writing_status,
     m.due_at AS due_at
   FROM weekly_mission_assignments a
   JOIN weekly_missions m ON m.id = a.mission_id
   JOIN users student ON student.id = a.student_user_id
   LEFT JOIN organization_memberships membership
     ON membership.user_id = student.id
    AND membership.status = 'ACTIVE'
   LEFT JOIN writing_assignments wa ON wa.id = m.writing_assignment_id
   WHERE a.student_user_id = ?
     AND a.status IN (?, ?, ?)`,
  studentUid,
  ...ACTIVE_ASSIGNMENT_STATUSES,
);

export const touchWeeklyMissionProgressFromStudy = async (
  env: AppEnv,
  user: DbUserRow,
  {
    wordId,
    bookId,
    assignmentId,
    existingWasStudy,
    studiedAt = Date.now(),
  }: {
    wordId: string;
    bookId: string;
    assignmentId?: string;
    existingWasStudy: boolean;
    studiedAt?: number;
  },
): Promise<void> => {
  const assignments = await readActiveMissionProgressRowsForStudent(env, user.id);
  for (const row of assignments) {
    if (assignmentId && row.assignment_id !== assignmentId) continue;
    if (row.book_id && row.book_id !== bookId) continue;
    const nextNewWordIds = parseStringArray(row.new_word_ids_json);
    const nextReviewWordIds = parseStringArray(row.review_word_ids_json);
    const nextQuizDayKeys = parseStringArray(row.quiz_day_keys_json);

    if (existingWasStudy) nextReviewWordIds.push(wordId);
    else nextNewWordIds.push(wordId);

    await syncAssignmentProgress(env, row, {
      nextNewWordIds,
      nextReviewWordIds,
      nextQuizDayKeys,
      activityAt: studiedAt,
    });
  }
};

export const touchWeeklyMissionProgressFromQuiz = async (
  env: AppEnv,
  user: DbUserRow,
  {
    bookId,
    assignmentId,
    dateKey,
    attemptedAt = Date.now(),
  }: {
    bookId: string;
    assignmentId?: string;
    dateKey: string;
    attemptedAt?: number;
  },
): Promise<void> => {
  const assignments = await readActiveMissionProgressRowsForStudent(env, user.id);
  for (const row of assignments) {
    if (assignmentId && row.assignment_id !== assignmentId) continue;
    if (row.book_id && row.book_id !== bookId) continue;
    const nextNewWordIds = parseStringArray(row.new_word_ids_json);
    const nextReviewWordIds = parseStringArray(row.review_word_ids_json);
    const nextQuizDayKeys = parseStringArray(row.quiz_day_keys_json);
    nextQuizDayKeys.push(dateKey);

    await syncAssignmentProgress(env, row, {
      nextNewWordIds,
      nextReviewWordIds,
      nextQuizDayKeys,
      activityAt: attemptedAt,
    });
  }
};

export const touchWeeklyMissionProgressFromWriting = async (
  env: AppEnv,
  {
    studentUid,
    writingAssignmentId,
    activityAt = Date.now(),
  }: {
    studentUid: string;
    writingAssignmentId: string;
    activityAt?: number;
  },
): Promise<void> => {
  const assignments = await readActiveMissionProgressRowsForStudent(env, studentUid);
  const organizationIds = new Set<string>();
  for (const row of assignments) {
    if (row.writing_assignment_id !== writingAssignmentId) continue;
    if (row.student_organization_id) {
      organizationIds.add(row.student_organization_id);
    }
    await syncAssignmentProgress(env, row, {
      nextNewWordIds: parseStringArray(row.new_word_ids_json),
      nextReviewWordIds: parseStringArray(row.review_word_ids_json),
      nextQuizDayKeys: parseStringArray(row.quiz_day_keys_json),
      activityAt,
    });
  }
  await Promise.all(
    [...organizationIds].map((organizationId) => rebuildOrganizationKpiSnapshots(env, organizationId, {
      dateKeys: [toTokyoDateKey(activityAt)],
    })),
  );
};

export const handleCreateWeeklyMission = async (
  env: AppEnv,
  currentUser: DbUserRow,
  payload: {
    learningTrack: LearningTrack;
    title?: string;
    rationale?: string;
    bookId?: string;
    bookTitle?: string;
    newWordsTarget: number;
    reviewWordsTarget: number;
    quizTargetCount: number;
    writingAssignmentId?: string;
    dueAt?: number;
  },
): Promise<WeeklyMission> => {
  const organization = await requireActiveOrganizationContext(env, currentUser, [OrganizationRole.GROUP_ADMIN]);
  if (!isLearningTrack(payload.learningTrack)) {
    throw new HttpError(400, '学習トラックが不正です。');
  }

  const missionId = crypto.randomUUID();
  const createdAt = Date.now();
  const dueAt = Number(payload.dueAt || 0) || Date.now() + 7 * 86400000;
  const title = (payload.title || '').trim() || `${payload.learningTrack} ミッション`;
  const rationale = (payload.rationale || '').trim() || '今週の学習継続を戻すための週次ミッションです。';
  let bookTitle = payload.bookTitle?.trim() || '';

  if (payload.bookId && !bookTitle) {
    const book = await readFirst<{ title: string }>(env, 'SELECT title FROM books WHERE id = ?', payload.bookId);
    bookTitle = book?.title || '';
  }

  let writingPromptTitle: string | undefined;
  if (payload.writingAssignmentId) {
    const writingAssignment = await readFirst<{
      id: string;
      organization_id: string | null;
      prompt_title: string;
    }>(
      env,
      'SELECT id, organization_id, prompt_title FROM writing_assignments WHERE id = ?',
      payload.writingAssignmentId,
    );
    if (!writingAssignment) {
      throw new HttpError(404, '紐づける英作文課題が見つかりません。');
    }
    if (writingAssignment.organization_id && writingAssignment.organization_id !== organization.organizationId) {
      throw new HttpError(403, '同じ組織の英作文課題のみミッションに紐づけできます。');
    }
    writingPromptTitle = writingAssignment.prompt_title;
  }

  await env.DB.prepare(`
    INSERT INTO weekly_missions (
      id, organization_id, created_by_user_id, learning_track, title, rationale, book_id, book_title,
      new_words_target, review_words_target, quiz_target_count, writing_assignment_id, due_at, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    missionId,
    organization.organizationId,
    currentUser.id,
    payload.learningTrack,
    title,
    rationale,
    payload.bookId || null,
    bookTitle || null,
    Math.max(0, Math.round(payload.newWordsTarget || 0)),
    Math.max(0, Math.round(payload.reviewWordsTarget || 0)),
    Math.max(0, Math.round(payload.quizTargetCount || 0)),
    payload.writingAssignmentId || null,
    dueAt,
    WeeklyMissionStatus.ASSIGNED,
    createdAt,
    createdAt,
  ).run();

  await appendOrganizationAuditLog(env, {
    organizationId: organization.organizationId,
    actorUserId: currentUser.id,
    actionType: 'WEEKLY_MISSION_CREATED',
    targetType: 'mission',
    targetId: missionId,
    payload: {
      learningTrack: payload.learningTrack,
      bookId: payload.bookId || null,
      writingAssignmentId: payload.writingAssignmentId || null,
    },
  });

  return {
    id: missionId,
    organizationId: organization.organizationId,
    createdByUid: currentUser.id,
    learningTrack: payload.learningTrack,
    title,
    rationale,
    bookId: payload.bookId || undefined,
    bookTitle: bookTitle || undefined,
    newWordsTarget: Math.max(0, Math.round(payload.newWordsTarget || 0)),
    reviewWordsTarget: Math.max(0, Math.round(payload.reviewWordsTarget || 0)),
    quizTargetCount: Math.max(0, Math.round(payload.quizTargetCount || 0)),
    writingAssignmentId: payload.writingAssignmentId || undefined,
    writingPromptTitle,
    dueAt,
    status: WeeklyMissionStatus.ASSIGNED,
    createdAt,
    updatedAt: createdAt,
  };
};

export const handleAssignWeeklyMission = async (
  env: AppEnv,
  currentUser: DbUserRow,
  missionId: string,
  studentUid: string,
): Promise<MissionAssignment> => {
  if (!missionId || !studentUid) {
    throw new HttpError(400, 'ミッションと生徒を指定してください。');
  }
  const organization = await requireActiveOrganizationContext(env, currentUser, [OrganizationRole.GROUP_ADMIN]);
  const mission = await readFirst<DbMissionBoardRow>(
    env,
    `SELECT
       '' AS assignment_id,
       '' AS student_uid,
       '' AS student_name,
       '' AS assigned_by_uid,
       '' AS assigned_by_name,
       0 AS assigned_at,
       NULL AS started_at,
       NULL AS restarted_at,
       NULL AS last_activity_at,
       NULL AS completed_at,
       ? AS assignment_status,
       '[]' AS new_word_ids_json,
       '[]' AS review_word_ids_json,
       '[]' AS quiz_day_keys_json,
       m.id AS mission_id,
       m.organization_id AS organization_id,
       m.created_by_user_id AS created_by_uid,
       m.learning_track AS learning_track,
       m.title AS title,
       m.rationale AS rationale,
       m.book_id AS book_id,
       m.book_title AS book_title,
       m.new_words_target AS new_words_target,
       m.review_words_target AS review_words_target,
       m.quiz_target_count AS quiz_target_count,
       m.writing_assignment_id AS writing_assignment_id,
       wa.prompt_title AS writing_prompt_title,
       wa.status AS writing_status,
       m.due_at AS due_at,
       m.status AS mission_status,
       m.created_at AS mission_created_at,
       m.updated_at AS mission_updated_at
     FROM weekly_missions m
     LEFT JOIN writing_assignments wa ON wa.id = m.writing_assignment_id
     WHERE m.id = ?`,
    WeeklyMissionStatus.ASSIGNED,
    missionId,
  );
  if (!mission) {
    throw new HttpError(404, 'ミッションが見つかりません。');
  }
  if (mission.organization_id && mission.organization_id !== organization.organizationId) {
    throw new HttpError(403, '同じ組織のミッションのみ配布できます。');
  }

  const student = await readFirst<{ id: string; display_name: string; role: string; organization_id: string | null }>(
    env,
    'SELECT id, display_name, role, organization_id FROM users WHERE id = ?',
    studentUid,
  );
  if (!student || student.role !== UserRole.STUDENT) {
    throw new HttpError(404, '対象生徒が見つかりません。');
  }
  if (student.organization_id !== organization.organizationId) {
    throw new HttpError(403, '同じ組織の生徒にのみミッションを配布できます。');
  }

  await env.DB.prepare(`
    UPDATE weekly_mission_assignments
    SET status = ?, updated_at = ?
    WHERE student_user_id = ?
      AND status != ?
  `).bind(
    WeeklyMissionStatus.ARCHIVED,
    Date.now(),
    studentUid,
    WeeklyMissionStatus.ARCHIVED,
  ).run();

  const assignmentId = crypto.randomUUID();
  const assignedAt = Date.now();
  await env.DB.prepare(`
    INSERT INTO weekly_mission_assignments (
      id, mission_id, student_user_id, assigned_by_user_id, status, assigned_at,
      started_at, restarted_at, last_activity_at, completed_at,
      new_word_ids_json, review_word_ids_json, quiz_day_keys_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', ?)
  `).bind(
    assignmentId,
    missionId,
    studentUid,
    currentUser.id,
    WeeklyMissionStatus.ASSIGNED,
    assignedAt,
    assignedAt,
  ).run();

  await appendOrganizationAuditLog(env, {
    organizationId: organization.organizationId,
    actorUserId: currentUser.id,
    actionType: 'WEEKLY_MISSION_ASSIGNED',
    targetType: 'student',
    targetId: studentUid,
    payload: {
      missionId,
      learningTrack: mission.learning_track,
    },
  });
  await rebuildOrganizationKpiSnapshots(env, organization.organizationId, {
    dateKeys: [toTokyoDateKey(assignedAt)],
  });

  const [assigned] = await readMissionBoardRows(env, currentUser, { studentUid });
  if (!assigned) {
    throw new HttpError(500, 'ミッション割当後の取得に失敗しました。');
  }
  return toMissionAssignment(assigned);
};

export const handleGetWeeklyMissionBoard = async (
  env: AppEnv,
  currentUser: DbUserRow,
): Promise<WeeklyMissionBoard> => {
  const rows = await readMissionBoardRows(env, currentUser);
  return {
    assignments: rows.map((row) => toMissionAssignment(row)),
  };
};

export const handleUpdateMissionProgress = async (
  env: AppEnv,
  currentUser: DbUserRow,
  assignmentId: string,
  eventType: string,
): Promise<MissionAssignment> => {
  if (!assignmentId || !isMissionProgressEventType(eventType)) {
    throw new HttpError(400, 'ミッション進捗イベントが不正です。');
  }

  const row = await readFirst<DbMissionProgressRow & { organization_id: string | null; assigned_by_user_id: string }>(
    env,
    `SELECT
       a.id AS assignment_id,
       a.student_user_id AS student_uid,
       membership.organization_id AS student_organization_id,
       m.organization_id AS organization_id,
       a.assigned_by_user_id AS assigned_by_user_id,
       a.assigned_at AS assigned_at,
       a.started_at AS started_at,
       a.restarted_at AS restarted_at,
       a.last_activity_at AS last_activity_at,
       a.completed_at AS completed_at,
       a.status AS assignment_status,
       a.new_word_ids_json AS new_word_ids_json,
       a.review_word_ids_json AS review_word_ids_json,
       a.quiz_day_keys_json AS quiz_day_keys_json,
       m.book_id AS book_id,
       m.new_words_target AS new_words_target,
       m.review_words_target AS review_words_target,
       m.quiz_target_count AS quiz_target_count,
       m.writing_assignment_id AS writing_assignment_id,
       wa.status AS writing_status,
       m.due_at AS due_at
     FROM weekly_mission_assignments a
     JOIN weekly_missions m ON m.id = a.mission_id
     JOIN users student ON student.id = a.student_user_id
     LEFT JOIN organization_memberships membership
       ON membership.user_id = student.id
      AND membership.status = 'ACTIVE'
     LEFT JOIN writing_assignments wa ON wa.id = m.writing_assignment_id
     WHERE a.id = ?`,
    assignmentId,
  );
  if (!row) {
    throw new HttpError(404, 'ミッション割当が見つかりません。');
  }

  if (currentUser.role === UserRole.STUDENT && currentUser.id !== row.student_uid) {
    throw new HttpError(403, '自分のミッションのみ更新できます。');
  }
  if (currentUser.role !== UserRole.STUDENT && currentUser.role !== UserRole.ADMIN) {
    const organization = await requireActiveOrganizationContext(env, currentUser);
    if (organization.organizationId !== row.organization_id) {
      throw new HttpError(403, '同じ組織のミッションのみ更新できます。');
    }
  }

  const now = Date.now();
  const nextNewWordIds = parseStringArray(row.new_word_ids_json);
  const nextReviewWordIds = parseStringArray(row.review_word_ids_json);
  const nextQuizDayKeys = parseStringArray(row.quiz_day_keys_json);
  const nextStartedAt = Number(row.started_at || 0) || now;
  const nextRestartedAt = Number(row.restarted_at || 0) || now;
  const nextProgress = buildMissionProgress({
    assignedAt: Number(row.assigned_at || 0),
    startedAt: nextStartedAt,
    restartedAt: nextRestartedAt,
    lastActivityAt: now,
    completedAt: Number(row.completed_at || 0) || undefined,
    dueAt: Number(row.due_at || 0),
    newWordsCompleted: nextNewWordIds.length,
    newWordsTarget: Number(row.new_words_target || 0),
    reviewWordsCompleted: nextReviewWordIds.length,
    reviewWordsTarget: Number(row.review_words_target || 0),
    quizCompletedCount: nextQuizDayKeys.length,
    quizTargetCount: Number(row.quiz_target_count || 0),
    writingRequired: Boolean(row.writing_assignment_id),
    writingCompleted: isWritingReturnedForMission(
      row.writing_status && isWritingAssignmentStatus(row.writing_status) ? row.writing_status : undefined,
    ),
    now,
  });

  await updateAssignmentProgressRow({
    env,
    row,
    nextNewWordIds,
    nextReviewWordIds,
    nextQuizDayKeys,
    startedAt: nextStartedAt,
    restartedAt: nextRestartedAt,
    lastActivityAt: now,
    completedAt: eventType === MissionProgressEventType.MANUAL_COMPLETE
      ? now
      : nextProgress.status === WeeklyMissionStatus.COMPLETED
        ? Number(row.completed_at || 0) || now
        : undefined,
    status: eventType === MissionProgressEventType.MANUAL_COMPLETE
      ? WeeklyMissionStatus.COMPLETED
      : nextProgress.status,
  });
  if (row.organization_id) {
    await rebuildOrganizationKpiSnapshots(env, row.organization_id, {
      dateKeys: [toTokyoDateKey(now)],
    });
  }

  const [updated] = await readMissionBoardRows(env, currentUser, { studentUid: row.student_uid });
  if (!updated) {
    throw new HttpError(500, '更新後のミッション取得に失敗しました。');
  }
  return toMissionAssignment(updated);
};

export const readMissionAssignmentsByStudent = async (
  env: AppEnv,
  studentUids: string[],
): Promise<Map<string, MissionAssignment>> => {
  if (studentUids.length === 0) return new Map();
  const placeholders = studentUids.map(() => '?').join(', ');
  const rows = await readAll<DbMissionBoardRow>(
    env,
    `SELECT
       a.id AS assignment_id,
       a.student_user_id AS student_uid,
       student.display_name AS student_name,
       a.assigned_by_user_id AS assigned_by_uid,
       assigner.display_name AS assigned_by_name,
       a.assigned_at AS assigned_at,
       a.started_at AS started_at,
       a.restarted_at AS restarted_at,
       a.last_activity_at AS last_activity_at,
       a.completed_at AS completed_at,
       a.status AS assignment_status,
       a.new_word_ids_json AS new_word_ids_json,
       a.review_word_ids_json AS review_word_ids_json,
       a.quiz_day_keys_json AS quiz_day_keys_json,
       m.id AS mission_id,
       m.organization_id AS organization_id,
       m.created_by_user_id AS created_by_uid,
       m.learning_track AS learning_track,
       m.title AS title,
       m.rationale AS rationale,
       m.book_id AS book_id,
       m.book_title AS book_title,
       m.new_words_target AS new_words_target,
       m.review_words_target AS review_words_target,
       m.quiz_target_count AS quiz_target_count,
       m.writing_assignment_id AS writing_assignment_id,
       wa.prompt_title AS writing_prompt_title,
       wa.status AS writing_status,
       m.due_at AS due_at,
       m.status AS mission_status,
       m.created_at AS mission_created_at,
       m.updated_at AS mission_updated_at
     FROM weekly_mission_assignments a
     JOIN weekly_missions m ON m.id = a.mission_id
     JOIN users student ON student.id = a.student_user_id
     JOIN users assigner ON assigner.id = a.assigned_by_user_id
     LEFT JOIN writing_assignments wa ON wa.id = m.writing_assignment_id
     WHERE a.student_user_id IN (${placeholders})
       AND a.status != ?
     ORDER BY a.assigned_at DESC`,
    ...studentUids,
    WeeklyMissionStatus.ARCHIVED,
  );

  const byStudent = new Map<string, MissionAssignment>();
  rows.forEach((row) => {
    if (!byStudent.has(row.student_uid)) {
      byStudent.set(row.student_uid, toMissionAssignment(row));
    }
  });
  return byStudent;
};

export const buildSuggestedPrimaryMission = ({
  user,
  books,
  learningPlan,
  learningPreference,
  writingAssignmentId,
  writingPromptTitle,
  now = Date.now(),
}: {
  user: Pick<DbUserRow, 'id' | 'grade' | 'english_level'>;
  books: Array<{ id: string; title: string; description?: string | null; source_context?: string | null; word_count?: number | null; is_priority?: number | null }>;
  learningPlan?: { dailyWordGoal: number; selectedBookIds: string[] } | null;
  learningPreference?: { targetExam?: string | null; targetScore?: string | null; weeklyStudyDays?: number | null; dailyStudyMinutes?: number | null; weakSkillFocus?: string | null; examDate?: string | null; intensity?: string | null } | null;
  writingAssignmentId?: string;
  writingPromptTitle?: string;
  now?: number;
}): PrimaryMissionSnapshot => {
  const missionBooks = books.map((book) => ({
    id: book.id,
    title: book.title,
    wordCount: Number(book.word_count || 0),
    isPriority: Boolean(book.is_priority),
    description: book.description || undefined,
    sourceContext: book.source_context || undefined,
    catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL,
    accessScope: BookAccessScope.ALL_PLANS,
  }));
  const draft = buildSuggestedMissionDraft({
    grade: user.grade as UserGrade | undefined,
    level: user.english_level as EnglishLevel | undefined,
    learningPlan: learningPlan
      ? {
          uid: user.id,
          createdAt: now,
          targetDate: '',
          goalDescription: '',
          dailyWordGoal: learningPlan.dailyWordGoal,
          selectedBookIds: learningPlan.selectedBookIds,
          status: 'ACTIVE',
        }
      : null,
    learningPreference: learningPreference
      ? {
          userUid: user.id,
          targetExam: learningPreference.targetExam || '',
          targetScore: learningPreference.targetScore || '',
          examDate: learningPreference.examDate || '',
          weeklyStudyDays: Number(learningPreference.weeklyStudyDays || 4),
          dailyStudyMinutes: Number(learningPreference.dailyStudyMinutes || 20),
          weakSkillFocus: learningPreference.weakSkillFocus || '',
          motivationNote: '',
          intensity: (learningPreference.intensity as LearningPreferenceIntensity | null) || LearningPreferenceIntensity.BALANCED,
          updatedAt: now,
        }
      : null,
    books: missionBooks,
    writingAssignmentId,
    writingPromptTitle,
    now,
  });

  const progress = buildMissionProgress({
    dueAt: draft.dueAt,
    newWordsCompleted: 0,
    newWordsTarget: draft.newWordsTarget,
    reviewWordsCompleted: 0,
    reviewWordsTarget: draft.reviewWordsTarget,
    quizCompletedCount: 0,
    quizTargetCount: draft.quizTargetCount,
    writingRequired: Boolean(draft.writingAssignmentId),
    writingCompleted: false,
    now,
  });

  return toPrimaryMissionSnapshot({
    track: draft.learningTrack,
    title: draft.title,
    rationale: draft.rationale,
    dueAt: draft.dueAt,
    sourceBookId: draft.bookId,
    sourceBookTitle: draft.bookTitle,
    writingAssignmentId: draft.writingAssignmentId,
    writingPromptTitle: draft.writingPromptTitle,
    isSuggested: true,
    progress,
  });
};
