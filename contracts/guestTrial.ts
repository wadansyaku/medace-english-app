import type { GuestTrialAnswer } from '../shared/guestTrial';

export interface GuestTrialImportRequest {
  // Prevent a different tab's session switch from changing the explicit target.
  // This is a precondition only; the server always owns authorization.
  expectedUserId: string;
  trialId: string;
  version: string;
  answers: GuestTrialAnswer[];
}

export interface GuestTrialSummary {
  trialId: string;
  version: string;
  answerCount: number;
  correctCount: number;
  importedAt: number;
  answers: GuestTrialAnswer[];
}

export interface GuestTrialImportResponse {
  summary: GuestTrialSummary;
}
