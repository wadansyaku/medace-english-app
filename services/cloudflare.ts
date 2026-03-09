import { ActivityLog, AdminDashboardSnapshot, BookAccessScope, BookCatalogSource, BookMetadata, BookProgress, DashboardSnapshot, LeaderboardEntry, LearningHistory, LearningPlan, LearningPreference, MasteryDistribution, OrganizationDashboardSnapshot, OrganizationRole, StudentSummary, StudentWorksheetSnapshot, UserProfile, UserRole, WordData } from '../types';
import { apiDelete, apiGet, apiPost } from './apiClient';
import type { IStorageService } from './storage';

type StorageResponse<T> = T;

interface StorageActionRequest<TPayload = unknown> {
  action: string;
  payload?: TPayload;
}

export class CloudflareStorageService implements IStorageService {
  private async callStorage<TResponse, TPayload = unknown>(request: StorageActionRequest<TPayload>): Promise<TResponse> {
    return apiPost<StorageResponse<TResponse>>('/api/storage', request);
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
    return this.callStorage<{ user: UserProfile; leveledUp: boolean; }, { amount: number }>({
      action: 'addXP',
      payload: { amount },
    });
  }

  async batchImportWords(
    defaultBookName: string,
    csvRows: any[],
    onProgress: (progress: number) => void,
    createdByUid?: string,
    contextSummary?: string,
    options?: {
      catalogSource?: BookCatalogSource;
      accessScope?: BookAccessScope;
    }
  ): Promise<void> {
    onProgress(5);
    await this.callStorage<void>({
      action: 'batchImportWords',
      payload: { defaultBookName, csvRows, createdByUid, contextSummary, options },
    });
    onProgress(100);
  }

  async getBooks(): Promise<BookMetadata[]> {
    return this.callStorage<BookMetadata[]>({ action: 'getBooks' });
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.callStorage<void, { bookId: string }>({
      action: 'deleteBook',
      payload: { bookId },
    });
  }

  async getWordsByBook(bookId: string): Promise<WordData[]> {
    return this.callStorage<WordData[], { bookId: string }>({
      action: 'getWordsByBook',
      payload: { bookId },
    });
  }

  async updateWord(word: WordData): Promise<void> {
    await this.callStorage<void, { word: WordData }>({
      action: 'updateWord',
      payload: { word },
    });
  }

  async reportWord(wordId: string, reason: string): Promise<void> {
    await this.callStorage<void, { wordId: string; reason: string }>({
      action: 'reportWord',
      payload: { wordId, reason },
    });
  }

  async updateWordCache(wordId: string, sentence: string, translation: string): Promise<void> {
    await this.callStorage<void, { wordId: string; sentence: string; translation: string }>({
      action: 'updateWordCache',
      payload: { wordId, sentence, translation },
    });
  }

  async getDailySessionWords(uid: string, limit: number): Promise<WordData[]> {
    return this.callStorage<WordData[], { limit: number }>({
      action: 'getDailySessionWords',
      payload: { limit },
    });
  }

  async getBookSession(uid: string, bookId: string, limit: number): Promise<WordData[]> {
    return this.callStorage<WordData[], { bookId: string; limit: number }>({
      action: 'getBookSession',
      payload: { bookId, limit },
    });
  }

  async getDueCount(uid: string): Promise<number> {
    return this.callStorage<number>({ action: 'getDueCount' });
  }

  async saveSRSHistory(uid: string, word: WordData, rating: number, responseTimeMs = 0): Promise<void> {
    await this.callStorage<void, { word: WordData; rating: number; responseTimeMs: number }>({
      action: 'saveSRSHistory',
      payload: { word, rating, responseTimeMs },
    });
  }

  async saveHistory(uid: string, result: Partial<LearningHistory> & { wordId: string; bookId: string; }, responseTimeMs = 0): Promise<void> {
    await this.callStorage<void, { result: Partial<LearningHistory> & { wordId: string; bookId: string; }; responseTimeMs: number }>({
      action: 'saveHistory',
      payload: { result, responseTimeMs },
    });
  }

  async getBookProgress(uid: string, bookId: string): Promise<BookProgress> {
    return this.callStorage<BookProgress, { bookId: string }>({
      action: 'getBookProgress',
      payload: { bookId },
    });
  }

  async getAllStudentsProgress(): Promise<StudentSummary[]> {
    return this.callStorage<StudentSummary[]>({ action: 'getAllStudentsProgress' });
  }

  async getStudentWorksheetSnapshot(studentUid: string): Promise<StudentWorksheetSnapshot> {
    return this.callStorage<StudentWorksheetSnapshot, { studentUid: string }>({
      action: 'getStudentWorksheetSnapshot',
      payload: { studentUid },
    });
  }

  async sendInstructorNotification(studentUid: string, message: string, triggerReason: string, usedAi: boolean): Promise<void> {
    await this.callStorage<void, { studentUid: string; message: string; triggerReason: string; usedAi: boolean }>({
      action: 'sendInstructorNotification',
      payload: { studentUid, message, triggerReason, usedAi },
    });
  }

  async resetAllData(): Promise<void> {
    await this.callStorage<void>({ action: 'resetAllData' });
  }

  async saveLearningPlan(plan: LearningPlan): Promise<void> {
    await this.callStorage<void, { plan: LearningPlan }>({
      action: 'saveLearningPlan',
      payload: { plan },
    });
  }

  async getLearningPlan(uid: string): Promise<LearningPlan | null> {
    return this.callStorage<LearningPlan | null>({ action: 'getLearningPlan' });
  }

  async saveLearningPreference(preference: LearningPreference): Promise<void> {
    await this.callStorage<void, { preference: LearningPreference }>({
      action: 'saveLearningPreference',
      payload: { preference },
    });
  }

  async getLearningPreference(uid: string): Promise<LearningPreference | null> {
    return this.callStorage<LearningPreference | null>({ action: 'getLearningPreference' });
  }

  async assignStudentInstructor(studentUid: string, instructorUid: string | null): Promise<void> {
    await this.callStorage<void, { studentUid: string; instructorUid: string | null }>({
      action: 'assignStudentInstructor',
      payload: { studentUid, instructorUid },
    });
  }

  async getDashboardSnapshot(uid: string): Promise<DashboardSnapshot> {
    return this.callStorage<DashboardSnapshot>({ action: 'getDashboardSnapshot' });
  }

  async getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
    return this.callStorage<AdminDashboardSnapshot>({ action: 'getAdminDashboardSnapshot' });
  }

  async getOrganizationDashboardSnapshot(): Promise<OrganizationDashboardSnapshot> {
    return this.callStorage<OrganizationDashboardSnapshot>({ action: 'getOrganizationDashboardSnapshot' });
  }

  async getLeaderboard(currentUid: string): Promise<LeaderboardEntry[]> {
    return this.callStorage<LeaderboardEntry[]>({ action: 'getLeaderboard' });
  }

  async getMasteryDistribution(uid: string): Promise<MasteryDistribution> {
    return this.callStorage<MasteryDistribution>({ action: 'getMasteryDistribution' });
  }

  async getActivityLogs(uid: string): Promise<ActivityLog[]> {
    return this.callStorage<ActivityLog[]>({ action: 'getActivityLogs' });
  }
}
