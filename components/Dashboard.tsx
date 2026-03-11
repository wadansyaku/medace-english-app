
import React, { useEffect, useState } from 'react';
import { BookCatalogSource, BookMetadata, type LearningPreference, UserProfile, UserGrade, EnglishLevel, LearningPreferenceIntensity, LEARNING_PREFERENCE_INTENSITY_LABELS, GRADE_LABELS, SubscriptionPlan, UserStudyMode } from '../types';
import { storage } from '../services/storage';
import { extractVocabularyFromText, extractVocabularyFromMedia, generateLearningPlan, isAiUnavailableError } from '../services/gemini';
import { BRAND } from '../config/brand';
import { getSubscriptionPolicy, isAdSupportedPlan } from '../config/subscription';
import { Loader2, BrainCircuit, Trash2, Medal, Crown, MessageSquareText } from 'lucide-react';
import Onboarding from './Onboarding';
import StudyCompanion from './StudyCompanion';
import ModalOverlay from './ModalOverlay';
import MotivationBoard from './MotivationBoard';
import DashboardAccountSection from './dashboard/DashboardAccountSection';
import DashboardHeroSection from './dashboard/DashboardHeroSection';
import DashboardLibrarySection from './dashboard/DashboardLibrarySection';
import DashboardPlanSection from './dashboard/DashboardPlanSection';
import DashboardProgressSection from './dashboard/DashboardProgressSection';
import DashboardSettingsModal from './dashboard/DashboardSettingsModal';
import PhrasebookCreateModal from './dashboard/PhrasebookCreateModal';
import PlanEditorModal from './dashboard/PlanEditorModal';
import WritingStudentSection from './WritingStudentSection';
import MobileSheetDialog from './mobile/MobileSheetDialog';
import MobileStickyActionBar from './mobile/MobileStickyActionBar';
import { getTodayDateKey } from '../utils/date';
import {
  DisplayDensity,
  DisplayFontSize,
  getStoredDisplayPreferences,
  saveDisplayPreferences,
} from '../utils/displayPreferences';
import { useDashboardData } from '../hooks/useDashboardData';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import { buildFallbackLearningPlan } from '../utils/learningPlan';

interface DashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onUserUpdate: (user: UserProfile) => void;
}

// Helper for League Calculation
const getLeague = (level: number) => {
    if (level >= 20) return { name: 'ゴールド', icon: <Crown className="w-3 h-3 fill-yellow-400 text-yellow-600" />, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    if (level >= 10) return { name: 'シルバー', icon: <Medal className="w-3 h-3 fill-slate-300 text-slate-500" />, color: 'bg-slate-100 text-slate-700 border-slate-200' };
    return { name: 'ブロンズ', icon: <Medal className="w-3 h-3 fill-orange-300 text-orange-600" />, color: 'bg-orange-50 text-orange-800 border-orange-200' };
};


const Dashboard: React.FC<DashboardProps> = ({ user, onSelectBook, onUserUpdate }) => {
  const {
    snapshot,
    loading,
    refresh: refreshDashboard,
    updateLearningPlan,
    updateLearningPreference,
    removeMyBook,
  } = useDashboardData(user.uid);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const isMobileViewport = useIsMobileViewport();

  // Toggle State for Library
  const [showLibrary, setShowLibrary] = useState(false);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pageNotice, setPageNotice] = useState<{ tone: 'success' | 'error'; message: string; } | null>(null);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<{ id: string; title: string } | null>(null);
  
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
  const [editDisplayFontSize, setEditDisplayFontSize] = useState<DisplayFontSize>('standard');
  const [editDisplayDensity, setEditDisplayDensity] = useState<DisplayDensity>('standard');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const books = snapshot?.officialBooks ?? [];
  const myBooks = snapshot?.myBooks ?? [];
  const progressMap = snapshot?.progressMap ?? {};
  const dueCount = snapshot?.dueCount ?? 0;
  const learningPlan = snapshot?.learningPlan ?? null;
  const leaderboard = snapshot?.leaderboard ?? [];
  const masteryDist = snapshot?.masteryDist ?? null;
  const activityLogs = snapshot?.activityLogs ?? [];
  const motivationSnapshot = snapshot?.motivationSnapshot ?? null;
  const coachNotifications = snapshot?.coachNotifications ?? [];
  const accountOverview = snapshot?.accountOverview ?? null;
  const learningPreference = snapshot?.learningPreference ?? null;

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
    const displayPreferences = getStoredDisplayPreferences(user.uid);
    setEditDisplayFontSize(displayPreferences.fontSize);
    setEditDisplayDensity(displayPreferences.density);
  }, [showSettingsModal, user.displayName, user.grade, user.studyMode, learningPreference]);

  useEffect(() => {
    if (!pageNotice) return;
    const timer = window.setTimeout(() => setPageNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [pageNotice]);

  if (showOnboarding) {
      return <Onboarding 
                user={user} 
                isRetake={true}
                historySummary={`現在レベル: ${user.englishLevel}, XP: ${user.stats?.xp}, 学年・属性: ${GRADE_LABELS[user.grade || UserGrade.ADULT]}`}
                onComplete={(updated) => {
                    onUserUpdate(updated);
                    setShowOnboarding(false);
                    refreshDashboard();
                }} 
                onCancel={() => {
                    setShowOnboarding(false);
                    setShowSettingsModal(true);
                }}
             />;
  }

  const handleGeneratePlan = async () => {
      if (!hasStudyBooks) return;
      setGeneratingPlan(true);
      try {
          const plan = canGenerateAiPlan
            ? await generateLearningPlan(user.grade || UserGrade.ADULT, user.englishLevel || EnglishLevel.B1, planningBooks, learningPreference)
            : buildFallbackLearningPlan({
                uid: user.uid,
                grade: user.grade || UserGrade.ADULT,
                level: user.englishLevel || EnglishLevel.B1,
                availableBooks: planningBooks,
                learningPreference,
              });
          if (plan) {
              plan.uid = user.uid;
              await storage.saveLearningPlan(plan);
              updateLearningPlan(plan);
          } else {
              setPageNotice({ tone: 'error', message: 'プラン作成に失敗しました。' });
          }
      } catch (e) {
          setPageNotice({ tone: 'error', message: 'プラン作成に失敗しました。' });
      } finally {
          setGeneratingPlan(false);
      }
  };

  const handleUpdatePlan = async () => {
      if (!learningPlan) return;
      try {
          const updated = { ...learningPlan, dailyWordGoal: editDailyGoal, selectedBookIds: selectedPlanBooks };
          await storage.saveLearningPlan(updated);
          updateLearningPlan(updated);
          setShowPlanEditModal(false);
          setPageNotice({ tone: 'success', message: '学習プランを更新しました。' });
      } catch (error) {
          console.error(error);
          setPageNotice({ tone: 'error', message: '学習プランの更新に失敗しました。' });
      }
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
        let result:
          | Awaited<ReturnType<typeof extractVocabularyFromText>>
          | Awaited<ReturnType<typeof extractVocabularyFromMedia>>;

        if (createMode === 'TEXT') {
            result = await extractVocabularyFromText(rawText);
        } else if (createMode === 'FILE' && uploadFile) {
            const mimeType = uploadFile.type;
            if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
                throw new Error("対応していないファイル形式です。");
            }
            const base64 = await fileToBase64(uploadFile);
            result = await extractVocabularyFromMedia(base64, mimeType);
        } else {
            throw new Error("教材ソースを指定してください。");
        }

        if (!result || result.words.length === 0) {
            throw new Error("単語を抽出できませんでした。");
        }

        const importResult = await storage.batchImportWords({
          defaultBookName: newBookTitle,
          source: {
            kind: 'rows',
            rows: result.words.map((item, index) => ({
              bookName: newBookTitle,
              number: index + 1,
              word: item.word,
              definition: item.definition,
            })),
          },
          createdByUid: user.uid,
          contextSummary: result.contextSummary,
        });
        
        setRawText('');
        setNewBookTitle('');
        setUploadFile(null);
        setShowCreateModal(false);
        setPageNotice({
          tone: 'success',
          message: `単語帳を作成しました。${importResult.importedWordCount}語を登録しました。`,
        });
        await refreshDashboard(); 

    } catch (e: unknown) {
        console.error(e);
        const msg = e instanceof Error ? e.message : "作成に失敗しました。";
        if (isAiUnavailableError(e)) {
          setErrorMsg("AI教材化はまだ利用できません。Gemini 設定後に再試行してください。");
        } else {
          setErrorMsg(msg.includes('429') ? "AIの利用上限(RPM)に達しました。時間をおいてください。" : msg);
        }
    } finally {
        setCreating(false);
    }
  };

  const handleDeleteBook = async (e: React.MouseEvent, bookId: string, bookTitle: string) => {
      e.stopPropagation();
      e.preventDefault();
      setPendingDeleteBook({ id: bookId, title: bookTitle });
  };

  const confirmDeleteBook = async () => {
      if (!pendingDeleteBook) return;
      try {
          removeMyBook(pendingDeleteBook.id);
          await storage.deleteBook(pendingDeleteBook.id);
          setPageNotice({ tone: 'success', message: `単語帳「${pendingDeleteBook.title}」を削除しました。` });
      } catch (err) {
          setPageNotice({ tone: 'error', message: '削除に失敗しました。' });
      } finally {
          setPendingDeleteBook(null);
          await refreshDashboard();
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
          const refreshedUser = await storage.getSession();
          const nextUser = refreshedUser || updatedUser;
          saveDisplayPreferences(user.uid, {
            fontSize: editDisplayFontSize,
            density: editDisplayDensity,
          });
          updateLearningPreference(nextPreference);
          onUserUpdate(nextUser);
          setShowSettingsModal(false);
          await refreshDashboard();
          setPageNotice({ tone: 'success', message: 'プロフィールを更新しました。' });
      } catch (e) {
          setPageNotice({ tone: 'error', message: 'プロフィールの更新に失敗しました。' });
      } finally {
          setIsSavingProfile(false);
      }
  };

  const planningBooks = [...books, ...myBooks];
  const hasStudyBooks = planningBooks.length > 0;
  const studyMode = user.studyMode || UserStudyMode.FOCUS;
  const isGameMode = studyMode === UserStudyMode.GAME;
  const todayKey = getTodayDateKey();
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
  const currentPlan = accountOverview?.subscriptionPlan || user.subscriptionPlan || SubscriptionPlan.TOC_FREE;
  const currentPlanPolicy = getSubscriptionPolicy(currentPlan);
  const showAdSlots = isAdSupportedPlan(currentPlan);
  const canGenerateAiPlan = currentPlanPolicy.allowedAiActions.includes('generateLearningPlan');
  const canCreateFromText = currentPlanPolicy.allowedAiActions.includes('extractVocabularyFromText');
  const canCreateFromFile = currentPlanPolicy.allowedAiActions.includes('extractVocabularyFromMedia');
  const canUseSelectedCreateMode = createMode === 'TEXT' ? canCreateFromText : canCreateFromFile;
  const fallbackPlanSuggestion = hasStudyBooks
    ? buildFallbackLearningPlan({
        uid: user.uid,
        grade: user.grade || UserGrade.ADULT,
        level: user.englishLevel || EnglishLevel.B1,
        availableBooks: planningBooks,
        learningPreference,
      })
    : null;
  const plannedBooks = learningPlan && learningPlan.selectedBookIds.length > 0
    ? planningBooks.filter((book) => learningPlan.selectedBookIds.includes(book.id))
    : (() => {
        const prioritized = planningBooks.filter((book) => book.isPriority);
        return (prioritized.length > 0 ? prioritized : planningBooks).slice(0, 3);
      })();
  const recommendedOfficialBooks = learningPlan && learningPlan.selectedBookIds.length > 0
    ? books.filter((book) => learningPlan.selectedBookIds.includes(book.id))
    : (() => {
        const fallbackIds = fallbackPlanSuggestion?.selectedBookIds ?? [];
        const suggested = books.filter((book) => fallbackIds.includes(book.id));
        if (suggested.length > 0) return suggested;
        const prioritized = books.filter((book) => book.isPriority);
        return (prioritized.length > 0 ? prioritized : books).slice(0, 3);
      })();
  const heroTitle = !hasStudyBooks
    ? '学習を始める教材がまだありません'
    : remainingWords > 0
      ? `あと${remainingWords}語で今日の目標です`
      : '今日はここまでで十分です';
  const heroCopy = !hasStudyBooks
    ? '現在のワークスペースには学習対象の教材がありません。公式教材の配信か、利用可能な教材作成導線の追加が必要です。'
    : remainingWords > 0
      ? dueCount > 0
        ? `まずは復習待ちの ${reviewFirstCount} 語から始めれば、そのまま今日のノルマに入れます。`
        : '今日は短く区切って進めれば十分です。まずはクエストを1回だけ始めましょう。'
      : '余力があればテストかMy単語帳に進み、無理ならここで終えても流れは崩れません。';
  const questButtonLabel = !hasStudyBooks
    ? '学習できる教材がありません'
    : remainingWords > 0
      ? '今日のクエストを開始'
      : '復習をもう1セットやる';
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
  const latestCoachNotification = coachNotifications[0] || null;
  const canShowWritingSection = currentPlan === SubscriptionPlan.TOB_PAID && user.organizationName;

  if (loading && planningBooks.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] text-medace-500">
        <Loader2 className="h-10 w-10 animate-spin mb-2" />
        <p className="text-sm font-medium">学習データを解析中...</p>
      </div>
    );
  }
  
  return (
    <div data-testid="student-dashboard" className="relative flex flex-col gap-5 pb-24 animate-in fade-in duration-500 md:gap-8 md:pb-20">
        {pageNotice && (
          <div className={`sticky top-[calc(0.75rem+var(--safe-top))] z-40 rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm ${
            pageNotice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {pageNotice.message}
          </div>
        )}
        
        {/* MODALS */}

        {pendingDeleteBook && (
          <MobileSheetDialog
            onClose={() => setPendingDeleteBook(null)}
            mode={isMobileViewport ? 'fullscreen' : 'sheet'}
            panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-lg sm:rounded-[32px] sm:border sm:border-slate-200 sm:shadow-2xl"
          >
            <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[32px] sm:px-6">
              <div className="flex items-center gap-3">
                <Trash2 className="h-5 w-5 text-red-500" />
                <div>
                  <div className="text-lg font-black text-slate-950">単語帳を削除する</div>
                  <div className="mt-1 text-sm text-slate-500">「{pendingDeleteBook.title}」を削除します。</div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                学習履歴との関連データも一緒に削除されます。この操作は取り消せません。
              </div>
            </div>
            <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[32px]">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPendingDeleteBook(null)}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteBook}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white"
                >
                  <Trash2 className="h-4 w-4" />
                  削除する
                </button>
              </div>
            </MobileStickyActionBar>
          </MobileSheetDialog>
        )}
        
        <PlanEditorModal
          open={showPlanEditModal && Boolean(learningPlan)}
          planningBooks={planningBooks}
          selectedBookIds={selectedPlanBooks}
          dailyGoal={editDailyGoal}
          onClose={() => setShowPlanEditModal(false)}
          onChangeDailyGoal={setEditDailyGoal}
          onToggleBook={togglePlanBook}
          onSave={handleUpdatePlan}
        />

        <DashboardSettingsModal
          open={showSettingsModal}
          accountOverview={accountOverview}
          currentEnglishLevel={user.englishLevel}
          editName={editName}
          editGrade={editGrade}
          editStudyMode={editStudyMode}
          editTargetExam={editTargetExam}
          editTargetScore={editTargetScore}
          editExamDate={editExamDate}
          editWeeklyStudyDays={editWeeklyStudyDays}
          editDailyStudyMinutes={editDailyStudyMinutes}
          editWeakSkillFocus={editWeakSkillFocus}
          editMotivationNote={editMotivationNote}
          editIntensity={editIntensity}
          editDisplayFontSize={editDisplayFontSize}
          editDisplayDensity={editDisplayDensity}
          isSavingProfile={isSavingProfile}
          onClose={() => setShowSettingsModal(false)}
          onRetakeLevel={() => {
            setShowSettingsModal(false);
            setShowOnboarding(true);
          }}
          onSave={handleSaveProfile}
          onEditName={setEditName}
          onEditGrade={setEditGrade}
          onEditStudyMode={setEditStudyMode}
          onEditTargetExam={setEditTargetExam}
          onEditTargetScore={setEditTargetScore}
          onEditExamDate={setEditExamDate}
          onEditWeeklyStudyDays={setEditWeeklyStudyDays}
          onEditDailyStudyMinutes={setEditDailyStudyMinutes}
          onEditWeakSkillFocus={setEditWeakSkillFocus}
          onEditMotivationNote={setEditMotivationNote}
          onEditIntensity={setEditIntensity}
          onEditDisplayFontSize={setEditDisplayFontSize}
          onEditDisplayDensity={setEditDisplayDensity}
        />

        <PhrasebookCreateModal
          open={showCreateModal}
          createMode={createMode}
          rawText={rawText}
          uploadFile={uploadFile}
          newBookTitle={newBookTitle}
          creating={creating}
          errorMsg={errorMsg}
          canUseSelectedCreateMode={canUseSelectedCreateMode}
          currentPlanLabel={currentPlanPolicy.label}
          onClose={() => setShowCreateModal(false)}
          onChangeMode={setCreateMode}
          onChangeRawText={setRawText}
          onChangeTitle={setNewBookTitle}
          onFileChange={handleFileChange}
          onCreate={handleCreatePhrasebook}
        />

      <div className="order-1">
        <DashboardHeroSection
          grade={user.grade || UserGrade.ADULT}
          englishLevel={user.englishLevel}
          heroTitle={heroTitle}
          heroCopy={heroCopy}
          preferenceSummary={preferenceSummary}
          hasStudyBooks={hasStudyBooks}
          questButtonLabel={questButtonLabel}
          learningPlan={learningPlan}
          generatingPlan={generatingPlan}
          remainingWords={remainingWords}
          dueCount={dueCount}
          estimatedMinutes={estimatedMinutes}
          todayCount={todayCount}
          todayWordGoal={todayWordGoal}
          todayProgressPercent={todayProgressPercent}
          gameLeagueBadge={isGameMode ? userLeague : undefined}
          onOpenSettings={() => setShowSettingsModal(true)}
          onStartQuest={() => onSelectBook('smart-session', 'study')}
          onOpenPlan={() => setShowPlanEditModal(true)}
          onGeneratePlan={handleGeneratePlan}
        />
      </div>

      {latestCoachNotification && (
        <section className="order-3 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:order-2 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-medace-100 bg-medace-50 p-3 text-medace-700">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Coach Message</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師からのメッセージ</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  生徒向けのメッセージ受信欄です。講師から届いた最新のフォローをここで確認できます。
                </p>
              </div>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
              {coachNotifications.length}件
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-900">{latestCoachNotification.instructorName}</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {latestCoachNotification.usedAi ? 'AI下書き' : '手動'}
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{latestCoachNotification.message}</p>
              <div className="mt-4 text-xs text-slate-400">
                {new Date(latestCoachNotification.createdAt).toLocaleString('ja-JP')}
              </div>
            </div>

            <div className="grid gap-3">
              {coachNotifications.slice(1, 3).map((notification) => (
                <div key={notification.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-900">{notification.instructorName}</div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {notification.usedAi ? 'AI下書き' : '手動'}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{notification.message}</p>
                </div>
              ))}
              {coachNotifications.length === 1 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  ここに次回以降の講師メッセージも並びます。
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="order-4 md:order-3">
        <DashboardPlanSection
          learningPlan={learningPlan}
          learningPreference={learningPreference}
          preferenceSummary={preferenceSummary}
          plannedBooks={plannedBooks}
          canGenerateAiPlan={canGenerateAiPlan}
          generatingPlan={generatingPlan}
          hasStudyBooks={hasStudyBooks}
          onEditPlan={() => setShowPlanEditModal(true)}
          onGeneratePlan={handleGeneratePlan}
        />
      </div>

      {isGameMode && hasStudyBooks && (
        <div className="order-5 md:order-4">
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
        </div>
      )}

      {motivationSnapshot && (
        <div className="order-7 md:order-5">
          <MotivationBoard snapshot={motivationSnapshot} />
        </div>
      )}

      {coachNotifications.length > 1 && (
        <section className="order-8 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:order-8 md:p-7">
          <div className="flex items-center gap-3">
            <BrainCircuit className="w-5 h-5 text-medace-600" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Message History</p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師メッセージの履歴</h3>
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

      {canShowWritingSection && (
        <div className="order-2 md:order-6">
          <WritingStudentSection user={user} />
        </div>
      )}

      {canShowAccountDetails && (
        <div className="order-10 md:order-9">
          <DashboardAccountSection
            open={showAccountDetails}
            user={user}
            accountOverview={accountOverview}
            aiBudgetPercent={aiBudgetPercent}
            aiUsageLabel={aiUsageLabel}
            aiUsageCopy={aiUsageCopy}
            plannedBookCount={plannedBooks.length}
            coachNotificationCount={coachNotifications.length}
            showAdSlots={showAdSlots}
            onToggle={() => setShowAccountDetails((previous) => !previous)}
          />
        </div>
      )}

      <div className="order-9 md:order-10">
        <DashboardProgressSection
          open={showProgressDetails}
          activityLogs={activityLogs}
          dailyGoal={learningPlan?.dailyWordGoal}
          masteryDist={masteryDist}
          isGameMode={isGameMode}
          leaderboard={leaderboard}
          todayCount={todayCount}
          todayWordGoal={todayWordGoal}
          todayProgressPercent={todayProgressPercent}
          weekTotal={weekTotal}
          weeklyGoal={weeklyGoal}
          weeklyRemaining={weeklyRemaining}
          currentStreak={user.stats?.currentStreak || 0}
          onToggle={() => setShowProgressDetails((previous) => !previous)}
        />
      </div>

      <div className="order-6 md:order-11">
        <DashboardLibrarySection
          books={books}
          myBooks={myBooks}
          recommendedOfficialBooks={recommendedOfficialBooks}
          progressMap={progressMap}
          showLibrary={showLibrary}
          onToggleLibrary={() => setShowLibrary((previous) => !previous)}
          onOpenCreateModal={() => setShowCreateModal(true)}
          onDelete={handleDeleteBook}
          onSelect={onSelectBook}
        />
      </div>
    </div>
  );
};

export default Dashboard;
