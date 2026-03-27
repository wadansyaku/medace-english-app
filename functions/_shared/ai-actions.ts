import { GoogleGenAI, Type } from '@google/genai';
import { BookMetadata, EnglishLevel, LearningPlan, LearningPreference, StudentRiskLevel, UserGrade, WordData } from '../../types';
import type { MeteredAiAction } from '../../config/subscription';
import { formatDateKey } from '../../utils/date';
import { buildFallbackLearningPlan } from '../../utils/learningPlan';
import {
  assertAiActionAllowed,
  assertBudgetAvailable,
  recordAiUsageEvent,
  type AiUsageLogContext,
} from './ai-metering';
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
): Promise<T> => {
  await assertBudgetAvailable(env, user, action);
  const result = await runner();
  await recordAiUsageEvent(env, user, {
    action,
    usedAi: true,
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
