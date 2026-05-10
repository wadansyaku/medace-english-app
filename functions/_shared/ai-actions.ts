import { GoogleGenAI, Type } from '@google/genai';
import {
  BookMetadata,
  EnglishLevel,
  LearningPlan,
  LearningPreference,
  StudentRiskLevel,
  UserGrade,
  WordData,
  type GrammarCurriculumScopeId,
  type JapaneseTranslationFeedback,
  type TranslationExamTarget,
  WorksheetQuestionMode,
} from '../../types';
import { getAiActionEstimate, type MeteredAiAction } from '../../config/subscription';
import { formatDateKey } from '../../utils/date';
import type { AiGrammarQuestionDraft } from '../../utils/aiGrammarQuestions';
import { normalizeAiGrammarQuestionDrafts } from '../../utils/aiGrammarQuestions';
import { buildFallbackLearningPlan } from '../../utils/learningPlan';
import type { GeneratedWorksheetQuestion } from '../../utils/worksheet';
import {
  filterWorksheetQuestionCandidates,
  toWorksheetSourceWords,
} from '../../utils/worksheet';
import { getGrammarCurriculumScope } from '../../utils/grammarScope';
import {
  assertAiActionAllowed,
  assertBudgetAvailable,
  recordAiUsageEvent,
  type AiUsageEventInput,
  type AiUsageLogContext,
} from './ai-metering';
import {
  readCbtLearnerSnapshot,
  readReusableAiGrammarQuestions,
  recordAiGeneratedProblem,
} from './ai-cache-cbt';
import { HttpError } from './http';
import { AppEnv, DbUserRow } from './types';

interface AiRequestBody {
  action: string;
  payload?: any;
}

interface GeneratedContext {
  english: string;
  japanese: string;
}

interface InstructorFollowUpDraft {
  message: string;
}

interface AIQuizQuestion {
  wordId: string;
  options: string[];
  correctOption: string;
}

type GrammarQuestionMode = Extract<WorksheetQuestionMode, 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_ORDER' | 'JA_TRANSLATION_INPUT'>;

interface ExtractedResult {
  words: { word: string; definition: string; }[];
  contextSummary: string;
}

interface DiagnosticQuestion {
  id: string;
  type: 'MCQ' | 'FILL_IN' | 'WRITING';
  question: string;
  options?: string[];
  answer?: string;
  level: EnglishLevel;
}

const getAiClient = (env: AppEnv): GoogleGenAI => {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, 'GEMINI_API_KEY が未設定です。');
  }
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
};

const DEFAULT_GRAMMAR_PRACTICE_MODEL = 'gemini-3-flash-preview';
const GRAMMAR_PRACTICE_PROMPT_VERSION = 'grammar-practice-v2';
const DEFAULT_TRANSLATION_FEEDBACK_MODEL = 'gemini-3-flash-preview';

const resolveGrammarPracticeModel = (env: AppEnv): string => (
  String(env.AI_GRAMMAR_MODEL || '').trim() || DEFAULT_GRAMMAR_PRACTICE_MODEL
);

const resolveTranslationFeedbackModel = (env: AppEnv): string => (
  String(env.AI_TRANSLATION_FEEDBACK_MODEL || '').trim() || DEFAULT_TRANSLATION_FEEDBACK_MODEL
);

const handleAiError = (error: unknown, fallbackMessage: string): never => {
  const maybe = error as { status?: number; message?: string };
  if (maybe?.status === 429 || maybe?.message?.includes('429')) {
    throw new HttpError(429, 'AIの利用制限に達しました。しばらく待ってから再試行してください。');
  }
  console.error(error);
  throw new HttpError(502, fallbackMessage);
};

const runMeteredAiAction = async <T>(
  env: AppEnv,
  user: DbUserRow,
  action: MeteredAiAction,
  runner: () => Promise<T>,
  logContext?: AiUsageLogContext,
  metering?: Partial<AiUsageEventInput>,
): Promise<T> => {
  if (typeof metering?.estimatedCostMilliYen === 'number') {
    await assertBudgetAvailable(env, user, action, metering.estimatedCostMilliYen);
  } else {
    await assertBudgetAvailable(env, user, action);
  }
  const result = await runner();
  await recordAiUsageEvent(env, user, {
    action,
    usedAi: true,
    ...(metering || {}),
    ...(logContext ? { logContext } : {}),
  });
  return result;
};

const generateGeminiSentence = async (env: AppEnv, payload: any): Promise<GeneratedContext> => {
  const ai = getAiClient(env);
  const word = String(payload.word || '');
  const definition = String(payload.definition || '');
  const userLevel = (payload.userLevel || EnglishLevel.B1) as EnglishLevel;
  const sourceContext = typeof payload.sourceContext === 'string' ? payload.sourceContext : '';

  try {
    const styleInstruction = sourceContext
      ? `Create an example sentence that fits the following context/style: "${sourceContext}". If the context is hard to apply, keep it natural but related to the theme.`
      : 'Create a practical example sentence.';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        Target Audience: Japanese Student (Level ${userLevel}).
        Word: "${word}"
        Meaning: "${definition}"

        Task:
        1. Analyze if the word is "Modern English" or "Classical Japanese (古文)".
        2. IF ENGLISH: ${styleInstruction}
        3. IF CLASSICAL JAPANESE: Create a famous or natural example sentence from classical literature or typical usage.

        Output JSON format:
        {
          "english": "The example sentence (or Classical Japanese sentence)",
          "japanese": "Natural modern Japanese translation"
        }
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            english: { type: Type.STRING },
            japanese: { type: Type.STRING },
          },
          required: ['english', 'japanese'],
        }
      }
    });

    if (!response.text) throw new Error('Empty response');
    return JSON.parse(response.text) as GeneratedContext;
  } catch (error) {
    handleAiError(error, '例文生成に失敗しました。');
  }
};

export const generateMeteredGeminiSentence = async (
  env: AppEnv,
  user: DbUserRow,
  payload: {
    word: string;
    definition: string;
    userLevel?: EnglishLevel;
    sourceContext?: string;
  },
  logContext?: AiUsageLogContext,
): Promise<GeneratedContext> => {
  return runMeteredAiAction(
    env,
    user,
    'generateGeminiSentence',
    () => generateGeminiSentence(env, payload),
    logContext,
    {
      providerInputUnits: 1,
      providerOutputUnits: 1,
    },
  );
};

const generateWordImage = async (env: AppEnv, payload: any): Promise<string | null> => {
  const ai = getAiClient(env);

  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: `A minimal, flat vector icon representing "${payload.word}" (Meaning: ${payload.definition}). Simple geometric shapes, white background.`,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1',
      },
    });

    const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    return base64ImageBytes ? `data:image/jpeg;base64,${base64ImageBytes}` : null;
  } catch (error) {
    handleAiError(error, '画像生成に失敗しました。');
  }
};

export const generateMeteredWordImage = async (
  env: AppEnv,
  user: DbUserRow,
  payload: {
    word: string;
    definition: string;
  },
  logContext?: AiUsageLogContext,
): Promise<string | null> => {
  return runMeteredAiAction(
    env,
    user,
    'generateWordImage',
    () => generateWordImage(env, payload),
    logContext,
    {
      providerAssetCount: 1,
      providerOutputUnits: 1,
    },
  );
};

const generateAIQuiz = async (env: AppEnv, payload: any): Promise<AIQuizQuestion[]> => {
  const ai = getAiClient(env);
  const targetWords = (Array.isArray(payload.targetWords) ? payload.targetWords : []) as WordData[];
  if (targetWords.length === 0) return [];

  try {
    const selectedWords = targetWords.slice(0, 5);
    const inputList = selectedWords.map((word) => ({ word: word.word, meaning: word.definition, id: word.id }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Create a multiple-choice quiz. Input: ${JSON.stringify(inputList)}. Output JSON.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              wordId: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctOption: { type: Type.STRING },
            },
            required: ['wordId', 'options', 'correctOption'],
          },
        },
      },
    });

    if (!response.text) return [];
    return JSON.parse(response.text) as AIQuizQuestion[];
  } catch (error) {
    handleAiError(error, 'AIクイズ生成に失敗しました。');
  }
};

const isGrammarQuestionMode = (value: unknown): value is GrammarQuestionMode => (
  value === 'GRAMMAR_CLOZE'
  || value === 'EN_WORD_ORDER'
  || value === 'JA_TRANSLATION_ORDER'
  || value === 'JA_TRANSLATION_INPUT'
);

const buildGrammarPracticePrompt = (
  words: WordData[],
  mode: GrammarQuestionMode,
  questionCount: number,
  userLevel: EnglishLevel,
  grammarScopeId?: GrammarCurriculumScopeId | null,
): string => {
  const grammarScope = grammarScopeId ? getGrammarCurriculumScope(grammarScopeId) : null;
  const modeInstruction = mode === 'GRAMMAR_CLOZE'
    ? [
      'Mode: GRAMMAR_CLOZE.',
      'Create a natural English sentence using the learned word or a grammatically correct inflected form.',
      'promptText must be the same sentence with exactly one blank written as ____.',
      'answer must be the blanked word or phrase.',
      'options must contain 3 or 4 short unique English options including answer. Prefer tense, number, or word-form distractors.',
      'orderedTokens should be an empty array.',
    ].join('\n')
    : mode === 'EN_WORD_ORDER'
      ? [
        'Mode: EN_WORD_ORDER.',
        'Create a natural English sentence using the learned word.',
        'orderedTokens must be the correct English word order split into 4 to 14 chips.',
        'Each orderedTokens value must be unique after lowercasing and removing punctuation.',
        'Do not rely on first-word capitalization or sentence-final punctuation as clues.',
        'answer must be the full English sentence.',
        'options should be an empty array.',
      ].join('\n')
      : mode === 'JA_TRANSLATION_ORDER'
        ? [
        'Mode: JA_TRANSLATION_ORDER.',
        'Create a natural English sentence using the learned word and a natural Japanese translation.',
        'orderedTokens must be the correct Japanese translation split into 2 to 8 meaningful chips.',
        'Each Japanese chip must be unique and should not rely on punctuation or bracket position as clues.',
        'sourceTranslation and answer must be the full natural Japanese translation.',
        'options should be an empty array.',
        ].join('\n')
        : [
          'Mode: JA_TRANSLATION_INPUT.',
          'Create a natural English sentence using the learned word and a natural Japanese translation.',
          'promptText and sourceSentence must be the complete English sentence.',
          'sourceTranslation and answer must be the full natural Japanese translation.',
          'options and orderedTokens should be empty arrays.',
        ].join('\n');

  const inputWords = words.map((word) => ({
    wordId: word.id,
    word: word.word,
    definition: word.definition,
    exampleSentence: word.exampleSentence || null,
    exampleMeaning: word.exampleMeaning || null,
  }));

  return `
You are an English grammar question writer for Japanese learners.
Generate exactly ${questionCount} questions for CEFR ${userLevel}.
${grammarScope ? `Grammar range: ${grammarScope.labelJa} (${grammarScope.labelEn}). Every sentence must primarily practice this range.` : 'Choose a basic grammar range that fits the sentence naturally.'}
Use only the provided wordId values. Generate at most one question per word.
Prefer the provided example sentence/meaning when it is natural; otherwise write a new short sentence.
Keep the sentence at i+1 difficulty: use the learned word plus mostly high-frequency A1-B1 words, and avoid long clauses unless the requested grammar range requires them.
For Japanese learners, preserve the English word-order pattern clearly enough to support the "主語 / 動詞 / 目的語" habit.
Keep content school-safe, non-political, and non-medical-advice. Do not include explanations outside JSON.
All Japanese text must be natural for a learner-facing app.

${modeInstruction}

Every item must have:
{
  "wordId": "one of the input wordId values",
  "mode": "${mode}",
  "promptText": "learner-facing question prompt",
  "sourceSentence": "complete English sentence",
  "sourceTranslation": "Japanese translation, or empty string when not needed",
  "answer": "correct answer text",
  "options": ["choice", "..."],
  "orderedTokens": ["correct", "order", "chips"],
  "grammarFocus": "short Japanese grammar label",
  "instruction": "short Japanese instruction"
}

Input words:
${JSON.stringify(inputWords)}
  `.trim();
};

const generateGrammarPracticeQuestions = async (
  env: AppEnv,
  payload: any,
  model = resolveGrammarPracticeModel(env),
  beforeAiGenerate?: (requestUnits: number) => Promise<void>,
  userId?: string,
): Promise<{
  questions: GeneratedWorksheetQuestion[];
  usedAi: boolean;
  generatedCount: number;
}> => {
  const mode = isGrammarQuestionMode(payload?.mode) ? payload.mode : null;
  const targetWords = (Array.isArray(payload?.targetWords) ? payload.targetWords : []) as WordData[];
  if (!mode || targetWords.length === 0) return { questions: [], usedAi: false, generatedCount: 0 };

  const requestedCount = Math.max(1, Math.min(10, Math.trunc(Number(payload?.questionCount || 5))));
  const userLevel = Object.values(EnglishLevel).includes(payload?.userLevel)
    ? payload.userLevel as EnglishLevel
    : EnglishLevel.B1;
  const grammarScopeId = typeof payload?.grammarScopeId === 'string'
    ? payload.grammarScopeId as GrammarCurriculumScopeId
    : null;
  const candidateWords = filterWorksheetQuestionCandidates(targetWords, mode).slice(0, requestedCount);
  if (candidateWords.length === 0) return { questions: [], usedAi: false, generatedCount: 0 };

  try {
    if (grammarScopeId) getGrammarCurriculumScope(grammarScopeId);
    const cbtSnapshot = env.DB
      ? await readCbtLearnerSnapshot(env, userId).catch(() => null)
      : null;
    let cachedQuestions: GeneratedWorksheetQuestion[] = [];
    if (env.DB) {
      try {
        cachedQuestions = await readReusableAiGrammarQuestions(env, {
          wordIds: candidateWords.map((word) => word.id),
          questionMode: mode,
          grammarScopeId,
          ...(cbtSnapshot?.difficultyBand || {}),
          limit: requestedCount,
        });
      } catch (cacheError) {
        console.warn('AI grammar cache read skipped:', cacheError);
      }
    }

    const cachedWordIds = new Set(cachedQuestions.map((question) => question.wordId));
    const missingWords = candidateWords.filter((word) => !cachedWordIds.has(word.id));
    const remainingCount = Math.max(0, requestedCount - cachedQuestions.length);
    if (remainingCount === 0 || missingWords.length === 0) {
      return {
        questions: cachedQuestions.slice(0, requestedCount),
        usedAi: false,
        generatedCount: 0,
      };
    }

    const aiRequestCount = Math.min(remainingCount, missingWords.length);
    await beforeAiGenerate?.(aiRequestCount);
    const ai = getAiClient(env);
    const response = await ai.models.generateContent({
      model,
      contents: buildGrammarPracticePrompt(missingWords, mode, aiRequestCount, userLevel, grammarScopeId),
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              wordId: { type: Type.STRING },
              mode: { type: Type.STRING, enum: [mode] },
              promptText: { type: Type.STRING },
              sourceSentence: { type: Type.STRING },
              sourceTranslation: { type: Type.STRING },
              answer: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              orderedTokens: { type: Type.ARRAY, items: { type: Type.STRING } },
              grammarFocus: { type: Type.STRING },
              instruction: { type: Type.STRING },
            },
            required: [
              'wordId',
              'mode',
              'promptText',
              'sourceSentence',
              'sourceTranslation',
              'answer',
              'options',
              'orderedTokens',
              'grammarFocus',
              'instruction',
            ],
          },
        },
      },
    });

    if (!response.text) return { questions: cachedQuestions, usedAi: false, generatedCount: 0 };
    const parsed = JSON.parse(response.text) as unknown;
    if (!Array.isArray(parsed)) return { questions: cachedQuestions, usedAi: false, generatedCount: 0 };
    const generatedQuestions = normalizeAiGrammarQuestionDrafts(
      parsed as AiGrammarQuestionDraft[],
      toWorksheetSourceWords(missingWords),
      mode,
      remainingCount,
      grammarScopeId,
    );
    const persistedGeneratedQuestions = env.DB
      ? await Promise.all(generatedQuestions.map(async (question) => {
        try {
          const row = await recordAiGeneratedProblem(env, {
            question,
            model,
            promptVersion: GRAMMAR_PRACTICE_PROMPT_VERSION,
            sourceText: `${question.wordId}:${question.mode}:${question.grammarScope?.scopeId || grammarScopeId || 'auto'}:${question.promptText}:${question.answer}`,
          });
          return {
            ...question,
            generatedProblemId: row.id,
            aiContentId: row.content_id,
          };
        } catch (cacheError) {
          console.warn('AI grammar cache write skipped:', cacheError);
          return question;
        }
      }))
      : generatedQuestions;
    return {
      questions: [...cachedQuestions, ...persistedGeneratedQuestions].slice(0, requestedCount),
      usedAi: persistedGeneratedQuestions.length > 0,
      generatedCount: persistedGeneratedQuestions.length,
    };
  } catch (error) {
    handleAiError(error, 'AI文法問題生成に失敗しました。');
  }
};

const clampScore = (value: unknown, min: number, max: number): number => {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
};

const toStringArray = (value: unknown, fallback: string[]): string[] => (
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
    : fallback
);

const normalizeTranslationFeedback = (
  parsed: any,
  payload: {
    sourceSentence?: string;
    expectedTranslation: string;
    userTranslation?: string;
    examTarget: TranslationExamTarget;
  },
): JapaneseTranslationFeedback => {
  const maxScore = 10;
  const criteria = Array.isArray(parsed?.criteria)
    ? parsed.criteria.slice(0, 4).map((criterion: any) => ({
      label: String(criterion?.label || '観点').slice(0, 24),
      score: clampScore(criterion?.score, 0, clampScore(criterion?.maxScore ?? 3, 1, 5)),
      maxScore: clampScore(criterion?.maxScore ?? 3, 1, 5),
      comment: String(criterion?.comment || '').trim().slice(0, 120),
    }))
    : [];
  const rawScore = criteria.length > 0
    ? criteria.reduce((sum, criterion) => sum + criterion.score, 0)
    : parsed?.score;
  const score = clampScore(rawScore, 0, maxScore);

  return {
    isCorrect: typeof parsed?.isCorrect === 'boolean' ? parsed.isCorrect : score >= 8,
    score,
    maxScore,
    verdictLabel: String(parsed?.verdictLabel || (score >= 8 ? '合格答案' : '要復習')).slice(0, 24),
    examTarget: payload.examTarget,
    sourceSentence: payload.sourceSentence,
    expectedTranslation: payload.expectedTranslation,
    userTranslation: payload.userTranslation,
    summaryJa: String(parsed?.summaryJa || '和訳を採点しました。').trim().slice(0, 180),
    strengths: toStringArray(parsed?.strengths, []),
    issues: toStringArray(parsed?.issues, score >= 8 ? [] : ['意味や文構造に確認点があります。']),
    improvedTranslation: String(parsed?.improvedTranslation || payload.expectedTranslation).trim().slice(0, 240),
    grammarAdviceJa: String(parsed?.grammarAdviceJa || '主語・動詞・修飾語の関係を確認しましょう。').trim().slice(0, 180),
    nextDrillJa: String(parsed?.nextDrillJa || '同じ英文を3ますで分けてから、もう一度訳しましょう。').trim().slice(0, 160),
    criteria: criteria.length > 0
      ? criteria
      : [
        { label: '意味', score: Math.min(score, 4), maxScore: 4, comment: '英文全体の意味を確認します。' },
        { label: '文法構造', score: Math.min(Math.max(score - 4, 0), 3), maxScore: 3, comment: '主語・動詞・修飾語の関係を確認します。' },
        { label: '受験答案らしさ', score: Math.min(Math.max(score - 7, 0), 3), maxScore: 3, comment: '採点者に伝わる自然な日本語へ整えます。' },
      ],
    usedAi: true,
  };
};

const evaluateJapaneseTranslationAnswer = async (
  env: AppEnv,
  payload: any,
  model = resolveTranslationFeedbackModel(env),
): Promise<JapaneseTranslationFeedback> => {
  const ai = getAiClient(env);
  const sourceSentence = String(payload?.sourceSentence || '').trim();
  const expectedTranslation = String(payload?.expectedTranslation || '').trim();
  const userTranslation = String(payload?.userTranslation || '').trim();
  const grammarScopeLabel = String(payload?.grammarScopeLabel || '').trim() || '文法範囲未指定';
  const examTarget = (
    payload?.examTarget === 'HIGH_SCHOOL_ENTRANCE'
    || payload?.examTarget === 'UNIVERSITY_ENTRANCE'
    || payload?.examTarget === 'GENERAL'
  )
    ? payload.examTarget as TranslationExamTarget
    : 'GENERAL';

  if (!sourceSentence || !expectedTranslation || !userTranslation) {
    throw new HttpError(400, '和訳フィードバックに必要な英文・正解例・解答が不足しています。');
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `
あなたは日本の高校受験・大学受験を見据えた英語講師です。
生徒の和訳を、単なる完全一致ではなく、意味・文法構造・答案日本語の観点で採点してください。

方針:
- 公式試験の認定判定ではなく、学習用フィードバックとして扱う。
- 正解例と語順や表現が違っても、意味と構造が保たれていれば部分点を与える。
- ただし、主語・動詞・否定・時制・受け身・比較・関係詞など、入試で失点しやすい構造の取り違えは明確に指摘する。
- 「知る→できる→自動化」に進むよう、最後に短い次の練習を1つ出す。
- 直訳の強制ではなく、採点者に伝わる自然な日本語へ整える。
- 3ます英語の観点で、必要なら「だれが / どうする / 何を」を使って助言する。

受験ターゲット: ${examTarget}
文法範囲: ${grammarScopeLabel}
英文: ${sourceSentence}
正解例: ${expectedTranslation}
生徒の解答: ${userTranslation}

JSONのみで返してください。
      `.trim(),
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            score: { type: Type.NUMBER },
            maxScore: { type: Type.NUMBER },
            verdictLabel: { type: Type.STRING },
            summaryJa: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            issues: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvedTranslation: { type: Type.STRING },
            grammarAdviceJa: { type: Type.STRING },
            nextDrillJa: { type: Type.STRING },
            criteria: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  maxScore: { type: Type.NUMBER },
                  comment: { type: Type.STRING },
                },
                required: ['label', 'score', 'maxScore', 'comment'],
              },
            },
          },
          required: [
            'isCorrect',
            'score',
            'maxScore',
            'verdictLabel',
            'summaryJa',
            'strengths',
            'issues',
            'improvedTranslation',
            'grammarAdviceJa',
            'nextDrillJa',
            'criteria',
          ],
        },
      },
    });

    if (!response.text) throw new Error('Empty response');
    return normalizeTranslationFeedback(JSON.parse(response.text), {
      sourceSentence,
      expectedTranslation,
      userTranslation,
      examTarget,
    });
  } catch (error) {
    handleAiError(error, 'AI和訳フィードバックに失敗しました。');
  }
};

const extractVocabularyFromText = async (env: AppEnv, payload: any): Promise<ExtractedResult> => {
  const ai = getAiClient(env);
  const rawText = String(payload.rawText || '');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        Task 1: Extract 10 important English words (CEFR A2-B2) from the text.
        Task 2: Summarize the "style" and "context" of this text in 1 short English sentence (e.g., "Casual conversation about hobbies", "Formal business email", "Lyrics of a love song").

        Text: """${rawText.slice(0, 5000)}"""

        Output JSON: { "words": [{word, definition}], "contextSummary": "..." }
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            words: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  definition: { type: Type.STRING },
                },
                required: ['word', 'definition'],
              },
            },
            contextSummary: { type: Type.STRING },
          },
          required: ['words', 'contextSummary'],
        },
      },
    });

    if (!response.text) throw new Error('Empty response');
    return JSON.parse(response.text) as ExtractedResult;
  } catch (error) {
    handleAiError(error, 'AIによるテキスト解析に失敗しました。');
  }
};

const extractVocabularyFromMedia = async (env: AppEnv, payload: any): Promise<ExtractedResult> => {
  const ai = getAiClient(env);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: payload.mimeType,
            data: payload.base64Data,
          },
        },
        {
          text: `
            You are an expert English tutor.
            1. Identify the 10 most important English vocabulary words in this image.
            2. Analyze the context/style of the content (e.g., "Textbook page about history", "Street sign", "Handwritten note").

            Output JSON: { "words": [{word, definition}], "contextSummary": "..." }
          `
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            words: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  definition: { type: Type.STRING },
                },
                required: ['word', 'definition'],
              }
            },
            contextSummary: { type: Type.STRING },
          },
          required: ['words', 'contextSummary'],
        },
      },
    });

    if (!response.text) throw new Error('Empty response');
    return JSON.parse(response.text) as ExtractedResult;
  } catch (error) {
    handleAiError(error, 'AIによる画像解析に失敗しました。');
  }
};

const generateLearningPlan = async (env: AppEnv, payload: any): Promise<LearningPlan | null> => {
  const ai = getAiClient(env);
  const grade = payload.grade as UserGrade;
  const level = payload.level as EnglishLevel;
  const availableBooks = (Array.isArray(payload.availableBooks) ? payload.availableBooks : []) as BookMetadata[];
  const learningPreference = (payload.learningPreference || null) as LearningPreference | null;

  try {
    const bookList = availableBooks.map((book) => ({
      id: book.id,
      title: book.title,
      priority: book.isPriority,
      source: book.catalogSource,
      accessScope: book.accessScope,
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        User Profile: Grade ${grade}, Level ${level}.
        Learning Preference: ${JSON.stringify(learningPreference || {})}.
        Available Books: ${JSON.stringify(bookList)}.

        Task: Create a personalized learning plan (Curriculum).
        1. Select the most appropriate books (Max 5) for this user's level, weak points, available study time, and target exam. Do not select everything.
        2. Determine a realistic daily word goal based on daily study minutes and weekly study days.
        3. Reflect urgency if exam_date is near, but do not output reckless word counts.
        4. Set a concrete goal description and target completion days.

        Output JSON.
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            goalDescription: { type: Type.STRING },
            targetDays: { type: Type.NUMBER },
            dailyWordGoal: { type: Type.NUMBER },
            selectedBookIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['goalDescription', 'targetDays', 'dailyWordGoal', 'selectedBookIds'],
        },
      },
    });

    if (!response.text) return null;
    const parsed = JSON.parse(response.text);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (parsed.targetDays || 30));

    return {
      uid: '',
      createdAt: Date.now(),
      targetDate: formatDateKey(targetDate),
      goalDescription: parsed.goalDescription,
      dailyWordGoal: parsed.dailyWordGoal,
      selectedBookIds: parsed.selectedBookIds,
      status: 'ACTIVE',
    };
  } catch (error) {
    handleAiError(error, '学習プラン生成に失敗しました。');
  }
};

const generateInstructorFollowUp = async (env: AppEnv, payload: any): Promise<InstructorFollowUpDraft> => {
  const ai = getAiClient(env);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        あなたは日本の学習塾で、生徒に寄り添う講師の代筆アシスタントです。

        講師名: ${payload.instructorName}
        生徒名: ${payload.studentName}
        離脱リスク: ${payload.riskLevel || StudentRiskLevel.WARNING}
        最終学習からの日数: ${payload.daysSinceActive ?? 0}
        習得単語数: ${payload.totalLearned ?? 0}
        現在のレベル: ${payload.currentLevel || '未診断'}
        補足指示: ${payload.customInstruction || 'やさしく背中を押す'}

        条件:
        1. 文頭を「${payload.instructorName}より:」で始める。
        2. 自然な日本語で 1〜2 文、80〜120 文字程度。
        3. 怒らず、具体的な次の一歩を 1 つだけ提案する。
        4. 生徒名は呼び捨てにしない。

        JSON で返す:
        { "message": "..." }
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
          },
          required: ['message'],
        },
      },
    });

    if (!response.text) throw new Error('Empty response');
    return JSON.parse(response.text) as InstructorFollowUpDraft;
  } catch (error) {
    handleAiError(error, '講師フォロー通知の生成に失敗しました。');
  }
};

const generateDiagnosticTest = async (env: AppEnv, payload: any): Promise<DiagnosticQuestion[]> => {
  const ai = getAiClient(env);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        Generate 5 English multiple-choice questions for a Japanese student (Grade: ${payload.grade}).
        Levels: Easy to Hard (A1 to B2).

        IMPORTANT RULES:
        1. The 'question' field MUST contain the instruction in JAPANESE followed by the English sentence.
        2. Ensure VARIETY in topics: Mix Science, Travel, Daily Conversation, Culture, and History.

        Output JSON.
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['MCQ'] },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { type: Type.STRING },
              level: { type: Type.STRING, enum: Object.values(EnglishLevel) },
            },
            required: ['id', 'type', 'question', 'options', 'answer', 'level'],
          },
        },
      },
    });

    if (!response.text) return [];
    return JSON.parse(response.text) as DiagnosticQuestion[];
  } catch (error) {
    handleAiError(error, '診断テスト生成に失敗しました。');
  }
};

const generateAdvancedDiagnosticTest = async (env: AppEnv, payload: any): Promise<DiagnosticQuestion[]> => {
  const ai = getAiClient(env);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `
        You are an expert linguist. Create a comprehensive 10-question English diagnostic test.
        Target: Japanese Student, Grade: ${payload.grade}.
        Past Performance Context: ${payload.learningHistorySummary}

        Requirements:
        - 4 Multiple Choice Questions (Vocabulary/Grammar). Instruction in Japanese.
        - 3 Fill-in-the-blank Questions (Cloze test). Provide options as empty array [].
        - 3 Writing/Translation Questions (Japanese to English or Short Essay). Provide options as empty array [].
        - Mix of CEFR levels (A1 to C1) to accurately find the ceiling.
        - Cover topics like Nature, Technology, Social Issues, and Fiction.

        Output JSON.
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['MCQ', 'FILL_IN', 'WRITING'] },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { type: Type.STRING },
              level: { type: Type.STRING, enum: Object.values(EnglishLevel) },
            },
            required: ['id', 'type', 'question', 'options', 'answer', 'level'],
          },
        },
      },
    });

    if (!response.text) return [];
    return JSON.parse(response.text) as DiagnosticQuestion[];
  } catch (error) {
    handleAiError(error, 'アドバンス診断テスト生成に失敗しました。');
  }
};

const evaluateAdvancedTest = async (env: AppEnv, payload: any): Promise<EnglishLevel> => {
  const ai = getAiClient(env);
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const userAnswers = payload.userAnswers || {};

  try {
    const transcript = questions.map((question: DiagnosticQuestion) => ({
      id: question.id,
      type: question.type,
      question: question.question,
      level: question.level,
      correctOrCriteria: question.answer,
      userAnswer: userAnswers[question.id] || '(No Answer)',
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `
        You are an English Level Assessor.
        Student Grade: ${payload.grade}.

        Review the following test transcript (Questions vs User Answers):
        ${JSON.stringify(transcript, null, 2)}

        Task:
        1. Grade each answer (Strictly for grammar/vocab, lenient for typos).
        2. Determine the overall CEFR Level (A1-C2) based on the difficulty of questions answered correctly.
        3. Ignore questions that were left blank.

        Return ONLY the CEFR Level as a string (e.g., "B1").
      `,
    });

    const text = response.text?.trim() || '';
    const foundLevel = Object.values(EnglishLevel).find((level) => text.includes(level));
    return foundLevel || EnglishLevel.A1;
  } catch (error) {
    handleAiError(error, 'アドバンス診断の採点に失敗しました。');
  }
};

export const handleAiAction = async (
  env: AppEnv,
  user: DbUserRow,
  body: AiRequestBody,
  logContext?: AiUsageLogContext,
): Promise<unknown> => {
  switch (body.action) {
    case 'generateGeminiSentence':
      return runMeteredAiAction(env, user, 'generateGeminiSentence', () => generateGeminiSentence(env, body.payload), logContext);
    case 'generateWordImage':
      return runMeteredAiAction(env, user, 'generateWordImage', () => generateWordImage(env, body.payload), logContext);
    case 'generateAIQuiz':
      return runMeteredAiAction(env, user, 'generateAIQuiz', () => generateAIQuiz(env, body.payload), logContext);
    case 'generateGrammarPracticeQuestions': {
      const model = resolveGrammarPracticeModel(env);
      const requestUnits = Math.max(1, Math.min(10, Math.trunc(Number(body.payload?.questionCount || 1))));
      const unitEstimate = getAiActionEstimate('generateGrammarPracticeQuestions').estimatedCostMilliYen;
      assertAiActionAllowed(user, 'generateGrammarPracticeQuestions');
      const result = await generateGrammarPracticeQuestions(
        env,
        body.payload,
        model,
        async (generatedUnits) => {
          await assertBudgetAvailable(
            env,
            user,
            'generateGrammarPracticeQuestions',
            unitEstimate * Math.max(1, generatedUnits),
          );
        },
        user.id,
      );
      await Promise.resolve(recordAiUsageEvent(env, user, {
        action: 'generateGrammarPracticeQuestions',
        usedAi: result.usedAi,
        model,
        estimatedCostMilliYen: result.usedAi ? unitEstimate * Math.max(1, result.generatedCount) : 0,
        estimatedProviderCostMilliYen: result.usedAi ? unitEstimate * Math.max(1, result.generatedCount) : 0,
        requestUnits,
        providerInputUnits: result.usedAi ? Math.max(1, result.generatedCount) : 0,
        providerOutputUnits: result.usedAi ? Math.max(1, result.generatedCount) : 0,
        ...(logContext ? { logContext } : {}),
      })).catch((error) => {
        console.warn('AI grammar usage event write skipped:', error);
      });
      return result.questions;
    }
    case 'evaluateJapaneseTranslationAnswer': {
      const model = resolveTranslationFeedbackModel(env);
      return runMeteredAiAction(
        env,
        user,
        'evaluateJapaneseTranslationAnswer',
        () => evaluateJapaneseTranslationAnswer(env, body.payload, model),
        logContext,
        {
          model,
          estimatedCostMilliYen: getAiActionEstimate('evaluateJapaneseTranslationAnswer').estimatedCostMilliYen,
          estimatedProviderCostMilliYen: getAiActionEstimate('evaluateJapaneseTranslationAnswer').estimatedCostMilliYen,
          requestUnits: 1,
          providerInputUnits: 1,
          providerOutputUnits: 1,
        },
      );
    }
    case 'extractVocabularyFromText':
      return runMeteredAiAction(env, user, 'extractVocabularyFromText', () => extractVocabularyFromText(env, body.payload), logContext);
    case 'extractVocabularyFromMedia':
      return runMeteredAiAction(env, user, 'extractVocabularyFromMedia', () => extractVocabularyFromMedia(env, body.payload), logContext);
    case 'generateLearningPlan':
      if (!env.GEMINI_API_KEY) {
        assertAiActionAllowed(user, 'generateLearningPlan');
        return buildFallbackLearningPlan({
          uid: user.id,
          grade: (body.payload?.grade || UserGrade.ADULT) as UserGrade,
          level: (body.payload?.level || EnglishLevel.B1) as EnglishLevel,
          availableBooks: Array.isArray(body.payload?.availableBooks) ? body.payload.availableBooks as BookMetadata[] : [],
          learningPreference: (body.payload?.learningPreference || null) as LearningPreference | null,
        });
      }
      return runMeteredAiAction(env, user, 'generateLearningPlan', () => generateLearningPlan(env, body.payload), logContext);
    case 'generateInstructorFollowUp':
      return runMeteredAiAction(env, user, 'generateInstructorFollowUp', () => generateInstructorFollowUp(env, body.payload), logContext);
    case 'generateDiagnosticTest':
      return runMeteredAiAction(env, user, 'generateDiagnosticTest', () => generateDiagnosticTest(env, body.payload), logContext);
    case 'generateAdvancedDiagnosticTest':
      return runMeteredAiAction(env, user, 'generateAdvancedDiagnosticTest', () => generateAdvancedDiagnosticTest(env, body.payload), logContext);
    case 'evaluateAdvancedTest':
      return runMeteredAiAction(env, user, 'evaluateAdvancedTest', () => evaluateAdvancedTest(env, body.payload), logContext);
    default:
      throw new HttpError(404, '未知のAI操作です。');
  }
};
