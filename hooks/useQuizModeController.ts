import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { EnglishLevel } from '../types';
import { learningService } from '../services/learning';
import { generateGrammarPracticeQuestions } from '../services/gemini';
import type {
  LearningTaskIntent,
  QuizSessionConfig,
  UserProfile,
  WordData,
} from '../types';
import {
  type GeneratedWorksheetQuestion,
  WORKSHEET_MODE_COPY,
  filterWorksheetQuestionCandidates,
  generateWorksheetQuestions,
  isGrammarWorksheetMode,
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
} from '../config/quizFlow';
import { recordClientProductEvent } from '../services/productEvents';
import { isSmartSessionBookId } from '../shared/studySession';

export type QuizScreen = 'SETUP' | 'READY' | 'RUNNING' | 'RESULT';

type AiGrammarQuestionMode = Extract<QuizSessionConfig['questionMode'], 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_ORDER'>;

const isAiGrammarQuestionMode = (mode: QuizSessionConfig['questionMode']): mode is AiGrammarQuestionMode => isGrammarWorksheetMode(mode);

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
  const toPresetQuestionCount = (value: number): QuizSessionConfig['questionCount'] => {
    if (value <= 5) return 5;
    if (value <= 10) return 10;
    return 20;
  };

  const [screen, setScreen] = useState<QuizScreen>('SETUP');
  const [setupConfig, setSetupConfig] = useState<QuizSessionConfig>(createDefaultQuizConfig(1, 1));
  const [activeConfig, setActiveConfig] = useState<QuizSessionConfig | null>(null);
  const [allWords, setAllWords] = useState<WordData[]>([]);
  const [studiedWordIds, setStudiedWordIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [orderedTokenIds, setOrderedTokenIds] = useState<string[]>([]);
  const [orderFeedback, setOrderFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [inputResult, setInputResult] = useState<'correct' | 'incorrect' | null>(null);
  const [showSpellingHint, setShowSpellingHint] = useState(false);
  const [spellingFeedbackTone, setSpellingFeedbackTone] = useState<'info' | 'correct' | 'incorrect' | null>(null);
  const [spellingFeedbackMessage, setSpellingFeedbackMessage] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [missedQuestions, setMissedQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(buildQuizLoadingMessage('EN_TO_JA'));
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAttempt, setPendingAttempt] = useState<{ correct: boolean; responseTimeMs: number } | null>(null);
  const [persistingAttempt, setPersistingAttempt] = useState(false);
  const questionStartedAtRef = useRef(Date.now());
  const quizStartedEventRef = useRef(false);
  const spellingStartedEventRef = useRef(false);

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
  const setupSummary = formatQuizSelectionSummary(
    {
      selectionMode: setupConfig.selectionMode,
      rangeStart: normalizedSetupRange.start,
      rangeEnd: normalizedSetupRange.end,
    },
    setupActualQuestionCount,
  );
  const currentQuestion = questions[currentQIndex];
  const currentModeCopy = WORKSHEET_MODE_COPY[(activeConfig || setupConfig).questionMode];
  const isHintMode = currentQuestion?.mode === 'SPELLING_HINT';
  const isOrderMode = currentQuestion?.interactionType === 'ORDERING';
  const reviewTargets = useMemo(() => missedQuestions.slice(0, 3), [missedQuestions]);
  const activeSummary = activeConfig
    ? formatQuizSelectionSummary(activeConfig, questions.length)
    : setupSummary;

  const resetAttemptState = () => {
    setQuestions([]);
    setCurrentQIndex(0);
    setShowOptions(false);
    setSelectedOption(null);
    setOrderedTokenIds([]);
    setOrderFeedback(null);
    setAnswerInput('');
    setInputResult(null);
    setShowSpellingHint(false);
    setSpellingFeedbackTone(null);
    setSpellingFeedbackMessage(null);
    setScore(0);
    setMissedQuestions([]);
    setSaveError(null);
    setPendingAttempt(null);
    setPersistingAttempt(false);
  };

  const resetToSetup = () => {
    setActiveConfig(null);
    setScreen('SETUP');
    setShowExitConfirm(false);
    resetAttemptState();
  };

  const buildRuleBasedQuestions = (
    words: WordData[],
    mode: QuizSessionConfig['questionMode'],
    questionCount: number,
  ) => generateWorksheetQuestions(
    toWorksheetSourceWords(words),
    mode,
    questionCount,
  );

  const startQuizWithWords = async (config: QuizSessionConfig, candidateWords: WordData[]) => {
    setLoading(true);
    setLoadingMessage(buildQuizLoadingMessage(config.questionMode));
    const eligibleCandidateWords = filterWorksheetQuestionCandidates(candidateWords, config.questionMode);
    const actualQuestionCount = getActualQuizQuestionCount(config.questionCount, eligibleCandidateWords.length);
    try {
      if (actualQuestionCount === 0) {
        setActiveConfig(null);
        setScreen('SETUP');
        return;
      }

      let nextQuestions: GeneratedWorksheetQuestion[] = [];
      if (isAiGrammarQuestionMode(config.questionMode)) {
        setLoadingMessage('AIで文法問題を生成中...');
        const selectedWords = shuffleWords(eligibleCandidateWords).slice(0, actualQuestionCount);
        const aiQuestions = await generateGrammarPracticeQuestions(
          selectedWords,
          config.questionMode,
          actualQuestionCount,
          user.englishLevel || EnglishLevel.B1,
        );
        const aiWordIds = new Set(aiQuestions.map((question) => question.wordId));
        const fallbackQuestions = buildRuleBasedQuestions(
          eligibleCandidateWords.filter((word) => !aiWordIds.has(word.id)),
          config.questionMode,
          Math.max(0, actualQuestionCount - aiQuestions.length),
        );
        nextQuestions = [...aiQuestions, ...fallbackQuestions].slice(0, actualQuestionCount);
      } else {
        nextQuestions = buildRuleBasedQuestions(
          eligibleCandidateWords,
          config.questionMode,
          actualQuestionCount,
        );
      }

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
      setQuestions(nextQuestions);
      setScreen('RUNNING');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadQuizState = async () => {
      try {
        setLoading(true);
        setLoadingMessage(buildQuizLoadingMessage('EN_TO_JA'));
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
            : learningService.getStudiedWordIdsByBook(user.uid, bookId).catch(() => []),
        ]);
        if (cancelled) return;

        const sortedWords = [...nextWords].sort((left, right) => left.number - right.number);
        const nextMin = sortedWords.length > 0 ? Math.min(...sortedWords.map((word) => word.number)) : 1;
        const nextMax = sortedWords.length > 0 ? Math.max(...sortedWords.map((word) => word.number)) : 1;

        setAllWords(sortedWords);
        setStudiedWordIds(nextStudiedWordIds);
        const defaultConfig = createDefaultQuizConfig(nextMin, nextMax);
        const presetConfig: QuizSessionConfig = autoStart
          ? {
            ...defaultConfig,
            questionMode: taskIntent?.targetQuestionModes?.[0] || defaultConfig.questionMode,
            questionCount: toPresetQuestionCount(
              Math.min(taskIntent?.limit || defaultConfig.questionCount, Math.max(sortedWords.length, 1)),
            ),
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
    };
  }, [bookId, taskIntent, user.uid]);

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
    setSetupConfig((previous) => ({ ...previous, ...nextPartial }));
  };

  const setupEmptyCopy = useMemo(() => {
    if (allWords.length === 0) return '学習する単語がまだありません。先に単語帳を1冊用意してください。';
    if (
      setupConfig.questionMode === 'GRAMMAR_CLOZE'
      || setupConfig.questionMode === 'EN_WORD_ORDER'
      || setupConfig.questionMode === 'JA_TRANSLATION_ORDER'
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
  }, [allWords.length, normalizedSetupRange.end, normalizedSetupRange.start, setupConfig.questionMode, setupConfig.selectionMode]);

  const startQuiz = (config: QuizSessionConfig) => {
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
    if (setupActualQuestionCount === 0) return;
    setScreen('READY');
  };

  const persistAttempt = async (correct: boolean, responseTimeMs: number) => {
    const question = questions[currentQIndex];
    if (!question) return;

    setPersistingAttempt(true);
    setSaveError(null);
    setPendingAttempt({ correct, responseTimeMs });

    try {
      await learningService.recordQuizAttempt(
        user.uid,
        question.wordId,
        question.bookId,
        correct,
        question.mode,
        responseTimeMs,
        taskIntent?.missionAssignmentId,
        taskIntent?.intentType,
      );
    } catch (error) {
      console.error('Quiz attempt save failed', error);
      setSaveError('解答結果の保存に失敗しました。通信を確認して、もう一度保存してください。');
      setPersistingAttempt(false);
      return;
    }

    if (correct) {
      setScore((previous) => previous + 1);
    } else {
      setMissedQuestions((previous) => (
        previous.some((item) => item.wordId === question.wordId)
          ? previous
          : [...previous, question]
      ));
    }

    setPendingAttempt(null);
    setPersistingAttempt(false);

    window.setTimeout(() => {
      if (currentQIndex < questions.length - 1) {
        setCurrentQIndex((previous) => previous + 1);
        setSelectedOption(null);
        setOrderedTokenIds([]);
        setOrderFeedback(null);
        setShowOptions(false);
        setAnswerInput('');
        setInputResult(null);
        setShowSpellingHint(false);
        setSpellingFeedbackTone(null);
        setSpellingFeedbackMessage(null);
        setSaveError(null);
        return;
      }

      setScreen('RESULT');
    }, 900);
  };

  const handleOptionClick = async (option: string) => {
    if (selectedOption || !currentQuestion || persistingAttempt) return;
    setSelectedOption(option);
    await persistAttempt(
      option === currentQuestion.answer,
      Math.max(0, Date.now() - questionStartedAtRef.current),
    );
  };

  const handleOrderTokenSelect = (tokenId: string) => {
    if (!currentQuestion || !isOrderMode || orderFeedback || persistingAttempt) return;
    const answerTokenCount = currentQuestion.answerTokenIds?.length || 0;
    setOrderedTokenIds((current) => {
      if (current.includes(tokenId) || current.length >= answerTokenCount) return current;
      return [...current, tokenId];
    });
  };

  const handleOrderTokenRemove = (tokenId: string) => {
    if (orderFeedback || persistingAttempt) return;
    setOrderedTokenIds((current) => current.filter((id) => id !== tokenId));
  };

  const handleOrderTokenMove = (tokenId: string, direction: -1 | 1) => {
    if (orderFeedback || persistingAttempt) return;
    setOrderedTokenIds((current) => {
      const index = current.indexOf(tokenId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const handleOrderTokensClear = () => {
    if (orderFeedback || persistingAttempt) return;
    setOrderedTokenIds([]);
  };

  const handleOrderSubmit = async () => {
    if (!currentQuestion || !isOrderMode || orderFeedback || persistingAttempt) return;
    const answerTokenIds = currentQuestion.answerTokenIds || [];
    if (answerTokenIds.length === 0 || orderedTokenIds.length !== answerTokenIds.length) return;
    const correct = orderedTokenIds.every((tokenId, index) => tokenId === answerTokenIds[index]);
    setOrderFeedback(correct ? 'correct' : 'incorrect');
    await persistAttempt(correct, Math.max(0, Date.now() - questionStartedAtRef.current));
  };

  const handleHintSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentQuestion || inputResult || !answerInput.trim() || persistingAttempt) return;

    const spellingAttempt = resolveSpellingAttempt({
      input: answerInput,
      answer: currentQuestion.answer,
      hintPrefix: currentQuestion.hintPrefix || '',
      hintVisible: showSpellingHint,
    });
    if (spellingAttempt === 'correct') {
      setInputResult('correct');
      setSpellingFeedbackTone('correct');
      setSpellingFeedbackMessage(
        showSpellingHint
          ? '正解です。ヒントありでもスペルを思い出せました。'
          : '正解です。ヒントなしでスペルを確認できました。'
      );
      await persistAttempt(true, Math.max(0, Date.now() - questionStartedAtRef.current));
      return;
    }

    if (spellingAttempt === 'retry-with-hint') {
      setShowSpellingHint(true);
      setSpellingFeedbackTone('info');
      setSpellingFeedbackMessage(
        `先頭2文字「${currentQuestion.hintPrefix || ''}」をヒントに、もう一度入力してください。`,
      );
      return;
    }

    setInputResult('incorrect');
    setSpellingFeedbackTone('incorrect');
    setSpellingFeedbackMessage(`不正解です。正解は ${currentQuestion.answer} です。`);
    await persistAttempt(false, Math.max(0, Date.now() - questionStartedAtRef.current));
  };

  const revealSpellingHint = () => {
    if (!isHintMode || showSpellingHint || inputResult || !currentQuestion) return;
    setShowSpellingHint(true);
    setSpellingFeedbackTone('info');
    setSpellingFeedbackMessage(
      `先頭2文字「${currentQuestion.hintPrefix || ''}」を表示しました。スペルをもう一度入力してください。`,
    );
  };

  const handleRetrySave = async () => {
    if (!pendingAttempt || persistingAttempt) return;
    await persistAttempt(pendingAttempt.correct, pendingAttempt.responseTimeMs);
  };

  const percentage = questions.length === 0 ? 0 : Math.round((score / questions.length) * 100);
  const nextReviewCopy = reviewTargets.length > 0
    ? '10分後に間違えた単語だけもう一度。そのあと明日の最初に1回確認すると定着しやすいです。'
    : '間違いはありません。明日に1回だけ軽く確認すれば十分です。';

  return {
    screen,
    setupConfig,
    activeConfig,
    allWords,
    questions,
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
    showExitConfirm,
    saveError,
    pendingAttempt,
    persistingAttempt,
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
    setShowOptions,
    setAnswerInput,
    setShowExitConfirm,
    confirmExitRunning: resetToSetup,
    resetToSetup,
  };
};

export default useQuizModeController;
