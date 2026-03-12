import React, { type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Eye,
  HelpCircle,
  SpellCheck,
} from 'lucide-react';

import type { GeneratedWorksheetQuestion } from '../../utils/worksheet';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

interface QuizRunningViewProps {
  currentQuestion: GeneratedWorksheetQuestion;
  currentModeLabel: string;
  activeSummary: string;
  currentQIndex: number;
  questionsLength: number;
  score: number;
  isHintMode: boolean;
  showOptions: boolean;
  selectedOption: string | null;
  answerInput: string;
  inputResult: 'correct' | 'incorrect' | null;
  persistingAttempt: boolean;
  saveError: string | null;
  hasPendingAttempt: boolean;
  onShowOptions: () => void;
  onChangeAnswerInput: (value: string) => void;
  onHintSubmit: (event: FormEvent) => void;
  onOptionClick: (option: string) => void;
  onRetrySave: () => void;
}

const QuizRunningView: React.FC<QuizRunningViewProps> = ({
  currentQuestion,
  currentModeLabel,
  activeSummary,
  currentQIndex,
  questionsLength,
  score,
  isHintMode,
  showOptions,
  selectedOption,
  answerInput,
  inputResult,
  persistingAttempt,
  saveError,
  hasPendingAttempt,
  onShowOptions,
  onChangeAnswerInput,
  onHintSubmit,
  onOptionClick,
  onRetrySave,
}) => (
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

      {isHintMode ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <SpellCheck className="h-4 w-4" />
            先頭2文字ヒント
          </div>
          <div className="mt-3 text-2xl font-black tracking-[0.12em] text-slate-900">
            {currentQuestion.maskedAnswer}
          </div>
          <div className="mt-2 text-sm text-amber-800/80">
            先頭2文字は見せています。全文でも、残りだけでも判定できます。
          </div>
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

    {isHintMode ? (
      <form onSubmit={onHintSubmit} className="space-y-4 animate-in slide-in-from-bottom-2 fade-in">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">英語を入力</label>
          <input
            type="text"
            value={answerInput}
            onChange={(event) => onChangeAnswerInput(event.target.value)}
            disabled={!!inputResult || persistingAttempt}
            autoFocus
            className="ui-input text-lg"
            placeholder={`${currentQuestion.hintPrefix || ''}...`}
          />
          {inputResult && (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
              inputResult === 'correct'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              {inputResult === 'correct'
                ? '正解です。この方向でも思い出せました。'
                : `不正解です。正解は ${currentQuestion.answer} です。`}
            </div>
          )}
        </section>

        <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            type="submit"
            disabled={!answerInput.trim() || !!inputResult || persistingAttempt}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-4 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <CheckCircle className="h-5 w-5" /> {persistingAttempt ? '保存中...' : '入力して判定する'}
          </button>
        </MobileStickyActionBar>
      </form>
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

export default QuizRunningView;
