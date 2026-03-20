import { describe, expect, it } from 'vitest';

import type { WritingEvaluation } from '../types';
import {
  appendWritingSideEffectWarning,
  buildRubric,
  choosePreferredEvaluation,
  decodeSubmissionMarker,
  encodeSubmissionMarker,
  getWritingSideEffectWarningMessage,
} from '../utils/writing';

const makeEvaluation = (overrides: Partial<WritingEvaluation>): WritingEvaluation => ({
  id: overrides.id || 'eval-1',
  provider: overrides.provider || 'GEMINI',
  overallScore: overrides.overallScore || 14,
  rubric: overrides.rubric || buildRubric('I agree because it is useful for students. For example, they can learn actively.', '英検'),
  strengths: overrides.strengths || ['主張が明確です。'],
  improvementPoints: overrides.improvementPoints || ['理由をもう1つ足すとより説得力が出ます。'],
  sentenceCorrections: overrides.sentenceCorrections || [],
  correctedDraft: overrides.correctedDraft || 'I agree because it is useful for students.',
  modelAnswer: overrides.modelAnswer || 'I agree with this idea for two reasons.',
  confidence: overrides.confidence || 0.8,
  transcriptAlignment: overrides.transcriptAlignment || 0.8,
  rubricConsistency: overrides.rubricConsistency || 0.8,
  structureScore: overrides.structureScore || 0.8,
  selectionScore: overrides.selectionScore || 2.1,
  costMilliYen: overrides.costMilliYen || 420,
  latencyMs: overrides.latencyMs || 900,
  isDefault: overrides.isDefault || false,
});

describe('writing utils', () => {
  it('encodes and decodes submission markers', () => {
    const marker = encodeSubmissionMarker('assignment-123', 'ABCD2345', 2);
    expect(decodeSubmissionMarker(marker)).toEqual({
      assignmentId: 'assignment-123',
      submissionCode: 'ABCD2345',
      attemptNo: 2,
    });
  });

  it('chooses the best evaluation from selection score and confidence', () => {
    const gemini = makeEvaluation({ id: 'gemini', provider: 'GEMINI', selectionScore: 2.18, confidence: 0.82 });
    const openai = makeEvaluation({ id: 'openai', provider: 'OPENAI', selectionScore: 2.18, confidence: 0.9, costMilliYen: 520 });
    const cloudflare = makeEvaluation({ id: 'cf', provider: 'CLOUDFLARE', selectionScore: 2.02, confidence: 0.84, costMilliYen: 340 });

    expect(choosePreferredEvaluation([gemini, openai, cloudflare])?.id).toBe('openai');
  });

  it('builds rubric scores on four fixed axes', () => {
    const rubric = buildRubric(
      'I agree with this idea because students can learn actively. For example, they can work with others and improve communication.',
      '大学入試',
    );

    expect(rubric.map((item) => item.key)).toEqual(['task', 'organization', 'vocabulary', 'grammar']);
    expect(rubric.every((item) => item.score >= 1 && item.score <= item.maxScore)).toBe(true);
  });

  it('returns no warning when writing side effects were persisted successfully', () => {
    expect(getWritingSideEffectWarningMessage(null)).toBeNull();
    expect(getWritingSideEffectWarningMessage({
      sideEffectJob: undefined,
    })).toBeNull();
  });

  it('appends a dashboard sync warning when a writing side effect job fails', () => {
    const message = appendWritingSideEffectWarning('答案を提出しました。', {
      sideEffectJob: {
        jobId: 'job-1',
        status: 'FAILED',
        attemptCount: 2,
        lastError: 'D1 unavailable',
      },
    });

    expect(message).toContain('答案を提出しました。');
    expect(message).toContain('ダッシュボード反映が遅れる可能性があります');
  });
});
