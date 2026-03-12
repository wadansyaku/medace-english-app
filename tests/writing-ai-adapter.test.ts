import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
    };
  },
  Type: {
    ARRAY: 'ARRAY',
    NUMBER: 'NUMBER',
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

import { WritingExamCategory } from '../types';
import { createWritingAiAdapter, resolveWritingAiMode } from '../functions/_shared/writing-ai-adapter';

const createDbMock = () => {
  const usageEvents: Array<{
    action: string;
    model: string;
    provider: string;
    estimated_cost_milli_yen: number;
    request_units: number;
    used_ai: number;
  }> = [];

  return {
    usageEvents,
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          if (sql.includes('SELECT COALESCE(SUM(estimated_cost_milli_yen), 0) AS total')) {
            return {
              first: async () => ({
                total: usageEvents.reduce((sum, item) => sum + Number(item.estimated_cost_milli_yen || 0), 0),
              }),
            };
          }

          if (sql.includes('INSERT INTO ai_usage_events')) {
            return {
              run: async () => {
                usageEvents.push({
                  action: String(args[1]),
                  model: String(args[2]),
                  provider: String(args[3]),
                  estimated_cost_milli_yen: Number(args[4] || 0),
                  request_units: Number(args[5] || 0),
                  used_ai: Number(args[6] || 0),
                });
                return {};
              },
            };
          }

          return {
            first: async () => null,
            run: async () => ({}),
          };
        },
      }),
    },
  };
};

const user = {
  id: 'student-1',
  subscription_plan: 'TOB_PAID',
} as any;

const template = {
  id: 'tpl-1',
  examCategory: WritingExamCategory.EIKEN,
  templateType: 'OPINION',
  title: '英検 意見提示',
  promptBase: 'State your opinion and give two reasons.',
  guidance: '理由を2つに絞る。',
  defaultWordCountMin: 80,
  defaultWordCountMax: 100,
  sampleTopic: 'Should students use tablets in class?',
  tags: ['eiken'],
};

const assignment = {
  id: 'assignment-1',
  organizationName: 'Demo School',
  instructorUid: 'teacher-1',
  instructorName: 'Oak',
  studentUid: 'student-1',
  studentName: 'Student',
  examCategory: WritingExamCategory.EIKEN,
  templateId: 'tpl-1',
  templateType: 'OPINION',
  promptTitle: '英検 意見提示',
  promptText: 'State your opinion and give two reasons.',
  guidance: '理由を2つに絞る。',
  wordCountMin: 80,
  wordCountMax: 100,
  submissionCode: 'ABCD1234',
  status: 'ISSUED',
  attemptCount: 0,
  maxAttempts: 2,
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as any;

describe('writing ai adapter', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('defaults to fixture mode when WRITING_AI_MODE is unset', () => {
    expect(resolveWritingAiMode({ WRITING_AI_MODE: undefined })).toBe('fixture');
    expect(resolveWritingAiMode({ WRITING_AI_MODE: 'hybrid' })).toBe('hybrid');
    expect(resolveWritingAiMode({ WRITING_AI_MODE: 'live' })).toBe('live');
  });

  it('marks fixture OCR provenance, preserves manual transcripts, and records no external AI usage', async () => {
    const dbMock = createDbMock();
    const adapter = createWritingAiAdapter({
      DB: dbMock.DB,
      WRITING_AI_MODE: 'fixture',
    } as any, user);

    const result = await adapter.runOcr(
      {
        promptText: assignment.promptText,
        guidance: assignment.guidance,
        wordCountMin: assignment.wordCountMin,
      },
      [],
      'I agree because tablets help students review faster.',
    );

    expect(result.provider).toBe('GEMINI');
    expect(result.provenance.mode).toBe('fixture');
    expect(result.provenance.notes).toBe('manual-transcript');
    expect(result.transcript).toContain('tablets');
    expect(dbMock.usageEvents).toHaveLength(1);
    expect(dbMock.usageEvents[0]).toMatchObject({
      action: 'ocrWritingSubmission',
      provider: 'GEMINI',
      model: 'manual-transcript',
      used_ai: 0,
      estimated_cost_milli_yen: 0,
    });
  });

  it('falls back from hybrid mode without double counting AI budget when live prompt generation fails', async () => {
    generateContentMock.mockRejectedValueOnce(new Error('provider unavailable'));
    const dbMock = createDbMock();
    const adapter = createWritingAiAdapter({
      DB: dbMock.DB,
      GEMINI_API_KEY: 'test-key',
      WRITING_AI_MODE: 'hybrid',
    } as any, user);

    const prompt = await adapter.generatePrompt(template, 'Student');

    expect(prompt.provenance.mode).toBe('hybrid-fallback');
    expect(prompt.provenance.model).toBe('fixture-writing-prompt');
    expect(dbMock.usageEvents).toHaveLength(1);
    expect(dbMock.usageEvents[0]).toMatchObject({
      action: 'generateWritingPrompt',
      provider: 'GEMINI',
      model: 'fixture-writing-prompt',
      used_ai: 0,
      estimated_cost_milli_yen: 0,
    });
  });

  it('returns only live-supported providers in live mode and records actual AI usage once', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        strengths: ['主張が明確です。', '理由が読み取りやすいです。'],
        improvementPoints: ['語彙を少し広げましょう。', '接続表現を増やしましょう。'],
        correctedDraft: 'I agree with this idea because students can review lessons efficiently.',
        modelAnswer: 'I agree because tablets support review and collaboration in class.',
      }),
    });

    const dbMock = createDbMock();
    const adapter = createWritingAiAdapter({
      DB: dbMock.DB,
      GEMINI_API_KEY: 'test-key',
      WRITING_AI_MODE: 'live',
    } as any, user);

    const evaluations = await adapter.runEvaluations(
      assignment,
      'I agree because students can review lessons quickly and share ideas more easily.',
    );

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].provider).toBe('GEMINI');
    expect(evaluations[0].provenance?.mode).toBe('live');
    expect(dbMock.usageEvents).toHaveLength(1);
    expect(dbMock.usageEvents[0]).toMatchObject({
      action: 'evaluateWritingSubmission',
      provider: 'GEMINI',
      model: 'gemini-2.5-flash',
      used_ai: 1,
    });
    expect(dbMock.usageEvents[0].estimated_cost_milli_yen).toBeGreaterThan(0);
  });
});
