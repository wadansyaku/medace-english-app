import React from 'react';
import { ChevronRight } from 'lucide-react';

import type { QuizSessionConfig } from '../../types';
import { getGrammarCurriculumScope } from '../../utils/grammarScope';
import { WORKSHEET_MODE_COPY } from '../../utils/worksheet';
import { isGrammarQuizMode } from '../../config/quizFlow';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

interface QuizReadyViewProps {
  setupConfig: QuizSessionConfig;
  setupSummary: string;
  setupCandidateWordsLength: number;
  setupActualQuestionCount: number;
  onStart: () => void;
}

const QuizReadyView: React.FC<QuizReadyViewProps> = ({
  setupConfig,
  setupSummary,
  setupCandidateWordsLength,
  setupActualQuestionCount,
  onStart,
}) => {
  const grammarScope = setupConfig.grammarScopeId ? getGrammarCurriculumScope(setupConfig.grammarScopeId) : null;
  return (
  <div data-testid="quiz-ready-view" className="space-y-4">
    <section className="ui-panel">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Ready</div>
      <h2 className="mt-1 text-2xl font-black text-slate-950">この条件で始めます</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        ここから先は出題だけに集中します。設定は混ぜません。
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題パターン</div>
          <div className="mt-1 text-lg font-black text-slate-950">{setupSummary}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題方向</div>
          <div className="mt-1 text-lg font-black text-slate-950">{WORKSHEET_MODE_COPY[setupConfig.questionMode].label}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">対象語数</div>
          <div className="mt-1 text-lg font-black text-slate-950">{setupCandidateWordsLength}語</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題数</div>
          <div className="mt-1 text-lg font-black text-slate-950">{setupActualQuestionCount}問</div>
        </div>
        {isGrammarQuizMode(setupConfig.questionMode) && grammarScope && (
          <>
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-500">文法範囲</div>
              <div className="mt-1 text-lg font-black text-slate-950">{grammarScope.labelJa}</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-500">出題中の表示</div>
              <div className="mt-1 text-lg font-black text-slate-950">
                {setupConfig.showGrammarScopeHint === false ? '範囲を伏せる' : '範囲を明示'}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed text-slate-700">
        {setupConfig.selectionMode === 'LEARNED_ONLY'
          ? '学習モードで一度評価した単語だけを出します。クイズだけ解いた履歴は含めません。'
          : '出題中は問題と回答だけに絞ります。途中で条件は変えません。'}
      </div>
    </section>

    <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <button
        type="button"
        data-testid="quiz-ready-start"
        onClick={onStart}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-4 font-bold text-white transition-colors hover:bg-medace-700"
      >
        この条件で始める <ChevronRight className="h-4 w-4" />
      </button>
    </MobileStickyActionBar>
  </div>
  );
};

export default QuizReadyView;
