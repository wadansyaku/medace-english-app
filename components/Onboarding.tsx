import React from 'react';
import type { UserProfile } from '../types';
import { useOnboardingController } from '../hooks/useOnboardingController';
import OnboardingProfileStep from './onboarding/OnboardingProfileStep';
import OnboardingResultStep from './onboarding/OnboardingResultStep';
import OnboardingTestStep from './onboarding/OnboardingTestStep';

export interface OnboardingProps {
  user: UserProfile;
  onComplete: (updatedUser: UserProfile) => void;
  isRetake?: boolean;
  historySummary?: string;
  onCancel?: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({
  user,
  onComplete,
  isRetake = false,
  historySummary,
  onCancel,
}) => {
  const controller = useOnboardingController({ user, onComplete });

  if (controller.step === 'PROFILE') {
    return (
      <OnboardingProfileStep
        selectedGrade={controller.selectedGrade}
        selfAssessment={controller.selfAssessment}
        isRetake={isRetake}
        historySummary={historySummary}
        onCancel={onCancel}
        onSelectGrade={controller.setSelectedGrade}
        onSelectSelfAssessment={controller.setSelfAssessment}
        onStart={controller.handleStart}
      />
    );
  }

  if (controller.step === 'RESULT' && controller.result && controller.finalLevel) {
    return (
      <OnboardingResultStep
        result={controller.result}
        finalLevel={controller.finalLevel}
        isSaving={controller.isSaving}
        isRetake={isRetake}
        historySummary={historySummary}
        onCancel={onCancel}
        onSave={controller.saveResult}
      />
    );
  }

  return (
    <OnboardingTestStep
      selectedGrade={controller.selectedGrade}
      currentQuestion={controller.currentQuestion}
      currentQuestionIndex={controller.currentQuestionIndex}
      answeredCount={controller.answeredCount}
      progressPercent={controller.progressPercent}
      currentAnswer={controller.currentAnswer}
      isRetake={isRetake}
      onCancel={onCancel}
      onSelectAnswer={controller.handleSelectAnswer}
      onBack={controller.handleBack}
      onNext={controller.handleNext}
    />
  );
};

export default Onboarding;
