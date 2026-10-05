import type { BookMetadata, WordData } from '../types';
import type { GuestLearningAttempt } from '../shared/guestLearning';

export interface GuestLearningCatalogResponse {
  serverTimeMs: number;
  book: BookMetadata;
  words: WordData[];
}

export interface GuestLearningImportRequest {
  expectedUserId: string;
  sessionId: string;
  version: 'naru-guest-v1';
  attempts: GuestLearningAttempt[];
}

export interface GuestLearningSummary {
  sessionId: string;
  version: 'naru-guest-v1';
  importedAt: number;
  importedAttemptIds: string[];
}

export interface GuestLearningImportResponse extends GuestLearningSummary {
  failedAttempts: Array<{ attemptId: string; retryable: boolean }>;
}
