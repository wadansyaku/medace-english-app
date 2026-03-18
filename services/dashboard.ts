import { storage, type IStorageService } from './storage';

export type DashboardService = Pick<IStorageService,
  | 'batchImportWords'
  | 'deleteBook'
  | 'getAdminDashboardSnapshot'
  | 'getBooks'
  | 'getDashboardSnapshot'
  | 'getLearningPlan'
  | 'getLearningPreference'
  | 'getSession'
  | 'resetAllData'
  | 'saveLearningPlan'
  | 'saveLearningPreference'
  | 'updateSessionUser'
>;

export const dashboardService: DashboardService = {
  batchImportWords: (request, onProgress) => storage.batchImportWords(request, onProgress),
  deleteBook: (bookId) => storage.deleteBook(bookId),
  getAdminDashboardSnapshot: () => storage.getAdminDashboardSnapshot(),
  getBooks: () => storage.getBooks(),
  getDashboardSnapshot: (uid) => storage.getDashboardSnapshot(uid),
  getLearningPlan: (uid) => storage.getLearningPlan(uid),
  getLearningPreference: (uid) => storage.getLearningPreference(uid),
  getSession: () => storage.getSession(),
  resetAllData: () => storage.resetAllData(),
  saveLearningPlan: (plan) => storage.saveLearningPlan(plan),
  saveLearningPreference: (preference) => storage.saveLearningPreference(preference),
  updateSessionUser: (user) => storage.updateSessionUser(user),
};

export default dashboardService;
