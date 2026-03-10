import type { StorageAction, StorageActionRequest } from '../../contracts/storage';
import { UserRole } from '../../types';
import { requireRole } from './auth';
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
  handleResetAllData,
  handleSaveHistory,
  handleSaveLearningPlan,
  handleSaveLearningPreference,
  handleSaveSrsHistory,
} from './storage-learning-actions';
import {
  handleAssignStudentInstructor,
  handleGetAllStudentsProgress,
  handleGetOrganizationDashboardSnapshot,
  handleGetStudentWorksheetSnapshot,
  handleSendInstructorNotification,
} from './storage-organization-actions';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

export const handleStorageAction = async (
  env: AppEnv,
  user: DbUserRow,
  body: StorageActionRequest<StorageAction>,
): Promise<unknown> => {
  const action = body?.action;
  const payload = (('payload' in body ? body.payload : undefined) || {}) as Record<string, unknown>;

  switch (action) {
    case 'addXP':
      return handleAddXP(env, user, Number(payload.amount || 0));
    case 'batchImportWords':
      return handleBatchImportWords(env, user, payload as unknown as StorageActionRequest<'batchImportWords'>['payload']);
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
    case 'saveHistory':
      return handleSaveHistory(
        env,
        user,
        payload.result as unknown as StorageActionRequest<'saveHistory'>['payload']['result'],
        Number(payload.responseTimeMs || 0),
      );
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
      );
    case 'resetAllData':
      requireRole(user, [UserRole.ADMIN]);
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
    case 'getLeaderboard':
      return handleGetLeaderboard(env, user.id);
    case 'getMasteryDistribution':
      return handleGetMasteryDistribution(env, user.id);
    case 'getActivityLogs':
      return handleGetActivityLogs(env, user.id);
    default:
      throw new HttpError(404, `未対応のストレージ操作です: ${String(action)}`);
  }
};
