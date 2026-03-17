import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react';

import {
  type LearningPlan,
  type LearningPreference,
  LearningPreferenceIntensity,
  type UserProfile,
  UserGrade,
  UserStudyMode,
} from '../types';
import { type DisplayDensity, type DisplayFontSize, getStoredDisplayPreferences } from '../utils/displayPreferences';

export type DashboardCreateMode = 'TEXT' | 'FILE';

export interface DashboardPageNotice {
  tone: 'success' | 'error';
  message: string;
}

export interface PendingDeleteBook {
  id: string;
  title: string;
}

export interface UseStudentDashboardUiStateParams {
  user: UserProfile;
  learningPlan: LearningPlan | null;
  learningPreference: LearningPreference | null;
}

export const useStudentDashboardUiState = ({
  user,
  learningPlan,
  learningPreference,
}: UseStudentDashboardUiStateParams) => {
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPlanEditModal, setShowPlanEditModal] = useState(false);
  const [pageNotice, setPageNotice] = useState<DashboardPageNotice | null>(null);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<PendingDeleteBook | null>(null);

  const [editDailyGoal, setEditDailyGoal] = useState(0);
  const [selectedPlanBooks, setSelectedPlanBooks] = useState<string[]>([]);

  const [createMode, setCreateMode] = useState<DashboardCreateMode>('TEXT');
  const [rawText, setRawText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editName, setEditName] = useState(user.displayName);
  const [editGrade, setEditGrade] = useState<UserGrade>(user.grade || UserGrade.ADULT);
  const [editStudyMode, setEditStudyMode] = useState<UserStudyMode>(user.studyMode || UserStudyMode.FOCUS);
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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setUploadFile(event.target.files[0]);
    }
  };

  const handleDeleteBook = (event: MouseEvent, bookId: string, bookTitle: string) => {
    event.stopPropagation();
    event.preventDefault();
    setPendingDeleteBook({ id: bookId, title: bookTitle });
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
    togglePlanBook,
    createMode,
    setCreateMode,
    rawText,
    setRawText,
    uploadFile,
    setUploadFile,
    newBookTitle,
    setNewBookTitle,
    creating,
    setCreating,
    errorMsg,
    setErrorMsg,
    handleFileChange,
    handleDeleteBook,
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
    setIsSavingProfile,
    setGeneratingPlan,
  };
};

export default useStudentDashboardUiState;
