import React from 'react';

import type { JapaneseTranslationFeedback } from '../../types';

interface JapaneseTranslationFeedbackCardProps {
  feedback: JapaneseTranslationFeedback;
}

const getExamTargetLabel = (feedback: JapaneseTranslationFeedback): string => {
  if (feedback.examTarget === 'HIGH_SCHOOL_ENTRANCE') return '高校受験';
  if (feedback.examTarget === 'UNIVERSITY_ENTRANCE') return '大学受験';
  return '総合';
};

const JapaneseTranslationFeedbackCard: React.FC<JapaneseTranslationFeedbackCardProps> = ({
  feedback,
}) => (
  <div
    className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-4"
    data-testid="english-practice-translation-feedback-card"
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-black text-medace-700">採点フィードバック</div>
        <div className="mt-1 text-xl font-black text-slate-950">
          {feedback.score} / {feedback.maxScore}・{feedback.verdictLabel}
        </div>
      </div>
      <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-black text-orange-800">
        {getExamTargetLabel(feedback)}
      </span>
    </div>

    <p className="mt-3 text-sm font-bold leading-relaxed text-slate-800">{feedback.summaryJa}</p>

    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {feedback.criteria.map((criterion) => {
        const width = `${Math.min(100, Math.max(0, (criterion.score / Math.max(criterion.maxScore, 1)) * 100))}%`;
        return (
          <div key={criterion.label} className="rounded-lg border border-orange-100 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-700">
              <span>{criterion.label}</span>
              <span>{criterion.score}/{criterion.maxScore}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-orange-100">
              <div className="h-full rounded-full bg-orange-500" style={{ width }} />
            </div>
            <p className="mt-2 text-xs font-bold leading-relaxed text-slate-600">{criterion.comment}</p>
          </div>
        );
      })}
    </div>

    {(feedback.strengths.length > 0 || feedback.issues.length > 0) && (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {feedback.strengths.length > 0 && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3">
            <div className="text-xs font-black text-emerald-700">できている点</div>
            <ul className="mt-2 space-y-1 text-sm font-bold leading-relaxed text-emerald-800">
              {feedback.strengths.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        {feedback.issues.length > 0 && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-3">
            <div className="text-xs font-black text-red-700">次に直す点</div>
            <ul className="mt-2 space-y-1 text-sm font-bold leading-relaxed text-red-800">
              {feedback.issues.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>
    )}

    <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="text-xs font-black text-slate-500">改善訳</div>
      <div className="mt-1 text-sm font-black leading-relaxed text-slate-950">
        {feedback.improvedTranslation || feedback.expectedTranslation}
      </div>
    </div>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-orange-100 bg-white px-3 py-3">
        <div className="text-xs font-black text-orange-700">文法の見方</div>
        <p className="mt-1 text-sm font-bold leading-relaxed text-slate-700">{feedback.grammarAdviceJa}</p>
      </div>
      <div className="rounded-lg border border-orange-100 bg-white px-3 py-3">
        <div className="text-xs font-black text-orange-700">次の1問</div>
        <p className="mt-1 text-sm font-bold leading-relaxed text-slate-700">{feedback.nextDrillJa}</p>
      </div>
    </div>
  </div>
);

export default JapaneseTranslationFeedbackCard;
