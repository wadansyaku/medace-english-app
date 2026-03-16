import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { storage } from '../services/storage';
import type {
  QuizSessionConfig,
  UserProfile,
  WordData,
} from '../types';
import {
  type GeneratedWorksheetQuestion,
  WORKSHEET_MODE_COPY,
  generateWorksheetQuestions,
  isCorrectSpellingHintAnswer,
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

export type QuizScreen = 'SETUP' | 'READY' | 'RUNNING' | 'RESULT';

interface UseQuizModeControllerParams {
  user: UserProfile;
  bookId: string;
}

export const useQuizModeController = ({
  user,
  bookId,
}: UseQuizModeControllerParams) => {
  const [screen, setScreen] = useState<QuizScreen>('SETUP');
  const [setupConfig, setSetupConfig] = useState<QuizSessionConfig>(createDefaultQuizConfig(1, 1));
  const [activeConfig, setActiveConfig] = useState<QuizSessionConfig | null>(null);
  const [allWords, setAllWords] = useState<WordData[]>([]);
  const [studiedWordIds, setStudiedWordIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [inputResult, setInputResult] = useState<'correct' | 'incorrect' | null>(null);
  const [score, setScore] = useState(0);
  const [missedQuestions, setMissedQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(buildQuizLoadingMessage('EN_TO_JA'));
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAttempt, setPendingAttempt] = useState<{ correct: boolean; responseTimeMs: number } | null>(null);
  const [persistingAttempt, setPersistingAttempt] = useState(false);
  const questionStartedAtRef = useRef(Date.now());

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
    () => getQuizCandidateWords({
      words: allWords,
      selectionMode: setupConfig.selectionMode,
      rangeStart: normalizedSetupRange.start,
      rangeEnd: normalizedSetupRange.end,
      minWordNumber,
      maxWordNumber,
      learnedWordIds: studiedWordIdSet,
    }),
    [
      allWords,
      maxWordNumber,
      minWordNumber,
      normalizedSetupRange.end,
      normalizedSetupRange.start,
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
  const reviewTargets = useMemo(() => missedQuestions.slice(0, 3), [missedQuestions]);
  const activeSummary = activeConfig
    ? formatQuizSelectionSummary(activeConfig, questions.length)
    : setupSummary;

  const resetAttemptState = () => {
    setQuestions([]);
    setCurrentQIndex(0);
    setShowOptions(false);
    setSelectedOption(null);
    setAnswerInput('');
    setInputResult(null);
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

  useEffect(() => {
    let cancelled = false;

    const loadQuizState = async () => {
      try {
        setLoading(true);
        setLoadingMessage(buildQuizLoadingMessage('EN_TO_JA'));
        const [nextWords, nextStudiedWordIds] = await Promise.all([
          storage.getWordsByBook(bookId),
          storage.getStudiedWordIdsByBook(user.uid, bookId).catch(() => []),
        ]);
        if (cancelled) return;

        const sortedWords = [...nextWords].sort((left, right) => left.number - right.number);
        const nextMin = sortedWords.length > 0 ? Math.min(...sortedWords.map((word) => word.number)) : 1;
        const nextMax = sortedWords.length > 0 ? Math.max(...sortedWords.map((word) => word.number)) : 1;

        setAllWords(sortedWords);
        setStudiedWordIds(nextStudiedWordIds);
        setSetupConfig(createDefaultQuizConfig(nextMin, nextMax));
        resetToSetup();
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
  }, [bookId, user.uid]);

  useEffect(() => {
    setLoadingMessage(buildQuizLoadingMessage(setupConfig.questionMode));
  }, [setupConfig.questionMode]);

  useEffect(() => {
    if (screen === 'RUNNING' && currentQuestion) {
      questionStartedAtRef.current = Date.now();
    }
  }, [currentQuestion, screen]);

  const updateSetupConfig = (nextPartial: Partial<QuizSessionConfig>) => {
    setSetupConfig((previous) => ({ ...previous, ...nextPartial }));
  };

  const setupEmptyCopy = useMemo(() => {
    if (allWords.length === 0) return '学習する単語がまだありません。先に単語帳を1冊用意してください。';
    if (setupConfig.selectionMode === 'LEARNED_ONLY') {
      return '学習済みのみは、学習モードで評価した単語が1語以上あると使えます。先にカード学習で評価を付けてください。';
    }
    if (setupConfig.selectionMode === 'RANGE_RANDOM') {
      return `No. ${normalizedSetupRange.start} - ${normalizedSetupRange.end} には出題できる単語がありません。範囲を広げてください。`;
    }
    return '出題条件に合う単語がありません。';
  }, [allWords.length, normalizedSetupRange.end, normalizedSetupRange.start, setupConfig.selectionMode]);

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
    const candidateWords = getQuizCandidateWords({
      words: allWords,
      selectionMode: normalizedConfig.selectionMode,
      rangeStart: normalizedConfig.rangeStart,
      rangeEnd: normalizedConfig.rangeEnd,
      minWordNumber,
      maxWordNumber,
      learnedWordIds: studiedWordIdSet,
    });
    const actualQuestionCount = getActualQuizQuestionCount(
      normalizedConfig.questionCount,
      candidateWords.length,
    );

    if (actualQuestionCount === 0) {
      setActiveConfig(null);
      setScreen('SETUP');
      return;
    }

    const nextQuestions = generateWorksheetQuestions(
      toWorksheetSourceWords(candidateWords),
      normalizedConfig.questionMode,
      actualQuestionCount,
    );

    setActiveConfig(normalizedConfig);
    setShowExitConfirm(false);
    resetAttemptState();
    setQuestions(nextQuestions);
    setScreen('RUNNING');
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
      await storage.recordQuizAttempt(
        user.uid,
        question.wordId,
        question.bookId,
        correct,
        question.mode,
        responseTimeMs,
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
        setShowOptions(false);
        setAnswerInput('');
        setInputResult(null);
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

  const handleHintSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentQuestion || inputResult || !answerInput.trim() || persistingAttempt) return;

    const correct = isCorrectSpellingHintAnswer(
      answerInput,
      currentQuestion.answer,
      currentQuestion.hintPrefix || '',
    );
    setInputResult(correct ? 'correct' : 'incorrect');
    await persistAttempt(correct, Math.max(0, Date.now() - questionStartedAtRef.current));
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
    reviewTargets,
    activeSummary,
    percentage,
    nextReviewCopy,
    goToReady,
    setScreen,
    updateSetupConfig,
    startQuiz,
    handleOptionClick,
    handleHintSubmit,
    handleRetrySave,
    setShowOptions,
    setAnswerInput,
    setShowExitConfirm,
    confirmExitRunning: resetToSetup,
    resetToSetup,
  };
};

export default useQuizModeController;
