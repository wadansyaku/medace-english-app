import React from 'react';
import type { EnglishPracticeAttemptRecord } from '../../utils/englishPracticeProgress';

const modeLabels = {
  GRAMMAR_CLOZE: '文法・穴埋め', EN_WORD_ORDER: '文法・語順',
  JA_TRANSLATION_INPUT: '和訳・入力', JA_TRANSLATION_ORDER: '和訳・語順',
};

/** Read recorded content only. A newer question bank must never rewrite past feedback. */
const EnglishPracticeReviewHistory: React.FC<{ attempts: EnglishPracticeAttemptRecord[] }> = ({ attempts }) => {
  const recent = [...attempts].reverse().filter(attempt => attempt.curatedQuestionId
    && (attempt.lane === 'grammar' || attempt.lane === 'translation')).slice(0, 5);
  if (recent.length === 0) return null;
  return (
    <details data-testid="english-practice-review-history" className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed">
      <summary className="min-h-11 cursor-pointer font-bold text-slate-800">この端末の回答を見直す</summary>
      <p className="mt-2 text-xs text-slate-600">文法・和訳の直近5件です。問題・答案の詳細はこのブラウザー内でのみ保持します。</p>
      <div className="mt-3 space-y-3">
        {recent.map(attempt => {
          const review = attempt.review;
          return (
            <details key={attempt.id} data-testid="english-practice-review-attempt" className="min-w-0 rounded-lg border border-slate-200 p-3 [overflow-wrap:anywhere]">
              <summary className="min-h-11 cursor-pointer font-bold text-slate-800">
                {attempt.lane === 'grammar' ? '文法' : '和訳'} · {attempt.correct ? '正解' : '誤答'} · {typeof attempt.scopeLabelJa === 'string' && attempt.scopeLabelJa ? attempt.scopeLabelJa : '回答の確認'}
              </summary>
              {review ? <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-500">{modeLabels[review.mode]} · 出題時の版 {review.questionVersion}</p>
                <p>{review.prompt}</p>
                <p className="font-bold text-slate-900">{review.questionText}</p>
                <p className="whitespace-pre-wrap"><span className="font-bold">自分の回答：</span>{review.submittedAnswer}</p>
                <p><span className="font-bold">{attempt.lane === 'translation' ? '参考訳' : '参考答え'}：</span>{review.referenceAnswer}</p>
                {attempt.lane === 'grammar' && <p className="text-slate-600">{review.sourceSentence} / {review.referenceTranslation}</p>}
                {!attempt.correct && <p className="text-red-700"><span className="font-bold">今回の誤答の理由：</span>{review.answerReasonJa}</p>}
                <p><span className="font-bold">解説：</span>{review.explanationJa}</p>
                {review.meaningNotesJa.map((note, index) => <p key={index} className="text-slate-600">{note}</p>)}
                <details className="pt-2">
                  <summary className="min-h-11 cursor-pointer font-bold text-slate-600">出題時の選択肢・許容解答を確認</summary>
                  {review.displayedOptions.length > 0 && <p className="mt-2 text-slate-600">選択肢・語句：{review.displayedOptions.join(' / ')}</p>}
                  {review.acceptedAnswers.map((answer, index) => <p key={index} className="mt-2 text-slate-600">{answer}</p>)}
                  {review.alternativeNotesJa.map((note, index) => <p key={index} className="mt-2 text-slate-600">{note}</p>)}
                  <p className="mt-2 text-xs text-slate-500">記録された判定と解説です。現在の問題で採点し直していません。</p>
                </details>
              </div> : <p className="mt-3 text-slate-600">この回答には当時の問題・答案の記録がありません。版は不明です。</p>}
            </details>
          );
        })}
      </div>
    </details>
  );
};

export default EnglishPracticeReviewHistory;
