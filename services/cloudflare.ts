import {
  CatalogImportRequest,
  CatalogImportResult,
  StorageAction,
  StorageActionRequest,
  StorageResponse,
} from '../contracts/storage';
import { ActivityLog, AdminDashboardSnapshot, BookMetadata, BookProgress, DashboardSnapshot, LeaderboardEntry, LearningHistory, LearningPlan, LearningPreference, MasteryDistribution, OrganizationDashboardSnapshot, OrganizationRole, StudentSummary, StudentWorksheetSnapshot, UserProfile, UserRole, WordData } from '../types';
import { apiDelete, apiGet, apiPost } from './apiClient';
import type { IStorageService } from './storage';

export class CloudflareStorageService implements IStorageService {
  private async callStorage<TAction extends StorageAction>(
    request: StorageActionRequest<TAction>,
  ): Promise<StorageResponse<TAction>> {
    return apiPost<StorageResponse<TAction>>('/api/storage', request);
  }

  async login(role: UserRole, demoPassword?: string, organizationRole?: OrganizationRole): Promise<UserProfile | null> {
    return apiPost<UserProfile | null>('/api/auth', {
      action: 'demo-login',
      role,
      demoPassword,
      organizationRole,
    });
  }

  async authenticate(email: string, password: string, isSignUp: boolean, role?: UserRole, displayName?: string): Promise<UserProfile | null> {
    return apiPost<UserProfile | null>('/api/auth', {
      action: 'email-auth',
      email,
      password,
      isSignUp,
      role,
      displayName,
    });
  }

  async saveSession(user: UserProfile): Promise<void> {
    await apiPost<void>('/api/profile', { user });
  }

  async updateSessionUser(user: UserProfile): Promise<void> {
    await this.saveSession(user);
  }

  async clearSession(): Promise<void> {
    await apiDelete<void>('/api/session');
  }

  async getSession(): Promise<UserProfile | null> {
    return apiGet<UserProfile | null>('/api/session');
  }

  async addXP(user: UserProfile, amount: number): Promise<{ user: UserProfile; leveledUp: boolean; }> {
    return this.callStorage({
      action: 'addXP',
      payload: { amount },
    });
  }

  async batchImportWords(
    request: CatalogImportRequest,
    onProgress?: (progress: number) => void,
  ): Promise<CatalogImportResult> {
    onProgress?.(5);
    const result = await this.callStorage({
      action: 'batchImportWords',
      payload: request,
    });
    onProgress?.(100);
    return result;
  }

  async getBooks(): Promise<BookMetadata[]> {
    return this.callStorage({ action: 'getBooks' });
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.callStorage({
      action: 'deleteBook',
      payload: { bookId },
    });
  }

  async getWordsByBook(bookId: string): Promise<WordData[]> {
    return this.callStorage({
      action: 'getWordsByBook',
      payload: { bookId },
    });
  }

  async updateWord(word: WordData): Promise<void> {
    await this.callStorage({
      action: 'updateWord',
      payload: { word },
    });
  }

  async reportWord(wordId: string, reason: string): Promise<void> {
    await this.callStorage({
      action: 'reportWord',
      payload: { wordId, reason },
    });
  }

  async updateWordCache(wordId: string, sentence: string, translation: string): Promise<void> {
    await this.callStorage({
      action: 'updateWordCache',
      payload: { wordId, sentence, translation },
    });
  }

  async getDailySessionWords(uid: string, limit: number): Promise<WordData[]> {
    return this.callStorage({
      action: 'getDailySessionWords',
      payload: { limit },
    });
  }

  async getBookSession(uid: string, bookId: string, limit: number): Promise<WordData[]> {
    return this.callStorage({
      action: 'getBookSession',
      payload: { bookId, limit },
    });
  }

  async getDueCount(uid: string): Promise<number> {
    return this.callStorage({ action: 'getDueCount' });
  }

  async saveSRSHistory(uid: string, word: WordData, rating: number, responseTimeMs = 0): Promise<void> {
    await this.callStorage({
      action: 'saveSRSHistory',
      payload: { word, rating, responseTimeMs },
    });
  }

  async saveHistory(uid: string, result: Partial<LearningHistory> & { wordId: string; bookId: string; }, responseTimeMs = 0): Promise<void> {
    await this.callStorage({
      action: 'saveHistory',
      payload: { result, responseTimeMs },
    });
  }

  async getBookProgress(uid: string, bookId: string): Promise<BookProgress> {
    return this.callStorage({
      action: 'getBookProgress',
      payload: { bookId },
    });
  }

  async getAllStudentsProgress(): Promise<StudentSummary[]> {
    return this.callStorage({ action: 'getAllStudentsProgress' });
  }

  async getStudentWorksheetSnapshot(studentUid: string): Promise<StudentWorksheetSnapshot> {
    return this.callStorage({
      action: 'getStudentWorksheetSnapshot',
      payload: { studentUid },
    });
  }

  async sendInstructorNotification(studentUid: string, message: string, triggerReason: string, usedAi: boolean): Promise<void> {
    await this.callStorage({
      action: 'sendInstructorNotification',
      payload: { studentUid, message, triggerReason, usedAi },
    });
  }

  async resetAllData(): Promise<void> {
    await this.callStorage({ action: 'resetAllData' });
  }

  async saveLearningPlan(plan: LearningPlan): Promise<void> {
    await this.callStorage({
      action: 'saveLearningPlan',
      payload: { plan },
    });
  }

  async getLearningPlan(uid: string): Promise<LearningPlan | null> {
    return this.callStorage({ action: 'getLearningPlan' });
  }

  async saveLearningPreference(preference: LearningPreference): Promise<void> {
    await this.callStorage({
      action: 'saveLearningPreference',
      payload: { preference },
    });
  }

  async getLearningPreference(uid: string): Promise<LearningPreference | null> {
    return this.callStorage({ action: 'getLearningPreference' });
  }

  async assignStudentInstructor(studentUid: string, instructorUid: string | null): Promise<void> {
    await this.callStorage({
      action: 'assignStudentInstructor',
      payload: { studentUid, instructorUid },
    });
  }

  async getDashboardSnapshot(uid: string): Promise<DashboardSnapshot> {
    return this.callStorage({ action: 'getDashboardSnapshot' });
  }

  async getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
    return this.callStorage({ action: 'getAdminDashboardSnapshot' });
  }

  async getOrganizationDashboardSnapshot(): Promise<OrganizationDashboardSnapshot> {
    return this.callStorage({ action: 'getOrganizationDashboardSnapshot' });
  }

  async getLeaderboard(currentUid: string): Promise<LeaderboardEntry[]> {
    return this.callStorage({ action: 'getLeaderboard' });
  }

  async getMasteryDistribution(uid: string): Promise<MasteryDistribution> {
    return this.callStorage({ action: 'getMasteryDistribution' });
  }

  async getActivityLogs(uid: string): Promise<ActivityLog[]> {
    return this.callStorage({ action: 'getActivityLogs' });
  }
}
