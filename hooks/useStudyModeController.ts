import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  GeneratedAssetAuditStatus,
  type LearningTaskIntent,
  type UserProfile,
  type WordData,
} from '../types';
import { learningService } from '../services/learning';
import { getSmartSessionConfig, normalizeStudySessionLimit } from '../shared/studySession';
import { getRemainingStudyRatingFeedbackMs } from '../shared/studyPresentation';
import { calculateStudySessionXp } from '../shared/xp';
import { buildWeaknessSessionSummary } from '../shared/weakness';
import { createStudyCardOperations, type StudyCardOperation } from '../utils/studyCardOperations';
import useIsMobileViewport from './useIsMobileViewport';

interface UseStudyModeControllerParams {
  user: UserProfile;
  bookId: string;
  taskIntent?: LearningTaskIntent | null;
  onSessionComplete: (user: UserProfile) => void;
}

const getSupports3D = (): boolean => {
  if (typeof window === 'undefined') return true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supports3D = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('transform-style', 'preserve-3d')
    && CSS.supports('perspective', '1px');
  return !reducedMotion && supports3D;
};

export const useStudyModeController = ({
  user,
  bookId,
  taskIntent,
  onSessionComplete,
}: UseStudyModeControllerParams) => {
  const isMobileViewport = useIsMobileViewport();
  const [queue, setQueue] = useState<WordData[]>([]);
  const [sessionWordCount, setSessionWordCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rewardNotice, setRewardNotice] = useState<string | null>(null);
  const [isBookOwner, setIsBookOwner] = useState(false);
  const [bookTitle, setBookTitle] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editDef, setEditDef] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [earnedXP, setEarnedXP] = useState<number | null>(null);
  const [streakBonusXP, setStreakBonusXP] = useState<number | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [updatedUser, setUpdatedUser] = useState<UserProfile | null>(null);
  const [reviewWords, setReviewWords] = useState<WordData[]>([]);
  const [weaknessSummary, setWeaknessSummary] = useState(buildWeaknessSessionSummary(null));
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [supports3D, setSupports3D] = useState(true);
  const [mobileShellHeight, setMobileShellHeight] = useState<number | null>(null);
  const [isAdvancingCard, setIsAdvancingCard] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const cardOperationsRef = useRef(createStudyCardOperations());
  const sessionGenerationRef = useRef(0);
  const ratingLockedRef = useRef(false);
  const settledCardRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnswerRef = useRef<{
    attemptId: string;
    rating: number;
    responseTimeMs: number;
  } | null>(null);
  const cardStartedAtRef = useRef(Date.now());
  const shellRef = useRef<HTMLDivElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const backFaceScrollRef = useRef<HTMLDivElement | null>(null);

  const currentWord = queue[currentIndex];
  const reviewPreview = reviewWords.slice(0, 3);
  const nextReviewMessage = reviewPreview.length > 0
    ? '今夜か明日の最初に、この単語だけ先に見直すと流れを戻しやすいです。'
    : '苦手カードは出ていません。明日1回だけ軽く確認すれば十分です。';
  const reportDialogMode = isMobileViewport ? 'fullscreen' : 'sheet';

  const resetStudyScrollPosition = () => {
    if (!isMobileViewport || typeof window === 'undefined') return;

    const apply = () => {
      window.scrollTo({ top: 0, behavior: 'auto' });
      backFaceScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    };

    apply();
    window.requestAnimationFrame(apply);
    window.setTimeout(apply, 60);
    window.setTimeout(apply, 220);
  };

  const cancelCardOperations = () => {
    cardOperationsRef.current.invalidate();
    setIsSavingEdit(false);
    setIsSubmittingReport(false);
  };

  const resetCard = () => {
    cancelCardOperations();
    setSelectedRating(null);
    setIsFlipped(false);
    setShowTranslation(false);
    setShowHints(false);
    setIsEditing(false);
    setEditError(null);
    setReportError(null);
    setReportReason('');
    setShowReportModal(false);
    setReportNotice(null);
  };

  useEffect(() => {
    setSupports3D(getSupports3D());
  }, []);

  useLayoutEffect(() => {
    const calculate = () => {
      if (typeof window === 'undefined') return;
      const shell = shellRef.current;
      const actionBar = actionBarRef.current;
      if (!shell || !actionBar) return;

      const shellTop = shell.getBoundingClientRect().top;
      const actionHeight = actionBar.getBoundingClientRect().height;
      const nextHeight = Math.max(96, Math.min(608, Math.round((window.visualViewport?.height ?? window.innerHeight) + (window.visualViewport?.offsetTop ?? 0) - shellTop - actionHeight - 20)));
      setMobileShellHeight(nextHeight);
    };

    calculate();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calculate) : null;
    if (shellRef.current && observer) observer.observe(shellRef.current);
    if (actionBarRef.current && observer) observer.observe(actionBarRef.current);
    window.visualViewport?.addEventListener('resize', calculate);
    window.visualViewport?.addEventListener('scroll', calculate);
    window.addEventListener('resize', calculate);
    window.addEventListener('orientationchange', calculate);

    return () => {
      observer?.disconnect();
      window.visualViewport?.removeEventListener('resize', calculate);
      window.visualViewport?.removeEventListener('scroll', calculate);
      window.removeEventListener('resize', calculate);
      window.removeEventListener('orientationchange', calculate);
    };
  }, [currentIndex, loading, isAdvancingCard, isEditing, isFlipped, isMobileViewport, saveError, showHints]);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      let bestVoice = voices.find((voice) => voice.name === 'Google US English');
      if (!bestVoice) bestVoice = voices.find((voice) => voice.name === 'Samantha');
      if (!bestVoice) bestVoice = voices.find((voice) => voice.lang === 'en-US');
      setSelectedVoice(bestVoice || null);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    const generation = ++sessionGenerationRef.current;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setRewardNotice(null);
    setQueue([]);
    setSessionWordCount(0);
    setCurrentIndex(0);
    setIsFinished(false);
    setIsBookOwner(false);
    setBookTitle(null);
    setReviewWords([]);
    setUpdatedUser(null);
    setEarnedXP(null);
    setStreakBonusXP(null);
    setLeveledUp(false);
    setIsAdvancingCard(false);
    ratingLockedRef.current = false;
    settledCardRef.current = null;
    pendingAnswerRef.current = null;
    resetCard();

    const loadWords = async () => {
      try {
        const smartSession = getSmartSessionConfig(bookId);
        const limit = normalizeStudySessionLimit(taskIntent?.limit, smartSession?.limit ?? 10);
        const data = smartSession
          ? await learningService.getDailySessionWords(user.uid, limit, taskIntent || undefined)
          : await learningService.getBookSession(user.uid, bookId, limit, taskIntent || undefined);
        if (cancelled || generation !== sessionGenerationRef.current) return;
        setQueue(data);
        setSessionWordCount(data.length);
        setLoading(false);

        // Editing permission is optional context; its failure must not hide a loaded lesson.
        if (!smartSession) {
          try {
            const books = await learningService.getBooks();
            if (cancelled || generation !== sessionGenerationRef.current) return;
            const currentBook = books.find((book) => book.id === bookId);
            setBookTitle(currentBook?.title || null);
            let isMine = false;
            try {
              isMine = JSON.parse(currentBook?.description || '{}').createdBy === user.uid;
            } catch {
              // A legacy free-text description is not proof of ownership.
            }
            setIsBookOwner(isMine);
          } catch {
            // Server authorization remains authoritative; editing stays disabled.
          }
        }
      } catch {
        if (cancelled || generation !== sessionGenerationRef.current) return;
        setLoadError('学習する単語を読み込めませんでした。通信を確認して、もう一度お試しください。');
        setLoading(false);
      }
    };
    void loadWords();
    return () => {
      cancelled = true;
      sessionGenerationRef.current += 1;
      cardOperationsRef.current.invalidate();
      if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
    };
  }, [bookId, taskIntent, user.uid, loadAttempt]);

  useEffect(() => {
    if (!loading && currentWord && !isFinished) {
      cardStartedAtRef.current = Date.now();
    }
  }, [currentIndex, currentWord, isFinished, loading]);

  useLayoutEffect(() => {
    if (!isMobileViewport || loading || isFinished) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      resetStudyScrollPosition();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentIndex, isFinished, isMobileViewport, loading]);

  const closeBack = () => {
    if (!isEditing && !isAdvancingCard) {
      setIsFlipped(false);
    }
  };

  const handleExit = () => {
    onSessionComplete(updatedUser || user);
  };

  const replaceCurrentWord = (operation: StudyCardOperation, patch: Partial<WordData>) => {
    setQueue((previous) => cardOperationsRef.current.isCurrent(operation)
      ? previous.map((word, index) => index === operation.index && word.id === operation.wordId ? { ...word, ...patch } : word)
      : previous);
  };

  const startEditing = (event: MouseEvent) => {
    event.stopPropagation();
    if (!currentWord || loading || isFinished || ratingLockedRef.current) return;
    cancelCardOperations();
    setEditError(null);
    setReportError(null);
    if (!isBookOwner) {
      setReportReason('');
      setShowReportModal(true);
      return;
    }
    setEditWord(currentWord.word);
    setEditDef(currentWord.definition);
    setIsEditing(true);
  };

  const cancelEditing = (event: MouseEvent) => {
    event.stopPropagation();
    if (isSavingEdit) return;
    setIsEditing(false);
  };

  const saveEditing = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!currentWord || !isBookOwner || !editWord.trim() || !editDef.trim()) return;
    const operation = cardOperationsRef.current.begin('edit', currentWord.id, currentIndex);
    if (!operation) return;
    const updated: WordData = { ...currentWord, word: editWord, definition: editDef };
    setIsSavingEdit(true);
    setEditError(null);
    try {
      await learningService.updateWord(updated);
      if (!cardOperationsRef.current.isCurrent(operation)) return;
      const changed = currentWord.word !== updated.word || currentWord.definition !== updated.definition;
      replaceCurrentWord(operation, {
        word: updated.word, definition: updated.definition,
        ...(changed && (currentWord.exampleGeneratedAt || currentWord.exampleAuditStatus)
          ? { exampleSentence: null, exampleMeaning: null, exampleAuditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED }
          : {}),
        ...(changed && (currentWord.exampleImageGeneratedAt || currentWord.exampleImageAuditStatus)
          ? { exampleImageUrl: null, exampleImageAuditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED }
          : {}),
      });
      setIsEditing(false);
    } catch {
      if (cardOperationsRef.current.isCurrent(operation)) setEditError('変更を保存できませんでした。内容を残したまま、もう一度保存できます。');
    } finally {
      if (cardOperationsRef.current.finish(operation)) setIsSavingEdit(false);
    }
  };

  const submitReport = async () => {
    if (!currentWord || !reportReason.trim()) return;
    const operation = cardOperationsRef.current.begin('report', currentWord.id, currentIndex);
    if (!operation) return;
    setIsSubmittingReport(true);
    setReportError(null);
    try {
      await learningService.reportWord(currentWord.id, reportReason);
      if (!cardOperationsRef.current.isCurrent(operation)) return;
      setShowReportModal(false);
      setReportReason('');
      setReportNotice('報告ありがとうございます。講師・管理者が確認し、必要に応じて修正します。');
    } catch {
      if (cardOperationsRef.current.isCurrent(operation)) setReportError('報告の送信を確認できませんでした。入力内容は残っています。');
    } finally {
      if (cardOperationsRef.current.finish(operation)) setIsSubmittingReport(false);
    }
  };

  const handleRating = async (rating: number) => {
    if (!currentWord || loading || isFinished || isEditing || showReportModal || ratingLockedRef.current || settledCardRef.current === currentIndex) return;
    const generation = sessionGenerationRef.current;
    const isCurrentSession = () => generation === sessionGenerationRef.current;
    ratingLockedRef.current = true;
    const acceptedAt = Date.now();
    cancelCardOperations();
    setIsAdvancingCard(true);
    setSaveError(null);
    const answer = pendingAnswerRef.current ?? {
      attemptId: crypto.randomUUID(),
      rating,
      responseTimeMs: Math.min(3_600_000, Math.max(0, Date.now() - cardStartedAtRef.current)),
    };
    pendingAnswerRef.current = answer;
    setSelectedRating(answer.rating);
    let advancing = false;
    try {
      await learningService.saveSRSHistory(
        user.uid,
        currentWord,
        answer.rating,
        answer.responseTimeMs,
        taskIntent?.missionAssignmentId,
        taskIntent?.intentType,
        answer.attemptId,
      );
      if (!isCurrentSession()) return;
      const feedbackRemainingMs = getRemainingStudyRatingFeedbackMs(acceptedAt);
      if (feedbackRemainingMs > 0) {
        await new Promise<void>((resolve) => {
          advanceTimerRef.current = setTimeout(resolve, feedbackRemainingMs);
        });
      }
      if (!isCurrentSession()) return;
      settledCardRef.current = currentIndex;
      if (answer.rating <= 1) {
        setReviewWords((previous) => (
          previous.some((word) => word.id === currentWord.id)
            ? previous
            : [...previous, currentWord]
        ));
      }
      const shouldRequeueInSession = answer.rating === 0;
      if (shouldRequeueInSession) setQueue((previous) => [...previous, currentWord]);

      if (currentIndex < queue.length - 1 || shouldRequeueInSession) {
        advancing = true;
        advanceTimerRef.current = setTimeout(() => {
          if (!isCurrentSession()) return;
          resetCard();
          pendingAnswerRef.current = null;
          setCurrentIndex((previous) => previous + 1);
          ratingLockedRef.current = false;
          setIsAdvancingCard(false);
          resetStudyScrollPosition();
        }, 0);
      } else {
        try {
          const { baseXP, bonusXP, totalXP } = calculateStudySessionXp(sessionWordCount, user.stats?.currentStreak ?? 0);
          const result = await learningService.addXP(user, totalXP);
          if (!isCurrentSession()) return;
          setEarnedXP(baseXP);
          setStreakBonusXP(bonusXP);
          setLeveledUp(result.leveledUp);
          setUpdatedUser(result.user);
        } catch {
          if (!isCurrentSession()) return;
          // XP has no server receipt yet. A lost response must not trigger another award.
          setRewardNotice('学習は保存済みです。XPの反映は確認できませんでした。ホームで確認できます。');
        }
        if (!isCurrentSession()) return;
        setIsFinished(true);
        try {
          const snapshot = await learningService.getDashboardSnapshot(user.uid);
          if (isCurrentSession()) setWeaknessSummary(buildWeaknessSessionSummary(snapshot.weaknessProfile));
        } catch {
          if (isCurrentSession()) setWeaknessSummary('学習傾向を取得できませんでした。ホームで確認できます。');
        }
      }
    } catch {
      if (isCurrentSession()) {
        setSaveError('回答の保存を確認できませんでした。同じ回答をもう一度保存できます。');
      }
    } finally {
      if (isCurrentSession() && !advancing) {
        ratingLockedRef.current = false;
        setIsAdvancingCard(false);
      }
    }
  };

  const speakText = (event: MouseEvent, text: string) => {
    event.stopPropagation();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const openBack = () => {
    if (!isEditing && !isAdvancingCard) {
      setIsFlipped(true);
    }
  };

  return {
    actionBarRef,
    backFaceScrollRef,
    bookTitle,
    closeBack,
    currentIndex,
    currentWord,
    editDef,
    editError,
    editWord,
    earnedXP,
    handleExit,
    handleRating,
    isAdvancingCard,
    isBookOwner,
    isEditing,
    isSavingEdit,
    isSubmittingReport,
    isFinished,
    isFlipped,
    isMobileViewport,
    leveledUp,
    loading,
    loadError,
    retryLoad: () => setLoadAttempt((previous) => previous + 1),
    saveError,
    selectedRating,
    retrySave: () => handleRating(pendingAnswerRef.current?.rating ?? 0),
    rewardNotice,
    mobileShellHeight,
    nextReviewMessage,
    onBackToDashboard: handleExit,
    openBack,
    queue,
    reportDialogMode,
    reportNotice,
    reportError,
    reportReason,
    resetCard,
    reviewPreview,
    sessionWordCount,
    setEditDef,
    setEditWord,
    setIsEditing,
    setReportNotice,
    setReportReason,
    setShowHints,
    setShowReportModal,
    setShowTranslation,
    shellRef,
    showHints,
    showReportModal,
    showTranslation,
    speakText,
    startEditing,
    streakBonusXP,
    submitReport,
    supports3D,
    weaknessSummary,
    saveEditing,
    cancelEditing,
    taskIntent,
    updatedUser,
  };
};

export default useStudyModeController;
