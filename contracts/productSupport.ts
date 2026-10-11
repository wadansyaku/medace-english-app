import type { ProductSupportRole } from '../shared/productSupportKnowledge';

export type { ProductSupportRole } from '../shared/productSupportKnowledge';
export const PRODUCT_SUPPORT_MAX_QUESTION_CHARS = 600;
export interface ProductSupportReference {
  sourceId: string;
  title: string;
  excerpt: string;
  version: string;
  checkedAt: string;
  url?: string;
}
export type ProductSupportRequest = {
  action: 'ask'; requestId: string; question: string;
  history: readonly { userText: string }[]; privacyConsent: true; targetVersion?: string;
} | { action: 'recheck'; requestId: string };
interface ProductSupportResponseBase {
  requestId: string; version: string; message?: string; recheckAllowed?: boolean;
}
export type ProductSupportResponse = ProductSupportResponseBase & ({
  status: 'ANSWERED'; kind: 'ANSWER' | 'CLARIFICATION'; answer: string;
  sourceIds: readonly string[]; references: readonly ProductSupportReference[]; providerUsed: boolean;
} | {
  status: 'DISABLED' | 'CAPACITY_REACHED' | 'PENDING' | 'UNKNOWN_RESULT';
});
// A client role is presentation context only. Requests never accept a role.
export type ProductSupportPresentationRole = ProductSupportRole;
