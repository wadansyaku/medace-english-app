import {
  adminClient,
  catalogClient,
  dashboardClient,
  learningClient,
  sessionClient,
  type CatalogClient,
  type DashboardClient,
  type LearningClient,
  type SessionClient,
} from './clients';
import type {
  AdminPasswordRecoveryRequest,
} from '../types';
import type {
  AdminPasswordResetLinkIssuePayload,
  AdminPasswordResetLinkIssueResult,
  AdminPasswordRecoveryUpdatePayload,
} from '../contracts/storage';

type DashboardSurface = Pick<DashboardClient,
  | 'getAdminDashboardSnapshot'
  | 'getDashboardSnapshot'
>;

type DashboardCatalogSurface = Pick<CatalogClient,
  | 'batchImportWords'
  | 'deleteBook'
  | 'getBooks'
  | 'prepareBookExamples'
>;

type DashboardLearningSurface = Pick<LearningClient,
  | 'getLearningPlan'
  | 'getLearningPreference'
  | 'saveLearningPlan'
  | 'saveLearningPreference'
>;

type DashboardSessionSurface = Pick<SessionClient,
  | 'getSession'
  | 'updateSessionUser'
>;

type DashboardAdminSurface = {
  resetAllData: () => Promise<void>;
  updatePasswordRecoveryRequest: (
    payload: AdminPasswordRecoveryUpdatePayload,
  ) => Promise<AdminPasswordRecoveryRequest>;
  issuePasswordResetLink: (
    payload: AdminPasswordResetLinkIssuePayload,
  ) => Promise<AdminPasswordResetLinkIssueResult>;
};

export type DashboardService =
  & DashboardSurface
  & DashboardCatalogSurface
  & DashboardLearningSurface
  & DashboardSessionSurface
  & DashboardAdminSurface;

export const dashboardService: DashboardService = {
  batchImportWords: (request, onProgress) => catalogClient.batchImportWords(request, onProgress),
  deleteBook: (bookId) => catalogClient.deleteBook(bookId),
  getAdminDashboardSnapshot: () => dashboardClient.getAdminDashboardSnapshot(),
  getBooks: () => catalogClient.getBooks(),
  prepareBookExamples: (bookId) => catalogClient.prepareBookExamples(bookId),
  getDashboardSnapshot: (uid) => dashboardClient.getDashboardSnapshot(uid),
  getLearningPlan: (uid) => learningClient.getLearningPlan(uid),
  getLearningPreference: (uid) => learningClient.getLearningPreference(uid),
  getSession: () => sessionClient.getSession(),
  resetAllData: () => adminClient.resetAllData(),
  updatePasswordRecoveryRequest: (payload) => adminClient.updatePasswordRecoveryRequest(payload),
  issuePasswordResetLink: (payload) => adminClient.issuePasswordResetLink(payload),
  saveLearningPlan: (plan) => learningClient.saveLearningPlan(plan),
  saveLearningPreference: (preference) => learningClient.saveLearningPreference(preference),
  updateSessionUser: (user) => sessionClient.updateSessionUser(user),
};

export default dashboardService;
