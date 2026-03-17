import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { storage } from '../services/storage';
import {
  extractVocabularyFromMedia,
  extractVocabularyFromText,
  generateLearningPlan,
  isAiUnavailableError,
} from '../services/gemini';
import { buildFallbackLearningPlan } from '../utils/learningPlan';
import {
  type DisplayDensity,
  type DisplayFontSize,
  saveDisplayPreferences,
} from '../utils/displayPreferences';
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
import type { DashboardCreateMode, DashboardPageNotice, PendingDeleteBook } from './useStudentDashboardUiState';

interface UseStudentDashboardMutationsParams {
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
  setPageNotice: Dispatch<SetStateAction<DashboardPageNotice | null>>;
  setGeneratingPlan: Dispatch<SetStateAction<boolean>>;
  selectedPlanBooks: string[];
  editDailyGoal: number;
  setShowPlanEditModal: Dispatch<SetStateAction<boolean>>;
  setCreating: Dispatch<SetStateAction<boolean>>;
  setErrorMsg: Dispatch<SetStateAction<string | null>>;
  setShowCreateModal: Dispatch<SetStateAction<boolean>>;
  setRawText: Dispatch<SetStateAction<string>>;
  setNewBookTitle: Dispatch<SetStateAction<string>>;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
  pendingDeleteBook: PendingDeleteBook | null;
  setPendingDeleteBook: Dispatch<SetStateAction<PendingDeleteBook | null>>;
  setIsSavingProfile: Dispatch<SetStateAction<boolean>>;
  setShowSettingsModal: Dispatch<SetStateAction<boolean>>;
  editName: string;
  editGrade: UserGrade;
  editStudyMode: UserStudyMode;
  editTargetExam: string;
  editTargetScore: string;
  editExamDate: string;
  editWeeklyStudyDays: number;
  editDailyStudyMinutes: number;
  editWeakSkillFocus: string;
  editMotivationNote: string;
  editIntensity: LearningPreferenceIntensity;
  editDisplayFontSize: DisplayFontSize;
  editDisplayDensity: DisplayDensity;
  createMode: DashboardCreateMode;
  rawText: string;
  uploadFile: File | null;
  newBookTitle: string;
}

export const useStudentDashboardMutations = ({
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
  setPageNotice,
  setGeneratingPlan,
  selectedPlanBooks,
  editDailyGoal,
  setShowPlanEditModal,
  setCreating,
  setErrorMsg,
  setShowCreateModal,
  setRawText,
  setNewBookTitle,
  setUploadFile,
  pendingDeleteBook,
  setPendingDeleteBook,
  setIsSavingProfile,
  setShowSettingsModal,
  editName,
  editGrade,
  editStudyMode,
  editTargetExam,
  editTargetScore,
  editExamDate,
  editWeeklyStudyDays,
  editDailyStudyMinutes,
  editWeakSkillFocus,
  editMotivationNote,
  editIntensity,
  editDisplayFontSize,
  editDisplayDensity,
  createMode,
  rawText,
  uploadFile,
  newBookTitle,
}: UseStudentDashboardMutationsParams) => {
  const handleGeneratePlan = useCallback(async () => {
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
  }, [
    planningBooks,
    canGenerateAiPlan,
    user,
    learningPreference,
    setGeneratingPlan,
    updateLearningPlan,
    setPageNotice,
  ]);

  const handleUpdatePlan = useCallback(async () => {
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
  }, [
    learningPlan,
    editDailyGoal,
    selectedPlanBooks,
    updateLearningPlan,
    setShowPlanEditModal,
    setPageNotice,
  ]);

  const handleCreatePhrasebook = useCallback(async () => {
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
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(uploadFile);
          reader.onload = () => {
            const resultBase64 = reader.result as string;
            resolve(resultBase64.split(',')[1]);
          };
          reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
        });
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
  }, [
    newBookTitle,
    createMode,
    rawText,
    uploadFile,
    user.uid,
    refreshDashboard,
    setCreating,
    setErrorMsg,
    setNewBookTitle,
    setPageNotice,
    setRawText,
    setShowCreateModal,
    setUploadFile,
  ]);

  const confirmDeleteBook = useCallback(async () => {
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
  }, [pendingDeleteBook, removeMyBook, refreshDashboard, setPageNotice, setPendingDeleteBook]);

  const handleSaveProfile = useCallback(async () => {
    setIsSavingProfile(true);
    try {
      const updatedUser: UserProfile = {
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
  }, [
    user,
    editName,
    editGrade,
    editStudyMode,
    editTargetExam,
    editTargetScore,
    editExamDate,
    editWeeklyStudyDays,
    editDailyStudyMinutes,
    editWeakSkillFocus,
    editMotivationNote,
    editIntensity,
    editDisplayFontSize,
    editDisplayDensity,
    updateLearningPreference,
    setShowSettingsModal,
    setIsSavingProfile,
    refreshDashboard,
    onUserUpdate,
    setPageNotice,
  ]);

  return {
    handleGeneratePlan,
    handleUpdatePlan,
    handleCreatePhrasebook,
    confirmDeleteBook,
    handleSaveProfile,
  };
};

export default useStudentDashboardMutations;
