import { BookMetadata, EnglishLevel, LearningPlan, LearningPreference, StudentRiskLevel, UserGrade, WordData, type GrammarCurriculumScopeId, WorksheetQuestionMode } from '../types';
import { DIAGNOSTIC_QUESTIONS as STATIC_DIAGNOSTIC_QUESTIONS } from '../data/diagnostic';
import { buildFallbackLearningPlan } from '../utils/learningPlan';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';
import { ApiError, apiPost } from './apiClient';

export interface GeneratedContext {
  english: string;
  japanese: string;
}

export interface AIQuizQuestion {
  wordId: string;
  options: string[];
  correctOption: string;
}

export interface ExtractedResult {
  words: { word: string; definition: string; }[];
  contextSummary: string;
}

export interface InstructorFollowUpDraft {
  message: string;
}

export interface DiagnosticQuestion {
  id: string;
  type: 'MCQ' | 'FILL_IN' | 'WRITING';
  question: string;
  options?: string[];
  answer?: string;
  level: EnglishLevel;
}

const callAi = async <TResponse, TPayload = unknown>(action: string, payload?: TPayload): Promise<TResponse> => {
  return apiPost<TResponse>('/api/ai', { action, payload });
};

const isRateLimitError = (error: unknown): boolean => error instanceof ApiError && error.status === 429;
const isAccessDeniedError = (error: unknown): boolean => error instanceof ApiError && error.status === 403;
const shouldUseFallbackLearningPlan = (error: unknown): boolean => {
  if (isAiUnavailableError(error) || isRateLimitError(error)) return true;
  return isAccessDeniedError(error);
};

export const isAiUnavailableError = (error: unknown): boolean => {
  if (error instanceof ApiError && error.status === 503) return true;
  if (error instanceof Error) {
    return error.message.includes('GEMINI_API_KEY') || error.message.includes('AI教材化はまだ利用できません');
  }
  return false;
};

const STATIC_STANDARD_DIAGNOSTIC_IDS = ['q1', 'q3', 'q4', 'q6', 'q10'] as const;
const STATIC_ADVANCED_DIAGNOSTIC_IDS = ['q1', 'q3', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12'] as const;
const LEVEL_WEIGHTS: Record<EnglishLevel, number> = {
  [EnglishLevel.A1]: 1,
  [EnglishLevel.A2]: 2,
  [EnglishLevel.B1]: 3,
  [EnglishLevel.B2]: 4,
  [EnglishLevel.C1]: 5,
  [EnglishLevel.C2]: 6,
};

const STATIC_DIAGNOSTIC_MAP = new Map(STATIC_DIAGNOSTIC_QUESTIONS.map((question) => [question.id, question]));

const shouldUseStaticDiagnosticFallback = (error: unknown): boolean => {
  if (isAiUnavailableError(error) || isRateLimitError(error) || isAccessDeniedError(error)) return true;
  return error instanceof ApiError && error.status === 502;
};

const toServiceDiagnosticQuestion = (questionId: string): DiagnosticQuestion | null => {
  const question = STATIC_DIAGNOSTIC_MAP.get(questionId);
  if (!question) return null;

  return {
    id: question.id,
    type: 'MCQ',
    question: question.prompt ? `${question.prompt}\n\n${question.question}` : question.question,
    options: question.options,
    answer: question.answer,
    level: question.level,
  };
};

const buildStaticDiagnosticTest = (questionIds: readonly string[]): DiagnosticQuestion[] => {
  return questionIds
    .map((questionId) => toServiceDiagnosticQuestion(questionId))
    .filter((question): question is DiagnosticQuestion => Boolean(question));
};

const normalizeAnswer = (value: string): string => {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const estimateAdvancedDiagnosticLevel = (
  questions: DiagnosticQuestion[],
  userAnswers: Record<string, string>
): EnglishLevel => {
  const correctByLevel: Record<EnglishLevel, number> = {
    [EnglishLevel.A1]: 0,
    [EnglishLevel.A2]: 0,
    [EnglishLevel.B1]: 0,
    [EnglishLevel.B2]: 0,
    [EnglishLevel.C1]: 0,
    [EnglishLevel.C2]: 0,
  };
  let weightedScore = 0;
  let correctCount = 0;

  questions.forEach((question) => {
    const answer = typeof userAnswers[question.id] === 'string' ? userAnswers[question.id] : '';
    if (!answer || !question.answer) return;

    if (normalizeAnswer(answer) === normalizeAnswer(question.answer)) {
      correctByLevel[question.level] += 1;
      weightedScore += LEVEL_WEIGHTS[question.level];
      correctCount += 1;
    }
  });

  if (weightedScore >= 24 && correctByLevel[EnglishLevel.C1] >= 1 && correctByLevel[EnglishLevel.B2] >= 1) {
    return EnglishLevel.C1;
  }
  if (weightedScore >= 16 && correctByLevel[EnglishLevel.B2] >= 1 && correctByLevel[EnglishLevel.B1] >= 1) {
    return EnglishLevel.B2;
  }
  if (weightedScore >= 9 && correctByLevel[EnglishLevel.B1] >= 1) {
    return EnglishLevel.B1;
  }
  if (weightedScore >= 4 && correctByLevel[EnglishLevel.A2] >= 1) {
    return EnglishLevel.A2;
  }
  return EnglishLevel.A1;
};

export const generateGeminiSentence = async (
  word: string,
  definition: string,
  userLevel: EnglishLevel = EnglishLevel.B1,
  sourceContext?: string
): Promise<GeneratedContext | null> => {
  try {
    return await callAi<GeneratedContext, { word: string; definition: string; userLevel: EnglishLevel; sourceContext?: string }>('generateGeminiSentence', {
      word,
      definition,
      userLevel,
      sourceContext,
    });
  } catch (error) {
    if (isRateLimitError(error)) return null;
    console.error('Sentence generation failed:', error);
    return null;
  }
};

export const generateWordImage = async (word: string, definition: string): Promise<string | null> => {
  try {
    return await callAi<string | null, { word: string; definition: string }>('generateWordImage', { word, definition });
  } catch (error) {
    if (isRateLimitError(error)) {
      return null;
    }
    console.error('Image generation failed:', error);
    return null;
  }
};

export const generateAIQuiz = async (targetWords: WordData[]): Promise<AIQuizQuestion[]> => {
  if (targetWords.length === 0) return [];

  try {
    return await callAi<AIQuizQuestion[], { targetWords: WordData[] }>('generateAIQuiz', { targetWords });
  } catch (error) {
    if (!isRateLimitError(error)) {
      console.error('AI quiz generation failed:', error);
    }
    return [];
  }
};

export const generateGrammarPracticeQuestions = async (
  targetWords: WordData[],
  mode: Extract<WorksheetQuestionMode, 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_ORDER' | 'JA_TRANSLATION_INPUT'>,
  questionCount: number,
  userLevel: EnglishLevel = EnglishLevel.B1,
  grammarScopeId?: GrammarCurriculumScopeId,
): Promise<GeneratedWorksheetQuestion[]> => {
  if (targetWords.length === 0 || questionCount <= 0) return [];

  try {
    return await callAi<GeneratedWorksheetQuestion[], {
      targetWords: WordData[];
      mode: WorksheetQuestionMode;
      questionCount: number;
      userLevel: EnglishLevel;
      grammarScopeId?: GrammarCurriculumScopeId;
    }>('generateGrammarPracticeQuestions', {
      targetWords,
      mode,
      questionCount,
      userLevel,
      grammarScopeId,
    });
  } catch (error) {
    if (!isRateLimitError(error) && !isAiUnavailableError(error) && !isAccessDeniedError(error)) {
      console.error('AI grammar practice generation failed:', error);
    }
    return [];
  }
};

export const extractVocabularyFromText = async (rawText: string): Promise<ExtractedResult> => {
  try {
    return await callAi<ExtractedResult, { rawText: string }>('extractVocabularyFromText', { rawText });
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new Error('AIの利用制限(RPM)に達しました。1分ほど待ってから再試行してください。(Error: 429)');
    }
    if (isAiUnavailableError(error)) {
      throw new Error('AI教材化はまだ利用できません。Gemini 設定後に再試行してください。');
    }
    throw new Error(error instanceof Error ? error.message : 'AIによる抽出に失敗しました。');
  }
};

export const extractVocabularyFromMedia = async (base64Data: string, mimeType: string): Promise<ExtractedResult> => {
  try {
    return await callAi<ExtractedResult, { base64Data: string; mimeType: string }>('extractVocabularyFromMedia', { base64Data, mimeType });
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new Error('AIの利用制限(RPM)に達しました。1分ほど待ってから再試行してください。(Error: 429)');
    }
    if (isAiUnavailableError(error)) {
      throw new Error('AI教材化はまだ利用できません。Gemini 設定後に再試行してください。');
    }
    throw new Error(error instanceof Error ? error.message : 'AIによる画像解析に失敗しました。');
  }
};

export const generateLearningPlan = async (
  grade: UserGrade,
  level: EnglishLevel,
  availableBooks: BookMetadata[],
  learningPreference?: LearningPreference | null,
): Promise<LearningPlan | null> => {
  if (availableBooks.length === 0) return null;

  try {
    return await callAi<LearningPlan | null, { grade: UserGrade; level: EnglishLevel; availableBooks: BookMetadata[]; learningPreference?: LearningPreference | null }>('generateLearningPlan', {
      grade,
      level,
      availableBooks,
      learningPreference,
    });
  } catch (error) {
    if (shouldUseFallbackLearningPlan(error)) {
      return buildFallbackLearningPlan({
        uid: '',
        grade,
        level,
        availableBooks,
        learningPreference,
      });
    }
    console.error('Plan generation failed:', error);
    return null;
  }
};

export const generateInstructorFollowUp = async (input: {
  instructorName: string;
  studentName: string;
  riskLevel: StudentRiskLevel;
  daysSinceActive: number;
  totalLearned: number;
  currentLevel?: EnglishLevel;
  customInstruction?: string;
}): Promise<InstructorFollowUpDraft | null> => {
  try {
    return await callAi<InstructorFollowUpDraft, typeof input>('generateInstructorFollowUp', input);
  } catch (error) {
    if (!isRateLimitError(error)) {
      console.error('Instructor follow-up generation failed:', error);
    }
    return null;
  }
};

export const generateDiagnosticTest = async (grade: UserGrade): Promise<DiagnosticQuestion[]> => {
  try {
    return await callAi<DiagnosticQuestion[], { grade: UserGrade }>('generateDiagnosticTest', { grade });
  } catch (error) {
    if (!shouldUseStaticDiagnosticFallback(error)) {
      console.error('Diagnostic test generation failed:', error);
    }
    return buildStaticDiagnosticTest(STATIC_STANDARD_DIAGNOSTIC_IDS);
  }
};

export const generateAdvancedDiagnosticTest = async (grade: UserGrade, learningHistorySummary: string): Promise<DiagnosticQuestion[]> => {
  try {
    return await callAi<DiagnosticQuestion[], { grade: UserGrade; learningHistorySummary: string }>('generateAdvancedDiagnosticTest', {
      grade,
      learningHistorySummary,
    });
  } catch (error) {
    if (!shouldUseStaticDiagnosticFallback(error)) {
      console.error('Advanced diagnostic test generation failed:', error);
    }
    return buildStaticDiagnosticTest(STATIC_ADVANCED_DIAGNOSTIC_IDS);
  }
};

export const evaluateAdvancedTest = async (
  grade: UserGrade,
  questions: DiagnosticQuestion[],
  userAnswers: Record<string, string>
): Promise<EnglishLevel> => {
  try {
    return await callAi<EnglishLevel, { grade: UserGrade; questions: DiagnosticQuestion[]; userAnswers: Record<string, string> }>('evaluateAdvancedTest', {
      grade,
      questions,
      userAnswers,
    });
  } catch (error) {
    if (!shouldUseStaticDiagnosticFallback(error)) {
      console.error('Advanced test evaluation failed:', error);
    }
    return estimateAdvancedDiagnosticLevel(questions, userAnswers);
  }
};
