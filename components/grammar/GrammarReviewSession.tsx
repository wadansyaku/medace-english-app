import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';

import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

export type GrammarExerciseType = 'grammar-cloze' | 'english-word-order' | 'japanese-reorder';

export interface GrammarChipToken {
  id: string;
  text: string;
  learnedWordId?: string;
  learnedWord?: string;
  locked?: boolean;
}

export interface GrammarLearnedWord {
  id?: string;
  text: string;
  meaning?: string;
}

export interface GrammarReviewExercise {
  id: string;
  type: GrammarExerciseType;
  title?: string;
  prompt: string;
  instruction?: string;
  sourceSentence?: string;
  targetTranslation?: string;
  hint?: string;
  tokens: GrammarChipToken[];
  answerTokenIds: string[];
  learnedWords?: GrammarLearnedWord[];
}

export interface GrammarAnswerResult {
  exerciseId: string;
  type: GrammarExerciseType;
  selectedTokenIds: string[];
  answerTokenIds: string[];
  correct: boolean;
  attemptCount: number;
}

export interface GrammarSessionSummary {
  total: number;
  correct: number;
  results: GrammarAnswerResult[];
}

interface GrammarReviewSessionProps {
  exercises: GrammarReviewExercise[];
  learnedWords?: GrammarLearnedWord[];
  initialExerciseIndex?: number;
  className?: string;
  onAnswer?: (result: GrammarAnswerResult) => void;
  onComplete?: (summary: GrammarSessionSummary) => void;
}

type FeedbackState = 'idle' | 'correct' | 'incorrect';

const EXERCISE_COPY: Record<GrammarExerciseType, { label: string; action: string; emptyAnswer: string }> = {
  'grammar-cloze': {
    label: '文法穴埋め',
    action: '空欄に入るchipを選ぶ',
    emptyAnswer: '空欄に入る語句をここに置きます',
  },
  'english-word-order': {
    label: '英単語並び替え',
    action: '英語の語順に並べる',
    emptyAnswer: '英文になる順番でchipを並べます',
  },
  'japanese-reorder': {
    label: '日本語並び替え',
    action: '英文の意味になる日本語を並べる',
    emptyAnswer: '自然な日本語になる順番でchipを並べます',
  },
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getTokenKey = (token: GrammarChipToken) => normalizeText(token.learnedWord ?? token.text);

const isSameOrder = (selectedTokenIds: string[], answerTokenIds: string[]) => (
  selectedTokenIds.length === answerTokenIds.length
  && selectedTokenIds.every((tokenId, index) => tokenId === answerTokenIds[index])
);

const buildLearnedWordLookup = (
  exercise: GrammarReviewExercise,
  sessionLearnedWords: GrammarLearnedWord[],
) => {
  const byId = new Set<string>();
  const byText = new Set<string>();

  [...sessionLearnedWords, ...(exercise.learnedWords ?? [])].forEach((word) => {
    if (word.id) {
      byId.add(word.id);
    }
    byText.add(normalizeText(word.text));
  });

  exercise.tokens.forEach((token) => {
    if (token.learnedWordId) {
      byId.add(token.learnedWordId);
    }
    if (token.learnedWord) {
      byText.add(normalizeText(token.learnedWord));
    }
  });

  return { byId, byText };
};

const getLearnedWordTerms = (
  exercise: GrammarReviewExercise,
  sessionLearnedWords: GrammarLearnedWord[],
) => {
  const terms = new Set<string>();
  [...sessionLearnedWords, ...(exercise.learnedWords ?? [])].forEach((word) => {
    if (word.text.trim()) {
      terms.add(word.text.trim());
    }
  });
  exercise.tokens.forEach((token) => {
    if (token.learnedWord?.trim()) {
      terms.add(token.learnedWord.trim());
    }
  });
  return Array.from(terms).sort((a, b) => b.length - a.length);
};

const HighlightedText: React.FC<{ text: string; terms: string[] }> = ({ text, terms }) => {
  const pattern = terms.length > 0
    ? new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
    : null;

  if (!pattern) {
    return <>{text}</>;
  }

  return (
    <>
      {text.split(pattern).map((part, index) => {
        const isLearned = terms.some((term) => normalizeText(term) === normalizeText(part));
        return isLearned ? (
          <mark key={`${part}-${index}`} className="rounded-md bg-medace-50 px-1 py-0.5 font-black text-medace-800">
            {part}
          </mark>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        );
      })}
    </>
  );
};

const GrammarReviewSession: React.FC<GrammarReviewSessionProps> = ({
  exercises,
  learnedWords = [],
  initialExerciseIndex = 0,
  className = '',
  onAnswer,
  onComplete,
}) => {
  const safeInitialIndex = Math.min(Math.max(initialExerciseIndex, 0), Math.max(exercises.length - 1, 0));
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [hintVisible, setHintVisible] = useState(false);
  const [attemptsByExercise, setAttemptsByExercise] = useState<Record<string, number>>({});
  const [results, setResults] = useState<GrammarAnswerResult[]>([]);

  const currentExercise = exercises[currentIndex];

  const learnedLookup = useMemo(() => (
    currentExercise ? buildLearnedWordLookup(currentExercise, learnedWords) : { byId: new Set<string>(), byText: new Set<string>() }
  ), [currentExercise, learnedWords]);

  const learnedTerms = useMemo(() => (
    currentExercise ? getLearnedWordTerms(currentExercise, learnedWords) : []
  ), [currentExercise, learnedWords]);

  if (!currentExercise) {
    return (
      <section className={`ui-panel ${className}`} data-testid="grammar-review-empty">
        <div className="text-xs font-bold text-slate-400">文法復習</div>
        <h2 className="mt-2 text-xl font-black text-slate-950">文法復習の問題がありません</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          登場済み単語と英文から問題を生成して、このコンポーネントに渡してください。
        </p>
      </section>
    );
  }

  const copy = EXERCISE_COPY[currentExercise.type];
  const answerTokens = selectedTokenIds
    .map((tokenId) => currentExercise.tokens.find((token) => token.id === tokenId))
    .filter((token): token is GrammarChipToken => Boolean(token));
  const selectedTokenIdSet = new Set(selectedTokenIds);
  const isCorrectAnswer = feedback === 'correct';
  const canAdvance = feedback !== 'idle';
  const isLastExercise = currentIndex === exercises.length - 1;
  const correctCount = results.filter((result) => result.correct).length + (feedback === 'correct' && !results.some((result) => result.exerciseId === currentExercise.id) ? 1 : 0);
  const progressPercent = Math.round(((currentIndex + 1) / exercises.length) * 100);

  const isLearnedToken = (token: GrammarChipToken) => (
    Boolean(token.learnedWordId && learnedLookup.byId.has(token.learnedWordId))
    || learnedLookup.byText.has(getTokenKey(token))
  );

  const resetInteraction = () => {
    setSelectedTokenIds([]);
    setFeedback('idle');
    setHintVisible(false);
  };

  const handleSelectToken = (token: GrammarChipToken) => {
    if (isCorrectAnswer || token.locked || selectedTokenIdSet.has(token.id)) {
      return;
    }

    setFeedback('idle');
    setSelectedTokenIds((current) => {
      if (currentExercise.type === 'grammar-cloze' && current.length >= currentExercise.answerTokenIds.length) {
        return [token.id];
      }
      return [...current, token.id];
    });
  };

  const handleRemoveToken = (index: number) => {
    if (isCorrectAnswer) {
      return;
    }
    setFeedback('idle');
    setSelectedTokenIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleMoveToken = (index: number, direction: -1 | 1) => {
    if (isCorrectAnswer) {
      return;
    }
    setFeedback('idle');
    setSelectedTokenIds((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const handleCheck = () => {
    const correct = isSameOrder(selectedTokenIds, currentExercise.answerTokenIds);
    const attemptCount = (attemptsByExercise[currentExercise.id] ?? 0) + 1;
    const result: GrammarAnswerResult = {
      exerciseId: currentExercise.id,
      type: currentExercise.type,
      selectedTokenIds,
      answerTokenIds: currentExercise.answerTokenIds,
      correct,
      attemptCount,
    };

    setAttemptsByExercise((current) => ({ ...current, [currentExercise.id]: attemptCount }));
    setFeedback(correct ? 'correct' : 'incorrect');
    setResults((current) => {
      const withoutCurrent = current.filter((item) => item.exerciseId !== currentExercise.id);
      return [...withoutCurrent, result];
    });
    onAnswer?.(result);
  };

  const handleNext = () => {
    if (isLastExercise) {
      const summaryResults = results.some((result) => result.exerciseId === currentExercise.id)
        ? results
        : [
          ...results,
          {
            exerciseId: currentExercise.id,
            type: currentExercise.type,
            selectedTokenIds,
            answerTokenIds: currentExercise.answerTokenIds,
            correct: feedback === 'correct',
            attemptCount: attemptsByExercise[currentExercise.id] ?? 0,
          },
        ];
      onComplete?.({
        total: exercises.length,
        correct: summaryResults.filter((result) => result.correct).length,
        results: summaryResults,
      });
      return;
    }

    setCurrentIndex((current) => current + 1);
    resetInteraction();
  };

  return (
    <div data-testid="grammar-review-session" className={`space-y-4 pb-24 sm:pb-0 ${className}`}>
      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-400">文法復習</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">登場した単語で文法を復習</h2>
          </div>
          <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
            {currentIndex + 1} / {exercises.length}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-500">
              <span>{copy.label}</span>
              <span className="text-medace-700">正解 {correctCount}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-medace-500 transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
            {copy.action}
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{copy.label}</span>
          {currentExercise.title && (
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500">
              {currentExercise.title}
            </span>
          )}
        </div>
        <h3 className="mt-4 text-2xl font-black leading-tight text-slate-950">
          <HighlightedText text={currentExercise.prompt} terms={learnedTerms} />
        </h3>
        {currentExercise.instruction && (
          <p className="mt-3 text-sm leading-relaxed text-slate-500">{currentExercise.instruction}</p>
        )}

        {(currentExercise.sourceSentence || currentExercise.targetTranslation) && (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {currentExercise.sourceSentence && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold text-slate-400">英文</div>
                <div className="mt-2 text-base font-bold leading-relaxed text-slate-800">
                  <HighlightedText text={currentExercise.sourceSentence} terms={learnedTerms} />
                </div>
              </div>
            )}
            {currentExercise.targetTranslation && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold text-slate-400">日本語</div>
                <div className="mt-2 text-base font-bold leading-relaxed text-slate-800">{currentExercise.targetTranslation}</div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="ui-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-400">解答</div>
            <h3 className="mt-1 text-lg font-black text-slate-950">解答欄</h3>
          </div>
          <button
            type="button"
            onClick={resetInteraction}
            disabled={selectedTokenIds.length === 0 || isCorrectAnswer}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            やり直す
          </button>
        </div>

        <div className={`mt-4 min-h-[92px] rounded-2xl border-2 border-dashed px-3 py-3 transition-colors ${
          feedback === 'correct'
            ? 'border-emerald-300 bg-emerald-50'
            : feedback === 'incorrect'
              ? 'border-red-300 bg-red-50'
              : 'border-slate-200 bg-slate-50'
        }`}>
          {answerTokens.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {answerTokens.map((token, index) => (
                <div
                  key={`${token.id}-${index}`}
                  className={`inline-flex min-h-11 items-center gap-1 rounded-2xl border bg-white px-3 py-2 text-sm font-black shadow-sm ${
                    isLearnedToken(token) ? 'border-medace-300 text-medace-800 ring-2 ring-medace-100' : 'border-slate-200 text-slate-800'
                  }`}
                >
                  <span>{token.text}</span>
                  {!isCorrectAnswer && currentExercise.type !== 'grammar-cloze' && (
                    <span className="ml-1 inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`${token.text}を左へ`}
                        onClick={() => handleMoveToken(index, -1)}
                        disabled={index === 0}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${token.text}を右へ`}
                        onClick={() => handleMoveToken(index, 1)}
                        disabled={index === answerTokens.length - 1}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                  {!isCorrectAnswer && (
                    <button
                      type="button"
                      aria-label={`${token.text}を外す`}
                      onClick={() => handleRemoveToken(index)}
                      className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[60px] items-center justify-center text-center text-sm font-bold text-slate-400">
              {copy.emptyAnswer}
            </div>
          )}
        </div>

        {feedback !== 'idle' && (
          <div className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm font-bold ${
            feedback === 'correct'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {feedback === 'correct' ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
            <div>
              <div>{feedback === 'correct' ? '正解です' : 'もう一度確認しましょう'}</div>
              {feedback === 'incorrect' && (
                <div className="mt-1 font-medium leading-relaxed">
                  語順と意味のつながりを見直してから、次の問題へ進めます。
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-400">語句チップ</div>
            <h3 className="mt-1 text-lg font-black text-slate-950">使う語句を選ぶ</h3>
          </div>
          {learnedTerms.length > 0 && (
            <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
              学習済み単語を強調
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {currentExercise.tokens.map((token) => {
            const isSelected = selectedTokenIdSet.has(token.id);
            const learned = isLearnedToken(token);
            return (
              <button
                key={token.id}
                type="button"
                onClick={() => handleSelectToken(token)}
                disabled={isCorrectAnswer || token.locked || isSelected}
                className={`min-h-11 rounded-2xl border px-4 py-2.5 text-sm font-black transition-all ${
                  isSelected
                    ? 'border-slate-200 bg-slate-100 text-slate-400'
                    : learned
                      ? 'border-medace-300 bg-medace-50 text-medace-800 shadow-sm hover:bg-medace-100'
                      : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-medace-200 hover:text-medace-700'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {token.text}
              </button>
            );
          })}
        </div>
      </section>

      <section className="ui-panel-subtle">
        <button
          type="button"
          onClick={() => setHintVisible((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="inline-flex items-center gap-2 text-sm font-black text-slate-800">
            <HelpCircle className="h-5 w-5 text-medace-600" />
            ヒント
          </span>
          <span className="text-xs font-bold text-medace-700">{hintVisible ? '閉じる' : '見る'}</span>
        </button>
        {hintVisible && (
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-900">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" />
            <div>{currentExercise.hint ?? '英文の主語、動詞、その後ろに続く説明の順番を確認しましょう。'}</div>
          </div>
        )}
      </section>

      <MobileStickyActionBar className="-mx-4 border-t border-slate-100 bg-white/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={handleCheck}
            disabled={selectedTokenIds.length === 0 || isCorrectAnswer}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <CheckCircle className="h-5 w-5" />
            判定する
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 transition-colors hover:border-medace-300 hover:text-medace-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[160px]"
          >
            {isLastExercise ? '完了' : '次へ'}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </MobileStickyActionBar>
    </div>
  );
};

export default GrammarReviewSession;
