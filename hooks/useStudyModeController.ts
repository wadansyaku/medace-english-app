import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { EnglishLevel, type LearningTaskIntent, type UserProfile, type WordData } from '../types';
import { learningService } from '../services/learning';
import { type GeneratedContext, generateGeminiSentence, generateWordImage } from '../services/gemini';
import { getSmartSessionConfig, isSmartSessionBookId } from '../shared/studySession';
import { buildWeaknessSessionSummary } from '../shared/weakness';
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
  const [isBookOwner, setIsBookOwner] = useState(false);
  const [bookContext, setBookContext] = useState<string | undefined>(undefined);
  const [aiContext, setAiContext] = useState<GeneratedContext | null>(null);
  const [aiContextLoading, setAiContextLoading] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [imageHintUnavailable, setImageHintUnavailable] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editWord, setEditWord] = useState('');
  const [editDef, setEditDef] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [earnedXP, setEarnedXP] = useState(0);
  const [streakBonusXP, setStreakBonusXP] = useState(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [updatedUser, setUpdatedUser] = useState<UserProfile | null>(null);
  const [reviewWords, setReviewWords] = useState<WordData[]>([]);
  const [weaknessSummary, setWeaknessSummary] = useState(buildWeaknessSessionSummary(null));
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [supports3D, setSupports3D] = useState(true);
  const [mobileShellHeight, setMobileShellHeight] = useState<number | null>(null);
  const [isAdvancingCard, setIsAdvancingCard] = useState(false);

  const contextCache = useRef<Map<string, GeneratedContext | null>>(new Map());
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

  const resetCard = () => {
    setIsFlipped(false);
    setAiContext(null);
    setAiImage(null);
    setShowTranslation(false);
    setShowHints(false);
    setImageHintUnavailable(false);
    setIsEditing(false);
  };

  useEffect(() => {
    setSupports3D(getSupports3D());
  }, []);

  useLayoutEffect(() => {
    if (!isMobileViewport) {
      setMobileShellHeight(null);
      return undefined;
    }

    const calculate = () => {
      if (typeof window === 'undefined') return;
      const shell = shellRef.current;
      const actionBar = actionBarRef.current;
      if (!shell || !actionBar) return;

      const shellTop = shell.getBoundingClientRect().top;
      const actionHeight = actionBar.getBoundingClientRect().height;
      const nextHeight = Math.max(320, Math.round(window.innerHeight - shellTop - actionHeight - 12));
      setMobileShellHeight(nextHeight);
    };

    calculate();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calculate) : null;
    if (shellRef.current && observer) observer.observe(shellRef.current);
    if (actionBarRef.current && observer) observer.observe(actionBarRef.current);
    window.addEventListener('resize', calculate);
    window.addEventListener('orientationchange', calculate);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', calculate);
      window.removeEventListener('orientationchange', calculate);
    };
  }, [isEditing, isFlipped, isMobileViewport, showHints]);

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
    const loadWords = async () => {
      try {
        let data: WordData[] = [];
        const smartSession = getSmartSessionConfig(bookId);
        if (smartSession) {
          data = await learningService.getDailySessionWords(user.uid, taskIntent?.limit || smartSession.limit, taskIntent || undefined);
          setIsBookOwner(false);
        } else {
          data = await learningService.getBookSession(user.uid, bookId, taskIntent?.limit || 10, taskIntent || undefined);
          const books = await learningService.getBooks();
          const currentBook = books.find((book) => book.id === bookId);
          if (currentBook) {
            setBookContext(currentBook.sourceContext);
            try {
              const isMine = (currentBook.description?.includes(user.uid))
                || (JSON.parse(currentBook.description || '{}').createdBy === user.uid);
              setIsBookOwner(Boolean(isMine));
            } catch {
              setIsBookOwner(false);
            }
          }
        }
        setQueue(data);
        setSessionWordCount(data.length);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void loadWords();
  }, [bookId, taskIntent, user.uid]);

  useEffect(() => {
    if (queue.length === 0 || !showHints) return;

    let cancelled = false;
    const loadHints = async () => {
      const current = queue[currentIndex];
      if (!current) return;

      if (current.exampleSentence && current.exampleMeaning && !contextCache.current.has(current.id)) {
        contextCache.current.set(current.id, {
          english: current.exampleSentence,
          japanese: current.exampleMeaning,
        });
      }

      const userLevel = user.englishLevel || EnglishLevel.B1;
      const cached = contextCache.current.get(current.id);

      if (contextCache.current.has(current.id)) {
        if (!cancelled) {
          setAiContext(cached ?? null);
          setAiContextLoading(false);
        }
      } else {
        if (!cancelled) setAiContextLoading(true);
        try {
          const context = await generateGeminiSentence(current.word, current.definition, userLevel, bookContext);
          contextCache.current.set(current.id, context);
          if (!cancelled) setAiContext(context ?? null);
          if (context) {
            await learningService.updateWordCache(current.id, context.english, context.japanese);
          }
        } finally {
          if (!cancelled) setAiContextLoading(false);
        }
      }

      const nextWord = queue[currentIndex + 1];
      if (!nextWord || contextCache.current.has(nextWord.id)) return;

      if (nextWord.exampleSentence && nextWord.exampleMeaning) {
        contextCache.current.set(nextWord.id, {
          english: nextWord.exampleSentence,
          japanese: nextWord.exampleMeaning,
        });
        return;
      }

      generateGeminiSentence(nextWord.word, nextWord.definition, userLevel, bookContext)
        .then((context) => {
          contextCache.current.set(nextWord.id, context);
          if (context) {
            return learningService.updateWordCache(nextWord.id, context.english, context.japanese);
          }
          return undefined;
        })
        .catch(() => {});
    };

    void loadHints();
    return () => {
      cancelled = true;
    };
  }, [bookContext, currentIndex, queue, showHints, user.englishLevel]);

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

  const startEditing = (event: MouseEvent) => {
    event.stopPropagation();
    if (!currentWord) return;
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
    setIsEditing(false);
  };

  const saveEditing = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!currentWord || !editWord.trim() || !editDef.trim()) return;
    const updated: WordData = { ...currentWord, word: editWord, definition: editDef };
    await learningService.updateWord(updated);
    const nextQueue = [...queue];
    nextQueue[currentIndex] = updated;
    setQueue(nextQueue);
    setIsEditing(false);
  };

  const submitReport = async () => {
    if (!currentWord || !reportReason.trim()) return;
    await learningService.reportWord(currentWord.id, reportReason);
    setShowReportModal(false);
    setReportReason('');
    setReportNotice('報告ありがとうございます。講師・管理者が確認し、必要に応じて修正します。');
  };

  const handleRating = async (rating: number) => {
    if (!currentWord || isAdvancingCard) return;
    await learningService.saveSRSHistory(
      user.uid,
      currentWord,
      rating,
      Math.max(0, Date.now() - cardStartedAtRef.current),
      taskIntent?.missionAssignmentId,
      taskIntent?.intentType,
    );
    if (rating <= 1) {
      setReviewWords((previous) => (
        previous.some((word) => word.id === currentWord.id)
          ? previous
          : [...previous, currentWord]
      ));
    }
    const shouldRequeueInSession = rating === 0;
    if (shouldRequeueInSession) {
      setQueue((previous) => [...previous, currentWord]);
    }

    if (currentIndex < queue.length - 1 || shouldRequeueInSession) {
      setIsAdvancingCard(true);
      window.setTimeout(() => {
        resetCard();
        setCurrentIndex((previous) => previous + 1);
        setIsAdvancingCard(false);
        resetStudyScrollPosition();
      }, supports3D ? 180 : 0);
    } else {
      const baseXP = sessionWordCount * 10;
      const currentStreak = user.stats?.currentStreak || 0;
      const bonusMultiplier = Math.min(currentStreak, 10) * 0.1;
      const bonusXP = Math.round(baseXP * bonusMultiplier);
      const totalXP = baseXP + bonusXP;
      const result = await learningService.addXP(user, totalXP);
      try {
        const snapshot = await learningService.getDashboardSnapshot(user.uid);
        setWeaknessSummary(buildWeaknessSessionSummary(snapshot.weaknessProfile));
      } catch {
        setWeaknessSummary(buildWeaknessSessionSummary(null));
      }
      setEarnedXP(baseXP);
      setStreakBonusXP(bonusXP);
      setLeveledUp(result.leveledUp);
      setUpdatedUser(result.user);
      setIsFinished(true);
    }
  };

  const generateImage = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!currentWord || aiImage || aiImageLoading) return;
    setAiImageLoading(true);
    const imageBase64 = await generateWordImage(currentWord.word, currentWord.definition);
    setAiImage(imageBase64);
    setImageHintUnavailable(!imageBase64);
    setAiImageLoading(false);
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
    aiContext,
    aiContextLoading,
    aiImage,
    aiImageLoading,
    backFaceScrollRef,
    bookContext,
    closeBack,
    currentIndex,
    currentWord,
    editDef,
    editWord,
    earnedXP,
    generateImage,
    handleExit,
    handleRating,
    imageHintUnavailable,
    isAdvancingCard,
    isBookOwner,
    isEditing,
    isFinished,
    isFlipped,
    isMobileViewport,
    leveledUp,
    loading,
    mobileShellHeight,
    nextReviewMessage,
    onBackToDashboard: handleExit,
    openBack,
    queue,
    reportDialogMode,
    reportNotice,
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
  };
};

export default useStudyModeController;
