import React from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';

import type {
  QuizSessionConfig,
  WorksheetQuestionMode,
} from '../../types';
import { WORKSHEET_MODE_COPY } from '../../utils/worksheet';
import { getGrammarScopesForMode } from '../../utils/grammarScope';
import { getNaruRangeSelection, isNaruRangeSelected, NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../../shared/naruBook';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import {
  QUESTION_COUNT_OPTIONS,
  QUIZ_SELECTION_COPY,
  getDefaultGrammarScopeIdForMode,
  isGrammarQuizMode,
} from '../../config/quizFlow';

interface QuizSetupViewProps {
  bookId?: string;
  setupConfig: QuizSessionConfig;
  setupSummary: string;
  setupCandidateWordsLength: number;
  setupActualQuestionCount: number;
  setupEmptyCopy: string;
  allWordsLength: number;
  learnedSelectionUnavailable?: boolean;
  normalizedSetupRange: { start: number; end: number };
  minWordNumber: number;
  maxWordNumber: number;
  onUpdateSetupConfig: (nextPartial: Partial<QuizSessionConfig>) => void;
  onAdvanceToReady: () => void;
}

const QuizSetupView: React.FC<QuizSetupViewProps> = ({
  bookId,
  setupConfig,
  setupSummary,
  setupCandidateWordsLength,
  setupActualQuestionCount,
  setupEmptyCopy,
  learnedSelectionUnavailable = false,
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
  const isEmptyTranslation = setupActualQuestionCount === 0
    && ['JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'].includes(setupConfig.questionMode);
  const primaryCtaCopy = setupActualQuestionCount > 0
    ? `${visibleQuestionCount}問はじめる`
    : '出題できません';

  return (
    <div data-testid="quiz-setup-view" className="space-y-3">
      <section className="ui-panel space-y-4">
        <div>
          <h2 className="text-2xl font-black text-slate-950">{isEmptyTranslation ? '和訳の練習' : `${visibleQuestionCount}問クイズ`}</h2>
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

        {bookId === NARU_BOOK_ID && (
          <fieldset data-testid="naru-range-presets" className="min-w-0">
            <legend className="text-sm font-bold text-slate-900">品詞から選ぶ</legend>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">同じ1冊の中から出題します。番号は詳細設定でも変更できます。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {NARU_RANGE_PRESETS.map((preset) => {
                const isActive = isNaruRangeSelected(setupConfig, preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`naru-range-${preset.id}`}
                    aria-pressed={isActive}
                    onClick={() => onUpdateSetupConfig(getNaruRangeSelection(preset))}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-left transition-colors ${isActive ? 'border-medace-500 bg-medace-50 text-medace-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className="block text-sm font-bold">{preset.label}</span>
                    <span className="block text-xs">No. {preset.start}–{preset.end}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

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
                    disabled={item.key === 'LEARNED_ONLY' && learnedSelectionUnavailable}
                    aria-pressed={isActive}
                    onClick={() => onUpdateSetupConfig({ selectionMode: item.key })}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive
                        ? 'border-medace-500 bg-medace-50 text-medace-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-950">{item.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.key === 'LEARNED_ONLY' && learnedSelectionUnavailable ? '学習記録を確認できていません。再取得後に使えます。' : item.description}</span>
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
                  <label htmlFor="quiz-range-start" className="ui-form-label">開始番号</label>
                  <input
                    type="number"
                    min={minWordNumber}
                    max={maxWordNumber}
                    id="quiz-range-start"
                    value={setupConfig.rangeStart}
                    onChange={(event) => onUpdateSetupConfig({ rangeStart: Number(event.target.value) || minWordNumber })}
                    className="ui-input"
                  />
                </div>
                <div>
                  <label htmlFor="quiz-range-end" className="ui-form-label">終了番号</label>
                  <input
                    type="number"
                    min={minWordNumber}
                    max={maxWordNumber}
                    id="quiz-range-end"
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

            {isGrammarQuizMode(setupConfig.questionMode) && !['JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'].includes(setupConfig.questionMode) && (
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
            {['JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'].includes(setupConfig.questionMode) && <p className="mt-4 rounded-xl border border-medace-100 bg-medace-50 p-3 text-sm leading-relaxed text-slate-700">
              教材の英文と日本語訳がそろった例文から出題します。訳を確認できない例文は出題しません。確認済みの別訳と解説付き問題は「英語演習」の和訳で練習できます。
            </p>}
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

      <MobileStickyActionBar className="min-w-0 px-0">
        <button
          type="button"
          data-testid="quiz-setup-primary-cta"
          disabled={setupActualQuestionCount === 0}
          onClick={onAdvanceToReady}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-steady-action px-4 py-4 font-bold text-steady-on-action transition-colors hover:bg-steady-action-hover disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {primaryCtaCopy} <ChevronRight className="h-4 w-4" />
        </button>
      </MobileStickyActionBar>
    </div>
  );
};

export default QuizSetupView;
