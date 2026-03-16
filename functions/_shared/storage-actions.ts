import type { StorageAction, StorageActionRequest } from '../../contracts/storage';
import { UserRole } from '../../types';
import { requireRole } from './auth';
import getServerRuntimeFlags from './runtime';
import {
  handleBatchImportWords,
  handleDeleteBook,
  handleGetBookSession,
  handleGetBooks,
  handleGetDailySessionWords,
  handleGetWordsByBook,
  handleReportWord,
  handleUpdateWord,
  handleUpdateWordCache,
} from './storage-book-actions';
import {
  handleCreateCommercialRequest,
  handleGetCommercialRequestStatus,
  handleListCommercialRequests,
  handleUpdateCommercialRequest,
} from './commercial-actions';
import {
  handleAcknowledgeAnnouncement,
  handleListProductAnnouncements,
  handleListProductAnnouncementsAdmin,
  handleMarkAnnouncementSeen,
  handleUpsertProductAnnouncement,
} from './announcement-actions';
import {
  handleGetAccountOverview,
  handleGetAdminDashboardSnapshot,
  handleGetDashboardSnapshot,
  handleGetLeaderboard,
  handleGetMasteryDistribution,
  handleGetMotivationSnapshot,
} from './storage-dashboard-actions';
import {
  handleAddXP,
  handleGetActivityLogs,
  handleGetBookProgress,
  handleGetDueCount,
  handleGetLearningPlan,
  handleGetLearningPreference,
  handleRecordQuizAttempt,
  handleGetStudiedWordIdsByBook,
  handleResetAllData,
  handleSaveLearningPlan,
  handleSaveLearningPreference,
  handleSaveSrsHistory,
} from './storage-learning-actions';
import {
  handleAssignStudentInstructor,
  handleGetAllStudentsProgress,
  handleGetOrganizationDashboardSnapshot,
  handleGetOrganizationSettingsSnapshot,
  handleGetStudentWorksheetSnapshot,
  handleSendInstructorNotification,
  handleUpdateOrganizationProfile,
} from './storage-organization-actions';
import {
  handleAssignWeeklyMission,
  handleCreateWeeklyMission,
  handleGetWeeklyMissionBoard,
  handleUpdateMissionProgress,
} from './storage-mission-actions';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

export const handleStorageAction = async (
  env: AppEnv,
  user: DbUserRow,
  body: StorageActionRequest<StorageAction>,
  request: Request,
): Promise<unknown> => {
  const action = body?.action;
  const payload = (('payload' in body ? body.payload : undefined) || {}) as Record<string, unknown>;
  const runtimeFlags = getServerRuntimeFlags(request, env);

  switch (action) {
    case 'addXP':
      return handleAddXP(env, user, Number(payload.amount || 0));
    case 'batchImportWords':
      return handleBatchImportWords(
        env,
        user,
        payload as unknown as StorageActionRequest<'batchImportWords'>['payload'],
        runtimeFlags,
      );
    case 'getBooks':
      return handleGetBooks(env, user);
    case 'deleteBook':
      return handleDeleteBook(env, user, String(payload.bookId || ''));
    case 'getWordsByBook':
      return handleGetWordsByBook(env, user, String(payload.bookId || ''));
    case 'updateWord':
      return handleUpdateWord(env, user, payload.word as unknown as StorageActionRequest<'updateWord'>['payload']['word']);
    case 'reportWord':
      return handleReportWord(env, user, String(payload.wordId || ''), String(payload.reason || ''));
    case 'updateWordCache':
      return handleUpdateWordCache(
        env,
        user,
        String(payload.wordId || ''),
        String(payload.sentence || ''),
        String(payload.translation || ''),
      );
    case 'getDailySessionWords':
      return handleGetDailySessionWords(env, user, payload.limit);
    case 'getBookSession':
      return handleGetBookSession(env, user, String(payload.bookId || ''), payload.limit);
    case 'getDashboardSnapshot':
      return handleGetDashboardSnapshot(env, user);
    case 'getAdminDashboardSnapshot':
      requireRole(user, [UserRole.ADMIN]);
      return handleGetAdminDashboardSnapshot(env, user);
    case 'getOrganizationDashboardSnapshot':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleGetOrganizationDashboardSnapshot(env, user);
    case 'getOrganizationSettingsSnapshot':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleGetOrganizationSettingsSnapshot(env, user);
    case 'getDueCount':
      return handleGetDueCount(env, user);
    case 'saveSRSHistory':
      return handleSaveSrsHistory(
        env,
        user,
        payload.word as unknown as StorageActionRequest<'saveSRSHistory'>['payload']['word'],
        Number(payload.rating || 0),
        Number(payload.responseTimeMs || 0),
      );
    case 'recordQuizAttempt':
      return handleRecordQuizAttempt(
        env,
        user,
        String(payload.wordId || ''),
        String(payload.bookId || ''),
        Boolean(payload.correct),
        String(payload.questionMode || '') as 'EN_TO_JA' | 'JA_TO_EN' | 'SPELLING_HINT',
        Number(payload.responseTimeMs || 0),
      );
    case 'getStudiedWordIdsByBook':
      return handleGetStudiedWordIdsByBook(env, user, String(payload.bookId || ''));
    case 'getBookProgress':
      return handleGetBookProgress(env, user, String(payload.bookId || ''));
    case 'getAllStudentsProgress':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleGetAllStudentsProgress(env, user);
    case 'getStudentWorksheetSnapshot':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleGetStudentWorksheetSnapshot(env, user, String(payload.studentUid || ''));
    case 'sendInstructorNotification':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleSendInstructorNotification(
        env,
        user,
        String(payload.studentUid || ''),
        String(payload.message || ''),
        String(payload.triggerReason || ''),
        Boolean(payload.usedAi),
        String(payload.interventionKind || ''),
        typeof payload.recommendedActionType === 'string' ? payload.recommendedActionType : undefined,
      );
    case 'resetAllData':
      requireRole(user, [UserRole.ADMIN]);
      if (!runtimeFlags.enableDestructiveAdminActions) {
        throw new HttpError(403, '本番環境ではデータ初期化を API から実行できません。preview またはローカル検証環境に限定してください。');
      }
      return handleResetAllData(env);
    case 'saveLearningPlan':
      return handleSaveLearningPlan(env, user, payload.plan as unknown as StorageActionRequest<'saveLearningPlan'>['payload']['plan']);
    case 'getLearningPlan':
      return handleGetLearningPlan(env, user);
    case 'saveLearningPreference':
      return handleSaveLearningPreference(
        env,
        user,
        payload.preference as unknown as StorageActionRequest<'saveLearningPreference'>['payload']['preference'],
      );
    case 'getLearningPreference':
      return handleGetLearningPreference(env, user);
    case 'assignStudentInstructor':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleAssignStudentInstructor(env, user, String(payload.studentUid || ''), (payload.instructorUid as string | null) || null);
    case 'createWeeklyMission':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleCreateWeeklyMission(
        env,
        user,
        payload as unknown as StorageActionRequest<'createWeeklyMission'>['payload'],
      );
    case 'assignWeeklyMission':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleAssignWeeklyMission(env, user, String(payload.missionId || ''), String(payload.studentUid || ''));
    case 'getWeeklyMissionBoard':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR, UserRole.STUDENT]);
      return handleGetWeeklyMissionBoard(env, user);
    case 'updateMissionProgress':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR, UserRole.STUDENT]);
      return handleUpdateMissionProgress(env, user, String(payload.assignmentId || ''), String(payload.eventType || ''));
    case 'updateOrganizationProfile':
      requireRole(user, [UserRole.ADMIN, UserRole.INSTRUCTOR]);
      return handleUpdateOrganizationProfile(env, user, String(payload.displayName || ''));
    case 'getLeaderboard':
      return handleGetLeaderboard(env, user.id);
    case 'getMasteryDistribution':
      return handleGetMasteryDistribution(env, user.id);
    case 'getActivityLogs':
      return handleGetActivityLogs(env, user.id);
    case 'getCommercialRequestStatus':
      return handleGetCommercialRequestStatus(env, user);
    case 'submitCommercialRequest':
      return handleCreateCommercialRequest(
        env,
        payload as unknown as StorageActionRequest<'submitCommercialRequest'>['payload'],
        user,
      );
    case 'listProductAnnouncements':
      return handleListProductAnnouncements(env, user);
    case 'markAnnouncementSeen':
      return handleMarkAnnouncementSeen(env, user, String(payload.announcementId || ''));
    case 'acknowledgeAnnouncement':
      return handleAcknowledgeAnnouncement(env, user, String(payload.announcementId || ''));
    case 'listCommercialRequests':
      requireRole(user, [UserRole.ADMIN]);
      return handleListCommercialRequests(env);
    case 'updateCommercialRequest':
      requireRole(user, [UserRole.ADMIN]);
      return handleUpdateCommercialRequest(
        env,
        user,
        payload as unknown as StorageActionRequest<'updateCommercialRequest'>['payload'],
      );
    case 'listProductAnnouncementsAdmin':
      requireRole(user, [UserRole.ADMIN]);
      return handleListProductAnnouncementsAdmin(env);
    case 'upsertProductAnnouncement':
      requireRole(user, [UserRole.ADMIN]);
      return handleUpsertProductAnnouncement(
        env,
        user,
        payload as unknown as StorageActionRequest<'upsertProductAnnouncement'>['payload'],
      );
    default:
      throw new HttpError(404, `未対応のストレージ操作です: ${String(action)}`);
  }
};
