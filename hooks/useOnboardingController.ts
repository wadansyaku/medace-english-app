import { useState } from 'react';
import { DIAGNOSTIC_QUESTIONS, evaluateDiagnostic, type SelfAssessmentKey } from '../data/diagnostic';
import { storage } from '../services/storage';
import { type EnglishLevel, type UserProfile, UserGrade } from '../types';

export type OnboardingStep = 'PROFILE' | 'TEST' | 'RESULT';

interface UseOnboardingControllerParams {
  user: UserProfile;
  onComplete: (updatedUser: UserProfile) => void;
}

export const useOnboardingController = ({
  user,
  onComplete,
}: UseOnboardingControllerParams) => {
  const [step, setStep] = useState<OnboardingStep>('PROFILE');
  const [selectedGrade, setSelectedGrade] = useState<UserGrade>(user.grade || UserGrade.ADULT);
  const [selfAssessment, setSelfAssessment] = useState<SelfAssessmentKey | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [finalLevel, setFinalLevel] = useState<EnglishLevel | null>(null);
  const [result, setResult] = useState<ReturnType<typeof evaluateDiagnostic> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentQuestion = DIAGNOSTIC_QUESTIONS[currentQuestionIndex];
  const currentAnswer = currentQuestion ? userAnswers[currentQuestion.id] ?? '' : '';
  const answeredCount = Object.keys(userAnswers).length;
  const progressPercent = Math.round((((step === 'RESULT' ? DIAGNOSTIC_QUESTIONS.length : currentQuestionIndex + 1)) / DIAGNOSTIC_QUESTIONS.length) * 100);

  const handleStart = () => {
    if (!selfAssessment) return;
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setResult(null);
    setFinalLevel(null);
    setStep('TEST');
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
    if (!finalLevel) return;
    setIsSaving(true);

    try {
      const updatedUser: UserProfile = {
        ...user,
        grade: selectedGrade,
        englishLevel: finalLevel,
        needsOnboarding: false,
      };

      await storage.updateSessionUser(updatedUser);
      onComplete(updatedUser);
    } finally {
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
    handleStart,
    handleSelectAnswer,
    handleNext,
    handleBack,
    saveResult,
  };
};
