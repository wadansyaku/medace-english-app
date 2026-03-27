import React from 'react';
import { ChevronRight } from 'lucide-react';

import type {
  QuizSessionConfig,
  WorksheetQuestionMode,
} from '../../types';
import { WORKSHEET_MODE_COPY } from '../../utils/worksheet';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import {
  QUESTION_COUNT_OPTIONS,
  QUIZ_SELECTION_COPY,
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
}) => (
  <div data-testid="quiz-setup-view" className="space-y-4">
    <section className="ui-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Step 1</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">出題パターンを選ぶ</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            今日どこを確認するかだけ先に決めます。スマホでは1つずつ条件を固定したほうが迷いません。
          </p>
        </div>
        <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
          {setupSummary}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {QUIZ_SELECTION_COPY.map((item) => {
          const isActive = setupConfig.selectionMode === item.key;
          return (
            <button
              key={item.key}
              type="button"
              data-testid={`quiz-selection-${item.key.toLowerCase()}`}
              onClick={() => onUpdateSetupConfig({ selectionMode: item.key })}
              className={`ui-option-card ${isActive ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-black text-slate-950">{item.label}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-500">{item.description}</div>
                </div>
                <div className={`h-5 w-5 rounded-full border-2 ${isActive ? 'border-medace-500 bg-medace-500' : 'border-slate-300 bg-white'}`}></div>
              </div>
            </button>
          );
        })}
      </div>

      {setupConfig.selectionMode === 'RANGE_RANDOM' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

    <section className="ui-panel">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Step 2</div>
      <h2 className="mt-1 text-xl font-black text-slate-950">出題方向を選ぶ</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        英日・日英・スペルチェックのどれで確認するかを固定します。
      </p>
      <div className="mt-4 grid gap-3">
        {(Object.keys(WORKSHEET_MODE_COPY) as WorksheetQuestionMode[]).map((questionMode) => {
          const isActive = setupConfig.questionMode === questionMode;
          return (
            <button
              key={questionMode}
              type="button"
              data-testid={`quiz-direction-${questionMode.toLowerCase()}`}
              onClick={() => onUpdateSetupConfig({ questionMode })}
              className={`ui-option-card ${isActive ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
            >
              <div className="text-base font-black text-slate-950">{WORKSHEET_MODE_COPY[questionMode].label}</div>
              <div className="mt-1 text-sm leading-relaxed text-slate-500">
                {WORKSHEET_MODE_COPY[questionMode].description}
              </div>
            </button>
          );
        })}
      </div>
    </section>

    <section className="ui-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Step 3</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">問題数を選ぶ</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
          候補 {setupCandidateWordsLength} 語
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {QUESTION_COUNT_OPTIONS.map((count) => {
          const isActive = setupConfig.questionCount === count;
          return (
            <button
              key={count}
              type="button"
              data-testid={`quiz-count-${count}`}
              onClick={() => onUpdateSetupConfig({ questionCount: count })}
              className={`rounded-2xl border px-4 py-4 text-center font-black transition-colors ${
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

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">対象</div>
          <div className="mt-1 text-lg font-black text-slate-950">{setupCandidateWordsLength}</div>
          <div className="text-sm text-slate-500">候補語</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題</div>
          <div className="mt-1 text-lg font-black text-slate-950">{setupActualQuestionCount}</div>
          <div className="text-sm text-slate-500">実際の問題数</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">方向</div>
          <div className="mt-1 text-sm font-black text-slate-950">{WORKSHEET_MODE_COPY[setupConfig.questionMode].label}</div>
          <div className="text-sm text-slate-500">この向きで固定</div>
        </div>
      </div>

      {setupActualQuestionCount < setupConfig.questionCount && setupCandidateWordsLength > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          候補数が少ないため、{setupActualQuestionCount}問で開始します。
        </div>
      )}

      {setupCandidateWordsLength === 0 && (
        <div
          data-testid="quiz-empty-state"
          className="mt-4 rounded-2xl border border-dashed border-red-200 bg-red-50 px-4 py-4 text-sm leading-relaxed text-red-700"
        >
          {setupEmptyCopy}
        </div>
      )}

      {setupConfig.selectionMode === 'RANGE_RANDOM' && setupCandidateWordsLength === 0 && (
        <div className="mt-4 text-sm text-slate-500">
          現在の範囲は No. {normalizedSetupRange.start} - {normalizedSetupRange.end} です。
        </div>
      )}
    </section>

    <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <button
        type="button"
        data-testid="quiz-setup-primary-cta"
        disabled={setupActualQuestionCount === 0}
        onClick={onAdvanceToReady}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-4 font-bold text-white transition-colors hover:bg-medace-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        条件を確認する <ChevronRight className="h-4 w-4" />
      </button>
    </MobileStickyActionBar>
  </div>
);

export default QuizSetupView;
