import { GoogleGenAI, Type } from '@google/genai';

import {
  WRITING_EXAM_CATEGORY_LABELS,
  type WritingAiExecutionProvenance,
  type WritingAiProvider,
  type WritingAssignment,
  type WritingEvaluation,
  type WritingPromptTemplate,
} from '../../types';
import {
  buildRubric,
  choosePreferredEvaluation,
  normalizeSentenceCorrections,
} from '../../utils/writing';
import {
  assertAiActionAllowed,
  assertBudgetAvailable,
  recordAiUsageEvent,
} from './ai-metering';
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

export type WritingAiMode = 'fixture' | 'live' | 'hybrid';

export interface WritingAiInputAsset {
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export interface WritingPromptResult {
  promptTitle: string;
  promptText: string;
  guidance: string;
  provider: WritingAiProvider;
  provenance: WritingAiExecutionProvenance;
}

export interface WritingOcrResult {
  transcript: string;
  confidence: number;
  provider: WritingAiProvider;
  provenance: WritingAiExecutionProvenance;
}

export type WritingEvaluationResult = WritingEvaluation;

export interface WritingAiAdapter {
  generatePrompt: (
    template: WritingPromptTemplate,
    studentName: string,
    topicHint?: string,
    notes?: string,
  ) => Promise<WritingPromptResult>;
  runOcr: (
    assignment: Pick<WritingAssignment, 'promptText' | 'guidance' | 'wordCountMin'>,
    assets: WritingAiInputAsset[],
    manualTranscript?: string,
  ) => Promise<WritingOcrResult>;
  runEvaluations: (
    assignment: WritingAssignment,
    transcript: string,
  ) => Promise<WritingEvaluationResult[]>;
}

const PROVIDER_COSTS: Record<WritingAiProvider, number> = {
  CLOUDFLARE: 340,
  GEMINI: 420,
  OPENAI: 520,
};

const PROVIDER_LATENCY: Record<WritingAiProvider, number> = {
  CLOUDFLARE: 880,
  GEMINI: 930,
  OPENAI: 1020,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const handleAiError = (error: unknown, fallbackMessage: string): never => {
  const maybe = error as { status?: number; message?: string };
  if (maybe?.status === 429 || maybe?.message?.includes('429')) {
    throw new HttpError(429, 'AIの利用制限に達しました。しばらく待ってから再試行してください。');
  }
  throw new HttpError(502, fallbackMessage);
};

const getAiClient = (env: AppEnv): GoogleGenAI => {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, 'GEMINI_API_KEY が未設定です。');
  }
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
};

const LIVE_EVALUATION_PROVIDERS: WritingAiProvider[] = ['GEMINI'];
const FIXTURE_EVALUATION_PROVIDERS: WritingAiProvider[] = ['GEMINI', 'OPENAI', 'CLOUDFLARE'];

const buildProvenance = (
  mode: WritingAiExecutionProvenance['mode'],
  provider: WritingAiProvider,
  overrides: Partial<WritingAiExecutionProvenance> = {},
): WritingAiExecutionProvenance => ({
  mode,
  provider,
  ...overrides,
});

const isPolicyGuardError = (error: unknown): boolean => (
  error instanceof HttpError
  && (
    error.status === 403
    || (error.status === 429 && error.message.includes('今月のAI利用上限'))
  )
);

const isFallbackEligibleError = (error: unknown): boolean => !isPolicyGuardError(error);

const recordWritingUsage = async (
  env: AppEnv,
  user: DbUserRow,
  action: 'generateWritingPrompt' | 'ocrWritingSubmission' | 'evaluateWritingSubmission',
  provenance: WritingAiExecutionProvenance,
  usedAi: boolean,
): Promise<void> => {
  await recordAiUsageEvent(env, user, {
    action,
    provider: provenance.provider,
    model: provenance.model,
    usedAi,
  });
};

export const resolveWritingAiMode = (env: Pick<AppEnv, 'WRITING_AI_MODE'>): WritingAiMode => {
  const raw = String(env.WRITING_AI_MODE || '').trim().toLowerCase();
  if (raw === 'live') return 'live';
  if (raw === 'hybrid') return 'hybrid';
  return 'fixture';
};

const scoreWordCount = (
  transcript: string,
  assignment: Pick<WritingAssignment, 'wordCountMin' | 'wordCountMax'>,
): number => {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0.1;
  if (wordCount >= assignment.wordCountMin && wordCount <= assignment.wordCountMax) return 0.94;
  const delta = wordCount < assignment.wordCountMin
    ? assignment.wordCountMin - wordCount
    : wordCount - assignment.wordCountMax;
  return Math.max(0.35, 0.9 - delta / Math.max(assignment.wordCountMax, 1));
};

const buildModelAnswer = (
  assignment: Pick<WritingAssignment, 'promptText' | 'guidance' | 'wordCountMin' | 'wordCountMax'>,
): string => {
  const minWords = Math.max(assignment.wordCountMin, 60);
  const base = [
    'I believe this idea can be beneficial for students and the community.',
    'First, it gives learners more chances to practice useful skills in real situations.',
    'For example, students can communicate, solve problems, and manage their time more actively.',
    'Second, it helps people understand different opinions and make balanced decisions.',
    'Although there may be some difficulties, careful support can reduce those problems.',
    'For these reasons, I think this approach should be encouraged.',
  ];
  const response = base.join(' ');
  const words = response.split(/\s+/);
  return words.length >= minWords ? response : `${response} ${assignment.guidance}`;
};

const buildStrengths = (transcript: string): string[] => {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  const strengths = ['自分の立場や主張を読み手に伝えようとする姿勢があります。'];
  if (words >= 40) strengths.push('必要な分量に近づけようとしており、内容量は確保できています。');
  if (/\bfor example\b|\bbecause\b|\bhowever\b/i.test(transcript)) {
    strengths.push('理由や具体例をつなぐ表現が見られ、論理の流れを作れています。');
  }
  return strengths.slice(0, 3);
};

const buildImprovementPoints = (
  evaluation: Pick<WritingEvaluation, 'rubric'>,
): string[] => {
  const lowItems = evaluation.rubric
    .filter((item) => item.score < item.maxScore)
    .sort((left, right) => left.score - right.score)
    .slice(0, 3);
  if (lowItems.length === 0) {
    return ['語彙の幅を少し広げると、より洗練された答案になります。'];
  }
  return lowItems.map((item) => `${item.label}: ${item.comment}`);
};

const createFixturePrompt = (
  template: WritingPromptTemplate,
  studentName: string,
  topicHint: string | undefined,
  notes: string | undefined,
  provenance: WritingAiExecutionProvenance,
): WritingPromptResult => {
  const topic = topicHint?.trim() || template.sampleTopic || 'school life and society';
  const notesLine = notes?.trim() ? ` 注意: ${notes.trim()}` : '';
  return {
    promptTitle: `${WRITING_EXAM_CATEGORY_LABELS[template.examCategory]} ${template.title}`,
    promptText: `${template.promptBase} Topic: ${topic}. Student: ${studentName}.${notesLine}`,
    guidance: template.guidance,
    provider: provenance.provider,
    provenance,
  };
};

const createFixtureOcrResult = (
  manualTranscript: string | undefined,
  provenanceMode: WritingAiExecutionProvenance['mode'],
  fallbackReason?: string,
): WritingOcrResult => {
  const normalizedManual = manualTranscript?.trim() || '';
  if (normalizedManual) {
    return {
      transcript: normalizedManual,
      confidence: 0.96,
      provider: 'GEMINI',
      provenance: buildProvenance(provenanceMode, 'GEMINI', {
        fallbackReason,
        notes: 'manual-transcript',
        model: 'manual-transcript',
      }),
    };
  }

  const fallbackTranscript = [
    'I agree with this idea because it helps students learn actively and communicate with others.',
    'First, students can practice useful skills through real experiences.',
    'Second, they can understand different opinions and grow more responsible.',
    'For these reasons, I think this idea is effective.',
  ].join(' ');

  return {
    transcript: fallbackTranscript,
    confidence: 0.58,
    provider: 'OPENAI',
    provenance: buildProvenance(provenanceMode, 'OPENAI', {
      requestedProvider: 'GEMINI',
      fallbackReason: fallbackReason || 'fixture-confidence-upgrade',
      model: 'fixture-writing-ocr',
    }),
  };
};

const createFixtureEvaluation = (
  provider: WritingAiProvider,
  assignment: WritingAssignment,
  transcript: string,
  provenance: WritingAiExecutionProvenance,
): WritingEvaluationResult => {
  const corrections = normalizeSentenceCorrections(transcript);
  const correctedDraft = corrections.length > 0
    ? corrections.map((item) => item.after).join(' ')
    : transcript;
  const baseRubric = buildRubric(transcript, assignment.promptTitle);
  const modelAnswer = buildModelAnswer(assignment);
  const wordCountScore = scoreWordCount(transcript, assignment);
  const providerBonus = provider === 'OPENAI' ? 0.04 : provider === 'GEMINI' ? 0.03 : 0.01;
  const providerCost = PROVIDER_COSTS[provider];
  const transcriptAlignment = Number((wordCountScore + providerBonus).toFixed(2));
  const structureScore = Number((Math.min(0.96, 0.58 + baseRubric[1].score * 0.08 + providerBonus)).toFixed(2));
  const rubricConsistency = Number((Math.min(0.97, 0.55 + baseRubric[0].score * 0.07 + providerBonus)).toFixed(2));
  const confidence = Number((Math.min(0.98, 0.6 + wordCountScore * 0.22 + providerBonus)).toFixed(2));
  const adjustedRubric = baseRubric.map((item) => ({
    ...item,
    score: clamp(item.score + (provider === 'OPENAI' && item.key === 'grammar' ? 1 : 0), 1, item.maxScore),
  }));
  const overallScore = adjustedRubric.reduce((sum, item) => sum + item.score, 0);
  const rawSelectionScore = structureScore + transcriptAlignment + rubricConsistency + confidence - (providerCost / 2000);

  return {
    id: crypto.randomUUID(),
    provider,
    overallScore,
    rubric: adjustedRubric,
    strengths: buildStrengths(transcript),
    improvementPoints: buildImprovementPoints({ rubric: adjustedRubric } as WritingEvaluation),
    sentenceCorrections: corrections,
    correctedDraft,
    modelAnswer,
    confidence,
    transcriptAlignment,
    rubricConsistency,
    structureScore,
    selectionScore: Number(rawSelectionScore.toFixed(2)),
    costMilliYen: providerCost,
    latencyMs: PROVIDER_LATENCY[provider],
    isDefault: false,
    provenance,
  };
};

const runLivePrompt = async (
  env: AppEnv,
  user: DbUserRow,
  template: WritingPromptTemplate,
  studentName: string,
  topicHint?: string,
  notes?: string,
): Promise<WritingPromptResult> => {
  const ai = getAiClient(env);
  const topic = topicHint?.trim() || template.sampleTopic || 'school life and society';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        You are designing a Japanese student writing assignment.
        Exam category: ${template.examCategory}
        Template title: ${template.title}
        Prompt base: ${template.promptBase}
        Guidance: ${template.guidance}
        Student: ${studentName}
        Topic hint: ${topic}
        Notes: ${notes?.trim() || 'none'}

        Return JSON with:
        - promptTitle
        - promptText
        - guidance
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            promptTitle: { type: Type.STRING },
            promptText: { type: Type.STRING },
            guidance: { type: Type.STRING },
          },
          required: ['promptTitle', 'promptText', 'guidance'],
        },
      },
    });
    if (!response.text) throw new Error('Empty response');
    const parsed = JSON.parse(response.text) as {
      promptTitle: string;
      promptText: string;
      guidance: string;
    };

    return {
      ...parsed,
      provider: 'GEMINI',
      provenance: buildProvenance('live', 'GEMINI', {
        model: 'gemini-2.5-flash',
      }),
    };
  } catch (error) {
    handleAiError(error, '自由英作文課題の生成に失敗しました。');
  }
};

const runLiveOcr = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: Pick<WritingAssignment, 'promptText' | 'guidance' | 'wordCountMin'>,
  assets: WritingAiInputAsset[],
  manualTranscript?: string,
): Promise<WritingOcrResult> => {
  if (manualTranscript?.trim()) {
    return {
      transcript: manualTranscript.trim(),
      confidence: 0.99,
      provider: 'GEMINI',
      provenance: buildProvenance('live', 'GEMINI', {
        model: 'manual-transcript',
        notes: 'manual-transcript',
      }),
    };
  }

  if (assets.length === 0) {
    throw new HttpError(400, 'OCR 実行にはアップロード済み資産が必要です。');
  }

  const ai = getAiClient(env);

  try {
    const contents = [
      ...assets.map((asset) => ({
        inlineData: {
          mimeType: asset.mimeType,
          data: asset.base64Data,
        },
      })),
      {
        text: `
          You are an OCR assistant for handwritten English essays by Japanese students.
          Assignment prompt: ${assignment.promptText}
          Guidance: ${assignment.guidance}
          Minimum words: ${assignment.wordCountMin}

          Return JSON with:
          - transcript: extracted English text
          - confidence: number between 0 and 1
        `,
      },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
          },
          required: ['transcript', 'confidence'],
        },
      },
    });

    if (!response.text) throw new Error('Empty response');
    const parsed = JSON.parse(response.text) as {
      transcript: string;
      confidence: number;
    };

    if (!parsed.transcript.trim()) {
      throw new Error('OCR transcript was empty');
    }

    return {
      transcript: parsed.transcript.trim(),
      confidence: clamp(Number(parsed.confidence || 0), 0.1, 0.99),
      provider: 'GEMINI',
      provenance: buildProvenance('live', 'GEMINI', {
        model: 'gemini-2.5-flash',
      }),
    };
  } catch (error) {
    handleAiError(error, '自由英作文 OCR に失敗しました。');
  }
};

const runLiveEvaluation = async (
  env: AppEnv,
  user: DbUserRow,
  provider: WritingAiProvider,
  assignment: WritingAssignment,
  transcript: string,
): Promise<WritingEvaluationResult> => {
  if (provider !== 'GEMINI') {
    throw new HttpError(503, `${provider} live provider is not configured yet.`);
  }

  const ai = getAiClient(env);
  const baseRubric = buildRubric(transcript, assignment.promptTitle);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        You are evaluating an English writing submission for a Japanese learner.
        Assignment: ${assignment.promptTitle}
        Prompt: ${assignment.promptText}
        Guidance: ${assignment.guidance}
        Submission:
        ${transcript}

        Return JSON with:
        - strengths: array of 2-3 Japanese bullet points
        - improvementPoints: array of 2-3 Japanese bullet points
        - correctedDraft: corrected English draft
        - modelAnswer: concise English model answer
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvementPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctedDraft: { type: Type.STRING },
            modelAnswer: { type: Type.STRING },
          },
          required: ['strengths', 'improvementPoints', 'correctedDraft', 'modelAnswer'],
        },
      },
    });
    if (!response.text) throw new Error('Empty response');
    const parsed = JSON.parse(response.text) as {
      strengths: string[];
      improvementPoints: string[];
      correctedDraft: string;
      modelAnswer: string;
    };

    const corrections = normalizeSentenceCorrections(transcript);
    const wordCountScore = scoreWordCount(transcript, assignment);
    const transcriptAlignment = Number((wordCountScore + 0.05).toFixed(2));
    const structureScore = Number((Math.min(0.97, 0.62 + baseRubric[1].score * 0.08)).toFixed(2));
    const rubricConsistency = Number((Math.min(0.97, 0.58 + baseRubric[0].score * 0.07)).toFixed(2));
    const confidence = Number((Math.min(0.99, 0.68 + wordCountScore * 0.22)).toFixed(2));
    const overallScore = baseRubric.reduce((sum, item) => sum + item.score, 0);
    const selectionScore = Number((structureScore + transcriptAlignment + rubricConsistency + confidence - (PROVIDER_COSTS[provider] / 2000)).toFixed(2));

    return {
      id: crypto.randomUUID(),
      provider,
      overallScore,
      rubric: baseRubric,
      strengths: parsed.strengths.slice(0, 3),
      improvementPoints: parsed.improvementPoints.slice(0, 3),
      sentenceCorrections: corrections,
      correctedDraft: parsed.correctedDraft,
      modelAnswer: parsed.modelAnswer,
      confidence,
      transcriptAlignment,
      rubricConsistency,
      structureScore,
      selectionScore,
      costMilliYen: PROVIDER_COSTS[provider],
      latencyMs: PROVIDER_LATENCY[provider],
      isDefault: false,
      provenance: buildProvenance('live', provider, {
        model: 'gemini-2.5-flash',
      }),
    };
  } catch (error) {
    handleAiError(error, '自由英作文の AI 添削に失敗しました。');
  }
};

export const createWritingAiAdapter = (env: AppEnv, user: DbUserRow): WritingAiAdapter => {
  const mode = resolveWritingAiMode(env);

  const withPromptFallback = async (
    template: WritingPromptTemplate,
    studentName: string,
    topicHint?: string,
    notes?: string,
  ): Promise<WritingPromptResult> => {
    assertAiActionAllowed(user, 'generateWritingPrompt');

    const fallback = async (fallbackReason?: string) => {
      const result = createFixturePrompt(
        template,
        studentName,
        topicHint,
        notes,
        buildProvenance(mode === 'fixture' ? 'fixture' : 'hybrid-fallback', 'GEMINI', {
          fallbackReason,
          model: 'fixture-writing-prompt',
        }),
      );
      await recordWritingUsage(env, user, 'generateWritingPrompt', result.provenance, false);
      return result;
    };

    if (mode === 'fixture') return fallback();
    try {
      await assertBudgetAvailable(env, user, 'generateWritingPrompt');
      const result = await runLivePrompt(env, user, template, studentName, topicHint, notes);
      await recordWritingUsage(env, user, 'generateWritingPrompt', result.provenance, true);
      return result;
    } catch (error) {
      if (mode === 'live' || !isFallbackEligibleError(error)) throw error;
      return fallback(error instanceof Error ? error.message : 'live-prompt-failed');
    }
  };

  const withOcrFallback = async (
    assignment: Pick<WritingAssignment, 'promptText' | 'guidance' | 'wordCountMin'>,
    assets: WritingAiInputAsset[],
    manualTranscript?: string,
  ): Promise<WritingOcrResult> => {
    assertAiActionAllowed(user, 'ocrWritingSubmission');

    if (manualTranscript?.trim()) {
      const result = mode === 'fixture'
        ? createFixtureOcrResult(manualTranscript, 'fixture')
        : {
            transcript: manualTranscript.trim(),
            confidence: 0.99,
            provider: 'GEMINI' as const,
            provenance: buildProvenance('live', 'GEMINI', {
              model: 'manual-transcript',
              notes: 'manual-transcript',
            }),
          };
      await recordWritingUsage(env, user, 'ocrWritingSubmission', result.provenance, false);
      return result;
    }

    const fallback = async (fallbackReason?: string) => {
      const result = createFixtureOcrResult(
        manualTranscript,
        mode === 'fixture' ? 'fixture' : 'hybrid-fallback',
        fallbackReason,
      );
      await recordWritingUsage(env, user, 'ocrWritingSubmission', result.provenance, false);
      return result;
    };

    if (mode === 'fixture') return fallback();
    try {
      await assertBudgetAvailable(env, user, 'ocrWritingSubmission');
      const result = await runLiveOcr(env, user, assignment, assets, manualTranscript);
      await recordWritingUsage(env, user, 'ocrWritingSubmission', result.provenance, true);
      return result;
    } catch (error) {
      if (mode === 'live' || !isFallbackEligibleError(error)) throw error;
      return fallback(error instanceof Error ? error.message : 'live-ocr-failed');
    }
  };

  const withEvaluationFallback = async (
    provider: WritingAiProvider,
    assignment: WritingAssignment,
    transcript: string,
    comparisonMode: WritingAiExecutionProvenance['mode'],
    fallbackReason?: string,
  ): Promise<WritingEvaluationResult> => {
    const fallback = async (reason?: string) => {
      const result = createFixtureEvaluation(
        provider,
        assignment,
        transcript,
        buildProvenance(comparisonMode, provider, {
          requestedProvider: provider,
          fallbackReason: reason,
          model: 'fixture-writing-evaluation',
        }),
      );
      await recordWritingUsage(env, user, 'evaluateWritingSubmission', result.provenance, false);
      return result;
    };

    if (comparisonMode === 'fixture') return fallback();
    if (comparisonMode === 'hybrid-fallback' && fallbackReason) return fallback(fallbackReason);

    try {
      await assertBudgetAvailable(env, user, 'evaluateWritingSubmission');
      const result = await runLiveEvaluation(env, user, provider, assignment, transcript);
      await recordWritingUsage(env, user, 'evaluateWritingSubmission', result.provenance, true);
      return result;
    } catch (error) {
      if (mode === 'live' || !isFallbackEligibleError(error)) throw error;
      return fallback(error instanceof Error ? error.message : 'live-evaluation-failed');
    }
  };

  return {
    generatePrompt: withPromptFallback,
    runOcr: withOcrFallback,
    runEvaluations: async (assignment, transcript) => {
      assertAiActionAllowed(user, 'evaluateWritingSubmission');

      const providers = mode === 'live'
        ? LIVE_EVALUATION_PROVIDERS
        : FIXTURE_EVALUATION_PROVIDERS;

      const evaluations = [];
      for (const provider of providers) {
        if (mode === 'fixture') {
          evaluations.push(await withEvaluationFallback(provider, assignment, transcript, 'fixture'));
          continue;
        }

        if (provider !== 'GEMINI') {
          evaluations.push(await withEvaluationFallback(
            provider,
            assignment,
            transcript,
            'hybrid-fallback',
            'live-provider-not-configured',
          ));
          continue;
        }

        evaluations.push(await withEvaluationFallback(provider, assignment, transcript, 'live'));
      }

      const preferred = choosePreferredEvaluation(evaluations);
      return evaluations.map((evaluation) => ({
        ...evaluation,
        isDefault: evaluation.id === preferred?.id,
      }));
    },
  };
};
