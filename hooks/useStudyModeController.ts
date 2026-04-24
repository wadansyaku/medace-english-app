import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { getSubscriptionPolicy } from '../config/subscription';
import { WordHintAssetType, type LearningTaskIntent, type UserProfile, type WordData } from '../types';
import { learningService } from '../services/learning';
import { type GeneratedContext } from '../services/gemini';
import { ApiError } from '../services/apiClient';
import { getSmartSessionConfig, isSmartSessionBookId } from '../shared/studySession';
import { resolveExampleTranslation } from '../shared/wordHintAssets';
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
  const subscriptionPolicy = getSubscriptionPolicy(user.subscriptionPlan);
  const [queue, setQueue] = useState<WordData[]>([]);
  const [sessionWordCount, setSessionWordCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isBookOwner, setIsBookOwner] = useState(false);
  const [aiContextLoading, setAiContextLoading] = useState(false);
  const [aiContext, setAiContext] = useState<GeneratedContext | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showHints, setShowHints] = useState(false);
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
  const canGenerateExampleHint = subscriptionPolicy.allowedAiActions.includes('generateGeminiSentence');
  const canGenerateImageHint = subscriptionPolicy.allowedAiActions.includes('generateWordImage');

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
    setAiContextLoading(false);
    setAiImageLoading(false);
    setExampleError(null);
    setImageError(null);
    setShowTranslation(false);
    setShowHints(false);
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

    const current = queue[currentIndex];
    if (!current) return;

    if (current.exampleSentence?.trim()) {
      const nextContext = {
        english: current.exampleSentence,
        japanese: resolveExampleTranslation(current),
      };
      contextCache.current.set(current.id, nextContext);
      setAiContext(nextContext);
    } else if (contextCache.current.has(current.id)) {
      setAiContext(contextCache.current.get(current.id) ?? null);
    } else {
      setAiContext(null);
    }

    setAiImage(current.exampleImageUrl || null);
    setAiContextLoading(false);
    setAiImageLoading(false);
    setExampleError(null);
    setImageError(null);
  }, [currentIndex, queue, showHints]);

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

  const resolveHintError = (error: unknown, fallback: string): string => {
    if (error instanceof ApiError || error instanceof Error) {
      return error.message || fallback;
    }
    return fallback;
  };

  const replaceCurrentWord = (nextWord: WordData) => {
    setQueue((previous) => previous.map((word, index) => (index === currentIndex ? nextWord : word)));
  };

  const generateExampleHint = async (forceRefresh = false) => {
    if (!currentWord || aiContextLoading) return;
    setAiContextLoading(true);
    setExampleError(null);

    try {
      const updated = await learningService.generateWordHintAsset({
        wordId: currentWord.id,
        assetType: WordHintAssetType.EXAMPLE,
        forceRefresh,
      });
      replaceCurrentWord(updated);

      if (updated.exampleSentence?.trim()) {
        const nextContext = {
          english: updated.exampleSentence,
          japanese: resolveExampleTranslation(updated),
        };
        contextCache.current.set(updated.id, nextContext);
        setAiContext(nextContext);
        setShowTranslation(false);
      } else {
        setAiContext(null);
        setExampleError('例文は作成できませんでした。');
      }
    } catch (error) {
      setExampleError(resolveHintError(error, '例文は作成できませんでした。'));
    } finally {
      setAiContextLoading(false);
    }
  };

  const generateImageHint = async (forceRefresh = false) => {
    if (!currentWord || aiImageLoading) return;
    setAiImageLoading(true);
    setImageError(null);

    try {
      const updated = await learningService.generateWordHintAsset({
        wordId: currentWord.id,
        assetType: WordHintAssetType.IMAGE,
        forceRefresh,
      });
      replaceCurrentWord(updated);
      setAiImage(updated.exampleImageUrl || null);
      if (!updated.exampleImageUrl) {
        setImageError('画像は作成できませんでした。');
      }
    } catch (error) {
      setImageError(resolveHintError(error, '画像は作成できませんでした。'));
    } finally {
      setAiImageLoading(false);
    }
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
    closeBack,
    currentIndex,
    currentWord,
    editDef,
    editWord,
    earnedXP,
    exampleError,
    canGenerateExampleHint,
    canGenerateImageHint,
    generateExampleHint,
    generateImageHint,
    handleExit,
    handleRating,
    imageError,
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
    updatedUser,
  };
};

export default useStudyModeController;
