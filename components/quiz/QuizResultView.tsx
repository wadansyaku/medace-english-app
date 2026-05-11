import React from 'react';
import {
  AlertCircle,
  CheckCircle,
  RotateCcw,
} from 'lucide-react';

import type { GeneratedWorksheetQuestion } from '../../utils/worksheet';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

interface QuizResultViewProps {
  percentage: number;
  currentModeLabel: string;
  activeSummary: string;
  score: number;
  questionsLength: number;
  reviewTargets: GeneratedWorksheetQuestion[];
  translationFeedbackSummaries: GeneratedWorksheetQuestion[];
  nextReviewCopy: string;
  onRetry: () => void;
  onReset: () => void;
  onBack: () => void;
}

const QuizResultView: React.FC<QuizResultViewProps> = ({
  percentage,
  currentModeLabel,
  activeSummary,
  score,
  questionsLength,
  reviewTargets,
  translationFeedbackSummaries,
  nextReviewCopy,
  onRetry,
  onReset,
  onBack,
}) => (
  <div data-testid="quiz-result-view" className="space-y-4">
    <section className="rounded-[32px] bg-white p-6 shadow-lg sm:p-8">
      <div className="text-center">
        <div className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          {percentage >= 80 ? (
            <CheckCircle className="h-10 w-10 text-green-500" />
          ) : (
            <AlertCircle className="h-10 w-10 text-medace-500" />
          )}
        </div>
        <h2 className="text-3xl font-black text-slate-900">テスト完了</h2>
        <p className="mt-2 text-sm text-slate-500">
          {currentModeLabel} で確認しました。点数より、次に直すところだけ見れば十分です。
        </p>
        <div className="mt-3 text-sm font-bold text-slate-500">{activeSummary}</div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-medace-50 px-4 py-2 text-sm font-bold text-medace-700">
          正解 {score} / {questionsLength}
          <span className="text-medace-400">{percentage}%</span>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次に直す3問</div>
          {reviewTargets.length > 0 ? (
            <div className="mt-4 space-y-3">
              {reviewTargets.map((question) => (
                <div key={question.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-slate-900">{question.promptText}</div>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                      10分後
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {question.promptLabel} / 正解: {question.answer}
                  </div>
                  {question.translationFeedback && (
                    <div
                      className="mt-3 rounded-xl border border-orange-100 bg-orange-50 px-3 py-3 text-sm leading-relaxed text-slate-700"
                      data-testid="quiz-review-translation-feedback-summary"
                    >
                      <div className="font-black text-orange-800">
                        {question.translationFeedback.score} / {question.translationFeedback.maxScore}・{question.translationFeedback.verdictLabel}
                      </div>
                      <div className="mt-1">改善訳: {question.translationFeedback.improvedTranslation}</div>
                      <div className="mt-1">次ドリル: {question.translationFeedback.nextDrillJa}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
              直しが必要な単語はありません。このセットはそのまま卒業で大丈夫です。
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-medace-100 bg-[#fff8ef] p-5">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次の一手</div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl bg-white px-4 py-4">
              <div className="font-bold text-slate-900">次の復習タイミング</div>
              <div className="mt-1 leading-relaxed">{nextReviewCopy}</div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-4">
              <div className="font-bold text-slate-900">おすすめの次アクション</div>
              <div className="mt-1 leading-relaxed">
                {reviewTargets.length > 0
                  ? 'いまは再挑戦より、間違えた語だけ先に見直すほうが効率的です。'
                  : '余裕があれば別の出題方向で1回だけ確認すると、想起の幅が広がります。'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {translationFeedbackSummaries.length > 0 && (
        <div
          className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5"
          data-testid="quiz-result-translation-feedback-summary"
        >
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-orange-500">和訳フィードバック</div>
          <div className="mt-4 space-y-3">
            {translationFeedbackSummaries.map((question) => {
              const feedback = question.translationFeedback;
              if (!feedback) return null;
              return (
                <div
                  key={question.id}
                  className="rounded-2xl border border-orange-100 bg-white px-4 py-4"
                  data-testid="quiz-result-translation-feedback-item"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-bold text-slate-900">{question.promptText}</div>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-800">
                      {feedback.score} / {feedback.maxScore}・{feedback.verdictLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">{feedback.summaryJa}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-xs font-black text-slate-500">改善訳</div>
                      <div className="mt-1 text-sm font-bold leading-relaxed text-slate-900">{feedback.improvedTranslation}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-xs font-black text-slate-500">次ドリル</div>
                      <div className="mt-1 text-sm font-bold leading-relaxed text-slate-900">{feedback.nextDrillJa}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>

    <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="space-y-3">
        <button
          type="button"
          data-testid="quiz-result-retry"
          onClick={onRetry}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-4 font-bold text-white transition-colors hover:bg-medace-700"
        >
          <RotateCcw className="h-4 w-4" /> 同じ条件で再挑戦
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-testid="quiz-result-reset"
            onClick={onReset}
            className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-200"
          >
            条件を決め直す
          </button>
          <button
            type="button"
            data-testid="quiz-result-back-dashboard"
            onClick={onBack}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            ダッシュボードへ戻る
          </button>
        </div>
      </div>
    </MobileStickyActionBar>
  </div>
);

export default QuizResultView;
