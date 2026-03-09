
import React, { useState, useEffect, useRef } from 'react';
import { WordData, UserProfile, EnglishLevel } from '../types';
import { storage } from '../services/storage';
import { generateGeminiSentence, generateWordImage, GeneratedContext } from '../services/gemini';
import { ArrowLeft, RotateCw, Sparkles, Volume2, Clock, Zap, AlertCircle, Image as ImageIcon, Loader2, Award, Lock, Languages, Edit2, Save, X, Flame, Flag } from 'lucide-react';

interface StudyModeProps {
  user: UserProfile;
  bookId: string;
  onBack: () => void;
  onSessionComplete: (user: UserProfile) => void;
}

const StudyMode: React.FC<StudyModeProps> = ({ user, bookId, onBack, onSessionComplete }) => {
  const [queue, setQueue] = useState<WordData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isBookOwner, setIsBookOwner] = useState(false);
  const [bookContext, setBookContext] = useState<string | undefined>(undefined);
  
  // AI States (Current Card)
  const [aiContext, setAiContext] = useState<GeneratedContext | null>(null);
  const [aiContextLoading, setAiContextLoading] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [imageHintUnavailable, setImageHintUnavailable] = useState(false);
  
  // AI Cache (Prefetching)
  const contextCache = useRef<Map<string, GeneratedContext | null>>(new Map());
  const cardStartedAtRef = useRef(Date.now());
  
  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editWord, setEditWord] = useState('');
  const [editDef, setEditDef] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Completion & Gamification States
  const [isFinished, setIsFinished] = useState(false);
  const [earnedXP, setEarnedXP] = useState(0);
  const [streakBonusXP, setStreakBonusXP] = useState(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [updatedUser, setUpdatedUser] = useState<UserProfile | null>(null);
  const [reviewWords, setReviewWords] = useState<WordData[]>([]);

  // Voice Setup
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Voice Initialization
  useEffect(() => {
    const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) return;
        let bestVoice = voices.find(v => v.name === 'Google US English');
        if (!bestVoice) bestVoice = voices.find(v => v.name === 'Samantha');
        if (!bestVoice) bestVoice = voices.find(v => v.lang === 'en-US');
        setSelectedVoice(bestVoice || null);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Load Queue & Ownership Check
  useEffect(() => {
    const loadWords = async () => {
      try {
        let data: WordData[] = [];
        if (bookId === 'smart-session') {
            data = await storage.getDailySessionWords(user.uid, 20);
            setIsBookOwner(false); 
        } else {
            data = await storage.getBookSession(user.uid, bookId, 10);
            
            // Check ownership & context
            const books = await storage.getBooks();
            const currentBook = books.find(b => b.id === bookId);
            if (currentBook) {
                setBookContext(currentBook.sourceContext); // Load context
                try {
                    const isMine = (currentBook.description?.includes(user.uid)) || 
                                   (JSON.parse(currentBook.description || '{}').createdBy === user.uid);
                    setIsBookOwner(!!isMine);
                } catch (e) {
                    setIsBookOwner(false);
                }
            }
        }
        setQueue(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadWords();
  }, [bookId, user.uid]);

  // Prefetch Logic (Context-Aware)
  useEffect(() => {
    if (queue.length === 0 || !showHints) return;

    let cancelled = false;

    const loadHints = async () => {
      const current = queue[currentIndex];

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
        if (!cancelled) {
          setAiContextLoading(true);
        }
        try {
          const ctx = await generateGeminiSentence(current.word, current.definition, userLevel, bookContext);
          contextCache.current.set(current.id, ctx);
          if (!cancelled) {
            setAiContext(ctx ?? null);
          }
          if (ctx) {
            void storage.updateWordCache(current.id, ctx.english, ctx.japanese);
          }
        } finally {
          if (!cancelled) {
            setAiContextLoading(false);
          }
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
        .then((ctx) => {
          contextCache.current.set(nextWord.id, ctx);
          if (ctx) {
            return storage.updateWordCache(nextWord.id, ctx.english, ctx.japanese);
          }
        })
        .catch(() => {});
    };

    loadHints();

    return () => {
      cancelled = true;
    };
  }, [queue, currentIndex, user.englishLevel, bookContext, showHints]);


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

  // Edit Handlers
  const startEditing = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isBookOwner) {
          // If official, open Report Modal instead
          setReportReason('');
          setShowReportModal(true);
          return;
      }
      setEditWord(currentWord.word);
      setEditDef(currentWord.definition);
      setIsEditing(true);
  };

  const submitReport = async () => {
      if (!reportReason.trim()) return;
      await storage.reportWord(currentWord.id, reportReason);
      alert("報告ありがとうございます。\n講師・管理者が確認し、必要に応じて修正します。");
      setShowReportModal(false);
  };

  const cancelEditing = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(false);
  };

  const saveEditing = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!editWord.trim() || !editDef.trim()) return;

      const updated: WordData = { ...currentWord, word: editWord, definition: editDef };
      await storage.updateWord(updated);

      const newQueue = [...queue];
      newQueue[currentIndex] = updated;
      setQueue(newQueue);
      setIsEditing(false);
  };

  const handleRating = async (rating: number) => {
    if (!currentWord) return;
    await storage.saveSRSHistory(
      user.uid,
      currentWord,
      rating,
      Math.max(0, Date.now() - cardStartedAtRef.current),
    );
    if (rating <= 1) {
      setReviewWords((prev) => prev.some((word) => word.id === currentWord.id) ? prev : [...prev, currentWord]);
    }
    if (currentIndex < queue.length - 1) {
        resetCard();
        setTimeout(() => setCurrentIndex(prev => prev + 1), 200);
    } else {
        finishSession();
    }
  };
  
  const finishSession = async () => {
      const baseXP = queue.length * 10;
      const currentStreak = user.stats?.currentStreak || 0;
      const bonusMultiplier = Math.min(currentStreak, 10) * 0.1; 
      const bonusXP = Math.round(baseXP * bonusMultiplier);
      const totalXP = baseXP + bonusXP;

      const result = await storage.addXP(user, totalXP);
      setEarnedXP(baseXP);
      setStreakBonusXP(bonusXP);
      setLeveledUp(result.leveledUp);
      setUpdatedUser(result.user); 
      setIsFinished(true);
  };

  const handleExit = () => {
      onSessionComplete(updatedUser || user);
  };

  const resetCard = () => {
    setIsFlipped(false);
    setAiContext(null); 
    setAiImage(null);
    setShowTranslation(false);
    setShowHints(false);
    setImageHintUnavailable(false);
    setIsEditing(false);
  }

  const generateImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (aiImage || aiImageLoading) return;
    setAiImageLoading(true);
    const imageBase64 = await generateWordImage(currentWord.word, currentWord.definition);
    setAiImage(imageBase64);
    setImageHintUnavailable(!imageBase64);
    setAiImageLoading(false);
  };

  const speakText = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 0.9; 
    window.speechSynthesis.speak(utterance);
  };

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-10 w-10 border-medace-500 border-t-2"></div></div>;

  if (queue.length === 0) return (
    <div className="text-center p-10">
      <p className="text-lg font-bold text-slate-700 mb-2">学習対象の単語はありません</p>
      <button onClick={onBack} className="px-6 py-2 bg-medace-600 text-white rounded-lg font-bold">ダッシュボードに戻る</button>
    </div>
  );

  if (isFinished) return (
    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[32px] bg-white p-8 shadow-2xl animate-in zoom-in duration-500">
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-50 via-white to-white"></div>
        <div className="relative z-10">
            <div className="flex flex-col items-center text-center">
                {leveledUp && <div className="mb-4 animate-bounce"><span className="inline-block rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 px-4 py-2 text-sm font-black text-white shadow-lg">LEVEL UP!</span></div>}
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 shadow-inner">
                    <Award className={`h-10 w-10 ${leveledUp ? 'text-yellow-500' : 'text-green-600'}`} />
                </div>
                <h2 className="text-3xl font-black text-slate-900">クエスト完了！</h2>
                <p className="mt-2 text-sm text-slate-500">{queue.length}語を進めました。次に直すところだけ見れば十分です。</p>
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
                    </div>
                </div>
            </div>

            <button onClick={handleExit} className="mt-8 w-full rounded-2xl bg-medace-600 px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-medace-700">
                ダッシュボードに戻る
            </button>
        </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      
      {/* Report Modal */}
      {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-medace-900/35 p-4 backdrop-blur-sm" onClick={() => setShowReportModal(false)}>
              <div className="w-full max-w-md rounded-2xl border border-medace-100 bg-white p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <Flag className="w-5 h-5 text-red-500" /> 問題を報告
                  </h3>
                  <p className="text-sm text-slate-500 mb-4">
                      不適切な例文や間違いを報告してください。講師が確認後、修正を行います。
                  </p>
                  <textarea 
                    value={reportReason}
                    onChange={e => setReportReason(e.target.value)}
                    className="w-full h-24 border p-3 rounded-lg mb-4 text-sm"
                    placeholder="例: 例文が古文として不自然です / 意味が間違っています"
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setShowReportModal(false)} className="flex-1 rounded-lg bg-medace-50 py-2 font-bold text-medace-800">キャンセル</button>
                      <button onClick={submitReport} disabled={!reportReason.trim()} className="flex-1 py-2 bg-red-500 text-white rounded-lg font-bold disabled:opacity-50">報告する</button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex items-center justify-between mb-4 md:mb-6">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium">
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">中断</span>
        </button>
        <div className="flex items-center gap-2">
            {bookId === 'smart-session' && <span className="bg-medace-100 text-medace-700 text-xs font-bold px-2 py-1 rounded flex items-center gap-1"><Zap className="w-3 h-3" /> デイリークエスト</span>}
            <span className="rounded-full bg-medace-50 px-3 py-1 font-mono text-sm text-medace-700">
            {currentIndex + 1} / {queue.length}
            </span>
        </div>
      </div>

      <div 
        className="relative w-full min-h-[50vh] md:h-[550px] cursor-pointer group perspective-1000 mb-6 md:mb-8"
        onClick={() => { if(!isEditing) setIsFlipped(!isFlipped); }}
      >
        <div className={`card-inner w-full h-full transition-transform duration-500 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`} 
             style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)', transformStyle: 'preserve-3d' }}>
          
          {/* Front */}
          <div className="card-front absolute w-full h-full bg-white rounded-3xl shadow-xl border border-slate-200 flex flex-col items-center justify-center backface-hidden p-4 md:p-8 hover:shadow-2xl transition-shadow">
            <div className="text-slate-400 text-xs md:text-sm font-bold uppercase tracking-widest mb-4 md:mb-6">単語</div>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-800 mb-4 md:mb-6 tracking-tight text-center break-words max-w-full">{currentWord.word}</h2>
            <div className="flex gap-3">
                <button onClick={(e) => speakText(e, currentWord.word)} className="p-3 rounded-full bg-orange-50 text-medace-500 hover:bg-medace-100 transition-colors">
                <Volume2 className="w-6 h-6" />
                </button>
            </div>
            <p className="absolute bottom-6 text-slate-300 text-xs font-medium">タップして裏返す</p>
          </div>

          {/* Back */}
          <div className="card-back absolute flex h-full w-full flex-col overflow-hidden rounded-3xl bg-[linear-gradient(145deg,#2F1609_0%,#66321A_45%,#F66D0B_100%)] shadow-xl backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
            <div className="p-4 md:p-8 flex flex-col h-full overflow-y-auto scrollbar-hide relative">
                
                <div className="flex justify-between w-full mb-2 md:mb-4 relative z-10">
                    <div className="text-medace-400 text-xs md:text-sm font-bold uppercase tracking-widest">意味</div>
                    {!isEditing ? (
                        <button 
                            onClick={startEditing}
                            className={`p-1 transition-colors ${isBookOwner ? 'text-white/55 hover:text-white' : 'text-white/55 hover:text-red-200'}`}
                            title={isBookOwner ? "定義を編集" : "問題を報告する"}
                        >
                            {isBookOwner ? <Edit2 className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={saveEditing} className="text-green-400 hover:text-green-300"><Save className="w-5 h-5" /></button>
                            <button onClick={cancelEditing} className="text-red-400 hover:text-red-300"><X className="w-5 h-5" /></button>
                        </div>
                    )}
                </div>

                {isEditing ? (
                    <div className="flex flex-col gap-4 mb-6" onClick={(e) => e.stopPropagation()}>
                        <div>
                            <input type="text" value={editWord} onChange={(e) => setEditWord(e.target.value)} className="w-full rounded border border-white/20 bg-white/10 p-2 text-white" />
                        </div>
                        <div>
                            <textarea value={editDef} onChange={(e) => setEditDef(e.target.value)} className="h-24 w-full resize-none rounded border border-white/20 bg-white/10 p-2 text-white" />
                        </div>
                    </div>
                ) : (
                    <p className="text-2xl md:text-3xl text-white font-bold mb-4 md:mb-6 text-center">{currentWord.definition}</p>
                )}

                <div className="grid grid-cols-1 gap-3 flex-grow content-start">
                    {!showHints ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowHints(true);
                            }}
                            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/6 px-4 py-5 text-center text-white/78 transition-colors hover:bg-white/10"
                        >
                            <Sparkles className="h-5 w-5 text-medace-300" />
                            <span className="text-sm font-bold">まだ難しいときだけヒントを見る</span>
                            <span className="text-xs text-white/60">例文・訳・画像ヒントをあとから開けます</span>
                        </button>
                    ) : (
                        <>
                            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white/68" onClick={(e) => e.stopPropagation()}>
                                <span>ヒントを表示中</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowHints(false);
                                    }}
                                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white/82 transition-colors hover:bg-white/10"
                                >
                                    閉じる
                                </button>
                            </div>

                            <div className="relative flex w-full flex-col rounded-xl border border-white/10 bg-white/10 p-3 transition-colors hover:bg-white/12 md:p-4" onClick={(e) => e.stopPropagation()}>
                                {aiContextLoading ? (
                                    <div className="flex flex-col items-center gap-2 py-4 text-medace-400 animate-pulse">
                                        <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-xs">AI例文を生成中...</span>
                                    </div>
                                ) : aiContext ? (
                                    <div className="text-center">
                                        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-medace-400">
                                            <span className="flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                AI例文 {bookContext && `(${bookContext.slice(0,15)}...)`}
                                            </span>
                                            <button onClick={(e) => speakText(e, aiContext.english)} className="transition-colors hover:text-white"><Volume2 className="w-4 h-4" /></button>
                                        </div>
                                        <p className="mb-3 text-base font-medium leading-relaxed text-white/88 md:text-lg">"{aiContext.english}"</p>

                                        {showTranslation ? (
                                            <p className="animate-in fade-in border-t border-white/10 pt-2 text-xs text-white/70 md:text-sm">{aiContext.japanese}</p>
                                        ) : (
                                            <button onClick={() => setShowTranslation(true)} className="mx-auto flex items-center justify-center gap-1 text-xs text-white/65 transition-colors hover:text-white">
                                                <Languages className="w-3 h-3" /> 訳を表示
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-center text-xs text-white/60">このカードは単語と意味に集中しましょう。</p>
                                )}
                            </div>

                            <div className="relative flex min-h-[100px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/10 transition-colors hover:bg-white/12 md:min-h-[120px]" onClick={(e) => e.stopPropagation()}>
                                {aiImageLoading ? (
                                    <div className="flex flex-col items-center gap-2 text-blue-400 animate-pulse">
                                        <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-xs text-center">AIイメージ生成中...</span>
                                    </div>
                                ) : aiImage ? (
                                    <div className="relative h-32 w-full group md:h-40">
                                        <img src={aiImage} alt="視覚的記憶補助" className="h-full w-full object-contain opacity-90 transition-opacity group-hover:opacity-100" />
                                    </div>
                                ) : imageHintUnavailable ? (
                                    <p className="px-4 text-center text-xs text-white/60">画像ヒントは今は利用できません。</p>
                                ) : (
                                    <button onClick={generateImage} className="group flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-white/65 transition-colors hover:text-white">
                                        <div className="rounded-full bg-white/10 p-2 transition-colors group-hover:bg-white/18">
                                            <ImageIcon className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs font-bold text-center">画像ヒントを表示</span>
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
          </div>
        </div>
      </div>

      {isFlipped && !isEditing ? (
        <div className="grid grid-cols-4 gap-2 md:gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <button onClick={() => handleRating(0)} className="flex flex-col items-center gap-1 p-2 md:p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 hover:bg-red-100 active:scale-95 transition-transform"><span className="text-[10px] md:text-xs font-bold">もう一度</span><AlertCircle className="w-5 h-5 mt-1" /></button>
            <button onClick={() => handleRating(1)} className="flex flex-col items-center gap-1 rounded-xl border border-amber-100 bg-amber-50 p-2 text-amber-700 transition-transform active:scale-95 hover:bg-amber-100 md:p-3"><span className="text-[10px] font-bold md:text-xs">難しい</span><HelpCircleIcon /></button>
            <button onClick={() => handleRating(2)} className="flex flex-col items-center gap-1 p-2 md:p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 hover:bg-blue-100 active:scale-95 transition-transform"><span className="text-[10px] md:text-xs font-bold">普通</span><Clock className="w-5 h-5 mt-1" /></button>
            <button onClick={() => handleRating(3)} className="flex flex-col items-center gap-1 p-2 md:p-3 bg-green-50 text-green-600 rounded-xl border border-green-100 hover:bg-green-100 active:scale-95 transition-transform"><span className="text-[10px] md:text-xs font-bold">簡単</span><Zap className="w-5 h-5 mt-1" /></button>
        </div>
      ) : (
        <div className="flex justify-center pb-6 md:pb-0">
             <button onClick={() => { if(!isEditing) setIsFlipped(true); }} disabled={isEditing} className={`flex items-center gap-2 rounded-full px-8 py-4 font-bold shadow-lg transition-transform hover:scale-105 ${isEditing ? 'cursor-not-allowed bg-medace-200' : 'bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] text-white'}`}>
                <RotateCw className="w-5 h-5" /> 答えを確認
            </button>
        </div>
      )}
    </div>
  );
};

const HelpCircleIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>);

export default StudyMode;
