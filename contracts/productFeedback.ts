export type ProductFeedbackStatus = 'NEW' | 'TRIAGED' | 'HANDOFF_PREPARED' | 'FIXED' | 'RETEST_PASS' | 'RETEST_FAIL';
export type ProductFeedbackPriority = 'P0' | 'P1' | 'P2' | 'P3';
export interface ProductFeedbackInput {
  title: string;
  version: string;
  screen: string;
  steps: string;
  expected: string;
  actual: string;
  impact: string;
}
export interface ProductFeedbackEvent {
  revision: number;
  at: number;
  status: ProductFeedbackStatus;
  actorRole: 'INSTRUCTOR' | 'ADMIN';
  note: string;
}
export interface ProductFeedbackReport extends ProductFeedbackInput {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  status: ProductFeedbackStatus;
  priority?: ProductFeedbackPriority;
  acceptance?: string;
  fixRevision?: string;
  history: ProductFeedbackEvent[];
  historyLoaded: boolean;
  isOwnReport: boolean;
}
export interface ProductFeedbackList {
  reports: ProductFeedbackReport[];
  nextCursor: string | null;
  canManage: boolean;
  deploymentRevision: string | null;
}
export type ProductFeedbackAction =
  | { type: 'triage'; priority: ProductFeedbackPriority; acceptance: string }
  | { type: 'prepare-handoff' }
  | { type: 'record-fix'; revision: string; note: string }
  | { type: 'retest'; passed: boolean; note: string };
export type ProductFeedbackRequest =
  | { action: 'list'; cursor?: string }
  | { action: 'get'; id: string }
  | { action: 'create'; id: string; input: ProductFeedbackInput; privacyConfirmed: true }
  | { action: 'advance'; id: string; expectedRevision: number; mutationId: string; change: ProductFeedbackAction };
export type ProductFeedbackMutationRequest = Extract<ProductFeedbackRequest, { action: 'create' | 'advance' }>;
