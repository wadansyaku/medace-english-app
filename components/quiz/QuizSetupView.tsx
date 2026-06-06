import React from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';

import type {
  QuizSessionConfig,
  WorksheetQuestionMode,
} from '../../types';
import { WORKSHEET_MODE_COPY } from '../../utils/worksheet';
import { getGrammarScopesForMode } from '../../utils/grammarScope';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import {
  QUESTION_COUNT_OPTIONS,
  QUIZ_SELECTION_COPY,
  getDefaultGrammarScopeIdForMode,
  isGrammarQuizMode,
} from '../../config/quizFlow';

interface QuizSetupViewProps {
  setupConfig: QuizSessionConfig;
  setupSummary: string;
  setupCandidateWordsLength: number;
  setupActualQuestionCount: number;
  setupEmptyCopy: string;
  allWordsLength: number;
  normalizedSetupRange: { start: number; end: number };
  minWordNumber: number;
  maxWordNumber: number;
  onUpdateSetupConfig: (nextPartial: Partial<QuizSessionConfig>) => void;
  onAdvanceToReady: () => void;
}

const QuizSetupView: React.FC<QuizSetupViewProps> = ({
  setupConfig,
  setupSummary,
  setupCandidateWordsLength,
  setupActualQuestionCount,
  setupEmptyCopy,
  normalizedSetupRange,
  minWordNumber,
  maxWordNumber,
  onUpdateSetupConfig,
  onAdvanceToReady,
}) => {
  const activeModeCopy = WORKSHEET_MODE_COPY[setupConfig.questionMode];
  const visibleQuestionCount = setupActualQuestionCount > 0
    ? setupActualQuestionCount
    : setupConfig.questionCount;
  const primaryCtaCopy = setupActualQuestionCount > 0
    ? `${visibleQuestionCount}問はじめる`
    : '出題できません';

  return (
    <div data-testid="quiz-setup-view" className="space-y-3">
      <section className="ui-panel space-y-4">
        <div>
          <h2 className="text-2xl font-black text-slate-950">{visibleQuestionCount}問クイズ</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            必要なときだけ詳細設定で条件を変えます。
          </p>
        </div>

        <div
          data-testid="quiz-setup-compact-summary"
          className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-3 text-sm font-bold leading-relaxed text-medace-900"
        >
          {setupSummary} / {activeModeCopy.label} / 候補 {setupCandidateWordsLength}語
        </div>

        {setupActualQuestionCount < setupConfig.questionCount && setupCandidateWordsLength > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            候補数が少ないため、{setupActualQuestionCount}問で開始します。
          </div>
        )}

        {setupCandidateWordsLength === 0 && (
          <div
            data-testid="quiz-empty-state"
            className="rounded-2xl border border-dashed border-red-200 bg-red-50 px-4 py-4 text-sm leading-relaxed text-red-700"
          >
            {setupEmptyCopy}
          </div>
        )}

        {setupConfig.selectionMode === 'RANGE_RANDOM' && setupCandidateWordsLength === 0 && (
          <div className="text-sm text-slate-500">
            現在の範囲は No. {normalizedSetupRange.start} - {normalizedSetupRange.end} です。
          </div>
        )}
      </section>

      <details data-testid="quiz-advanced-settings" className="ui-panel group overflow-hidden p-0">
        <summary
          data-testid="quiz-advanced-settings-toggle"
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-left [&::-webkit-details-marker]:hidden"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
              <Settings2 className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-black text-slate-950">詳細設定</span>
              <span className="block text-xs font-bold text-slate-500">範囲・方向・問題数を変える</span>
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-6 border-t border-slate-100 px-5 py-5">
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black text-slate-950">範囲</h3>
              <span className="text-xs font-bold text-slate-400">{setupSummary}</span>
            </div>

            <div className="mt-3 grid gap-2">
              {QUIZ_SELECTION_COPY.map((item) => {
                const isActive = setupConfig.selectionMode === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-testid={`quiz-selection-${item.key.toLowerCase()}`}
                    onClick={() => onUpdateSetupConfig({ selectionMode: item.key })}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-medace-500 bg-medace-50 text-medace-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-950">{item.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.description}</span>
                      </span>
                      <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${isActive ? 'border-medace-500 bg-medace-500' : 'border-slate-300 bg-white'}`} />
                    </span>
                  </button>
                );
              })}
            </div>

            {setupConfig.selectionMode === 'RANGE_RANDOM' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="ui-form-label">開始番号</label>
                  <input
                    type="number"
                    min={minWordNumber}
                    max={maxWordNumber}
                    value={setupConfig.rangeStart}
                    onChange={(event) => onUpdateSetupConfig({ rangeStart: Number(event.target.value) || minWordNumber })}
                    className="ui-input"
                  />
                </div>
                <div>
                  <label className="ui-form-label">終了番号</label>
                  <input
                    type="number"
                    min={minWordNumber}
                    max={maxWordNumber}
                    value={setupConfig.rangeEnd}
                    onChange={(event) => onUpdateSetupConfig({ rangeEnd: Number(event.target.value) || maxWordNumber })}
                    className="ui-input"
                  />
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-base font-black text-slate-950">出題方向</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(Object.keys(WORKSHEET_MODE_COPY) as WorksheetQuestionMode[]).map((questionMode) => {
                const isActive = setupConfig.questionMode === questionMode;
                return (
                  <button
                    key={questionMode}
                    type="button"
                    data-testid={`quiz-direction-${questionMode.toLowerCase()}`}
                    onClick={() => onUpdateSetupConfig({
                      questionMode,
                      grammarScopeId: getDefaultGrammarScopeIdForMode(questionMode),
                    })}
                    className={`min-h-12 rounded-2xl border px-4 py-3 text-left text-sm font-black transition-colors ${
                      isActive
                        ? 'border-medace-500 bg-medace-50 text-medace-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {WORKSHEET_MODE_COPY[questionMode].label}
                  </button>
                );
              })}
            </div>

            {isGrammarQuizMode(setupConfig.questionMode) && (
              <div className="mt-4 space-y-4 rounded-2xl border border-medace-100 bg-medace-50/50 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-950">文法範囲</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      単語は同じまま、使う文法だけ固定できます。
                    </p>
                  </div>
                  <div className="inline-grid grid-cols-2 overflow-hidden rounded-2xl border border-medace-200 bg-white p-1">
                    {[
                      { value: true, label: '明示する' },
                      { value: false, label: '伏せる' },
                    ].map((item) => {
                      const isActive = (setupConfig.showGrammarScopeHint !== false) === item.value;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          data-testid={`quiz-grammar-scope-visibility-${item.value ? 'show' : 'hide'}`}
                          onClick={() => onUpdateSetupConfig({ showGrammarScopeHint: item.value })}
                          className={`min-h-10 rounded-xl px-3 text-sm font-bold transition-colors ${
                            isActive ? 'bg-medace-500 text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-medace-50'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {getGrammarScopesForMode(setupConfig.questionMode).map((scope) => {
                    const isActive = setupConfig.grammarScopeId === scope.id;
                    return (
                      <button
                        key={scope.id}
                        type="button"
                        data-testid={`quiz-grammar-scope-${scope.id}`}
                        onClick={() => onUpdateSetupConfig({ grammarScopeId: scope.id })}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                          isActive
                            ? 'border-medace-400 bg-white text-slate-950 shadow-sm'
                            : 'border-medace-100 bg-white/70 text-slate-600 hover:border-medace-300'
                        }`}
                      >
                        <div className="text-sm font-black">{scope.labelJa}</div>
                        <div className="mt-1 text-xs leading-relaxed text-slate-500">{scope.cefrLevel} / {scope.descriptionJa}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black text-slate-950">問題数</h3>
              <span className="text-xs font-bold text-slate-400">候補 {setupCandidateWordsLength}語</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {QUESTION_COUNT_OPTIONS.map((count) => {
                const isActive = setupConfig.questionCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    data-testid={`quiz-count-${count}`}
                    onClick={() => onUpdateSetupConfig({ questionCount: count })}
                    className={`rounded-2xl border px-3 py-3 text-center font-black transition-colors ${
                      isActive
                        ? 'border-medace-500 bg-medace-50 text-medace-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {count}問
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </details>

      <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          type="button"
          data-testid="quiz-setup-primary-cta"
          disabled={setupActualQuestionCount === 0}
          onClick={onAdvanceToReady}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-4 font-bold text-slate-950 transition-colors hover:bg-medace-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {primaryCtaCopy} <ChevronRight className="h-4 w-4" />
        </button>
      </MobileStickyActionBar>
    </div>
  );
};

export default QuizSetupView;
