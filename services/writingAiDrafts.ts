import type {
  GenerateWritingAiDraftRequest,
  SaveWritingInputDraftRequest,
  WritingAiCapabilities,
  WritingAiDraftResponse,
  WritingInputDraftResponse,
} from '../contracts/writing-ai-drafts';
import { apiGet, apiPost } from './apiClient';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const invalid = (): never => { throw new Error('下書きAPIの応答を確認できませんでした。入力は変更していません。'); };
const inputResponse = (value: unknown): WritingInputDraftResponse => {
  if (!record(value) || !('draft' in value)) return invalid();
  if (value.draft === null) return { draft: null };
  const draft = value.draft;
  if (!record(draft) || draft.assessmentStatus !== 'UNASSESSED' || typeof draft.assignmentId !== 'string'
    || !Number.isInteger(draft.attemptNo) || !Number.isInteger(draft.revision) || Number(draft.revision) < 1
    || typeof draft.manualTranscript !== 'string' || !Array.isArray(draft.assetIds)
    || !draft.assetIds.every(id => typeof id === 'string') || !Array.isArray(draft.assets)
    || !draft.assets.every(asset => record(asset) && typeof asset.id === 'string' && typeof asset.fileName === 'string'
      && typeof asset.mimeType === 'string' && typeof asset.byteSize === 'number') || typeof draft.updatedAt !== 'number') return invalid();
  return value as unknown as WritingInputDraftResponse;
};

const aiResponse = (value: unknown): WritingAiDraftResponse => {
  if (!record(value) || value.assessmentStatus !== 'UNASSESSED' || value.requiresHumanReview !== true
    || !['PENDING', 'READY', 'UNASSESSED'].includes(String(value.status))
    || !['OCR', 'WRITING_FEEDBACK'].includes(String(value.operation)) || typeof value.requestId !== 'string' || !value.requestId.trim()
    || typeof value.assignmentId !== 'string' || !value.assignmentId.trim() || !Number.isInteger(value.attemptNo) || typeof value.updatedAt !== 'number') return invalid();
  if (value.inputDraftRevision !== undefined && (!Number.isSafeInteger(value.inputDraftRevision) || Number(value.inputDraftRevision) < 1)) return invalid();
  if (value.recoveryAction !== undefined && !['RESEND_SAME_REQUEST', 'CHECK_RESULT', 'NONE'].includes(String(value.recoveryAction))) return invalid();
  if (value.reason !== undefined && typeof value.reason !== 'string') return invalid();
  if (value.result !== undefined) {
    const result = value.result;
    if (!record(result) || result.operation !== value.operation) return invalid();
    if (result.operation === 'OCR') {
      if (typeof result.transcript !== 'string' || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence)) return invalid();
    } else if (typeof result.correctedDraft !== 'string' || !Array.isArray(result.strengths) || !result.strengths.every(item => typeof item === 'string')
      || !Array.isArray(result.improvementPoints) || !result.improvementPoints.every(item => typeof item === 'string')
      || !Array.isArray(result.sentenceCorrections) || !result.sentenceCorrections.every(item => record(item)
        && typeof item.before === 'string' && typeof item.after === 'string' && typeof item.reason === 'string')) return invalid();
  }
  if (value.status === 'READY' && !value.result) return invalid();
  return value as unknown as WritingAiDraftResponse;
};

export const getWritingAiCapabilities = async (assignmentId: string): Promise<WritingAiCapabilities> => {
  const value = await apiGet<unknown>(`/api/writing/ai-capabilities?${new URLSearchParams({ assignmentId })}`);
  if (!record(value) || value.provider !== 'OPENAI' || typeof value.model !== 'string'
    || !['DISABLED', 'REQUIRES_DATA_APPROVAL', 'ENABLED'].includes(String(value.state))
    || typeof value.ocrEnabled !== 'boolean' || typeof value.feedbackEnabled !== 'boolean'
    || value.pdfOcrEnabled !== false || typeof value.gradingEnabled !== 'boolean'
    || value.draftSavingEnabled !== true || typeof value.message !== 'string') return invalid();
  return value as unknown as WritingAiCapabilities;
};
export const getWritingInputDraft = async (assignmentId: string, attemptNo: number): Promise<WritingInputDraftResponse> => (
  inputResponse(await apiGet(`/api/writing/input-draft?${new URLSearchParams({ assignmentId, attemptNo: String(attemptNo) })}`))
);
export const saveWritingInputDraft = async (request: SaveWritingInputDraftRequest): Promise<WritingInputDraftResponse> => (
  inputResponse(await apiPost('/api/writing/input-draft', request))
);
export const generateWritingAiDraft = async (request: GenerateWritingAiDraftRequest): Promise<WritingAiDraftResponse> => (
  aiResponse(await apiPost('/api/writing/ai-drafts', request))
);
export const getWritingAiDraft = async (requestId: string): Promise<WritingAiDraftResponse> => (
  aiResponse(await apiGet(`/api/writing/ai-drafts/${encodeURIComponent(requestId)}`))
);
