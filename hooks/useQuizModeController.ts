import { type FormEvent, type SetStateAction, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { EnglishLevel, UserGrade, type JapaneseTranslationFeedback, type TranslationExamTarget } from '../types';
import { learningService } from '../services/learning';
import { evaluateJapaneseTranslationAnswer, generateGrammarPracticeQuestions } from '../services/gemini';
import type {
  LearningTaskIntent,
  QuizSessionConfig,
  UserProfile,
  WordData,
  WorksheetQuestionMode,
} from '../types';
import {
  type GeneratedWorksheetQuestion,
  WORKSHEET_MODE_COPY,
  buildDeterministicTranslationFeedback,
  filterWorksheetQuestionCandidates,
  generateWorksheetQuestions,
  isGrammarWorksheetMode,
  resolveJapaneseTranslationAttempt,
  resolveSpellingAttempt,
  toWorksheetSourceWords,
} from '../utils/worksheet';
import {
  formatQuizSelectionSummary,
  getActualQuizQuestionCount,
  getQuizCandidateWords,
  normalizeQuizRange,
} from '../utils/quiz';
import {
  buildQuizLoadingMessage,
  createDefaultQuizConfig,
  getDefaultGrammarScopeIdForMode,
  isGrammarQuizMode,
} from '../config/quizFlow';
import { recordClientProductEvent } from '../services/productEvents';
import { getLearnerAiQuestionQualityState } from '../shared/aiCacheCbt';
import { isSmartSessionBookId } from '../shared/studySession';
import { getBookTaskWordRange, isWordInStudyRange } from '../shared/studyScope';
import { NARU_BOOK_ID } from '../shared/naruBook';
import type { QuizAttemptInput } from '../shared/quizAttempt';

export type QuizScreen = 'SETUP' | 'READY' | 'RUNNING' | 'RESULT';

type AiGrammarQuestionMode = Extract<QuizSessionConfig['questionMode'], 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_ORDER' | 'JA_TRANSLATION_INPUT'>;

export type QuizAdvanceTarget = 'NEXT_QUESTION' | 'RESULT';

export interface PendingQuizAttempt {
  clientAttemptId: string;
  correct: boolean;
  responseTimeMs: number;
  feedback?: JapaneseTranslationFeedback | null;
  advanceAutomatically: boolean;
}

type QuizAttemptResult = 'correct' | 'incorrect';
type QuizAttemptFeedbackTone = 'info' | 'correct' | 'incorrect';

export interface QuizAttemptState {
  showOptions: boolean;
  selectedOption: string | null;
  orderedTokenIds: string[];
  orderFeedback: QuizAttemptResult | null;
  answerInput: string;
  inputResult: QuizAttemptResult | null;
  showSpellingHint: boolean;
  spellingFeedbackTone: QuizAttemptFeedbackTone | null;
  spellingFeedbackMessage: string | null;
  translationFeedback: JapaneseTranslationFeedback | null;
  checkingTranslationFeedback: boolean;
  translationAwaitingAdvance: boolean;
  saveError: string | null;
  pendingAttempt: PendingQuizAttempt | null;
  persistingAttempt: boolean;
}

export type QuizAttemptAction =
  | { type: 'RESET_FOR_SESSION' }
  | { type: 'RESET_FOR_NEXT_QUESTION' }
  | { type: 'SET_SHOW_OPTIONS'; value: boolean }
  | { type: 'SELECT_OPTION'; option: string }
  | { type: 'ADD_ORDER_TOKEN'; tokenId: string; answerTokenCount: number }
  | { type: 'REMOVE_ORDER_TOKEN'; tokenId: string }
  | { type: 'MOVE_ORDER_TOKEN'; tokenId: string; direction: -1 | 1 }
  | { type: 'CLEAR_ORDER_TOKENS' }
  | { type: 'SET_ORDER_FEEDBACK'; value: QuizAttemptResult }
  | { type: 'SET_ANSWER_INPUT'; value: string }
  | { type: 'SET_INPUT_FEEDBACK'; result: QuizAttemptResult; tone: Exclude<QuizAttemptFeedbackTone, 'info'>; message: string }
  | { type: 'SHOW_SPELLING_HINT'; message: string }
  | { type: 'SET_CHECKING_TRANSLATION_FEEDBACK'; value: boolean; message?: string }
  | {
    type: 'SET_TRANSLATION_RESULT';
    feedback: JapaneseTranslationFeedback;
    result: QuizAttemptResult;
    message: string;
  }
  | { type: 'SET_TRANSLATION_AWAITING_ADVANCE'; value: boolean }
  | { type: 'PERSIST_STARTED'; attempt: PendingQuizAttempt }
  | { type: 'PERSIST_FAILED'; message: string }
  | { type: 'PERSIST_SUCCEEDED' };

export const createInitialQuizAttemptState = (): QuizAttemptState => ({
  showOptions: false,
  selectedOption: null,
  orderedTokenIds: [],
  orderFeedback: null,
  answerInput: '',
  inputResult: null,
  showSpellingHint: false,
  spellingFeedbackTone: null,
  spellingFeedbackMessage: null,
  translationFeedback: null,
  checkingTranslationFeedback: false,
  translationAwaitingAdvance: false,
  saveError: null,
  pendingAttempt: null,
  persistingAttempt: false,
});

const resetQuestionAttemptState = (state: QuizAttemptState): QuizAttemptState => ({
  ...state,
  showOptions: false,
  selectedOption: null,
  orderedTokenIds: [],
  orderFeedback: null,
  answerInput: '',
  inputResult: null,
  showSpellingHint: false,
  spellingFeedbackTone: null,
  spellingFeedbackMessage: null,
  translationFeedback: null,
  checkingTranslationFeedback: false,
  translationAwaitingAdvance: false,
  saveError: null,
});

export const quizAttemptReducer = (
  state: QuizAttemptState,
  action: QuizAttemptAction,
): QuizAttemptState => {
  switch (action.type) {
    case 'RESET_FOR_SESSION':
      return createInitialQuizAttemptState();
    case 'RESET_FOR_NEXT_QUESTION':
      return resetQuestionAttemptState(state);
    case 'SET_SHOW_OPTIONS':
      return { ...state, showOptions: action.value };
    case 'SELECT_OPTION':
      return { ...state, selectedOption: action.option };
    case 'ADD_ORDER_TOKEN':
      if (
        state.orderedTokenIds.includes(action.tokenId)
        || state.orderedTokenIds.length >= action.answerTokenCount
      ) {
        return state;
      }
      return { ...state, orderedTokenIds: [...state.orderedTokenIds, action.tokenId] };
    case 'REMOVE_ORDER_TOKEN':
      return {
        ...state,
        orderedTokenIds: state.orderedTokenIds.filter((tokenId) => tokenId !== action.tokenId),
      };
    case 'MOVE_ORDER_TOKEN': {
      const index = state.orderedTokenIds.indexOf(action.tokenId);
      const nextIndex = index + action.direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.orderedTokenIds.length) return state;
      const orderedTokenIds = [...state.orderedTokenIds];
      const [item] = orderedTokenIds.splice(index, 1);
      orderedTokenIds.splice(nextIndex, 0, item);
      return { ...state, orderedTokenIds };
    }
    case 'CLEAR_ORDER_TOKENS':
      return { ...state, orderedTokenIds: [] };
    case 'SET_ORDER_FEEDBACK':
      return { ...state, orderFeedback: action.value };
    case 'SET_ANSWER_INPUT':
      return { ...state, answerInput: action.value };
    case 'SET_INPUT_FEEDBACK':
      return {
        ...state,
        inputResult: action.result,
        spellingFeedbackTone: action.tone,
        spellingFeedbackMessage: action.message,
      };
    case 'SHOW_SPELLING_HINT':
      return {
        ...state,
        showSpellingHint: true,
        spellingFeedbackTone: 'info',
        spellingFeedbackMessage: action.message,
      };
    case 'SET_CHECKING_TRANSLATION_FEEDBACK':
      return {
        ...state,
        checkingTranslationFeedback: action.value,
        spellingFeedbackTone: action.value ? 'info' : state.spellingFeedbackTone,
        spellingFeedbackMessage: action.value && action.message ? action.message : state.spellingFeedbackMessage,
      };
    case 'SET_TRANSLATION_RESULT':
      return {
        ...state,
        translationFeedback: action.feedback,
        inputResult: action.result,
        spellingFeedbackTone: action.result,
        spellingFeedbackMessage: action.message,
      };
    case 'SET_TRANSLATION_AWAITING_ADVANCE':
      return { ...state, translationAwaitingAdvance: action.value };
    case 'PERSIST_STARTED':
      return {
        ...state,
        pendingAttempt: action.attempt,
        persistingAttempt: true,
        saveError: null,
      };
    case 'PERSIST_FAILED':
      return {
        ...state,
        persistingAttempt: false,
        saveError: action.message,
      };
    case 'PERSIST_SUCCEEDED':
      return {
        ...state,
        pendingAttempt: null,
        persistingAttempt: false,
      };
    default:
      return state;
  }
};

export const shouldAutoAdvanceQuizAttempt = (mode: WorksheetQuestionMode): boolean => (
  mode !== 'JA_TRANSLATION_INPUT'
);

export const resolveQuizAdvanceTarget = (currentQIndex: number, questionsLength: number): QuizAdvanceTarget => (
  currentQIndex < questionsLength - 1 ? 'NEXT_QUESTION' : 'RESULT'
);

export const createPendingQuizAttempt = ({
  mode,
  correct,
  responseTimeMs,
  feedback,
  advanceAutomatically,
  clientAttemptId = crypto.randomUUID(),
}: {
  mode: WorksheetQuestionMode;
  correct: boolean;
  responseTimeMs: number;
  feedback?: JapaneseTranslationFeedback | null;
  advanceAutomatically?: boolean;
  clientAttemptId?: string;
}): PendingQuizAttempt => ({
  clientAttemptId,
  correct,
  responseTimeMs,
  feedback,
  advanceAutomatically: advanceAutomatically ?? shouldAutoAdvanceQuizAttempt(mode),
});

export const upsertQuestionFeedbackById = (
  previous: GeneratedWorksheetQuestion[],
  question: GeneratedWorksheetQuestion,
  feedback?: JapaneseTranslationFeedback | null,
): GeneratedWorksheetQuestion[] => {
  const questionWithFeedback = feedback
    ? { ...question, translationFeedback: feedback }
    : question;
  return previous.some((item) => item.id === question.id)
    ? previous.map((item) => (item.id === question.id ? { ...item, ...questionWithFeedback } : item))
    : [...previous, questionWithFeedback];
};

export const buildAiGrammarQuestionSourceNotice = (
  approvedAiQuestionCount: number,
  fallbackQuestionCount: number,
): string | null => {
  if (fallbackQuestionCount <= 0) return null;
  return approvedAiQuestionCount > 0
    ? '確認済みのAI問題が足りないため、例文ベースの問題も使います。'
    : '確認済みのAI問題がまだないため、今回は例文ベースの問題を使います。';
};

export const applyCuratedStaticQualityState = (
  questions: GeneratedWorksheetQuestion[],
): GeneratedWorksheetQuestion[] => questions.map((question) => (
  question.qualityState
    ? question
    : {
      ...question,
      qualityState: getLearnerAiQuestionQualityState('CURATED_STATIC'),
    }
));

const isAiGrammarQuestionMode = (mode: QuizSessionConfig['questionMode']): mode is AiGrammarQuestionMode => (
  mode === 'GRAMMAR_CLOZE'
  || mode === 'EN_WORD_ORDER'
  || mode === 'JA_TRANSLATION_ORDER'
  || mode === 'JA_TRANSLATION_INPUT'
);

const GENERIC_GRAMMAR_PROMPT_LABELS: Record<string, string> = {
  GRAMMAR_CLOZE: '文法穴埋め',
  EN_WORD_ORDER: '英語語順',
  JA_TRANSLATION_ORDER: '日本語語順',
  JA_TRANSLATION_INPUT: '和訳全文入力',
};

const shuffleWords = (words: WordData[]): WordData[] => {
  const next = [...words];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

interface UseQuizModeControllerParams {
  user: UserProfile;
  bookId: string;
  taskIntent?: LearningTaskIntent | null;
}

export const useQuizModeController = ({
  user,
  bookId,
  taskIntent,
}: UseQuizModeControllerParams) => {
  // An automatic chapter session contains only the selected session words,
  // not the full book needed by the editable quiz setup screen.
  const scopedRange = useMemo(() => {
    if (bookId !== NARU_BOOK_ID || !taskIntent?.autoStart) return undefined;
    try {
      return getBookTaskWordRange(taskIntent, bookId);
    } catch {
      // Invalid tasks follow the retryable load-error path below.
      return undefined;
    }
  }, [bookId, taskIntent]);
  const isScopedSession = Boolean(scopedRange);
  const toPresetQuestionCount = (value: number): QuizSessionConfig['questionCount'] => {
    if (value <= 5) return 5;
    if (value <= 10) return 10;
    return 20;
  };

  const [screen, setScreen] = useState<QuizScreen>('SETUP');
  const [setupConfig, setSetupConfig] = useState<QuizSessionConfig>(createDefaultQuizConfig(1, 1));
  const [activeConfig, setActiveConfig] = useState<QuizSessionConfig | null>(null);
  const [allWords, setAllWords] = useState<WordData[]>([]);
  const [bookTitle, setBookTitle] = useState<string | null>(null);
  const [studiedWordIds, setStudiedWordIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [runId, setRunId] = useState(0);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [attemptState, dispatchAttempt] = useReducer(
    quizAttemptReducer,
    undefined,
    createInitialQuizAttemptState,
  );
  const {
    showOptions,
    selectedOption,
    orderedTokenIds,
    orderFeedback,
    answerInput,
    inputResult,
    showSpellingHint,
    spellingFeedbackTone,
    spellingFeedbackMessage,
    translationFeedback,
    checkingTranslationFeedback,
    translationAwaitingAdvance,
    saveError,
    pendingAttempt,
    persistingAttempt,
  } = attemptState;
  const [translationFeedbackSummaries, setTranslationFeedbackSummaries] = useState<GeneratedWorksheetQuestion[]>([]);
  const [score, setScore] = useState(0);
  const [missedQuestions, setMissedQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(buildQuizLoadingMessage('EN_TO_JA'));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const [studiedWordsError, setStudiedWordsError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [questionSourceNotice, setQuestionSourceNotice] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const questionStartedAtRef = useRef(Date.now());
  const quizStartedEventRef = useRef(false);
  const spellingStartedEventRef = useRef(false);
  const generationRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const gradingRef = useRef(false);
  const savedAttemptRef = useRef<{
    pending: PendingQuizAttempt; request: QuizAttemptInput; question: GeneratedWorksheetQuestion;
    uid: string; generation: number; questionIndex: number; status: 'PENDING' | 'SAVING' | 'SAVED';
  } | null>(null);
  const clearAttemptTimer = () => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
  };
  const startingRef = useRef(false);
  const failedStartRef = useRef<{ config: QuizSessionConfig; words: WordData[] } | null>(null);
  const historyLoadingRef = useRef(false);

  const minWordNumber = useMemo(() => {
    if (allWords.length === 0) return 1;
    return Math.min(...allWords.map((word) => word.number));
  }, [allWords]);

  const maxWordNumber = useMemo(() => {
    if (allWords.length === 0) return 1;
    return Math.max(...allWords.map((word) => word.number));
  }, [allWords]);

  const normalizedSetupRange = useMemo(
    () => normalizeQuizRange(setupConfig.rangeStart, setupConfig.rangeEnd, minWordNumber, maxWordNumber),
    [maxWordNumber, minWordNumber, setupConfig.rangeEnd, setupConfig.rangeStart],
  );

  const studiedWordIdSet = useMemo(() => new Set(studiedWordIds), [studiedWordIds]);
  const setupCandidateWords = useMemo(
    () => filterWorksheetQuestionCandidates(
      getQuizCandidateWords({
        words: allWords,
        selectionMode: setupConfig.selectionMode,
        rangeStart: normalizedSetupRange.start,
        rangeEnd: normalizedSetupRange.end,
        minWordNumber,
        maxWordNumber,
        learnedWordIds: studiedWordIdSet,
      }),
      setupConfig.questionMode,
    ),
    [
      allWords,
      maxWordNumber,
      minWordNumber,
      normalizedSetupRange.end,
      normalizedSetupRange.start,
      setupConfig.questionMode,
      setupConfig.selectionMode,
      studiedWordIdSet,
    ],
  );
  const setupActualQuestionCount = getActualQuizQuestionCount(setupConfig.questionCount, setupCandidateWords.length);
  const selectionSummary = scopedRange
    ? { selectionMode: 'RANGE_RANDOM' as const, rangeStart: scopedRange.start, rangeEnd: scopedRange.end }
    : {
      selectionMode: setupConfig.selectionMode,
      rangeStart: normalizedSetupRange.start,
      rangeEnd: normalizedSetupRange.end,
    };
  const setupSummary = formatQuizSelectionSummary(
    selectionSummary,
    setupActualQuestionCount,
  );
  const currentQuestion = questions[currentQIndex];
  const currentModeCopy = WORKSHEET_MODE_COPY[(activeConfig || setupConfig).questionMode];
  const isHintMode = currentQuestion?.mode === 'SPELLING_HINT';
  const isOrderMode = currentQuestion?.interactionType === 'ORDERING';
  const reviewTargets = useMemo(() => missedQuestions.slice(0, 3), [missedQuestions]);
  const activeSummary = activeConfig
    ? formatQuizSelectionSummary(scopedRange ? selectionSummary : activeConfig, questions.length)
    : setupSummary;

  const setShowOptions = (nextValue: SetStateAction<boolean>) => {
    dispatchAttempt({
      type: 'SET_SHOW_OPTIONS',
      value: typeof nextValue === 'function' ? nextValue(showOptions) : nextValue,
    });
  };

  const setAnswerInput = (nextValue: SetStateAction<string>) => {
    dispatchAttempt({
      type: 'SET_ANSWER_INPUT',
      value: typeof nextValue === 'function' ? nextValue(answerInput) : nextValue,
    });
  };

  const resetAttemptState = () => {
    clearAttemptTimer();
    savedAttemptRef.current = null;
    gradingRef.current = false;
    setQuestions([]);
    setCurrentQIndex(0);
    dispatchAttempt({ type: 'RESET_FOR_SESSION' });
    setTranslationFeedbackSummaries([]);
    setScore(0);
    setMissedQuestions([]);
  };

  const resetToSetup = () => {
    generationRef.current += 1;
    setActiveConfig(null);
    setScreen('SETUP');
    setShowExitConfirm(false);
    setQuestionSourceNotice(null);
    setStartError(null);
    failedStartRef.current = null;
    resetAttemptState();
  };

  const confirmExitRunning = (): boolean => {
    // The ref also blocks an exit in the same tick as submitting an answer,
    // before React has rendered pendingAttempt or the disabled button.
    const saved = savedAttemptRef.current;
    if (gradingRef.current || (saved && saved.status !== 'SAVED')) return false;
    resetToSetup();
    return true;
  };

  const buildRuleBasedQuestions = (
    words: WordData[],
    config: QuizSessionConfig,
    questionCount: number,
  ) => generateWorksheetQuestions(
    toWorksheetSourceWords(words),
    config.questionMode,
    questionCount,
    {
      grammarScopeId: config.grammarScopeId,
    },
  );

  const applyGrammarScopeVisibility = (
    generatedQuestions: GeneratedWorksheetQuestion[],
    config: QuizSessionConfig,
  ): GeneratedWorksheetQuestion[] => {
    if (!isGrammarQuizMode(config.questionMode)) return generatedQuestions;
    const showGrammarScopeHint = config.showGrammarScopeHint !== false;
    return generatedQuestions.map((question) => ({
      ...question,
      showGrammarScopeHint,
      promptLabel: showGrammarScopeHint
        ? question.grammarScope?.labelJa || question.grammarFocus || question.promptLabel
        : GENERIC_GRAMMAR_PROMPT_LABELS[question.mode] || question.promptLabel,
    }));
  };

  const startQuizWithWords = async (config: QuizSessionConfig, candidateWords: WordData[]) => {
    if (startingRef.current) return;
    startingRef.current = true;
    const generation = generationRef.current;
    setLoading(true);
    setStartError(null);
    setLoadingMessage(buildQuizLoadingMessage(config.questionMode));
    setQuestionSourceNotice(null);
    const eligibleCandidateWords = filterWorksheetQuestionCandidates(candidateWords, config.questionMode);
    const actualQuestionCount = getActualQuizQuestionCount(config.questionCount, eligibleCandidateWords.length);
    try {
      if (actualQuestionCount === 0) {
        setActiveConfig(null);
        setScreen('SETUP');
        return;
      }

      let nextQuestions: GeneratedWorksheetQuestion[] = [];
      let nextQuestionSourceNotice: string | null = null;
      if (isAiGrammarQuestionMode(config.questionMode)) {
        setLoadingMessage('文法の練習文を準備しています...');
        const selectedWords = shuffleWords(eligibleCandidateWords).slice(0, actualQuestionCount);
        const aiQuestions = await generateGrammarPracticeQuestions(
          selectedWords,
          config.questionMode,
          actualQuestionCount,
          user.englishLevel || EnglishLevel.B1,
          config.grammarScopeId,
        );
        const aiWordIds = new Set(aiQuestions.map((question) => question.wordId));
        const fallbackQuestions = applyCuratedStaticQualityState(
          buildRuleBasedQuestions(
            eligibleCandidateWords.filter((word) => !aiWordIds.has(word.id)),
            config,
            Math.max(0, actualQuestionCount - aiQuestions.length),
          ),
        );
        nextQuestionSourceNotice = buildAiGrammarQuestionSourceNotice(aiQuestions.length, fallbackQuestions.length);
        nextQuestions = [...aiQuestions, ...fallbackQuestions].slice(0, actualQuestionCount);
      } else {
        nextQuestions = buildRuleBasedQuestions(
          eligibleCandidateWords,
          config,
          actualQuestionCount,
        );
      }
      nextQuestions = applyGrammarScopeVisibility(nextQuestions, config);
      if (generation !== generationRef.current) return;

      if (nextQuestions.length === 0) {
        setActiveConfig(null);
        setScreen('SETUP');
        return;
      }
      quizStartedEventRef.current = false;
      spellingStartedEventRef.current = false;

      setActiveConfig(config);
      setShowExitConfirm(false);
      resetAttemptState();
      setRunId((previous) => previous + 1);
      setQuestions(nextQuestions);
      setQuestionSourceNotice(nextQuestionSourceNotice);
      failedStartRef.current = null;
      setScreen('RUNNING');
    } catch {
      if (generation !== generationRef.current) return;
      failedStartRef.current = { config, words: candidateWords };
      setStartError('問題を準備できませんでした。教材と出題条件は保持しています。通信を確認して、もう一度準備してください。');
    } finally {
      if (generation === generationRef.current) {
        startingRef.current = false;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    setBookTitle(null);
    if (!isSmartSessionBookId(bookId)) {
      void Promise.resolve().then(() => learningService.getBooks()).then((books) => {
        if (!cancelled) setBookTitle(books.find((book) => book.id === bookId)?.title || null);
      }).catch(() => {
        // Optional title context must not prevent a loaded quiz from starting.
      });
    }
    generationRef.current += 1;
    startingRef.current = false;
    failedStartRef.current = null;
    historyLoadingRef.current = false;
    setHistoryLoading(false);

    const loadQuizState = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        setStartError(null);
        setStudiedWordsError(null);
        setLoadingMessage(buildQuizLoadingMessage('EN_TO_JA'));
        getBookTaskWordRange(taskIntent || undefined, bookId);
        const autoStart = Boolean(taskIntent?.autoStart);
        const [nextWords, nextStudiedWordIds] = await Promise.all([
          autoStart
            ? (
              isSmartSessionBookId(bookId)
                ? learningService.getDailySessionWords(user.uid, taskIntent?.limit || 10, taskIntent || undefined)
                : learningService.getBookSession(user.uid, bookId, taskIntent?.limit || 10, taskIntent || undefined)
            )
            : learningService.getWordsByBook(bookId),
          isSmartSessionBookId(bookId)
            ? Promise.resolve<string[]>([])
            : learningService.getStudiedWordIdsByBook(user.uid, bookId).catch(() => null),
        ]);
        if (cancelled) return;

        const shouldPreserveSessionOrder = autoStart && isSmartSessionBookId(bookId);
        const sessionWords = scopedRange
          ? nextWords.filter((word) => isWordInStudyRange(word, scopedRange))
          : nextWords;
        const sortedWords = shouldPreserveSessionOrder
          ? sessionWords
          : [...sessionWords].sort((left, right) => left.number - right.number);
        const nextMin = sortedWords.length > 0 ? Math.min(...sortedWords.map((word) => word.number)) : 1;
        const nextMax = sortedWords.length > 0 ? Math.max(...sortedWords.map((word) => word.number)) : 1;

        setAllWords(sortedWords);
        setStudiedWordIds(nextStudiedWordIds ?? []);
        setStudiedWordsError(nextStudiedWordIds === null
          ? '学習済みの記録を確認できませんでした。「学習済みのみ」は記録の取得後に使えます。全範囲や番号指定では、このまま小テストを始められます。'
          : null);
        const defaultConfig = createDefaultQuizConfig(nextMin, nextMax);
        const presetQuestionMode = taskIntent?.targetQuestionModes?.[0] || defaultConfig.questionMode;
        const presetConfig: QuizSessionConfig = autoStart
          ? {
            ...defaultConfig,
            questionMode: presetQuestionMode,
            questionCount: toPresetQuestionCount(
              Math.min(taskIntent?.limit || defaultConfig.questionCount, Math.max(sortedWords.length, 1)),
            ),
            grammarScopeId: getDefaultGrammarScopeIdForMode(presetQuestionMode),
          }
          : defaultConfig;
        setSetupConfig(presetConfig);

        if (autoStart) {
          await startQuizWithWords(presetConfig, sortedWords);
        } else {
          resetToSetup();
        }
      } catch (error) {
        console.error('Quiz Load Error', error);
        if (!cancelled) {
          setAllWords([]);
          setStudiedWordIds([]);
          setSetupConfig(createDefaultQuizConfig(1, 1));
          resetToSetup();
          setLoadError('小テストの教材を読み込めませんでした。通信を確認して、もう一度読み込んでください。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadQuizState();

    return () => {
      cancelled = true;
      generationRef.current += 1;
      clearAttemptTimer();
      savedAttemptRef.current = null;
      gradingRef.current = false;
      startingRef.current = false;
    };
  }, [bookId, taskIntent, user.uid, loadAttempt]);

  useEffect(() => {
    setLoadingMessage(buildQuizLoadingMessage(setupConfig.questionMode));
  }, [setupConfig.questionMode]);

  useEffect(() => {
    if (screen === 'RUNNING' && currentQuestion) {
      questionStartedAtRef.current = Date.now();
    }
  }, [currentQuestion, screen]);

  useEffect(() => {
    if (screen !== 'RUNNING' || !activeConfig || questions.length === 0 || quizStartedEventRef.current) {
      return;
    }
    quizStartedEventRef.current = true;
    void recordClientProductEvent({
      eventName: 'quiz_session_started',
      subjectType: 'book',
      subjectId: bookId,
      status: 'STARTED',
      metadata: {
        questionMode: activeConfig.questionMode,
        questionCount: questions.length,
        intentType: taskIntent?.intentType || null,
      },
    }).catch(() => undefined);

    if (activeConfig.questionMode === 'SPELLING_HINT' && !spellingStartedEventRef.current) {
      spellingStartedEventRef.current = true;
      void recordClientProductEvent({
        eventName: 'spelling_check_started',
        subjectType: 'book',
        subjectId: bookId,
        status: 'STARTED',
        metadata: {
          questionCount: questions.length,
          intentType: taskIntent?.intentType || null,
        },
      }).catch(() => undefined);
    }
  }, [activeConfig, bookId, questions.length, screen, taskIntent]);

  const updateSetupConfig = (nextPartial: Partial<QuizSessionConfig>) => {
    if (isScopedSession) return;
    setSetupConfig((previous) => {
      const next = { ...previous, ...nextPartial };
      if (nextPartial.questionMode) {
        const defaultScopeId = getDefaultGrammarScopeIdForMode(nextPartial.questionMode);
        next.grammarScopeId = defaultScopeId;
        next.showGrammarScopeHint = defaultScopeId ? next.showGrammarScopeHint !== false : true;
      }
      return next;
    });
  };

  const setupEmptyCopy = useMemo(() => {
    if (allWords.length === 0) return '学習する単語がまだありません。先に単語帳を1冊用意してください。';
    if (setupConfig.selectionMode === 'LEARNED_ONLY' && studiedWordsError) return studiedWordsError;
    if (
      setupConfig.questionMode === 'GRAMMAR_CLOZE'
      || setupConfig.questionMode === 'EN_WORD_ORDER'
      || setupConfig.questionMode === 'JA_TRANSLATION_ORDER'
      || setupConfig.questionMode === 'JA_TRANSLATION_INPUT'
    ) {
      return '文法復習に使える英単語がありません。英字の単語と日本語の意味がある教材を選ぶか、範囲を広げてください。';
    }
    if (setupConfig.selectionMode === 'LEARNED_ONLY') {
      return '学習済みのみは、学習モードで評価した単語が1語以上あると使えます。先にカード学習で評価を付けてください。';
    }
    if (setupConfig.selectionMode === 'RANGE_RANDOM') {
      return `No. ${normalizedSetupRange.start} - ${normalizedSetupRange.end} には出題できる単語がありません。範囲を広げてください。`;
    }
    return '出題条件に合う単語がありません。';
  }, [allWords.length, normalizedSetupRange.end, normalizedSetupRange.start, setupConfig.questionMode, setupConfig.selectionMode, studiedWordsError]);

  const retryStudiedWords = async () => {
    if (historyLoadingRef.current || isSmartSessionBookId(bookId)) return;
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    const generation = generationRef.current;
    try {
      const ids = await learningService.getStudiedWordIdsByBook(user.uid, bookId);
      if (generation !== generationRef.current) return;
      setStudiedWordIds(ids);
      setStudiedWordsError(null);
    } catch {
      if (generation !== generationRef.current) return;
      setStudiedWordsError('学習済みの記録を確認できませんでした。「学習済みのみ」は記録の取得後に使えます。全範囲や番号指定では、このまま小テストを始められます。');
    } finally {
      if (generation === generationRef.current) {
        historyLoadingRef.current = false;
        setHistoryLoading(false);
      }
    }
  };

  const startQuiz = (config: QuizSessionConfig) => {
    if (isScopedSession) {
      void startQuizWithWords(setupConfig, allWords);
      return;
    }
    if (config.selectionMode === 'LEARNED_ONLY' && (studiedWordsError || historyLoadingRef.current)) return;
    const normalizedRange = normalizeQuizRange(
      config.rangeStart,
      config.rangeEnd,
      minWordNumber,
      maxWordNumber,
    );
    const normalizedConfig = {
      ...config,
      rangeStart: normalizedRange.start,
      rangeEnd: normalizedRange.end,
    };
    const candidateWords = filterWorksheetQuestionCandidates(
      getQuizCandidateWords({
        words: allWords,
        selectionMode: normalizedConfig.selectionMode,
        rangeStart: normalizedConfig.rangeStart,
        rangeEnd: normalizedConfig.rangeEnd,
        minWordNumber,
        maxWordNumber,
        learnedWordIds: studiedWordIdSet,
      }),
      normalizedConfig.questionMode,
    );
    const actualQuestionCount = getActualQuizQuestionCount(
      normalizedConfig.questionCount,
      candidateWords.length,
    );

    if (actualQuestionCount === 0) {
      setActiveConfig(null);
      setScreen('SETUP');
      return;
    }

    void startQuizWithWords(normalizedConfig, candidateWords);
  };

  const goToReady = () => {
    if (isScopedSession || setupActualQuestionCount === 0) return;
    setScreen('READY');
  };

  const resolveTranslationExamTarget = (): TranslationExamTarget => {
    if (user.grade === UserGrade.JHS1 || user.grade === UserGrade.JHS2 || user.grade === UserGrade.JHS3) {
      return 'HIGH_SCHOOL_ENTRANCE';
    }
    if (user.grade === UserGrade.SHS1 || user.grade === UserGrade.SHS2 || user.grade === UserGrade.SHS3) {
      return 'UNIVERSITY_ENTRANCE';
    }
    return 'GENERAL';
  };

  const resetCurrentQuestionFeedbackState = () => {
    clearAttemptTimer();
    savedAttemptRef.current = null;
    dispatchAttempt({ type: 'RESET_FOR_NEXT_QUESTION' });
  };

  const advanceAfterAttempt = () => {
    const saved = savedAttemptRef.current;
    if (!saved || saved.status !== 'SAVED' || saved.generation !== generationRef.current) return;
    // Consume the saved answer synchronously before React updates the next button.
    savedAttemptRef.current = null;
    clearAttemptTimer();
    if (resolveQuizAdvanceTarget(saved.questionIndex, questions.length) === 'NEXT_QUESTION') {
      setCurrentQIndex((previous) => previous + 1);
      resetCurrentQuestionFeedbackState();
      return;
    }

    dispatchAttempt({ type: 'SET_TRANSLATION_AWAITING_ADVANCE', value: false });
    setScreen('RESULT');
  };

  const savePendingAttempt = async (saved: NonNullable<typeof savedAttemptRef.current>) => {
    if (saved.status !== 'PENDING' || saved.generation !== generationRef.current) return;
    saved.status = 'SAVING';
    dispatchAttempt({ type: 'PERSIST_STARTED', attempt: saved.pending });
    const request = saved.request;
    try {
      const receipt = await learningService.recordQuizAttempt(
        saved.uid, request.wordId, request.bookId, request.correct, request.questionMode,
        request.responseTimeMs, request.missionAssignmentId, request.taskIntentType,
        request.generatedProblemId, request.grammarScopeId, request.translationFeedback, request.clientAttemptId,
      );
      if (!receipt || receipt.clientAttemptId !== request.clientAttemptId
        || receipt.wordId !== request.wordId || receipt.bookId !== request.bookId
        || !Number.isFinite(receipt.committedAt)) {
        throw new Error('小テスト保存のreceiptを確認できませんでした。');
      }
      if (receipt.projectionStatus === 'PENDING') {
        saved.status = 'PENDING';
        if (saved.generation !== generationRef.current || savedAttemptRef.current !== saved) return;
        dispatchAttempt({ type: 'PERSIST_FAILED',
          message: '解答は保存済みです。課題の進捗をまだ確認できていません。同じ解答で保存と進捗を再確認してください。' });
        return;
      }
      if (receipt.projectionStatus !== 'COMPLETE') throw new Error('小テストの進捗確認が完了していません。');
    } catch (error) {
      saved.status = 'PENDING';
      if (saved.generation !== generationRef.current || savedAttemptRef.current !== saved) return;
      console.error('Quiz attempt save failed', error);
      dispatchAttempt({ type: 'PERSIST_FAILED',
        message: '解答結果の保存を確認できませんでした。通信を確認して、同じ解答をもう一度保存してください。' });
      return;
    }
    saved.status = 'SAVED';
    if (saved.generation !== generationRef.current || savedAttemptRef.current !== saved) return;
    const { question, pending } = saved;
    if (request.correct) setScore((previous) => previous + 1);
    else setMissedQuestions((previous) => upsertQuestionFeedbackById(previous, question, pending.feedback));
    if (pending.feedback && question.mode === 'JA_TRANSLATION_INPUT') {
      setTranslationFeedbackSummaries((previous) => upsertQuestionFeedbackById(previous, question, pending.feedback));
    }
    dispatchAttempt({ type: 'PERSIST_SUCCEEDED' });
    if (!pending.advanceAutomatically) {
      dispatchAttempt({ type: 'SET_TRANSLATION_AWAITING_ADVANCE', value: true });
      return;
    }
    clearAttemptTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      if (saved.generation === generationRef.current && savedAttemptRef.current === saved) advanceAfterAttempt();
    }, 900);
  };

  const persistAttempt = async (
    correct: boolean,
    responseTimeMs: number,
    feedback?: JapaneseTranslationFeedback | null,
    options: { advanceAutomatically?: boolean } = {},
  ) => {
    const question = questions[currentQIndex];
    // Ref lock covers repeated clicks before React has rendered the disabled state.
    if (!question || savedAttemptRef.current) return;
    const pending = createPendingQuizAttempt({ mode: question.mode, correct, responseTimeMs,
      feedback: feedback ? structuredClone(feedback) : feedback, advanceAutomatically: options.advanceAutomatically });
    const request: QuizAttemptInput = {
      wordId: question.wordId, bookId: question.bookId, correct, questionMode: question.mode,
      responseTimeMs, missionAssignmentId: taskIntent?.missionAssignmentId, taskIntentType: taskIntent?.intentType,
      generatedProblemId: question.generatedProblemId, grammarScopeId: question.grammarScope?.scopeId,
      translationFeedback: pending.feedback || undefined, clientAttemptId: pending.clientAttemptId,
    };
    const saved = { pending, request, question: structuredClone(question), uid: user.uid,
      generation: generationRef.current, questionIndex: currentQIndex, status: 'PENDING' as const };
    savedAttemptRef.current = saved;
    await savePendingAttempt(saved);
  };

  const handleOptionClick = async (option: string) => {
    if (selectedOption || !currentQuestion || persistingAttempt || savedAttemptRef.current) return;
    dispatchAttempt({ type: 'SELECT_OPTION', option });
    await persistAttempt(
      option === currentQuestion.answer,
      Math.max(0, Date.now() - questionStartedAtRef.current),
    );
  };

  const handleOrderTokenSelect = (tokenId: string) => {
    if (!currentQuestion || !isOrderMode || orderFeedback || persistingAttempt || savedAttemptRef.current) return;
    const answerTokenCount = currentQuestion.answerTokenIds?.length || 0;
    dispatchAttempt({ type: 'ADD_ORDER_TOKEN', tokenId, answerTokenCount });
  };

  const handleOrderTokenRemove = (tokenId: string) => {
    if (orderFeedback || persistingAttempt || savedAttemptRef.current) return;
    dispatchAttempt({ type: 'REMOVE_ORDER_TOKEN', tokenId });
  };

  const handleOrderTokenMove = (tokenId: string, direction: -1 | 1) => {
    if (orderFeedback || persistingAttempt || savedAttemptRef.current) return;
    dispatchAttempt({ type: 'MOVE_ORDER_TOKEN', tokenId, direction });
  };

  const handleOrderTokensClear = () => {
    if (orderFeedback || persistingAttempt || savedAttemptRef.current) return;
    dispatchAttempt({ type: 'CLEAR_ORDER_TOKENS' });
  };

  const handleOrderSubmit = async () => {
    if (!currentQuestion || !isOrderMode || orderFeedback || persistingAttempt || savedAttemptRef.current) return;
    const answerTokenIds = currentQuestion.answerTokenIds || [];
    if (answerTokenIds.length === 0 || orderedTokenIds.length !== answerTokenIds.length) return;
    const correct = orderedTokenIds.every((tokenId, index) => tokenId === answerTokenIds[index]);
    dispatchAttempt({ type: 'SET_ORDER_FEEDBACK', value: correct ? 'correct' : 'incorrect' });
    await persistAttempt(correct, Math.max(0, Date.now() - questionStartedAtRef.current));
  };

  const handleHintSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentQuestion || inputResult || !answerInput.trim() || persistingAttempt || gradingRef.current || savedAttemptRef.current) return;

    if (currentQuestion.mode === 'JA_TRANSLATION_INPUT') {
      const gradingGeneration = generationRef.current;
      gradingRef.current = true;
      const responseTimeMs = Math.max(0, Date.now() - questionStartedAtRef.current);
      const translationAttempt = resolveJapaneseTranslationAttempt({
        input: answerInput,
        answer: currentQuestion.answer,
      });
      let feedback = buildDeterministicTranslationFeedback({
        input: answerInput,
        answer: currentQuestion.answer,
        grammarExplanation: currentQuestion.grammarExplanation,
      });
      feedback = {
        ...feedback,
        examTarget: resolveTranslationExamTarget(),
        sourceSentence: currentQuestion.sourceSentence || currentQuestion.promptText,
        expectedTranslation: currentQuestion.answer,
        userTranslation: answerInput,
      };

      if (translationAttempt !== 'correct') {
        dispatchAttempt({
          type: 'SET_CHECKING_TRANSLATION_FEEDBACK',
          value: true,
          message: '受験答案として採点中です...',
        });
        const aiFeedback = await evaluateJapaneseTranslationAnswer({
          sourceSentence: currentQuestion.sourceSentence || currentQuestion.promptText,
          expectedTranslation: currentQuestion.answer,
          userTranslation: answerInput,
          grammarScopeLabel: currentQuestion.grammarScope?.labelJa || currentQuestion.grammarFocus,
          grammarScopeId: currentQuestion.grammarScope?.scopeId,
          examTarget: resolveTranslationExamTarget(),
        });
        if (gradingGeneration !== generationRef.current) return;
        if (aiFeedback) {
          feedback = aiFeedback;
        }
        dispatchAttempt({ type: 'SET_CHECKING_TRANSLATION_FEEDBACK', value: false });
      }

      gradingRef.current = false;
      const correct = feedback.isCorrect;
      dispatchAttempt({
        type: 'SET_TRANSLATION_RESULT',
        feedback,
        result: correct ? 'correct' : 'incorrect',
        message: `${feedback.verdictLabel}: ${feedback.summaryJa}`,
      });
      await persistAttempt(correct, responseTimeMs, feedback, { advanceAutomatically: false });
      return;
    }

    const spellingAttempt = resolveSpellingAttempt({
      input: answerInput,
      answer: currentQuestion.answer,
      hintPrefix: currentQuestion.hintPrefix || '',
      hintVisible: showSpellingHint,
    });
    if (spellingAttempt === 'correct') {
      dispatchAttempt({
        type: 'SET_INPUT_FEEDBACK',
        result: 'correct',
        tone: 'correct',
        message: showSpellingHint
          ? '正解です。ヒントありでもスペルを思い出せました。'
          : '正解です。ヒントなしでスペルを確認できました。',
      });
      await persistAttempt(true, Math.max(0, Date.now() - questionStartedAtRef.current));
      return;
    }

    if (spellingAttempt === 'retry-with-hint') {
      dispatchAttempt({
        type: 'SHOW_SPELLING_HINT',
        message: `先頭2文字「${currentQuestion.hintPrefix || ''}」をヒントに、もう一度入力してください。`,
      });
      return;
    }

    dispatchAttempt({
      type: 'SET_INPUT_FEEDBACK',
      result: 'incorrect',
      tone: 'incorrect',
      message: `不正解です。正解は ${currentQuestion.answer} です。`,
    });
    await persistAttempt(false, Math.max(0, Date.now() - questionStartedAtRef.current));
  };

  const revealSpellingHint = () => {
    if (!isHintMode || showSpellingHint || inputResult || !currentQuestion) return;
    dispatchAttempt({
      type: 'SHOW_SPELLING_HINT',
      message: `先頭2文字「${currentQuestion.hintPrefix || ''}」を表示しました。スペルをもう一度入力してください。`,
    });
  };

  const handleRetrySave = async () => {
    const saved = savedAttemptRef.current;
    if (!pendingAttempt || !saved || persistingAttempt) return;
    await savePendingAttempt(saved);
  };

  const handleAdvanceAfterTranslationFeedback = () => {
    if (!translationAwaitingAdvance || persistingAttempt || checkingTranslationFeedback || saveError) return;
    advanceAfterAttempt();
  };

  const percentage = questions.length === 0 ? 0 : Math.round((score / questions.length) * 100);
  const nextReviewCopy = reviewTargets.length > 0
    ? '10分後に間違えた単語だけもう一度。そのあと明日の最初に1回確認すると定着しやすいです。'
    : '間違いはありません。明日の最初に軽く1回確認しましょう。';

  return {
    isScopedSession,
    exitBlocked: Boolean(pendingAttempt || persistingAttempt || checkingTranslationFeedback),
    screen,
    setupConfig,
    activeConfig,
    allWords,
    bookTitle,
    questions,
    runId,
    currentQIndex,
    showOptions,
    selectedOption,
    orderedTokenIds,
    orderFeedback,
    answerInput,
    inputResult,
    score,
    loading,
    loadingMessage,
    loadError,
    retryLoad: () => setLoadAttempt((previous) => previous + 1),
    studiedWordsError,
    historyLoading,
    retryStudiedWords,
    startError,
    retryStart: () => {
      const failed = failedStartRef.current;
      if (failed) void startQuizWithWords(failed.config, failed.words);
    },
    questionSourceNotice,
    showExitConfirm,
    saveError,
    pendingAttempt,
    persistingAttempt,
    translationFeedback,
    checkingTranslationFeedback,
    translationAwaitingAdvance,
    translationFeedbackSummaries,
    minWordNumber,
    maxWordNumber,
    normalizedSetupRange,
    setupCandidateWords,
    setupActualQuestionCount,
    setupSummary,
    setupEmptyCopy,
    currentQuestion,
    currentModeLabel: currentModeCopy.label,
    isHintMode,
    isOrderMode,
    showSpellingHint,
    spellingFeedbackTone,
    spellingFeedbackMessage,
    reviewTargets,
    activeSummary,
    percentage,
    nextReviewCopy,
    goToReady,
    setScreen,
    updateSetupConfig,
    startQuiz,
    handleOptionClick,
    handleOrderTokenSelect,
    handleOrderTokenRemove,
    handleOrderTokenMove,
    handleOrderTokensClear,
    handleOrderSubmit,
    handleHintSubmit,
    revealSpellingHint,
    handleRetrySave,
    handleAdvanceAfterTranslationFeedback,
    setShowOptions,
    setAnswerInput,
    setShowExitConfirm,
    confirmExitRunning,
    resetToSetup,
  };
};

export default useQuizModeController;
