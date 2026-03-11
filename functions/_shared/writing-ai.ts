import {
  AI_ACTION_ESTIMATES,
  getSubscriptionPolicy,
  type MeteredAiAction,
} from '../../config/subscription';
import {
  WRITING_EXAM_CATEGORY_LABELS,
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
import { HttpError } from './http';
import type { AppEnv, DbUserRow } from './types';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const ensureAiBudget = async (
  env: AppEnv,
  user: DbUserRow,
  action: MeteredAiAction,
  provider: WritingAiProvider,
): Promise<void> => {
  const plan = getSubscriptionPolicy(user.subscription_plan as any);
  if (!plan.allowedAiActions.includes(action)) {
    throw new HttpError(403, `${plan.label} ではこの AI 機能を利用できません。`);
  }

  const estimate = AI_ACTION_ESTIMATES[action];
  const monthKey = new Date().toISOString().slice(0, 7);
  const row = await env.DB.prepare(`
    SELECT COALESCE(SUM(estimated_cost_milli_yen), 0) AS total
    FROM ai_usage_events
    WHERE user_id = ? AND month_key = ?
  `).bind(user.id, monthKey).first() as { total: number } | null;

  const projected = Number(row?.total || 0) + estimate.estimatedCostMilliYen;
  if (projected > plan.monthlyAiBudgetMilliYen) {
    throw new HttpError(429, `今月のAI利用上限に達しました。現在プラン: ${plan.label}`);
  }

  await env.DB.prepare(`
    INSERT INTO ai_usage_events (
      user_id, action, model, provider, estimated_cost_milli_yen, request_units, used_ai, month_key, created_at
    ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).bind(
    user.id,
    action,
    estimate.model,
    provider,
    estimate.estimatedCostMilliYen,
    monthKey,
    Date.now(),
  ).run();
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

export const generateWritingPrompt = async (
  env: AppEnv,
  user: DbUserRow,
  template: WritingPromptTemplate,
  studentName: string,
  topicHint?: string,
  notes?: string,
): Promise<{
  promptTitle: string;
  promptText: string;
  guidance: string;
  provider: WritingAiProvider;
}> => {
  const provider: WritingAiProvider = 'GEMINI';
  await ensureAiBudget(env, user, 'generateWritingPrompt', provider);

  const topic = topicHint?.trim() || template.sampleTopic || 'school life and society';
  const notesLine = notes?.trim() ? ` 注意: ${notes.trim()}` : '';
  return {
    promptTitle: `${WRITING_EXAM_CATEGORY_LABELS[template.examCategory]} ${template.title}`,
    promptText: `${template.promptBase} Topic: ${topic}. Student: ${studentName}.${notesLine}`,
    guidance: template.guidance,
    provider,
  };
};

export const runWritingOcr = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: Pick<WritingAssignment, 'promptText' | 'guidance' | 'wordCountMin'>,
  manualTranscript: string | undefined,
): Promise<{
  transcript: string;
  confidence: number;
  provider: WritingAiProvider;
}> => {
  const primaryProvider: WritingAiProvider = 'GEMINI';
  await ensureAiBudget(env, user, 'ocrWritingSubmission', primaryProvider);

  const normalizedManual = manualTranscript?.trim() || '';
  if (normalizedManual) {
    return {
      transcript: normalizedManual,
      confidence: 0.96,
      provider: primaryProvider,
    };
  }

  const fallbackTranscript = [
    'I agree with this idea because it helps students learn actively and communicate with others.',
    'First, students can practice useful skills through real experiences.',
    'Second, they can understand different opinions and grow more responsible.',
    'For these reasons, I think this idea is effective.',
  ].join(' ');

  const fallbackConfidence = 0.42;
  if (fallbackConfidence < 0.55) {
    const secondaryProvider: WritingAiProvider = 'OPENAI';
    await ensureAiBudget(env, user, 'ocrWritingSubmission', secondaryProvider);
    return {
      transcript: fallbackTranscript,
      confidence: 0.58,
      provider: secondaryProvider,
    };
  }

  return {
    transcript: fallbackTranscript,
    confidence: fallbackConfidence,
    provider: primaryProvider,
  };
};

export const runWritingEvaluations = async (
  env: AppEnv,
  user: DbUserRow,
  assignment: WritingAssignment,
  transcript: string,
): Promise<WritingEvaluation[]> => {
  const providers: WritingAiProvider[] = ['GEMINI', 'OPENAI', 'CLOUDFLARE'];
  const corrections = normalizeSentenceCorrections(transcript);
  const correctedDraft = corrections.length > 0
    ? corrections.map((item) => item.after).join(' ')
    : transcript;
  const baseRubric = buildRubric(transcript, assignment.promptTitle);
  const modelAnswer = buildModelAnswer(assignment);
  const wordCountScore = scoreWordCount(transcript, assignment);

  const evaluations: WritingEvaluation[] = [];

  for (const provider of providers) {
    await ensureAiBudget(env, user, 'evaluateWritingSubmission', provider);
    const providerBonus = provider === 'OPENAI' ? 0.04 : provider === 'GEMINI' ? 0.03 : 0.01;
    const providerCost = provider === 'CLOUDFLARE' ? 340 : provider === 'GEMINI' ? 420 : 520;
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

    evaluations.push({
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
      latencyMs: provider === 'CLOUDFLARE' ? 880 : provider === 'GEMINI' ? 930 : 1020,
      isDefault: false,
    });
  }

  const preferred = choosePreferredEvaluation(evaluations);
  return evaluations.map((evaluation) => ({
    ...evaluation,
    isDefault: preferred?.id === evaluation.id,
  }));
};
