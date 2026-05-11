import {
  EnglishLevel,
  StudentRiskLevel,
  UserGrade,
  type BookMetadata,
  type GrammarCurriculumScopeId,
  type JapaneseTranslationFeedback,
  type LearningPlan,
  type LearningPreference,
  LearningPreferenceIntensity,
  type TranslationExamTarget,
  type WordData,
  type WorksheetQuestionMode,
} from '../types';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';

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

export type GrammarQuestionMode = Extract<
  WorksheetQuestionMode,
  'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_ORDER' | 'JA_TRANSLATION_INPUT'
>;

export interface GenerateGeminiSentencePayload {
  word: string;
  definition: string;
  userLevel?: EnglishLevel;
  sourceContext?: string;
}

export interface GenerateWordImagePayload {
  word: string;
  definition: string;
}

export interface GenerateAIQuizPayload {
  targetWords: WordData[];
}

export interface GenerateGrammarPracticeQuestionsPayload {
  targetWords: WordData[];
  mode: GrammarQuestionMode;
  questionCount: number;
  userLevel?: EnglishLevel;
  grammarScopeId?: GrammarCurriculumScopeId;
}

export interface EvaluateJapaneseTranslationAnswerPayload {
  sourceSentence: string;
  expectedTranslation: string;
  userTranslation: string;
  grammarScopeLabel?: string;
  grammarScopeId?: GrammarCurriculumScopeId;
  examTarget?: TranslationExamTarget;
}

export interface ExtractVocabularyFromTextPayload {
  rawText: string;
}

export interface ExtractVocabularyFromMediaPayload {
  base64Data: string;
  mimeType: string;
}

export interface GenerateLearningPlanPayload {
  grade: UserGrade;
  level: EnglishLevel;
  availableBooks: BookMetadata[];
  learningPreference?: LearningPreference | null;
}

export interface GenerateInstructorFollowUpPayload {
  instructorName: string;
  studentName: string;
  riskLevel: StudentRiskLevel;
  daysSinceActive: number;
  totalLearned: number;
  currentLevel?: EnglishLevel;
  customInstruction?: string;
}

export interface GenerateDiagnosticTestPayload {
  grade: UserGrade;
}

export interface GenerateAdvancedDiagnosticTestPayload {
  grade: UserGrade;
  learningHistorySummary: string;
}

export interface EvaluateAdvancedTestPayload {
  grade: UserGrade;
  questions: DiagnosticQuestion[];
  userAnswers: Record<string, string>;
}

export interface AiActionMap {
  generateGeminiSentence: {
    payload: GenerateGeminiSentencePayload;
    response: GeneratedContext;
  };
  generateWordImage: {
    payload: GenerateWordImagePayload;
    response: string | null;
  };
  generateAIQuiz: {
    payload: GenerateAIQuizPayload;
    response: AIQuizQuestion[];
  };
  generateGrammarPracticeQuestions: {
    payload: GenerateGrammarPracticeQuestionsPayload;
    response: GeneratedWorksheetQuestion[];
  };
  evaluateJapaneseTranslationAnswer: {
    payload: EvaluateJapaneseTranslationAnswerPayload;
    response: JapaneseTranslationFeedback;
  };
  extractVocabularyFromText: {
    payload: ExtractVocabularyFromTextPayload;
    response: ExtractedResult;
  };
  extractVocabularyFromMedia: {
    payload: ExtractVocabularyFromMediaPayload;
    response: ExtractedResult;
  };
  generateLearningPlan: {
    payload: GenerateLearningPlanPayload;
    response: LearningPlan | null;
  };
  generateInstructorFollowUp: {
    payload: GenerateInstructorFollowUpPayload;
    response: InstructorFollowUpDraft;
  };
  generateDiagnosticTest: {
    payload: GenerateDiagnosticTestPayload;
    response: DiagnosticQuestion[];
  };
  generateAdvancedDiagnosticTest: {
    payload: GenerateAdvancedDiagnosticTestPayload;
    response: DiagnosticQuestion[];
  };
  evaluateAdvancedTest: {
    payload: EvaluateAdvancedTestPayload;
    response: EnglishLevel;
  };
}

export type AiAction = keyof AiActionMap;
export type AiActionPayload<TAction extends AiAction> = AiActionMap[TAction]['payload'];
export type AiActionResponse<TAction extends AiAction> = AiActionMap[TAction]['response'];
export type AiActionRequest<TAction extends AiAction> = {
  action: TAction;
  payload: AiActionPayload<TAction>;
};
export type AnyAiActionRequest = {
  [TAction in AiAction]: AiActionRequest<TAction>;
}[AiAction];

const AI_ACTIONS = [
  'generateGeminiSentence',
  'generateWordImage',
  'generateAIQuiz',
  'generateGrammarPracticeQuestions',
  'evaluateJapaneseTranslationAnswer',
  'extractVocabularyFromText',
  'extractVocabularyFromMedia',
  'generateLearningPlan',
  'generateInstructorFollowUp',
  'generateDiagnosticTest',
  'generateAdvancedDiagnosticTest',
  'evaluateAdvancedTest',
] as const satisfies readonly AiAction[];

const AI_ACTION_SET = new Set<string>(AI_ACTIONS);
const GRAMMAR_MODES = new Set<string>([
  'GRAMMAR_CLOZE',
  'EN_WORD_ORDER',
  'JA_TRANSLATION_ORDER',
  'JA_TRANSLATION_INPUT',
]);
const EXAM_TARGETS = new Set<string>([
  'HIGH_SCHOOL_ENTRANCE',
  'UNIVERSITY_ENTRANCE',
  'GENERAL',
]);
const DIAGNOSTIC_TYPES = new Set<string>(['MCQ', 'FILL_IN', 'WRITING']);

const MAX_SHORT_TEXT_CHARS = 240;
const MAX_MEDIUM_TEXT_CHARS = 1_000;
const MAX_LONG_TEXT_CHARS = 5_000;
const MAX_RAW_TEXT_CHARS = 20_000;
const MAX_BASE64_MEDIA_CHARS = 6_000_000;
const MAX_WORDS_PER_AI_REQUEST = 50;
const MAX_GRAMMAR_QUESTION_COUNT = 10;
const MAX_AVAILABLE_BOOKS = 200;
const MAX_DIAGNOSTIC_QUESTIONS = 20;
const MAX_USER_ANSWERS = 50;

export class AiActionValidationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AiActionValidationError';
    this.status = status;
  }
}

const fail = (message: string, status = 400): never => {
  throw new AiActionValidationError(status, message);
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const asPayloadRecord = (value: unknown, action: AiAction): Record<string, unknown> => {
  if (!isRecord(value)) {
    fail(`${action} の payload が不正です。`);
  }
  return value as Record<string, unknown>;
};

const readString = (
  source: Record<string, unknown>,
  key: string,
  options: { max: number; required?: boolean; label?: string } = { max: MAX_SHORT_TEXT_CHARS },
): string | undefined => {
  const value = source[key];
  const label = options.label || key;
  if (value == null || value === '') {
    if (options.required) fail(`${label} は必須です。`);
    return undefined;
  }
  if (typeof value !== 'string') {
    fail(`${label} は文字列で指定してください。`);
  }
  const trimmed = (value as string).trim();
  if (!trimmed) {
    if (options.required) fail(`${label} は1文字以上で指定してください。`);
    return undefined;
  }
  if (trimmed.length > options.max) {
    fail(`${label} は${options.max}文字以内で指定してください。`);
  }
  return trimmed;
};

const readNumber = (
  source: Record<string, unknown>,
  key: string,
  options: { min: number; max: number; integer?: boolean; required?: boolean; label?: string },
): number | undefined => {
  const value = source[key];
  const label = options.label || key;
  if (value == null || value === '') {
    if (options.required) fail(`${label} は必須です。`);
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} は数値で指定してください。`);
  }
  const numeric = value as number;
  const normalized = options.integer ? Math.trunc(numeric) : numeric;
  if (options.integer && normalized !== numeric) {
    fail(`${label} は整数で指定してください。`);
  }
  if (normalized < options.min || normalized > options.max) {
    fail(`${label} は${options.min}以上${options.max}以下で指定してください。`);
  }
  return normalized;
};

const readEnum = <T extends string>(
  source: Record<string, unknown>,
  key: string,
  values: readonly T[],
  options: { required?: boolean; label?: string } = {},
): T | undefined => {
  const value = source[key];
  const label = options.label || key;
  if (value == null || value === '') {
    if (options.required) fail(`${label} は必須です。`);
    return undefined;
  }
  if (typeof value !== 'string' || !values.includes(value as T)) {
    fail(`${label} の値が不正です。`);
  }
  return value as T;
};

const readStringRecord = (
  source: Record<string, unknown>,
  key: string,
  options: { maxKeys: number; maxValueLength: number },
): Record<string, string> => {
  const value = source[key];
  if (!isRecord(value)) {
    fail(`${key} はオブジェクトで指定してください。`);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > options.maxKeys) {
    fail(`${key} は${options.maxKeys}件以内で指定してください。`);
  }
  return Object.fromEntries(entries.map(([entryKey, entryValue]) => {
    if (typeof entryValue !== 'string') {
      fail(`${key}.${entryKey} は文字列で指定してください。`);
    }
    const text = entryValue as string;
    if (text.length > options.maxValueLength) {
      fail(`${key}.${entryKey} は${options.maxValueLength}文字以内で指定してください。`);
    }
    return [entryKey, text.trim()];
  }));
};

const readArray = (
  source: Record<string, unknown>,
  key: string,
  options: { max: number; min?: number; label?: string },
): unknown[] => {
  const value = source[key];
  const label = options.label || key;
  if (!Array.isArray(value)) {
    fail(`${label} は配列で指定してください。`);
  }
  const items = value as unknown[];
  if (items.length < (options.min ?? 0)) {
    fail(`${label} は${options.min}件以上で指定してください。`);
  }
  if (items.length > options.max) {
    fail(`${label} は${options.max}件以内で指定してください。`);
  }
  return items;
};

const validateWord = (value: unknown, label: string): WordData => {
  if (!isRecord(value)) {
    fail(`${label} が不正です。`);
  }
  const record = value as Record<string, unknown>;
  const id = readString(record, 'id', { required: true, max: MAX_SHORT_TEXT_CHARS, label: `${label}.id` });
  const word = readString(record, 'word', { required: true, max: MAX_SHORT_TEXT_CHARS, label: `${label}.word` });
  const definition = readString(record, 'definition', { required: true, max: MAX_MEDIUM_TEXT_CHARS, label: `${label}.definition` });
  const bookId = readString(record, 'bookId', { max: MAX_SHORT_TEXT_CHARS, label: `${label}.bookId` }) || '';
  const number = typeof record.number === 'number' && Number.isFinite(record.number) ? record.number : 0;
  return {
    ...(value as Partial<WordData>),
    id,
    word,
    definition,
    bookId,
    number,
    exampleSentence: readString(record, 'exampleSentence', { max: MAX_LONG_TEXT_CHARS, label: `${label}.exampleSentence` }) ?? (record.exampleSentence as string | null | undefined),
    exampleMeaning: readString(record, 'exampleMeaning', { max: MAX_LONG_TEXT_CHARS, label: `${label}.exampleMeaning` }) ?? (record.exampleMeaning as string | null | undefined),
  } as WordData;
};

const validateWords = (payload: Record<string, unknown>, max = MAX_WORDS_PER_AI_REQUEST): WordData[] => (
  readArray(payload, 'targetWords', { min: 1, max }).map((word, index) => validateWord(word, `targetWords[${index}]`))
);

const validateBook = (value: unknown, label: string): BookMetadata => {
  if (!isRecord(value)) {
    fail(`${label} が不正です。`);
  }
  const record = value as Record<string, unknown>;
  return {
    ...(value as Partial<BookMetadata>),
    id: readString(record, 'id', { required: true, max: MAX_SHORT_TEXT_CHARS, label: `${label}.id` }),
    title: readString(record, 'title', { required: true, max: MAX_MEDIUM_TEXT_CHARS, label: `${label}.title` }),
    wordCount: readNumber(record, 'wordCount', { required: true, min: 0, max: 100_000, integer: true, label: `${label}.wordCount` }) || 0,
    isPriority: Boolean(record.isPriority),
    description: readString(record, 'description', { max: MAX_LONG_TEXT_CHARS, label: `${label}.description` }),
    sourceContext: readString(record, 'sourceContext', { max: MAX_LONG_TEXT_CHARS, label: `${label}.sourceContext` }),
  } as BookMetadata;
};

const validateLearningPreference = (value: unknown): LearningPreference | null | undefined => {
  if (value == null) return value as null | undefined;
  if (!isRecord(value)) {
    fail('learningPreference が不正です。');
  }
  const record = value as Record<string, unknown>;
  return {
    ...(value as Partial<LearningPreference>),
    targetExam: readString(record, 'targetExam', { required: true, max: MAX_MEDIUM_TEXT_CHARS, label: 'learningPreference.targetExam' }),
    targetScore: readString(record, 'targetScore', { required: true, max: MAX_MEDIUM_TEXT_CHARS, label: 'learningPreference.targetScore' }),
    examDate: readString(record, 'examDate', { max: MAX_SHORT_TEXT_CHARS, label: 'learningPreference.examDate' }),
    weeklyStudyDays: readNumber(record, 'weeklyStudyDays', { required: true, min: 0, max: 7, integer: true, label: 'learningPreference.weeklyStudyDays' }) || 0,
    dailyStudyMinutes: readNumber(record, 'dailyStudyMinutes', { required: true, min: 0, max: 600, integer: true, label: 'learningPreference.dailyStudyMinutes' }) || 0,
    weakSkillFocus: readString(record, 'weakSkillFocus', { required: true, max: MAX_LONG_TEXT_CHARS, label: 'learningPreference.weakSkillFocus' }),
    motivationNote: readString(record, 'motivationNote', { required: true, max: MAX_LONG_TEXT_CHARS, label: 'learningPreference.motivationNote' }),
    intensity: readEnum(record, 'intensity', Object.values(LearningPreferenceIntensity), { required: true, label: 'learningPreference.intensity' }),
  } as LearningPreference;
};

const validateDiagnosticQuestion = (value: unknown, label: string): DiagnosticQuestion => {
  if (!isRecord(value)) {
    fail(`${label} が不正です。`);
  }
  const record = value as Record<string, unknown>;
  const questionType = readString(record, 'type', { required: true, max: MAX_SHORT_TEXT_CHARS, label: `${label}.type` });
  if (!DIAGNOSTIC_TYPES.has(questionType)) {
    fail(`${label}.type の値が不正です。`);
  }
  const options = record.options == null
    ? undefined
    : readArray(record, 'options', { max: 8, label: `${label}.options` }).map((option, index) => {
      const optionText = typeof option === 'string' ? option : '';
      if (!optionText || optionText.length > MAX_MEDIUM_TEXT_CHARS) {
        fail(`${label}.options[${index}] が不正です。`);
      }
      return optionText.trim();
    });
  return {
    id: readString(record, 'id', { required: true, max: MAX_SHORT_TEXT_CHARS, label: `${label}.id` }),
    type: questionType as DiagnosticQuestion['type'],
    question: readString(record, 'question', { required: true, max: MAX_LONG_TEXT_CHARS, label: `${label}.question` }),
    options,
    answer: readString(record, 'answer', { max: MAX_LONG_TEXT_CHARS, label: `${label}.answer` }),
    level: readEnum(record, 'level', Object.values(EnglishLevel), { required: true, label: `${label}.level` }),
  } as DiagnosticQuestion;
};

const validatePayload = <TAction extends AiAction>(
  action: TAction,
  payload: unknown,
): AiActionPayload<TAction> => {
  const source = asPayloadRecord(payload, action);
  switch (action) {
    case 'generateGeminiSentence':
      return {
        word: readString(source, 'word', { required: true, max: MAX_SHORT_TEXT_CHARS }),
        definition: readString(source, 'definition', { required: true, max: MAX_MEDIUM_TEXT_CHARS }),
        userLevel: readEnum(source, 'userLevel', Object.values(EnglishLevel)),
        sourceContext: readString(source, 'sourceContext', { max: MAX_LONG_TEXT_CHARS }),
      } as AiActionPayload<TAction>;
    case 'generateWordImage':
      return {
        word: readString(source, 'word', { required: true, max: MAX_SHORT_TEXT_CHARS }),
        definition: readString(source, 'definition', { required: true, max: MAX_MEDIUM_TEXT_CHARS }),
      } as AiActionPayload<TAction>;
    case 'generateAIQuiz':
      return {
        targetWords: validateWords(source),
      } as AiActionPayload<TAction>;
    case 'generateGrammarPracticeQuestions': {
      const mode = readString(source, 'mode', { required: true, max: MAX_SHORT_TEXT_CHARS });
      if (!GRAMMAR_MODES.has(mode)) {
        fail('mode の値が不正です。');
      }
      return {
        targetWords: validateWords(source),
        mode: mode as GrammarQuestionMode,
        questionCount: readNumber(source, 'questionCount', {
          required: true,
          min: 1,
          max: MAX_GRAMMAR_QUESTION_COUNT,
          integer: true,
        }) || 1,
        userLevel: readEnum(source, 'userLevel', Object.values(EnglishLevel)),
        grammarScopeId: readString(source, 'grammarScopeId', {
          max: MAX_SHORT_TEXT_CHARS,
        }) as GrammarCurriculumScopeId | undefined,
      } as AiActionPayload<TAction>;
    }
    case 'evaluateJapaneseTranslationAnswer': {
      const examTarget = readString(source, 'examTarget', { max: MAX_SHORT_TEXT_CHARS });
      if (examTarget && !EXAM_TARGETS.has(examTarget)) {
        fail('examTarget の値が不正です。');
      }
      return {
        sourceSentence: readString(source, 'sourceSentence', { required: true, max: MAX_LONG_TEXT_CHARS }),
        expectedTranslation: readString(source, 'expectedTranslation', { required: true, max: MAX_LONG_TEXT_CHARS }),
        userTranslation: readString(source, 'userTranslation', { required: true, max: MAX_LONG_TEXT_CHARS }),
        grammarScopeLabel: readString(source, 'grammarScopeLabel', { max: MAX_MEDIUM_TEXT_CHARS }),
        grammarScopeId: readString(source, 'grammarScopeId', { max: MAX_SHORT_TEXT_CHARS }) as GrammarCurriculumScopeId | undefined,
        examTarget: examTarget as TranslationExamTarget | undefined,
      } as AiActionPayload<TAction>;
    }
    case 'extractVocabularyFromText':
      return {
        rawText: readString(source, 'rawText', { required: true, max: MAX_RAW_TEXT_CHARS }),
      } as AiActionPayload<TAction>;
    case 'extractVocabularyFromMedia':
      return {
        base64Data: readString(source, 'base64Data', { required: true, max: MAX_BASE64_MEDIA_CHARS }),
        mimeType: readString(source, 'mimeType', { required: true, max: MAX_SHORT_TEXT_CHARS }),
      } as AiActionPayload<TAction>;
    case 'generateLearningPlan':
      return {
        grade: readEnum(source, 'grade', Object.values(UserGrade), { required: true }),
        level: readEnum(source, 'level', Object.values(EnglishLevel), { required: true }),
        availableBooks: readArray(source, 'availableBooks', { max: MAX_AVAILABLE_BOOKS }).map((book, index) => validateBook(book, `availableBooks[${index}]`)),
        learningPreference: validateLearningPreference(source.learningPreference),
      } as AiActionPayload<TAction>;
    case 'generateInstructorFollowUp':
      return {
        instructorName: readString(source, 'instructorName', { required: true, max: MAX_SHORT_TEXT_CHARS }),
        studentName: readString(source, 'studentName', { required: true, max: MAX_SHORT_TEXT_CHARS }),
        riskLevel: readEnum(source, 'riskLevel', Object.values(StudentRiskLevel), { required: true }),
        daysSinceActive: readNumber(source, 'daysSinceActive', { required: true, min: 0, max: 3_650, integer: true }) || 0,
        totalLearned: readNumber(source, 'totalLearned', { required: true, min: 0, max: 1_000_000, integer: true }) || 0,
        currentLevel: readEnum(source, 'currentLevel', Object.values(EnglishLevel)),
        customInstruction: readString(source, 'customInstruction', { max: MAX_LONG_TEXT_CHARS }),
      } as AiActionPayload<TAction>;
    case 'generateDiagnosticTest':
      return {
        grade: readEnum(source, 'grade', Object.values(UserGrade), { required: true }),
      } as AiActionPayload<TAction>;
    case 'generateAdvancedDiagnosticTest':
      return {
        grade: readEnum(source, 'grade', Object.values(UserGrade), { required: true }),
        learningHistorySummary: readString(source, 'learningHistorySummary', { required: true, max: MAX_LONG_TEXT_CHARS }),
      } as AiActionPayload<TAction>;
    case 'evaluateAdvancedTest':
      return {
        grade: readEnum(source, 'grade', Object.values(UserGrade), { required: true }),
        questions: readArray(source, 'questions', { min: 1, max: MAX_DIAGNOSTIC_QUESTIONS }).map((question, index) => validateDiagnosticQuestion(question, `questions[${index}]`)),
        userAnswers: readStringRecord(source, 'userAnswers', {
          maxKeys: MAX_USER_ANSWERS,
          maxValueLength: MAX_LONG_TEXT_CHARS,
        }),
      } as AiActionPayload<TAction>;
    default:
      fail('未知のAI操作です。', 404);
  }
};

export const validateAiActionRequest = (body: unknown): AnyAiActionRequest => {
  if (!isRecord(body)) {
    fail('AI操作のリクエスト形式が不正です。');
  }
  const record = body as Record<string, unknown>;
  const action = typeof record.action === 'string' ? record.action : '';
  if (!action) {
    fail('AI action が指定されていません。');
  }
  if (!AI_ACTION_SET.has(action)) {
    fail('未知のAI操作です。', 404);
  }
  return {
    action,
    payload: validatePayload(action as AiAction, record.payload),
  } as AnyAiActionRequest;
};
