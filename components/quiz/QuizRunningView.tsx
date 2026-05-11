import React, { type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle,
  Eye,
  HelpCircle,
  RotateCcw,
  SpellCheck,
} from 'lucide-react';

import type { GeneratedWorksheetQuestion } from '../../utils/worksheet';
import type { JapaneseTranslationFeedback } from '../../types';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

interface QuizRunningViewProps {
  currentQuestion: GeneratedWorksheetQuestion;
  currentModeLabel: string;
  activeSummary: string;
  currentQIndex: number;
  questionsLength: number;
  score: number;
  isHintMode: boolean;
  showSpellingHint: boolean;
  showOptions: boolean;
  selectedOption: string | null;
  orderedTokenIds: string[];
  orderFeedback: 'correct' | 'incorrect' | null;
  answerInput: string;
  inputResult: 'correct' | 'incorrect' | null;
  spellingFeedbackTone: 'info' | 'correct' | 'incorrect' | null;
  spellingFeedbackMessage: string | null;
  translationFeedback: JapaneseTranslationFeedback | null;
  checkingTranslationFeedback: boolean;
  translationAwaitingAdvance: boolean;
  persistingAttempt: boolean;
  saveError: string | null;
  hasPendingAttempt: boolean;
  onShowOptions: () => void;
  onChangeAnswerInput: (value: string) => void;
  onHintSubmit: (event: FormEvent) => void;
  onRevealSpellingHint: () => void;
  onOptionClick: (option: string) => void;
  onOrderTokenSelect: (tokenId: string) => void;
  onOrderTokenRemove: (tokenId: string) => void;
  onOrderTokenMove: (tokenId: string, direction: -1 | 1) => void;
  onOrderTokensClear: () => void;
  onOrderSubmit: () => void;
  onRetrySave: () => void;
  onAdvanceAfterTranslationFeedback: () => void;
}

const QuizRunningView: React.FC<QuizRunningViewProps> = ({
  currentQuestion,
  currentModeLabel,
  activeSummary,
  currentQIndex,
  questionsLength,
  score,
  isHintMode,
  showSpellingHint,
  showOptions,
  selectedOption,
  orderedTokenIds,
  orderFeedback,
  answerInput,
  inputResult,
  spellingFeedbackTone,
  spellingFeedbackMessage,
  translationFeedback,
  checkingTranslationFeedback,
  translationAwaitingAdvance,
  persistingAttempt,
  saveError,
  hasPendingAttempt,
  onShowOptions,
  onChangeAnswerInput,
  onHintSubmit,
  onRevealSpellingHint,
  onOptionClick,
  onOrderTokenSelect,
  onOrderTokenRemove,
  onOrderTokenMove,
  onOrderTokensClear,
  onOrderSubmit,
  onRetrySave,
  onAdvanceAfterTranslationFeedback,
}) => {
  const isOrderMode = currentQuestion.interactionType === 'ORDERING';
  const isTextInputMode = currentQuestion.interactionType === 'TEXT_INPUT';
  const isTranslationInputMode = currentQuestion.mode === 'JA_TRANSLATION_INPUT';
  const selectedTokenIdSet = new Set(orderedTokenIds);
  const tokenMap = new Map((currentQuestion.tokens || []).map((token) => [token.id, token]));
  const selectedTokens = orderedTokenIds
    .map((tokenId) => tokenMap.get(tokenId))
    .filter((token): token is NonNullable<typeof currentQuestion.tokens>[number] => Boolean(token));
  const expectedTokenCount = currentQuestion.answerTokenIds?.length || 0;
  const canSubmitOrder = isOrderMode && expectedTokenCount > 0 && orderedTokenIds.length === expectedTokenCount && !orderFeedback && !persistingAttempt;
  const hasAnsweredQuestion = isOrderMode
    ? Boolean(orderFeedback)
    : isTextInputMode
      ? Boolean(inputResult)
      : Boolean(selectedOption);
  const shouldHideSourceSentenceUntilAnswered = currentQuestion.mode === 'GRAMMAR_CLOZE' || currentQuestion.mode === 'EN_WORD_ORDER';
  const shouldHideSourceTranslationUntilAnswered = currentQuestion.mode === 'JA_TRANSLATION_ORDER' || isTranslationInputMode;
  const visibleSourceSentence = currentQuestion.sourceSentence && (!shouldHideSourceSentenceUntilAnswered || hasAnsweredQuestion)
    ? currentQuestion.sourceSentence
    : null;
  const visibleSourceTranslation = currentQuestion.sourceTranslation && (!shouldHideSourceTranslationUntilAnswered || hasAnsweredQuestion)
    ? currentQuestion.sourceTranslation
    : null;
  const hasHiddenSourceSentence = Boolean(currentQuestion.sourceSentence && shouldHideSourceSentenceUntilAnswered && !hasAnsweredQuestion);
  const hasHiddenSourceTranslation = Boolean(currentQuestion.sourceTranslation && shouldHideSourceTranslationUntilAnswered && !hasAnsweredQuestion);
  const grammarScopeText = currentQuestion.grammarScope?.labelJa || (hasAnsweredQuestion ? currentQuestion.grammarFocus : '') || '';
  const shouldShowGrammarScope = Boolean(grammarScopeText && (currentQuestion.showGrammarScopeHint !== false || hasAnsweredQuestion));
  const hasHiddenGrammarScope = Boolean(grammarScopeText && currentQuestion.showGrammarScopeHint === false && !hasAnsweredQuestion);
  const shouldShowGrammarExplanation = Boolean(
    currentQuestion.grammarExplanation
    && (currentQuestion.showGrammarScopeHint !== false || hasAnsweredQuestion)
  );
  const shouldShowReferencePanel = Boolean(
    visibleSourceSentence
    || visibleSourceTranslation
    || shouldShowGrammarScope
    || hasHiddenSourceSentence
    || hasHiddenSourceTranslation
    || hasHiddenGrammarScope,
  );
  const isInputBusy = persistingAttempt || checkingTranslationFeedback;
  const showTranslationAdvanceAction = isTranslationInputMode && Boolean(inputResult && translationFeedback);
  const translationAdvanceLabel = currentQIndex < questionsLength - 1
    ? 'フィードバックを読んだので次へ'
    : 'フィードバックを読んだので結果を見る';

  return (
  <div data-testid="quiz-running-view" className="space-y-4">
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
          {activeSummary}
        </div>
        <div className="text-sm font-bold text-slate-500">
          第 {currentQIndex + 1} 問 / {questionsLength}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-slate-500">
        <span>{currentModeLabel}</span>
        <span className="font-bold text-medace-600">正解数: {score}</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-medace-500 transition-all duration-500 ease-out"
          style={{ width: `${((currentQIndex + 1) / questionsLength) * 100}%` }}
        ></div>
      </div>
    </section>

    <section data-testid="quiz-question-card" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <span className="block text-xs font-bold uppercase tracking-widest text-slate-400">
        {currentQuestion.promptLabel}
      </span>
      <h2 className="mt-3 text-3xl font-black leading-tight text-slate-800 sm:text-4xl">
        {currentQuestion.promptText}
      </h2>
      {currentQuestion.instruction && (
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{currentQuestion.instruction}</p>
      )}

      {shouldShowReferencePanel && (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {visibleSourceSentence && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-500">English</div>
              <div className="mt-2 text-base font-bold leading-relaxed text-slate-800">{visibleSourceSentence}</div>
            </div>
          )}
          {hasHiddenSourceSentence && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-500">English</div>
              <div className="mt-2 text-sm font-bold leading-relaxed text-orange-900">
                元の英文は、判定後に表示します。
              </div>
            </div>
          )}
          {(visibleSourceTranslation || hasHiddenSourceTranslation) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                日本語
              </div>
              <div className="mt-2 text-base font-bold leading-relaxed text-slate-800">
                {visibleSourceTranslation
                  || (hasHiddenSourceTranslation ? '日本語訳は、判定後に表示します。' : '')}
              </div>
            </div>
          )}
          {(shouldShowGrammarScope || hasHiddenGrammarScope) && (
            <div className="rounded-2xl border border-medace-200 bg-medace-50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-medace-600">
                文法
              </div>
              <div className="mt-2 text-base font-bold leading-relaxed text-slate-800">
                {hasHiddenGrammarScope ? '文法範囲は、判定後に表示します。' : grammarScopeText}
              </div>
            </div>
          )}
        </div>
      )}

      {shouldShowGrammarExplanation && currentQuestion.grammarExplanation && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-black text-orange-800">
            <BookOpenCheck className="h-4 w-4" />
            {currentQuestion.grammarExplanation.labelJa}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-500">Pattern</div>
              <p className="mt-1 text-sm font-bold leading-relaxed text-slate-800">{currentQuestion.grammarExplanation.patternJa}</p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-500">Exam</div>
              <p className="mt-1 text-sm font-bold leading-relaxed text-slate-800">{currentQuestion.grammarExplanation.examFocusJa}</p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-500">Auto</div>
              <p className="mt-1 text-sm font-bold leading-relaxed text-slate-800">{currentQuestion.grammarExplanation.automationDrillJa}</p>
            </div>
          </div>
          {currentQuestion.grammarExplanation.threeSlotFrameJa && (
            <div className="mt-3 inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-black text-orange-800">
              3ます: {currentQuestion.grammarExplanation.threeSlotFrameJa}
            </div>
          )}
        </div>
      )}

      {isTextInputMode ? (
        <div className={`mt-6 rounded-2xl px-4 py-4 ${showSpellingHint ? 'border border-amber-200 bg-amber-50' : 'border border-slate-200 bg-slate-50'}`}>
          {isHintMode ? (
            <>
              <div className={`flex items-center gap-2 text-sm font-bold ${showSpellingHint ? 'text-amber-800' : 'text-slate-700'}`}>
                <SpellCheck className="h-4 w-4" />
                スペルチェック
              </div>
              {showSpellingHint ? (
                <>
                  <div className="mt-3 text-2xl font-black tracking-[0.12em] text-slate-900">
                    {currentQuestion.maskedAnswer}
                  </div>
                  <div className="mt-2 text-sm text-amber-800/80">
                    先頭2文字をヒントに、全文または残りを入力してください。
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-slate-600">
                  まずはヒントなしで全文を入力します。必要なときだけ先頭2文字ヒントを出せます。
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <SpellCheck className="h-4 w-4" />
                和訳全文入力
              </div>
              <div className="mt-2 text-sm text-slate-600">
                英文を見て、日本語訳を最後まで入力します。受験答案として意味・文法・自然さを確認します。
              </div>
            </>
          )}
        </div>
      ) : isOrderMode ? (
        <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50/70 px-4 py-4 text-sm leading-relaxed text-orange-900">
          チップをタップして解答欄に並べます。登場済み単語を文の中でどう使うかまで確認します。
        </div>
      ) : (
        !showOptions && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm text-slate-500">
              まず頭の中で答えを思い出してから、次の確認に進んでください。
            </p>
          </div>
        )
      )}
    </section>

    {isTextInputMode ? (
      <form onSubmit={onHintSubmit} className="space-y-4 animate-in slide-in-from-bottom-2 fade-in">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
            {isTranslationInputMode ? '日本語訳を入力' : '英語を入力'}
          </label>
          {isTranslationInputMode ? (
            <textarea
              value={answerInput}
              onChange={(event) => onChangeAnswerInput(event.target.value)}
              disabled={!!inputResult || isInputBusy}
              autoFocus
              rows={4}
              className="ui-input min-h-[132px] resize-y text-base leading-relaxed"
              placeholder="英文の意味を日本語で全文入力"
            />
          ) : (
            <input
              type="text"
              value={answerInput}
              onChange={(event) => onChangeAnswerInput(event.target.value)}
              disabled={!!inputResult || isInputBusy}
              autoFocus
              className="ui-input text-lg"
              placeholder={showSpellingHint ? `${currentQuestion.hintPrefix || ''}...` : '英語をそのまま入力'}
            />
          )}
          {spellingFeedbackMessage && spellingFeedbackTone && (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
              spellingFeedbackTone === 'correct'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : spellingFeedbackTone === 'incorrect'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {spellingFeedbackMessage}
            </div>
          )}
          {isTranslationInputMode && translationFeedback && (
            <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4" data-testid="translation-feedback-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold text-orange-500">採点フィードバック</div>
                  <div className="mt-1 text-xl font-black text-slate-900">
                    {translationFeedback.score} / {translationFeedback.maxScore}・{translationFeedback.verdictLabel}
                  </div>
                </div>
                <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-black text-orange-800">
                  {translationFeedback.examTarget === 'HIGH_SCHOOL_ENTRANCE'
                    ? '高校受験'
                    : translationFeedback.examTarget === 'UNIVERSITY_ENTRANCE'
                      ? '大学受験'
                      : '総合'}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold leading-relaxed text-slate-800">{translationFeedback.summaryJa}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {translationFeedback.criteria.map((criterion) => {
                  const width = `${Math.min(100, Math.max(0, (criterion.score / Math.max(criterion.maxScore, 1)) * 100))}%`;
                  return (
                    <div key={criterion.label} className="rounded-xl border border-orange-100 bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-700">
                        <span>{criterion.label}</span>
                        <span>{criterion.score}/{criterion.maxScore}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100">
                        <div className="h-full rounded-full bg-orange-500" style={{ width }} />
                      </div>
                      <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">{criterion.comment}</p>
                    </div>
                  );
                })}
              </div>
              {(translationFeedback.strengths.length > 0 || translationFeedback.issues.length > 0) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {translationFeedback.strengths.length > 0 && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                      <div className="text-xs font-black text-emerald-700">できている点</div>
                      <ul className="mt-2 space-y-1 text-sm font-medium leading-relaxed text-emerald-800">
                        {translationFeedback.strengths.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                  {translationFeedback.issues.length > 0 && (
                    <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3">
                      <div className="text-xs font-black text-red-700">次に直す点</div>
                      <ul className="mt-2 space-y-1 text-sm font-medium leading-relaxed text-red-800">
                        {translationFeedback.issues.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="text-xs font-black text-slate-500">改善訳</div>
                <div className="mt-1 text-sm font-black leading-relaxed text-slate-900">{translationFeedback.improvedTranslation}</div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-orange-100 bg-white px-3 py-3">
                  <div className="text-xs font-black text-orange-700">文法の見方</div>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">{translationFeedback.grammarAdviceJa}</p>
                </div>
                <div className="rounded-xl border border-orange-100 bg-white px-3 py-3">
                  <div className="text-xs font-black text-orange-700">次の1問</div>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">{translationFeedback.nextDrillJa}</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
          {showTranslationAdvanceAction ? (
            <button
              type="button"
              data-testid="translation-feedback-next"
              onClick={onAdvanceAfterTranslationFeedback}
              disabled={!translationAwaitingAdvance || isInputBusy || Boolean(saveError && hasPendingAttempt)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-4 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <ArrowRight className="h-5 w-5" /> {translationAdvanceLabel}
            </button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={!answerInput.trim() || !!inputResult || isInputBusy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-4 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <CheckCircle className="h-5 w-5" /> {checkingTranslationFeedback ? 'AI採点中...' : persistingAttempt ? '保存中...' : isTranslationInputMode ? '和訳を判定する' : '入力して判定する'}
              </button>
              {isHintMode && !showSpellingHint && !inputResult && (
                <button
                  type="button"
                  onClick={onRevealSpellingHint}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 font-bold text-amber-800 transition-colors hover:bg-amber-100 sm:max-w-[200px]"
                >
                  <SpellCheck className="h-5 w-5" /> ヒントを見る
                </button>
              )}
            </div>
          )}
        </MobileStickyActionBar>
      </form>
    ) : isOrderMode ? (
      <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Answer</div>
              <h3 className="mt-1 text-lg font-black text-slate-950">解答欄</h3>
            </div>
            <button
              type="button"
              onClick={onOrderTokensClear}
              disabled={orderedTokenIds.length === 0 || Boolean(orderFeedback) || persistingAttempt}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-orange-200 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              やり直す
            </button>
          </div>

          <div className={`mt-4 min-h-[96px] rounded-2xl border-2 border-dashed px-3 py-3 transition-colors ${
            orderFeedback === 'correct'
              ? 'border-emerald-300 bg-emerald-50'
              : orderFeedback === 'incorrect'
                ? 'border-red-300 bg-red-50'
                : 'border-slate-200 bg-slate-50'
          }`}>
            {selectedTokens.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedTokens.map((token, index) => (
                  <div
                    key={`${token.id}-${index}`}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-2xl border bg-white px-3 py-2 text-sm font-black shadow-sm ${
                      token.learnedWordId || token.learnedWord
                        ? 'border-orange-300 text-orange-800 ring-2 ring-orange-100'
                        : 'border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{token.text}</span>
                    {!orderFeedback && (
                      <span className="ml-1 inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`${token.text}を左へ`}
                          onClick={() => onOrderTokenMove(token.id, -1)}
                          disabled={index === 0 || persistingAttempt}
                          className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${token.text}を右へ`}
                          onClick={() => onOrderTokenMove(token.id, 1)}
                          disabled={index === selectedTokens.length - 1 || persistingAttempt}
                          className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                    {!orderFeedback && (
                      <button
                        type="button"
                        aria-label={`${token.text}を外す`}
                        onClick={() => onOrderTokenRemove(token.id)}
                        disabled={persistingAttempt}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[64px] items-center justify-center text-center text-sm font-bold text-slate-400">
                正しい順番でチップを並べます
              </div>
            )}
          </div>

          {orderFeedback && (
            <div className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm font-bold ${
              orderFeedback === 'correct'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              {orderFeedback === 'correct' ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}
              <div>
                <div>{orderFeedback === 'correct' ? '正解です' : 'もう一度確認しましょう'}</div>
                <div className="mt-1 font-medium leading-relaxed">正解: {currentQuestion.answer}</div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Chips</div>
              <h3 className="mt-1 text-lg font-black text-slate-950">使う語句を選ぶ</h3>
            </div>
            <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
              {orderedTokenIds.length} / {expectedTokenCount}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {currentQuestion.tokens?.map((token) => {
              const isSelected = selectedTokenIdSet.has(token.id);
              const isLearned = Boolean(token.learnedWordId || token.learnedWord);
              return (
                <button
                  key={token.id}
                  type="button"
                  onClick={() => onOrderTokenSelect(token.id)}
                  disabled={isSelected || Boolean(orderFeedback) || persistingAttempt}
                  className={`min-h-11 rounded-2xl border px-4 py-2.5 text-sm font-black transition-all ${
                    isSelected
                      ? 'border-slate-200 bg-slate-100 text-slate-400'
                      : isLearned
                        ? 'border-orange-300 bg-orange-50 text-orange-800 shadow-sm hover:bg-orange-100'
                        : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-orange-200 hover:text-orange-700'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {token.text}
                </button>
              );
            })}
          </div>
        </section>

        <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            type="button"
            data-testid="quiz-order-submit"
            onClick={() => void onOrderSubmit()}
            disabled={!canSubmitOrder}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-4 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <CheckCircle className="h-5 w-5" /> {persistingAttempt ? '保存中...' : '判定する'}
          </button>
        </MobileStickyActionBar>
      </div>
    ) : !showOptions ? (
      <div className="animate-in slide-in-from-bottom-2 flex flex-col gap-4 fade-in">
        <button
          type="button"
          onClick={onShowOptions}
          data-testid="quiz-show-options"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-4 font-bold text-white shadow-lg transition-colors hover:bg-slate-700"
        >
          <Eye className="h-5 w-5" /> 選択肢を表示する
        </button>
        <div className="flex items-center justify-center gap-1 text-center text-sm text-slate-400">
          <HelpCircle className="h-4 w-4" />
          <span>先に自力で思い出してから見るほうが記憶が定着します。</span>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-3 animate-in zoom-in duration-200 fade-in">
        {currentQuestion.options?.map((option, index) => {
          let buttonClass = 'bg-white border-2 border-slate-100 hover:border-medace-300 hover:bg-orange-50 text-slate-700 shadow-sm';
          let icon = null;

          if (selectedOption) {
            if (option === currentQuestion.answer) {
              buttonClass = 'bg-green-50 border-green-500 text-green-700 ring-2 ring-green-200';
              icon = <CheckCircle className="h-5 w-5 text-green-600" />;
            } else if (option === selectedOption) {
              buttonClass = 'bg-red-50 border-red-500 text-red-700';
              icon = <AlertCircle className="h-5 w-5 text-red-600" />;
            } else {
              buttonClass = 'bg-slate-50 border-slate-100 text-slate-400 opacity-50';
            }
          }

          return (
            <button
              key={`${currentQuestion.id}-${index}`}
              type="button"
              onClick={() => void onOptionClick(option)}
              disabled={!!selectedOption || persistingAttempt}
              className={`flex w-full items-center justify-between rounded-2xl p-5 text-left text-lg font-semibold transition-all duration-200 ${buttonClass}`}
            >
              <span>{option}</span>
              {icon}
            </button>
          );
        })}
      </div>
    )}

    {saveError && hasPendingAttempt && (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700" data-testid="quiz-save-error">
        <div>{saveError}</div>
        <button
          type="button"
          data-testid="quiz-save-retry"
          onClick={() => void onRetrySave()}
          disabled={persistingAttempt}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {persistingAttempt ? '再保存中...' : 'もう一度保存する'}
        </button>
      </div>
    )}
  </div>
  );
};

export default QuizRunningView;
