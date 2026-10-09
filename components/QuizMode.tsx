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
import { normalizeNaruChapterQuizTask } from '../shared/naruStudy';

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
  const normalizedTaskIntent = React.useMemo(
    () => normalizeNaruChapterQuizTask(bookId, taskIntent),
    [bookId, taskIntent],
  );
  const controller = useQuizModeController({ user, bookId, taskIntent: normalizedTaskIntent });
  const compactRunning = controller.screen === 'RUNNING' && ['EN_TO_JA', 'JA_TO_EN', 'SPELLING_HINT'].includes(controller.currentQuestion?.mode || '');
  const returnToConditions = () => {
    if (controller.isScopedSession) onBack();
    else controller.resetToSetup();
  };
  const confirmExit = () => {
    if (controller.confirmExitRunning() && controller.isScopedSession) onBack();
  };

  const handleHeaderBack = () => {
    if (controller.screen === 'SETUP') {
      onBack();
      return;
    }
    if (controller.screen === 'READY') {
      if (controller.isScopedSession) onBack();
      else controller.setScreen('SETUP');
      return;
    }
    if (controller.screen === 'RUNNING') {
      controller.setShowExitConfirm(true);
      return;
    }
    returnToConditions();
  };

  const headerTitle = controller.screen === 'SETUP'
    ? `${controller.setupActualQuestionCount || controller.setupConfig.questionCount}問クイズ`
    : controller.screen === 'READY'
      ? 'この条件で始める'
      : controller.screen === 'RUNNING'
        ? 'テスト中'
        : '結果を見る';

  const headerSubtitle = controller.isScopedSession
    ? controller.activeSummary
    : controller.screen === 'SETUP'
    ? '必要なときだけ条件を変えて、すぐ始めます。'
    : controller.screen === 'READY'
      ? '条件を確認してから開始します。設定と出題はこの画面で分けます。'
      : controller.activeSummary;

  if (controller.loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="flex h-80 flex-col items-center justify-center text-medace-600">
        <Loader2 className="mb-4 h-12 w-12 animate-spin" aria-hidden="true" />
        <p className="animate-pulse text-lg font-bold">{controller.loadingMessage}</p>
      </div>
    );
  }

  if (controller.loadError) {
    return (
      <section role="alert" data-testid="quiz-load-error" className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">小テストの教材を読み込めませんでした</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{controller.loadError}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={controller.retryLoad} className="rounded-xl bg-steady-action px-5 py-3 font-bold text-steady-on-action">もう一度読み込む</button>
          <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-700">元の画面に戻る</button>
        </div>
      </section>
    );
  }

  return (
    <div className={compactRunning ? 'mx-auto max-w-3xl space-y-2 pb-2' : 'mx-auto max-w-3xl space-y-4 pb-6'}>
      <QuizHeader
        title={compactRunning ? controller.currentModeLabel : headerTitle}
        subtitle={headerSubtitle}
        compact={compactRunning}
        bookLabel={taskIntent?.wordRange ? `${controller.bookTitle || '選択した教材'} / ${taskIntent.label}` : controller.bookTitle || taskIntent?.label}
        onBack={handleHeaderBack}
      />

      {controller.screen === 'SETUP' && !controller.isScopedSession && controller.studiedWordsError && (
        <section role="alert" data-testid="quiz-history-error" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <p>{controller.studiedWordsError}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={controller.historyLoading} onClick={() => void controller.retryStudiedWords()} className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-3 font-bold disabled:opacity-60">{controller.historyLoading ? '学習記録を読み込み中' : '学習記録をもう一度読み込む'}</button>
            {controller.setupConfig.selectionMode === 'LEARNED_ONLY' && <button type="button" onClick={() => controller.updateSetupConfig({ selectionMode: 'FULL_RANDOM' })} className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-3 font-bold">全範囲から出題する</button>}
          </div>
        </section>
      )}

      {controller.startError && (
        <section role="alert" data-testid="quiz-start-error" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <p>{controller.startError}</p>
          <button type="button" onClick={controller.retryStart} className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-3 font-bold">同じ条件でもう一度準備する</button>
        </section>
      )}

      {controller.showExitConfirm && (
        <QuizExitConfirmDialog
          onCancel={() => controller.setShowExitConfirm(false)}
          onConfirm={confirmExit}
          returnDestinationLabel={controller.isScopedSession ? '章・範囲選択' : undefined}
          exitBlocked={controller.exitBlocked}
        />
      )}

      {controller.screen === 'SETUP' && controller.isScopedSession && (
        <section data-testid="quiz-scoped-session-setup" className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm leading-relaxed text-slate-600">
            {controller.setupActualQuestionCount === 0
              ? 'この章・範囲には出題できる単語がありません。章・範囲選択に戻って選び直してください。'
              : 'この小テストは選んだ章・範囲で出題します。別の範囲を選ぶときは章・範囲選択に戻ってください。'}
          </p>
          <button type="button" onClick={onBack} className="mt-4 min-h-11 rounded-xl border border-slate-200 px-4 py-3 font-bold text-slate-700">章・範囲選択へ戻る</button>
        </section>
      )}

      {controller.screen === 'SETUP' && !controller.isScopedSession && (
        <QuizSetupView
          bookId={bookId}
          setupConfig={controller.setupConfig}
          setupSummary={controller.setupSummary}
          setupCandidateWordsLength={controller.setupCandidateWords.length}
          setupActualQuestionCount={controller.setupActualQuestionCount}
          setupEmptyCopy={controller.setupEmptyCopy}
          allWordsLength={controller.allWords.length}
          learnedSelectionUnavailable={Boolean(controller.studiedWordsError) || controller.historyLoading}
          normalizedSetupRange={controller.normalizedSetupRange}
          minWordNumber={controller.minWordNumber}
          maxWordNumber={controller.maxWordNumber}
          onUpdateSetupConfig={controller.updateSetupConfig}
          onAdvanceToReady={() => controller.startQuiz(controller.setupConfig)}
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
          currentWord={controller.allWords.find(word => word.id === controller.currentQuestion?.wordId && word.bookId === controller.currentQuestion?.bookId)}
          currentQuestion={controller.currentQuestion}
          runId={controller.runId}
          pronunciationPaused={controller.showExitConfirm}
          currentModeLabel={controller.currentModeLabel}
          activeSummary={controller.activeSummary}
          currentQIndex={controller.currentQIndex}
          questionsLength={controller.questions.length}
          score={controller.score}
          questionSourceNotice={controller.questionSourceNotice}
          isHintMode={controller.isHintMode}
          showSpellingHint={controller.showSpellingHint}
          showOptions={controller.showOptions}
          selectedOption={controller.selectedOption}
          orderedTokenIds={controller.orderedTokenIds}
          orderFeedback={controller.orderFeedback}
          answerInput={controller.answerInput}
          inputResult={controller.inputResult}
          spellingFeedbackTone={controller.spellingFeedbackTone}
          spellingFeedbackMessage={controller.spellingFeedbackMessage}
          translationFeedback={controller.translationFeedback}
          translationUnassessed={controller.translationUnassessed}
          checkingTranslationFeedback={controller.checkingTranslationFeedback}
          translationAwaitingAdvance={controller.translationAwaitingAdvance}
          persistingAttempt={controller.persistingAttempt}
          saveError={controller.saveError}
          hasPendingAttempt={Boolean(controller.pendingAttempt)}
          onShowOptions={() => controller.setShowOptions(true)}
          onChangeAnswerInput={controller.setAnswerInput}
          onHintSubmit={controller.handleHintSubmit}
          onRevealSpellingHint={controller.revealSpellingHint}
          onOptionClick={controller.handleOptionClick}
          onOrderTokenSelect={controller.handleOrderTokenSelect}
          onOrderTokenRemove={controller.handleOrderTokenRemove}
          onOrderTokenMove={controller.handleOrderTokenMove}
          onOrderTokensClear={controller.handleOrderTokensClear}
          onOrderSubmit={controller.handleOrderSubmit}
          onRetrySave={controller.handleRetrySave}
          onAdvanceAfterTranslationFeedback={controller.handleAdvanceAfterTranslationFeedback}
        />
      )}

      {controller.screen === 'RESULT' && controller.activeConfig && (
        <QuizResultView
          words={controller.allWords}
          percentage={controller.percentage}
          currentModeLabel={controller.currentModeLabel}
          activeSummary={controller.activeSummary}
          score={controller.score}
          questionsLength={controller.questions.length}
          reviewTargets={controller.reviewTargets}
          translationFeedbackSummaries={controller.translationFeedbackSummaries}
          nextReviewCopy={controller.nextReviewCopy}
          onRetry={() => controller.startQuiz(controller.activeConfig!)}
          onReset={returnToConditions}
          onBack={onBack}
          resetLabel={controller.isScopedSession ? '章・範囲を選び直す' : undefined}
          backLabel={controller.isScopedSession ? '章・範囲選択へ戻る' : undefined}
        />
      )}
    </div>
  );
};

export default QuizMode;
