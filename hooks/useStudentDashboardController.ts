import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react';

import { storage } from '../services/storage';
import { extractVocabularyFromMedia, extractVocabularyFromText, generateLearningPlan, isAiUnavailableError } from '../services/gemini';
import {
  type BookMetadata,
  EnglishLevel,
  type LearningPlan,
  type LearningPreference,
  LearningPreferenceIntensity,
  type UserProfile,
  UserGrade,
  UserStudyMode,
} from '../types';
import {
  type DisplayDensity,
  type DisplayFontSize,
  getStoredDisplayPreferences,
  saveDisplayPreferences,
} from '../utils/displayPreferences';
import { buildFallbackLearningPlan } from '../utils/learningPlan';

interface UseStudentDashboardControllerParams {
  user: UserProfile;
  learningPlan: LearningPlan | null;
  learningPreference: LearningPreference | null;
  planningBooks: BookMetadata[];
  canGenerateAiPlan: boolean;
  onUserUpdate: (user: UserProfile) => void;
  refreshDashboard: () => Promise<void>;
  updateLearningPlan: (plan: LearningPlan | null) => void;
  updateLearningPreference: (preference: LearningPreference | null) => void;
  removeMyBook: (bookId: string) => void;
}

export const useStudentDashboardController = ({
  user,
  learningPlan,
  learningPreference,
  planningBooks,
  canGenerateAiPlan,
  onUserUpdate,
  refreshDashboard,
  updateLearningPlan,
  updateLearningPreference,
  removeMyBook,
}: UseStudentDashboardControllerParams) => {
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPlanEditModal, setShowPlanEditModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [pageNotice, setPageNotice] = useState<{ tone: 'success' | 'error'; message: string; } | null>(null);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<{ id: string; title: string } | null>(null);

  const [editDailyGoal, setEditDailyGoal] = useState(0);
  const [selectedPlanBooks, setSelectedPlanBooks] = useState<string[]>([]);

  const [createMode, setCreateMode] = useState<'TEXT' | 'FILE'>('TEXT');
  const [rawText, setRawText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  useEffect(() => {
    if (!learningPlan) return;
    setEditDailyGoal(learningPlan.dailyWordGoal);
    setSelectedPlanBooks(learningPlan.selectedBookIds);
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
  }, [showSettingsModal, user.displayName, user.grade, user.studyMode, learningPreference, user.uid]);

  useEffect(() => {
    if (!pageNotice) return;
    const timer = window.setTimeout(() => setPageNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [pageNotice]);

  const togglePlanBook = (bookId: string) => {
    if (selectedPlanBooks.includes(bookId)) {
      setSelectedPlanBooks((previous) => previous.filter((id) => id !== bookId));
      return;
    }
    setSelectedPlanBooks((previous) => [...previous, bookId]);
  };

  const handleGeneratePlan = async () => {
    if (planningBooks.length === 0) return;
    setGeneratingPlan(true);
    try {
      const plan = canGenerateAiPlan
        ? await generateLearningPlan(
            user.grade || UserGrade.ADULT,
            user.englishLevel || EnglishLevel.B1,
            planningBooks,
            learningPreference,
          )
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
        setPageNotice({ tone: 'success', message: '学習プランを作成しました。' });
      } else {
        setPageNotice({ tone: 'error', message: 'プラン作成に失敗しました。' });
      }
    } catch (error) {
      console.error(error);
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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setUploadFile(event.target.files[0]);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });

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
          throw new Error('対応していないファイル形式です。');
        }
        const base64 = await fileToBase64(uploadFile);
        result = await extractVocabularyFromMedia(base64, mimeType);
      } else {
        throw new Error('教材ソースを指定してください。');
      }

      if (!result || result.words.length === 0) {
        throw new Error('単語を抽出できませんでした。');
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
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : '作成に失敗しました。';
      if (isAiUnavailableError(error)) {
        setErrorMsg('AI教材化はまだ利用できません。Gemini 設定後に再試行してください。');
      } else {
        setErrorMsg(message.includes('429') ? 'AIの利用上限(RPM)に達しました。時間をおいてください。' : message);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBook = (event: MouseEvent, bookId: string, bookTitle: string) => {
    event.stopPropagation();
    event.preventDefault();
    setPendingDeleteBook({ id: bookId, title: bookTitle });
  };

  const confirmDeleteBook = async () => {
    if (!pendingDeleteBook) return;
    try {
      removeMyBook(pendingDeleteBook.id);
      await storage.deleteBook(pendingDeleteBook.id);
      setPageNotice({ tone: 'success', message: `単語帳「${pendingDeleteBook.title}」を削除しました。` });
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      console.error(error);
      setPageNotice({ tone: 'error', message: 'プロフィールの更新に失敗しました。' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  return {
    generatingPlan,
    showLibrary,
    setShowLibrary,
    showProgressDetails,
    setShowProgressDetails,
    showAccountDetails,
    setShowAccountDetails,
    showCreateModal,
    setShowCreateModal,
    showSettingsModal,
    setShowSettingsModal,
    showOnboarding,
    setShowOnboarding,
    showPlanEditModal,
    setShowPlanEditModal,
    pageNotice,
    setPageNotice,
    pendingDeleteBook,
    setPendingDeleteBook,
    editDailyGoal,
    setEditDailyGoal,
    selectedPlanBooks,
    handleGeneratePlan,
    togglePlanBook,
    handleUpdatePlan,
    createMode,
    setCreateMode,
    rawText,
    setRawText,
    uploadFile,
    newBookTitle,
    setNewBookTitle,
    creating,
    errorMsg,
    handleFileChange,
    handleCreatePhrasebook,
    handleDeleteBook,
    confirmDeleteBook,
    editName,
    setEditName,
    editGrade,
    setEditGrade,
    editStudyMode,
    setEditStudyMode,
    editTargetExam,
    setEditTargetExam,
    editTargetScore,
    setEditTargetScore,
    editExamDate,
    setEditExamDate,
    editWeeklyStudyDays,
    setEditWeeklyStudyDays,
    editDailyStudyMinutes,
    setEditDailyStudyMinutes,
    editWeakSkillFocus,
    setEditWeakSkillFocus,
    editMotivationNote,
    setEditMotivationNote,
    editIntensity,
    setEditIntensity,
    editDisplayFontSize,
    setEditDisplayFontSize,
    editDisplayDensity,
    setEditDisplayDensity,
    isSavingProfile,
    handleSaveProfile,
  };
};
