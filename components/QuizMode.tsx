import React from 'react';
import { Loader2 } from 'lucide-react';

import type { LearningTaskIntent, UserProfile } from '../types';
import QuizExitConfirmDialog from './quiz/QuizExitConfirmDialog';
import QuizHeader from './quiz/QuizHeader';
import QuizReadyView from './quiz/QuizReadyView';
import QuizResultView from './quiz/QuizResultView';
import QuizRunningView from './quiz/QuizRunningView';
import QuizSetupView from './quiz/QuizSetupView';
import { useQuizModeController } from '../hooks/useQuizModeController';

interface QuizModeProps {
  user: UserProfile;
  bookId: string;
  taskIntent?: LearningTaskIntent | null;
  onBack: () => void;
}

const QuizMode: React.FC<QuizModeProps> = ({
  user,
  bookId,
  taskIntent,
  onBack,
}) => {
  const controller = useQuizModeController({ user, bookId, taskIntent });

  const handleHeaderBack = () => {
    if (controller.screen === 'SETUP') {
      onBack();
      return;
    }
    if (controller.screen === 'READY') {
      controller.setScreen('SETUP');
      return;
    }
    if (controller.screen === 'RUNNING') {
      controller.setShowExitConfirm(true);
      return;
    }
    controller.resetToSetup();
  };

  const headerTitle = controller.screen === 'SETUP'
    ? 'テスト条件を決める'
    : controller.screen === 'READY'
      ? 'この条件で始める'
      : controller.screen === 'RUNNING'
        ? 'テスト中'
        : '結果を見る';

  const headerSubtitle = controller.screen === 'SETUP'
    ? '出題パターン、方向、問題数を先に固定してから始めます。'
    : controller.screen === 'READY'
      ? '条件を確認してから開始します。設定と出題はこの画面で分けます。'
      : controller.activeSummary;

  if (controller.loading) {
    return (
      <div className="flex h-80 flex-col items-center justify-center text-medace-600">
        <Loader2 className="mb-4 h-12 w-12 animate-spin" />
        <p className="animate-pulse text-lg font-bold">{controller.loadingMessage}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6">
      <QuizHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        onBack={handleHeaderBack}
      />

      {controller.showExitConfirm && (
        <QuizExitConfirmDialog
          onCancel={() => controller.setShowExitConfirm(false)}
          onConfirm={controller.confirmExitRunning}
        />
      )}

      {controller.screen === 'SETUP' && (
        <QuizSetupView
          setupConfig={controller.setupConfig}
          setupSummary={controller.setupSummary}
          setupCandidateWordsLength={controller.setupCandidateWords.length}
          setupActualQuestionCount={controller.setupActualQuestionCount}
          setupEmptyCopy={controller.setupEmptyCopy}
          allWordsLength={controller.allWords.length}
          normalizedSetupRange={controller.normalizedSetupRange}
          minWordNumber={controller.minWordNumber}
          maxWordNumber={controller.maxWordNumber}
          onUpdateSetupConfig={controller.updateSetupConfig}
          onAdvanceToReady={controller.goToReady}
        />
      )}

      {controller.screen === 'READY' && (
        <QuizReadyView
          setupConfig={controller.setupConfig}
          setupSummary={controller.setupSummary}
          setupCandidateWordsLength={controller.setupCandidateWords.length}
          setupActualQuestionCount={controller.setupActualQuestionCount}
          onStart={() => controller.startQuiz(controller.setupConfig)}
        />
      )}

      {controller.screen === 'RUNNING' && controller.currentQuestion && (
        <QuizRunningView
          currentQuestion={controller.currentQuestion}
          currentModeLabel={controller.currentModeLabel}
          activeSummary={controller.activeSummary}
          currentQIndex={controller.currentQIndex}
          questionsLength={controller.questions.length}
          score={controller.score}
          isHintMode={controller.isHintMode}
          showSpellingHint={controller.showSpellingHint}
          showOptions={controller.showOptions}
          selectedOption={controller.selectedOption}
          answerInput={controller.answerInput}
          inputResult={controller.inputResult}
          spellingFeedbackTone={controller.spellingFeedbackTone}
          spellingFeedbackMessage={controller.spellingFeedbackMessage}
          persistingAttempt={controller.persistingAttempt}
          saveError={controller.saveError}
          hasPendingAttempt={Boolean(controller.pendingAttempt)}
          onShowOptions={() => controller.setShowOptions(true)}
          onChangeAnswerInput={controller.setAnswerInput}
          onHintSubmit={controller.handleHintSubmit}
          onRevealSpellingHint={controller.revealSpellingHint}
          onOptionClick={controller.handleOptionClick}
          onRetrySave={controller.handleRetrySave}
        />
      )}

      {controller.screen === 'RESULT' && controller.activeConfig && (
        <QuizResultView
          percentage={controller.percentage}
          currentModeLabel={controller.currentModeLabel}
          activeSummary={controller.activeSummary}
          score={controller.score}
          questionsLength={controller.questions.length}
          reviewTargets={controller.reviewTargets}
          nextReviewCopy={controller.nextReviewCopy}
          onRetry={() => controller.startQuiz(controller.activeConfig!)}
          onReset={controller.resetToSetup}
          onBack={onBack}
        />
      )}
    </div>
  );
};

export default QuizMode;
