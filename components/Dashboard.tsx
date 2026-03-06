
import React, { useEffect, useState } from 'react';
import { AccountOverview, BOOK_CATALOG_SOURCE_LABELS, BookCatalogSource, BookMetadata, BookProgress, UserProfile, UserGrade, EnglishLevel, LearningPlan, LearningPreference, LearningPreferenceIntensity, LEARNING_PREFERENCE_INTENSITY_LABELS, LeaderboardEntry, MasteryDistribution, ActivityLog, InstructorNotification, STATUS_LABELS, GRADE_LABELS, SUBSCRIPTION_PLAN_LABELS, SubscriptionPlan, UserStudyMode, USER_STUDY_MODE_LABELS } from '../types';
import { storage } from '../services/storage';
import { extractVocabularyFromText, extractVocabularyFromMedia, generateLearningPlan } from '../services/gemini';
import { BRAND } from '../config/brand';
import { isAdSupportedPlan, isBusinessPlan } from '../config/subscription';
import { Play, BookOpen, Star, Loader2, Zap, BrainCircuit, Trophy, Plus, Sparkles, FileText, Image as ImageIcon, UploadCloud, Flame, Trash2, Settings, RefreshCw, User, Book, Calendar, Target, ArrowRight, Library, ChevronDown, ChevronUp, BarChart, Activity, Edit2, X, Check, Medal, Crown } from 'lucide-react';
import Onboarding from './Onboarding';
import StudyCompanion from './StudyCompanion';
import PlanExperiencePanel from './PlanExperiencePanel';
import AdSenseSlot from './AdSenseSlot';

interface DashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
}

interface BookCardProps {
  book: BookMetadata;
  isMine?: boolean;
  progress: BookProgress;
  onDelete: (e: React.MouseEvent, bookId: string, bookTitle: string) => void;
  onSelect: (bookId: string, mode: 'study' | 'quiz') => void;
}

const BookCard: React.FC<BookCardProps> = ({ book, isMine, progress, onDelete, onSelect }) => {
  const catalogLabel = book.catalogSource ? BOOK_CATALOG_SOURCE_LABELS[book.catalogSource] : null;
  const isLicensed = book.catalogSource === BookCatalogSource.LICENSED_PARTNER;
  return (
      <div className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative h-full">
          <div className="p-6 flex-grow relative z-10">
              <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-lg ${book.isPriority ? 'bg-orange-100 text-medace-600' : 'bg-slate-100 text-slate-500'}`}>
                      <Book className="w-6 h-6" />
                  </div>
                  <div className="flex gap-2 items-center">
                      {progress.percentage >= 100 ? (
                              <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 border border-green-200">
                              <Trophy className="w-3 h-3 fill-current" /> 完了
                              </span>
                      ) : book.isPriority && (
                          <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 shadow-sm">
                          <Star className="w-3 h-3 fill-current" /> 推奨
                          </span>
                      )}
                      {isMine && (
                           <button 
                              onClick={(e) => onDelete(e, book.id, book.title)}
                              className="bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 p-1.5 rounded-full transition-all z-20 shadow-sm cursor-pointer"
                              title="削除する"
                           >
                               <Trash2 className="w-4 h-4" />
                           </button>
                      )}
                  </div>
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-1 group-hover:text-medace-600 transition-colors truncate" title={book.title}>{book.title}</h3>
              {catalogLabel && !isMine && (
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isLicensed ? 'bg-slate-900 text-white' : 'bg-medace-50 text-medace-700 border border-medace-100'}`}>
                    {catalogLabel}
                  </span>
                </div>
              )}
              <p className="text-sm text-slate-500 mb-5 line-clamp-2 h-10">
                 {isMine 
                    ? (book.sourceContext ? `AI分析: ${book.sourceContext}` : 'オリジナル単語帳') 
                    : (book.description || (isLicensed ? 'ビジネス版向けのライセンス教材' : 'ビジネス版向けの公式教材'))}
              </p>

              <div className="space-y-2">
                  <div className="flex justify-between text-sm font-bold text-slate-700">
                      <span>進捗率</span>
                      <span>{progress.percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-100 relative">
                      <div 
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${progress.percentage === 100 ? 'bg-green-500' : 'bg-medace-500'}`}
                      style={{ width: `${progress.percentage}%` }}
                      ></div>
                  </div>
                  <p className="text-xs text-slate-400 text-right font-mono">
                      {progress.learnedCount} <span className="text-slate-300">/</span> {progress.totalCount} 単語
                  </p>
              </div>
          </div>

          <div className="bg-slate-50 p-4 flex gap-3 border-t border-slate-100 relative z-10 mt-auto">
              <button 
              onClick={() => onSelect(book.id, 'study')}
              className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-medace-500 hover:text-medace-600 text-slate-700 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm"
              >
              <BookOpen className="w-4 h-4" /> 学習
              </button>
              <button 
              onClick={() => onSelect(book.id, 'quiz')}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-200 hover:bg-medace-600 hover:text-white text-slate-600 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm"
              >
              <Play className="w-4 h-4 fill-current" /> テスト
              </button>
          </div>
      </div>
  );
};

const ActivityBarChart: React.FC<{ logs: ActivityLog[], dailyGoal?: number }> = ({ logs, dailyGoal = 20 }) => {
    const today = new Date();
    const DAYS_TO_SHOW = 7; 
    
    const chartData = [];
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

    let maxCount = 0;

    for (let i = DAYS_TO_SHOW - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const log = logs.find(l => l.date === dateStr);
        const count = log ? log.count : 0;
        if (count > maxCount) maxCount = count;
        
        chartData.push({
            date: dateStr,
            dayLabel: weekDays[d.getDay()],
            count: count,
            isToday: i === 0,
            isGoalMet: count >= dailyGoal
        });
    }

    // Scale maxCount to accommodate goal line if needed
    maxCount = Math.max(maxCount, dailyGoal * 1.2, 10);

    // Calculate goal line position (%)
    const goalPercent = Math.min(100, Math.round((dailyGoal / maxCount) * 100));

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm relative">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <BarChart className="w-5 h-5 text-medace-500" /> 週間学習記録
                </h3>
                <div className="flex items-center gap-3">
                    {dailyGoal > 0 && (
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                            <div className="w-3 h-0 border-t-2 border-dashed border-slate-300"></div>
                            目標: {dailyGoal}語
                        </div>
                    )}
                    <div className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                        7日間合計: {logs.reduce((acc, l) => acc + l.count, 0)} 語
                    </div>
                </div>
            </div>
            
            <div className="w-full h-40 relative">
                {/* Goal Line */}
                {dailyGoal > 0 && (
                    <div 
                        className="absolute w-full border-t-2 border-dashed border-slate-300 z-0 opacity-50 transition-all duration-500"
                        style={{ bottom: `${goalPercent}%` }}
                    ></div>
                )}

                <div className="absolute inset-0 flex items-end justify-between gap-2 md:gap-4 z-10">
                    {chartData.map((data, idx) => {
                        const heightPercent = Math.round((data.count / maxCount) * 100);
                        return (
                            <div key={data.date} className="flex flex-col items-center flex-1 group cursor-pointer relative h-full justify-end">
                                {/* Tooltip */}
                                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                    {data.count} 単語
                                </div>
                                
                                {/* Bar */}
                                <div className="w-full bg-slate-50 rounded-t-md relative flex items-end overflow-hidden transition-all duration-300 hover:bg-slate-100" style={{ height: '100%' }}>
                                    <div 
                                        className={`w-full rounded-t-md transition-all duration-1000 ease-out absolute bottom-0 ${
                                            data.count === 0 ? 'bg-transparent' :
                                            data.isGoalMet ? 'bg-gradient-to-t from-medace-500 to-medace-400' : 
                                            data.isToday ? 'bg-slate-400' : 'bg-slate-300 group-hover:bg-slate-400'
                                        }`}
                                        style={{ height: `${heightPercent}%` }}
                                    >
                                        {data.isGoalMet && (
                                            <div className="w-full h-full opacity-20 bg-white animate-pulse"></div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Label */}
                                <div className={`mt-2 text-xs font-bold ${data.isToday ? 'text-medace-600' : 'text-slate-400'}`}>
                                    {data.dayLabel}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// Helper for League Calculation
const getLeague = (level: number) => {
    if (level >= 20) return { name: 'ゴールド', icon: <Crown className="w-3 h-3 fill-yellow-400 text-yellow-600" />, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    if (level >= 10) return { name: 'シルバー', icon: <Medal className="w-3 h-3 fill-slate-300 text-slate-500" />, color: 'bg-slate-100 text-slate-700 border-slate-200' };
    return { name: 'ブロンズ', icon: <Medal className="w-3 h-3 fill-orange-300 text-orange-600" />, color: 'bg-orange-50 text-orange-800 border-orange-200' };
};

const getTodayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());


const Dashboard: React.FC<DashboardProps> = ({ user, onSelectBook }) => {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [myBooks, setMyBooks] = useState<BookMetadata[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, BookProgress>>({});
  const [loading, setLoading] = useState(true);
  const [dueCount, setDueCount] = useState(0);
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  
  // Analytics & Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [masteryDist, setMasteryDist] = useState<MasteryDistribution | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [coachNotifications, setCoachNotifications] = useState<InstructorNotification[]>([]);
  const [accountOverview, setAccountOverview] = useState<AccountOverview | null>(null);
  const [learningPreference, setLearningPreference] = useState<LearningPreference | null>(null);

  // Toggle State for Library
  const [showLibrary, setShowLibrary] = useState(false);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // Plan Edit Modal
  const [showPlanEditModal, setShowPlanEditModal] = useState(false);
  const [editDailyGoal, setEditDailyGoal] = useState(0);
  const [selectedPlanBooks, setSelectedPlanBooks] = useState<string[]>([]);

  // Create Modal State
  const [createMode, setCreateMode] = useState<'TEXT' | 'FILE'>('TEXT');
  const [rawText, setRawText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Profile Edit State
  const [editName, setEditName] = useState(user.displayName);
  const [editGrade, setEditGrade] = useState(user.grade || UserGrade.ADULT);
  const [editStudyMode, setEditStudyMode] = useState(user.studyMode || UserStudyMode.FOCUS);
  const [editTargetExam, setEditTargetExam] = useState('');
  const [editTargetScore, setEditTargetScore] = useState('');
  const [editExamDate, setEditExamDate] = useState('');
  const [editWeeklyStudyDays, setEditWeeklyStudyDays] = useState(4);
  const [editDailyStudyMinutes, setEditDailyStudyMinutes] = useState(20);
  const [editWeakSkillFocus, setEditWeakSkillFocus] = useState('');
  const [editMotivationNote, setEditMotivationNote] = useState('');
  const [editIntensity, setEditIntensity] = useState<LearningPreferenceIntensity>(LearningPreferenceIntensity.BALANCED);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (!user || !user.uid) return;
    loadDashboardData();
  }, [user]);

  // Initialize edit state when modal opens or plan loads
  useEffect(() => {
    if (learningPlan) {
      setEditDailyGoal(learningPlan.dailyWordGoal);
      setSelectedPlanBooks(learningPlan.selectedBookIds);
    }
  }, [learningPlan, showPlanEditModal]);

  useEffect(() => {
    if (!showSettingsModal) return;
    setEditName(user.displayName);
    setEditGrade(user.grade || UserGrade.ADULT);
    setEditStudyMode(user.studyMode || UserStudyMode.FOCUS);
    setEditTargetExam(learningPreference?.targetExam || '');
    setEditTargetScore(learningPreference?.targetScore || '');
    setEditExamDate(learningPreference?.examDate || '');
    setEditWeeklyStudyDays(learningPreference?.weeklyStudyDays || 4);
    setEditDailyStudyMinutes(learningPreference?.dailyStudyMinutes || 20);
    setEditWeakSkillFocus(learningPreference?.weakSkillFocus || '');
    setEditMotivationNote(learningPreference?.motivationNote || '');
    setEditIntensity(learningPreference?.intensity || LearningPreferenceIntensity.BALANCED);
  }, [showSettingsModal, user.displayName, user.grade, user.studyMode, learningPreference]);

  if (showOnboarding) {
      return <Onboarding 
                user={user} 
                isRetake={true}
                historySummary={`現在レベル: ${user.englishLevel}, XP: ${user.stats?.xp}, 学年・属性: ${GRADE_LABELS[user.grade || UserGrade.ADULT]}`}
                onComplete={(updated) => {
                    storage.updateSessionUser(updated); 
                    setShowOnboarding(false);
                    window.location.reload(); 
                }} 
             />;
  }

  const loadDashboardData = async () => {
      try {
        setLoading(true);
        const snapshot = await storage.getDashboardSnapshot(user.uid);
        setDueCount(snapshot.dueCount);
        setBooks(snapshot.officialBooks);
        setMyBooks(snapshot.myBooks);
        setProgressMap(snapshot.progressMap);
        setLearningPlan(snapshot.learningPlan);
        setLeaderboard(snapshot.leaderboard);
        setMasteryDist(snapshot.masteryDist);
        setActivityLogs(snapshot.activityLogs);
        setCoachNotifications(snapshot.coachNotifications);
        setAccountOverview(snapshot.accountOverview);
        setLearningPreference(snapshot.learningPreference);
      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setLoading(false);
      }
  };

  const handleGeneratePlan = async () => {
      setGeneratingPlan(true);
      try {
          const plan = await generateLearningPlan(user.grade || UserGrade.ADULT, user.englishLevel || EnglishLevel.B1, books, learningPreference);
          if (plan) {
              plan.uid = user.uid;
              await storage.saveLearningPlan(plan);
              setLearningPlan(plan);
          }
      } catch (e) {
          alert("プラン作成に失敗しました");
      } finally {
          setGeneratingPlan(false);
      }
  };

  const handleUpdatePlan = async () => {
      if (!learningPlan) return;
      const updated = { ...learningPlan, dailyWordGoal: editDailyGoal, selectedBookIds: selectedPlanBooks };
      await storage.saveLearningPlan(updated);
      setLearningPlan(updated);
      setShowPlanEditModal(false);
      alert("プランを更新しました");
  };

  const togglePlanBook = (bookId: string) => {
      if (selectedPlanBooks.includes(bookId)) {
          setSelectedPlanBooks(prev => prev.filter(id => id !== bookId));
      } else {
          setSelectedPlanBooks(prev => [...prev, bookId]);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setUploadFile(e.target.files[0]);
      }
  };

  const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1];
              resolve(base64);
          };
          reader.onerror = error => reject(error);
      });
  };

  const handleCreatePhrasebook = async () => {
    if (!newBookTitle) return;
    if (createMode === 'TEXT' && !rawText) return;
    if (createMode === 'FILE' && !uploadFile) return;

    setCreating(true);
    setErrorMsg(null);

    try {
        let result = { words: [], contextSummary: '' };

        if (createMode === 'TEXT') {
            // @ts-ignore
            result = await extractVocabularyFromText(rawText);
        } else if (createMode === 'FILE' && uploadFile) {
            const mimeType = uploadFile.type;
            if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
                throw new Error("対応していないファイル形式です。");
            }
            const base64 = await fileToBase64(uploadFile);
            // @ts-ignore
            result = await extractVocabularyFromMedia(base64, mimeType);
        }

        if (!result || result.words.length === 0) {
            throw new Error("単語を抽出できませんでした。");
        }

        const rows = result.words.map((item: any, index: number) => ({
            BookName: newBookTitle,
            Number: index + 1,
            Word: item.word,
            Meaning: item.definition
        }));

        await storage.batchImportWords(newBookTitle, rows, () => {}, user.uid, result.contextSummary);
        
        setRawText('');
        setNewBookTitle('');
        setUploadFile(null);
        setShowCreateModal(false);
        alert(`単語帳を作成しました！\nAI分析コンテキスト: "${result.contextSummary}"`);
        await loadDashboardData(); 

    } catch (e: any) {
        console.error(e);
        const msg = e.message || "作成に失敗しました。";
        setErrorMsg(msg.includes('429') ? "AIの利用上限(RPM)に達しました。時間をおいてください。" : msg);
    } finally {
        setCreating(false);
    }
  };

  const handleDeleteBook = async (e: React.MouseEvent, bookId: string, bookTitle: string) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (window.confirm(`【確認】\n単語帳「${bookTitle}」を削除しますか？`)) {
          try {
              setMyBooks(prev => prev.filter(b => b.id !== bookId));
              await storage.deleteBook(bookId);
              await loadDashboardData();
          } catch (err) {
              alert("削除に失敗しました。");
              await loadDashboardData();
          }
      }
  };

  const handleSaveProfile = async () => {
      setIsSavingProfile(true);
      try {
          const updatedUser = {
            ...user,
            displayName: editName.trim() || user.displayName,
            grade: editGrade,
            studyMode: editStudyMode,
          };
          const nextPreference: LearningPreference = {
            userUid: user.uid,
            targetExam: editTargetExam.trim(),
            targetScore: editTargetScore.trim(),
            examDate: editExamDate || '',
            weeklyStudyDays: editWeeklyStudyDays,
            dailyStudyMinutes: editDailyStudyMinutes,
            weakSkillFocus: editWeakSkillFocus.trim(),
            motivationNote: editMotivationNote.trim(),
            intensity: editIntensity,
            updatedAt: Date.now(),
          };
          await storage.saveLearningPreference(nextPreference);
          await storage.updateSessionUser(updatedUser);
          setLearningPreference(nextPreference);
          alert("プロフィールを更新しました。");
          setShowSettingsModal(false);
          window.location.reload();
      } catch (e) {
          alert("更新に失敗しました");
      } finally {
          setIsSavingProfile(false);
      }
  };

  const plannedBooks = learningPlan && learningPlan.selectedBookIds.length > 0
    ? books.filter((book) => learningPlan.selectedBookIds.includes(book.id))
    : books.filter((book) => book.isPriority).slice(0, 3);
  const studyMode = user.studyMode || UserStudyMode.FOCUS;
  const isGameMode = studyMode === UserStudyMode.GAME;
  const todayKey = getTodayKey();
  const todayCount = activityLogs.find((log) => log.date === todayKey)?.count ?? 0;
  const weekTotal = activityLogs.reduce((sum, log) => sum + log.count, 0);
  const stabilizedWords = (masteryDist?.graduated ?? 0) + (masteryDist?.review ?? 0);
  const userLeague = getLeague(user.stats?.level || 1);
  const todayWordGoal = learningPlan?.dailyWordGoal ?? Math.min(Math.max(dueCount, 10), 20);
  const weeklyGoal = todayWordGoal * 7;
  const weeklyRemaining = Math.max(weeklyGoal - weekTotal, 0);
  const remainingWords = Math.max(todayWordGoal - todayCount, 0);
  const reviewFirstCount = dueCount > 0 ? Math.min(dueCount, Math.max(remainingWords, Math.min(todayWordGoal, 8))) : 0;
  const estimatedMinutes = Math.max(3, Math.ceil((remainingWords > 0 ? remainingWords : Math.max(6, Math.min(todayWordGoal, 10))) / 4));
  const todayProgressPercent = todayWordGoal > 0 ? Math.min(100, Math.round((todayCount / todayWordGoal) * 100)) : 0;
  const heroTitle = remainingWords > 0 ? `あと${remainingWords}語で今日の目標です` : '今日はここまでで十分です';
  const heroCopy = remainingWords > 0
    ? dueCount > 0
      ? `まずは復習待ちの ${reviewFirstCount} 語から始めれば、そのまま今日のノルマに入れます。`
      : '今日は短く区切って進めれば十分です。まずはクエストを1回だけ始めましょう。'
    : '余力があればテストかMy単語帳に進み、無理ならここで終えても流れは崩れません。';
  const questButtonLabel = remainingWords > 0 ? '今日のクエストを開始' : '復習をもう1セットやる';
  const currentPlan = accountOverview?.subscriptionPlan || user.subscriptionPlan || SubscriptionPlan.TOC_FREE;
  const showAdSlots = isAdSupportedPlan(currentPlan);
  const aiBudgetPercent = accountOverview
    ? Math.min(100, Math.round((accountOverview.aiUsage.estimatedCostMilliYen / Math.max(accountOverview.aiUsage.budgetMilliYen, 1)) * 100))
    : 0;
  const aiUsageLabel = aiBudgetPercent >= 85 ? '控えめに利用中' : aiBudgetPercent >= 55 ? '通常利用中' : 'ゆとりあり';
  const aiUsageCopy = aiBudgetPercent >= 85
    ? '今月は軽いAIサポートを中心にご利用いただく想定です。'
    : aiBudgetPercent >= 55
      ? '今月のAIサポートは通常どおりご利用いただけます。'
      : '今月のAIサポートは十分な余裕があります。';
  const preferenceSummaryParts = [
    learningPreference?.targetExam ? `目標: ${learningPreference.targetExam}` : null,
    learningPreference?.targetScore ? `目標点: ${learningPreference.targetScore}` : null,
    learningPreference?.examDate ? `試験日: ${learningPreference.examDate}` : null,
    learningPreference?.weakSkillFocus ? `重点: ${learningPreference.weakSkillFocus}` : null,
  ].filter(Boolean);
  const preferenceSummary = preferenceSummaryParts.length > 0
    ? preferenceSummaryParts.join(' / ')
    : '目標試験・学習時間・苦手分野を設定すると、プラン提案の精度が上がります。';
  const canShowAccountDetails = Boolean(accountOverview || showAdSlots);

  if (loading && books.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] text-medace-500">
        <Loader2 className="h-10 w-10 animate-spin mb-2" />
        <p className="text-sm font-medium">学習データを解析中...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in duration-500 relative pb-20">
        
        {/* MODALS */}
        
        {/* Plan Edit Modal */}
        {showPlanEditModal && learningPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-medace-900/35 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
                    <button onClick={() => setShowPlanEditModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">✕</button>
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Edit2 className="w-5 h-5" /> 学習プランの編集
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">1日の目標単語数</label>
                            <input 
                                type="number" 
                                value={editDailyGoal} 
                                onChange={e => setEditDailyGoal(Number(e.target.value))} 
                                className="w-full border border-slate-300 p-3 rounded-lg bg-white text-slate-800 font-bold text-xl focus:ring-2 focus:ring-medace-500 outline-none" 
                                min="5" max="100"
                            />
                            <p className="text-xs text-slate-400 mt-1">無理のない範囲で設定しましょう (推奨: 10-30単語)</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">学習対象のコースを選択</label>
                            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {books.map(b => (
                                    <div key={b.id} onClick={() => togglePlanBook(b.id)} className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 ${selectedPlanBooks.includes(b.id) ? 'bg-medace-50' : ''}`}>
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedPlanBooks.includes(b.id) ? 'bg-medace-500 border-medace-500 text-white' : 'border-slate-300 bg-white'}`}>
                                            {selectedPlanBooks.includes(b.id) && <Check className="w-3 h-3" />}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-slate-800">{b.title}</div>
                                            {b.isPriority && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">推奨</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">選択したコースから日々の問題が出題されます</p>
                        </div>

                        <button onClick={handleUpdatePlan} className="w-full py-3 bg-medace-600 text-white rounded-xl font-bold shadow-lg hover:bg-medace-700 transition-all">
                            設定を更新する
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-medace-900/35 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
                    <button onClick={() => setShowSettingsModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">✕</button>
                    <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                        <div className="bg-slate-100 p-2 rounded-full"><User className="w-6 h-6 text-slate-600" /></div>
                        <h3 className="text-xl font-bold text-slate-800">ユーザー設定</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">表示名</label>
                            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full border p-2 rounded-lg bg-white text-slate-800" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">学年・属性</label>
                            <select value={editGrade} onChange={e => setEditGrade(e.target.value as UserGrade)} className="w-full border p-2 rounded-lg bg-white text-slate-800">
                                {Object.values(UserGrade).map(g => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">表示モード</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[UserStudyMode.FOCUS, UserStudyMode.GAME].map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setEditStudyMode(mode)}
                                        className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                                            editStudyMode === mode
                                                ? 'border-medace-500 bg-medace-50 text-medace-900'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="text-sm font-bold">{USER_STUDY_MODE_LABELS[mode]}</div>
                                        <div className="mt-1 text-xs leading-relaxed text-slate-500">
                                            {mode === UserStudyMode.FOCUS
                                                ? '相棒・ランキングを隠して、今日やること中心で表示します。'
                                                : '相棒・ごほうび・ランキングを表示して達成感を強めます。'}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Personalization</div>
                            <div className="mt-3 grid gap-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" value={editTargetExam} onChange={e => setEditTargetExam(e.target.value)} placeholder="目標試験 例: 英検2級" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800" />
                                    <input type="text" value={editTargetScore} onChange={e => setEditTargetScore(e.target.value)} placeholder="目標点 例: 80点" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800" />
                                </div>
                                <input type="date" value={editExamDate} onChange={e => setEditExamDate(e.target.value)} className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800" />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="number" min="1" max="7" value={editWeeklyStudyDays} onChange={e => setEditWeeklyStudyDays(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} placeholder="週の学習日数" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800" />
                                    <input type="number" min="5" max="180" value={editDailyStudyMinutes} onChange={e => setEditDailyStudyMinutes(Math.max(5, Math.min(180, Number(e.target.value) || 5)))} placeholder="1日の学習時間(分)" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800" />
                                </div>
                                <input type="text" value={editWeakSkillFocus} onChange={e => setEditWeakSkillFocus(e.target.value)} placeholder="苦手分野 例: 長文、熟語、医療語彙" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800" />
                                <select value={editIntensity} onChange={e => setEditIntensity(e.target.value as LearningPreferenceIntensity)} className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800">
                                    {Object.values(LearningPreferenceIntensity).map((intensity) => (
                                        <option key={intensity} value={intensity}>{LEARNING_PREFERENCE_INTENSITY_LABELS[intensity]}</option>
                                    ))}
                                </select>
                                <textarea value={editMotivationNote} onChange={e => setEditMotivationNote(e.target.value)} placeholder="講師に伝えたいこと、学習背景、通学時間など" className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 h-20 resize-none" />
                                <p className="text-xs leading-relaxed text-slate-500">ここで設定した条件をもとに、AI学習プランと今日の導線を調整します。</p>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">現在のレベル</label>
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <span className="font-bold text-medace-600 text-lg">{user.englishLevel || '未診断'}</span>
                                <button onClick={() => setShowOnboarding(true)} className="text-xs bg-white border border-medace-200 text-medace-600 px-3 py-1.5 rounded-md font-bold hover:bg-medace-50 flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3" /> レベル診断を再受講
                                </button>
                            </div>
                        </div>
                        {accountOverview && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">現在のプラン</label>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="font-bold text-slate-800">{SUBSCRIPTION_PLAN_LABELS[accountOverview.subscriptionPlan]}</div>
                                    <div className="mt-1 text-xs text-slate-500">{accountOverview.audienceLabel} / {accountOverview.priceLabel}</div>
                                    <div className="mt-1 text-xs text-slate-500">{accountOverview.pricingNote}</div>
                                </div>
                            </div>
                        )}
                        <button onClick={handleSaveProfile} disabled={isSavingProfile} className="w-full py-3 bg-medace-700 text-white rounded-xl font-bold hover:bg-medace-800 transition-all mt-4 shadow-lg">
                            {isSavingProfile ? '保存中...' : '変更を保存'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-medace-900/35 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
                    <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold">✕</button>
                    <div className="text-center mb-6">
                        <div className="w-12 h-12 bg-medace-100 text-medace-600 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">My単語帳 作成</h3>
                        <p className="text-sm text-slate-500">AIが文脈を解析し、あなただけの教材を生成します</p>
                    </div>
                    {errorMsg && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2"><span className="mt-0.5">⚠️</span> {errorMsg}</div>
                    )}
                    <div className="space-y-4">
                         <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">タイトル</label>
                            <input type="text" className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-700 focus:ring-2 focus:ring-medace-500 outline-none" placeholder="例: 好きな洋楽の歌詞" value={newBookTitle} onChange={(e) => setNewBookTitle(e.target.value)} />
                         </div>
                         <div className="flex p-1 bg-slate-100 rounded-lg">
                             <button onClick={() => setCreateMode('TEXT')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${createMode === 'TEXT' ? 'bg-white text-medace-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                 <div className="flex items-center justify-center gap-2"><FileText className="w-4 h-4" /> テキスト入力</div>
                             </button>
                             <button onClick={() => setCreateMode('FILE')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${createMode === 'FILE' ? 'bg-white text-medace-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                 <div className="flex items-center justify-center gap-2"><ImageIcon className="w-4 h-4" /> 画像/PDF</div>
                             </button>
                         </div>
                         {createMode === 'TEXT' ? (
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">ソーステキスト</label>
                                <textarea className="w-full h-32 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-medace-500 outline-none resize-none text-slate-700" placeholder="ここに英文を貼り付けてください..." value={rawText} onChange={(e) => setRawText(e.target.value)} />
                             </div>
                         ) : (
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">ファイルをアップロード</label>
                                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-medace-500 transition-colors bg-slate-50">
                                    <input type="file" id="file-upload" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
                                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                        <UploadCloud className="w-8 h-8 text-slate-400" />
                                        <span className="text-sm font-bold text-slate-600">{uploadFile ? uploadFile.name : "クリックしてPDFまたは写真を選択"}</span>
                                    </label>
                                </div>
                             </div>
                         )}
                         <button onClick={handleCreatePhrasebook} disabled={creating || !newBookTitle} className="w-full py-3 bg-medace-600 text-white rounded-xl font-bold hover:bg-medace-700 transition-colors flex items-center justify-center gap-2 shadow-lg disabled:bg-slate-300 disabled:cursor-not-allowed">
                            {creating ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                            {creating ? "AIが文脈を分析中..." : "作成する"}
                         </button>
                    </div>
                </div>
            </div>
        )}

      <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#2F1609_0%,#66321A_42%,#F66D0B_100%)] p-7 md:p-8 text-white shadow-[0_24px_60px_rgba(228,94,4,0.18)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,191,82,0.34),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(252,215,151,0.24),_transparent_22%)]"></div>
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/70">
                {BRAND.productLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/88">
                {GRADE_LABELS[user.grade || UserGrade.ADULT]} / {user.englishLevel || '未診断'}
              </span>
              {isGameMode && (
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${userLeague.color}`}>
                  {userLeague.name}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 transition-colors hover:bg-white/10"
            >
              <Settings className="w-4 h-4" /> 設定・プロフィール
            </button>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-medace-200">Today Focus</p>
              <h2 className="mt-3 text-3xl md:text-4xl font-black tracking-tight leading-tight">今日やることは 1 つだけ</h2>
              <p className="mt-4 text-2xl font-black tracking-tight text-white">{heroTitle}</p>
              <p className="mt-4 max-w-2xl text-sm md:text-base leading-relaxed text-white/74">{heroCopy}</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Personalization</div>
                <div className="mt-2 text-sm leading-relaxed text-white/80">{preferenceSummary}</div>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={() => onSelectBook('smart-session', 'study')}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-medace-900 transition-colors hover:bg-medace-50"
                >
                  <Play className="w-4 h-4 fill-current" /> {questButtonLabel}
                </button>
                {learningPlan ? (
                  <button
                    onClick={() => setShowPlanEditModal(true)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/85 transition-colors hover:bg-white/10"
                  >
                    <Edit2 className="w-4 h-4" /> 今日のプランを見る
                  </button>
                ) : (
                  <button
                    onClick={handleGeneratePlan}
                    disabled={generatingPlan}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/85 transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {generatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    最初のプランを作る
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">今日の目安</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">残り</div>
                  <div className="mt-2 text-3xl font-black">{remainingWords}</div>
                  <div className="mt-1 text-sm text-white/68">語</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">復習待ち</div>
                  <div className="mt-2 text-3xl font-black">{dueCount}</div>
                  <div className="mt-1 text-sm text-white/68">語</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">目安時間</div>
                  <div className="mt-2 text-3xl font-black">{estimatedMinutes}</div>
                  <div className="mt-1 text-sm text-white/68">分</div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-white/60">
                  <span>今日の進み具合</span>
                  <span>{todayCount} / {todayWordGoal} 語</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#FCD797] to-white" style={{ width: `${todayProgressPercent}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">学習プラン</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {learningPlan ? '今日の学習プラン' : 'まだプラン未作成'}
            </h3>
          </div>
          {learningPlan && (
            <button onClick={() => setShowPlanEditModal(true)} className="rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 hover:text-medace-600">
              編集
            </button>
          )}
        </div>

        {learningPlan ? (
          <>
            <p className="mt-4 text-base font-bold text-medace-600">"{learningPlan.goalDescription}"</p>
            {learningPreference && (
              <div className="mt-4 rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4 text-sm text-medace-900">
                <div className="font-bold">プラン生成に使う条件</div>
                <div className="mt-1 leading-relaxed">{preferenceSummary}</div>
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">1日の目標</div>
                <div className="mt-2 text-2xl font-black text-slate-950">{learningPlan.dailyWordGoal}</div>
                <div className="text-sm text-slate-500">語 / 日</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">目標日</div>
                <div className="mt-2 text-lg font-black text-slate-950">{learningPlan.targetDate}</div>
                <div className="text-sm text-slate-500">完了予定</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">対象教材</div>
                <div className="mt-2 text-2xl font-black text-slate-950">{plannedBooks.length}</div>
                <div className="text-sm text-slate-500">優先教材</div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {plannedBooks.slice(0, 4).map((book) => (
                <span key={book.id} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
                  {book.title}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-3xl bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] px-5 py-5 text-white">
            <p className="text-sm leading-relaxed text-white/75">
              診断結果に加えて、目標試験・試験日・学習時間・苦手分野をもとに、毎日の単語数とコースを自動で提案します。
            </p>
            <button
              onClick={handleGeneratePlan}
              disabled={generatingPlan}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-medace-900 hover:bg-medace-50 disabled:opacity-50"
            >
              {generatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              プランを生成
            </button>
          </div>
        )}
      </section>

      {isGameMode && (
        <StudyCompanion
          user={user}
          dueCount={dueCount}
          todayCount={todayCount}
          weekTotal={weekTotal}
          dailyGoal={todayWordGoal}
          weeklyGoal={weeklyGoal}
          stabilizedWords={stabilizedWords}
          onStartQuest={() => onSelectBook('smart-session', 'study')}
        />
      )}

      {coachNotifications.length > 0 && (
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-7 shadow-sm">
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-5 h-5 text-medace-600" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">講師フォロー</p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師からのフォロー</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {coachNotifications.map((notification) => (
              <div key={notification.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-900">{notification.instructorName}</div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {notification.usedAi ? 'AI下書き' : '手動'}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{notification.message}</p>
                <div className="mt-4 text-xs text-slate-400">
                  {new Date(notification.createdAt).toLocaleString('ja-JP')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {canShowAccountDetails && (
        <div className="space-y-4">
          <button
            onClick={() => setShowAccountDetails((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-slate-50"
          >
            <div>
              <div className="text-sm font-bold text-slate-900">プラン・学習環境の詳細</div>
              <div className="mt-1 text-sm text-slate-500">課金情報やAI利用枠は必要なときだけ開けます。</div>
            </div>
            {showAccountDetails ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
          </button>

          {showAccountDetails && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
              {accountOverview && (
                <section className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-7 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">ご利用プラン</p>
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <h3 className="text-xl font-black tracking-tight text-slate-950">{SUBSCRIPTION_PLAN_LABELS[accountOverview.subscriptionPlan]}</h3>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                  {accountOverview.audienceLabel} / {accountOverview.priceLabel}
                </span>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {accountOverview.pricingNote}
              </div>
              <div className="mt-5">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      <span>AIサポート利用状況</span>
                      <span>{aiBudgetPercent}%</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-medace-300 to-medace-500" style={{ width: `${aiBudgetPercent}%` }}></div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-medace-50 px-4 py-3 text-sm text-medace-900">
                    <div className="font-bold">{aiUsageLabel}</div>
                    <div className="mt-1 text-medace-900/70">{aiUsageCopy}</div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {accountOverview.featureSummary.map((item) => (
                      <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {accountOverview && (
                <PlanExperiencePanel
                  user={user}
                  accountOverview={accountOverview}
                  plannedBookCount={plannedBooks.length}
                  coachNotificationCount={coachNotifications.length}
                />
              )}

              {showAdSlots && (
                <AdSenseSlot
                  slot={import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD_SECONDARY}
                  label="Sponsored"
                  minHeightClassName="min-h-[180px]"
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={() => setShowProgressDetails((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-slate-50"
        >
          <div>
            <div className="text-sm font-bold text-slate-900">くわしい学習記録</div>
            <div className="mt-1 text-sm text-slate-500">週間記録やランキングは必要なときだけ確認できます。</div>
          </div>
          {showProgressDetails ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </button>

        {showProgressDetails && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
            <ActivityBarChart logs={activityLogs} dailyGoal={learningPlan?.dailyWordGoal} />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="col-span-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
                <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-800">
                  <Activity className="w-5 h-5 text-medace-500" /> 学習ステータス
                </h3>
                {masteryDist ? (
                  <div className="flex flex-col items-center justify-around gap-6 sm:flex-row">
                    <div className="relative h-40 w-40 flex-shrink-0">
                      <div
                        className="h-full w-full rounded-full"
                        style={{
                          background: `conic-gradient(
                            #22c55e 0% ${Math.round((masteryDist.graduated / (masteryDist.total || 1)) * 100)}%,
                            #3b82f6 0% ${Math.round(((masteryDist.graduated + masteryDist.review) / (masteryDist.total || 1)) * 100)}%,
                            #f97316 0% ${Math.round(((masteryDist.graduated + masteryDist.review + masteryDist.learning) / (masteryDist.total || 1)) * 100)}%,
                            #f1f5f9 0% 100%
                          )`,
                        }}
                      ></div>
                      <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
                        <span className="text-3xl font-bold text-slate-800">{masteryDist.total}</span>
                        <span className="text-xs font-bold uppercase text-slate-400">合計単語</span>
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-4">
                      <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                        <div className="text-xs font-bold uppercase text-green-600">{STATUS_LABELS['graduated']}</div>
                        <div className="text-xl font-bold text-slate-800">{masteryDist.graduated}</div>
                      </div>
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <div className="text-xs font-bold uppercase text-blue-600">{STATUS_LABELS['review']}</div>
                        <div className="text-xl font-bold text-slate-800">{masteryDist.review}</div>
                      </div>
                      <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                        <div className="text-xs font-bold uppercase text-orange-600">{STATUS_LABELS['learning']}</div>
                        <div className="text-xl font-bold text-slate-800">{masteryDist.learning}</div>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <div className="text-xs font-bold uppercase text-slate-500">{STATUS_LABELS['new']}</div>
                        <div className="text-xl font-bold text-slate-800">{masteryDist.total - (masteryDist.graduated + masteryDist.review + masteryDist.learning)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center text-slate-400">データなし</div>
                )}
              </div>

              {isGameMode ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
                    <BarChart className="w-5 h-5 text-medace-500" /> XPランキング
                  </h3>
                  <div className="space-y-3">
                    {leaderboard.map((entry, idx) => {
                      const league = getLeague(entry.level);
                      return (
                        <div
                          key={entry.uid}
                          className={`flex items-center justify-between rounded-lg border p-3 transition-all hover:scale-[1.02] ${entry.isCurrentUser ? 'border-medace-200 bg-medace-50 shadow-sm' : 'border-slate-100 bg-white'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-slate-100 text-slate-700' : idx === 2 ? 'bg-orange-50 text-orange-700' : 'text-slate-400'}`}>
                              {entry.rank}
                            </div>
                            <div>
                              <div className={`flex items-center gap-2 text-sm font-bold ${entry.isCurrentUser ? 'text-medace-700' : 'text-slate-700'}`}>
                                {entry.displayName} {entry.isCurrentUser && <span className="rounded bg-medace-200 px-1.5 text-[10px] text-medace-800">あなた</span>}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <div className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${league.color}`}>
                                  {league.icon} {league.name}
                                </div>
                                <div className="text-[10px] text-slate-400">Lv.{entry.level}</div>
                              </div>
                            </div>
                          </div>
                          <div className="text-sm font-bold text-slate-600">
                            {entry.xp} <span className="text-xs text-slate-400">XP</span>
                          </div>
                        </div>
                      );
                    })}
                    {leaderboard.length === 0 && <p className="text-center text-xs text-slate-400">ランキングデータなし</p>}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
                    <Target className="w-5 h-5 text-medace-500" /> 今週のペース
                  </h3>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今日</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{todayCount}<span className="ml-1 text-sm text-slate-400">/ {todayWordGoal} 語</span></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-gradient-to-r from-medace-400 to-medace-600" style={{ width: `${todayProgressPercent}%` }}></div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今週</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{weekTotal}<span className="ml-1 text-sm text-slate-400">/ {weeklyGoal} 語</span></div>
                      <div className="mt-2 text-sm text-slate-500">{weeklyRemaining === 0 ? '今週の目標ペースに到達しています。' : `あと ${weeklyRemaining} 語で今週の目標です。`}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">連続記録</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{user.stats?.currentStreak || 0}<span className="ml-1 text-sm text-slate-400">日</span></div>
                      <div className="mt-2 text-sm text-slate-500">他人比較ではなく、自分のペースで積み上げる表示です。</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION: My Phrasebooks */}
      <div className="min-h-[200px]">
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-800 border-l-4 border-purple-500 pl-3">My単語帳</h3>
            <button 
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1 text-sm font-bold text-medace-600 hover:bg-medace-50 px-3 py-1.5 rounded-lg transition-colors"
            >
                <Plus className="w-4 h-4" /> 新規作成
            </button>
        </div>
        {myBooks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myBooks.map((book) => (
                  <BookCard 
                    key={book.id} 
                    book={book} 
                    isMine={true} 
                    progress={progressMap[book.id] || { bookId: book.id, percentage: 0, learnedCount: 0, totalCount: book.wordCount }}
                    onDelete={handleDeleteBook}
                    onSelect={onSelectBook}
                  />
                ))}
            </div>
        ) : (
            <div className="bg-slate-100 rounded-xl p-8 text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-500 font-bold mb-2">まだMy単語帳がありません</p>
                <p className="text-slate-400 text-sm mb-4">教科書の写真やPDFから、あなただけの教材を作成しましょう！</p>
                <button onClick={() => setShowCreateModal(true)} className="text-medace-600 font-bold underline hover:text-medace-700">
                    今すぐ作成する
                </button>
            </div>
        )}
      </div>

      {/* SECTION: Current Curriculum (Official) */}
      <div>
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-800 border-l-4 border-medace-500 pl-3">推奨コース</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {learningPlan && learningPlan.selectedBookIds.length > 0 ? (
                // Filter by plan
                books.filter(b => learningPlan.selectedBookIds.includes(b.id)).map(book => (
                    <BookCard 
                        key={book.id} 
                        book={book} 
                        progress={progressMap[book.id] || { bookId: book.id, percentage: 0, learnedCount: 0, totalCount: book.wordCount }}
                        onDelete={handleDeleteBook}
                        onSelect={onSelectBook}
                    />
                ))
            ) : (
                // Default Fallback (Priority Only)
                books.filter(b => b.isPriority).slice(0, 3).map(book => (
                    <BookCard 
                        key={book.id} 
                        book={book} 
                        progress={progressMap[book.id] || { bookId: book.id, percentage: 0, learnedCount: 0, totalCount: book.wordCount }}
                        onDelete={handleDeleteBook}
                        onSelect={onSelectBook}
                    />
                ))
            )}
            {books.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-600 md:col-span-2 lg:col-span-3">
                    現在のプランでは公式コースは配信されていません。My単語帳を作成するか、ビジネス導入済みワークスペースで利用してください。
                </div>
            )}
            {(books.length > 0 && !learningPlan && books.filter(b => b.isPriority).length === 0) && <p className="text-slate-400 text-sm">推奨コースはありません</p>}
        </div>

        {/* SECTION: Library (Collapsed) */}
        <div className="border-t border-slate-200 pt-6">
            <button 
                onClick={() => setShowLibrary(!showLibrary)}
                className="flex items-center justify-between w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors group"
            >
                <div className="flex items-center gap-3">
                    <Library className="w-5 h-5 text-slate-400 group-hover:text-medace-500" />
                    <span className="font-bold text-slate-600 group-hover:text-slate-800">すべての公式コースを見る</span>
                </div>
                {showLibrary ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {showLibrary && (
                books.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 animate-in slide-in-from-top-4">
                        {books.map((book) => (
                        <BookCard 
                            key={book.id} 
                            book={book} 
                            progress={progressMap[book.id] || { bookId: book.id, percentage: 0, learnedCount: 0, totalCount: book.wordCount }}
                            onDelete={handleDeleteBook}
                            onSelect={onSelectBook}
                        />
                        ))}
                    </div>
                ) : (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-600 animate-in slide-in-from-top-4">
                        公式コースはビジネス本導入プラン向けに限定されています。個人利用では My単語帳 を使って学習を進めてください。
                    </div>
                )
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
