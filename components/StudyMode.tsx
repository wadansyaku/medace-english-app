import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Clock,
  Edit2,
  Flag,
  Image as ImageIcon,
  Languages,
  Loader2,
  RotateCw,
  Save,
  Sparkles,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { EnglishLevel, type LearningTaskIntent, type UserProfile, type WordData } from '../types';
import { storage } from '../services/storage';
import { type GeneratedContext, generateGeminiSentence, generateWordImage } from '../services/gemini';
import { getSmartSessionConfig, isSmartSessionBookId } from '../shared/studySession';
import { buildWeaknessSessionSummary } from '../shared/weakness';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import MobileSheetDialog from './mobile/MobileSheetDialog';
import MobileStickyActionBar from './mobile/MobileStickyActionBar';

interface StudyModeProps {
  user: UserProfile;
  bookId: string;
  taskIntent?: LearningTaskIntent | null;
  onBack: () => void;
  onSessionComplete: (user: UserProfile) => void;
}

function HelpCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <path d="M12 17h.01"></path>
    </svg>
  );
}

type RatingTone = {
  id: number;
  label: string;
  className: string;
  icon: React.ReactNode;
};

const RATING_OPTIONS: RatingTone[] = [
  { id: 0, label: 'もう一度', className: 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100', icon: <AlertCircle className="h-5 w-5" /> },
  { id: 1, label: '難しい', className: 'border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100', icon: <HelpCircleIcon /> },
  { id: 2, label: '普通', className: 'border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100', icon: <Clock className="h-5 w-5" /> },
  { id: 3, label: '簡単', className: 'border-green-100 bg-green-50 text-green-600 hover:bg-green-100', icon: <Zap className="h-5 w-5" /> },
];

const getSupports3D = (): boolean => {
  if (typeof window === 'undefined') return true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supports3D = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('transform-style', 'preserve-3d')
    && CSS.supports('perspective', '1px');
  return !reducedMotion && supports3D;
};

const StudyMode: React.FC<StudyModeProps> = ({ user, bookId, taskIntent, onBack, onSessionComplete }) => {
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

  const contextCache = useRef<Map<string, GeneratedContext | null>>(new Map());
  const cardStartedAtRef = useRef(Date.now());

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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const backFaceScrollRef = useRef<HTMLDivElement | null>(null);

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
          data = await storage.getDailySessionWords(user.uid, taskIntent?.limit || smartSession.limit, taskIntent || undefined);
          setIsBookOwner(false);
        } else {
          data = await storage.getBookSession(user.uid, bookId, taskIntent?.limit || 10, taskIntent || undefined);
          const books = await storage.getBooks();
          const currentBook = books.find((book) => book.id === bookId);
          if (currentBook) {
            setBookContext(currentBook.sourceContext);
            try {
              const isMine = (currentBook.description?.includes(user.uid))
                || (JSON.parse(currentBook.description || '{}').createdBy === user.uid);
              setIsBookOwner(!!isMine);
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
            await storage.updateWordCache(current.id, context.english, context.japanese);
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
            return storage.updateWordCache(nextWord.id, context.english, context.japanese);
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

  const currentWord = queue[currentIndex];
  const reviewPreview = reviewWords.slice(0, 3);
  const nextReviewMessage = reviewPreview.length > 0
    ? '今夜か明日の最初に、この単語だけ先に見直すと流れを戻しやすいです。'
    : '苦手カードは出ていません。明日1回だけ軽く確認すれば十分です。';

  useEffect(() => {
    if (!loading && currentWord && !isFinished) {
      cardStartedAtRef.current = Date.now();
    }
  }, [currentIndex, currentWord, isFinished, loading]);

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

  useLayoutEffect(() => {
    if (!isMobileViewport || loading || isFinished) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      resetStudyScrollPosition();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentIndex, isFinished, isMobileViewport, loading]);

  const resetCard = () => {
    setIsFlipped(false);
    setAiContext(null);
    setAiImage(null);
    setShowTranslation(false);
    setShowHints(false);
    setImageHintUnavailable(false);
    setIsEditing(false);
  };

  const closeBack = () => {
    if (!isEditing && !isAdvancingCard) {
      setIsFlipped(false);
    }
  };

  const handleExit = () => {
    onSessionComplete(updatedUser || user);
  };

  const startEditing = (event: React.MouseEvent) => {
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

  const cancelEditing = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsEditing(false);
  };

  const saveEditing = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!currentWord || !editWord.trim() || !editDef.trim()) return;
    const updated: WordData = { ...currentWord, word: editWord, definition: editDef };
    await storage.updateWord(updated);
    const nextQueue = [...queue];
    nextQueue[currentIndex] = updated;
    setQueue(nextQueue);
    setIsEditing(false);
  };

  const submitReport = async () => {
    if (!currentWord || !reportReason.trim()) return;
    await storage.reportWord(currentWord.id, reportReason);
    setShowReportModal(false);
    setReportReason('');
    setReportNotice('報告ありがとうございます。講師・管理者が確認し、必要に応じて修正します。');
  };

  const handleRating = async (rating: number) => {
    if (!currentWord || isAdvancingCard) return;
    await storage.saveSRSHistory(
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
      const result = await storage.addXP(user, totalXP);
      try {
        const snapshot = await storage.getDashboardSnapshot(user.uid);
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

  const generateImage = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!currentWord || aiImage || aiImageLoading) return;
    setAiImageLoading(true);
    const imageBase64 = await generateWordImage(currentWord.word, currentWord.definition);
    setAiImage(imageBase64);
    setImageHintUnavailable(!imageBase64);
    setAiImageLoading(false);
  };

  const speakText = (event: React.MouseEvent, text: string) => {
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

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <div className="h-10 w-10 animate-spin rounded-full border-t-2 border-medace-500"></div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="mb-2 text-lg font-bold text-slate-700">学習対象の単語はありません</p>
        <button onClick={onBack} className="rounded-lg bg-medace-600 px-6 py-2 font-bold text-white">ダッシュボードに戻る</button>
      </div>
    );
  }

  if (!currentWord) return null;

  if (isFinished) {
    if (isMobileViewport) {
      return (
        <div className="bg-[#fff8f1] px-1 pb-28 pt-1">
          <div className="mx-auto max-w-xl space-y-4">
            <section className="rounded-[28px] bg-white px-5 py-5 shadow-xl">
              <div className="flex flex-col items-center text-center">
                {leveledUp && (
                  <div className="mb-3 inline-flex rounded-full bg-medace-500 px-4 py-2 text-xs font-black text-white shadow-lg">
                    LEVEL UP!
                  </div>
                )}
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <Award className={`h-8 w-8 ${leveledUp ? 'text-yellow-500' : 'text-green-600'}`} />
                </div>
                <h2 className="text-[1.7rem] font-black tracking-tight text-slate-950">クエスト完了！</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {sessionWordCount}語を進めました。次に直すところだけ見れば十分です。
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-medace-50 px-4 py-2 text-sm font-bold text-medace-700">
                  +{earnedXP + streakBonusXP} XP
                  {streakBonusXP > 0 && <span className="text-medace-500">連続学習ボーナス込み</span>}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Next Action</div>
              <div className="mt-3 grid gap-3">
                <div className="rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4">
                  <div className="text-sm font-bold text-slate-900">次の復習タイミング</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-600">{nextReviewMessage}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-sm font-bold text-slate-900">明日の入り方</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-600">
                    最初の3分だけでいいので、今日の苦手カードから触ると続けやすいです。
                  </div>
                </div>
                <div className="rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4">
                  <div className="text-sm font-bold text-slate-900">今日の弱点フォーカス</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-600">{weaknessSummary}</div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Review Preview</div>
              {reviewPreview.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {reviewPreview.map((word) => (
                    <div key={word.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-bold text-slate-900">{word.word}</div>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">今夜もう一度</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{word.definition}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                  もう一度に回す単語はありません。このまま次の学習に進めます。
                </div>
              )}
            </section>
          </div>

          <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur">
            <button
              data-testid="study-finish-exit"
              onClick={handleExit}
              className="w-full rounded-2xl bg-medace-600 px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-medace-700"
            >
              ダッシュボードに戻る
            </button>
          </MobileStickyActionBar>
        </div>
      );
    }

    return (
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[32px] bg-white p-6 shadow-2xl animate-in zoom-in duration-500 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-50 via-white to-white"></div>
        <div className="relative z-10">
          <div className="flex flex-col items-center text-center">
            {leveledUp && <div className="mb-4 animate-bounce"><span className="inline-block rounded-full bg-medace-500 px-4 py-2 text-sm font-black text-white shadow-lg">LEVEL UP!</span></div>}
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 shadow-inner">
              <Award className={`h-10 w-10 ${leveledUp ? 'text-yellow-500' : 'text-green-600'}`} />
            </div>
            <h2 className="text-3xl font-black text-slate-900">クエスト完了！</h2>
            <p className="mt-2 text-sm text-slate-500">{sessionWordCount}語を進めました。次に直すところだけ見れば十分です。</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-medace-50 px-4 py-2 text-sm font-bold text-medace-700">
              +{earnedXP + streakBonusXP} XP {streakBonusXP > 0 && <span className="text-medace-500">連続学習ボーナス込み</span>}
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次に見直す単語</div>
              {reviewPreview.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {reviewPreview.map((word) => (
                    <div key={word.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-bold text-slate-900">{word.word}</div>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">今夜もう一度</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{word.definition}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                  もう一度に回す単語はありません。このまま次の学習に進めます。
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-medace-100 bg-[#fff8ef] p-5">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次の一手</div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-white px-4 py-4">
                  <div className="font-bold text-slate-900">次の復習タイミング</div>
                  <div className="mt-1 leading-relaxed">{nextReviewMessage}</div>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4">
                  <div className="font-bold text-slate-900">明日の入り方</div>
                  <div className="mt-1 leading-relaxed">最初の3分だけでいいので、今日の苦手カードから触ると続けやすいです。</div>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4">
                  <div className="font-bold text-slate-900">今日の弱点フォーカス</div>
                  <div className="mt-1 leading-relaxed">{weaknessSummary}</div>
                </div>
              </div>
            </div>
          </div>

          <button onClick={handleExit} className="mt-8 w-full rounded-2xl bg-medace-600 px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-medace-700">
            ダッシュボードに戻る
          </button>
        </div>
      </div>
    );
  }

  const reportDialogMode = isMobileViewport ? 'fullscreen' : 'sheet';
  const frontFace = (
    <section
      data-testid="study-card-front"
      aria-hidden={isFlipped}
      className="study-card-face border border-slate-200 bg-white px-5 py-5 shadow-xl transition-shadow hover:shadow-2xl sm:px-8 sm:py-8"
      onClick={openBack}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">単語</div>
          <button
            onClick={(event) => speakText(event, currentWord.word)}
            className="rounded-full bg-orange-50 p-3 text-medace-500 transition-colors hover:bg-medace-100"
          >
            <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h2 className="break-words text-3xl font-black tracking-tight text-slate-800 sm:text-5xl">{currentWord.word}</h2>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs font-medium text-slate-400">
          カードか下のボタンで答えを確認
        </div>
      </div>
    </section>
  );
  const backFace = (
    <section
      data-testid="study-card-back"
      aria-hidden={!isFlipped}
      className="study-card-face study-card-face-back border border-medace-300 bg-medace-500 px-4 py-4 text-white shadow-xl sm:px-6 sm:py-5"
      onClick={closeBack}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-200">意味</div>
            <div className="mt-2 text-base font-black text-white/95 sm:text-lg">{currentWord.word}</div>
          </div>
          {!isEditing ? (
            <button
              onClick={startEditing}
              className={`rounded-full border border-white/15 p-2 transition-colors ${isBookOwner ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-white/70 hover:bg-red-500/20 hover:text-red-100'}`}
              title={isBookOwner ? '定義を編集' : '問題を報告する'}
            >
              {isBookOwner ? <Edit2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={saveEditing} className="rounded-full border border-white/15 p-2 text-green-200 transition-colors hover:bg-white/10 hover:text-green-100"><Save className="h-4 w-4" /></button>
              <button onClick={cancelEditing} className="rounded-full border border-white/15 p-2 text-red-200 transition-colors hover:bg-white/10 hover:text-red-100"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        <div className="mt-3 shrink-0 rounded-[24px] border border-white/10 bg-white/8 px-4 py-4">
          {isEditing ? (
            <div className="flex flex-col gap-3" onClick={(event) => event.stopPropagation()}>
              <input
                type="text"
                value={editWord}
                onChange={(event) => setEditWord(event.target.value)}
                className="w-full rounded-2xl border border-white/20 bg-white/10 p-3 text-white"
              />
              <textarea
                value={editDef}
                onChange={(event) => setEditDef(event.target.value)}
                className="h-28 w-full resize-none rounded-2xl border border-white/20 bg-white/10 p-3 text-white"
              />
            </div>
          ) : (
            <p className="text-center text-[1.35rem] font-black leading-snug text-white sm:text-3xl">{currentWord.definition}</p>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-hidden">
          <div ref={backFaceScrollRef} className="h-full overflow-y-auto pr-1 scrollbar-hide">
          {!showHints ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowHints(true);
              }}
              className="flex min-h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/6 px-4 py-5 text-center text-white/78 transition-colors hover:bg-white/10"
            >
              <Sparkles className="h-5 w-5 text-medace-300" />
              <span className="text-sm font-bold">まだ難しいときだけヒントを見る</span>
              <span className="text-xs text-white/60">例文・訳・画像ヒントをあとから開けます</span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white/68">
                <span>ヒントを表示中</span>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowHints(false);
                  }}
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white/82 transition-colors hover:bg-white/10"
                >
                  閉じる
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                {aiContextLoading ? (
                  <div className="flex flex-col items-center gap-2 py-4 text-medace-200">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-xs">AI例文を生成中...</span>
                  </div>
                ) : aiContext ? (
                  <div className="text-center">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-medace-200">
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        AI例文 {bookContext && `(${bookContext.slice(0, 15)}...)`}
                      </span>
                      <button onClick={(event) => speakText(event, aiContext.english)} className="transition-colors hover:text-white"><Volume2 className="h-4 w-4" /></button>
                    </div>
                    <p className="mb-3 text-base font-medium leading-relaxed text-white/88 sm:text-lg">"{aiContext.english}"</p>

                    {showTranslation ? (
                      <p className="animate-in fade-in border-t border-white/10 pt-2 text-xs text-white/70 sm:text-sm">{aiContext.japanese}</p>
                    ) : (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowTranslation(true);
                        }}
                        className="mx-auto flex items-center justify-center gap-1 text-xs text-white/65 transition-colors hover:text-white"
                      >
                        <Languages className="h-3 w-3" /> 訳を表示
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-xs text-white/60">このカードは単語と意味に集中しましょう。</p>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                {aiImageLoading ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-medace-200">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-xs text-center">AIイメージ生成中...</span>
                  </div>
                ) : aiImage ? (
                  <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-white/5">
                    <img src={aiImage} alt="視覚的記憶補助" className="h-full w-full object-contain opacity-90 transition-opacity hover:opacity-100" />
                  </div>
                ) : imageHintUnavailable ? (
                  <p className="px-4 py-6 text-center text-xs text-white/60">画像ヒントは今は利用できません。</p>
                ) : (
                  <button onClick={generateImage} className="group flex h-full w-full flex-col items-center justify-center gap-2 py-6 text-white/65 transition-colors hover:text-white">
                    <div className="rounded-full bg-white/10 p-2 transition-colors group-hover:bg-white/18">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-center">画像ヒントを表示</span>
                  </button>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl pb-20 md:pb-24">
      {showReportModal && (
        <MobileSheetDialog
          onClose={() => setShowReportModal(false)}
          mode={reportDialogMode}
          panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-md sm:rounded-[28px] sm:border sm:border-medace-100 sm:shadow-2xl"
        >
          <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[28px] sm:px-6">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <Flag className="h-5 w-5 text-red-500" /> 問題を報告
            </h3>
            <p className="mt-3 text-sm text-slate-500">
              不適切な例文や間違いを報告してください。講師が確認後、修正を行います。
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <textarea
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              className="h-32 w-full rounded-2xl border border-slate-200 p-3 text-sm"
              placeholder="例: 例文が古文として不自然です / 意味が間違っています"
            />
          </div>
          <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[28px]">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setShowReportModal(false)} className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-700">キャンセル</button>
              <button onClick={submitReport} disabled={!reportReason.trim()} className="min-h-11 rounded-2xl bg-red-500 px-4 py-3 font-bold text-white disabled:opacity-50">報告する</button>
            </div>
          </MobileStickyActionBar>
        </MobileSheetDialog>
      )}

      {reportNotice && (
        <MobileSheetDialog
          onClose={() => setReportNotice(null)}
          mode={reportDialogMode}
          panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-md sm:rounded-[28px] sm:border sm:border-medace-100 sm:shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
        >
          <div className="flex-1 px-4 py-8 sm:px-6 sm:py-6">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Report Saved</div>
            <h3 className="mt-3 text-xl font-black text-slate-950">報告を受け付けました</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{reportNotice}</p>
          </div>
          <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[28px]">
            <button
              onClick={() => setReportNotice(null)}
              className="w-full rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-700"
            >
              閉じる
            </button>
          </MobileStickyActionBar>
        </MobileSheetDialog>
      )}

      <div className="mb-3 flex items-center justify-between gap-3 md:mb-6">
        <button onClick={onBack} className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">中断</span>
        </button>
        <div className="flex items-center gap-2">
          {(isSmartSessionBookId(bookId) || taskIntent) && (
            <span className="flex items-center gap-1 rounded bg-medace-100 px-2 py-1 text-xs font-bold text-medace-700">
              <Zap className="h-3 w-3" /> {taskIntent?.label || getSmartSessionConfig(bookId)?.badgeLabel}
            </span>
          )}
          <span className="rounded-full bg-medace-50 px-3 py-1 font-mono text-sm text-medace-700">
            {currentIndex + 1} / {queue.length}
          </span>
        </div>
      </div>

      <div
        ref={shellRef}
        className="study-card-shell"
        style={mobileShellHeight ? { height: mobileShellHeight, minHeight: mobileShellHeight } : undefined}
      >
        <div className="study-card-3d">
          <div className={`study-card-inner ${isFlipped ? 'is-flipped' : ''} ${supports3D ? '' : 'instant-swap'}`}>
            {supports3D ? (
              <>
                {frontFace}
                {backFace}
              </>
            ) : (
              isFlipped ? backFace : frontFace
            )}
          </div>
        </div>
      </div>

      <MobileStickyActionBar
        className="safe-pad-bottom mt-3 rounded-[28px] border border-slate-200 bg-white/94 px-3 pb-3 pt-3 shadow-[0_16px_32px_rgba(15,23,42,0.08)] md:mt-4 md:px-0 md:pb-0 md:pt-4"
      >
        {isFlipped && !isEditing ? (
          <div
            ref={actionBarRef}
            data-testid="study-rating-actions"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300"
          >
            {RATING_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid={`study-rate-${option.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleRating(option.id);
                }}
                disabled={isAdvancingCard}
                className={`flex min-h-12 flex-col items-center gap-1 rounded-2xl border p-3 text-xs font-bold transition-transform active:scale-95 disabled:opacity-60 ${option.className}`}
              >
                <span>{option.label}</span>
                {option.icon}
              </button>
            ))}
          </div>
        ) : (
          <div ref={actionBarRef} className="flex justify-center">
            <button
              data-testid="study-flip-button"
              onClick={openBack}
              disabled={isEditing || isAdvancingCard}
              className={`flex min-h-12 items-center gap-2 rounded-full px-8 py-4 font-bold shadow-lg transition-transform hover:scale-[1.01] ${
                isEditing || isAdvancingCard ? 'cursor-not-allowed bg-medace-200 text-medace-700/70' : 'bg-medace-600 text-white hover:bg-medace-700'
              }`}
            >
              <RotateCw className="h-5 w-5" /> 答えを確認
            </button>
          </div>
        )}
      </MobileStickyActionBar>
    </div>
  );
};

export default StudyMode;
