import { useRef, useState } from 'react';
import { DIAGNOSTIC_QUESTIONS, evaluateDiagnostic, type SelfAssessmentKey } from '../data/diagnostic';
import { dashboardService } from '../services/dashboard';
import { sessionService } from '../services/session';
import {
  LearningPreferenceIntensity,
  type EnglishLevel,
  type LearningPreference,
  type UserProfile,
  UserGrade,
} from '../types';

export type OnboardingStep = 'CHOICE' | 'PROFILE' | 'TEST' | 'RESULT';

interface UseOnboardingControllerParams {
  user: UserProfile;
  onComplete: (updatedUser: UserProfile) => void;
  isRetake?: boolean;
}

export const useOnboardingController = ({
  user,
  onComplete,
  isRetake = false,
}: UseOnboardingControllerParams) => {
  const [step, setStep] = useState<OnboardingStep>(isRetake ? 'PROFILE' : 'CHOICE');
  const [selectedGrade, setSelectedGrade] = useState<UserGrade>(user.grade || UserGrade.ADULT);
  const [selfAssessment, setSelfAssessment] = useState<SelfAssessmentKey | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [finalLevel, setFinalLevel] = useState<EnglishLevel | null>(null);
  const [result, setResult] = useState<ReturnType<typeof evaluateDiagnostic> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const completedRef = useRef(false);

  const currentQuestion = DIAGNOSTIC_QUESTIONS[currentQuestionIndex];
  const currentAnswer = currentQuestion ? userAnswers[currentQuestion.id] ?? '' : '';
  const answeredCount = Object.keys(userAnswers).length;
  const progressPercent = Math.round((((step === 'RESULT' ? DIAGNOSTIC_QUESTIONS.length : currentQuestionIndex + 1)) / DIAGNOSTIC_QUESTIONS.length) * 100);

  const handleStart = () => {
    if (!selfAssessment || savingRef.current || completedRef.current) return;
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setResult(null);
    setFinalLevel(null);
    setStep('TEST');
  };

  const handleChooseDiagnostic = () => {
    if (savingRef.current || completedRef.current) return;
    setSaveError(null);
    setStep('PROFILE');
  };

  const handleReturnToChoice = () => {
    if (isRetake || savingRef.current || completedRef.current) return;
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setResult(null);
    setFinalLevel(null);
    setSaveError(null);
    setStep('CHOICE');
  };

  const deferDiagnostic = async () => {
    if (isRetake || step !== 'CHOICE' || savingRef.current || completedRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updatedUser: UserProfile = {
        ...user,
        needsOnboarding: false,
        diagnosticDeferredAt: Date.now(),
      };
      await sessionService.updateSessionUser(updatedUser);
      completedRef.current = true;
      onComplete(updatedUser);
    } catch {
      setSaveError('学習開始の設定を保存できませんでした。通信を確認して、もう一度お試しください。');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSelectAnswer = (answer: string) => {
    if (!currentQuestion) return;
    setUserAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: answer,
    }));
  };

  const handleNext = () => {
    if (!currentQuestion || !currentAnswer || !selfAssessment) return;
    if (currentQuestionIndex < DIAGNOSTIC_QUESTIONS.length - 1) {
      setCurrentQuestionIndex((previous) => previous + 1);
      return;
    }

    const evaluation = evaluateDiagnostic(userAnswers, selfAssessment, selectedGrade);
    setResult(evaluation);
    setFinalLevel(evaluation.level);
    setStep('RESULT');
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((previous) => previous - 1);
      return;
    }
    setStep('PROFILE');
  };

  const saveResult = async () => {
    if (!finalLevel || savingRef.current || completedRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      const updatedUser: UserProfile = {
        ...user,
        grade: selectedGrade,
        englishLevel: finalLevel,
        needsOnboarding: false,
      };

      if (result) {
        const nextPreference: LearningPreference = {
          userUid: user.uid,
          targetExam: '',
          targetScore: '',
          examDate: '',
          weeklyStudyDays: selectedGrade === UserGrade.JHS1 ? 4 : 5,
          dailyStudyMinutes: Math.max(5, Math.ceil(result.recommendedDailyGoal / 4)),
          weakSkillFocus: result.nextFocus[0] || '診断結果に合わせて復習から始める',
          motivationNote: result.nextFocus.join('\n'),
          intensity: LearningPreferenceIntensity.BALANCED,
          updatedAt: Date.now(),
        };
        await dashboardService.saveLearningPreference(nextPreference);
      }
      // Complete onboarding only after its recommended learning preferences are saved.
      await sessionService.updateSessionUser(updatedUser);
      completedRef.current = true;
      onComplete(updatedUser);
    } catch {
      setSaveError('診断結果を保存できませんでした。結果はこの画面に残っています。通信を確認して、もう一度保存してください。');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return {
    step,
    selectedGrade,
    setSelectedGrade,
    selfAssessment,
    setSelfAssessment,
    currentQuestionIndex,
    answeredCount,
    progressPercent,
    currentQuestion,
    currentAnswer,
    result,
    finalLevel,
    isSaving,
    isSavePending: () => savingRef.current,
    saveError,
    handleStart,
    handleChooseDiagnostic,
    handleReturnToChoice,
    deferDiagnostic,
    handleSelectAnswer,
    handleNext,
    handleBack,
    saveResult,
  };
};
