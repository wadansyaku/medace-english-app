import {
  CatalogImportRequest,
  CatalogImportResult,
  CommercialRequestPayload,
  CommercialRequestUpdatePayload,
  ProductAnnouncementUpsertPayload,
  StorageAction,
  StorageActionRequest,
  StorageResponse,
} from '../contracts/storage';
import { ActivityLog, AdminDashboardSnapshot, BookMetadata, BookProgress, CommercialRequest, DashboardSnapshot, InterventionKind, LeaderboardEntry, LearningPlan, LearningPreference, LearningTaskIntent, LearningTaskIntentType, LearningTrack, MasteryDistribution, MissionAssignment, MissionProgressEventType, OrganizationDashboardSnapshot, OrganizationRole, OrganizationSettingsSnapshot, ProductAnnouncement, ProductAnnouncementFeed, RecommendedActionType, StudentSummary, StudentWorksheetSnapshot, UserProfile, UserRole, WeeklyMission, WeeklyMissionBoard, WordData } from '../types';
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

  async getDailySessionWords(uid: string, limit: number, taskIntent?: LearningTaskIntent): Promise<WordData[]> {
    return this.callStorage({
      action: 'getDailySessionWords',
      payload: { limit, taskIntent },
    });
  }

  async getBookSession(uid: string, bookId: string, limit: number, taskIntent?: LearningTaskIntent): Promise<WordData[]> {
    return this.callStorage({
      action: 'getBookSession',
      payload: { bookId, limit, taskIntent },
    });
  }

  async getDueCount(uid: string): Promise<number> {
    return this.callStorage({ action: 'getDueCount' });
  }

  async saveSRSHistory(
    uid: string,
    word: WordData,
    rating: number,
    responseTimeMs = 0,
    missionAssignmentId?: string,
    taskIntentType?: LearningTaskIntentType,
  ): Promise<void> {
    await this.callStorage({
      action: 'saveSRSHistory',
      payload: { word, rating, responseTimeMs, missionAssignmentId, taskIntentType },
    });
  }

  async recordQuizAttempt(
    uid: string,
    wordId: string,
    bookId: string,
    correct: boolean,
    questionMode: 'EN_TO_JA' | 'JA_TO_EN' | 'SPELLING_HINT',
    responseTimeMs = 0,
    missionAssignmentId?: string,
    taskIntentType?: LearningTaskIntentType,
  ): Promise<void> {
    await this.callStorage({
      action: 'recordQuizAttempt',
      payload: { wordId, bookId, correct, questionMode, responseTimeMs, missionAssignmentId, taskIntentType },
    });
  }

  async getStudiedWordIdsByBook(uid: string, bookId: string): Promise<string[]> {
    return this.callStorage({
      action: 'getStudiedWordIdsByBook',
      payload: { bookId },
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

  async sendInstructorNotification(
    studentUid: string,
    message: string,
    triggerReason: string,
    usedAi: boolean,
    interventionKind: InterventionKind,
    recommendedActionType?: RecommendedActionType,
  ): Promise<void> {
    await this.callStorage({
      action: 'sendInstructorNotification',
      payload: { studentUid, message, triggerReason, usedAi, interventionKind, recommendedActionType },
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

  async createWeeklyMission(payload: {
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
  }): Promise<WeeklyMission> {
    return this.callStorage({
      action: 'createWeeklyMission',
      payload,
    });
  }

  async assignWeeklyMission(missionId: string, studentUid: string): Promise<MissionAssignment> {
    return this.callStorage({
      action: 'assignWeeklyMission',
      payload: { missionId, studentUid },
    });
  }

  async getWeeklyMissionBoard(): Promise<WeeklyMissionBoard> {
    return this.callStorage({ action: 'getWeeklyMissionBoard' });
  }

  async updateMissionProgress(assignmentId: string, eventType: MissionProgressEventType): Promise<MissionAssignment> {
    return this.callStorage({
      action: 'updateMissionProgress',
      payload: { assignmentId, eventType },
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

  async getOrganizationSettingsSnapshot(): Promise<OrganizationSettingsSnapshot> {
    return this.callStorage({ action: 'getOrganizationSettingsSnapshot' });
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

  async getCommercialRequestStatus(): Promise<CommercialRequest[]> {
    return this.callStorage({ action: 'getCommercialRequestStatus' });
  }

  async submitCommercialRequest(payload: CommercialRequestPayload): Promise<CommercialRequest> {
    return this.callStorage({
      action: 'submitCommercialRequest',
      payload,
    });
  }

  async updateOrganizationProfile(displayName: string): Promise<OrganizationSettingsSnapshot> {
    return this.callStorage({
      action: 'updateOrganizationProfile',
      payload: { displayName },
    });
  }

  async listProductAnnouncements(): Promise<ProductAnnouncementFeed> {
    return this.callStorage({ action: 'listProductAnnouncements' });
  }

  async markAnnouncementSeen(announcementId: string): Promise<void> {
    await this.callStorage({
      action: 'markAnnouncementSeen',
      payload: { announcementId },
    });
  }

  async acknowledgeAnnouncement(announcementId: string): Promise<void> {
    await this.callStorage({
      action: 'acknowledgeAnnouncement',
      payload: { announcementId },
    });
  }

  async listCommercialRequests(): Promise<CommercialRequest[]> {
    return this.callStorage({ action: 'listCommercialRequests' });
  }

  async updateCommercialRequest(payload: CommercialRequestUpdatePayload): Promise<CommercialRequest> {
    return this.callStorage({
      action: 'updateCommercialRequest',
      payload,
    });
  }

  async listProductAnnouncementsAdmin(): Promise<ProductAnnouncement[]> {
    return this.callStorage({ action: 'listProductAnnouncementsAdmin' });
  }

  async upsertProductAnnouncement(payload: ProductAnnouncementUpsertPayload): Promise<ProductAnnouncement> {
    return this.callStorage({
      action: 'upsertProductAnnouncement',
      payload,
    });
  }
}
