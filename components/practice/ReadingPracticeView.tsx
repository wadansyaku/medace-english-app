import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  FileText,
  HelpCircle,
  Quote,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';

import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import {
  getReadingQuestionKindLabel,
  scoreReadingAnswer,
  summarizeReadingPracticeSession,
  type ReadingPracticeAnswerResult,
  type ReadingPracticePassage,
  type ReadingPracticeSessionSummary,
  type ReadingQuestion,
} from '../../utils/readingPractice';

interface ReadingPracticeViewProps {
  passages: ReadingPracticePassage[];
  initialPassageId?: string;
  initialQuestionIndex?: number;
  className?: string;
  showHeader?: boolean;
  onAnswer?: (result: ReadingPracticeAnswerResult) => void;
  onComplete?: (summary: ReadingPracticeSessionSummary) => void;
}

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

const upsertResult = (
  results: ReadingPracticeAnswerResult[],
  result: ReadingPracticeAnswerResult,
): ReadingPracticeAnswerResult[] => [
  ...results.filter((item) => item.questionId !== result.questionId),
  result,
];

const getCorrectOptionText = (question: ReadingQuestion): string => (
  question.options.find((option) => option.id === question.correctOptionId)?.textJa ?? ''
);

const questionIconByKind: Record<ReadingQuestion['kind'], React.ElementType> = {
  CONTENT_MATCH: CheckCircle,
  REFERENCE_OR_MAIN_IDEA: Quote,
  VOCAB_INFERENCE: Search,
  GRAMMAR_STRUCTURE: FileText,
};

const readingQuestionKindOrder: ReadingQuestion['kind'][] = [
  'CONTENT_MATCH',
  'REFERENCE_OR_MAIN_IDEA',
  'VOCAB_INFERENCE',
  'GRAMMAR_STRUCTURE',
];

const getNextActionForQuestion = (
  question: ReadingQuestion,
  correct: boolean,
): string => {
  if (correct) {
    if (question.kind === 'GRAMMAR_STRUCTURE') return '同じ文の主語・動詞・修飾語をもう一度声に出して確認します。';
    if (question.kind === 'VOCAB_INFERENCE') return '根拠文の前後から、知らない語の意味を日本語で一言にまとめます。';
    return '根拠文と選択肢の言い換えを1つだけメモします。';
  }
  if (question.kind === 'CONTENT_MATCH') return '選択肢の日本語を先に細かく読まず、本文中で同じ内容を述べる一文を探します。';
  if (question.kind === 'REFERENCE_OR_MAIN_IDEA') return '指示語は直前の名詞、要旨は最初と最後の文を優先して確認します。';
  if (question.kind === 'VOCAB_INFERENCE') return '知らない語だけを見ず、直前直後の動作・理由・結果から意味を絞ります。';
  return 'その文の主語、動詞、後ろから説明する語句を線で分けます。';
};

const HighlightedPassage: React.FC<{ text: string; evidenceSentence?: string }> = ({
  text,
  evidenceSentence,
}) => {
  if (!evidenceSentence) {
    return <>{text}</>;
  }

  const evidenceIndex = text.indexOf(evidenceSentence);
  if (evidenceIndex < 0) {
    return <>{text}</>;
  }

  const before = text.slice(0, evidenceIndex);
  const after = text.slice(evidenceIndex + evidenceSentence.length);

  return (
    <>
      {before}
      <mark className="rounded-md bg-medace-100 px-1 py-0.5 font-black text-medace-900">
        {evidenceSentence}
      </mark>
      {after}
    </>
  );
};

const ReadingPracticeView: React.FC<ReadingPracticeViewProps> = ({
  passages,
  initialPassageId,
  initialQuestionIndex = 0,
  className = '',
  showHeader = true,
  onAnswer,
  onComplete,
}) => {
  const resolvedInitialPassageIndex = initialPassageId
    ? Math.max(0, passages.findIndex((passage) => passage.id === initialPassageId))
    : 0;
  const [currentPassageIndex, setCurrentPassageIndex] = useState(resolvedInitialPassageIndex);
  const currentPassage = passages[currentPassageIndex];
  const resolvedInitialQuestionIndex = currentPassage
    ? clamp(initialQuestionIndex, 0, Math.max(currentPassage.questions.length - 1, 0))
    : 0;
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(resolvedInitialQuestionIndex);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<ReadingPracticeAnswerResult | null>(null);
  const [results, setResults] = useState<ReadingPracticeAnswerResult[]>([]);
  const [completed, setCompleted] = useState(false);

  React.useEffect(() => {
    const nextPassageIndex = initialPassageId
      ? Math.max(0, passages.findIndex((passage) => passage.id === initialPassageId))
      : 0;
    const nextPassage = passages[nextPassageIndex];
    const nextQuestionIndex = nextPassage
      ? clamp(initialQuestionIndex, 0, Math.max(nextPassage.questions.length - 1, 0))
      : 0;

    setCurrentPassageIndex(nextPassageIndex);
    setCurrentQuestionIndex(nextQuestionIndex);
    setSelectedOptionId(null);
    setAnswerResult(null);
    setResults([]);
    setCompleted(false);
  }, [initialPassageId, initialQuestionIndex, passages]);

  const currentQuestion = currentPassage?.questions[currentQuestionIndex];
  const totalQuestions = passages.reduce((sum, passage) => sum + passage.questions.length, 0);
  const questionOffset = passages
    .slice(0, currentPassageIndex)
    .reduce((sum, passage) => sum + passage.questions.length, 0);
  const currentQuestionNumber = currentPassage && currentQuestion ? questionOffset + currentQuestionIndex + 1 : 0;
  const progressPercent = totalQuestions > 0 ? Math.round((currentQuestionNumber / totalQuestions) * 100) : 0;
  const answeredResults = answerResult ? upsertResult(results, answerResult) : results;
  const correctCount = answeredResults.filter((result) => result.correct).length;
  const selectedOption = currentQuestion?.options.find((option) => option.id === selectedOptionId);
  const correctOptionText = currentQuestion ? getCorrectOptionText(currentQuestion) : '';
  const canMoveNext = Boolean(answerResult) && !completed;
  const isLastQuestionInPassage = currentPassage
    ? currentQuestionIndex === currentPassage.questions.length - 1
    : true;
  const isLastPassage = currentPassageIndex === passages.length - 1;
  const KindIcon = currentQuestion ? questionIconByKind[currentQuestion.kind] : HelpCircle;

  const currentKindLabel = useMemo(() => (
    currentQuestion ? getReadingQuestionKindLabel(currentQuestion.kind) : ''
  ), [currentQuestion]);

  const kindProgress = useMemo(() => readingQuestionKindOrder
    .map((kind) => {
      const total = passages.reduce(
        (sum, passage) => sum + passage.questions.filter((question) => question.kind === kind).length,
        0,
      );
      const answered = answeredResults.filter((result) => result.kind === kind);
      const correct = answered.filter((result) => result.correct).length;
      return {
        kind,
        label: getReadingQuestionKindLabel(kind),
        total,
        answered: answered.length,
        correct,
        accuracy: answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0,
      };
    })
    .filter((item) => item.total > 0), [answeredResults, passages]);

  if (!currentPassage || !currentQuestion) {
    return (
      <section className={`ui-panel ${className}`} data-testid="reading-practice-empty">
        <div className="text-xs font-bold text-slate-400">長文読解</div>
        <h2 className="mt-2 text-xl font-black text-slate-950">長文読解の問題がありません</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          レベル別の読解パッセージを生成して、このコンポーネントに渡してください。
        </p>
      </section>
    );
  }

  const resetCurrentQuestion = () => {
    setSelectedOptionId(null);
    setAnswerResult(null);
  };

  const handleCheck = () => {
    if (!selectedOptionId || answerResult || completed) return;
    const alreadyAnswered = results.some((result) => result.questionId === currentQuestion.id);
    const result = scoreReadingAnswer(currentQuestion, selectedOptionId);
    setAnswerResult(result);
    setResults((current) => upsertResult(current, result));
    if (!alreadyAnswered) {
      onAnswer?.(result);
    }
  };

  const handleNext = () => {
    if (!answerResult || completed) return;
    const nextResults = upsertResult(results, answerResult);
    setResults(nextResults);

    if (isLastQuestionInPassage && isLastPassage) {
      setCompleted(true);
      onComplete?.(summarizeReadingPracticeSession(passages, nextResults));
      return;
    }

    if (isLastQuestionInPassage) {
      setCurrentPassageIndex((current) => current + 1);
      setCurrentQuestionIndex(0);
    } else {
      setCurrentQuestionIndex((current) => current + 1);
    }
    resetCurrentQuestion();
  };

  return (
    <div data-testid="reading-practice-view" className={`space-y-4 pb-24 sm:pb-0 ${className}`}>
      <section className="ui-panel">
        {showHeader ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-400">長文読解</div>
              <h2 className="mt-1 text-xl font-black text-slate-950">短い英文を読んで根拠まで確認</h2>
            </div>
            <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
              {currentQuestionNumber} / {totalQuestions}
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
              {currentQuestionNumber} / {totalQuestions}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-500">
              <span>{currentPassage.levelLabelJa}</span>
              <span className="text-medace-700">正解 {correctCount}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-medace-500 transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-medace-200 bg-medace-50 px-4 py-3 text-sm font-bold text-medace-800">
            {currentKindLabel}
          </div>
        </div>
      </section>

      <section className="ui-panel-subtle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-400">設問タイプ</div>
            <p className="mt-1 text-sm font-bold text-slate-700">設問ごとに弱点を残して、次の本文選びにつなげます。</p>
          </div>
          {completed && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              完了 {correctCount} / {totalQuestions}
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {kindProgress.map((item) => (
            <div key={item.kind} className="rounded-2xl border border-white/80 bg-white px-3 py-3">
              <div className="text-xs font-black text-slate-500">{item.label}</div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span className="text-lg font-black text-slate-950">{item.answered}/{item.total}</span>
                <span className={`text-xs font-black ${item.answered > 0 && item.accuracy < 70 ? 'text-red-600' : 'text-medace-700'}`}>
                  {item.answered > 0 ? `${item.accuracy}%` : '未回答'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{currentPassage.topicJa}</span>
          <span className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
            {currentPassage.estimatedWords} words
          </span>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <BookOpen className="mt-1 h-6 w-6 shrink-0 text-medace-600" />
          <div>
            <h3 className="text-2xl font-black leading-tight text-slate-950">{currentPassage.titleJa}</h3>
            <div className="mt-1 text-sm font-bold text-slate-400">{currentPassage.titleEn}</div>
          </div>
        </div>
        <p className="mt-5 max-w-readable text-base font-semibold leading-8 text-slate-800">
          <HighlightedPassage
            text={currentPassage.passageEn}
            evidenceSentence={answerResult ? currentQuestion.evidenceSentence : undefined}
          />
        </p>
        {currentPassage.vocabularyFocus.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {currentPassage.vocabularyFocus.map((word) => (
              <span key={word} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
                {word}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-medace-50 text-medace-700">
              <KindIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs font-bold text-slate-400">設問</div>
              <h3 className="mt-0.5 text-lg font-black text-slate-950">{currentKindLabel}</h3>
            </div>
          </div>
          {currentQuestion.grammarFocusJa && (
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500">
              {currentQuestion.grammarFocusJa}
            </span>
          )}
        </div>

        <p className="mt-4 text-xl font-black leading-relaxed text-slate-950">{currentQuestion.promptJa}</p>

        <div className="mt-5 grid gap-3">
          {currentQuestion.options.map((option) => {
            const isSelected = selectedOptionId === option.id;
            const isCorrect = answerResult && option.id === currentQuestion.correctOptionId;
            const isWrongSelection = answerResult && isSelected && option.id !== currentQuestion.correctOptionId;

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                disabled={Boolean(answerResult)}
                onClick={() => setSelectedOptionId(option.id)}
                className={`flex min-h-12 w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition-all ${
                  isCorrect
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100'
                    : isWrongSelection
                      ? 'border-red-300 bg-red-50 text-red-700 ring-2 ring-red-100'
                      : isSelected
                        ? 'border-medace-400 bg-medace-50 text-medace-900 ring-2 ring-medace-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-medace-200 hover:text-medace-800'
                } disabled:cursor-not-allowed`}
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-slate-500 shadow-sm">
                  {option.id.toUpperCase()}
                </span>
                <span className="leading-relaxed">{option.textJa}</span>
              </button>
            );
          })}
        </div>

        {answerResult && (
          <div className={`mt-5 rounded-2xl border px-4 py-4 ${
            answerResult.correct
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}>
            <div className={`flex items-start gap-3 text-sm font-black ${
              answerResult.correct ? 'text-emerald-800' : 'text-red-700'
            }`}>
              {answerResult.correct ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
              <div>
                <div>{answerResult.correct ? '正解です' : 'もう一度、根拠を確認しましょう'}</div>
                {!answerResult.correct && selectedOption && (
                  <div className="mt-1 font-bold">選んだ答え: {selectedOption.textJa}</div>
                )}
                <div className="mt-1 font-bold">正解: {correctOptionText}</div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
                <div className="text-[11px] font-bold text-slate-400">根拠文</div>
                <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800">{currentQuestion.evidenceSentence}</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
                <div className="text-[11px] font-bold text-slate-400">解説</div>
                <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800">{currentQuestion.explanationJa}</p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
              <div className="text-[11px] font-bold text-slate-400">次の見方</div>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800">
                {getNextActionForQuestion(currentQuestion, answerResult.correct)}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="ui-panel-subtle">
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-medace-600" />
          <p className="text-sm font-bold leading-relaxed text-slate-700">
            迷ったら、選択肢を先に決めず、本文中で同じ内容を言っている文を探します。判定後に根拠文が色付きで表示されます。
          </p>
        </div>
      </section>

      <MobileStickyActionBar className="-mx-4 border-t border-slate-100 bg-white/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm">
        {answerResult ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={handleNext}
              disabled={!canMoveNext}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLastQuestionInPassage && isLastPassage ? '結果を確認する' : '次の設問へ'}
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={resetCurrentQuestion}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 transition-colors hover:border-medace-300 hover:text-medace-700 sm:min-w-[150px]"
            >
              <RotateCcw className="h-5 w-5" />
              もう一度確認
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={handleCheck}
              disabled={!selectedOptionId}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <CheckCircle className="h-5 w-5" />
              判定する
            </button>
            <button
              type="button"
              onClick={resetCurrentQuestion}
              disabled={!selectedOptionId}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 transition-colors hover:border-medace-300 hover:text-medace-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[140px]"
            >
              <RotateCcw className="h-5 w-5" />
              選び直す
            </button>
          </div>
        )}
      </MobileStickyActionBar>
    </div>
  );
};

export default ReadingPracticeView;
